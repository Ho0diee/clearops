import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, Bell, Check, ChevronLeft, ChevronRight, Sparkles, Trash2, X } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { addDaysISO, formatShortDate, getWeekDatesISO, useOpsStore } from '../../store/opsStore';
import type { CalendarBlock } from '../../types/schema';

const TODAY_ANCHOR = '2026-11-17';
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
  return !b.assignedIdeaId && !b.assignedGoalId && /open focus slot|reclaimed focus slot|^empty zone$/i.test(b.title);
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

export const CalendarGrid: React.FC<{ highlightId?: string | null }> = ({ highlightId }) => {
  const { state, actions } = useOpsStore();
  const isWeek = state.scheduleViewMode === 'week';
  const weekDates = useMemo(() => getWeekDatesISO(state.selectedDate), [state.selectedDate]);
  const columns = isWeek ? weekDates : [state.selectedDate];
  const hourHeight = isWeek ? 44 : 56;

  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  const visibleBlocks = useMemo(
    () => state.blocks.filter((b) => columns.includes(b.date)),
    [state.blocks, columns]
  );

  // Hour range adapts to the visible events (Google Calendar-style compact day)
  const { startHour, endHour } = useMemo(() => {
    let lo = 7;
    let hi = 21;
    visibleBlocks.forEach((b) => {
      lo = Math.min(lo, Math.floor(toMin(b.startTime) / 60));
      hi = Math.max(hi, Math.ceil(toMin(b.endTime) / 60));
    });
    return { startHour: Math.max(0, lo), endHour: Math.min(24, hi + 1) };
  }, [visibleBlocks]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = hours.length * hourHeight;

  // Auto-scroll to the first event of the view (or 8am) like Google Calendar
  useEffect(() => {
    if (!scrollRef.current) return;
    const firstMin = visibleBlocks.length
      ? Math.min(...visibleBlocks.map((b) => toMin(b.startTime)))
      : 8 * 60;
    const target = ((firstMin - startHour * 60) / 60) * hourHeight - 12;
    scrollRef.current.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedDate, state.scheduleViewMode]);

  // Zoom from the tapped day's column (week → day) like pinching into Google Calendar
  const dayIdx = Math.max(0, weekDates.indexOf(state.selectedDate));
  const zoomOrigin = `${((dayIdx + 0.5) / 7) * 100}% 0`;

  // Scroll a newly added (chat) event into view
  useEffect(() => {
    if (!highlightId || !scrollRef.current) return;
    const b = state.blocks.find((x) => x.id === highlightId);
    if (!b) return;
    const y = ((toMin(b.startTime) - startHour * 60) / 60) * hourHeight - 40;
    scrollRef.current.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  const openBlock = openBlockId ? state.blocks.find((b) => b.id === openBlockId) ?? null : null;

  const activeIdeas = useMemo(
    () =>
      state.ideas
        .filter((i) => i.status === 'active')
        .sort((a, b) => a.priorityRank - b.priorityRank),
    [state.ideas]
  );
  const assignedIds = new Set(state.blocks.filter((b) => b.assignedIdeaId && !b.completed).map((b) => b.assignedIdeaId));
  const topIdea = activeIdeas.find((i) => !assignedIds.has(i.id)) ?? activeIdeas[0];

  const shiftDate = (dir: 1 | -1) =>
    actions.setSelectedDate(addDaysISO(state.selectedDate, dir * (isWeek ? 7 : 1)));

  const onTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftDate(dx < 0 ? 1 : -1);
  };

  const monthLabel = new Date(`${state.selectedDate}T12:00:00Z`).toLocaleDateString('en-US', {
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
              <button type="button" className="gcal-back" onClick={() => actions.setScheduleViewMode('week')}>
                <ChevronLeft size={18} />
                <span>Week</span>
              </button>
              <span className="gcal-title gcal-title-day">{formatShortDate(state.selectedDate)}</span>
            </>
          )}
          <div className="gcal-toolbar-right">
            <button type="button" className="gcal-icon-btn" aria-label="Previous" onClick={() => shiftDate(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="gcal-today-btn"
              onClick={() => actions.setSelectedDate(TODAY_ANCHOR)}
            >
              Today
            </button>
            <button type="button" className="gcal-icon-btn" aria-label="Next" onClick={() => shiftDate(1)}>
              <ChevronRight size={18} />
            </button>
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
          {weekDates.map((iso, idx) => {
            const isSelected = iso === state.selectedDate;
            const isToday = iso === TODAY_ANCHOR;
            const count = state.blocks.filter((b) => b.date === iso).length;
            const dimmed = isWeek ? false : !isSelected;
            return (
              <button
                key={iso}
                type="button"
                className={`gcal-strip-day ${dimmed ? 'is-dim' : ''}`.trim()}
                onClick={() => {
                  actions.setSelectedDate(iso);
                  actions.setScheduleViewMode('day');
                }}
                aria-label={`Open ${formatShortDate(iso)}`}
              >
                <span className={`gcal-dow ${isToday ? 'is-today' : ''}`.trim()}>{WEEKDAY_LETTERS[idx]}</span>
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
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          key={state.scheduleViewMode}
          className={`gcal-body gcal-anim-${state.scheduleViewMode}`}
          style={{ height: gridHeight, transformOrigin: zoomOrigin }}
        >
          <div className="gcal-gutter gcal-hours">
            {hours.map((h, i) => (
              <div key={h} className="gcal-hour-label" style={{ top: i * hourHeight }}>
                {i === 0 ? '' : fmtHourLabel(h)}
              </div>
            ))}
          </div>

          <div className="gcal-cols">
            {hours.map((h, i) => (
              <div key={h} className="gcal-hline" style={{ top: i * hourHeight }} />
            ))}

            {columns.map((iso) => {
              const laid = layoutColumn(visibleBlocks.filter((b) => b.date === iso));
              const showNow = iso === TODAY_ANCHOR && nowMin >= startHour * 60 && nowMin <= endHour * 60;
              return (
                <div
                  key={iso}
                  className={`gcal-col ${iso === TODAY_ANCHOR && isWeek ? 'is-today' : ''}`.trim()}
                  onClick={(e) => {
                    if (isWeek && e.target === e.currentTarget) {
                      actions.setSelectedDate(iso);
                      actions.setScheduleViewMode('day');
                    }
                  }}
                >
                  {laid.map(({ block, col, cols }) => {
                    const s = toMin(block.startTime);
                    const e = Math.max(s + 15, toMin(block.endTime));
                    const top = ((s - startHour * 60) / 60) * hourHeight;
                    const height = Math.max(isWeek ? 18 : 22, ((e - s) / 60) * hourHeight - 2);
                    const roomy = !isWeek && height >= 40;
                    const clampLines = isWeek ? Math.max(1, Math.floor((height - 6) / 12.5)) : undefined;
                    return (
                      <button
                        key={block.id}
                        type="button"
                        className={`gcal-ev ${eventClass(block)} ${block.completed ? 'is-done' : ''} ${
                          isWeek ? 'is-compact' : ''
                        } ${block.id === highlightId ? 'is-flash' : ''}`.trim()}
                        style={{
                          top,
                          height,
                          left: `calc(${(col / cols) * 100}% + 1px)`,
                          width: `calc(${100 / cols}% - ${isWeek ? 2 : 4}px)`,
                        }}
                        onClick={() => setOpenBlockId(block.id)}
                        title={`${block.title} (${block.startTime}–${block.endTime})`}
                      >
                        <span
                          className="gcal-ev-title"
                          style={clampLines ? { WebkitLineClamp: clampLines } : undefined}
                        >
                          {block.completed && !isWeek && <Check size={11} strokeWidth={3} />}
                          {isWeek ? shortTitle(block) : block.title}
                          {!roomy && !isWeek && <span className="gcal-ev-inline-time">, {fmtTime(block.startTime)}</span>}
                        </span>
                        {roomy && (
                          <span className="gcal-ev-time">
                            {isWeek ? fmtTime(block.startTime) : `${fmtTime(block.startTime)} – ${fmtTime(block.endTime)}`}
                          </span>
                        )}
                        {roomy && !isWeek && block.startingStepHint && height >= 64 && (
                          <span className="gcal-ev-sub">{block.startingStepHint}</span>
                        )}
                      </button>
                    );
                  })}

                  {showNow && (
                    <div
                      className="gcal-now"
                      style={{ top: ((nowMin - startHour * 60) / 60) * hourHeight }}
                    />
                  )}
                </div>
              );
            })}
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
                    {formatShortDate(openBlock.date)} · {fmtTime(openBlock.startTime)} – {fmtTime(openBlock.endTime)}
                  </span>
                </div>
              </div>
              <button type="button" className="ui-command-mic" aria-label="Close" onClick={() => setOpenBlockId(null)}>
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
                <span className="gcal-sheet-meta">Open focus slot · ready for your next active priority (Waiting-On items excluded).</span>
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
    </div>
  );
};
