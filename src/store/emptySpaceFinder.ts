import type { CalendarBlock } from '../types/schema';

export interface EmptySpaceSlot {
  id: string;
  date: string;
  /** Exact start/end of the suggested block (HH:MM) */
  startTime: string;
  endTime: string;
  /** Minutes from midnight for the suggested placement */
  startMin: number;
  endMin: number;
  /** Full contiguous open window length in minutes */
  windowMinutes: number;
  /** Whether this open window comes from a Senior Privileges period or blank calendar space */
  source: 'senior-privileges' | 'open-space';
  label: string;
}

export interface FindEmptySpacesOptions {
  blocks: CalendarBlock[];
  todayIso: string;
  /** Current local minutes since midnight on todayIso (defaults to live local clock) */
  nowMinutes?: number;
  /** Desired duration for the task in minutes (default 60) */
  durationMinutes?: number;
  /** Optional lower bound: only return slots starting strictly after (afterDate, afterMinutes) */
  afterDate?: string;
  afterMinutes?: number;
  /** Exclude a specific block (e.g. when moving an already-scheduled note) */
  excludeBlockId?: string;
  /** How many days forward to scan (default 14) */
  horizonDays?: number;
  /** Max slots to return (default 24) */
  maxResults?: number;
  /** Earliest waking minute to consider open space (default 7:30am = 450) */
  dayStartMin?: number;
  /** Latest waking minute to consider open space (default 10:00pm = 1320) */
  dayEndMin?: number;
  /** Only return spaces that fit the full requested duration (default true; falls back to partial if none found) */
  requireFullFit?: boolean;
}

const SENIOR_PRIV_RE = /\bsenior\s+privileges?\b/i;
const LEGACY_PLACEHOLDER_RE = /^(?:empty\s+zone\s*[—-]\s*)?(?:open\s+focus\s+slot|reclaimed\s+focus\s+slot|empty\s+zone)(?:\s*\(spilled\s+over\))?$/i;

export function isSeniorPrivilegesBlock(b: CalendarBlock): boolean {
  return SENIOR_PRIV_RE.test(b.title.trim());
}

export function isLegacyEmptyZonePlaceholder(b: CalendarBlock): boolean {
  if (b.kind !== 'empty-zone') return false;
  if (b.assignedIdeaId || b.assignedGoalId) return false;
  return LEGACY_PLACEHOLDER_RE.test(b.title.trim());
}

function toMinutes(hhmm: string): number {
  const [hRaw, mRaw] = hhmm.split(':').map(Number);
  if (hRaw === 24) return 24 * 60;
  return (hRaw || 0) * 60 + (mRaw || 0);
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(total)));
  if (clamped === 24 * 60) return '24:00';
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function ceilToStep(mins: number, step = 15): number {
  return Math.ceil(mins / step) * step;
}

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(intervals: Interval[], bridgeGapMins = 0): Interval[] {
  if (intervals.length <= 1) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + bridgeGapMins) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function subtractIntervals(base: Interval, subtract: Interval[]): Interval[] {
  let segments: Interval[] = [base];
  for (const cut of subtract) {
    const next: Interval[] = [];
    for (const seg of segments) {
      if (cut.end <= seg.start || cut.start >= seg.end) {
        next.push(seg);
      } else {
        if (cut.start > seg.start) {
          next.push({ start: seg.start, end: cut.start });
        }
        if (cut.end < seg.end) {
          next.push({ start: cut.end, end: seg.end });
        }
      }
    }
    segments = next;
  }
  return segments;
}

