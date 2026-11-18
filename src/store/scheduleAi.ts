import type {
  CalendarBlock,
  IdeaItem,
  MissingVoiceField,
  ParsedLiveInput,
  VoiceScheduleDraft,
  WhyCategory,
} from '../types/schema';

export interface ScheduleAiContext {
  todayIso: string;
  selectedDate: string;
  blocks: CalendarBlock[];
  ideas: IdeaItem[];
}

function addDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 55, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatFriendlyTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function isOpenFocusBlock(b: CalendarBlock): boolean {
  if (b.kind !== 'empty-zone' || b.completed) return false;
  if (b.assignedIdeaId || b.assignedGoalId) return false;
  return /open focus slot|reclaimed focus slot|^empty zone$/i.test(b.title.trim());
}

export function inferWhyFromTitle(title: string): WhyCategory {
  const lower = title.toLowerCase();
  if (
    /(class|lecture|seminar|lab|study|exam|homework|problem set|school|quiz|thesis|course|cs\b)/.test(
      lower
    )
  ) {
    return 'School';
  }
  if (
    /(gym|run|workout|strength|mobility|dentist|doctor|therapy|sleep|walk|yoga|lift|health)/.test(
      lower
    )
  ) {
    return 'Health';
  }
  if (/(family|dinner|lunch with|mom|dad|sister|brother|kids|parents|call home|date night)/.test(lower)) {
    return 'Family';
  }
  return 'Organization';
}

const WORD_HOURS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

/**
 * Normalize spoken speech-to-text transcripts, natural spoken durations, & mobile variants
 * ("tommorow" -> "tomorrow", "four thirty" -> "4:30", "an hour and a half" -> "90 minutes", "for six" -> "for 6")
 */
function normalizeSpokenTranscript(raw: string): string {
  let s = raw
    .replace(/[—–]/g, '-')
    .replace(/\b(tom+or+ow|tmrw|tmr|2mrw)\b/gi, 'tomorrow')
    .replace(/\ba\.?\s*m\.?\b/gi, 'am')
    .replace(/\bp\.?\s*m\.?\b/gi, 'pm')
    .replace(/\bat\s+noon\b/gi, 'at 12:00pm')
    .replace(/\bfor\s+noon\b/gi, 'for 12:00pm')
    .replace(/\bnoon\b/gi, '12:00pm')
    .replace(/\bmidnight\b/gi, '12:00am');

  // Spoken durations BEFORE word-hour conversion
  s = s
    .replace(/\b(?:an|one|1)\s+hour\s+(?:and\s+)?(?:a\s+)?half\b/gi, '90 minutes')
    .replace(/\b(?:a\s+half(?:\s+an)?\s+hour|half\s+an\s+hour|half\s+hour)\b/gi, '30 minutes')
    .replace(/\b(?:an|one)\s+(hours?|hrs?|hr)\b/gi, '1 hour')
    .replace(
      /\b(two|three|four|five|six|seven|eight)\s+(hours?|hrs?|hr)\b/gi,
      (_, w: string, unit: string) => `${WORD_HOURS[w.toLowerCase()]} ${unit}`
    )
    .replace(/\bfifteen\s+(minutes?|mins?|min)\b/gi, '15 minutes')
    .replace(/\btwenty\s+(minutes?|mins?|min)\b/gi, '20 minutes')
    .replace(/\bthirty\s+(minutes?|mins?|min)\b/gi, '30 minutes')
    .replace(/\bforty[-\s]?five\s+(minutes?|mins?|min)\b/gi, '45 minutes')
    .replace(/\bninety\s+(minutes?|mins?|min)\b/gi, '90 minutes');

  // "half past four" -> "4:30", "quarter past three" -> "3:15"
  s = s.replace(
    /\b(half|quarter)\s+past\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi,
    (_, frac: string, hrTok: string) => {
      const h = WORD_HOURS[hrTok.toLowerCase()] ?? Number(hrTok);
      const mins = frac.toLowerCase() === 'half' ? '30' : '15';
      return `${h}:${mins}`;
    }
  );

  // Spoken hour + spoken minutes: "four thirty" -> "4:30", "seven thirty" -> "7:30"
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(fifteen|thirty|forty[-\s]?five)\b/gi,
    (_, hWord: string, mWord: string) => {
      const h = WORD_HOURS[hWord.toLowerCase()];
      const m = /fifteen/i.test(mWord) ? '15' : /thirty/i.test(mWord) ? '30' : '45';
      return `${h}:${m}`;
    }
  );

  // Spoken hour followed by am/pm or preceded by time preposition: "for six" -> "for 6", "until eight" -> "until 8"
  s = s.replace(
    /\b(at|for|from|between|by|around|until|til|to)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (_, prep: string, hWord: string) => `${prep} ${WORD_HOURS[hWord.toLowerCase()]}`
  );
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(am|pm|o'?clock)\b/gi,
    (_, hWord: string, suf: string) => {
      const cleanSuf = /clock/i.test(suf) ? '' : suf.toLowerCase();
      return `${WORD_HOURS[hWord.toLowerCase()]}${cleanSuf}`;
    }
  );

  return s;
}

