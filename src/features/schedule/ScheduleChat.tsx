import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic } from 'lucide-react';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import type { ParsedLiveInput } from '../../types/schema';

interface ChatMsg {
  id: string;
  role: 'user' | 'app';
  text: string;
}

const CHAT_KEY = 'clearops_schedule_chat_v1';

function fmt(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const s = h % 12 === 0 ? 12 : h % 12;
  return `${s}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

interface SpeechRec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
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
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  const push = (role: ChatMsg['role'], msg: string) =>
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, text: msg }]);

  const send = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    push('user', clean);
    setText('');

    const parsed = actions.parseLiveCommand(clean);
    if (!parsed) {
      push('app', 'I couldn\'t pick a time out of that. Try something like "Lab sync tomorrow 2–3pm".');
      return;
    }
    actions.submitLiveCommand(clean);
    onAdded(parsed);

    const when = `${formatShortDate(parsed.date)}, ${fmt(parsed.startTime)}${parsed.endTime ? `–${fmt(parsed.endTime)}` : ''}`;
    if (parsed.mode === 'reminder') {
      push('app', `Reminder set: "${parsed.title}" · ${when}. It's on your Today page.`);
    } else if (parsed.mode === 'empty-zone') {
      push('app', `Opened an Empty Zone · ${when}. Tap it on the calendar to pull in an idea.`);
    } else {
      push('app', `Added "${parsed.title}" · ${when}${parsed.whyCategory ? ` · Why: ${parsed.whyCategory}` : ''}.`);
    }
  };

  const toggleMic = () => {
    if (listening && recRef.current) {
      recRef.current.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      push('app', 'Voice isn\'t available in this browser. On iPhone, tap the mic on your keyboard to dictate instead.');
      return;
    }
    try {
      const rec = new Ctor();
      recRef.current = rec;
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';
      let finalText = '';
      rec.onresult = (e) => {
        finalText = Array.from(e.results).map((r) => r[0]?.transcript || '').join(' ').trim();
        setText(finalText);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => {
        setListening(false);
        if (finalText) send(finalText);
      };
      setListening(true);
      rec.start();
    } catch {
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

      <form
        className="sched-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          className="sched-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? 'Listening…' : 'Add an event or reminder…'}
          aria-label="Add an event or reminder"
          enterKeyHint="send"
        />
        {text.trim() ? (
          <button type="submit" className="ui-command-mic-filled" aria-label="Send">
            <ArrowUp size={16} />
          </button>
        ) : (
          <button
            type="button"
            className={`ui-command-mic-filled ${listening ? 'is-listening' : ''}`.trim()}
            aria-label={listening ? 'Stop listening' : 'Speak an event'}
            onClick={toggleMic}
          >
            <Mic size={16} />
          </button>
        )}
      </form>
    </div>
  );
};
