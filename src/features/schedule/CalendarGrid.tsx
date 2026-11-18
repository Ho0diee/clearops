import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronLeft,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { addDaysISO, formatShortDate, getWeekDatesISO, useOpsStore } from '../../store/opsStore';
import { inferWhyFromTitle } from '../../store/scheduleAi';
import { getBlockingBottleneck } from '../../store/ideaBlocking';
import { OHCHS_BY_DATE } from '../../store/ohchsSchedule';
import {
  EVENT_COLOR_OPTIONS,
  formatAlertBadgeCompact,
  formatAlertOffsetShort,
} from '../../store/eventColors';
import {
  enableBackgroundPush,
  isIosDevice,
  isStandalonePwa,
  supportsWebPush,
} from '../../store/pushClient';
import type {
  CalendarBlock,
  EventColorId,
  ReminderItem,
  VoiceScheduleDraft,
  WhyCategory,
} from '../../types/schema';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WHY_CATEGORIES: WhyCategory[] = ['Organization', 'School', 'Health', 'Family'];
const ALERT_PRESETS: { label: string; value: number | undefined }[] = [
  { label: 'Off', value: undefined },
  { label: 'At start', value: 0 },
  { label: '5m', value: 5 },
  { label: '10m', value: 10 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
];
const SWIPE_MS = 260;
const SNAP_BACK_MS = 210;
const LONG_PRESS_MS = 380;
const EASE_OUT_EXPO = 'cubic-bezier(0.22, 1, 0.36, 1)';

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fromMin(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(total)));
  if (clamped === 24 * 60) return '24:00';
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function snapMin(raw: number, step = 15): number {
  return Math.round(raw / step) * step;
}

function fmtHourLabel(h: number): string {
  const norm = h % 24;
  const s = norm % 12 === 0 ? 12 : norm % 12;
  return `${s} ${norm < 12 ? 'AM' : 'PM'}`;
}

