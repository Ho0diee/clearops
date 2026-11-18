import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Mic, Sparkles, Square } from 'lucide-react';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import { formatFriendlyTime } from '../../store/scheduleAi';
import type { ParsedLiveInput } from '../../types/schema';

interface ChatMsg {
  id: string;
  role: 'user' | 'app';
  text: string;
}

const CHAT_KEY = 'clearops_schedule_chat_v1';

interface SpeechRecResultItem {
  0: { transcript: string };
  isFinal?: boolean;
}

interface SpeechRec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<SpeechRecResultItem> }) => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function modeBadgeLabel(mode: ParsedLiveInput['mode']): string {
  if (mode === 'fill-slot') return 'Focus Slot';
  if (mode === 'empty-zone') return 'Empty Zone';
  if (mode === 'reminder') return 'Reminder';
  return 'Event';
}

export const ScheduleChat: React.FC<{ onAdded: (parsed: ParsedLiveInput) => void }> = ({ onAdded }) => {
  const { actions } = useOpsStore();
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const raw = window.sessionStorage.getItem(CHAT_KEY);
      if (raw) {
        return (JSON.parse(raw) as ChatMsg[]).filter((m) => m.id !== 'welcome');
      }
    } catch {
      /* ignore */
    }
    return [];
  });
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);

  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const wantListeningRef = useRef(false);
  const prefixTextRef = useRef('');

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const preview = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    return actions.parseLiveCommand(trimmed);
  }, [text, actions]);

  const push = (role: ChatMsg['role'], msg: string) =>
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, text: msg },
    ]);

  const stopListening = (focusInput = false) => {
    wantListeningRef.current = false;
    setListening(false);
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    }
    if (focusInput) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const send = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    stopListening(false);
    push('user', clean);
    setText('');
    prefixTextRef.current = '';

    const committed = actions.submitLiveCommand(clean);
    if (!committed) {
      push(
        'app',
        'Try saying something like "add patio photos for the next focus slot", "I have work at 4:30-6 tomorrow", or "set a reminder for 3 about keys".'
      );
      return;
    }

    onAdded(committed);

    const when = `${formatShortDate(committed.date)}, ${formatFriendlyTime(committed.startTime)}${
      committed.endTime ? `–${formatFriendlyTime(committed.endTime)}` : ''
    }`;

    if (committed.mode === 'fill-slot') {
      push('app', `Placed "${committed.title}" into your open Focus Slot · ${when}.`);
    } else if (committed.mode === 'reminder') {
      push('app', `Reminder set: "${committed.title}" · ${when}.`);
    } else if (committed.mode === 'empty-zone') {
      const cleanZoneTitle = committed.title.replace(/^Empty Zone\s*[—-]\s*/i, '');
      push('app', `Scheduled Focus Slot "${cleanZoneTitle}" · ${when}.`);
    } else {
      push(
        'app',
        `Added "${committed.title}" · ${when}${
          committed.whyCategory ? ` · Why: ${committed.whyCategory}` : ''
        }.`
      );
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopListening(true);
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      push(
        'app',
        "Voice recognition isn't supported in this browser. On iPhone, tap the dictation mic on your keyboard and press Enter when done."
      );
      inputRef.current?.focus();
      return;
    }

    try {
      const rec = new Ctor();
      recRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      prefixTextRef.current = text.trim();
      wantListeningRef.current = true;

      rec.onresult = (e) => {
        const parts: string[] = [];
        for (let i = 0; i < e.results.length; i += 1) {
          const seg = (e.results[i]?.[0]?.transcript || '').trim();
          if (!seg) continue;
          const prev = parts[parts.length - 1];
          if (prev && seg.toLowerCase().startsWith(prev.toLowerCase())) {
            parts[parts.length - 1] = seg;
          } else if (!prev || prev.toLowerCase() !== seg.toLowerCase()) {
            parts.push(seg);
          }
        }
        const spoken = parts.join(' ').trim();
        const combined = [prefixTextRef.current, spoken].filter(Boolean).join(' ').trim();
        setText(combined);
      };

      rec.onerror = () => {
        wantListeningRef.current = false;
        setListening(false);
        recRef.current = null;
      };

      // Voice mode NEVER auto-sends on silence/end — wait for the user to press Enter!
      rec.onend = () => {
        wantListeningRef.current = false;
        setListening(false);
        recRef.current = null;
        window.requestAnimationFrame(() => inputRef.current?.focus());
      };

      setListening(true);
      rec.start();
      inputRef.current?.focus();
    } catch {
      wantListeningRef.current = false;
      setListening(false);
    }
  };

  return (
    <div className="sched-chat">
      {messages.length > 0 && (
        <div className="sched-chat-log" ref={logRef} aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg is-${m.role}`}>
              {m.text}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="sched-live-preview" aria-live="polite">
          <span className={`sched-preview-tag is-${preview.mode}`}>
            <Sparkles size={11} />
            {modeBadgeLabel(preview.mode)}
          </span>
          <span className="sched-preview-body">
            <strong>{preview.title.replace(/^Empty Zone\s*[—-]\s*/i, '')}</strong>
            {' · '}
            {formatShortDate(preview.date)}, {formatFriendlyTime(preview.startTime)}
            {preview.endTime ? `–${formatFriendlyTime(preview.endTime)}` : ''}
          </span>
          <span className="sched-preview-hint">Enter ↵</span>
        </div>
      )}

      <form
        className={`sched-chat-composer ${listening ? 'is-listening' : ''}`.trim()}
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          ref={inputRef}
          className="sched-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder={
            listening
              ? 'Listening… press Enter when done'
              : 'Add event, focus slot, or reminder…'
          }
          aria-label="Add an event, focus slot, or reminder"
          enterKeyHint="send"
        />
        <button
          type="button"
          className={`${
            text.trim() && !listening ? 'ui-command-mic' : 'ui-command-mic-filled'
          } ${listening ? 'is-listening' : ''}`.trim()}
          aria-label={listening ? 'Done speaking (pause mic)' : 'Speak an event'}
          title={listening ? 'Stop mic (press Enter to send)' : 'Voice input'}
          onClick={toggleMic}
        >
          {listening ? <Square size={13} fill="currentColor" /> : <Mic size={16} />}
        </button>
        {text.trim().length > 0 && (
          <button
            type="submit"
            className="ui-command-mic-filled"
            aria-label="Send to schedule"
            title="Press Enter to add"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </form>
    </div>
  );
};
