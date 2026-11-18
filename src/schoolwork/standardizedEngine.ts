import type { CalendarBlock, EventColorId, IdeaItem } from '../types/schema.js';
import {
  OHCHS_BELL_SCHEDULES,
  OHCHS_BY_DATE,
  resolveDelayedDayCode,
  type OhchsDelayMode,
} from '../store/ohchsSchedule.js';
import {
  APES_AUDIOBOOK_TRACKS,
  computeEcoModulesDurationWithBuffer,
  type ApesAudiobookTrack,
} from './audiobookCatalog.js';

export type SchoolCourseId = 'eco' | 'lit' | 'precalc' | 'physics';

export type SchoolTaskCategory = 'module' | 'homework' | 'lab' | 'test' | 'quiz' | 'project';

export type SchoolDueTiming = 'before-class' | 'in-class' | 'end-of-day';

export interface StandardizedExtractedAssignment {
  slug: string;
  courseId: SchoolCourseId;
  category: SchoolTaskCategory;
  title: string;
  /** Module numbers when assigned reading/audiobook modules (e.g. [15, 16]) */
  moduleNumbers: number[];
  /** YYYY-MM-DD when teacher assigned/started it (critical for Labs) */
  assignedDate: string | null;
  /** YYYY-MM-DD when due or exam occurs */
  dueDate: string;
  dueTiming: SchoolDueTiming;
  /** Fallback estimate if not an Eco module and not a 1-hr lab */
  fallbackMinutes: number;
  startingStep: string;
  contextDetails: string;
  /** Exact Google Classroom / Google Slide URL where this assignment was pulled from */
  sourceUrl?: string;
}

export interface CourseScheduleSpec {
  id: SchoolCourseId;
  shortName: string;
  fullName: string;
  teacher: string;
  projectFolder: string;
  color: EventColorId;
  periodKeys: string[]; // e.g., ['p5'] for Eco, ['p7', 'p7a'] for Lit, ['p1'] for Pre-Calc, ['p2'] for Physics
}

export const SCHOOL_COURSES: Record<SchoolCourseId, CourseScheduleSpec> = {
  eco: {
    id: 'eco',
    shortName: 'Eco',
    fullName: 'AP Environmental Science',
    teacher: 'Ms. Fox',
    projectFolder: 'AP Env Science',
    color: 'emerald',
    periodKeys: ['p5'],
  },
  lit: {
    id: 'lit',
    shortName: 'Lit',
    fullName: 'AP Literature & Comp',
    teacher: 'Mr. Lauby',
    projectFolder: 'AP Lit',
    color: 'violet',
    periodKeys: ['p7', 'p7a'],
  },
  precalc: {
    id: 'precalc',
    shortName: 'Pre-Calc',
    fullName: 'AP Pre-Calculus w/ Trig',
    teacher: 'Ms. Grover',
    projectFolder: 'AP Pre-Calc',
    color: 'cobalt',
    periodKeys: ['p1'],
  },
  physics: {
    id: 'physics',
    shortName: 'Physics',
    fullName: 'Physics Honors',
    teacher: 'Mr. Otterson',
    projectFolder: 'Physics Honors',
    color: 'teal',
    periodKeys: ['p2'],
  },
};

const AUTO_DUE_SECTION_HEADER = '--- Homework & Deadlines ---';
const META_TAG_REGEX = /\[Meta:\s*course=(eco|lit|precalc|physics)\s*\|\s*due=(\d{4}-\d{2}-\d{2})\s*\|\s*timing=(before-class|in-class|end-of-day)\s*\|\s*slug=([a-z0-9-]+)\]/i;

export function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMins(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 55, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function getEasternNow(now: Date = new Date()): {
  todayIso: string;
  nowMinutesOfDay: number;
  nowEpochMs: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const rawHour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));

  return {
    todayIso: `${year}-${month}-${day}`,
    nowMinutesOfDay: rawHour * 60 + minute,
    nowEpochMs: now.getTime(),
  };
}

/**
 * Checks if we had `courseId` class on `isoDate` according to OHCHS rotation.
 */