function fmtTime(t: string): string {
  const [hRaw, m] = t.split(':').map(Number);
  const h = hRaw % 24;
  const s = h % 12 === 0 ? 12 : norm12(h);
  return `${s}:${String(m || 0).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function norm12(h: number): number {
  return h % 12 === 0 ? 12 : h % 12;
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
  if (b.customColor) return `gcal-ev-color-${b.customColor}`;
  if (b.kind === 'baseline') return `gcal-ev-${(b.whyCategory || 'Organization').toLowerCase()}`;
  if (b.kind === 'empty-zone') return isOpenZone(b) ? 'gcal-ev-zone-open' : 'gcal-ev-zone';
  if (b.kind === 'goal-session') return 'gcal-ev-goal';
  return 'gcal-ev-reflection';
}

function requestNotificationPermissionIfNeeded(): void {
  if (typeof window === 'undefined') return;
  if (supportsWebPush() && Notification.permission === 'default') {
    void enableBackgroundPush();
    return;
  }
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => undefined);
  }
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
    const e = Math.max(s + 10, toMin(b.endTime));
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

type ActiveGridDrag =
  | {
      kind: 'move-block';
      block: CalendarBlock;
      grabOffsetMins: number;
      durationMins: number;
      date: string;
      startMins: number;
      endMins: number;
    }
  | {
      kind: 'resize-start' | 'resize-end';
      block: CalendarBlock;
      date: string;
      startMins: number;
      endMins: number;
    }
  | {
      kind: 'move-reminder';
      reminder: ReminderItem;
      date: string;
      timeMins: number;
    }
  | {
      kind: 'sweep-create';
      date: string;
      anchorMins: number;
      startMins: number;
      endMins: number;
    };

interface CreateSheetDraft {
  mode: 'event' | 'empty-zone' | 'reminder';
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  whyCategory: WhyCategory;
  manualWhy: boolean;
  customColor?: EventColorId;
  notes: string;
  alertOffsetMinutes?: number;
}

const DURATION_PRESETS: { label: string; mins: number }[] = [
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '45m', mins: 45 },
  { label: '1h', mins: 60 },
  { label: '1.5h', mins: 90 },
  { label: '2h', mins: 120 },
];

const QuickDurationRow: React.FC<{
  startTime: string;
  endTime: string;
  onSetEndTime: (nextEndTime: string) => void;
}> = ({ startTime, endTime, onSetEndTime }) => {
  const sMin = toMin(startTime);
  const eMin = Math.max(sMin + 5, toMin(endTime));
  const curDur = eMin - sMin;

  return (
    <div className="gcal-duration-row" aria-label="Quick event duration">
      {DURATION_PRESETS.map((p) => {
        const active = Math.abs(curDur - p.mins) <= 2;
        return (
          <button
            key={p.label}
            type="button"
            className={`gcal-pill-chip is-compact ${active ? 'is-active' : ''}`.trim()}
            onClick={() => onSetEndTime(fromMin(Math.min(24 * 60, sMin + p.mins)))}
          >
            {p.label}
          </button>
        );
      })}
      <button
        type="button"
        className="gcal-pill-chip is-compact"
        title="Extend end time by 30 minutes"
        onClick={() => onSetEndTime(fromMin(Math.min(24 * 60, eMin + 30)))}
      >
        +30m
      </button>
    </div>
  );
};

const EventEnrichmentFields: React.FC<{
  customColor?: EventColorId;
  notes?: string;
  alertOffsetMinutes?: number;
  onColorChange: (color: EventColorId | undefined) => void;
  onNotesChange: (notes: string) => void;
  onAlertChange: (offsetMins: number | undefined) => void;
}> = ({
  customColor,
  notes,
  alertOffsetMinutes,
  onColorChange,
  onNotesChange,
  onAlertChange,
}) => {
  const hasAlert = typeof alertOffsetMinutes === 'number';

  return (
    <div className="gcal-enrichment-group">
      {/* Custom Color Swatches (beyond the 'Why') */}
      <div className="gcal-field-block">
        <div className="gcal-field-label-row">
          <span className="gcal-field-label">Color</span>
          {customColor && (
            <span className="gcal-field-status">
              {EVENT_COLOR_OPTIONS.find((c) => c.id === customColor)?.label}
            </span>
          )}
        </div>
        <div className="gcal-color-row" role="radiogroup" aria-label="Event color">
          <button
            type="button"
            className={`gcal-color-auto ${!customColor ? 'is-active' : ''}`.trim()}
            onClick={() => onColorChange(undefined)}
            title="Use default Why color"
          >
            Why
          </button>
          {EVENT_COLOR_OPTIONS.map((opt) => {
            const selected = customColor === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Color: ${opt.label}`}
                title={opt.label}
                className={`gcal-color-dot ${selected ? 'is-selected' : ''}`.trim()}
                style={{ backgroundColor: opt.hex }}
                onClick={() => onColorChange(selected ? undefined : opt.id)}
              >
                {selected && <Check size={12} strokeWidth={3} color="#FFFFFF" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Description / Notes */}
      <div className="gcal-field-block">
        <textarea
          className="ui-textarea gcal-desc-input"
          rows={2}
          placeholder="Add description…"
          aria-label="Event description"
          value={notes ?? ''}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>

      {/* Alert Controls (At start OR earlier) */}
      <div className="gcal-field-block">
        <div className="gcal-field-label-row">
          <span className="gcal-field-label">
            <Bell size={12} />
            <span>Alert</span>
          </span>
          <span className={`gcal-field-status ${hasAlert ? 'is-on' : ''}`.trim()}>
            {hasAlert ? formatAlertOffsetShort(alertOffsetMinutes!) : 'Off'}
          </span>
        </div>
        <div className="gcal-alert-pills">
          {ALERT_PRESETS.map((p) => {
            const active =
              p.value === undefined ? !hasAlert : alertOffsetMinutes === p.value;
            return (
              <button
                key={p.label}
                type="button"
                className={`gcal-pill-chip is-compact ${active ? 'is-active' : ''}`.trim()}
                onClick={() => {
                  if (typeof p.value === 'number') {
                    requestNotificationPermissionIfNeeded();
                  }
                  onAlertChange(p.value);
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {hasAlert && (
          <div className="gcal-alert-custom-row">
            <span className="gcal-sheet-meta">Lead time:</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={10080}
              className="ui-input gcal-alert-mins-input"
              aria-label="Minutes before event for alert"
              value={alertOffsetMinutes}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  onAlertChange(0);
                  return;
                }
                const parsed = Math.max(0, Math.min(10080, Math.round(Number(raw) || 0)));
                onAlertChange(parsed);
              }}
            />
            <span className="gcal-sheet-meta">min before (0 = at start)</span>
          </div>
        )}
        {hasAlert && isIosDevice() && !isStandalonePwa() && (
          <div className="gcal-push-hint">
            Tip: Add Intuition to Home Screen via Safari Share to get alerts when the app is closed.
          </div>
        )}
      </div>
    </div>
  );
};

interface CalendarPaneProps {
  columns: string[];
  todayIso: string;
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
  activeDrag?: ActiveGridDrag | null;
  createPreview?: CreateSheetDraft | null;
  interactive?: boolean;
  onBlockPointerDown?: (e: React.PointerEvent, block: CalendarBlock) => void;
  onResizePointerDown?: (
    e: React.PointerEvent,
    block: CalendarBlock,
    edge: 'resize-start' | 'resize-end'
  ) => void;
  onReminderPointerDown?: (e: React.PointerEvent, rem: ReminderItem) => void;
  onOpenBlock: (id: string) => void;
  onOpenReminder: (id: string) => void;
}

const CalendarPane = memo<CalendarPaneProps>(
  ({
    columns,
    todayIso,
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
    activeDrag,
    createPreview,
    interactive = false,
    onBlockPointerDown,
    onResizePointerDown,
    onReminderPointerDown,
    onOpenBlock,
    onOpenReminder,
  }) => {
    const draggedBlockId =
      activeDrag && (activeDrag.kind === 'move-block' || activeDrag.kind === 'resize-start' || activeDrag.kind === 'resize-end')
        ? activeDrag.block.id
        : null;
    const draggedRemId =
      activeDrag && activeDrag.kind === 'move-reminder' ? activeDrag.reminder.id : null;

    return (
      <>
        {columns.map((iso) => {
          const laid = layoutColumn(blocks.filter((b) => b.date === iso));
          const dayReminders = reminders.filter((r) => r.date === iso);
          const showNow = iso === todayIso && nowMin >= startHour * 60 && nowMin <= endHour * 60;
          const targetDraftIso = liveDraft ? liveDraft.date ?? fallbackDraftIso : null;
          const draftOnThisDay = liveDraft && targetDraftIso === iso ? liveDraft : null;

          const activeBlockPreviewOnDay =
            interactive &&
            activeDrag &&
            (activeDrag.kind === 'move-block' ||
              activeDrag.kind === 'resize-start' ||
              activeDrag.kind === 'resize-end') &&
            activeDrag.date === iso
              ? activeDrag
              : null;

          const activeRemPreviewOnDay =
            interactive &&
            activeDrag &&
            activeDrag.kind === 'move-reminder' &&
            activeDrag.date === iso
              ? activeDrag
              : null;

          const sweepPreviewOnDay =
            interactive &&
            activeDrag &&
            activeDrag.kind === 'sweep-create' &&
            activeDrag.date === iso
              ? activeDrag
              : null;

          const sheetCreateOnDay =
            interactive && !sweepPreviewOnDay && createPreview && createPreview.date === iso
              ? createPreview
              : null;

          return (
            <div
              key={iso}
              data-iso={iso}
              className={`gcal-col ${iso === todayIso && isWeek ? 'is-today' : ''}`.trim()}
            >
              {laid.map(({ block, col, cols }) => {
                const isBeingDragged = interactive && draggedBlockId === block.id;
                const s = toMin(block.startTime);
                const e = Math.max(s + 10, toMin(block.endTime));
                const top = ((s - startHour * 60) / 60) * hourHeight;
                const nextInColStarts = laid
                  .filter((other) => other.col === col && toMin(other.block.startTime) >= e)
                  .map((other) => toMin(other.block.startTime));
                const nextStartMin = nextInColStarts.length ? Math.min(...nextInColStarts) : null;
                const maxAvailPx =
                  nextStartMin !== null
                    ? Math.max(11, ((nextStartMin - s) / 60) * hourHeight - 1.5)
                    : Infinity;
                const height = Math.min(
                  maxAvailPx,
                  Math.max(isWeek ? 18 : 22, ((e - s) / 60) * hourHeight - 2)
                );
                const isMicro = height < 20;
                const isSingleLine = isWeek ? height < 26 : height < 36;
                const roomy = !isWeek && height >= 42;
                const showTopHandle = interactive && !isBeingDragged && height >= 28;
                const showBottomHandle = interactive && !isBeingDragged;
                const hasSpaceBelow =
                  nextStartMin === null || ((nextStartMin - e) / 60) * hourHeight >= 8;
                const isSlotDraftTarget =
                  draftOnThisDay?.mode === 'fill-slot' && draftOnThisDay.targetBlockId === block.id;
                const isUpdateDraftTarget =
                  draftOnThisDay?.mode === 'update-event' &&
                  draftOnThisDay.targetBlockId === block.id;

                const effectiveBlock: CalendarBlock = isUpdateDraftTarget
                  ? {
                      ...block,
                      customColor: draftOnThisDay.customColor ?? block.customColor,
                      notes: draftOnThisDay.notes ?? block.notes,
                      alertOffsetMinutes:
                        draftOnThisDay.alertOffsetMinutes === null
                          ? undefined
                          : draftOnThisDay.alertOffsetMinutes ?? block.alertOffsetMinutes,
                    }
                  : block;

                const displayTitle = isSlotDraftTarget
                  ? draftOnThisDay.title
                    ? `Empty Zone — ${draftOnThisDay.title}`
                    : 'Empty Zone — ?'
                  : isWeek
                  ? shortTitle(effectiveBlock)
                  : effectiveBlock.title;
                const subLineText =
                  effectiveBlock.notes?.trim() || effectiveBlock.startingStepHint || '';
                const showSubLine = roomy && !isWeek && Boolean(subLineText) && height >= 58;
                const maxTitleLines = isSingleLine
                  ? 1
                  : isWeek
                  ? Math.max(1, Math.floor((height - 4) / 12))
                  : Math.max(
                      1,
                      Math.floor((height - (6 + (roomy ? 15 : 0) + (showSubLine ? 15 : 0))) / 15)
                    );

                return (
                  <div
                    key={block.id}
                    role="button"
                    tabIndex={0}
                    className={`gcal-ev ${eventClass(effectiveBlock)} ${
                      effectiveBlock.completed ? 'is-done' : ''
                    } ${isWeek ? 'is-compact' : ''} ${isMicro ? 'is-micro' : ''} ${
                      isSingleLine ? 'is-single-line' : ''
                    } ${
                      showBottomHandle && height < 38 && hasSpaceBelow ? 'is-small-expandable' : ''
                    } ${block.id === highlightId ? 'is-flash' : ''} ${
                      isSlotDraftTarget || isUpdateDraftTarget ? 'is-voice-slot-target' : ''
                    } ${isBeingDragged ? 'is-drag-origin' : ''}`.trim()}
                    style={{
                      top,
                      height,
                      left: `calc(${(col / cols) * 100}% + 1px)`,
                      width: `calc(${100 / cols}% - ${isWeek ? 2 : 4}px)`,
                    }}
                    onPointerDown={
                      interactive && onBlockPointerDown
                        ? (ev) => onBlockPointerDown(ev, block)
                        : undefined
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenBlock(block.id);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        onOpenBlock(block.id);
                      }
                    }}
                    title={`${effectiveBlock.title} (${effectiveBlock.startTime}–${effectiveBlock.endTime})`}
                  >
                    {showTopHandle && onResizePointerDown && (
                      <span
                        className="gcal-resize-handle is-top"
                        aria-label="Adjust start time"
                        onPointerDown={(ev) => onResizePointerDown(ev, block, 'resize-start')}
                      />
                    )}

                    <div className="gcal-ev-content">
                      <span
                        className={`gcal-ev-title ${
                          maxTitleLines === 1 ? 'is-clamp-1' : 'is-clamp-multi'
                        }`.trim()}
                        style={
                          maxTitleLines > 1 ? { WebkitLineClamp: maxTitleLines } : undefined
                        }
                      >
                        {effectiveBlock.completed && !isWeek && (
                          <Check size={11} strokeWidth={3} className="gcal-ev-inline-icon" />
                        )}
                        {typeof effectiveBlock.alertOffsetMinutes === 'number' && !isMicro && (
                          <span
                            className="gcal-ev-alert-pill"
                            title={`Alert: ${formatAlertOffsetShort(
                              effectiveBlock.alertOffsetMinutes
                            )}`}
                          >
                            <Bell size={9.5} strokeWidth={2.7} />
                            {!isWeek && effectiveBlock.alertOffsetMinutes > 0 && (
                              <span>
                                {formatAlertBadgeCompact(effectiveBlock.alertOffsetMinutes)}
                              </span>
                            )}
                          </span>
                        )}
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
                      {showSubLine && <span className="gcal-ev-sub">{subLineText}</span>}
                    </div>

                    {showBottomHandle && onResizePointerDown && (
                      <span
                        className={`gcal-resize-handle is-bottom ${
                          hasSpaceBelow ? 'is-outer' : ''
                        }`.trim()}
                        aria-label="Adjust end time"
                        onPointerDown={(ev) => onResizePointerDown(ev, block, 'resize-end')}
                      />
                    )}
                  </div>
                );
              })}

              {/* Live Moving / Resizing Block Preview */}
              {activeBlockPreviewOnDay && (() => {
                const s = activeBlockPreviewOnDay.startMins;
                const e = Math.max(s + 15, activeBlockPreviewOnDay.endMins);
                const top = ((s - startHour * 60) / 60) * hourHeight;
                const height = Math.max(isWeek ? 20 : 24, ((e - s) / 60) * hourHeight - 2);
                const blk = activeBlockPreviewOnDay.block;
                return (
                  <div
                    className={`gcal-ev ${eventClass(blk)} ${
                      isWeek ? 'is-compact' : ''
                    } is-dragging-live`.trim()}
                    style={{
                      top,
                      height,
                      left: '2px',
                      width: 'calc(100% - 4px)',
                    }}
                  >
                    <span className="gcal-ev-title">
                      {isWeek ? shortTitle(blk) : blk.title}
                    </span>
                    <span className="gcal-ev-time">
                      {fmtTime(fromMin(s))} – {fmtTime(fromMin(e))}
                    </span>
                  </div>
                );
              })()}

              {/* Live Sweep-Create or Tapped-Slot New Event Preview (Google Calendar style) */}
              {(sweepPreviewOnDay || sheetCreateOnDay) && (() => {
                const s = sweepPreviewOnDay
                  ? sweepPreviewOnDay.startMins
                  : toMin(sheetCreateOnDay!.startTime);
                const e = sweepPreviewOnDay
                  ? Math.max(s + 15, sweepPreviewOnDay.endMins)
                  : sheetCreateOnDay!.mode === 'reminder'
                  ? s + 30
                  : Math.max(s + 15, toMin(sheetCreateOnDay!.endTime));
                const top = ((s - startHour * 60) / 60) * hourHeight;
                const height = Math.max(isWeek ? 22 : 26, ((e - s) / 60) * hourHeight - 2);
                const previewTitle =
                  sheetCreateOnDay?.title.trim() || 'New event';
                const previewClass = sheetCreateOnDay?.customColor
                  ? `gcal-ev-color-${sheetCreateOnDay.customColor}`
                  : sheetCreateOnDay?.mode === 'empty-zone'
                  ? 'gcal-ev-zone'
                  : sheetCreateOnDay?.mode === 'reminder'
                  ? 'gcal-ev-organization'
                  : `gcal-ev-${(sheetCreateOnDay?.whyCategory || 'Organization').toLowerCase()}`;

                return (
                  <div
                    className={`gcal-ev ${previewClass} gcal-create-preview ${
                      isWeek ? 'is-compact' : ''
                    }`.trim()}
                    style={{
                      top,
                      height,
                      left: '2px',
                      width: 'calc(100% - 4px)',
                    }}
                  >
                    <span className="gcal-ev-title">
                      {typeof sheetCreateOnDay?.alertOffsetMinutes === 'number' && (
                        <span className="gcal-ev-alert-pill">
                          <Bell size={9.5} strokeWidth={2.7} />
                          {sheetCreateOnDay.alertOffsetMinutes > 0 && (
                            <span>
                              {formatAlertBadgeCompact(sheetCreateOnDay.alertOffsetMinutes)}
                            </span>
                          )}
                        </span>
                      )}
                      {previewTitle}
                    </span>
                    <span className="gcal-ev-time">
                      {sheetCreateOnDay?.mode === 'reminder'
                        ? fmtTime(fromMin(s))
                        : `${fmtTime(fromMin(s))} – ${fmtTime(fromMin(e))}`}
                    </span>
                  </div>
                );
              })()}

              {/* Live Progressive Voice Event / Empty-Zone Draft Block */}
              {draftOnThisDay &&
                (draftOnThisDay.mode === 'event' || draftOnThisDay.mode === 'empty-zone') &&
                draftOnThisDay.startTime && (() => {
                  const s = toMin(draftOnThisDay.startTime);
                  const hasEnd = Boolean(draftOnThisDay.endTime);
                  const e = hasEnd ? Math.max(s + 20, toMin(draftOnThisDay.endTime!)) : s + 60;
                  const top = ((s - startHour * 60) / 60) * hourHeight;
                  const height = Math.max(isWeek ? 26 : 48, ((e - s) / 60) * hourHeight - 2);
                  const toneClass = draftOnThisDay.customColor
                    ? `gcal-ev-color-${draftOnThisDay.customColor}`
                    : draftOnThisDay.mode === 'empty-zone'
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
                        {typeof draftOnThisDay.alertOffsetMinutes === 'number' && (
                          <span className="gcal-ev-alert-pill">
                            <Bell size={9.5} strokeWidth={2.7} />
                            {draftOnThisDay.alertOffsetMinutes > 0 && (
                              <span>
                                {formatAlertBadgeCompact(draftOnThisDay.alertOffsetMinutes)}
                              </span>
                            )}
                          </span>
                        )}
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
                      {draftOnThisDay.notes && !isWeek && (
                        <span className="gcal-ev-sub">{draftOnThisDay.notes}</span>
                      )}
                    </div>
                  );
                })()}

              {dayReminders.map((rem, idx) => {
                const isRemDragged = interactive && draggedRemId === rem.id;
                const isOhchsRot = rem.id.startsWith('ohchs-rot-');
                const ohchsTone = isOhchsRot
                  ? /^NO SCHOOL/i.test(rem.title)
                    ? 'is-ohchs-noschool'
                    : /^(GREEN|EN THURS)/i.test(rem.title)
                    ? 'is-ohchs-green'
                    : 'is-ohchs-gold'
                  : '';
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
                    className={`gcal-rem ${ohchsTone} ${rem.completed ? 'is-done' : ''} ${
                      isWeek ? 'is-compact' : ''
                    } ${rem.id === highlightId ? 'is-flash' : ''} ${
                      isRemDragged ? 'is-drag-origin' : ''
                    }`.trim()}
                    style={{ top }}
                    onPointerDown={
                      interactive && onReminderPointerDown
                        ? (ev) => onReminderPointerDown(ev, rem)
                        : undefined
                    }
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenReminder(rem.id);
                    }}
                    title={isOhchsRot ? rem.title : `Reminder: ${rem.title} (${fmtTime(rem.time)})`}
                  >
                    {!isOhchsRot &&
                      (rem.completed ? <Check size={10} strokeWidth={3} /> : <Bell size={10} />)}
                    <span className="gcal-rem-title">{rem.title}</span>
                    {!isWeek && !isOhchsRot && (
                      <span className="gcal-rem-time">{fmtTime(rem.time)}</span>
                    )}
                  </button>
                );
              })}

              {/* Live Moving Reminder Preview */}
              {activeRemPreviewOnDay && (
                <div
                  className={`gcal-rem ${isWeek ? 'is-compact' : ''} is-dragging-live`.trim()}
                  style={{
                    top:
                      ((activeRemPreviewOnDay.timeMins - startHour * 60) / 60) * hourHeight,
                  }}
                >
                  <Bell size={10} />
                  <span className="gcal-rem-title">
                    {activeRemPreviewOnDay.reminder.title}
                  </span>
                  <span className="gcal-rem-time">
                    {fmtTime(fromMin(activeRemPreviewOnDay.timeMins))}
                  </span>
                </div>
              )}

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
                    <span className="gcal-rem-title">{draftOnThisDay.title || '?'}</span>
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
  const { state, actions, todayIso } = useOpsStore();
  const isWeek = state.scheduleViewMode === 'week';
  const stepDays = isWeek ? 7 : 1;
  const hourHeight = isWeek ? 44 : 56;

  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [openReminderId, setOpenReminderId] = useState<string | null>(null);
  const [localFlashId, setLocalFlashId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateSheetDraft | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveGridDrag | null>(null);

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
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const prevModeRef = useRef(state.scheduleViewMode);
  const suppressClickUntilRef = useRef(0);
  const wheelCooldownRef = useRef(0);
  const animTimerRef = useRef<number | null>(null);
  const animTargetIsoRef = useRef<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  const activeDragRef = useRef<ActiveGridDrag | null>(null);
  activeDragRef.current = activeDrag;

  const lastPointerClientRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Unified gesture tracker for swipe-navigation, empty-slot tap/sweep-create, and block/reminder move/resize
  const gestureRef = useRef<{
    pointerId: number;
    pointerType: string;
    captured: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    vx: number;
    axis: 'none' | 'x' | 'y';
    stageWidth: number;
    originKind: 'empty' | 'block' | 'reminder' | 'resize';
    targetBlock?: CalendarBlock;
    targetReminder?: ReminderItem;
    resizeEdge?: 'resize-start' | 'resize-end';
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!localFlashId) return;
    const t = window.setTimeout(() => setLocalFlashId(null), 2600);
    return () => window.clearTimeout(t);
  }, [localFlashId]);

  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) window.clearTimeout(animTimerRef.current);
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      if (autoScrollRafRef.current !== null) window.cancelAnimationFrame(autoScrollRafRef.current);
    };
  }, []);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

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

  const currColumnsRef = useRef(currColumns);
  currColumnsRef.current = currColumns;
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;

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

  // Full 24-hour day (12 AM through 12 AM) so hours before 8 AM and through midnight are never cut off
  const startHour = 0;
  const endHour = 24;
  const hourTicks = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    []
  );
  const gridHeight = (endHour - startHour) * hourHeight;

  const todayIsoRef = useRef(todayIso);
  todayIsoRef.current = todayIso;

  /** Maps viewport `(clientX, clientY)` to exact `(date, rawMinutes)` on the active calendar pane. */
  const resolveGridPoint = useCallback((clientX: number, clientY: number) => {
    const stageEl = stageRef.current;
    const cols = currColumnsRef.current;
    const hh = hourHeightRef.current;
    if (!stageEl || cols.length === 0) {
      return { date: cols[0] || todayIsoRef.current, rawMins: 9 * 60 };
    }
    const rect = stageEl.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    const colIdx = Math.max(
      0,
      Math.min(cols.length - 1, Math.floor((relX / Math.max(1, rect.width)) * cols.length))
    );
    const rawMins = Math.max(0, Math.min(24 * 60, (relY / hh) * 60));
    return { date: cols[colIdx], rawMins };
  }, []);

  /** Updates `activeDrag` state from current pointer coordinates. */
  const updateDragFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const cur = activeDragRef.current;
      if (!cur) return;
      const { date, rawMins } = resolveGridPoint(clientX, clientY);

      if (cur.kind === 'move-block') {
        const nextStart = Math.max(
          0,
          Math.min(24 * 60 - cur.durationMins, snapMin(rawMins - cur.grabOffsetMins, 15))
        );
        const nextEnd = nextStart + cur.durationMins;
        if (nextStart !== cur.startMins || date !== cur.date) {
          setActiveDrag({ ...cur, date, startMins: nextStart, endMins: nextEnd });
        }
      } else if (cur.kind === 'resize-start') {
        const nextStart = Math.max(0, Math.min(cur.endMins - 15, snapMin(rawMins, 15)));
        if (nextStart !== cur.startMins) {
          setActiveDrag({ ...cur, startMins: nextStart });
        }
      } else if (cur.kind === 'resize-end') {
        const nextEnd = Math.max(cur.startMins + 15, Math.min(24 * 60, snapMin(rawMins, 15)));
        if (nextEnd !== cur.endMins) {
          setActiveDrag({ ...cur, endMins: nextEnd });
        }
      } else if (cur.kind === 'move-reminder') {
        const nextMins = Math.max(0, Math.min(23 * 60 + 45, snapMin(rawMins, 15)));
        if (nextMins !== cur.timeMins || date !== cur.date) {
          setActiveDrag({ ...cur, date, timeMins: nextMins });
        }
      } else if (cur.kind === 'sweep-create') {
        const snapped = snapMin(rawMins, 15);
        const lo = Math.max(0, Math.min(cur.anchorMins, snapped));
        const hi = Math.min(24 * 60, Math.max(cur.anchorMins + 30, snapped));
        if (lo !== cur.startMins || hi !== cur.endMins) {
          setActiveDrag({ ...cur, startMins: lo, endMins: hi });
        }
      }
    },
    [resolveGridPoint]
  );

  // Prevent browser native touch scrolling & run smooth edge auto-scroll whenever an item drag/resize/sweep is active
  useEffect(() => {
    if (!activeDrag) {
      if (scrollRef.current) scrollRef.current.style.overflowY = '';
      return;
    }

    if (scrollRef.current) scrollRef.current.style.overflowY = 'hidden';

    const stopNativeScroll = (ev: TouchEvent) => {
      ev.preventDefault();
    };
    document.addEventListener('touchmove', stopNativeScroll, { passive: false });

    const tickEdgeScroll = () => {
      const scroller = scrollRef.current;
      if (scroller && activeDragRef.current) {
        const r = scroller.getBoundingClientRect();
        const py = lastPointerClientRef.current.y;
        let delta = 0;
        if (py < r.top + 46) {
          delta = -Math.ceil(((r.top + 46 - py) / 46) * 8);
        } else if (py > r.bottom - 68) {
          delta = Math.ceil(((py - (r.bottom - 68)) / 68) * 8);
        }
        if (delta !== 0) {
          const prevTop = scroller.scrollTop;
          scroller.scrollTop = Math.max(0, prevTop + delta);
          if (scroller.scrollTop !== prevTop) {
            updateDragFromClientPoint(
              lastPointerClientRef.current.x,
              lastPointerClientRef.current.y
            );
          }
        }
      }
      autoScrollRafRef.current = window.requestAnimationFrame(tickEdgeScroll);
    };
    autoScrollRafRef.current = window.requestAnimationFrame(tickEdgeScroll);

    return () => {
      document.removeEventListener('touchmove', stopNativeScroll);
      if (autoScrollRafRef.current !== null) {
        window.cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
      if (scrollRef.current) scrollRef.current.style.overflowY = '';
    };
  }, [Boolean(activeDrag), updateDragFromClientPoint]);

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
    const currRems = windowReminders.filter((r) => currColumns.includes(r.date));
    const mins = [
      ...currBlocks.map((b) => toMin(b.startTime)),
      ...currRems.map((r) => toMin(r.time)),
    ];
    const firstMin = mins.length ? Math.min(...mins) : 8 * 60;
    const target = ((firstMin - startHour * 60) / 60) * hourHeight - 16;
    scrollRef.current.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scheduleViewMode]);

  const dayIdx = Math.max(0, headerWeekDates.indexOf(headerIso));
  const zoomOrigin = `${((dayIdx + 0.5) / 7) * 100}% 0`;

  const effectiveHighlightId = highlightId || localFlashId;

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
        .filter((i) => i.status === 'active' && !getBlockingBottleneck(i, state.ideas))
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
    if (performance.now() < suppressClickUntilRef.current || activeDragRef.current) return;
    setCreateDraft(null);
    setOpenReminderId(null);
    setOpenBlockId(id);
  }, []);

  const handleOpenReminder = useCallback((id: string) => {
    if (performance.now() < suppressClickUntilRef.current || activeDragRef.current) return;
    setCreateDraft(null);
    setOpenBlockId(null);
    setOpenReminderId(id);
  }, []);

  useEffect(() => {
    const onExternalOpenBlock = (ev: Event) => {
      const detail = (ev as CustomEvent<{ blockId?: string }>).detail;
      if (detail?.blockId) {
        setCreateDraft(null);
        setOpenReminderId(null);
        setOpenBlockId(detail.blockId);
      }
    };
    window.addEventListener('intuition:open-block', onExternalOpenBlock);
    return () => window.removeEventListener('intuition:open-block', onExternalOpenBlock);
  }, []);

  const openNewEventSheet = useCallback((date: string, startMins: number, endMins: number) => {
    const clampedStart = Math.max(0, Math.min(23 * 60 + 30, startMins));
    const clampedEnd = Math.max(clampedStart + 15, Math.min(24 * 60, endMins));
    setOpenBlockId(null);
    setOpenReminderId(null);
    setCreateDraft({
      mode: 'event',
      title: '',
      date,
      startTime: fromMin(clampedStart),
      endTime: fromMin(clampedEnd),
      whyCategory: 'Organization',
      manualWhy: false,
      customColor: undefined,
      notes: '',
      alertOffsetMinutes: undefined,
    });
    window.setTimeout(() => createInputRef.current?.focus({ preventScroll: true }), 40);
  }, []);

  const commitNewEventDraft = () => {
    if (!createDraft) return;
    const rawTitle = createDraft.title.trim();
    const trimmedNotes = createDraft.notes.trim() || undefined;

    if (createDraft.mode === 'reminder') {
      const remId = actions.addReminder({
        date: createDraft.date,
        time: createDraft.startTime,
        title: rawTitle || 'Reminder',
        completed: false,
      });
      setLocalFlashId(remId);
      setCreateDraft(null);
      return;
    }

    if (typeof createDraft.alertOffsetMinutes === 'number') {
      requestNotificationPermissionIfNeeded();
    }

    if (createDraft.mode === 'empty-zone') {
      const zoneTitle = rawTitle
        ? /^empty zone/i.test(rawTitle)
          ? rawTitle
          : `Empty Zone — ${rawTitle}`
        : 'Empty Zone — Open Focus Slot';
      const id = actions.addCalendarBlock({
        date: createDraft.date,
        startTime: createDraft.startTime,
        endTime:
          toMin(createDraft.endTime) > toMin(createDraft.startTime)
            ? createDraft.endTime
            : fromMin(toMin(createDraft.startTime) + 60),
        title: zoneTitle,
        kind: 'empty-zone',
        completed: false,
        customColor: createDraft.customColor,
        notes: trimmedNotes,
        alertOffsetMinutes: createDraft.alertOffsetMinutes,
      });
      setLocalFlashId(id);
      setCreateDraft(null);
      return;
    }

    const finalTitle = rawTitle || 'New Event';
    const whyCat = createDraft.manualWhy
      ? createDraft.whyCategory
      : inferWhyFromTitle(finalTitle);
    const id = actions.addCalendarBlock({
      date: createDraft.date,
      startTime: createDraft.startTime,
      endTime:
        toMin(createDraft.endTime) > toMin(createDraft.startTime)
          ? createDraft.endTime
          : fromMin(toMin(createDraft.startTime) + 60),
      title: finalTitle,
      kind: 'baseline',
      completed: false,
      whyCategory: whyCat,
      customColor: createDraft.customColor,
      notes: trimmedNotes,
      alertOffsetMinutes: createDraft.alertOffsetMinutes,
    });
    setLocalFlashId(id);
    setCreateDraft(null);
  };

  /** Start moving an existing event block (long-press on touch, drag >=5px on mouse). */
  const engageMoveBlock = useCallback(
    (block: CalendarBlock, clientX: number, clientY: number) => {
      const { rawMins } = resolveGridPoint(clientX, clientY);
      const origStart = toMin(block.startTime);
      const origEnd = Math.max(origStart + 15, toMin(block.endTime));
      const duration = origEnd - origStart;
      const grabOffset = Math.max(0, Math.min(duration, rawMins - origStart));
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
      setCreateDraft(null);
      setActiveDrag({
        kind: 'move-block',
        block,
        grabOffsetMins: grabOffset,
        durationMins: duration,
        date: block.date,
        startMins: origStart,
        endMins: origEnd,
      });
    },
    [resolveGridPoint]
  );

  const engageMoveReminder = useCallback((rem: ReminderItem) => {
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    setCreateDraft(null);
    setActiveDrag({
      kind: 'move-reminder',
      reminder: rem,
      date: rem.date,
      timeMins: toMin(rem.time),
    });
  }, []);

  const engageSweepCreate = useCallback(
    (clientX: number, clientY: number) => {
      const { date, rawMins } = resolveGridPoint(clientX, clientY);
      const anchor = Math.max(0, Math.min(23 * 60 + 30, Math.floor(rawMins / 30) * 30));
      try {
        navigator.vibrate?.(10);
      } catch {
        /* ignore */
      }
      setCreateDraft(null);
      setActiveDrag({
        kind: 'sweep-create',
        date,
        anchorMins: anchor,
        startMins: anchor,
        endMins: Math.min(24 * 60, anchor + 60),
      });
    },
    [resolveGridPoint]
  );

  const handleBlockPointerDown = useCallback(
    (e: React.PointerEvent, block: CalendarBlock) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      finalizePendingGlide();
      clearHoldTimer();

      const clientX = e.clientX;
      const clientY = e.clientY;
      lastPointerClientRef.current = { x: clientX, y: clientY };

      gestureRef.current = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        captured: false,
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastTime: performance.now(),
        vx: 0,
        axis: 'none',
        stageWidth: stageRef.current?.clientWidth || 320,
        originKind: 'block',
        targetBlock: block,
      };

      // Require an intentional press-and-hold (380ms) before lifting to move an event
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        if (
          gestureRef.current?.originKind === 'block' &&
          gestureRef.current.axis === 'none' &&
          gestureRef.current.targetBlock
        ) {
          if (scrollRef.current) {
            try {
              scrollRef.current.setPointerCapture(e.pointerId);
              gestureRef.current.captured = true;
            } catch {
              /* ignore */
            }
          }
          engageMoveBlock(block, lastPointerClientRef.current.x, lastPointerClientRef.current.y);
        }
      }, LONG_PRESS_MS);
    },
    [finalizePendingGlide, engageMoveBlock]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, block: CalendarBlock, edge: 'resize-start' | 'resize-end') => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      finalizePendingGlide();
      clearHoldTimer();

      const pointerId = e.pointerId;
      lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
      const origStart = toMin(block.startTime);
      const origEnd = Math.max(origStart + 15, toMin(block.endTime));

      gestureRef.current = {
        pointerId,
        pointerType: e.pointerType,
        captured: false,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastTime: performance.now(),
        vx: 0,
        axis: 'none',
        stageWidth: stageRef.current?.clientWidth || 320,
        originKind: 'resize',
        targetBlock: block,
        resizeEdge: edge,
      };

      // Require holding the event edge (380ms) before unlocking start/end time resize
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        if (
          gestureRef.current?.originKind === 'resize' &&
          gestureRef.current.axis === 'none' &&
          gestureRef.current.targetBlock
        ) {
          if (scrollRef.current) {
            try {
              scrollRef.current.setPointerCapture(pointerId);
              gestureRef.current.captured = true;
            } catch {
              /* ignore */
            }
          }
          try {
            navigator.vibrate?.(10);
          } catch {
            /* ignore */
          }
          setCreateDraft(null);
          setActiveDrag({
            kind: edge,
            block,
            date: block.date,
            startMins: origStart,
            endMins: origEnd,
          });
        }
      }, LONG_PRESS_MS);
    },
    [finalizePendingGlide]
  );

  const handleReminderPointerDown = useCallback(
    (e: React.PointerEvent, rem: ReminderItem) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      finalizePendingGlide();
      clearHoldTimer();

      const pointerId = e.pointerId;
      lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
      gestureRef.current = {
        pointerId,
        pointerType: e.pointerType,
        captured: false,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastTime: performance.now(),
        vx: 0,
        axis: 'none',
        stageWidth: stageRef.current?.clientWidth || 320,
        originKind: 'reminder',
        targetReminder: rem,
      };

      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        if (
          gestureRef.current?.originKind === 'reminder' &&
          gestureRef.current.axis === 'none' &&
          gestureRef.current.targetReminder
        ) {
          if (scrollRef.current) {
            try {
              scrollRef.current.setPointerCapture(pointerId);
              gestureRef.current.captured = true;
            } catch {
              /* ignore */
            }
          }
          engageMoveReminder(rem);
        }
      }, LONG_PRESS_MS);
    },
    [finalizePendingGlide, engageMoveReminder]
  );

  const onScrollPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('.gcal-hours')) return;

    finalizePendingGlide();
    clearHoldTimer();

    const pointerId = e.pointerId;
    const clientX = e.clientX;
    const clientY = e.clientY;
    lastPointerClientRef.current = { x: clientX, y: clientY };

    gestureRef.current = {
      pointerId,
      pointerType: e.pointerType,
      captured: false,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastTime: performance.now(),
      vx: 0,
      axis: 'none',
      stageWidth: stageRef.current?.clientWidth || 320,
      originKind: 'empty',
    };

    // Require holding the empty calendar background (380ms) to create/sweep a new event (never on quick tap!)
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (gestureRef.current?.originKind === 'empty' && gestureRef.current.axis === 'none') {
        if (scrollRef.current) {
          try {
            scrollRef.current.setPointerCapture(pointerId);
            gestureRef.current.captured = true;
          } catch {
            /* ignore */
          }
        }
        engageSweepCreate(lastPointerClientRef.current.x, lastPointerClientRef.current.y);
      }
    }, LONG_PRESS_MS);
  };

  const onScrollPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;

    const x = e.clientX;
    const y = e.clientY;
    lastPointerClientRef.current = { x, y };
    const dx = x - g.startX;
    const dy = y - g.startY;
    const dist = Math.hypot(dx, dy);

    // 1. Once hold has unlocked active drag/resize/sweep, update live grid coordinates!
    if (activeDragRef.current) {
      if (!g.captured && scrollRef.current) {
        try {
          scrollRef.current.setPointerCapture(g.pointerId);
          g.captured = true;
        } catch {
          /* ignore */
        }
      }
      updateDragFromClientPoint(x, y);
      return;
    }

    // 2. Require larger movement slop (14px) when finger/mouse started on an event or reminder
    //    so taps with slight thumb roll NEVER get hijacked as a day-swipe or suppressed!
    if (g.axis === 'none') {
      const slopPx = g.originKind === 'empty' ? 7 : 14;
      if (dist < slopPx) return;
      clearHoldTimer();
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
      if (g.axis === 'x') {
        if (!g.captured && scrollRef.current) {
          try {
            scrollRef.current.setPointerCapture(g.pointerId);
            g.captured = true;
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

    if (g.axis !== 'x') return;

    const now = performance.now();
    const dt = Math.max(1, now - g.lastTime);
    g.vx = (x - g.lastX) / dt;
    g.lastX = x;
    g.lastTime = now;

    const clampedDx = Math.max(-g.stageWidth, Math.min(g.stageWidth, dx));
    const progress = Math.min(1, Math.abs(clampedDx) / g.stageWidth);

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

  const finishScrollPointerGesture = (
    e: React.PointerEvent<HTMLDivElement>,
    cancelled = false
  ) => {
    clearHoldTimer();
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gestureRef.current = null;

    if (g.captured && scrollRef.current) {
      try {
        scrollRef.current.releasePointerCapture(g.pointerId);
      } catch {
        /* ignore */
      }
    }

    // 1. Finalize active block/reminder move, resize, or sweep-create!
    const drag = activeDragRef.current;
    if (drag) {
      suppressClickUntilRef.current = performance.now() + 340;
      setActiveDrag(null);

      if (!cancelled) {
        if (drag.kind === 'move-block' || drag.kind === 'resize-start' || drag.kind === 'resize-end') {
          const nextStart = fromMin(drag.startMins);
          const nextEnd = fromMin(drag.endMins);
          if (
            drag.date !== drag.block.date ||
            nextStart !== drag.block.startTime ||
            nextEnd !== drag.block.endTime
          ) {
            actions.updateCalendarBlock(drag.block.id, {
              date: drag.date,
              startTime: nextStart,
              endTime: nextEnd,
            });
            setLocalFlashId(drag.block.id);
          }
        } else if (drag.kind === 'move-reminder') {
          const nextTime = fromMin(drag.timeMins);
          if (drag.date !== drag.reminder.date || nextTime !== drag.reminder.time) {
            actions.updateReminder(drag.reminder.id, {
              date: drag.date,
              time: nextTime,
            });
            setLocalFlashId(drag.reminder.id);
          }
        } else if (drag.kind === 'sweep-create') {
          openNewEventSheet(drag.date, drag.startMins, drag.endMins);
        }
      }
      return;
    }

    if (scrollRef.current) scrollRef.current.style.overflowY = '';

    // 2. Direct tap-open guarantee for ALL event & reminder sizes (even 5m/10m/15m/30m micro chips):
    //    If pointerdown landed on a block, resize edge, or reminder and released without dragging/swiping,
    //    open its edit sheet immediately even if :active scale or thumb roll shifted pointerup slightly!
    if (!cancelled && g.axis === 'none') {
      if ((g.originKind === 'block' || g.originKind === 'resize') && g.targetBlock) {
        handleOpenBlock(g.targetBlock.id);
      } else if (g.originKind === 'reminder' && g.targetReminder) {
        handleOpenReminder(g.targetReminder.id);
      }
      return;
    }

    // Finalize horizontal day/week carousel swipe (quick taps on empty space never create events by accident)
    if (g.axis !== 'x') return;

    suppressClickUntilRef.current = performance.now() + 320;
    const dx = cancelled ? 0 : e.clientX - g.startX;
    const distancePass = !cancelled && Math.abs(dx) > g.stageWidth * 0.22;
    const flickPass =
      !cancelled && Math.abs(dx) > 22 && Math.abs(g.vx) > 0.32 && Math.sign(dx) === Math.sign(g.vx);

    if (distancePass || flickPass) {
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      executeGlide(dir, addDaysISO(state.selectedDate, dir * stepDays));
      return;
    }

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
    if (activeDragRef.current) return;
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
            {(isWeek ? !headerWeekDates.includes(todayIso) : headerIso !== todayIso) && (
              <button
                type="button"
                className="gcal-today-btn"
                onClick={() => {
                  finalizePendingGlide();
                  actions.setSelectedDate(todayIso);
                }}
              >
                Today
              </button>
            )}
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
            const isToday = iso === todayIso;
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
        className={`gcal-scroll ${activeDrag ? 'is-dragging-grid' : ''}`.trim()}
        onPointerDown={onScrollPointerDown}
        onPointerMove={onScrollPointerMove}
        onPointerUp={(e) => finishScrollPointerGesture(e, false)}
        onPointerCancel={(e) => finishScrollPointerGesture(e, true)}
        onWheel={onWheel}
      >
        {liveDraft && !liveDraft.startTime && (
          <div
            className={`gcal-floating-draft ${
              liveDraft.mode === 'reminder'
                ? 'is-reminder'
                : liveDraft.customColor
                ? `gcal-ev-color-${liveDraft.customColor}`
                : liveDraft.mode === 'empty-zone'
                ? 'gcal-ev-zone'
                : `gcal-ev-${(liveDraft.whyCategory || 'Organization').toLowerCase()}`
            }`.trim()}
          >
            <span className="gcal-ev-title">
              {typeof liveDraft.alertOffsetMinutes === 'number' && (
                <span className="gcal-ev-alert-pill">
                  <Bell size={9.5} strokeWidth={2.7} />
                  {liveDraft.alertOffsetMinutes > 0 && (
                    <span>{formatAlertBadgeCompact(liveDraft.alertOffsetMinutes)}</span>
                  )}
                </span>
              )}
              {liveDraft.title || '?'}
            </span>
            <span className="gcal-ev-time">
              {liveDraft.date ? formatShortDate(liveDraft.date) : 'Day ?'} ·{' '}
              {liveDraft.mode === 'reminder' ? 'Time ?' : '? – ?'}
            </span>
          </div>
        )}
        <div className="gcal-body" style={{ height: gridHeight }}>
          {/* Protected fixed-width time gutter */}
          <div className="gcal-gutter gcal-hours">
            {hourTicks.map((h, i) => (
              <div key={h} className="gcal-hour-label" style={{ top: i * hourHeight }}>
                {fmtHourLabel(h)}
              </div>
            ))}
          </div>

          {/* Clipped stage strictly to the right of the hour labels */}
          <div ref={stageRef} className="gcal-stage">
            <div className="gcal-hlines" aria-hidden="true">
              {hourTicks.map((h, i) => (
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
                    todayIso={todayIso}
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
                    todayIso={todayIso}
                    isWeek={isWeek}
                    startHour={startHour}
                    endHour={endHour}
                    hourHeight={hourHeight}
                    nowMin={nowMin}
                    blocks={windowBlocks}
                    reminders={windowReminders}
                    highlightId={effectiveHighlightId}
                    liveDraft={liveDraft}
                    fallbackDraftIso={state.selectedDate}
                    activeDrag={activeDrag}
                    createPreview={createDraft}
                    interactive
                    onBlockPointerDown={handleBlockPointerDown}
                    onResizePointerDown={handleResizePointerDown}
                    onReminderPointerDown={handleReminderPointerDown}
                    onOpenBlock={handleOpenBlock}
                    onOpenReminder={handleOpenReminder}
                  />
                </div>

                <div ref={nextPaneRef} className="gcal-pane" aria-hidden="true">
                  <CalendarPane
                    columns={nextColumns}
                    todayIso={todayIso}
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

      {/* Google Calendar-style Tap/Sweep New Event Creation Sheet */}
      {createDraft &&
        createPortal(
          <div
            className="gcal-sheet-scrim is-light"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCreateDraft(null);
            }}
          >
            <form
              className="gcal-sheet"
              role="dialog"
              aria-label="New calendar item"
              onSubmit={(e) => {
                e.preventDefault();
                commitNewEventDraft();
              }}
            >
              <div className="gcal-sheet-grip" />
              <div className="ops-row-between" style={{ gap: 8 }}>
                <input
                  ref={createInputRef}
                  className="gcal-create-title-input"
                  value={createDraft.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCreateDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            title: val,
                            whyCategory: prev.manualWhy
                              ? prev.whyCategory
                              : inferWhyFromTitle(val || 'Event'),
                          }
                        : prev
                    );
                  }}
                  placeholder={
                    createDraft.mode === 'reminder'
                      ? 'Add reminder…'
                      : createDraft.mode === 'empty-zone'
                      ? 'Focus slot topic (optional)…'
                      : 'Add title'
                  }
                  aria-label="Event title"
                  enterKeyHint="done"
                />
                <button
                  type="button"
                  className="ui-command-mic"
                  aria-label="Cancel new event"
                  onClick={() => setCreateDraft(null)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="gcal-type-pills" style={{ marginTop: 12 }}>
                {(['event', 'empty-zone', 'reminder'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`gcal-pill-chip ${createDraft.mode === m ? 'is-active' : ''}`.trim()}
                    onClick={() => setCreateDraft((prev) => (prev ? { ...prev, mode: m } : prev))}
                  >
                    {m === 'event' ? 'Event' : m === 'empty-zone' ? 'Focus Slot' : 'Reminder'}
                  </button>
                ))}
              </div>

              <div className="gcal-inline-time-row" style={{ marginTop: 12 }}>
                <input
                  type="date"
                  className="ui-input gcal-compact-field"
                  aria-label="Date"
                  value={createDraft.date}
                  onChange={(e) =>
                    e.target.value &&
                    setCreateDraft((prev) => (prev ? { ...prev, date: e.target.value } : prev))
                  }
                />
                <input
                  type="time"
                  className="ui-input gcal-compact-field"
                  aria-label="Start time"
                  value={createDraft.startTime === '24:00' ? '23:59' : createDraft.startTime}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    if (!nextStart) return;
                    setCreateDraft((prev) => {
                      if (!prev) return prev;
                      const sMin = toMin(nextStart);
                      const eMin = toMin(prev.endTime);
                      return {
                        ...prev,
                        startTime: nextStart,
                        endTime: eMin <= sMin ? fromMin(Math.min(24 * 60, sMin + 60)) : prev.endTime,
                      };
                    });
                  }}
                />
                {createDraft.mode !== 'reminder' && (
                  <>
                    <span className="gcal-sheet-meta">–</span>
                    <input
                      type="time"
                      className="ui-input gcal-compact-field"
                      aria-label="End time"
                      value={createDraft.endTime === '24:00' ? '23:59' : createDraft.endTime}
                      onChange={(e) =>
                        e.target.value &&
                        setCreateDraft((prev) => (prev ? { ...prev, endTime: e.target.value } : prev))
                      }
                    />
                  </>
                )}
              </div>

              {createDraft.mode !== 'reminder' && (
                <QuickDurationRow
                  startTime={createDraft.startTime}
                  endTime={createDraft.endTime}
                  onSetEndTime={(nextEndTime) =>
                    setCreateDraft((prev) => (prev ? { ...prev, endTime: nextEndTime } : prev))
                  }
                />
              )}

              {createDraft.mode === 'event' && (
                <div className="gcal-type-pills" style={{ marginTop: 10 }}>
                  {WHY_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`gcal-pill-chip is-why-${cat.toLowerCase()} ${
                        createDraft.whyCategory === cat ? 'is-active' : ''
                      }`.trim()}
                      onClick={() =>
                        setCreateDraft((prev) =>
                          prev ? { ...prev, whyCategory: cat, manualWhy: true } : prev
                        )
                      }
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {createDraft.mode !== 'reminder' && (
                <EventEnrichmentFields
                  customColor={createDraft.customColor}
                  notes={createDraft.notes}
                  alertOffsetMinutes={createDraft.alertOffsetMinutes}
                  onColorChange={(customColor) =>
                    setCreateDraft((prev) => (prev ? { ...prev, customColor } : prev))
                  }
                  onNotesChange={(notes) =>
                    setCreateDraft((prev) => (prev ? { ...prev, notes } : prev))
                  }
                  onAlertChange={(alertOffsetMinutes) =>
                    setCreateDraft((prev) => (prev ? { ...prev, alertOffsetMinutes } : prev))
                  }
                />
              )}

              <div className="gcal-sheet-actions">
                <Button variant="primary" size="lg" fullWidth type="submit">
                  Save
                </Button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {/* Event detail & inline-edit sheet (Google Calendar-style) */}
      {openBlock &&
        createPortal(
          <div
            className="gcal-sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpenBlockId(null);
            }}
          >
            <div className="gcal-sheet" role="dialog" aria-label={openBlock.title}>
              <div className="gcal-sheet-grip" />
              <div className="ops-row-between" style={{ alignItems: 'center', gap: 10 }}>
                <div
                  className="ops-row"
                  style={{ alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}
                >
                  <span className={`gcal-swatch ${eventClass(openBlock)}`} style={{ marginTop: 0 }} />
                  <input
                    className="gcal-create-title-input"
                    value={openBlock.title}
                    aria-label="Edit event title"
                    enterKeyHint="done"
                    onChange={(e) =>
                      actions.updateCalendarBlock(openBlock.id, { title: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
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

              <div className="gcal-inline-time-row" style={{ marginTop: 12 }}>
                <input
                  type="date"
                  className="ui-input gcal-compact-field"
                  aria-label="Event date"
                  value={openBlock.date}
                  onChange={(e) =>
                    e.target.value &&
                    actions.updateCalendarBlock(openBlock.id, { date: e.target.value })
                  }
                />
                <input
                  type="time"
                  className="ui-input gcal-compact-field"
                  aria-label="Event start time"
                  value={openBlock.startTime === '24:00' ? '23:59' : openBlock.startTime}
                  onChange={(e) =>
                    e.target.value &&
                    actions.updateCalendarBlock(openBlock.id, { startTime: e.target.value })
                  }
                />
                <span className="gcal-sheet-meta">–</span>
                <input
                  type="time"
                  className="ui-input gcal-compact-field"
                  aria-label="Event end time"
                  value={openBlock.endTime === '24:00' ? '23:59' : openBlock.endTime}
                  onChange={(e) =>
                    e.target.value &&
                    actions.updateCalendarBlock(openBlock.id, { endTime: e.target.value })
                  }
                />
              </div>

              <QuickDurationRow
                startTime={openBlock.startTime}
                endTime={openBlock.endTime}
                onSetEndTime={(nextEndTime) =>
                  actions.updateCalendarBlock(openBlock.id, { endTime: nextEndTime })
                }
              />

              {openBlock.kind === 'baseline' && (
                <div className="gcal-type-pills" style={{ marginTop: 10 }}>
                  {WHY_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`gcal-pill-chip is-why-${cat.toLowerCase()} ${
                        (openBlock.whyCategory || 'Organization') === cat ? 'is-active' : ''
                      }`.trim()}
                      onClick={() =>
                        actions.updateCalendarBlock(openBlock.id, { whyCategory: cat })
                      }
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <EventEnrichmentFields
                customColor={openBlock.customColor}
                notes={openBlock.notes}
                alertOffsetMinutes={openBlock.alertOffsetMinutes}
                onColorChange={(customColor) =>
                  actions.updateCalendarBlock(openBlock.id, { customColor })
                }
                onNotesChange={(notes) =>
                  actions.updateCalendarBlock(openBlock.id, { notes })
                }
                onAlertChange={(alertOffsetMinutes) =>
                  actions.updateCalendarBlock(openBlock.id, { alertOffsetMinutes })
                }
              />

              <div className="ops-stack-sm" style={{ marginTop: 10 }}>
                {openBlock.whyCategory && (
                  <div className="ops-stack-xs">
                    <div>
                      <Badge tone="why">Why: {openBlock.whyCategory}</Badge>
                    </div>
                    <span className="gcal-sheet-meta">
                      {state.whyStatements[openBlock.whyCategory]}
                    </span>
                  </div>
                )}
                {openBlock.startingStepHint && (
                  <div>
                    <Badge tone={openBlock.id.startsWith('ohchs-') ? 'why' : 'zone'}>
                      {openBlock.id.startsWith('ohchs-')
                        ? openBlock.startingStepHint
                        : `Starting step: ${openBlock.startingStepHint}`}
                    </Badge>
                  </div>
                )}
                {isOpenZone(openBlock) && (
                  <span className="gcal-sheet-meta">
                    Open focus slot · ready for your next active idea.
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
                      Pull {topIdea.project}: {topIdea.title || 'Untitled Idea'}
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
                          {idea.project}: {idea.title || 'Untitled Idea'}
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
          </div>,
          document.body
        )}

      {/* Reminder detail & inline-edit sheet */}
      {openReminder &&
        createPortal(
          <div
            className="gcal-sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpenReminderId(null);
            }}
          >
            <div className="gcal-sheet" role="dialog" aria-label={openReminder.title}>
              <div className="gcal-sheet-grip" />
              <div className="ops-row-between" style={{ alignItems: 'center', gap: 10 }}>
                <div
                  className="ops-row"
                  style={{ alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}
                >
                  <span className="gcal-swatch gcal-swatch-rem" style={{ marginTop: 0 }} />
                  <input
                    className="gcal-create-title-input"
                    value={openReminder.title}
                    aria-label="Edit reminder title"
                    enterKeyHint="done"
                    onChange={(e) =>
                      actions.updateReminder(openReminder.id, { title: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
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

              <div className="gcal-inline-time-row" style={{ marginTop: 12 }}>
                <input
                  type="date"
                  className="ui-input gcal-compact-field"
                  aria-label="Reminder date"
                  value={openReminder.date}
                  onChange={(e) =>
                    e.target.value &&
                    actions.updateReminder(openReminder.id, { date: e.target.value })
                  }
                />
                <input
                  type="time"
                  className="ui-input gcal-compact-field"
                  aria-label="Reminder time"
                  value={openReminder.time}
                  onChange={(e) =>
                    e.target.value &&
                    actions.updateReminder(openReminder.id, { time: e.target.value })
                  }
                />
              </div>

              {(() => {
                if (!openReminder.id.startsWith('ohchs-rot-')) return null;
                const entry = OHCHS_BY_DATE.get(openReminder.date);
                if (!entry || entry.isNoSchool || !entry.dayCode) return null;
                const activeDelay = openReminder.title.includes('(2hr Delay)')
                  ? 'late-2hr'
                  : openReminder.title.includes('(90m Delay)')
                  ? 'late-90'
                  : 'regular';
                return (
                  <div className="ops-stack-xs" style={{ marginTop: 12 }}>
                    <span className="gcal-sheet-meta">Bell schedule timing (snow / late start):</span>
                    <div className="gcal-type-pills">
                      {(
                        [
                          { id: 'regular', label: 'Regular' },
                          { id: 'late-90', label: '90-Min Delay' },
                          { id: 'late-2hr', label: '2-Hr Delay' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`gcal-pill-chip ${
                            activeDelay === opt.id ? 'is-active' : ''
                          }`.trim()}
                          onClick={() => {
                            actions.setSchoolDayDelay(openReminder.date, opt.id);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

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
          </div>,
          document.body
        )}
    </div>
  );
};
