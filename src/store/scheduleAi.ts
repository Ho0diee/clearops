import type { CalendarBlock, IdeaItem, ParsedLiveInput, WhyCategory } from '../types/schema';

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
  if (/(class|lecture|seminar|lab|study|exam|homework|problem set|school|quiz|thesis|course|cs\b)/.test(lower)) {
    return 'School';
  }
  if (/(gym|run|workout|strength|mobility|dentist|doctor|therapy|sleep|walk|yoga|lift|health)/.test(lower)) {
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
 * Normalize spoken speech-to-text transcripts & common mobile typos
 * ("tommorow" -> "tomorrow", "four thirty" -> "4:30", "three pm" -> "3pm", "noon" -> "12:00pm")
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

  // "half past four" -> "4:30", "quarter past three" -> "3:15"
  s = s.replace(
    /\b(half|quarter)\s+past\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi,
    (_, frac: string, hrTok: string) => {
      const h = WORD_HOURS[hrTok.toLowerCase()] ?? Number(hrTok);
      const mins = frac.toLowerCase() === 'half' ? '30' : '15';
      return `${h}:${mins}`;
    }
  );

  // Spoken hour + spoken minutes: "four thirty" -> "4:30", "five fifteen" -> "5:15", "six forty five" -> "6:45"
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(fifteen|thirty|forty[-\s]?five)\b/gi,
    (_, hWord: string, mWord: string) => {
      const h = WORD_HOURS[hWord.toLowerCase()];
      const m = /fifteen/i.test(mWord) ? '15' : /thirty/i.test(mWord) ? '30' : '45';
      return `${h}:${m}`;
    }
  );

  // Spoken hour followed by am/pm or preceded by time preposition: "for three" -> "for 3", "at five pm" -> "at 5pm"
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
      // Natural human conversational default:
      // Bare 1..6 ("at 3", "at 4:30", "for 5") means 1:00pm..6:00pm!
      // Bare 7..11 means 7:00am..11:00am; bare 12 means 12:00pm.
      if (hour >= 1 && hour <= 6) hour += 12;
    }
  }

  return hour * 60 + minuteRaw;
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
    text = text.replace(/\b(today'?s?|tonight|this\s+morning|this\s+afternoon|this\s+evening)\b/gi, ' ');
    return { date: todayIso, hasExplicitDate: true, cleanedText: text };
  }

  // Weekday names: monday..sunday
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

  // Explicit month + day: "Nov 20", "November 21st"
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

/**
 * Find the first conflict-free gap of `durationMins` on `date` between 08:30 and 21:00.
 */
function findOpenScheduleGap(
  blocks: CalendarBlock[],
  date: string,
  durationMins: number
): { startTime: string; endTime: string } {
  const dayBlocks = blocks
    .filter((b) => b.date === date && !isOpenFocusBlock(b))
    .map((b) => ({ s: toMinutes(b.startTime), e: Math.max(toMinutes(b.startTime) + 15, toMinutes(b.endTime)) }))
    .sort((a, b) => a.s - b.s);

  let cursor = 9 * 60; // Start scanning at 9:00 AM
  const dayEnd = 21 * 60;

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
    // Strip leading conversational phrasing
    .replace(
      /^(?:hey|hi|yo|ok|okay|um|uh|so|please|can you|could you|would you|will you|let'?s)+[, ]*/gi,
      ''
    )
    .replace(
      /^(?:can you|could you|would you|please)\s+/gi,
      ''
    )
    .replace(
      /^(?:i\s+have(?:\s+got)?|i'?ve\s+got|i\s+got|i\s+need\s+to|i\s+have\s+to|i\s+gotta|we\s+have|there'?s|there\s+is|add|create|schedule|put|set\s+up|set|book|block\s+out|block|fit\s+in|drop\s+in|open\s+up|open|make)\s+/i,
      ''
    )
    .replace(
      /^(?:a\s+|an\s+|my\s+|some\s+)?(?:reminder|scheduled\s+event|calendar\s+event|event|appointment|time\s+block|block)\s*(?:for\s+me\s+)?(?:to|for|about|on|that)?\s*/i,
      ''
    )
    .replace(/^remind\s+me\s*(?:to|about|for|that)?\s*/i, '')
    // Strip leading articles on common calendar nouns ("a meeting with..." -> "Meeting with...")
    .replace(/^(?:a|an)\s+(?=(?:meeting|call|shift|class|workout|session|check[- ]?in|sync|chat|dinner|lunch|coffee|dentist|doctor)\b)/i, '')
    // Strip leftover prepositions/connectors at boundaries
    .replace(/^(?:to|for|about|that|on|at|in|into)\s+/i, '')
    .replace(
      /\s+(?:on\s+my\s+(?:schedule|calendar)|to\s+my\s+(?:schedule|calendar)|on\s+the\s+(?:schedule|calendar)|in\s+my\s+(?:schedule|calendar)|right\s+here|in\s+here|here|please|thanks|thank\s+you)\s*$/gi,
      ''
    )
    .replace(/\s+(?:at|for|from|between|on|in|into|to|by|around|about)\s*$/gi, '')
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

/**
 * Schedule-Aware Natural Language Interpreter:
 * Understands everything from vague slot requests ("add ___ for the next focus slot")
 * to casual specifics ("I have work at 4:30- 6 tommorow here")
 * to reminders ("set a reminder for 3 about ___").
 */
export function interpretScheduleInput(
  rawInput: string,
  ctx: ScheduleAiContext
): ParsedLiveInput | null {
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

  // 1. Check relative time ("in 2 hours", "in 30 minutes") BEFORE duration so "in 2 hours" isn't eaten as duration
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

  // 1b. Check Duration hint ("for 45 min", "for 2 hours", "90 minutes")
  let durationMins = 60;
  const durMatch = working.match(
    /\b(?:for\s+)?(\d{1,3}(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i
  );
  if (durMatch) {
    const val = Number(durMatch[1]);
    const isHours = /^h/i.test(durMatch[2]);
    durationMins = Math.max(15, Math.min(480, Math.round(isHours ? val * 60 : val)));
    working = working.replace(durMatch[0], ' ');
  }

  // 2. Check Slot-Placement Intent ("add ___ for the next focus slot", "in my next empty zone", "add ___ next focus slot")
  const slotTargetRegex =
    /(?:\b(?:for|in|into|to|during|on|at)\s+(?:the\s+|my\s+|a\s+|an\s+)?(?:(?:next|upcoming|first|open|available)\s+)?(?:focus\s*(?:slot|zone|block|time|session)|empty\s*(?:zone|slot|block)|open\s*(?:focus\s*)?(?:slot|zone|block)|free\s*(?:slot|block|time))\b|\b(?:the\s+|my\s+)?(?:next|upcoming|first)\s+(?:open\s+)?(?:focus\s*(?:slot|zone|block|time|session)|empty\s*(?:zone|slot|block)|open\s*(?:focus\s*)?(?:slot|zone|block)|free\s*(?:slot|block|time))\b)/i;
  const slotMatch = working.match(slotTargetRegex);

  if (slotMatch) {
    const taskTitleRaw = cleanExtractedTitle(working.replace(slotMatch[0], ' '));
    const searchFromDate = hasExplicitDate ? resolvedDate : ctx.todayIso;

    const orderedOpenZones = [...ctx.blocks]
      .filter((b) => isOpenFocusBlock(b))
      .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)));

    const chosenZone = hasExplicitDate
      ? orderedOpenZones.find((b) => b.date === resolvedDate) ??
        orderedOpenZones.find((b) => b.date >= resolvedDate)
      : orderedOpenZones.find((b) => b.date >= searchFromDate) ?? orderedOpenZones[0];

    const matchedIdea = taskTitleRaw ? matchExistingIdea(taskTitleRaw, ctx.ideas) : undefined;
    const finalTitle = matchedIdea
      ? `${matchedIdea.project} #${matchedIdea.priorityRank}: ${matchedIdea.title}`
      : taskTitleRaw || ( ctx.ideas.find((i) => i.status === 'active')?.title ?? 'Deep Focus Work' );

    if (chosenZone) {
      return {
        mode: 'fill-slot',
        title: finalTitle,
        date: chosenZone.date,
        startTime: chosenZone.startTime,
        endTime: chosenZone.endTime,
        targetBlockId: chosenZone.id,
        matchedIdeaId: matchedIdea?.id,
        startingStepHint: matchedIdea?.startingStep,
        explanation: `Placed into your open Focus Slot`,
      };
    }

    // No open Empty Zone left — find the next conflict-free gap on the calendar!
    const gap = findOpenScheduleGap(ctx.blocks, searchFromDate, durationMins);
    return {
      mode: 'empty-zone',
      title: `Empty Zone — ${finalTitle}`,
      date: searchFromDate,
      startTime: gap.startTime,
      endTime: gap.endTime,
      matchedIdeaId: matchedIdea?.id,
      startingStepHint: matchedIdea?.startingStep,
      explanation: `No empty focus slot was open, so created one in your next free gap`,
    };
  }

  // 3. Extract Time Range ("at 4:30- 6", "between 2pm and 3:30pm", "from 9 to 5", "10:30 - 12")
  const rangeRegex =
    /(?:\b(?:at|from|between)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|and|until|til|through|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
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

    // If only end has am/pm (e.g. "2 to 3:30pm" or "11 to 1pm")
    if (!sMer && eMer) {
      if (eMer === 'pm' && sh >= 7 && sh <= 11 && eh >= 1 && eh <= 6) {
        sMer = 'am'; // "11 to 1pm" -> 11am to 1pm
      } else if (sh === 12 && eMer === 'pm') {
        sMer = 'pm';
      } else if (sh <= eh) {
        sMer = eMer; // "4:30 to 6pm" -> 4:30pm to 6pm
      }
    }

    startMins = resolveSingleHour(sh, sm, sMer, periodHint);
    endMins = resolveSingleHour(eh, em, eMer ?? sMer, periodHint);

    if (startMins !== null && endMins !== null && endMins <= startMins) {
      // e.g. "9 to 5" -> start=09:00, end=05:00 -> bump end +12h to 17:00!
      if (endMins + 12 * 60 <= 24 * 60) {
        endMins += 12 * 60;
      } else {
        endMins = startMins + durationMins;
      }
    }

    working = working.replace(rangeMatch[0], ' ');
  } else {
    // 4. Single Time ("at 3", "for 3", "by 4:30", "around 5pm", "3pm", "3:30")
    // Also support "in 2 hours" / "in 30 minutes"
    if (relStartMins !== null) {
      startMins = relStartMins;
      endMins = startMins + durationMins;
    } else {
      const singleTimeRegex =
        /(?:\b(at|for|by|around|from)\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/i;
      const singleMatch = working.match(singleTimeRegex);
      if (singleMatch) {
        const h = Number(singleMatch[2] ?? singleMatch[5] ?? singleMatch[8]);
        const m = Number(singleMatch[3] ?? singleMatch[6] ?? 0);
        const mer = singleMatch[4] ?? singleMatch[7] ?? singleMatch[9];
        startMins = resolveSingleHour(h, m, mer, periodHint);
        if (startMins !== null) {
          endMins = startMins + durationMins;
        }
        working = working.replace(singleMatch[0], ' ');
      } else if (periodHint) {
        startMins =
          periodHint === 'morning' ? 9 * 60 : periodHint === 'afternoon' ? 14 * 60 : 19 * 60;
        endMins = startMins + durationMins;
      }
    }
  }

  // 5. Determine Mode: Reminder vs Empty Zone vs Event
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
    const remStart = startMins !== null ? fromMinutes(startMins) : '15:00';
    return {
      mode: 'reminder',
      title: cleanedTitle || 'Reminder',
      date: resolvedDate,
      startTime: remStart,
    };
  }

  // If no explicit time was spoken at all, find the next open gap on the target date!
  let startTime: string;
  let endTime: string;
  let gapNote: string | undefined;

  if (startMins !== null) {
    startTime = fromMinutes(startMins);
    endTime = fromMinutes(endMins ?? startMins + durationMins);
  } else {
    const gap = findOpenScheduleGap(ctx.blocks, resolvedDate, durationMins);
    startTime = gap.startTime;
    endTime = gap.endTime;
    gapNote = 'Scheduled into your next open window';
  }

  if (isPureEmptyZoneRequest) {
    const zoneTitle = cleanedTitle
      ? `Empty Zone — ${cleanedTitle}`
      : 'Empty Zone — Open Focus Slot';
    return {
      mode: 'empty-zone',
      title: zoneTitle,
      date: resolvedDate,
      startTime,
      endTime,
      explanation: gapNote,
    };
  }

  const eventTitle = cleanedTitle || 'Scheduled Block';
  return {
    mode: 'event',
    title: eventTitle,
    date: resolvedDate,
    startTime,
    endTime,
    whyCategory: inferWhyFromTitle(eventTitle),
    explanation: gapNote,
  };
}