export function hasCourseClassOnDate(
  isoDate: string,
  courseId: SchoolCourseId,
  delayMode: OhchsDelayMode = 'regular'
): { startTime: string; endTime: string; periodKey: string } | null {
  const entry = OHCHS_BY_DATE.get(isoDate);
  if (!entry || entry.isNoSchool || !entry.dayCode) return null;
  const effectiveCode = resolveDelayedDayCode(entry.dayCode, delayMode);
  const periods = OHCHS_BELL_SCHEDULES[effectiveCode] ?? [];
  const spec = SCHOOL_COURSES[courseId];
  const found = periods.find((p) => spec.periodKeys.includes(p.key));
  if (!found) return null;
  return {
    startTime: found.startTime,
    endTime: found.endTime,
    periodKey: found.key,
  };
}

/**
 * Finds the closest OHCHS school day strictly before `dueDate` on which `courseId` met.
 */
export function findClosestPriorCourseClassDate(
  dueDate: string,
  courseId: SchoolCourseId
): string {
  for (let back = 1; back <= 14; back++) {
    const candidate = addDays(dueDate, -back);
    if (hasCourseClassOnDate(candidate, courseId)) {
      return candidate;
    }
  }
  return addDays(dueDate, -1);
}

/**
 * Computes the exact minute-of-day when the student gets home (+30m after Senior Privileges starts
 * on Green days, or +30m after the final class ends on Gold days).
 */
export function getEarliestHomeArrivalMinutes(
  isoDate: string,
  delayMode: OhchsDelayMode = 'regular'
): number {
  const entry = OHCHS_BY_DATE.get(isoDate);
  if (!entry || entry.isNoSchool || !entry.dayCode) {
    // Weekend or No-School day: 10:00 AM
    return 10 * 60;
  }

  const effectiveCode = resolveDelayedDayCode(entry.dayCode, delayMode);
  const periods = OHCHS_BELL_SCHEDULES[effectiveCode] ?? [];
  if (periods.length === 0) return 15 * 60;

  // Check if the day ends with Senior Privileges (Green days: p3 & p4 are Senior Privileges)
  const firstSeniorPriv = periods.find((p) => /senior privileges/i.test(p.title));
  if (firstSeniorPriv) {
    // Student leaves when Senior Privileges starts + 30 minutes commute home
    return toMins(firstSeniorPriv.startTime) + 30;
  }

  // Otherwise (Gold days): student leaves when last period ends + 30 minutes commute home
  const lastPeriodEnd = Math.max(...periods.map((p) => toMins(p.endTime)));
  return lastPeriodEnd + 30;
}

/**
 * Finds the next available empty-zone or open calendar gap on `isoDate` of length `durationMins`,
 * starting at or after `minStartOverrideMins` (defaulting to earliest home arrival time).
 */
export function findAvailableHomeworkSlotOnDate(params: {
  isoDate: string;
  durationMins: number;
  existingBlocks: CalendarBlock[];
  ignoreBlockId?: string;
  delayMode?: OhchsDelayMode;
  minStartMins?: number;
  maxEndMins?: number;
}): { startTime: string; endTime: string } | null {
  const {
    isoDate,
    durationMins,
    existingBlocks,
    ignoreBlockId,
    delayMode = 'regular',
    minStartMins,
    maxEndMins = 21 * 60 + 30, // 9:30 PM latest
  } = params;

  const homeArrivalMins = getEarliestHomeArrivalMinutes(isoDate, delayMode);
  const earliestStart = Math.max(homeArrivalMins, minStartMins ?? 0);

  if (earliestStart + durationMins > maxEndMins) {
    return null;
  }

  const dayBlocks = existingBlocks.filter(
    (b) =>
      b.date === isoDate &&
      b.id !== ignoreBlockId &&
      !/senior privileges/i.test(b.title)
  );

  // 1. Check if there is an unassigned open Empty Zone at or after earliestStart that fits
  const openZones = dayBlocks
    .filter(
      (b) =>
        b.kind === 'empty-zone' &&
        !b.completed &&
        !b.assignedIdeaId &&
        !b.assignedGoalId
    )
    .sort((a, b) => toMins(a.startTime) - toMins(b.startTime));

  for (const zone of openZones) {
    const zStart = Math.max(earliestStart, toMins(zone.startTime));
    const zEnd = Math.min(maxEndMins, toMins(zone.endTime));
    if (zEnd - zStart >= durationMins) {
      return {
        startTime: fromMins(zStart),
        endTime: fromMins(zStart + durationMins),
      };
    }
  }

  // 2. Otherwise scan 5-minute increments starting right at earliestStart (Senior Priv +30m or After School +30m)
  const busy = dayBlocks
    .filter((b) => b.kind !== 'empty-zone' || Boolean(b.assignedIdeaId || b.assignedGoalId))
    .map((b) => ({
      start: toMins(b.startTime),
      end: toMins(b.endTime),
    }));

  for (let cursor = earliestStart; cursor + durationMins <= maxEndMins; cursor += 5) {
    const candidateEnd = cursor + durationMins;
    const conflict = busy.some((iv) => cursor < iv.end && iv.start < candidateEnd);
    if (!conflict) {
      return {
        startTime: fromMins(cursor),
        endTime: fromMins(candidateEnd),
      };
    }
  }

  return null;
}

