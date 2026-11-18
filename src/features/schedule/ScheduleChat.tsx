import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Mic, X } from 'lucide-react';
import { useOpsStore } from '../../store/opsStore';
import type { ParsedLiveInput, VoiceScheduleDraft } from '../../types/schema';

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

export const ScheduleChat: React.FC<{
  onDraftChange: (draft: VoiceScheduleDraft | null) => void;
  onAdded: (parsed: ParsedLiveInput) => void;
}> = ({ onDraftChange, onAdded }) => {
  const { actions } = useOpsStore();

  const [transcript, setTranscript] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const seeded = params.get('voiceDraft');
      if (seeded) {
        return seeded.trim();
      }
    } catch {
      /* ignore */
    }
    return '';
  });

  const [listening, setListening] = useState(false);

  const recRef = useRef<SpeechRec | null>(null);
  const wantListeningRef = useRef(false);
  const baseTextRef = useRef(transcript);
  const sessionTextRef = useRef('');
  const latestDraftRef = useRef<VoiceScheduleDraft | null>(null);

  const draft = useMemo(() => {
    const clean = transcript.trim();
    if (!clean) return null;
    return actions.parseVoiceDraft(clean);
  }, [transcript, actions]);

  latestDraftRef.current = draft;

  useEffect(() => {
    onDraftChange(draft);
  }, [draft, onDraftChange]);

  const stopMicSession = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    if (sessionTextRef.current.trim()) {
      baseTextRef.current = [baseTextRef.current, sessionTextRef.current]
        .filter(Boolean)
        .join(' ')
        .trim();
      sessionTextRef.current = '';
    }
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    }
  }, []);

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

  const clearDraft = useCallback(() => {
    stopMicSession();
    baseTextRef.current = '';
    sessionTextRef.current = '';
    setTranscript('');
    onDraftChange(null);
    if (window.location.search.includes('voiceDraft=')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, [onDraftChange, stopMicSession]);

  const confirmDraft = useCallback(() => {
    const current = latestDraftRef.current;
    if (!current || !current.isComplete) return;
    stopMicSession();
    const committed = actions.commitVoiceDraft(current);
    baseTextRef.current = '';
    sessionTextRef.current = '';
    setTranscript('');
    if (window.location.search.includes('voiceDraft=')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    if (committed) {
      onAdded(committed);
    }
  }, [actions, onAdded, stopMicSession]);

  useEffect(() => {
    if (!draft && !listening) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.isComposing) {
        if (latestDraftRef.current?.isComplete) {
          e.preventDefault();
          confirmDraft();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft, listening, confirmDraft, clearDraft]);

  const startRecognitionPass = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      wantListeningRef.current = false;
      setListening(false);
      return;
    }

    try {
      const rec = new Ctor();
      recRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      sessionTextRef.current = '';
      const startedAt = Date.now();
      let heardAnything = false;

      rec.onresult = (e) => {
        heardAnything = true;
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
        sessionTextRef.current = spoken;
        const combined = [baseTextRef.current, spoken].filter(Boolean).join(' ').trim();
        setTranscript(combined);
      };

      rec.onerror = (ev) => {
        const errCode = ev?.error || '';
        if (errCode !== 'no-speech' && errCode !== 'aborted') {
          wantListeningRef.current = false;
          setListening(false);
          recRef.current = null;
        }
      };

      rec.onend = () => {
        if (sessionTextRef.current.trim()) {
          baseTextRef.current = [baseTextRef.current, sessionTextRef.current]
            .filter(Boolean)
            .join(' ')
            .trim();
          sessionTextRef.current = '';
        }
        recRef.current = null;

        const elapsed = Date.now() - startedAt;
        if (wantListeningRef.current && (heardAnything || elapsed > 650)) {
          try {
            startRecognitionPass();
            return;
          } catch {
            /* fall through */
          }
        }
        wantListeningRef.current = false;
        setListening(false);
      };

      setListening(true);
      rec.start();
    } catch {
      wantListeningRef.current = false;
      setListening(false);
    }
  }, []);

  const toggleMic = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (listening) {
      stopMicSession();
      return;
    }

    baseTextRef.current = transcript.trim();
    wantListeningRef.current = true;
    startRecognitionPass();
  };

  const hasActiveSession = listening || Boolean(draft);

  return (
    <div className="voice-dock">
      <div className="voice-controls-row">
        {hasActiveSession && (
          <button
            type="button"
            className="voice-side-btn is-cancel"
            aria-label="Cancel voice input"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearDraft}
          >
            <X size={18} />
          </button>
        )}

        <button
          type="button"
          className={`voice-orb-btn ${listening ? 'is-listening' : ''}`.trim()}
          aria-label={listening ? 'Pause microphone' : 'Tap to speak to schedule'}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMic}
        >
          <Mic size={22} />
        </button>

        {hasActiveSession && (
          <button
            type="button"
            className={`voice-side-btn is-confirm ${draft?.isComplete ? 'is-ready' : ''}`.trim()}
            aria-label={draft?.isComplete ? 'Confirm and add to schedule' : 'Incomplete schedule item'}
            disabled={!draft?.isComplete}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={confirmDraft}
          >
            <Check size={18} strokeWidth={2.6} />
          </button>
        )}
      </div>
    </div>
  );
};
