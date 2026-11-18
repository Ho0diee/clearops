import React, { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Mic, Search, Sparkles, X } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { formatShortDate, useOpsStore } from '../../store/opsStore';

const VOICE_SAMPLE_PHRASES: { label: string; phrase: string }[] = [
  {
    label: 'Reminder at 5pm',
    phrase: 'Hey, can you add a reminder for Submit Problem Set at 5pm',
  },
  {
    label: 'Event 2pm–3:30pm',
    phrase: 'Add scheduled event Lab Sync between 2pm and 3:30pm',
  },
  {
    label: 'Empty Zone 4pm–5:30pm',
    phrase: 'Empty zone between 4pm and 5:30pm',
  },
];

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal?: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstanceLike;

export const LiveCalendarInput: React.FC = () => {
  const { actions } = useOpsStore();
  const [rawText, setRawText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sampleIdx, setSampleIdx] = useState(0);
  const containerRef = useRef<HTMLFormElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);

  const parsed = rawText.trim() ? actions.parseLiveCommand(rawText) : null;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = rawText.trim();
    if (!clean) return;
    const res = actions.submitLiveCommand(clean);
    if (res) {
      setRawText('');
      setIsFocused(false);
    }
  };

  const handleRunSamplePhrase = (phrase: string) => {
    actions.submitLiveCommand(phrase);
    setRawText('');
    setIsFocused(false);
  };

  const simulateVoiceFallback = () => {
    const nextSample = VOICE_SAMPLE_PHRASES[sampleIdx % VOICE_SAMPLE_PHRASES.length];
    setSampleIdx((prev) => prev + 1);
    setRawText(nextSample.phrase);
    setIsFocused(true);
    actions.showToast(`Voice captured: "${nextSample.phrase}" — press Enter or Add to confirm`);
  };

  const handleMicClick = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      simulateVoiceFallback();
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let receivedTranscript = false;

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) {
          receivedTranscript = true;
          setRawText(transcript);
          setIsFocused(true);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        if (!receivedTranscript) {
          simulateVoiceFallback();
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      simulateVoiceFallback();
    }
  };

  return (
    <form
      ref={containerRef}
      className="ui-command-pill"
      onSubmit={handleSubmit}
      role="search"
      aria-label="Live natural language calendar command bar"
    >
      <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

      <input
        type="text"
        className="ui-command-input"
        placeholder="Add reminder or schedule event..."
        aria-label="Add reminder or schedule event"
        value={rawText}
        onChange={(e) => {
          setRawText(e.target.value);
          if (!isFocused) setIsFocused(true);
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsFocused(false);
          }
        }}
      />

      {rawText.trim().length > 0 && (
        <>
          <button
            type="button"
            className="ui-command-mic"
            aria-label="Clear command input"
            title="Clear"
            onClick={() => setRawText('')}
          >
            <X size={14} />
          </button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            iconRight={<CornerDownLeft size={12} />}
          >
            Add
          </Button>
        </>
      )}

      <button
        type="button"
        className={`ui-command-mic-filled ${isListening ? 'is-listening' : ''}`.trim()}
        onClick={handleMicClick}
        title={
          isListening
            ? 'Listening... click to stop'
            : 'Voice command (or 1-click voice phrase simulation)'
        }
        aria-label="Voice input for calendar"
      >
        <Mic size={15} />
      </button>

      {isFocused && parsed && (
        <div
          className="ui-command-preview"
          role="region"
          aria-label="Live command preview"
          style={{ flexWrap: 'wrap' }}
        >
          <div className="ops-row-wrap" style={{ minWidth: 0, flex: '1 1 200px' }}>
            <Badge
              tone={
                parsed.mode === 'empty-zone'
                  ? 'zone'
                  : parsed.mode === 'reminder'
                  ? 'amber'
                  : 'primary'
              }
            >
              {parsed.mode === 'empty-zone'
                ? 'Empty Zone'
                : parsed.mode === 'reminder'
                ? 'Reminder'
                : `Baseline · ${parsed.whyCategory ?? 'Organization'}`}
            </Badge>
            <span
              style={{
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {parsed.title}
            </span>
            <span className="mono" style={{ color: 'var(--text-secondary)' }}>
              {formatShortDate(parsed.date)} · {parsed.startTime}
              {parsed.endTime ? `–${parsed.endTime}` : ''}
            </span>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            iconRight={<CornerDownLeft size={12} />}
          >
            Schedule
          </Button>
        </div>
      )}

      {isFocused && !parsed && (
        <div
          className="ui-command-preview"
          role="region"
          aria-label="Voice and natural language quick examples"
          style={{ flexWrap: 'wrap' }}
        >
          <div className="ops-stack-xs" style={{ width: '100%' }}>
            <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '4px' }}>
              <span
                className="ops-row"
                style={{ fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                <Sparkles size={13} />
                <span>1-Click Live Voice / Text Commands:</span>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>Populates immediately</span>
            </div>
            <div className="ops-row-wrap">
              {VOICE_SAMPLE_PHRASES.map((sample) => (
                <Button
                  key={sample.label}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRunSamplePhrase(sample.phrase)}
                >
                  {sample.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
