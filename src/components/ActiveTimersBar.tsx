import React, { useEffect, useState } from 'react';
import { Square, X } from 'lucide-react';
import { useOpsStore } from '../store/opsStore';

export function formatTimerClock(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ActiveTimersBar: React.FC = () => {
  const { state, actions } = useOpsStore();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const count = state.activeTimers.length;

  useEffect(() => {
    if (count === 0) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="ops-timers-bar" role="region" aria-label="Running task timers">
      <div className="ops-timers-scroll">
        {state.activeTimers.map((timer) => {
          const liveIdea = state.ideas.find((i) => i.id === timer.ideaId);
          const label = (liveIdea?.title || timer.title).trim() || 'Untitled Task';
          const clock = formatTimerClock(nowMs - timer.startedAtMs);
          return (
            <div key={timer.id} className="ops-timer-pill">
              <span className="ops-timer-pulse" aria-hidden="true" />
              <span className="ops-timer-title" title={label}>
                {label}
              </span>
              <span className="ops-timer-clock">{clock}</span>
              <button
                type="button"
                className="ops-timer-stop-btn"
                onClick={() => actions.stopTaskTimer(timer.ideaId)}
                aria-label={`Stop timer for ${label} and log to calendar`}
                title="Stop and add to calendar"
              >
                <Square size={9} fill="currentColor" />
                <span>Stop</span>
              </button>
              <button
                type="button"
                className="ops-timer-cancel-btn"
                onClick={() => actions.discardTaskTimer(timer.ideaId)}
                aria-label={`Cancel timer for ${label}`}
                title="Discard timer without logging"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
