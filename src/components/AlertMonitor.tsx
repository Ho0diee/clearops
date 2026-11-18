import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, Clock, X } from 'lucide-react';
import { useOpsStore } from '../store/opsStore';
import { EVENT_COLOR_HEX } from '../store/eventColors';
import type { CalendarBlock } from '../types/schema';

const FIRED_ALERTS_STORAGE_KEY = 'clearops_fired_alerts_v1';

interface ActiveAlertItem {
  signature: string;
  block: CalendarBlock;
  triggeredAtMs: number;
  eventStartMs: number;
}

function parseBlockDateTimeMs(isoDate: string, hhmm: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  if (hh === 24) {
    return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59).getTime();
  }
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).getTime();
}

function fmt12(hhmm: string): string {
  const [hRaw, m] = hhmm.split(':').map(Number);
  const h = (hRaw || 0) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function resolveAccentHex(block: CalendarBlock): string {
  if (block.customColor && EVENT_COLOR_HEX[block.customColor]) {
    return EVENT_COLOR_HEX[block.customColor];
  }
  switch (block.whyCategory) {
    case 'School':
      return '#2563EB';
    case 'Health':
      return '#0D9488';
    case 'Family':
      return '#D97706';
    default:
      return '#4F46E5';
  }
}

function playAlertChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.16, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.02);
    };

    playTone(659.25, 0, 0.22); // E5
    playTone(880, 0.16, 0.34); // A5
    window.setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, 800);
  } catch {
    /* AudioContext may be blocked until first user interaction */
  }

  try {
    navigator.vibrate?.([180, 80, 180]);
  } catch {
    /* ignore */
  }
}