type DayPeriodHint = 'morning' | 'afternoon' | 'evening' | null;

function detectPeriodHint(text: string): DayPeriodHint {
  if (/\b(this\s+morning|in\s+the\s+morning|morning|early)\b/i.test(text)) return 'morning';
  if (/\b(tonight|this\s+evening|in\s+the\s+evening|evening|night|dinner)\b/i.test(text)) {
    return 'evening';
  }
  if (/\b(this\s+afternoon|in\s+the\s+afternoon|afternoon)\b/i.test(text)) return 'afternoon';
  return null;
}

function resolveSingleHour(
  hourRaw: number,
  minuteRaw: number,
  meridiem: string | undefined,
  periodHint: DayPeriodHint
): number | null {
  if (hourRaw < 0 || hourRaw > 23 || minuteRaw < 0 || minuteRaw > 59) return null;
  let hour = hourRaw;

  if (meridiem) {
    const m = meridiem.toLowerCase();
    if (m === 'pm' && hour < 12) hour += 12;
    if (m === 'am' && hour === 12) hour = 0;
  } else if (hour <= 12) {
    if (periodHint === 'evening') {
      if (hour >= 1 && hour <= 11) hour += 12;
    } else if (periodHint === 'afternoon') {
      if (hour >= 1 && hour <= 7) hour += 12;
    } else if (periodHint === 'morning') {
      if (hour === 12) hour = 8;
    } else {
      // Natural human conversational default: bare 1..6 ("for 6", "at 4:30", "for 3") -> 1:00pm..6:00pm
      if (hour >= 1 && hour <= 6) hour += 12;
    }
  }

  return hour * 60 + minuteRaw;
}

function resolveEndAfterStart(
  startMins: number,
  endHourRaw: number,
  endMinuteRaw: number,
  endMeridiem: string | undefined,
  periodHint: DayPeriodHint
): number | null {
  let endMins = resolveSingleHour(endHourRaw, endMinuteRaw, endMeridiem, periodHint);
  if (endMins === null) return null;
  // e.g. start is 18:00 (6pm) and user says "to 7:30" or "to 8" without "pm": 7:30 -> 19:30!
  if (!endMeridiem && endMins <= startMins && endMins + 12 * 60 < 24 * 60) {
    endMins += 12 * 60;
  }
  if (endMins <= startMins) {
    endMins = Math.min(23 * 60 + 55, startMins + 60);
  }
  return endMins;
}

