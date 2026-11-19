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

export type SchoolWorkLocation = 'homework' | 'in-class';

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
  /** 'in-class' for work done strictly in class (no home HW block); 'homework' for work/studying done outside class */
  workLocation?: SchoolWorkLocation;
  /** True if already turned in / graded on Classroom or already past due */
  isCompleted?: boolean;
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

const AUTO_INCLASS_SECTION_HEADER = 'In class:';
const LEGACY_INCLASS_SECTION_HEADER = '--- In-Class Work ---';
const LEGACY_DUE_SECTION_HEADER = '--- Homework & Deadlines ---';
const LEGACY_DEADLINES_HEADER = 'Deadlines:';
const DIRECT_DUE_LINE_REGEX = /^(?:•\s*)?(?:Due:|Test:|✓\s)/;
const META_TAG_REGEX = /\[Meta:\s*course=(eco|lit|precalc|physics)\s*\|\s*due=(\d{4}-\d{2}-\d{2})\s*\|\s*timing=(before-class|in-class|end-of-day)\s*\|\s*slug=([a-z0-9-]+)\]/i;
export const APES_AUDIOBOOK_WEBSITE_BASE = 'https://ezaudiobookmaker.com';

export function hasAutoSchoolworkSection(notes: string | undefined): boolean {
  if (!notes) return false;
  if (
    notes.includes(AUTO_INCLASS_SECTION_HEADER) ||
    notes.includes(LEGACY_INCLASS_SECTION_HEADER) ||
    notes.includes(LEGACY_DUE_SECTION_HEADER) ||
    notes.includes(LEGACY_DEADLINES_HEADER)
  ) {
    return true;
  }
  return notes.split('\n').some((line) => DIRECT_DUE_LINE_REGEX.test(line.trim()));
}