export interface ParsedHwMeta {
  courseId: SchoolCourseId;
  dueDate: string;
  dueTiming: SchoolDueTiming;
  slug: string;
}

export function parseHwMetaFromBlock(block: CalendarBlock): ParsedHwMeta | null {
  if (!block.id.startsWith('sch-hw-') || !block.notes) return null;
  const m = block.notes.match(META_TAG_REGEX);
  if (!m) return null;
  return {
    courseId: m[1].toLowerCase() as SchoolCourseId,
    dueDate: m[2],
    dueTiming: m[3].toLowerCase() as SchoolDueTiming,
    slug: m[4],
  };
}

function stripAutoDueSection(notes: string | undefined): string {
  if (!notes) return '';
  const idx = notes.indexOf(AUTO_DUE_SECTION_HEADER);
  if (idx === -1) return notes.trim();
  return notes.slice(0, idx).trim();
}

/**
 * Pure, idempotent reconciler that enforces:
 * 1. Class Entry Description + 6:00 PM Night-Before Alarm (`360 + classStartMins`),
 *    automatically disabling the alarm as soon as the linked HW block is marked `completed`!
 * 2. 2-Hour Missed-Window Auto-Rollover: If a `sch-hw-*` block is NOT marked done within
 *    2 hours after its scheduled `endTime`, moves it to the next available empty space /
 *    Senior Privileges (+30m home) / after-school (+30m home) slot!
 */
