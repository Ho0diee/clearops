import React, { useEffect, useState } from 'react';
import { CalendarGrid } from './CalendarGrid';
import { ScheduleChat } from './ScheduleChat';
import { useOpsStore } from '../../store/opsStore';
import type { ParsedLiveInput, VoiceScheduleDraft } from '../../types/schema';

/**
 * Schedule = calendar + voice-only progressive dock.
 * No chat log, no typing input: tap the microphone and speak — the calendar
 * pops to the target day & time in real time and shows filled vs missing slots.
 */
export const ScheduleView: React.FC = () => {
  const { state } = useOpsStore();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<VoiceScheduleDraft | null>(null);

  const handleAdded = (committed: ParsedLiveInput) => {
    setLiveDraft(null);
    if (committed.targetBlockId) {
      setHighlightId(committed.targetBlockId);
    }
  };

  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(null), 3000);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  return (
    <div className="sched-page">
      <CalendarGrid highlightId={highlightId} liveDraft={liveDraft} />
      {!state.pendingPlacement && (
        <ScheduleChat onDraftChange={setLiveDraft} onAdded={handleAdded} />
      )}
    </div>
  );
};