function truncateClean(text: string, maxLen: number): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxLen * 0.55 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[,;:.\-–—]+$/, '')}…`;
}

function cleanAssignmentTitle(rawTitle: string, courseId: SchoolCourseId): string {
  let t = rawTitle.trim();
  // Strip verbose parenthetical notes like "(Labeled as Mid Unit Review on document)", "(Did Part 1 on 11/5...)", "(in-class)"
  t = t
    .replace(/\s*\(\s*in[\s-]?class\s*\)/gi, '')
    .replace(/\s*\(\s*labeled\s+as[^)]*\)/gi, '')
    .replace(/\s*\(\s*did\s+part[^)]*\)/gi, '')
    .replace(/\s*\(\s*ap\s+topic[^)]*\)/gi, '')
    .replace(/\s*\(\s*ap\s+\d+\.\d+\s*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Shorten verbose Eco module titles like "Read Modules 15 & 16 and Take Notes" -> "Modules 15 & 16"
  if (courseId === 'eco') {
    const modShort = t.match(/^read\s+(modules?\s+\d+(?:\s*(?:&|-|and)\s*\d+)?)\s*(?:and\s+take\s+notes|reading\s+and\s+notes|notes)?$/i);
    if (modShort) {
      t = modShort[1].replace(/^module/i, 'Module');
    }
  }
  return t || rawTitle.trim();
}

function cleanNoteBody(rawDetails: string | undefined, fallbackStep: string | undefined, title: string): string {
  const stripNoise = (s: string) =>
    s
      .replace(/https?:\/\/[^\s)<>\]"']+/gi, '')
      .replace(/\bDue\s+(?:Tomorrow|Today|Yesterday)\s*\(\d{4}-\d{2}-\d{2}\)\.?/gi, '')
      .replace(/\bDue\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\.?/gi, '')
      .replace(/\bassignment\s+posted\s+by\s+[A-Z][a-z]+\s+[A-Z][a-z]+\.?/gi, '')
      .replace(/\bassigned\s+in\s+Q[1-4]\.?/gi, '')
      .replace(/\s+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^[\s.,;:–—-]+|[\s,;]+$/g, '')
      .trim();

  const detailClean = stripNoise(rawDetails || '');
  const stepClean = stripNoise(fallbackStep || '');

  // Never echo the title back as its own description (e.g. "Timed Analysis Essay 1 — Timed Analysis Essay 1")
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const titleNorm = norm(title);
  const isJustTitle = (candidate: string) => {
    const cn = norm(candidate);
    if (!cn) return true;
    if (cn === titleNorm) return true;
    // Also catch "Timed Analysis Essay 1 posted for Q2" where stripping the title leaves almost nothing
    if (titleNorm.length >= 6 && cn.startsWith(titleNorm)) {
      const rest = cn.slice(titleNorm.length).replace(/^(posted|assigned|due|inclass|q[1-4]|for|as|an|assignment)+/g, '');
      if (rest.length < 6) return true;
    }
    return false;
  };

  if (detailClean && !isJustTitle(detailClean) && detailClean.length >= 8) {
    return detailClean;
  }
  if (stepClean && !isJustTitle(stepClean) && stepClean.length >= 8) {
    return stepClean;
  }
  return '';
}

export function resolveEcoModuleNumbers(item: {
  moduleNumbers?: number[];
  title?: string;
  startingStep?: string;
  contextDetails?: string;
}): number[] {
  const nums = new Set<number>();
  for (const n of item.moduleNumbers ?? []) {
    if (Number.isInteger(n) && n >= 0 && n <= 80) nums.add(n);
  }
  if (nums.size === 0) {
    const haystack = `${item.title || ''} ${item.startingStep || ''}`;
    const rangeRegex = /\b(?:modules?|mods?)\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\b/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rangeRegex.exec(haystack)) !== null) {
      const a = Number(rm[1]);
      const b = Number(rm[2]);
      if (a >= 0 && b >= a && b - a <= 6) {
        for (let k = a; k <= b; k++) nums.add(k);
      }
    }
    const listRegex = /\b(?:modules?|mods?)\s*(\d{1,2})(?:\s*(?:&|,|\band\b)\s*(\d{1,2}))*/gi;
    let lm: RegExpExecArray | null;
    while ((lm = listRegex.exec(haystack)) !== null) {
      const matchedNums = lm[0].match(/\d{1,2}/g) || [];
      for (const s of matchedNums) {
        const v = Number(s);
        if (Number.isInteger(v) && v >= 0 && v <= 80) nums.add(v);
      }
    }
  }
  return Array.from(nums).sort((a, b) => a - b);
}

export function buildEcoAudiobookLinksNote(moduleNumbers: number[]): string {
  if (!moduleNumbers.length) return '';
  const lines = moduleNumbers.map(
    (m) => `• Module ${m}: ${APES_AUDIOBOOK_WEBSITE_BASE}/?module=${m}`
  );
  return `Audiobook Website:\n${lines.join('\n')}`;
}

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
  if (!block.id.startsWith('sch-hw-')) return null;
  if (block.autoMeta?.courseId && block.autoMeta?.dueDate) {
    return {
      courseId: block.autoMeta.courseId,
      dueDate: block.autoMeta.dueDate,
      dueTiming: block.autoMeta.dueTiming || 'before-class',
      slug: block.autoMeta.slug,
    };
  }
  if (!block.notes) return null;
  const m = block.notes.match(META_TAG_REGEX);
  if (!m) return null;
  return {
    courseId: m[1].toLowerCase() as SchoolCourseId,
    dueDate: m[2],
    dueTiming: m[3].toLowerCase() as SchoolDueTiming,
    slug: m[4],
  };
}

function formatFriendlyShortDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  return `${wd} ${m}/${d}`;
}

function labelForSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '');
    const mod = u.searchParams.get('module');
    if (host.includes('ezaudiobookmaker.com')) {
      return mod !== null ? `Module ${mod} Audiobook` : 'Audiobook Site';
    }
    if (host.includes('classroom.google.com')) return 'Google Classroom';
    if (host.includes('docs.google.com')) {
      if (u.pathname.includes('/presentation/')) return 'Google Slides';
      if (u.pathname.includes('/spreadsheets/')) return 'Google Sheet';
      return 'Google Docs';
    }
    return host;
  } catch {
    return 'Open Link';
  }
}

function findHeaderIndex(notes: string, headers: string[]): number {
  let best = -1;
  for (const h of headers) {
    const idx = notes.indexOf(h);
    if (idx >= 0 && (best === -1 || idx < best)) {
      best = idx;
    }
  }
  return best;
}

function findAutoDueStartIndex(notes: string): number {
  const legacyIdx = findHeaderIndex(notes, [LEGACY_DEADLINES_HEADER, LEGACY_DUE_SECTION_HEADER]);
  if (legacyIdx >= 0) return legacyIdx;

  // Find trailing direct due/test/check block ("Due: ...", "Test: ...", "✓ ...") outside "In class:"
  const inClassIdx = findHeaderIndex(notes, [
    AUTO_INCLASS_SECTION_HEADER,
    LEGACY_INCLASS_SECTION_HEADER,
  ]);
  const lines = notes.split('\n');
  let offset = 0;
  let inClassSection = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (inClassIdx >= 0 && offset === inClassIdx) {
      inClassSection = true;
    } else if (inClassSection && trimmed === '') {
      inClassSection = false;
    }
    if (!inClassSection && DIRECT_DUE_LINE_REGEX.test(trimmed)) {
      return offset;
    }
    offset += raw.length + 1;
  }
  return -1;
}

function stripAutoDueSection(notes: string | undefined): string {
  if (!notes) return '';
  const idx = findAutoDueStartIndex(notes);
  if (idx === -1) return notes.trim();
  return notes.slice(0, idx).trim();
}

export function stripAllAutoSchoolworkSections(notes: string | undefined): string | undefined {
  if (!notes) return undefined;
  let cleaned = stripAutoDueSection(notes);
  const inClassIdx = findHeaderIndex(cleaned, [
    AUTO_INCLASS_SECTION_HEADER,
    LEGACY_INCLASS_SECTION_HEADER,
  ]);
  if (inClassIdx >= 0) {
    cleaned = cleaned.slice(0, inClassIdx).trim();
  }
  return cleaned || undefined;
}

function upsertInClassSection(notes: string | undefined, lines: string[]): string | undefined {
  const withoutDue = stripAutoDueSection(notes);
  const dueIdx = notes ? findAutoDueStartIndex(notes) : -1;
  const dueTail = dueIdx >= 0 && notes ? notes.slice(dueIdx).trim() : '';

  const inClassIdx = findHeaderIndex(withoutDue, [
    AUTO_INCLASS_SECTION_HEADER,
    LEGACY_INCLASS_SECTION_HEADER,
  ]);
  const userBase = inClassIdx >= 0 ? withoutDue.slice(0, inClassIdx).trim() : withoutDue.trim();

  const inClassBlock =
    lines.length > 0 ? `${AUTO_INCLASS_SECTION_HEADER}\n${lines.join('\n')}` : '';

  const combined = [userBase, inClassBlock, dueTail].filter(Boolean).join('\n\n').trim();
  return combined || undefined;
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
      if (blk.notes && findAutoDueStartIndex(blk.notes) >= 0) {
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
      const strippedCourse = entry.block.title.replace(
        /^\[(Eco|Lit|Pre-Calc|Physics)\]\s*/i,
        ''
      );
      const isExam = /\b(test|exam|quiz)\b/i.test(strippedCourse);
      const cleanName = strippedCourse.replace(/^Study:\s*/i, '').trim();
      if (entry.block.completed) {
        return `✓ ${cleanName}`;
      }
      return isExam ? `Test: ${cleanName}` : `Due: ${cleanName}`;
    });

    const nextNotes = [baseUserNotes, bulletLines.join('\n')]
      .filter(Boolean)
      .join('\n\n');

    // Exact 6:00 PM (18:00) Night-Before Alarm calculation:
    // Only set for today/future classes with unfinished items; never alarm on past days!
    const nightBefore6pmOffset =
      anyUnfinished && blockDate >= todayIso
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

  const getDeadlineEndMins = (candidateDate: string, eveningCutoffMins: number): number => {
    if (candidateDate === dueDate && dueTiming !== 'end-of-day') {
      const delayMode = delaysByDate[candidateDate]?.mode ?? 'regular';
      const dueClass = hasCourseClassOnDate(candidateDate, courseId, delayMode);
      if (dueClass) {
        return Math.min(eveningCutoffMins, toMins(dueClass.startTime) - 10);
      }
    }
    return eveningCutoffMins;
  };

  const tryPass = (eveningCutoffMins: number, allowEarlyMorningOnDueDate = false) => {
    for (let offset = 0; offset <= 21; offset++) {
      const candidateDate = addDays(effectiveStart, offset);
      if (candidateDate > dueDate) break;

      const delayMode = delaysByDate[candidateDate]?.mode ?? 'regular';
      const maxEndMins = getDeadlineEndMins(candidateDate, eveningCutoffMins);

      if (allowEarlyMorningOnDueDate && candidateDate === dueDate && dueTiming !== 'end-of-day') {
        const dueClass = hasCourseClassOnDate(candidateDate, courseId, delayMode);
        if (dueClass) {
          const morningEnd = toMins(dueClass.startTime) - 10;
          const morningStart =
            candidateDate === todayIso ? Math.max(6 * 60 + 15, roundedNowPlus10) : 6 * 60 + 15;
          if (morningStart + durationMins <= morningEnd) {
            const busy = existingBlocks
              .filter(
                (b) =>
                  b.date === candidateDate &&
                  !/senior privileges/i.test(b.title) &&
                  (b.kind !== 'empty-zone' || Boolean(b.assignedIdeaId || b.assignedGoalId))
              )
              .map((b) => ({ start: toMins(b.startTime), end: toMins(b.endTime) }));
            for (let cursor = morningStart; cursor + durationMins <= morningEnd; cursor += 5) {
              const end = cursor + durationMins;
              if (!busy.some((iv) => cursor < iv.end && iv.start < end)) {
                return {
                  date: candidateDate,
                  startTime: fromMins(cursor),
                  endTime: fromMins(end),
                };
              }
            }
          }
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

  // Pass 1: normal evening cap (9:30 PM), strictly before due class!
  const normal = tryPass(21 * 60 + 30);
  if (normal) return normal;

  // Pass 2: extended evening cap (11:15 PM), still strictly before due class & non-overlapping!
  const stretched = tryPass(23 * 60 + 15);
  if (stretched) return stretched;

  // Pass 3: early morning before class on dueDate (6:15 AM .. classStart - 10m), NEVER after class!
  const beforeClassMorning = tryPass(23 * 60 + 30, true);
  if (beforeClassMorning) return beforeClassMorning;

  // Pass 4: if dueTiming === 'end-of-day' or no class meeting on dueDate, try up to dueDate evening
  const dueClassOnDueDate =
    dueTiming !== 'end-of-day'
      ? hasCourseClassOnDate(dueDate, courseId, delaysByDate[dueDate]?.mode ?? 'regular')
      : null;

  if (!dueClassOnDueDate) {
    const slot = findAvailableHomeworkSlotOnDate({
      isoDate: dueDate,
      durationMins,
      existingBlocks,
      delayMode: delaysByDate[dueDate]?.mode ?? 'regular',
      minStartMins: dueDate === todayIso ? roundedNowPlus10 : undefined,
      maxEndMins: 23 * 60 + 30,
    });
    if (slot) {
      return { date: dueDate, ...slot };
    }
  }

  // Absolute last resort: ALWAYS stay on or before dueDate (before class if dueDate has class!), never AFTER the test/class!
  const fallbackDate =
    dueClassOnDueDate && effectiveStart < dueDate ? addDays(dueDate, -1) : effectiveStart;
  const delayMode = delaysByDate[fallbackDate]?.mode ?? 'regular';
  const dayEnds = existingBlocks
    .filter((b) => b.date === fallbackDate && !/senior privileges/i.test(b.title))
    .map((b) => toMins(b.endTime));
  const rawStart = Math.max(
    getEarliestHomeArrivalMinutes(fallbackDate, delayMode),
    fallbackDate === todayIso ? roundedNowPlus10 : 0,
    ...(dayEnds.length ? dayEnds : [0])
  );
  const clampedStart = Math.min(rawStart, 23 * 60 + 55 - durationMins);
  return {
    date: fallbackDate,
    startTime: fromMins(Math.max(0, clampedStart)),
    endTime: fromMins(Math.min(23 * 60 + 55, Math.max(0, clampedStart) + durationMins)),
  };
}

/**
 * If an urgent assignment due soon (e.g. tomorrow's test/review) cannot fit before 10:30 PM on `todayIso`
 * because a less-urgent auto-scheduled `sch-hw-*` block due on a LATER date (e.g. Eco due Friday) is occupying
 * tonight's slot, shifts that less-urgent block forward to the next open day strictly before its own deadline!
 */
function tryDeferLessUrgentBlockOnDate(params: {
  targetDate: string;
  urgentDueDate: string;
  workingBlocks: CalendarBlock[];
  todayIso: string;
  nowMinutesOfDay: number;
  delaysByDate?: Record<string, { mode: OhchsDelayMode }>;
}): boolean {
  const { targetDate, urgentDueDate, workingBlocks, todayIso, nowMinutesOfDay, delaysByDate = {} } =
    params;

  let movedAny = false;
  const deferCandidates = workingBlocks
    .map((blk, idx) => ({ blk, idx, meta: parseHwMetaFromBlock(blk) }))
    .filter(
      ({ blk, meta }) =>
        Boolean(meta) &&
        blk.id.startsWith('sch-hw-') &&
        !blk.completed &&
        blk.date === targetDate &&
        meta!.dueDate > urgentDueDate &&
        // Only move blocks that haven't already started yet
        (targetDate > todayIso || toMins(blk.startTime) >= nowMinutesOfDay)
    )
    .sort((a, b) => b.meta!.dueDate.localeCompare(a.meta!.dueDate));

  for (const cand of deferCandidates) {
    const durationMins = Math.max(20, toMins(cand.blk.endTime) - toMins(cand.blk.startTime));
    const nextStart = addDays(targetDate, 1);
    if (nextStart > cand.meta!.dueDate) continue;

    // Try finding a normal slot strictly before cand's own due class starting tomorrow
    const withoutSelf = workingBlocks.filter((b) => b.id !== cand.blk.id);
    const delayMode = delaysByDate[nextStart]?.mode ?? 'regular';
    let maxEndMins = 21 * 60 + 30;
    if (nextStart === cand.meta!.dueDate && cand.meta!.dueTiming !== 'end-of-day') {
      const dueClass = hasCourseClassOnDate(nextStart, cand.meta!.courseId, delayMode);
      if (dueClass) maxEndMins = Math.min(maxEndMins, toMins(dueClass.startTime) - 10);
    }

    const slot = findAvailableHomeworkSlotOnDate({
      isoDate: nextStart,
      durationMins,
      existingBlocks: withoutSelf,
      delayMode,
      maxEndMins,
    });

    if (slot) {
      workingBlocks[cand.idx] = {
        ...cand.blk,
        date: nextStart,
        startTime: slot.startTime,
        endTime: slot.endTime,
        updatedAt: new Date().toISOString(),
      };
      movedAny = true;
    }
  }

  return movedAny;
}

/**
 * Merges newly extracted standardized assignments from Gemini into existing blocks & ideas,
 * applying the exact Module Audiobook (+20% buffer) rule, 1-hour Lab on Assigned Date rule,
 * 1-hour soonest-available non-overlapping Math/Lit/Physics homework rule,
 * Class Entry 6pm Night-Before Alarm rule, and 2-Hour Missed-Window Rollover rule.
 */
function isDismissedByUser(
  courseId: SchoolCourseId,
  slug: string,
  dismissedBlockIds: Set<string>,
  dismissedIdeaIds: Set<string>
): boolean {
  const blockId = `sch-hw-${courseId}-${slug}`;
  const ideaId = `sch-idea-${courseId}-${slug}`;
  if (dismissedBlockIds.has(blockId) || dismissedIdeaIds.has(ideaId)) {
    return true;
  }

  // Also guard against minor Gemini slug variations on the SAME course (e.g. "unit-project-murder-mystery" vs "murder-mystery-project")
  const prefixBlock = `sch-hw-${courseId}-`;
  const prefixIdea = `sch-idea-${courseId}-`;
  const STOP = new Set(['the', 'and', 'for', 'with', 'part', 'unit', 'notes', 'reading', 'homework', 'hw', 'assignment', 'study']);
  const parseSlug = (s: string) => {
    const tokens = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const nums = tokens.filter((t) => /^\d+$/.test(t));
    const words = tokens.filter((t) => !/^\d+$/.test(t) && t.length >= 3 && !STOP.has(t));
    return { nums, words };
  };

  const cur = parseSlug(slug);
  if (cur.words.length === 0 && cur.nums.length === 0) return false;

  const allDismissedSlugs: string[] = [];
  for (const id of dismissedBlockIds) {
    if (id.startsWith(prefixBlock)) allDismissedSlugs.push(id.slice(prefixBlock.length));
  }
  for (const id of dismissedIdeaIds) {
    if (id.startsWith(prefixIdea)) allDismissedSlugs.push(id.slice(prefixIdea.length));
  }

  for (const dSlug of allDismissedSlugs) {
    const prev = parseSlug(dSlug);
    // Numeric identifiers (e.g. Lesson 7 vs Lesson 8, Module 15 vs 17) must match exactly
    if (cur.nums.join(',') !== prev.nums.join(',')) continue;
    if (cur.words.length === 0 || prev.words.length === 0) continue;
    const prevSet = new Set(prev.words);
    const overlap = cur.words.filter((w) => prevSet.has(w)).length;
    const minLen = Math.min(cur.words.length, prev.words.length);
    if (minLen >= 2 && overlap / minLen >= 0.75) {
      return true;
    }
  }
  return false;
}

export function applyExtractedAssignmentsToSchedule(params: {
  assignments: StandardizedExtractedAssignment[];
  existingBlocks: CalendarBlock[];
  existingIdeas: IdeaItem[];
  existingProjects: string[];
  audiobookTracks?: ApesAudiobookTrack[];
  todayIso: string;
  nowMinutesOfDay: number;
  delaysByDate?: Record<string, { mode: OhchsDelayMode }>;
  /** Block IDs manually deleted by the user in Intuition — NEVER resurrect these! */
  dismissedBlockIds?: Set<string>;
  /** Idea IDs manually deleted by the user in Intuition — NEVER resurrect these! */
  dismissedIdeaIds?: Set<string>;
}): {
  blocks: CalendarBlock[];
  ideas: IdeaItem[];
  projects: string[];
  removedBlockIds: string[];
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
    dismissedBlockIds = new Set<string>(),
    dismissedIdeaIds = new Set<string>(),
  } = params;

  const workingBlocks = existingBlocks.map((b) => ({ ...b }));
  const workingIdeas = existingIdeas.map((i) => ({ ...i }));
  const neededProjects = new Set<string>(existingProjects);
  const removedBlockIds: string[] = [];
  const inClassLinesByClassKey = new Map<string, string[]>();
  const inClassLinksByClassKey = new Map<string, Array<{ label: string; url: string }>>();

  let addedCount = 0;
  let updatedCount = 0;

  // Schedule earliest-due assignments first so urgent items claim the soonest open slots cleanly
  const sortedAssignments = [...assignments].sort((a, b) =>
    (a.dueDate || '').localeCompare(b.dueDate || '')
  );

  for (const item of sortedAssignments) {
    const course = SCHOOL_COURSES[item.courseId];
    if (!course || !item.dueDate) continue;

    // Keep last 14 days of past data + all upcoming items so history is visible on the calendar
    if (item.dueDate < addDays(todayIso, -14)) continue;

    const blockId = `sch-hw-${item.courseId}-${item.slug}`;
    const ideaId = `sch-idea-${item.courseId}-${item.slug}`;

    // Respect manual user deletions! If the user deleted this block or idea in Intuition, NEVER add it back.
    if (isDismissedByUser(item.courseId, item.slug, dismissedBlockIds, dismissedIdeaIds)) {
      continue;
    }

    const isPastItem = item.dueDate < todayIso;
    const isAlreadyDone = Boolean(item.isCompleted) || isPastItem;
    const isTestOrQuiz = item.category === 'test' || item.category === 'quiz';
    const isStrictlyInClass =
      !isTestOrQuiz &&
      (item.workLocation === 'in-class' || item.dueTiming === 'in-class');

    // ------------------------------------------------------------------
    // CASE 1: Strictly IN-CLASS work (e.g., Lit in-class essay/activity)
    // Attach directly onto the OHCHS class entry — DO NOT create a home HW block!
    // ------------------------------------------------------------------
    if (isStrictlyInClass) {
      // Remove any previously created home HW block if an earlier sync misclassified it
      const staleIdx = workingBlocks.findIndex((b) => b.id === blockId);
      if (staleIdx >= 0) {
        workingBlocks.splice(staleIdx, 1);
        removedBlockIds.push(blockId);
        updatedCount++;
      }

      const key = `${item.courseId}|${item.dueDate}`;
      const list = inClassLinesByClassKey.get(key) ?? [];
      const shortTitle = cleanAssignmentTitle(item.title, item.courseId);
      const cleanInClassDetails = cleanNoteBody(item.contextDetails, '', shortTitle);
      const snippet = cleanInClassDetails
        ? ` — ${truncateClean(cleanInClassDetails, 130)}`
        : '';
      const line = isAlreadyDone
        ? `• ✓ ${shortTitle}${snippet}`
        : `• ${shortTitle}${snippet}`;
      if (!list.includes(line)) {
        list.push(line);
        inClassLinesByClassKey.set(key, list);
      }
      if (item.sourceUrl) {
        const lk = inClassLinksByClassKey.get(key) ?? [];
        if (!lk.some((x) => x.url === item.sourceUrl)) {
          lk.push({ label: truncateClean(shortTitle, 34), url: item.sourceUrl });
          inClassLinksByClassKey.set(key, lk);
        }
      }

      // Also keep a clean reference note in the course folder
      neededProjects.add(course.projectFolder);
      const inClassTitle = `[${course.shortName}] ${shortTitle} (In class)`;
      const inClassNotes = [
        cleanInClassDetails || shortTitle,
        `In class ${formatFriendlyShortDate(item.dueDate)} · ${course.teacher}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const existingIdeaIdx = workingIdeas.findIndex((i) => i.id === ideaId);
      if (existingIdeaIdx >= 0) {
        workingIdeas[existingIdeaIdx] = {
          ...workingIdeas[existingIdeaIdx],
          title: inClassTitle,
          startingStep: item.startingStep,
          notes: inClassNotes,
          status: isAlreadyDone ? 'completed' : workingIdeas[existingIdeaIdx].status,
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
          title: inClassTitle,
          startingStep: item.startingStep,
          notes: inClassNotes,
          isBottleneck: false,
          status: isAlreadyDone ? 'completed' : 'active',
          estimatedMinutes: 0,
          createdAt: item.assignedDate || todayIso,
          updatedAt: new Date().toISOString(),
        });
        addedCount++;
      }
      continue;
    }

    // ------------------------------------------------------------------
    // CASE 2: Homework, Labs, Eco Modules, or Study Prep for a Test/Quiz
    // ------------------------------------------------------------------
    let durationMinutes = Math.max(20, Math.min(180, item.fallbackMinutes || 60));
    let durationOriginNote = '';
    const resolvedEcoModules =
      item.courseId === 'eco' ? resolveEcoModuleNumbers(item) : [];

    // Build structured 1-tap pill links (keeps Notes text completely free of raw URL clutter!)
    const blockLinks: Array<{ label: string; url: string }> = [];
    const seenLinkUrls = new Set<string>();
    const addBlockLink = (label: string, url: string | undefined) => {
      const clean = (url || '').trim().replace(/[.,;:!?]+$/, '');
      if (!clean || !/^https?:\/\//i.test(clean) || seenLinkUrls.has(clean)) return;
      seenLinkUrls.add(clean);
      blockLinks.push({ label, url: clean });
    };

    if (item.courseId === 'eco' && resolvedEcoModules.length > 0) {
      for (const m of resolvedEcoModules) {
        addBlockLink(`Module ${m} Audiobook`, `${APES_AUDIOBOOK_WEBSITE_BASE}/?module=${m}`);
      }
    }
    // Also lift any inline Google Docs / resource links out of teacher descriptions into clean pills
    const embeddedUrls = `${item.contextDetails || ''} ${item.startingStep || ''}`.match(
      /https?:\/\/[^\s)<>\]"']+/gi
    );
    for (const rawUrl of embeddedUrls ?? []) {
      addBlockLink(labelForSourceUrl(rawUrl), rawUrl);
    }
    if (item.sourceUrl) {
      addBlockLink(labelForSourceUrl(item.sourceUrl), item.sourceUrl);
    }

    // Only include a duration explanation when it's a calculated Eco Audiobook length
    // (skip obvious boilerplate like "Standard 1-hour math block" on every 60m event!)
    if (item.category === 'lab') {
      durationMinutes = 60;
    } else if (item.courseId === 'eco' && resolvedEcoModules.length > 0) {
      const audioCalc = computeEcoModulesDurationWithBuffer(
        resolvedEcoModules,
        audiobookTracks,
        1.2
      );
      if (audioCalc) {
        durationMinutes = audioCalc.bufferedMinutes;
        durationOriginNote = audioCalc.breakdownLabel;
      }
    } else if (isTestOrQuiz) {
      durationMinutes = 60;
    } else if (
      item.courseId === 'precalc' ||
      item.courseId === 'lit' ||
      item.courseId === 'physics'
    ) {
      durationMinutes = 60;
    }

    // Compute Earliest Eligible Start Date:
    // - Past items (last 14 days): place on their real historical class/assigned day before dueDate
    // - Current/upcoming Math, Lit, Physics (or any Test/Quiz study prep): soonest available starting today
    // - Eco Labs: assignedDate (or closest prior Eco class)
    // - Eco Modules/HW: closest prior Eco class date before dueDate
    let searchStartDate: string;
    if (isPastItem) {
      searchStartDate =
        item.assignedDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.assignedDate) &&
        item.assignedDate <= item.dueDate
          ? item.assignedDate
          : findClosestPriorCourseClassDate(item.dueDate, item.courseId);
    } else if (
      isTestOrQuiz ||
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

    const blockAutoMeta = {
      courseId: item.courseId,
      dueDate: item.dueDate,
      dueTiming: item.dueTiming,
      slug: item.slug,
    };
    const shortTitle = cleanAssignmentTitle(item.title, item.courseId);
    const friendlyDue = formatFriendlyShortDate(item.dueDate);
    const dueLabel = isTestOrQuiz
      ? `Test ${friendlyDue} · ${course.teacher}`
      : `Due ${friendlyDue} · ${course.teacher}`;
    const cleanBodyText = cleanNoteBody(item.contextDetails, item.startingStep, shortTitle);

    const buildNotesForDuration = (actualBlockMins?: number) => {
      let durNote = durationOriginNote;
      // Keep the note's minute count 100% consistent with the block's scheduled length
      if (
        durNote &&
        actualBlockMins &&
        actualBlockMins !== durationMinutes &&
        item.courseId === 'eco'
      ) {
        durNote = `${actualBlockMins} min = live audiobook sheet length + 20% buffer for pausing & notes`;
      }
      return [cleanBodyText, dueLabel, durNote].filter(Boolean).join('\n\n');
    };

    const titlePrefix = isTestOrQuiz && !/^study\b/i.test(shortTitle) ? 'Study: ' : '';
    const blockTitle = `[${course.shortName}] ${titlePrefix}${shortTitle}`;
    const cleanStartingStep = cleanNoteBody(item.startingStep, '', shortTitle) || shortTitle;

    // Upsert Block (preserving user manual edits to date/startTime/endTime/completed!)
    const existingIdx = workingBlocks.findIndex((b) => b.id === blockId);
    let finalBlockNotes = buildNotesForDuration();
    if (existingIdx >= 0) {
      const prev = workingBlocks[existingIdx];
      const prevDur = Math.max(15, toMins(prev.endTime) - toMins(prev.startTime));
      finalBlockNotes = buildNotesForDuration(prevDur);
      const nextCompleted = prev.completed || isAlreadyDone;
      const linksChanged = JSON.stringify(prev.links || []) !== JSON.stringify(blockLinks);
      const metaChanged = JSON.stringify(prev.autoMeta || null) !== JSON.stringify(blockAutoMeta);
      const hintChanged = prev.startingStepHint !== undefined;
      if (
        prev.title !== blockTitle ||
        prev.notes !== finalBlockNotes ||
        prev.completed !== nextCompleted ||
        linksChanged ||
        metaChanged ||
        hintChanged
      ) {
        workingBlocks[existingIdx] = {
          ...prev,
          title: blockTitle,
          completed: nextCompleted,
          startingStepHint: undefined,
          notes: finalBlockNotes,
          links: blockLinks.length ? blockLinks : undefined,
          autoMeta: blockAutoMeta,
          updatedAt: new Date().toISOString(),
        };
        updatedCount++;
      }
    } else {
      // If this item is due soon (today/tomorrow) and a less-urgent auto-block due LATER
      // is sitting on `searchStartDate`, defer the less-urgent block first so urgent tests/HW get tonight!
      if (!isAlreadyDone && item.dueDate <= addDays(todayIso, 1)) {
        tryDeferLessUrgentBlockOnDate({
          targetDate: searchStartDate,
          urgentDueDate: item.dueDate,
          workingBlocks,
          todayIso,
          nowMinutesOfDay,
          delaysByDate,
        });
      }

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
        !isAlreadyDone &&
        (isTestOrQuiz ||
          item.courseId === 'precalc' ||
          item.courseId === 'lit' ||
          item.courseId === 'physics');

      workingBlocks.push({
        id: blockId,
        date: placed.date,
        startTime: placed.startTime,
        endTime: placed.endTime,
        title: blockTitle,
        kind: 'goal-session',
        completed: isAlreadyDone,
        whyCategory: 'School',
        customColor: course.color,
        ...(promptAtStart ? { alertOffsetMinutes: 0 } : {}),
        assignedIdeaId: ideaId,
        notes: finalBlockNotes,
        ...(blockLinks.length ? { links: blockLinks } : {}),
        autoMeta: blockAutoMeta,
        updatedAt: new Date().toISOString(),
      });
      addedCount++;
    }

    // Upsert Idea in Course Folder
    neededProjects.add(course.projectFolder);
    const existingIdeaIdx = workingIdeas.findIndex((i) => i.id === ideaId);
    const linkedBlock = workingBlocks.find((b) => b.id === blockId);
    const isDone = Boolean(linkedBlock?.completed);

    if (existingIdeaIdx >= 0) {
      workingIdeas[existingIdeaIdx] = {
        ...workingIdeas[existingIdeaIdx],
        title: blockTitle,
        startingStep: cleanStartingStep,
        notes: finalBlockNotes,
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
        startingStep: cleanStartingStep,
        notes: finalBlockNotes,
        isBottleneck: item.category === 'lab' || isTestOrQuiz,
        status: isDone ? 'completed' : 'active',
        estimatedMinutes: durationMinutes,
        createdAt: item.assignedDate || todayIso,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Attach any strictly IN-CLASS work directly onto the matching OHCHS class blocks
  if (inClassLinesByClassKey.size > 0) {
    for (let i = 0; i < workingBlocks.length; i++) {
      const blk = workingBlocks[i];
      if (!blk.id.startsWith('ohchs-')) continue;
      const idMatch = blk.id.match(/^ohchs-(\d{4}-\d{2}-\d{2})-([a-z0-9]+)$/i);
      if (!idMatch) continue;
      const [, blockDate, periodKey] = idMatch;
      const matchedCourse = (Object.values(SCHOOL_COURSES) as CourseScheduleSpec[]).find((c) =>
        c.periodKeys.includes(periodKey)
      );
      if (!matchedCourse) continue;

      const lines = inClassLinesByClassKey.get(`${matchedCourse.id}|${blockDate}`);
      if (!lines || lines.length === 0) continue;

      const nextNotes = upsertInClassSection(blk.notes, lines);
      const nextLinks = inClassLinksByClassKey.get(`${matchedCourse.id}|${blockDate}`) ?? [];
      const mergedLinks = [...(blk.links ?? [])];
      for (const lk of nextLinks) {
        if (!mergedLinks.some((x) => x.url === lk.url)) mergedLinks.push(lk);
      }
      const linksChanged = JSON.stringify(blk.links ?? []) !== JSON.stringify(mergedLinks);
      if (blk.notes !== nextNotes || linksChanged) {
        workingBlocks[i] = {
          ...blk,
          notes: nextNotes,
          ...(mergedLinks.length ? { links: mergedLinks } : {}),
          updatedAt: new Date().toISOString(),
        };
        updatedCount++;
      }
    }
  }

  // Run Lifecycle Reconciler (handles past assignedDate rollover + Class Entry 6pm Night-Before Alarm!)
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
    removedBlockIds,
    addedCount,
    updatedCount,
  };
}
