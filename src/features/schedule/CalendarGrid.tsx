import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, Bell, Check, ChevronLeft, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { addDaysISO, formatShortDate, getWeekDatesISO, useOpsStore } from '../../store/opsStore';
import type { CalendarBlock, ReminderItem, VoiceScheduleDraft } from '../../types/schema';

const TODAY_ANCHOR = '2026-11-17';
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SWIPE_MS = 260;
const SNAP_BACK_MS = 210;
const EASE_OUT_EXPO = 'cubic-bezier(0.22, 1, 0.36, 1)';

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmtHourLabel(h: number): string {
  const s = h % 12 === 0 ? 12 : h % 12;
  return `${s} ${h < 12 ? 'AM' : 'PM'}`;
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const s = h % 12 === 0 ? 12 : h % 12;
  return `${s}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

function isOpenZone(b: CalendarBlock): boolean {
  if (b.kind !== 'empty-zone') return false;
  return (
    !b.assignedIdeaId &&
    !b.assignedGoalId &&
    /open focus slot|reclaimed focus slot|^empty zone$/i.test(b.title)
  );
}

function shortTitle(b: CalendarBlock): string {
  return b.title.replace(/^Empty Zone\s*[—-]\s*/i, '').replace(/^Paced Goal\s*[—-]\s*/i, '');
}

function eventClass(b: CalendarBlock): string {
  if (b.kind === 'baseline') return `gcal-ev-${(b.whyCategory || 'Organization').toLowerCase()}`;
  if (b.kind === 'empty-zone') return isOpenZone(b) ? 'gcal-ev-zone-open' : 'gcal-ev-zone';
  if (b.kind === 'goal-session') return 'gcal-ev-goal';
  return 'gcal-ev-reflection';
}

interface Positioned {
  block: CalendarBlock;
  col: number;
  cols: number;
}

/** Google Calendar-style overlap layout: overlapping events share the column width. */
function layoutColumn(blocks: CalendarBlock[]): Positioned[] {
  const sorted = [...blocks].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  const out: Positioned[] = [];
  let cluster: { block: CalendarBlock; col: number }[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];

  const flush = () => {
    const cols = Math.max(1, colEnds.length);
    cluster.forEach((c) => out.push({ block: c.block, col: c.col, cols }));
    cluster = [];
    colEnds = [];
  };

  sorted.forEach((b) => {
    const s = toMin(b.startTime);
    const e = Math.max(s + 15, toMin(b.endTime));
    if (cluster.length && s >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= s);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(e);
    } else {
      colEnds[col] = e;
    }
    cluster.push({ block: b, col });
    clusterEnd = Math.max(clusterEnd, e);
  });
  if (cluster.length) flush();
  return out;
}

interface CalendarPaneProps {
  columns: string[];
  isWeek: boolean;
  startHour: number;
  endHour: number;
  hourHeight: number;
  nowMin: number;
  blocks: CalendarBlock[];
  reminders: ReminderItem[];
  highlightId?: string | null;
  liveDraft?: VoiceScheduleDraft | null;
  fallbackDraftIso?: string;
  onOpenBlock: (id: string) => void;
  onOpenReminder: (id: string) => void;
}

const CalendarPane = memo<CalendarPaneProps>(
  ({
    columns,
    isWeek,
    startHour,
    endHour,
    hourHeight,
    nowMin,
    blocks,
    reminders,
    highlightId,
    liveDraft,
    fallbackDraftIso,
    onOpenBlock,
    onOpenReminder,
  }) => {
    return (
      <>
        {columns.map((iso) => {
          const laid = layoutColumn(blocks.filter((b) => b.date === iso));
          const dayReminders = reminders.filter((r) => r.date === iso);
          const showNow = iso === TODAY_ANCHOR && nowMin >= startHour * 60 && nowMin <= endHour * 60;
          const targetDraftIso = liveDraft ? liveDraft.date ?? fallbackDraftIso : null;
          const draftOnThisDay = liveDraft && targetDraftIso === iso ? liveDraft : null;

          return (
            <div
              key={iso}
              className={`gcal-col ${iso === TODAY_ANCHOR && isWeek ? 'is-today' : ''}`.trim()}
            >
              {laid.map(({ block, col, cols }) => {
                const s = toMin(block.startTime);
                const e = Math.max(s + 15, toMin(block.endTime));
                const top = ((s - startHour * 60) / 60) * hourHeight;
                const height = Math.max(isWeek ? 18 : 22, ((e - s) / 60) * hourHeight - 2);
                const roomy = !isWeek && height >= 40;
                const clampLines = isWeek ? Math.max(1, Math.floor((height - 6) / 12.5)) : undefined;
                    const isSlotDraftTarget =
                  draftOnThisDay?.mode === 'fill-slot' && draftOnThisDay.targetBlockId === block.id;
                const displayTitle = isSlotDraftTarget
                  ? draftOnThisDay.title
                    ? `Empty Zone — ${draftOnThisDay.title}`
                    : 'Empty Zone — ?'
                  : isWeek
                  ? shortTitle(block)
                  : block.title;

                return (
                  <button
                    key={block.id}
                    type="button"
                    className={`gcal-ev ${eventClass(block)} ${block.completed ? 'is-done' : ''} ${
                      isWeek ? 'is-compact' : ''
                    } ${block.id === highlightId ? 'is-flash' : ''} ${
                      isSlotDraftTarget ? 'is-voice-slot-target' : ''
                    }`.trim()}
                    style={{
                      top,
                      height,
                      left: `calc(${(col / cols) * 100}% + 1px)`,
                      width: `calc(${100 / cols}% - ${isWeek ? 2 : 4}px)`,
                    }}
                    onClick={() => onOpenBlock(block.id)}
                    title={`${block.title} (${block.startTime}–${block.endTime})`}
                  >
                    <span
                      className="gcal-ev-title"
                      style={clampLines ? { WebkitLineClamp: clampLines } : undefined}
                    >
                      {block.completed && !isWeek && <Check size={11} strokeWidth={3} />}
                      {displayTitle}
                      {!roomy && !isWeek && (
                        <span className="gcal-ev-inline-time">, {fmtTime(block.startTime)}</span>
                      )}
                    </span>
                    {roomy && (
                      <span className="gcal-ev-time">
                        {isWeek
                          ? fmtTime(block.startTime)
                          : `${fmtTime(block.startTime)} – ${fmtTime(block.endTime)}`}
                      </span>
                    )}
                    {roomy && !isWeek && block.startingStepHint && height >= 64 && (
                      <span className="gcal-ev-sub">{block.startingStepHint}</span>
                    )}
                  </button>
                );
              })}

              {/* Live Progressive Voice Event / Empty-Zone Draft Block */}
              {draftOnThisDay &&
                (draftOnThisDay.mode === 'event' || draftOnThisDay.mode === 'empty-zone') &&
                draftOnThisDay.startTime && (() => {
                  const s = toMin(draftOnThisDay.startTime);
                  const hasEnd = Boolean(draftOnThisDay.endTime);
                  const e = hasEnd ? Math.max(s + 20, toMin(draftOnThisDay.endTime!)) : s + 60;
                  const top = ((s - startHour * 60) / 60) * hourHeight;
                  const height = Math.max(
                    isWeek ? 26 : 48,
                    ((e - s) / 60) * hourHeight - 2
                  );
                  const toneClass =
                    draftOnThisDay.mode === 'empty-zone'
                      ? 'gcal-ev-zone'
                      : `gcal-ev-${(draftOnThisDay.whyCategory || 'Organization').toLowerCase()}`;
                  return (
                    <div
                      className={`gcal-ev gcal-voice-draft ${toneClass} ${
                        hasEnd ? 'is-end-known' : 'is-open-end'
                      } ${draftOnThisDay.isComplete ? 'is-draft-complete' : ''}`.trim()}
                      style={{
                        top,
                        height,
                        left: '2px',
                        width: 'calc(100% - 4px)',
                      }}
                    >
                      <span className="gcal-ev-title">
                        {draftOnThisDay.title || '?'}
                      </span>
                      <span className="gcal-ev-time">
                        {!draftOnThisDay.date ? 'Day ? · ' : ''}
                        {hasEnd
                          ? `${fmtTime(draftOnThisDay.startTime)} – ${fmtTime(
                              draftOnThisDay.endTime!
                            )}`
                          : `${fmtTime(draftOnThisDay.startTime)} – ?`}
                      </span>
                    </div>
                  );
                })()}

              {dayReminders.map((rem, idx) => {
                const m = toMin(rem.time);
                const sameTimeIdx = dayReminders
                  .slice(0, idx)
                  .filter((prev) => Math.abs(toMin(prev.time) - m) < 20).length;
                const top =
                  ((m - startHour * 60) / 60) * hourHeight + sameTimeIdx * (isWeek ? 20 : 24);
                return (
                  <button
                    key={rem.id}
                    type="button"
                    className={`gcal-rem ${rem.completed ? 'is-done' : ''} ${
                      isWeek ? 'is-compact' : ''
                    } ${rem.id === highlightId ? 'is-flash' : ''}`.trim()}
                    style={{ top }}
                    onClick={() => onOpenReminder(rem.id)}
                    title={`Reminder: ${rem.title} (${fmtTime(rem.time)})`}
                  >
                    {rem.completed ? <Check size={10} strokeWidth={3} /> : <Bell size={10} />}
                    <span className="gcal-rem-title">{rem.title}</span>
                    {!isWeek && <span className="gcal-rem-time">{fmtTime(rem.time)}</span>}
                  </button>
                );
              })}

              {/* Live Progressive Voice Reminder Draft Pin */}
              {draftOnThisDay &&
                draftOnThisDay.mode === 'reminder' &&
                draftOnThisDay.startTime && (
                  <div
                    className={`gcal-rem gcal-rem-draft ${
                      draftOnThisDay.isComplete ? 'is-draft-complete' : ''
                    }`.trim()}
                    style={{
                      top: ((toMin(draftOnThisDay.startTime) - startHour * 60) / 60) * hourHeight,
                    }}
                  >
                    <Bell size={10} />
                    <span className="gcal-rem-title">
                      {draftOnThisDay.title || '?'}
                    </span>
                    {!isWeek && (
                      <span className="gcal-rem-time">{fmtTime(draftOnThisDay.startTime)}</span>
                    )}
                  </div>
                )}

              {showNow && (
                <div
                  className="gcal-now"
                  style={{ top: ((nowMin - startHour * 60) / 60) * hourHeight }}
                />
              )}
            </div>
          );
        })}
      </>
    );
  }
);
CalendarPane.displayName = 'CalendarPane';

export const CalendarGrid: React.FC<{
  highlightId?: string | null;
  liveDraft?: VoiceScheduleDraft | null;
}> = ({ highlightId, liveDraft }) => {
  const { state, actions } = useOpsStore();
  const isWeek = state.scheduleViewMode === 'week';
  const stepDays = isWeek ? 7 : 1;
  const hourHeight = isWeek ? 44 : 56;

  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [openReminderId, setOpenReminderId] = useState<string | null>(null);
  const [pendingHeaderIso, setPendingHeaderIso] = useState<string | null>(null);
  const [overrideSide, setOverrideSide] = useState<{ dir: 1 | -1; iso: string } | null>(null);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const prevPaneRef = useRef<HTMLDivElement | null>(null);
  const centerPaneRef = useRef<HTMLDivElement | null>(null);
  const nextPaneRef = useRef<HTMLDivElement | null>(null);

  const prevModeRef = useRef(state.scheduleViewMode);
  const suppressClickUntilRef = useRef(0);
  const wheelCooldownRef = useRef(0);
  const animTimerRef = useRef<number | null>(null);
  const animTargetIsoRef = useRef<string | null>(null);

  const pointerRef = useRef<{
    pointerId: number;
    captured: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    vx: number;
    axis: 'none' | 'x' | 'y';
    stageWidth: number;
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) {
        window.clearTimeout(animTimerRef.current);
      }
    };
  }, []);

  // Anchor dates for the 3-pane GPU carousel [prev, current, next]
  const currAnchor = state.selectedDate;
  const prevAnchor =
    overrideSide?.dir === -1 ? overrideSide.iso : addDaysISO(currAnchor, -stepDays);
  const nextAnchor =
    overrideSide?.dir === 1 ? overrideSide.iso : addDaysISO(currAnchor, stepDays);

  const prevColumns = useMemo(
    () => (isWeek ? getWeekDatesISO(prevAnchor) : [prevAnchor]),
    [isWeek, prevAnchor]
  );
  const currColumns = useMemo(
    () => (isWeek ? getWeekDatesISO(currAnchor) : [currAnchor]),
    [isWeek, currAnchor]
  );
  const nextColumns = useMemo(
    () => (isWeek ? getWeekDatesISO(nextAnchor) : [nextAnchor]),
    [isWeek, nextAnchor]
  );

  // Header reflects the destination date immediately during glide so strip & title feel instantaneous
  const headerIso = pendingHeaderIso ?? currAnchor;
  const headerWeekDates = useMemo(() => getWeekDatesISO(headerIso), [headerIso]);

  const allWindowSet = useMemo(
    () => new Set([...prevColumns, ...currColumns, ...nextColumns]),
    [prevColumns, currColumns, nextColumns]
  );

  const windowBlocks = useMemo(
    () => state.blocks.filter((b) => allWindowSet.has(b.date)),
    [state.blocks, allWindowSet]
  );
  const windowReminders = useMemo(
    () => state.reminders.filter((r) => allWindowSet.has(r.date)),
    [state.reminders, allWindowSet]
  );

  // Shared hour range across all 3 panes so time labels & rulings stay rock-solid across swipes
  const { startHour, endHour } = useMemo(() => {
    let lo = 7;
    let hi = 21;
    state.blocks.forEach((b) => {
      lo = Math.min(lo, Math.floor(toMin(b.startTime) / 60));
      hi = Math.max(hi, Math.ceil(toMin(b.endTime) / 60));
    });
    state.reminders.forEach((r) => {
      const m = toMin(r.time);
      lo = Math.min(lo, Math.floor(m / 60));
      hi = Math.max(hi, Math.ceil((m + 30) / 60));
    });
    if (liveDraft?.startTime) {
      const s = toMin(liveDraft.startTime);
      const e = liveDraft.endTime ? toMin(liveDraft.endTime) : s + 60;
      lo = Math.min(lo, Math.floor(s / 60));
      hi = Math.max(hi, Math.ceil(e / 60));
    }
    return { startHour: Math.max(0, lo), endHour: Math.min(24, hi + 1) };
  }, [state.blocks, state.reminders, liveDraft?.startTime, liveDraft?.endTime]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const gridHeight = hours.length * hourHeight;

  const resetTrackStylesInstant = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translate3d(-33.333333%, 0, 0)';
    }
    if (centerPaneRef.current) {
      centerPaneRef.current.style.transition = 'none';
      centerPaneRef.current.style.opacity = '1';
    }
    if (prevPaneRef.current) {
      prevPaneRef.current.style.transition = 'none';
      prevPaneRef.current.style.opacity = '0.6';
    }
    if (nextPaneRef.current) {
      nextPaneRef.current.style.transition = 'none';
      nextPaneRef.current.style.opacity = '0.6';
    }
  }, []);

  // Synchronously recenter the 3-pane track BEFORE paint whenever selectedDate or viewMode commits
  useLayoutEffect(() => {
    resetTrackStylesInstant();
  }, [state.selectedDate, state.scheduleViewMode, resetTrackStylesInstant]);

  const finalizePendingGlide = useCallback(() => {
    if (animTimerRef.current !== null) {
      window.clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    const target = animTargetIsoRef.current;
    animTargetIsoRef.current = null;
    if (target) {
      setOverrideSide(null);
      setPendingHeaderIso(null);
      actions.setSelectedDate(target);
    }
  }, [actions]);

  const executeGlide = useCallback(
    (dir: 1 | -1, targetIso: string) => {
      if (animTimerRef.current !== null) {
        window.clearTimeout(animTimerRef.current);
      }
      animTargetIsoRef.current = targetIso;
      setPendingHeaderIso(targetIso);

      const track = trackRef.current;
      const centerEl = centerPaneRef.current;
      const incomingEl = dir === 1 ? nextPaneRef.current : prevPaneRef.current;

      if (!track) {
        animTargetIsoRef.current = null;
        setOverrideSide(null);
        setPendingHeaderIso(null);
        actions.setSelectedDate(targetIso);
        return;
      }

      // Force style flush so transitions always animate smoothly from current position
      void track.offsetWidth;

      const destPct = dir === 1 ? '-66.666667%' : '0%';
      track.style.transition = `transform ${SWIPE_MS}ms ${EASE_OUT_EXPO}`;
      track.style.transform = `translate3d(${destPct}, 0, 0)`;

      if (centerEl) {
        centerEl.style.transition = `opacity ${Math.round(SWIPE_MS * 0.85)}ms ${EASE_OUT_EXPO}`;
        centerEl.style.opacity = '0';
      }
      if (incomingEl) {
        incomingEl.style.transition = `opacity ${Math.round(SWIPE_MS * 0.85)}ms ${EASE_OUT_EXPO}`;
        incomingEl.style.opacity = '1';
      }

      animTimerRef.current = window.setTimeout(() => {
        animTimerRef.current = null;
        const committed = animTargetIsoRef.current;
        animTargetIsoRef.current = null;
        setOverrideSide(null);
        setPendingHeaderIso(null);
        if (committed) {
          actions.setSelectedDate(committed);
        }
      }, SWIPE_MS + 12);
    },
    [actions]
  );

  // Trigger deferred glide when tapping a non-adjacent day in the strip (once overrideSide renders)
  useEffect(() => {
    if (!overrideSide) return;
    executeGlide(overrideSide.dir, overrideSide.iso);
  }, [overrideSide, executeGlide]);

  // Auto-scroll on initial mount or when zooming between Week and Day
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (!scrollRef.current) return;
    if (didInitialScrollRef.current && prevModeRef.current === state.scheduleViewMode) {
      return;
    }
    didInitialScrollRef.current = true;
    prevModeRef.current = state.scheduleViewMode;
    if (liveDraft?.startTime) return;
    const currBlocks = windowBlocks.filter((b) => currColumns.includes(b.date));
    const firstMin = currBlocks.length
      ? Math.min(...currBlocks.map((b) => toMin(b.startTime)))
      : 8 * 60;
    const target = ((firstMin - startHour * 60) / 60) * hourHeight - 12;
    scrollRef.current.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scheduleViewMode]);

  // Horizontal zoom origin from tapped day column (strictly inside .gcal-stage so times are never covered)
  const dayIdx = Math.max(0, headerWeekDates.indexOf(headerIso));
  const zoomOrigin = `${((dayIdx + 0.5) / 7) * 100}% 0`;

  // Scroll a newly added event or reminder into view
  useEffect(() => {
    if (!highlightId || !scrollRef.current) return;
    const b = state.blocks.find((x) => x.id === highlightId);
    const rem = !b ? state.reminders.find((x) => x.id === highlightId) : undefined;
    const targetTime = b ? b.startTime : rem?.time;
    if (!targetTime) return;
    const y = ((toMin(targetTime) - startHour * 60) / 60) * hourHeight - 40;
    scrollRef.current.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  // Automatically pop to the spoken day & scroll to the spoken start time as voice info arrives
  useEffect(() => {
    if (!liveDraft?.date) return;
    if (state.scheduleViewMode === 'week') {
      finalizePendingGlide();
      actions.setSelectedDate(liveDraft.date);
      actions.setScheduleViewMode('day');
      return;
    }
    if (liveDraft.date !== state.selectedDate && animTargetIsoRef.current !== liveDraft.date) {
      finalizePendingGlide();
      const dir: 1 | -1 = liveDraft.date > state.selectedDate ? 1 : -1;
      if (liveDraft.date === addDaysISO(state.selectedDate, dir)) {
        executeGlide(dir, liveDraft.date);
      } else {
        setPendingHeaderIso(liveDraft.date);
        setOverrideSide({ dir, iso: liveDraft.date });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDraft?.date]);

  useEffect(() => {
    if (!liveDraft?.startTime || !scrollRef.current) return;
    const y = ((toMin(liveDraft.startTime) - startHour * 60) / 60) * hourHeight - 56;
    scrollRef.current.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }, [liveDraft?.startTime, liveDraft?.date, state.scheduleViewMode, startHour, hourHeight]);

  const openBlock = openBlockId ? state.blocks.find((b) => b.id === openBlockId) ?? null : null;
  const openReminder = openReminderId
    ? state.reminders.find((r) => r.id === openReminderId) ?? null
    : null;

  const activeIdeas = useMemo(
    () =>
      state.ideas
        .filter((i) => i.status === 'active')
        .sort((a, b) => a.priorityRank - b.priorityRank),
    [state.ideas]
  );
  const assignedIds = new Set(
    state.blocks.filter((b) => b.assignedIdeaId && !b.completed).map((b) => b.assignedIdeaId)
  );
  const topIdea = activeIdeas.find((i) => !assignedIds.has(i.id)) ?? activeIdeas[0];

  const selectDay = useCallback(
    (iso: string) => {
      if (performance.now() < suppressClickUntilRef.current) return;
      finalizePendingGlide();

      if (isWeek) {
        actions.setSelectedDate(iso);
        actions.setScheduleViewMode('day');
        return;
      }

      if (iso === state.selectedDate) return;
      const dir: 1 | -1 = iso > state.selectedDate ? 1 : -1;
      const expectedNeighbor = addDaysISO(state.selectedDate, dir);
      if (iso === expectedNeighbor) {
        executeGlide(dir, iso);
      } else {
        setPendingHeaderIso(iso);
        setOverrideSide({ dir, iso });
      }
    },
    [isWeek, state.selectedDate, actions, finalizePendingGlide, executeGlide]
  );

  const handleOpenBlock = useCallback((id: string) => {
    if (performance.now() < suppressClickUntilRef.current) return;
    setOpenBlockId(id);
  }, []);

  const handleOpenReminder = useCallback((id: string) => {
    if (performance.now() < suppressClickUntilRef.current) return;
    setOpenReminderId(id);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    finalizePendingGlide();
    const now = performance.now();
    const stageWidth = stageRef.current?.clientWidth || 320;
    pointerRef.current = {
      pointerId: e.pointerId,
      captured: false,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastTime: now,
      vx: 0,
      axis: 'none',
      stageWidth,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.pointerId) return;

    const x = e.clientX;
    const y = e.clientY;
    const dx = x - p.startX;
    const dy = y - p.startY;

    if (p.axis === 'none') {
      if (Math.hypot(dx, dy) < 7) return;
      p.axis = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y';
      if (p.axis === 'x') {
        if (!p.captured) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
            p.captured = true;
          } catch {
            /* ignore */
          }
        }
        if (scrollRef.current) scrollRef.current.style.overflowY = 'hidden';
        if (trackRef.current) trackRef.current.style.transition = 'none';
        if (centerPaneRef.current) centerPaneRef.current.style.transition = 'none';
        if (prevPaneRef.current) prevPaneRef.current.style.transition = 'none';
        if (nextPaneRef.current) nextPaneRef.current.style.transition = 'none';
      }
    }

    if (p.axis !== 'x') return;

    const now = performance.now();
    const dt = Math.max(1, now - p.lastTime);
    p.vx = (x - p.lastX) / dt;
    p.lastX = x;
    p.lastTime = now;

    const clampedDx = Math.max(-p.stageWidth, Math.min(p.stageWidth, dx));
    const progress = Math.min(1, Math.abs(clampedDx) / p.stageWidth);

    // Pure GPU 1:1 finger/pointer tracking — zero React re-renders during drag
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(calc(-33.333333% + ${clampedDx}px), 0, 0)`;
    }
    if (centerPaneRef.current) {
      centerPaneRef.current.style.opacity = String(1 - progress * 0.72);
    }
    const activeSide = clampedDx < 0 ? nextPaneRef.current : prevPaneRef.current;
    const idleSide = clampedDx < 0 ? prevPaneRef.current : nextPaneRef.current;
    if (activeSide) {
      activeSide.style.opacity = String(0.55 + progress * 0.45);
    }
    if (idleSide) {
      idleSide.style.opacity = '0.55';
    }
  };

  const finishPointerGesture = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.pointerId) return;
    pointerRef.current = null;

    if (p.captured) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (scrollRef.current) scrollRef.current.style.overflowY = '';
    if (p.axis !== 'x') return;

    suppressClickUntilRef.current = performance.now() + 320;
    const dx = cancelled ? 0 : e.clientX - p.startX;
    const distancePass = !cancelled && Math.abs(dx) > p.stageWidth * 0.22;
    const flickPass =
      !cancelled && Math.abs(dx) > 22 && Math.abs(p.vx) > 0.32 && Math.sign(dx) === Math.sign(p.vx);

    if (distancePass || flickPass) {
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      executeGlide(dir, addDaysISO(state.selectedDate, dir * stepDays));
      return;
    }

    // Smooth spring-back to center when swipe is cancelled
    if (trackRef.current) {
      trackRef.current.style.transition = `transform ${SNAP_BACK_MS}ms ${EASE_OUT_EXPO}`;
      trackRef.current.style.transform = 'translate3d(-33.333333%, 0, 0)';
    }
    if (centerPaneRef.current) {
      centerPaneRef.current.style.transition = `opacity ${SNAP_BACK_MS}ms ease-out`;
      centerPaneRef.current.style.opacity = '1';
    }
    if (prevPaneRef.current) {
      prevPaneRef.current.style.transition = `opacity ${SNAP_BACK_MS}ms ease-out`;
      prevPaneRef.current.style.opacity = '0.6';
    }
    if (nextPaneRef.current) {
      nextPaneRef.current.style.transition = `opacity ${SNAP_BACK_MS}ms ease-out`;
      nextPaneRef.current.style.opacity = '0.6';
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.3 || Math.abs(e.deltaX) < 32) return;
    const now = performance.now();
    if (now < wheelCooldownRef.current) return;
    wheelCooldownRef.current = now + 420;
    finalizePendingGlide();
    const dir: 1 | -1 = e.deltaX > 0 ? 1 : -1;
    executeGlide(dir, addDaysISO(state.selectedDate, dir * stepDays));
  };

  const monthLabel = new Date(`${headerIso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="gcal">
      {/* Month label + week strip / week header */}
      <div className="gcal-head">
        <div className="gcal-toolbar">
          {isWeek ? (
            <span className="gcal-title">{monthLabel}</span>
          ) : (
            <>
              <button
                type="button"
                className="gcal-back"
                onClick={() => {
                  finalizePendingGlide();
                  actions.setScheduleViewMode('week');
                }}
              >
                <ChevronLeft size={18} />
                <span>Week</span>
              </button>
              <span key={headerIso} className="gcal-title gcal-title-day">
                {formatShortDate(headerIso)}
              </span>
            </>
          )}
          <div className="gcal-toolbar-right">
            <button
              type="button"
              className="gcal-icon-btn"
              aria-label="Daily briefing"
              title="Daily briefing"
              onClick={() => actions.setActiveTab('today')}
            >
              <Bell size={17} />
            </button>
          </div>
        </div>
        <div className="gcal-strip">
          <div className="gcal-gutter" />
          {headerWeekDates.map((iso, idx) => {
            const isSelected = iso === headerIso;
            const isToday = iso === TODAY_ANCHOR;
            const count =
              state.blocks.filter((b) => b.date === iso).length +
              state.reminders.filter((r) => r.date === iso).length;
            const dimmed = isWeek ? false : !isSelected;
            return (
              <button
                key={iso}
                type="button"
                className={`gcal-strip-day ${dimmed ? 'is-dim' : ''}`.trim()}
                onClick={() => selectDay(iso)}
                aria-label={`Open ${formatShortDate(iso)}`}
              >
                <span className={`gcal-dow ${isToday ? 'is-today' : ''}`.trim()}>
                  {WEEKDAY_LETTERS[idx]}
                </span>
                <span
                  className={`gcal-date ${isToday ? 'is-today' : ''} ${
                    isSelected && !isToday && !isWeek ? 'is-selected' : ''
                  }`.trim()}
                >
                  {dayNumber(iso)}
                </span>
                {!isWeek && <span className={`gcal-dot ${count ? '' : 'is-empty'}`.trim()} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        className="gcal-scroll"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finishPointerGesture(e, false)}
        onPointerCancel={(e) => finishPointerGesture(e, true)}
        onWheel={onWheel}
      >
        {liveDraft && !liveDraft.startTime && (
          <div
            className={`gcal-floating-draft ${
              liveDraft.mode === 'reminder'
                ? 'is-reminder'
                : liveDraft.mode === 'empty-zone'
                ? 'gcal-ev-zone'
                : `gcal-ev-${(liveDraft.whyCategory || 'Organization').toLowerCase()}`
            }`.trim()}
          >
            <span className="gcal-ev-title">{liveDraft.title || '?'}</span>
            <span className="gcal-ev-time">
              {liveDraft.date ? formatShortDate(liveDraft.date) : 'Day ?'} ·{' '}
              {liveDraft.mode === 'reminder' ? 'Time ?' : '? – ?'}
            </span>
          </div>
        )}
        <div className="gcal-body" style={{ height: gridHeight }}>
          {/* Protected fixed-width time gutter — never covered by horizontal swipes or zooms */}
          <div className="gcal-gutter gcal-hours">
            {hours.map((h, i) => (
              <div key={h} className="gcal-hour-label" style={{ top: i * hourHeight }}>
                {i === 0 ? '' : fmtHourLabel(h)}
              </div>
            ))}
          </div>

          {/* Clipped stage strictly to the right of the hour labels */}
          <div ref={stageRef} className="gcal-stage">
            <div className="gcal-hlines" aria-hidden="true">
              {hours.map((h, i) => (
                <div key={h} className="gcal-hline" style={{ top: i * hourHeight }} />
              ))}
            </div>

            <div
              key={state.scheduleViewMode}
              className={`gcal-zoom gcal-anim-${state.scheduleViewMode}`}
              style={{ transformOrigin: zoomOrigin }}
            >
              <div ref={trackRef} className="gcal-track">
                <div ref={prevPaneRef} className="gcal-pane" aria-hidden="true">
                  <CalendarPane
                    columns={prevColumns}
                    isWeek={isWeek}
                    startHour={startHour}
                    endHour={endHour}
                    hourHeight={hourHeight}
                    nowMin={nowMin}
                    blocks={windowBlocks}
                    reminders={windowReminders}
                    highlightId={null}
                    liveDraft={liveDraft}
                    fallbackDraftIso={state.selectedDate}
                    onOpenBlock={handleOpenBlock}
                    onOpenReminder={handleOpenReminder}
                  />
                </div>

                <div ref={centerPaneRef} className="gcal-pane">
                  <CalendarPane
                    columns={currColumns}
                    isWeek={isWeek}
                    startHour={startHour}
                    endHour={endHour}
                    hourHeight={hourHeight}
                    nowMin={nowMin}
                    blocks={windowBlocks}
                    reminders={windowReminders}
                    highlightId={highlightId}
                    liveDraft={liveDraft}
                    fallbackDraftIso={state.selectedDate}
                    onOpenBlock={handleOpenBlock}
                    onOpenReminder={handleOpenReminder}
                  />
                </div>

                <div ref={nextPaneRef} className="gcal-pane" aria-hidden="true">
                  <CalendarPane
                    columns={nextColumns}
                    isWeek={isWeek}
                    startHour={startHour}
                    endHour={endHour}
                    hourHeight={hourHeight}
                    nowMin={nowMin}
                    blocks={windowBlocks}
                    reminders={windowReminders}
                    highlightId={null}
                    liveDraft={liveDraft}
                    fallbackDraftIso={state.selectedDate}
                    onOpenBlock={handleOpenBlock}
                    onOpenReminder={handleOpenReminder}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Event detail bottom sheet (Google Calendar-style) */}
      {openBlock && (
        <div
          className="gcal-sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenBlockId(null);
          }}
        >
          <div className="gcal-sheet" role="dialog" aria-label={openBlock.title}>
            <div className="gcal-sheet-grip" />
            <div className="ops-row-between" style={{ alignItems: 'flex-start' }}>
              <div className="ops-row" style={{ alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                <span className={`gcal-swatch ${eventClass(openBlock)}`} />
                <div className="ops-stack-xs" style={{ minWidth: 0 }}>
                  <h3 className="gcal-sheet-title">{openBlock.title}</h3>
                  <span className="gcal-sheet-meta">
                    {formatShortDate(openBlock.date)} · {fmtTime(openBlock.startTime)} –{' '}
                    {fmtTime(openBlock.endTime)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="ui-command-mic"
                aria-label="Close"
                onClick={() => setOpenBlockId(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="ops-stack-sm" style={{ marginTop: 14 }}>
              {openBlock.whyCategory && (
                <div className="ops-stack-xs">
                  <div>
                    <Badge tone="why">Why: {openBlock.whyCategory}</Badge>
                  </div>
                  <span className="gcal-sheet-meta">{state.whyStatements[openBlock.whyCategory]}</span>
                </div>
              )}
              {openBlock.startingStepHint && (
                <div>
                  <Badge tone="zone">Starting step: {openBlock.startingStepHint}</Badge>
                </div>
              )}
              {isOpenZone(openBlock) && (
                <span className="gcal-sheet-meta">
                  Open focus slot · ready for your next active priority (Waiting-On items excluded).
                </span>
              )}
            </div>

            <div className="gcal-sheet-actions">
              {openBlock.kind === 'empty-zone' && !isOpenZone(openBlock) && (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  iconRight={<ArrowRight size={15} />}
                  onClick={() => {
                    actions.spilloverEmptyZone(openBlock.id);
                    setOpenBlockId(null);
                  }}
                >
                  Spillover to next Empty Zone
                </Button>
              )}

              {isOpenZone(openBlock) && topIdea && (
                <>
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    iconLeft={<Sparkles size={15} />}
                    onClick={() => {
                      actions.assignIdeaToBlock(openBlock.id, topIdea.id);
                      setOpenBlockId(null);
                    }}
                  >
                    Pull {topIdea.project} #{topIdea.priorityRank}: {topIdea.title}
                  </Button>
                  <select
                    className="ui-select"
                    aria-label="Assign a different idea"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        actions.assignIdeaToBlock(openBlock.id, e.target.value);
                        setOpenBlockId(null);
                      }
                    }}
                  >
                    <option value="">Or choose another idea…</option>
                    {activeIdeas.map((idea) => (
                      <option key={idea.id} value={idea.id}>
                        {idea.project} #{idea.priorityRank}: {idea.title}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {openBlock.kind === 'reflection' && (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => {
                    setOpenBlockId(null);
                    actions.setReflectionOpen(true);
                  }}
                >
                  Open Reflection Check-In
                </Button>
              )}

              {openBlock.kind === 'goal-session' && (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  iconLeft={<Activity size={15} />}
                  onClick={() => {
                    setOpenBlockId(null);
                    actions.setActiveTab('pacing');
                  }}
                >
                  Pacing Confidence Check-In
                </Button>
              )}

              <div className="ops-row" style={{ gap: 8 }}>
                <Button
                  variant={openBlock.completed ? 'secondary' : 'tonal-zone'}
                  size="md"
                  style={{ flex: 1 }}
                  iconLeft={<Check size={14} />}
                  onClick={() => actions.toggleBlockCompleted(openBlock.id)}
                >
                  {openBlock.completed ? 'Mark not done' : 'Mark done'}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  iconLeft={<Trash2 size={14} />}
                  onClick={() => {
                    actions.deleteCalendarBlock(openBlock.id);
                    setOpenBlockId(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reminder detail bottom sheet */}
      {openReminder && (
        <div
          className="gcal-sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenReminderId(null);
          }}
        >
          <div className="gcal-sheet" role="dialog" aria-label={openReminder.title}>
            <div className="gcal-sheet-grip" />
            <div className="ops-row-between" style={{ alignItems: 'flex-start' }}>
              <div className="ops-row" style={{ alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                <span className="gcal-swatch gcal-swatch-rem" />
                <div className="ops-stack-xs" style={{ minWidth: 0 }}>
                  <h3 className="gcal-sheet-title">{openReminder.title}</h3>
                  <span className="gcal-sheet-meta">
                    Reminder · {formatShortDate(openReminder.date)} at {fmtTime(openReminder.time)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="ui-command-mic"
                aria-label="Close"
                onClick={() => setOpenReminderId(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="gcal-sheet-actions">
              <div className="ops-row" style={{ gap: 8 }}>
                <Button
                  variant={openReminder.completed ? 'secondary' : 'primary'}
                  size="md"
                  style={{ flex: 1 }}
                  iconLeft={<Check size={14} />}
                  onClick={() => {
                    actions.toggleReminder(openReminder.id);
                    setOpenReminderId(null);
                  }}
                >
                  {openReminder.completed ? 'Mark not done' : 'Mark done'}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  iconLeft={<Trash2 size={14} />}
                  onClick={() => {
                    actions.deleteReminder(openReminder.id);
                    setOpenReminderId(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