function getOverlapMinutes(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function getLiveLocalMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Finds real open empty spaces on the calendar:
 * - Blank calendar gaps where no task/class is scheduled (within waking hours)
 * - Senior Privileges free periods (minus any task already scheduled inside them)
 * Never requires or creates fake "Open Focus Slot" placeholder blobs.
 */
export function findAvailableEmptySpaces(opts: FindEmptySpacesOptions): EmptySpaceSlot[] {
  const {
    blocks,
    todayIso,
    nowMinutes = getLiveLocalMinutes(),
    durationMinutes = 60,
    afterDate,
    afterMinutes,
    excludeBlockId,
    horizonDays = 14,
    maxResults = 24,
    dayStartMin = 7 * 60 + 30, // 7:30am
    dayEndMin = 22 * 60, // 10:00pm
    requireFullFit = true,
  } = opts;

  const desiredDur = Math.max(15, Math.min(360, Math.round(durationMinutes)));
  const minUsableGap = requireFullFit ? desiredDur : Math.min(25, desiredDur);

  const startScanDate =
    afterDate && afterDate > todayIso ? afterDate : todayIso;

  const byDate = new Map<string, CalendarBlock[]>();
  for (const b of blocks) {
    if (b.id === excludeBlockId) continue;
    if (b.date < startScanDate) continue;
    const list = byDate.get(b.date);
    if (list) list.push(b);
    else byDate.set(b.date, [b]);
  }

  const results: EmptySpaceSlot[] = [];

  for (let dayOffset = 0; dayOffset < horizonDays && results.length < maxResults; dayOffset += 1) {
    const iso = addDays(startScanDate, dayOffset);
    const dayBlocks = byDate.get(iso) ?? [];

    // Separate real busy blocks from Senior Privileges (open!) and legacy placeholders (open!)
    const busyRaw: Interval[] = [];
    const seniorPrivRaw: Interval[] = [];

    for (const b of dayBlocks) {
      const s = toMinutes(b.startTime);
      const e = Math.max(s + 10, toMinutes(b.endTime));
      if (isSeniorPrivilegesBlock(b)) {
        seniorPrivRaw.push({ start: s, end: e });
        continue;
      }
      if (isLegacyEmptyZonePlaceholder(b)) {
        continue;
      }
      busyRaw.push({ start: s, end: e });
    }

    const busyMerged = mergeIntervals(busyRaw, 0);
    // Bridge short hallway passing gaps (<= 10m) between back-to-back Senior Privileges periods
    const seniorPrivMerged = mergeIntervals(seniorPrivRaw, 10);

    // Determine earliest usable minute on this day
    const isWeekend = (() => {
      const [y, m, d] = iso.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return dow === 0 || dow === 6;
    })();
    let earliest = isWeekend ? Math.max(dayStartMin, 8 * 60) : dayStartMin;

    if (iso === todayIso) {
      earliest = Math.max(earliest, ceilToStep(nowMinutes + 5, 15));
    }
    if (afterDate && iso === afterDate && typeof afterMinutes === 'number') {
      earliest = Math.max(earliest, ceilToStep(afterMinutes, 5));
    }

    if (earliest + minUsableGap > dayEndMin) continue;

    const freeIntervals = subtractIntervals({ start: earliest, end: dayEndMin }, busyMerged);

    for (const free of freeIntervals) {
      if (results.length >= maxResults) break;
      const freeLen = free.end - free.start;
      if (freeLen < minUsableGap) continue;

      // Split any Senior Privileges sub-windows out cleanly from general open space
      // if a free interval combines a Senior Privileges block with afternoon open time
      // (e.g. Senior Privileges 10:36am-1:52pm followed by open afternoon 1:52pm-10:00pm).
      const subWindows: { interval: Interval; source: 'senior-privileges' | 'open-space' }[] = [];

      const overlappingSP = seniorPrivMerged.filter((sp) => getOverlapMinutes(free, sp) >= minUsableGap);
      if (overlappingSP.length > 0) {
        // Group consecutive Senior Privileges periods (<= 15m passing gap) into one Senior Privileges span
        const spBoundStart = Math.max(free.start, overlappingSP[0].start);
        const spBoundEnd = Math.min(free.end, overlappingSP[overlappingSP.length - 1].end);

        if (spBoundStart - free.start >= minUsableGap) {
          subWindows.push({
            interval: { start: free.start, end: spBoundStart },
            source: 'open-space',
          });
        }
        if (spBoundEnd - spBoundStart >= minUsableGap) {
          subWindows.push({
            interval: { start: spBoundStart, end: spBoundEnd },
            source: 'senior-privileges',
          });
        }
        if (free.end - spBoundEnd >= minUsableGap) {
          subWindows.push({
            interval: { start: spBoundEnd, end: free.end },
            source: 'open-space',
          });
        }
      } else {
        subWindows.push({ interval: free, source: 'open-space' });
      }

      for (const win of subWindows) {
        if (results.length >= maxResults) break;
        const winLen = win.interval.end - win.interval.start;
        if (winLen < minUsableGap) continue;

        const pushCandidate = (candStart: number, candWindowEnd: number) => {
          if (results.length >= maxResults) return;
          const avail = candWindowEnd - candStart;
          if (avail < minUsableGap) return;
          const fittedEnd = Math.min(candWindowEnd, candStart + desiredDur);
          const id = `${iso}|${candStart}|${fittedEnd}`;
          if (results.some((r) => r.id === id)) return;
          results.push({
            id,
            date: iso,
            startTime: fromMinutes(candStart),
            endTime: fromMinutes(fittedEnd),
            startMin: candStart,
            endMin: fittedEnd,
            windowMinutes: avail,
            source: win.source,
            label: win.source === 'senior-privileges' ? 'Senior Privileges' : 'Open space',
          });
        };

        // First natural start of this open window
        pushCandidate(win.interval.start, win.interval.end);

        // If an open-space window is very wide (e.g. open afternoon/evening or weekend),
        // also offer clean Afternoon (1:00pm / 3:00pm) & Evening (6:00pm) anchors so the user
        // can easily skip to later in the same day if the first time doesn't work!
        if (win.source === 'open-space' && winLen >= 210) {
          const anchors = [13 * 60, 16 * 60, 18 * 60 + 30];
          for (const anchor of anchors) {
            if (
              anchor >= win.interval.start + 90 &&
              anchor + desiredDur <= win.interval.end
            ) {
              pushCandidate(anchor, win.interval.end);
            }
          }
        }
      }
    }
  }

  if (results.length === 0 && requireFullFit) {
    return findAvailableEmptySpaces({ ...opts, requireFullFit: false });
  }

  return results;
}

export function formatWindowFreeLabel(mins: number): string {
  if (mins < 60) return `${mins}m free`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h free` : `${h}h ${m}m free`;
}
