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

const BACKOFF_DELAYS_MS = [110, 220, 380, 600, 900];

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
  // Tracks a SpeechRecognition instance that is still tearing down in the browser so we never
  // collide with the browser's global singleton SpeechRecognition lock on rapid Cancel -> Mic!
  const closingRecRef = useRef<SpeechRec | null>(null);
  const startQueuedAfterCloseRef = useRef(false);
  const closeFallbackTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  const sessionEpochRef = useRef(0);
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

  const clearTimers = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (closeFallbackTimerRef.current !== null) {
      window.clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = null;
    }
  }, []);

  const startRecognitionPassRef = useRef<() => void>(() => {});

  /**
   * Stops or aborts the current browser SpeechRecognition instance while keeping an `onend`
   * hook attached to `closingRecRef` so we know the exact moment the browser unlocks the mic.
   */
  const teardownActiveRecognizer = useCallback(
    (immediateAbort: boolean) => {
      sessionEpochRef.current += 1;
      wantListeningRef.current = false;
      startQueuedAfterCloseRef.current = false;
      clearTimers();
      setListening(false);

      if (!immediateAbort && sessionTextRef.current.trim()) {
        baseTextRef.current = [baseTextRef.current, sessionTextRef.current]
          .filter(Boolean)
          .join(' ')
          .trim();
      }
      sessionTextRef.current = '';

      if (recRef.current) {
        const retiring = recRef.current;
        recRef.current = null;
        closingRecRef.current = retiring;
        retiring.onresult = null;
        retiring.onerror = null;
        retiring.onend = () => {
          if (closingRecRef.current === retiring) {
            closingRecRef.current = null;
          }
          if (closeFallbackTimerRef.current !== null) {
            window.clearTimeout(closeFallbackTimerRef.current);
            closeFallbackTimerRef.current = null;
          }
          if (startQueuedAfterCloseRef.current && wantListeningRef.current) {
            startQueuedAfterCloseRef.current = false;
            startRecognitionPassRef.current();
          }
        };

        try {
          if (immediateAbort && typeof retiring.abort === 'function') {
            retiring.abort();
          } else {
            retiring.stop();
          }
        } catch {
          closingRecRef.current = null;
        }
      }
    },
    [clearTimers]
  );

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      startQueuedAfterCloseRef.current = false;
      clearTimers();
      try {
        if (recRef.current?.abort) recRef.current.abort();
        else recRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [clearTimers]);

  const clearDraft = useCallback(() => {
    // Use immediate `abort()` on Cancel so the browser releases the microphone lock right away!
    teardownActiveRecognizer(true);
    baseTextRef.current = '';
    sessionTextRef.current = '';
    setTranscript('');
    onDraftChange(null);
    if (window.location.search.includes('voiceDraft=')) {
      const params = new URLSearchParams(window.location.search);
      params.delete('voiceDraft');
      const nextSearch = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (nextSearch ? `?${nextSearch}` : '') + window.location.hash
      );
    }
  }, [onDraftChange, teardownActiveRecognizer]);

  const confirmDraft = useCallback(() => {
    const current = latestDraftRef.current;
    if (!current || !current.isComplete) return;
    teardownActiveRecognizer(true);
    const committed = actions.commitVoiceDraft(current);
    baseTextRef.current = '';
    sessionTextRef.current = '';
    setTranscript('');
    if (window.location.search.includes('voiceDraft=')) {
      const params = new URLSearchParams(window.location.search);
      params.delete('voiceDraft');
      const nextSearch = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (nextSearch ? `?${nextSearch}` : '') + window.location.hash
      );
    }
    if (committed) {
      onAdded(committed);
    }
  }, [actions, onAdded, teardownActiveRecognizer]);

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
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (!wantListeningRef.current) return;

    // If a canceled recognizer is still finishing its browser-level teardown, wait for its `onend`
    // (with a 180ms safety fallback) instead of colliding with the global SpeechRecognition lock!
    if (closingRecRef.current) {
      setListening(true);
      startQueuedAfterCloseRef.current = true;
      try {
        closingRecRef.current.abort?.();
      } catch {
        /* ignore */
      }
      if (closeFallbackTimerRef.current !== null) {
        window.clearTimeout(closeFallbackTimerRef.current);
      }
      closeFallbackTimerRef.current = window.setTimeout(() => {
        closeFallbackTimerRef.current = null;
        closingRecRef.current = null;
        if (startQueuedAfterCloseRef.current && wantListeningRef.current) {
          startQueuedAfterCloseRef.current = false;
          startRecognitionPassRef.current();
        }
      }, 450);
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      wantListeningRef.current = false;
      setListening(false);
      actions.showToast('Voice recognition is not supported in this browser');
      return;
    }

    const myEpoch = sessionEpochRef.current;

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
        if (sessionEpochRef.current !== myEpoch || !wantListeningRef.current) return;
        heardAnything = true;
        rapidEmptyEndsRef.current = 0;

        const segments: string[] = [];
        for (let i = 0; i < e.results.length; i += 1) {
          const item = e.results[i];
          if (!item) continue;
          const seg = pickBestAlternative(item);
          if (!seg) continue;

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
        if (sessionEpochRef.current !== myEpoch) return;
        const errCode = ev?.error || '';
        if (
          errCode === 'not-allowed' ||
          errCode === 'service-not-allowed' ||
          errCode === 'audio-capture'
        ) {
          fatalErrorRef.current = true;
          wantListeningRef.current = false;
          setListening(false);
          recRef.current = null;
          actions.showToast('Microphone access blocked — check browser mic permissions');
        }
      };

      rec.onend = () => {
        if (recRef.current === rec) {
          recRef.current = null;
        }
        if (sessionEpochRef.current !== myEpoch) return;

        if (sessionTextRef.current.trim()) {
          baseTextRef.current = [baseTextRef.current, sessionTextRef.current]
            .filter(Boolean)
            .join(' ')
            .trim();
          sessionTextRef.current = '';
        }

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

        if (rapidEmptyEndsRef.current > BACKOFF_DELAYS_MS.length) {
          wantListeningRef.current = false;
          setListening(false);
          return;
        }

        const delay =
          BACKOFF_DELAYS_MS[Math.max(0, rapidEmptyEndsRef.current - 1)] ?? 200;
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (wantListeningRef.current && sessionEpochRef.current === myEpoch) {
            startRecognitionPassRef.current();
          }
        }, delay);
      };

      setListening(true);
      rec.start();
    } catch {
      rapidEmptyEndsRef.current += 1;
      if (wantListeningRef.current && rapidEmptyEndsRef.current <= BACKOFF_DELAYS_MS.length) {
        const delay =
          BACKOFF_DELAYS_MS[Math.max(0, rapidEmptyEndsRef.current - 1)] ?? 220;
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (wantListeningRef.current && sessionEpochRef.current === myEpoch) {
            startRecognitionPassRef.current();
          }
        }, delay);
      } else {
        wantListeningRef.current = false;
        setListening(false);
      }
    }
  }, [actions]);

  startRecognitionPassRef.current = startRecognitionPass;

  const toggleMic = () => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

    if (listening) {
      teardownActiveRecognizer(false);
      return;
    }

    sessionEpochRef.current += 1;
    baseTextRef.current = transcript.trim();
    sessionTextRef.current = '';
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
            onClick={clearDraft}
          >
            <X size={18} />
          </button>
        )}

        <button
          type="button"
          className={`voice-orb-btn ${listening ? 'is-listening' : ''}`.trim()}
          aria-label={listening ? 'Pause microphone' : 'Tap to speak to schedule'}
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
            onClick={confirmDraft}
          >
            <Check size={18} strokeWidth={2.6} />
          </button>
        )}
      </div>
    </div>
  );
};
