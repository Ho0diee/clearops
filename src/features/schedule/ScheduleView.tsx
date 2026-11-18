import React, { useEffect, useState } from 'react';
import { CalendarGrid } from './CalendarGrid';
import { ScheduleChat } from './ScheduleChat';
import type { ParsedLiveInput } from '../../types/schema';

/**
 * Schedule = calendar + chat. Nothing else.
 * Week by default → tap a day to zoom in → "‹ Week" to zoom back out.
 * The chat log at the bottom adds events, fills focus slots, or sets reminders on the grid instantly.
 */
export const ScheduleView: React.FC = () => {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const handleAdded = (committed: ParsedLiveInput) => {
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
      <CalendarGrid highlightId={highlightId} />
      <ScheduleChat onAdded={handleAdded} />
    </div>
  );
};