export function reconcileSchoolworkLifecycle(params: {
  blocks: CalendarBlock[];
  todayIso: string;
  nowMinutesOfDay: number;
  delaysByDate?: Record<string, { mode: OhchsDelayMode }>;
}): { blocks: CalendarBlock[]; changed: boolean } {
  const { blocks, todayIso, nowMinutesOfDay, delaysByDate = {} } = params;
  let changed = false;

  const workingBlocks = blocks.map((b) => ({ ...b }));

  // STEP A: 2-Hour Unfinished Grace Window -> Rollover to next available day/slot
  for (let i = 0; i < workingBlocks.length; i++) {
    const blk = workingBlocks[i];
    if (!blk.id.startsWith('sch-hw-') || blk.completed) continue;

    const meta = parseHwMetaFromBlock(blk);
    if (!meta) continue;

    // Stop rolling if due date has already passed by more than 1 day
    if (todayIso > addDays(meta.dueDate, 1)) continue;

    const endMins = toMins(blk.endTime);
    const isPastDay = blk.date < todayIso;
    const isMissedTodayWindow =
      blk.date === todayIso && nowMinutesOfDay >= endMins + 120; // 2 hours past endTime!

    if (!isPastDay && !isMissedTodayWindow) continue;

    const durationMins = Math.max(15, toMins(blk.endTime) - toMins(blk.startTime));

    // Determine candidate dates:
    // - If blk.date was a past day (< todayIso), try today first (after now + 10m), then tomorrow+
    // - If blk.date was today and 2hr window expired, roll to tomorrow (addDays(todayIso, 1))+
    const startSearchDate = isPastDay ? todayIso : addDays(blk.date, 1);

    for (let offset = 0; offset <= 5; offset++) {
      const candidateDate = addDays(startSearchDate, offset);
      if (candidateDate > meta.dueDate) break;

      const delayMode = delaysByDate[candidateDate]?.mode ?? 'regular';
      let maxEndMins = 21 * 60 + 30;

      if (candidateDate === meta.dueDate && meta.dueTiming !== 'end-of-day') {
        const dueClass = hasCourseClassOnDate(candidateDate, meta.courseId, delayMode);
        if (dueClass) {
          maxEndMins = toMins(dueClass.startTime) - 10;
        }
      }

      const minStartMins =
        candidateDate === todayIso ? nowMinutesOfDay + 10 : undefined;

      const nextSlot = findAvailableHomeworkSlotOnDate({
        isoDate: candidateDate,
        durationMins,
        existingBlocks: workingBlocks,
        ignoreBlockId: blk.id,
        delayMode,
        minStartMins,
        maxEndMins,
      });

      if (nextSlot) {
        if (
          blk.date !== candidateDate ||
          blk.startTime !== nextSlot.startTime ||
          blk.endTime !== nextSlot.endTime
        ) {
          workingBlocks[i] = {
            ...blk,
            date: candidateDate,
            startTime: nextSlot.startTime,
            endTime: nextSlot.endTime,
            spilloverCount: (blk.spilloverCount || 0) + 1,
            updatedAt: new Date().toISOString(),
          };
          changed = true;
        }
        break;
      }
    }
  }

  // STEP B: Group all sch-hw-* assignments by (courseId + dueDate) and update the OHCHS Class Entry!
  const hwByClassKey = new Map<
    string,
    Array<{ block: CalendarBlock; meta: ParsedHwMeta }>
  >();

  for (const blk of workingBlocks) {
    const meta = parseHwMetaFromBlock(blk);
    if (!meta) continue;
    const key = `${meta.courseId}|${meta.dueDate}`;
    const arr = hwByClassKey.get(key) ?? [];
    arr.push({ block: blk, meta });
    hwByClassKey.set(key, arr);
  }

  for (let i = 0; i < workingBlocks.length; i++) {
    const blk = workingBlocks[i];
    if (!blk.id.startsWith('ohchs-')) continue;

    // Match ohchs-YYYY-MM-DD-p5 etc.
    const idMatch = blk.id.match(/^ohchs-(\d{4}-\d{2}-\d{2})-([a-z0-9]+)$/i);
    if (!idMatch) continue;
    const [, blockDate, periodKey] = idMatch;

    const matchedCourse = (Object.values(SCHOOL_COURSES) as CourseScheduleSpec[]).find(
      (c) => c.periodKeys.includes(periodKey)
    );
    if (!matchedCourse) continue;

    const dueItems = hwByClassKey.get(`${matchedCourse.id}|${blockDate}`);
    const baseUserNotes = stripAutoDueSection(blk.notes);

    if (!dueItems || dueItems.length === 0) {
      // If previously had an auto-due section, clean it up cleanly
      if (blk.notes && blk.notes.includes(AUTO_DUE_SECTION_HEADER)) {
        workingBlocks[i] = {
          ...blk,
          notes: baseUserNotes || undefined,
          alertOffsetMinutes: undefined,
          updatedAt: new Date().toISOString(),
        };
        changed = true;
      }
      continue;
    }

    const anyUnfinished = dueItems.some((entry) => !entry.block.completed);
    const bulletLines = dueItems.map((entry) => {
      const cleanTitle = entry.block.title.replace(/^\[(Eco|Lit|Pre-Calc|Physics)\]\s*/i, '');
      return entry.block.completed
        ? `• ✓ DONE: ${cleanTitle}`
        : `• DUE TODAY: ${cleanTitle}`;
    });

    const nextNotes = [
      baseUserNotes,
      `${AUTO_DUE_SECTION_HEADER}\n${bulletLines.join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Exact 6:00 PM (18:00) Night-Before Alarm calculation:
    // Minutes from 18:00 the night before to midnight = 360 mins + class startTime minutes!
    // Disabled automatically (`undefined`) when all due HW items for this class are marked done!
    const nightBefore6pmOffset = anyUnfinished
      ? 360 + toMins(blk.startTime)
      : undefined;

    if (
      blk.notes !== nextNotes ||
      blk.alertOffsetMinutes !== nightBefore6pmOffset
    ) {
      workingBlocks[i] = {
        ...blk,
        notes: nextNotes,
        alertOffsetMinutes: nightBefore6pmOffset,
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }
  }

  if (changed) {
    workingBlocks.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
    );
  }

  return { blocks: workingBlocks, changed };
}

/**
 * Scans forward day-by-day from `startDate` through `dueDate` to find the soonest
 * non-overlapping homework slot across all existing blocks (classes, user events, and
 * previously scheduled homework from any course).
 */
export function findSoonestNonOverlappingHomeworkSlot(params: {
  startDate: string;
  dueDate: string;
  courseId: SchoolCourseId;
  dueTiming: SchoolDueTiming;
  durationMins: number;
  existingBlocks: CalendarBlock[];
  todayIso: string;
  nowMinutesOfDay: number;
  delaysByDate?: Record<string, { mode: OhchsDelayMode }>;
}): { date: string; startTime: string; endTime: string } {
  const {
    startDate,
    dueDate,
    courseId,
    dueTiming,
    durationMins,
    existingBlocks,
    todayIso,
    nowMinutesOfDay,
    delaysByDate = {},
  } = params;

  const effectiveStart = startDate <= dueDate ? startDate : dueDate;
  const roundedNowPlus10 = Math.ceil((nowMinutesOfDay + 10) / 5) * 5;

  const tryPass = (eveningCutoffMins: number) => {
    for (let offset = 0; offset <= 21; offset++) {
      const candidateDate = addDays(effectiveStart, offset);
      if (candidateDate > dueDate) break;

      const delayMode = delaysByDate[candidateDate]?.mode ?? 'regular';
      let maxEndMins = eveningCutoffMins;

      if (candidateDate === dueDate && dueTiming !== 'end-of-day') {
        const dueClass = hasCourseClassOnDate(candidateDate, courseId, delayMode);
        if (dueClass) {
          maxEndMins = Math.min(maxEndMins, toMins(dueClass.startTime) - 10);
        }
      }

      const minStartMins =
        candidateDate === todayIso ? roundedNowPlus10 : undefined;

      const slot = findAvailableHomeworkSlotOnDate({
        isoDate: candidateDate,
        durationMins,
        existingBlocks,
        delayMode,
        minStartMins,
        maxEndMins,
      });

      if (slot) {
        return { date: candidateDate, ...slot };
      }
    }
    return null;
  };

  // Pass 1: normal evening cap (9:30 PM)
  const normal = tryPass(21 * 60 + 30);
  if (normal) return normal;

  // Pass 2: stretched evening cap (10:45 PM) still strictly non-overlapping
  const stretched = tryPass(22 * 60 + 45);
  if (stretched) return stretched;

  // Pass 3: if days up to dueDate are completely full, try morning-before-class or next open day without overlapping
  for (let offset = 0; offset <= 7; offset++) {
    const candidateDate = addDays(dueDate, offset);
    const delayMode = delaysByDate[candidateDate]?.mode ?? 'regular';
    const slot = findAvailableHomeworkSlotOnDate({
      isoDate: candidateDate,
      durationMins,
      existingBlocks,
      delayMode,
      minStartMins: candidateDate === todayIso ? roundedNowPlus10 : undefined,
      maxEndMins: 22 * 60 + 45,
    });
    if (slot) {
      return { date: candidateDate, ...slot };
    }
  }

  // Absolute last resort: append after the latest block on effectiveStart
  const delayMode = delaysByDate[effectiveStart]?.mode ?? 'regular';
  const dayEnds = existingBlocks
    .filter((b) => b.date === effectiveStart && !/senior privileges/i.test(b.title))
    .map((b) => toMins(b.endTime));
  const fallbackStart = Math.max(
    getEarliestHomeArrivalMinutes(effectiveStart, delayMode),
    effectiveStart === todayIso ? roundedNowPlus10 : 0,
    ...(dayEnds.length ? dayEnds : [0])
  );
  return {
    date: effectiveStart,
    startTime: fromMins(fallbackStart),
    endTime: fromMins(fallbackStart + durationMins),
  };
}

/**
 * Merges newly extracted standardized assignments from Gemini into existing blocks & ideas,
 * applying the exact Module Audiobook (+20% buffer) rule, 1-hour Lab on Assigned Date rule,
 * 1-hour soonest-available non-overlapping Math/Lit/Physics homework rule,
 * Class Entry 6pm Night-Before Alarm rule, and 2-Hour Missed-Window Rollover rule.
 */
export function applyExtractedAssignmentsToSchedule(params: {
  assignments: StandardizedExtractedAssignment[];
  existingBlocks: CalendarBlock[];
  existingIdeas: IdeaItem[];
  existingProjects: string[];
  audiobookTracks?: ApesAudiobookTrack[];
  todayIso: string;
  nowMinutesOfDay: number;
  delaysByDate?: Record<string, { mode: OhchsDelayMode }>;
}): {
  blocks: CalendarBlock[];
  ideas: IdeaItem[];
  projects: string[];
  addedCount: number;
  updatedCount: number;
} {
  const {
    assignments,
    existingBlocks,
    existingIdeas,
    existingProjects,
    audiobookTracks = APES_AUDIOBOOK_TRACKS,
    todayIso,
    nowMinutesOfDay,
    delaysByDate = {},
  } = params;

  const workingBlocks = existingBlocks.map((b) => ({ ...b }));
  const workingIdeas = existingIdeas.map((i) => ({ ...i }));
  const neededProjects = new Set<string>(existingProjects);

  let addedCount = 0;
  let updatedCount = 0;

  // Schedule earliest-due assignments first so urgent items claim the soonest open slots cleanly
  const sortedAssignments = [...assignments].sort((a, b) =>
    (a.dueDate || '').localeCompare(b.dueDate || '')
  );

  for (const item of sortedAssignments) {
    const course = SCHOOL_COURSES[item.courseId];
    if (!course || !item.dueDate) continue;

    // Skip ancient assignments whose due dates passed more than 2 days ago
    if (item.dueDate < addDays(todayIso, -2)) continue;

    const blockId = `sch-hw-${item.courseId}-${item.slug}`;
    const ideaId = `sch-idea-${item.courseId}-${item.slug}`;

    // 1. Compute Exact Duration & Breakdown per Standardized Rules:
    let durationMinutes = Math.max(20, Math.min(180, item.fallbackMinutes || 60));
    let durationOriginNote = '';

    if (item.category === 'lab') {
      // Standardized Lab Rule: always assume 1 hour (60 min) on assigned date (user can edit if needed)
      durationMinutes = 60;
      durationOriginNote = 'Standardized Lab Block: 60m on assigned day (edit duration anytime)';
    } else if (item.courseId === 'eco' && item.moduleNumbers.length > 0) {
      // Standardized Module Rule: Audiobook Sheet duration + 20% margin buffer
      const audioCalc = computeEcoModulesDurationWithBuffer(
        item.moduleNumbers,
        audiobookTracks,
        1.2
      );
      if (audioCalc) {
        durationMinutes = audioCalc.bufferedMinutes;
        durationOriginNote = audioCalc.breakdownLabel;
      }
    } else if (
      item.courseId === 'precalc' ||
      item.courseId === 'lit' ||
      item.courseId === 'physics'
    ) {
      // Standardized Classroom HW Rule: ~1 hour (60 min) soonest available non-overlapping block
      durationMinutes = 60;
      durationOriginNote =
        item.courseId === 'precalc'
          ? 'Math Homework Block: 60m soonest available non-overlapping slot'
          : item.courseId === 'lit'
          ? 'Lit Assignment Block: 60m non-overlapping slot before class deadline'
          : 'Physics Assignment Block: 60m soonest available non-overlapping slot';
    }

    // 2. Compute Earliest Eligible Start Date per Standardized Rules:
    // - Math (precalc), Lit, Physics: soonest available open slot starting today (or assignedDate if future)
    // - Eco Labs: assignedDate (or closest prior Eco class date)
    // - Eco Modules/HW: closest prior Eco class date before dueDate (clamped >= today if still upcoming)
    let searchStartDate: string;
    if (
      item.courseId === 'precalc' ||
      item.courseId === 'lit' ||
      item.courseId === 'physics'
    ) {
      const assignedIso =
        item.assignedDate && /^\d{4}-\d{2}-\d{2}$/.test(item.assignedDate)
          ? item.assignedDate
          : todayIso;
      searchStartDate = assignedIso > todayIso ? assignedIso : todayIso;
    } else if (item.category === 'lab') {
      searchStartDate =
        item.assignedDate && /^\d{4}-\d{2}-\d{2}$/.test(item.assignedDate)
          ? item.assignedDate
          : findClosestPriorCourseClassDate(item.dueDate, item.courseId);
    } else {
      searchStartDate = findClosestPriorCourseClassDate(item.dueDate, item.courseId);
    }

    const metaFooter = `[Meta: course=${item.courseId} | due=${item.dueDate} | timing=${item.dueTiming} | slug=${item.slug}]`;
    const sourceLine = item.sourceUrl ? `Source: ${item.sourceUrl}` : '';
    const richNotes = [
      `Due ${item.dueDate} (${item.dueTiming.replace('-', ' ')}) · ${course.teacher}`,
      durationOriginNote,
      item.contextDetails,
      sourceLine,
      metaFooter,
    ]
      .filter(Boolean)
      .join('\n\n');

    const blockTitle = `[${course.shortName}] ${item.title}`;

    // 3. Upsert Block (preserving user manual edits to date/startTime/endTime/completed!)
    const existingIdx = workingBlocks.findIndex((b) => b.id === blockId);
    if (existingIdx >= 0) {
      const prev = workingBlocks[existingIdx];
      if (prev.title !== blockTitle || prev.notes !== richNotes) {
        workingBlocks[existingIdx] = {
          ...prev,
          title: blockTitle,
          startingStepHint: item.startingStep,
          notes: richNotes,
          updatedAt: new Date().toISOString(),
        };
        updatedCount++;
      }
    } else {
      const placed = findSoonestNonOverlappingHomeworkSlot({
        startDate: searchStartDate,
        dueDate: item.dueDate,
        courseId: item.courseId,
        dueTiming: item.dueTiming,
        durationMins: durationMinutes,
        existingBlocks: workingBlocks,
        todayIso,
        nowMinutesOfDay,
        delaysByDate,
      });

      const promptAtStart =
        item.courseId === 'precalc' ||
        item.courseId === 'lit' ||
        item.courseId === 'physics';

      workingBlocks.push({
        id: blockId,
        date: placed.date,
        startTime: placed.startTime,
        endTime: placed.endTime,
        title: blockTitle,
        kind: 'goal-session',
        completed: false,
        whyCategory: 'School',
        customColor: course.color,
        ...(promptAtStart ? { alertOffsetMinutes: 0 } : {}),
        assignedIdeaId: ideaId,
        startingStepHint: item.startingStep,
        notes: richNotes,
        updatedAt: new Date().toISOString(),
      });
      addedCount++;
    }

    // 4. Upsert Idea in Course Folder
    neededProjects.add(course.projectFolder);
    const existingIdeaIdx = workingIdeas.findIndex((i) => i.id === ideaId);
    const linkedBlock = workingBlocks.find((b) => b.id === blockId);
    const isDone = Boolean(linkedBlock?.completed);

    if (existingIdeaIdx >= 0) {
      workingIdeas[existingIdeaIdx] = {
        ...workingIdeas[existingIdeaIdx],
        title: blockTitle,
        startingStep: item.startingStep,
        notes: richNotes.replace(META_TAG_REGEX, '').trim(),
        estimatedMinutes: durationMinutes,
        status: isDone ? 'completed' : workingIdeas[existingIdeaIdx].status,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const folderCount = workingIdeas.filter(
        (i) => i.project === course.projectFolder && i.status !== 'completed'
      ).length;
      workingIdeas.push({
        id: ideaId,
        project: course.projectFolder,
        priorityRank: folderCount + 1,
        title: blockTitle,
        startingStep: item.startingStep,
        notes: richNotes.replace(META_TAG_REGEX, '').trim(),
        isBottleneck: item.category === 'lab' || item.category === 'test',
        status: isDone ? 'completed' : 'active',
        estimatedMinutes: durationMinutes,
        createdAt: todayIso,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // 5. Run Lifecycle Reconciler (handles past assignedDate rollover + Class Entry 6pm Night-Before Alarm!)
  const reconciled = reconcileSchoolworkLifecycle({
    blocks: workingBlocks,
    todayIso,
    nowMinutesOfDay,
    delaysByDate,
  });

  return {
    blocks: reconciled.blocks,
    ideas: workingIdeas,
    projects: Array.from(neededProjects),
    addedCount,
    updatedCount,
  };
}
