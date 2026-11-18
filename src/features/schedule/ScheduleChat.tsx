import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Mic, X } from 'lucide-react';
import { useOpsStore } from '../../store/opsStore';
import type { ParsedLiveInput, VoiceScheduleDraft } from '../../types/schema';

interface SpeechAlternative {
  transcript: string;
  confidence?: number;
}

interface SpeechRecResultItem {
  0: SpeechAlternative;
  length?: number;
  isFinal?: boolean;
  [index: number]: SpeechAlternative;
}

interface SpeechRec {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  lang: string;
  onresult: ((e: { results: ArrayLike<SpeechRecResultItem> }) => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

/**
 * Inspects SpeechRecognition N-best alternatives (`maxAlternatives = 3`):
 * When rank-0 mishears "4 to 5" as "4:50" / "45" while rank-1/2 contains "4 to 5",
 * automatically picks the clearer range alternative.
 */
function pickBestAlternative(resultItem: SpeechRecResultItem): string {
  const primary = (resultItem[0]?.transcript || '').trim();
  if (!primary) return '';

  const looksLikeMisheardFiftyOrFused =
    /\b([1-9])(?::50|\s+50)\b(?!\s*(?:to|until|-))/i.test(primary) ||
    /\b(23|34|45|56|67|78|89)\b/i.test(primary);

  const count = typeof resultItem.length === 'number' ? resultItem.length : 1;
  if (looksLikeMisheardFiftyOrFused && count > 1) {
    for (let k = 1; k < count; k += 1) {
      const alt = (resultItem[k]?.transcript || '').trim();
      if (alt && /\b\d{1,2}\s*(?:to|until|til|-)\s*\d{1,2}\b/i.test(alt)) {
        return alt;
      }
    }
  }
  return primary;
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
  const restartTimerRef = useRef<number | null>(null);
  const wantListeningRef = useRef(false);
  const fatalErrorRef = useRef(false);
  const rapidEmptyEndsRef = useRef(0);
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

  const cancelPendingRestart = () => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopMicSession = useCallback(() => {
    wantListeningRef.current = false;
    cancelPendingRestart();
    setListening(false);
    if (sessionTextRef.current.trim()) {
      baseTextRef.current = [baseTextRef.current, sessionTextRef.current]
        .filter(Boolean)
        .join(' ')
        .trim();
      sessionTextRef.current = '';
    }
    if (recRef.current) {
      const active = recRef.current;
      recRef.current = null;
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      try {
        active.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      cancelPendingRestart();
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
    cancelPendingRestart();
    if (!wantListeningRef.current) return;

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
      rec.maxAlternatives = 3;
      rec.lang = 'en-US';
      sessionTextRef.current = '';
      fatalErrorRef.current = false;
      const startedAt = Date.now();
      let heardAnything = false;

      rec.onresult = (e) => {
        heardAnything = true;
        rapidEmptyEndsRef.current = 0;

        const segments: string[] = [];
        for (let i = 0; i < e.results.length; i += 1) {
          const item = e.results[i];
          if (!item) continue;
          const seg = pickBestAlternative(item);
          if (!seg) continue;

          // Handle mobile WebKit/Android cumulative segments without swallowing distinct phrases
          const prev = segments[segments.length - 1];
          if (
            prev &&
            seg.length > prev.length &&
            seg.toLowerCase().startsWith(prev.toLowerCase() + ' ')
          ) {
            segments[segments.length - 1] = seg;
          } else {
            segments.push(seg);
          }
        }

        const spoken = segments.join(' ').replace(/\s{2,}/g, ' ').trim();
        sessionTextRef.current = spoken;
        const combined = [baseTextRef.current, spoken].filter(Boolean).join(' ').trim();
        setTranscript(combined);
      };

      rec.onerror = (ev) => {
        const errCode = ev?.error || '';
        // Only stop permanently if microphone permission/hardware is explicitly blocked
        if (
          errCode === 'not-allowed' ||
          errCode === 'service-not-allowed' ||
          errCode === 'audio-capture'
        ) {
          fatalErrorRef.current = true;
          wantListeningRef.current = false;
          setListening(false);
          recRef.current = null;
        }
        // For transient 'no-speech', 'aborted', or brief 'network' blips, let `onend` seamlessly recover
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

        if (!wantListeningRef.current || fatalErrorRef.current) {
          wantListeningRef.current = false;
          setListening(false);
          return;
        }

        const elapsed = Date.now() - startedAt;
        if (!heardAnything && elapsed < 350) {
          rapidEmptyEndsRef.current += 1;
        } else {
          rapidEmptyEndsRef.current = 0;
        }

        // Stop retrying only if the environment fails instantaneously 3x in a row (e.g. headless browser)
        if (rapidEmptyEndsRef.current >= 3) {
          wantListeningRef.current = false;
          setListening(false);
          return;
        }

        // Schedule restart asynchronously (90ms) so WebKit/Blink cleanly releases the prior audio stream
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (wantListeningRef.current) {
            startRecognitionPass();
          }
        }, 90);
      };

      setListening(true);
      rec.start();
    } catch {
      // If synchronous start threw InvalidStateError during handoff, retry once after 140ms
      rapidEmptyEndsRef.current += 1;
      if (wantListeningRef.current && rapidEmptyEndsRef.current < 3) {
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (wantListeningRef.current) {
            startRecognitionPass();
          }
        }, 140);
      } else {
        wantListeningRef.current = false;
        setListening(false);
      }
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
    rapidEmptyEndsRef.current = 0;
    fatalErrorRef.current = false;
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
            aria-label={
              draft?.isComplete ? 'Confirm and add to schedule' : 'Incomplete schedule item'
            }
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
