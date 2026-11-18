import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Mic, Sparkles, X } from 'lucide-react';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import { formatFriendlyTime } from '../../store/scheduleAi';
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

interface SlotPillProps {
  label: string;
  value?: string;
  emphasizedMissing?: boolean;
}

const SlotPill: React.FC<SlotPillProps> = ({ label, value, emphasizedMissing }) => {
  const filled = Boolean(value);
  return (
    <div
      className={`voice-slot ${filled ? 'is-filled' : 'is-missing'} ${
        !filled && emphasizedMissing ? 'is-next-needed' : ''
      }`.trim()}
    >
      <span className="voice-slot-label">
        {filled ? <Check size={10} strokeWidth={3} /> : <span className="voice-slot-q">?</span>}
        {label}
      </span>
      <span className="voice-slot-value">{value || 'Needed'}</span>
    </div>
  );
};

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
  const [voiceError, setVoiceError] = useState<string | null>(null);

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
    setVoiceError(null);
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
    setVoiceError(null);
    if (window.location.search.includes('voiceDraft=')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    if (committed) {
      onAdded(committed);
    }
  }, [actions, onAdded, stopMicSession]);

  // Allow pressing Enter to finish & commit once all required slots are spoken
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
      setVoiceError('Speech recognition is not supported in this browser.');
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
        if (
          errCode === 'not-allowed' ||
          errCode === 'service-not-allowed' ||
          errCode === 'audio-capture'
        ) {
          wantListeningRef.current = false;
          setListening(false);
          recRef.current = null;
          setVoiceError('Microphone access is needed to speak events.');
          return;
        }
        if (errCode !== 'no-speech' && errCode !== 'aborted') {
          wantListeningRef.current = false;
          setListening(false);
          recRef.current = null;
          if (errCode === 'network') {
            setVoiceError('Speech service unavailable in this window — use Chrome or iPhone Safari.');
          }
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

        // Keep mic open across natural thinking pauses while user reads what's missing,
        // unless recognition exited immediately without audio (e.g. headless browser).
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
    setVoiceError(null);
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

  const showCard = listening || Boolean(draft) || Boolean(voiceError);
  const firstMissing = draft?.missingFields[0];

  return (
    <div className={`voice-dock ${showCard ? 'is-expanded' : ''}`.trim()}>
      {showCard && (
        <div className="voice-builder-card" aria-live="polite">
          <div className="voice-transcript-row">
            <span className={`voice-live-dot ${listening ? 'is-active' : ''}`.trim()} />
            <span className="voice-transcript-text">
              {transcript.trim()
                ? `“${transcript.trim()}”`
                : voiceError || 'Listening… say what you want to schedule'}
            </span>
          </div>

          {draft && (
            <>
              {draft.mode === 'fill-slot' ? (
                <div className="voice-slots-grid is-two">
                  <SlotPill
                    label="Focus Task"
                    value={draft.title}
                    emphasizedMissing={firstMissing === 'title'}
                  />
                  <SlotPill
                    label="Open Slot"
                    value={
                      draft.date && draft.startTime
                        ? `${formatShortDate(draft.date)} · ${formatFriendlyTime(draft.startTime)}${
                            draft.endTime ? `–${formatFriendlyTime(draft.endTime)}` : ''
                          }`
                        : undefined
                    }
                  />
                </div>
              ) : draft.mode === 'reminder' ? (
                <div className="voice-slots-grid is-three">
                  <SlotPill
                    label="Reminder"
                    value={draft.title}
                    emphasizedMissing={firstMissing === 'title'}
                  />
                  <SlotPill
                    label="Day"
                    value={draft.date ? formatShortDate(draft.date) : undefined}
                    emphasizedMissing={firstMissing === 'date'}
                  />
                  <SlotPill
                    label="Time"
                    value={draft.startTime ? formatFriendlyTime(draft.startTime) : undefined}
                    emphasizedMissing={firstMissing === 'startTime'}
                  />
                </div>
              ) : (
                <div className="voice-slots-grid is-four">
                  <SlotPill
                    label="Event"
                    value={draft.title?.replace(/^Empty Zone\s*[—-]\s*/i, '')}
                    emphasizedMissing={firstMissing === 'title'}
                  />
                  <SlotPill
                    label="Day"
                    value={draft.date ? formatShortDate(draft.date) : undefined}
                    emphasizedMissing={firstMissing === 'date'}
                  />
                  <SlotPill
                    label="Start"
                    value={draft.startTime ? formatFriendlyTime(draft.startTime) : undefined}
                    emphasizedMissing={firstMissing === 'startTime'}
                  />
                  <SlotPill
                    label="End"
                    value={draft.endTime ? formatFriendlyTime(draft.endTime) : undefined}
                    emphasizedMissing={firstMissing === 'endTime'}
                  />
                </div>
              )}

              <div
                className={`voice-prompt-bar ${
                  draft.isComplete ? 'is-complete' : 'is-incomplete'
                }`.trim()}
              >
                {draft.isComplete ? <Check size={13} strokeWidth={2.6} /> : <Sparkles size={13} />}
                <span>{draft.nextPrompt}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="voice-controls-row">
        {showCard && (
          <button
            type="button"
            className="voice-side-btn is-cancel"
            aria-label="Cancel voice input"
            title="Clear"
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
          title={listening ? 'Pause microphone' : 'Speak to schedule'}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMic}
        >
          <Mic size={22} />
        </button>

        {showCard && (
          <button
            type="button"
            className={`voice-side-btn is-confirm ${draft?.isComplete ? 'is-ready' : ''}`.trim()}
            aria-label={draft?.isComplete ? 'Confirm and add to schedule' : 'Speak remaining details to finish'}
            title={draft?.isComplete ? 'Add to schedule (Enter)' : draft?.nextPrompt || 'Keep speaking to finish'}
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