function resolveDateFromText(
  normalized: string,
  todayIso: string,
  selectedDate: string
): { date: string; hasExplicitDate: boolean; cleanedText: string } {
  let text = normalized;

  if (/\bday\s+after\s+tomorrow\b/i.test(text)) {
    text = text.replace(/\b(the\s+)?day\s+after\s+tomorrow\b/gi, ' ');
    return { date: addDays(todayIso, 2), hasExplicitDate: true, cleanedText: text };
  }

  const inDaysMatch = text.match(/\bin\s+(\d{1,2})\s+days?\b/i);
  if (inDaysMatch) {
    const delta = Number(inDaysMatch[1]);
    text = text.replace(inDaysMatch[0], ' ');
    return { date: addDays(todayIso, delta), hasExplicitDate: true, cleanedText: text };
  }

  if (/\btomorrow\b/i.test(text)) {
    text = text.replace(/\btomorrow'?s?\b/gi, ' ');
    return { date: addDays(todayIso, 1), hasExplicitDate: true, cleanedText: text };
  }

  if (/\b(today|tonight|this\s+morning|this\s+afternoon|this\s+evening)\b/i.test(text)) {
    text = text.replace(
      /\b(today'?s?|tonight|this\s+morning|this\s+afternoon|this\s+evening)\b/gi,
      ' '
    );
    return { date: todayIso, hasExplicitDate: true, cleanedText: text };
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  const dowRegex =
    /\b(?:(on|this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun)\b/i;
  const dowMatch = text.match(dowRegex);
  if (dowMatch) {
    const modifier = (dowMatch[1] || '').toLowerCase();
    const targetDow = weekdays[dowMatch[2].toLowerCase()];
    const [y, m, d] = todayIso.split('-').map(Number);
    const currentDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    let diff = (targetDow - currentDow + 7) % 7;
    if (modifier === 'next' && diff === 0) diff = 7;
    else if (modifier === 'next') diff += 7;
    text = text.replace(dowMatch[0], ' ');
    return { date: addDays(todayIso, diff), hasExplicitDate: true, cleanedText: text };
  }

  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };
  const mdRegex =
    /\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  const mdMatch = text.match(mdRegex);
  if (mdMatch) {
    const year = Number(todayIso.slice(0, 4));
    const mo = months[mdMatch[1].toLowerCase()];
    const day = Number(mdMatch[2]);
    if (mo && day >= 1 && day <= 31) {
      const resolved = `${year}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      text = text.replace(mdMatch[0], ' ');
      return { date: resolved, hasExplicitDate: true, cleanedText: text };
    }
  }

  return { date: selectedDate || todayIso, hasExplicitDate: false, cleanedText: text };
}

function findOpenScheduleGap(
  blocks: CalendarBlock[],
  date: string,
  durationMins: number
): { startTime: string; endTime: string } {
  const dayBlocks = blocks
    .filter((b) => b.date === date && !isOpenFocusBlock(b))
    .map((b) => ({
      s: toMinutes(b.startTime),
      e: Math.max(toMinutes(b.startTime) + 15, toMinutes(b.endTime)),
    }))
    .sort((a, b) => a.s - b.s);

  let cursor = 9 * 60;
  for (const busy of dayBlocks) {
    if (busy.s - cursor >= durationMins) {
      return { startTime: fromMinutes(cursor), endTime: fromMinutes(cursor + durationMins) };
    }
    cursor = Math.max(cursor, busy.e);
  }

  if (cursor + durationMins <= 22 * 60) {
    return { startTime: fromMinutes(cursor), endTime: fromMinutes(cursor + durationMins) };
  }

  return { startTime: '16:00', endTime: fromMinutes(16 * 60 + durationMins) };
}

function cleanExtractedTitle(raw: string): string {
  let t = raw
    .replace(
      /^(?:hey|hi|yo|ok|okay|um|uh|so|please|can you|could you|would you|will you|let'?s)+[, ]*/gi,
      ''
    )
    .replace(/^(?:can you|could you|would you|please)(?:\s+|$)/gi, '')
    .replace(
      /^(?:i\s+have(?:\s+got)?|i'?ve\s+got|i\s+got|i\s+need\s+to|i\s+have\s+to|i\s+gotta|we\s+have|there'?s|there\s+is|add|create|schedule|put|set\s+up|set|book|block\s+out|block|fit\s+in|drop\s+in|open\s+up|open|make)(?:\s+|$)/i,
      ''
    )
    .replace(
      /^(?:a\s+|an\s+|my\s+|some\s+)?(?:reminder|scheduled\s+event|calendar\s+event|event|appointment|time\s+block|block)\s*(?:for\s+me\s+)?(?:(?:to|for|about|on|that)(?:\s+|$))?\s*/i,
      ''
    )
    .replace(/^remind(?:\s+me)?\s*(?:(?:to|about|for|that)(?:\s+|$))?\s*/i, '')
    // Strip leading bare articles ("add a family dinner" -> "Family dinner", "add a" -> "")
    .replace(/^(?:a|an|the|my|some)(?:\s+|$)/i, '')
    .replace(/^(?:to|for|about|that|on|at|in|into|from|until|til)(?:\s+|$)/i, '')
    .replace(
      /\s+(?:on\s+my\s+(?:schedule|calendar)|to\s+my\s+(?:schedule|calendar)|on\s+the\s+(?:schedule|calendar)|in\s+my\s+(?:schedule|calendar)|right\s+here|in\s+here|here|please|thanks|thank\s+you)\s*$/gi,
      ''
    )
    .replace(/\s+(?:at|for|from|between|on|in|into|to|by|around|about|until|til|end|ending|ends)\s*$/gi, '')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (t) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return t;
}

function matchExistingIdea(title: string, ideas: IdeaItem[]): IdeaItem | undefined {
  const needle = title.toLowerCase().trim();
  if (needle.length < 3) return undefined;
  return ideas.find((idea) => {
    if (idea.status === 'waiting-on' || idea.status === 'completed') return false;
    const hay = idea.title.toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });
}

function buildMissingPrompt(
  mode: VoiceScheduleDraft['mode'],
  missing: MissingVoiceField[],
  knownStart?: string
): string {
  if (missing.length === 0) {
    return 'Complete — tap ✓ or press Enter to add';
  }
  if (mode === 'fill-slot') {
    return 'Say what task to place in this Focus Slot';
  }
  if (mode === 'reminder') {
    if (missing.includes('title') && missing.includes('startTime')) {
      return 'Say what & when — e.g. "for 3 about guest code"';
    }
    if (missing.includes('title')) {
      return 'Say what the reminder is about';
    }
    if (missing.includes('startTime')) {
      return 'Say what time — e.g. "for 3" or "at 4:30"';
    }
    return 'Say which day — e.g. "today" or "tomorrow"';
  }

  // Event / Empty Zone progressive guidance
  const needTitle = missing.includes('title');
  const needDate = missing.includes('date');
  const needStart = missing.includes('startTime');
  const needEnd = missing.includes('endTime');
  const suggestedEnd = knownStart
    ? formatFriendlyTime(fromMinutes(toMinutes(knownStart) + 60)).replace(':00', '')
    : '7:30pm';

  if (needTitle && needStart) {
    return 'Speak event, day & time — e.g. "Family dinner for 6 today to 7:30"';
  }
  if (needTitle) {
    return 'Say what the event is (e.g. "Family dinner")';
  }
  if (needDate && needStart) {
    return 'Say day & start time — e.g. "for 6 today"';
  }
  if (needDate && needEnd) {
    return `Say which day & end time — e.g. "today to ${suggestedEnd}"`;
  }
  if (needDate) {
    return 'Say which day — e.g. "today" or "tomorrow"';
  }
  if (needStart) {
    return 'Say start & end time — e.g. "from 6 to 7:30"';
  }
  if (needEnd) {
    return `Say end time — e.g. "to ${suggestedEnd}" or "for 1 hour"`;
  }
  return 'Keep speaking to finish details…';
}

/**
 * Progressive Live Voice Interpreter:
 * Extracts ONLY what the user has genuinely spoken so far, leaving unmentioned slots
 * (such as `endTime` when user has only said "add a family dinner for 6 today") undefined
 * and listing exact `missingFields` + `nextPrompt` so the calendar can pop to the known
 * day/time immediately while showing what else to say to finish the add.
 */
export function parseProgressiveVoiceDraft(
  rawInput: string,
  ctx: ScheduleAiContext
): VoiceScheduleDraft | null {
  const rawTrimmed = rawInput.trim();
  if (!rawTrimmed) return null;

  const normalized = normalizeSpokenTranscript(rawTrimmed);
  const periodHint = detectPeriodHint(normalized);
  const { date: resolvedDate, hasExplicitDate, cleanedText: afterDate } = resolveDateFromText(
    normalized,
    ctx.todayIso,
    ctx.selectedDate
  );

  let working = afterDate;

  // 1. Relative start time ("in 2 hours", "in 30 minutes")
  let relStartMins: number | null = null;
  const relTimeMatch = working.match(/\bin\s+(\d{1,2})\s*(hours?|hrs?|minutes?|mins?)\b/i);
  if (relTimeMatch) {
    const now = new Date();
    const baseM = now.getHours() * 60 + now.getMinutes();
    const delta = /^h/i.test(relTimeMatch[2])
      ? Number(relTimeMatch[1]) * 60
      : Number(relTimeMatch[1]);
    relStartMins = Math.min(23 * 60 + 30, Math.ceil((baseM + delta) / 5) * 5);
    working = working.replace(relTimeMatch[0], ' ');
  }

  // 2. Explicit duration ("for 1 hour", "for 45 minutes", "90 minutes")
  let explicitDurationMins: number | null = null;
  const durMatch = working.match(
    /\b(?:for\s+)?(\d{1,3}(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i
  );
  if (durMatch) {
    const val = Number(durMatch[1]);
    const isHours = /^h/i.test(durMatch[2]);
    explicitDurationMins = Math.max(15, Math.min(480, Math.round(isHours ? val * 60 : val)));
    working = working.replace(durMatch[0], ' ');
  }

  // 3. Slot-placement intent ("add ___ for the next focus slot")
  const slotTargetRegex =
    /(?:\b(?:for|in|into|to|during|on|at)\s+(?:the\s+|my\s+|a\s+|an\s+)?(?:(?:next|upcoming|first|open|available)\s+)?(?:focus\s*(?:slot|zone|block|time|session)|empty\s*(?:zone|slot|block)|open\s*(?:focus\s*)?(?:slot|zone|block)|free\s*(?:slot|block|time))\b|\b(?:the\s+|my\s+)?(?:next|upcoming|first)\s+(?:open\s+)?(?:focus\s*(?:slot|zone|block|time|session)|empty\s*(?:zone|slot|block)|open\s*(?:focus\s*)?(?:slot|zone|block)|free\s*(?:slot|block|time))\b)/i;
  const slotMatch = working.match(slotTargetRegex);

  if (slotMatch) {
    const taskTitleRaw = cleanExtractedTitle(working.replace(slotMatch[0], ' '));
    const searchFromDate = hasExplicitDate ? resolvedDate : ctx.todayIso;
    const orderedOpenZones = [...ctx.blocks]
      .filter((b) => isOpenFocusBlock(b))
      .sort((a, b) =>
        a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
      );

    const chosenZone = hasExplicitDate
      ? orderedOpenZones.find((b) => b.date === resolvedDate) ??
        orderedOpenZones.find((b) => b.date >= resolvedDate)
      : orderedOpenZones.find((b) => b.date >= searchFromDate) ?? orderedOpenZones[0];

    const matchedIdea = taskTitleRaw ? matchExistingIdea(taskTitleRaw, ctx.ideas) : undefined;
    const finalTitle = matchedIdea
      ? `${matchedIdea.project} #${matchedIdea.priorityRank}: ${matchedIdea.title}`
      : taskTitleRaw || undefined;

    const missing: MissingVoiceField[] = finalTitle ? [] : ['title'];

    if (chosenZone) {
      return {
        rawTranscript: rawTrimmed,
        mode: 'fill-slot',
        title: finalTitle,
        date: chosenZone.date,
        dateSpoken: true,
        startTime: chosenZone.startTime,
        endTime: chosenZone.endTime,
        targetBlockId: chosenZone.id,
        matchedIdeaId: matchedIdea?.id,
        startingStepHint: matchedIdea?.startingStep,
        missingFields: missing,
        nextPrompt: buildMissingPrompt('fill-slot', missing),
        isComplete: missing.length === 0,
      };
    }

    const gap = findOpenScheduleGap(ctx.blocks, searchFromDate, explicitDurationMins ?? 60);
    return {
      rawTranscript: rawTrimmed,
      mode: 'empty-zone',
      title: finalTitle ? `Empty Zone — ${finalTitle}` : undefined,
      date: searchFromDate,
      dateSpoken: true,
      startTime: gap.startTime,
      endTime: gap.endTime,
      matchedIdeaId: matchedIdea?.id,
      startingStepHint: matchedIdea?.startingStep,
      missingFields: missing,
      nextPrompt: buildMissingPrompt('fill-slot', missing),
      isComplete: missing.length === 0,
    };
  }

  // 4. Time Range ("for 6 to 7:30", "at 4:30- 6", "between 2pm and 3:30pm")
  const rangeRegex =
    /(?:\b(?:at|from|between|for)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|and|until|til|through|ending\s+at|ends?\s+at|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const rangeMatch = working.match(rangeRegex);

  let startMins: number | null = null;
  let endMins: number | null = null;

  if (rangeMatch) {
    const sh = Number(rangeMatch[1]);
    const sm = rangeMatch[2] ? Number(rangeMatch[2]) : 0;
    let sMer = rangeMatch[3]?.toLowerCase();
    const eh = Number(rangeMatch[4]);
    const em = rangeMatch[5] ? Number(rangeMatch[5]) : 0;
    const eMer = rangeMatch[6]?.toLowerCase();

    if (!sMer && eMer) {
      if (eMer === 'pm' && sh >= 7 && sh <= 11 && eh >= 1 && eh <= 6) {
        sMer = 'am';
      } else if (sh === 12 && eMer === 'pm') {
        sMer = 'pm';
      } else if (sh <= eh) {
        sMer = eMer;
      }
    }

    startMins = resolveSingleHour(sh, sm, sMer, periodHint);
    if (startMins !== null) {
      endMins = resolveEndAfterStart(startMins, eh, em, eMer ?? sMer, periodHint);
    }
    working = working.replace(rangeMatch[0], ' ');
  } else {
    // 5. Single Start Time ("for 6", "at 4:30", "3pm") + optional separated End Time ("...until 7:30", "...end at 8", or trailing "7:30")
    if (relStartMins !== null) {
      startMins = relStartMins;
      if (explicitDurationMins !== null) {
        endMins = Math.min(23 * 60 + 55, startMins + explicitDurationMins);
      }
    } else {
      const singleTimeRegex =
        /(?:\b(at|for|by|around|from)\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/i;
      const singleMatch = working.match(singleTimeRegex);
      if (singleMatch) {
        const h = Number(singleMatch[2] ?? singleMatch[5] ?? singleMatch[8]);
        const m = Number(singleMatch[3] ?? singleMatch[6] ?? 0);
        const mer = singleMatch[4] ?? singleMatch[7] ?? singleMatch[9];
        startMins = resolveSingleHour(h, m, mer, periodHint);
        working = working.replace(singleMatch[0], ' ');

        if (startMins !== null) {
          // Check if user also spoke a separated end time ("until 7:30", "to 8", "end at 7:30")
          const sepEndRegex =
            /\b(?:until|til|through|ending\s+at|ends?\s+at|finish(?:es|ing)?\s+at|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
          const sepEndMatch = working.match(sepEndRegex);
          if (sepEndMatch) {
            endMins = resolveEndAfterStart(
              startMins,
              Number(sepEndMatch[1]),
              Number(sepEndMatch[2] ?? 0),
              sepEndMatch[3],
              periodHint
            );
            working = working.replace(sepEndMatch[0], ' ');
          } else if (explicitDurationMins !== null) {
            endMins = Math.min(23 * 60 + 55, startMins + explicitDurationMins);
          } else {
            // Also support bare follow-up time spoken at the end ("add a family dinner for 6 today 7:30")
            const bareSecondTime = working.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\s*$|\b(\d{1,2})\s*(am|pm)\s*$/i);
            if (bareSecondTime) {
              const bh = Number(bareSecondTime[1] ?? bareSecondTime[4]);
              const bm = Number(bareSecondTime[2] ?? 0);
              const bmer = bareSecondTime[3] ?? bareSecondTime[5];
              endMins = resolveEndAfterStart(startMins, bh, bm, bmer, periodHint);
              working = working.replace(bareSecondTime[0], ' ');
            }
          }
        }
      }
    }
  }

  // 6. Mode classification
  const isPureEmptyZoneRequest =
    /\b(empty\s*zone|focus\s*slot|focus\s*zone|open\s*slot)\b/i.test(working);
  const isReminder = !isPureEmptyZoneRequest && /\b(remind(?:\s+me)?|reminder)\b/i.test(rawTrimmed);

  if (isPureEmptyZoneRequest) {
    working = working.replace(
      /\b(?:an?\s+|new\s+)?(?:empty\s*zone|focus\s*slot|focus\s*zone|open\s*slot)\s*(?:for|to|on)?\s*/gi,
      ' '
    );
  }

  const cleanedTitle = cleanExtractedTitle(working);

  if (isReminder) {
    const hasDate = hasExplicitDate || startMins !== null;
    const remDate = hasDate ? (hasExplicitDate ? resolvedDate : ctx.todayIso) : undefined;
    const remStart = startMins !== null ? fromMinutes(startMins) : undefined;
    const missing: MissingVoiceField[] = [];
    if (!cleanedTitle) missing.push('title');
    if (!remDate) missing.push('date');
    if (!remStart) missing.push('startTime');

    return {
      rawTranscript: rawTrimmed,
      mode: 'reminder',
      title: cleanedTitle || undefined,
      date: remDate,
      dateSpoken: hasExplicitDate,
      startTime: remStart,
      missingFields: missing,
      nextPrompt: buildMissingPrompt('reminder', missing),
      isComplete: missing.length === 0,
    };
  }

  const mode: 'event' | 'empty-zone' = isPureEmptyZoneRequest ? 'empty-zone' : 'event';
  const effectiveTitle = isPureEmptyZoneRequest
    ? cleanedTitle
      ? `Empty Zone — ${cleanedTitle}`
      : 'Empty Zone — Open Focus Slot'
    : cleanedTitle || undefined;

  const knownDate = hasExplicitDate ? resolvedDate : undefined;
  const knownStart = startMins !== null ? fromMinutes(startMins) : undefined;
  const knownEnd = endMins !== null ? fromMinutes(endMins) : undefined;

  const missing: MissingVoiceField[] = [];
  if (!effectiveTitle) missing.push('title');
  if (!knownDate) missing.push('date');
  if (!knownStart) missing.push('startTime');
  if (!knownEnd) missing.push('endTime');

  return {
    rawTranscript: rawTrimmed,
    mode,
    title: effectiveTitle,
    date: knownDate,
    dateSpoken: hasExplicitDate,
    startTime: knownStart,
    endTime: knownEnd,
    whyCategory:
      mode === 'event' && effectiveTitle ? inferWhyFromTitle(effectiveTitle) : undefined,
    missingFields: missing,
    nextPrompt: buildMissingPrompt(mode, missing, knownStart),
    isComplete: missing.length === 0,
  };
}

/**
 * Full single-shot interpreter (retained for backwards compatibility with any direct command calls).
 */
export function interpretScheduleInput(
  rawInput: string,
  ctx: ScheduleAiContext
): ParsedLiveInput | null {
  const draft = parseProgressiveVoiceDraft(rawInput, ctx);
  if (!draft) return null;

  const date = draft.date ?? (ctx.selectedDate || ctx.todayIso);

  if (draft.mode === 'fill-slot' && draft.targetBlockId && draft.startTime) {
    return {
      mode: 'fill-slot',
      title: draft.title ?? 'Deep Focus Work',
      date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      targetBlockId: draft.targetBlockId,
      matchedIdeaId: draft.matchedIdeaId,
      startingStepHint: draft.startingStepHint,
      explanation: 'Placed into your open Focus Slot',
    };
  }

  if (draft.mode === 'reminder') {
    return {
      mode: 'reminder',
      title: draft.title ?? 'Reminder',
      date,
      startTime: draft.startTime ?? '15:00',
    };
  }

  let startTime = draft.startTime;
  let endTime = draft.endTime;
  let explanation: string | undefined;

  if (!startTime) {
    const gap = findOpenScheduleGap(ctx.blocks, date, 60);
    startTime = gap.startTime;
    endTime = gap.endTime;
    explanation = 'Scheduled into your next open window';
  } else if (!endTime) {
    endTime = fromMinutes(toMinutes(startTime) + 60);
  }

  const title = draft.title ?? 'Scheduled Block';
  return {
    mode: draft.mode === 'empty-zone' ? 'empty-zone' : 'event',
    title,
    date,
    startTime,
    endTime,
    whyCategory: draft.mode === 'event' ? draft.whyCategory ?? inferWhyFromTitle(title) : undefined,
    matchedIdeaId: draft.matchedIdeaId,
    startingStepHint: draft.startingStepHint,
    explanation,
  };
}
