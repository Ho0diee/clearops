import React, { useEffect, useState } from 'react';
import { CalendarGrid } from './CalendarGrid';
import { ScheduleChat } from './ScheduleChat';
import { useOpsStore } from '../../store/opsStore';
import type { ParsedLiveInput } from '../../types/schema';

/**
 * Schedule = calendar + chat. Nothing else.
 * Week by default → tap a day to zoom in → "‹ Week" to zoom back out.
 * The chat log at the bottom adds events/reminders that appear on the grid instantly.
 */
export const ScheduleView: React.FC = () => {
  const { state } = useOpsStore();
  const [pending, setPending] = useState<ParsedLiveInput | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Find the block the chat just created so the grid can flash it
  useEffect(() => {
    if (!pending || pending.mode === 'reminder') return;
    const match = state.blocks.find(
      (b) => b.date === pending.date && b.startTime === pending.startTime && b.title === pending.title
    );
    if (match) {
      setHighlightId(match.id);
      setPending(null);
    }
  }, [state.blocks, pending]);

  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(null), 2800);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  return (
    <div className="sched-page">
      <CalendarGrid highlightId={highlightId} />
      <ScheduleChat onAdded={setPending} />
    </div>
  );
};