function loadFiredSet(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FIRED_ALERTS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return new Set(arr.slice(-300));
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function persistFiredSet(set: Set<string>): void {
  try {
    const arr = Array.from(set).slice(-300);
    window.localStorage.setItem(FIRED_ALERTS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export const AlertMonitor: React.FC = () => {
  const { state, actions } = useOpsStore();
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlertItem[]>([]);
  const firedRef = useRef<Set<string> | null>(null);
  const snoozedUntilRef = useRef<Map<string, number>>(new Map());

  if (firedRef.current === null && typeof window !== 'undefined') {
    firedRef.current = loadFiredSet();
  }

  const evaluateAlerts = useCallback(() => {
    const fired = firedRef.current ?? new Set<string>();
    firedRef.current = fired;
    const nowMs = Date.now();
    const newlyTriggered: ActiveAlertItem[] = [];

    for (const block of state.blocks) {
      if (block.completed || typeof block.alertOffsetMinutes !== 'number') continue;

      const eventStartMs = parseBlockDateTimeMs(block.date, block.startTime);
      const eventEndMs = Math.max(
        eventStartMs + 10 * 60_000,
        parseBlockDateTimeMs(block.date, block.endTime)
      );
      const scheduledTriggerMs = eventStartMs - block.alertOffsetMinutes * 60_000;
      const snoozeUntil = snoozedUntilRef.current.get(block.id);

      const effectiveTriggerMs = snoozeUntil ?? scheduledTriggerMs;
      const sig = snoozeUntil
        ? `snooze:${block.id}:${snoozeUntil}`
        : `${block.id}|${block.date}|${block.startTime}|${block.alertOffsetMinutes}`;

      if (fired.has(sig)) continue;

      const latestValidWindowMs = Math.max(eventEndMs, effectiveTriggerMs + 15 * 60_000);
      if (nowMs >= effectiveTriggerMs && nowMs <= latestValidWindowMs) {
        fired.add(sig);
        if (snoozeUntil) {
          snoozedUntilRef.current.delete(block.id);
        }
        newlyTriggered.push({
          signature: sig,
          block,
          triggeredAtMs: nowMs,
          eventStartMs,
        });
      }
    }

    if (newlyTriggered.length > 0) {
      persistFiredSet(fired);
      playAlertChime();

      for (const item of newlyTriggered) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const minsUntil = Math.round((item.eventStartMs - nowMs) / 60_000);
            const timingLabel =
              minsUntil <= 0 ? 'Starting now' : `Starts in ${minsUntil} min`;
            const bodyParts = [
              `${timingLabel} · ${fmt12(item.block.startTime)}–${fmt12(item.block.endTime)}`,
              item.block.notes ? item.block.notes : '',
            ].filter(Boolean);
            new Notification(item.block.title, {
              body: bodyParts.join('\n'),
              tag: item.signature,
            });
          } catch {
            /* ignore */
          }
        }
      }

      setActiveAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.block.id));
        const deduped = prev.filter(
          (p) => !newlyTriggered.some((n) => n.block.id === p.block.id)
        );
        void existingIds;
        return [...newlyTriggered, ...deduped];
      });
    }
  }, [state.blocks]);

  useEffect(() => {
    evaluateAlerts();
    const id = window.setInterval(evaluateAlerts, 5000);
    const onWake = () => evaluateAlerts();
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [evaluateAlerts]);

  // Keep active alert cards synced if block was deleted or marked done
  useEffect(() => {
    setActiveAlerts((prev) =>
      prev.filter((item) => {
        const live = state.blocks.find((b) => b.id === item.block.id);
        return Boolean(live && !live.completed && typeof live.alertOffsetMinutes === 'number');
      })
    );
  }, [state.blocks]);

  if (activeAlerts.length === 0) return null;

  const nowMs = Date.now();

  const openAlertEventEditor = (block: CalendarBlock) => {
    actions.setSelectedDate(block.date);
    actions.setActiveTab('schedule');
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('intuition:open-block', { detail: { blockId: block.id } })
      );
    }, 30);
  };

  return createPortal(
    <div className="ops-live-alert-stack" role="region" aria-label="Active event alerts">
      {activeAlerts.map((item) => {
        const liveBlock = state.blocks.find((b) => b.id === item.block.id) ?? item.block;
        const accentHex = resolveAccentHex(liveBlock);
        const minsUntil = Math.round((item.eventStartMs - nowMs) / 60_000);
        const timingBadge =
          minsUntil <= 0 ? 'Starting now' : `In ${minsUntil} min`;

        return (
          <div
            key={item.signature}
            className="ops-live-alert-card"
            role="alert"
            style={{ '--alert-accent': accentHex, cursor: 'pointer' } as React.CSSProperties}
            onClick={() => openAlertEventEditor(liveBlock)}
          >
            <div className="ops-live-alert-bar" />
            <div className="ops-live-alert-body">
              <div className="ops-live-alert-top">
                <span className="ops-live-alert-badge">
                  <BellRing size={13} />
                  <span>{timingBadge}</span>
                </span>
                <span className="ops-live-alert-time">
                  {fmt12(liveBlock.startTime)} – {fmt12(liveBlock.endTime)}
                </span>
                <button
                  type="button"
                  className="ops-live-alert-close"
                  aria-label="Dismiss alert"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveAlerts((prev) =>
                      prev.filter((a) => a.signature !== item.signature)
                    );
                  }}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="ops-live-alert-title">{liveBlock.title}</div>

              {liveBlock.notes && (
                <div className="ops-live-alert-desc">{liveBlock.notes}</div>
              )}

              <div className="ops-live-alert-actions">
                <button
                  type="button"
                  className="ops-live-alert-btn is-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAlertEventEditor(liveBlock);
                  }}
                >
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  className="ops-live-alert-btn is-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    snoozedUntilRef.current.set(liveBlock.id, Date.now() + 5 * 60_000);
                    setActiveAlerts((prev) =>
                      prev.filter((a) => a.signature !== item.signature)
                    );
                  }}
                >
                  <Clock size={13} />
                  <span>Snooze 5m</span>
                </button>
                <button
                  type="button"
                  className="ops-live-alert-btn is-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveAlerts((prev) =>
                      prev.filter((a) => a.signature !== item.signature)
                    );
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  );
};
