import type {
  CalendarBlock,
  EventColorId,
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
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(total)));
  if (clamped === 24 * 60) return '24:00';
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatFriendlyTime(hhmm: string): string {
  const [hRaw, m] = hhmm.split(':').map(Number);
  const h = hRaw % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function isOpenFocusBlock(b: CalendarBlock): boolean {
  if (b.kind !== 'empty-zone' || b.completed) return false;
  if (b.assignedIdeaId || b.assignedGoalId) return false;
  return /open focus slot|reclaimed focus slot|^empty zone$/i.test(b.title.trim());
}

export function inferWhyFromTitle(title: string, rawContext = ''): WhyCategory {
  const lower = `${title} ${rawContext}`.toLowerCase();
  if (
    /(class|lecture|seminar|lab|study|exam|homework|problem set|school|quiz|thesis|course|calculus|chemistry|organic|biology|physics|math|cs\b)/.test(
      lower
    )
  ) {
    return 'School';
  }
  if (
    /(gym|run|workout|strength|mobility|dentist|doctor|therapy|sleep|walk|yoga|lift|health|haircut|barber|vet|leg day|upper body|cardio|pt\b)/.test(
      lower
    )
  ) {
    return 'Health';
  }
  if (
    /(family|dinner|lunch with|mom|mum|dad|mother|father|sister|brother|grandma|grandpa|aunt|uncle|cousin|kids|parents|call home|date night|birthday|anniversary|wedding)/.test(
      lower
    )
  ) {
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

type DayPeriodHint = 'morning' | 'afternoon' | 'evening' | null;

function detectPeriodHint(text: string): DayPeriodHint {
  if (/\b(this\s+morning|in\s+the\s+morning|morning|early|breakfast)\b/i.test(text)) {
    return 'morning';
  }
  if (
    /\b(tonight|this\s+evening|in\s+the\s+evening|evening|night|dinner|birthday|party|anniversary|drinks|date\s+night)\b/i.test(
      text
    )
  ) {
    return 'evening';
  }
  if (/\b(this\s+afternoon|in\s+the\s+afternoon|afternoon|lunch)\b/i.test(text)) {
    return 'afternoon';
  }
  return null;
}

/**
 * Acoustic & Speech-to-Text Normalizer:
 * Repairs real-world Web Speech API & mobile dictation quirks discovered via acoustic WAV testing:
 *  - "four to five" misheard as "4:50", "4 50", "45", "4 2 5", "425", "foreign 5"
 *  - "8 30" / "6 15" space-separated hour + minute without colon -> "8:30" / "6:15"
 *  - "at a meeting" / "at workout" at start of speech ("add" flapped to "at") -> "add ..."
 *  - "change the names a X" -> "change the name to X"
 *  - "way to actually" -> "wait actually"
 *  - Spoken word numbers & durations ("four to five" -> "4 to 5", "an hour and a half" -> "90 minutes")
 */
export function normalizeSpokenTranscript(raw: string): string {
  let s = raw
    .replace(/[—–]/g, '-')
    .replace(/\b(tom+or+ow|tmrw|tmr|2mrw|tamayo)\b/gi, 'tomorrow')
    .replace(/\ba\.?\s*m\.?\b/gi, 'am')
    .replace(/\bp\.?\s*m\.?\b/gi, 'pm')
    .replace(/\bwork\s+out\b/gi, 'workout')
    .replace(/\bsaid\s+(?=(?:a\s+|an\s+|my\s+)?(?:reminder|event|appointment|block|up)\b)/gi, 'set ')
    .replace(/\b(?:way\s+to|we)\s+actually\b/gi, 'wait actually')
    .replace(
      /\bchange\s+(?:the\s+)?names?\s+(?:to|a|of|is)\s+/gi,
      'change the name to '
    )
    .replace(/\bforeign\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi, '4 and $1')
    .replace(/\bbetween\s+for\s+and\s+/gi, 'between 4 and ')
    .replace(/\bat\s+noon\b/gi, 'at 12:00pm')
    .replace(/\bfor\s+noon\b/gi, 'for 12:00pm')
    .replace(/\bnoon\b/gi, '12:00pm')
    .replace(/\bmidnight\b/gi, '12:00am');

  // Acoustic flap at start of utterance: "At a family dinner..." / "At workout..." ("Add" heard as "At")
  s = s.replace(
    /^(\s*(?:hey\s+|ok\s+|okay\s+|um\s+|uh\s+|to\s+)?)at\s+(?=(?:a|an|my|some|workout|dinner|lunch|breakfast|meeting|dentist|doctor|study|gym|work|class|call|coffee|family|mom'?s|dad'?s|shoot|patio)\b)/i,
    '$1add '
  );

  // Spoken durations BEFORE word-hour conversion
  s = s
    .replace(/\b(?:an|one|1)\s+hour\s+(?:and\s+)?(?:a\s+)?half\b/gi, '90 minutes')
    .replace(/\b(?:a\s+half(?:\s+an)?\s+hour|half\s+an\s+hour|half\s+hour)\b/gi, '30 minutes')
    .replace(/\b(?:an|one)\s+(hours?|hrs?|hr)\b/gi, '1 hour')
    .replace(
      /\b(two|three|four|five|six|seven|eight)\s+(hours?|hrs?|hr)\b/gi,
      (_, w: string, unit: string) => `${WORD_HOURS[w.toLowerCase()]} ${unit}`
    )
    .replace(/\b(?:one|1)\s+(minutes?|mins?|min)\b/gi, '1 minute')
    .replace(/\b(?:two)\s+(minutes?|mins?|min)\b/gi, '2 minutes')
    .replace(/\b(?:three)\s+(minutes?|mins?|min)\b/gi, '3 minutes')
    .replace(/\b(?:five)\s+(minutes?|mins?|min)\b/gi, '5 minutes')
    .replace(/\b(?:ten)\s+(minutes?|mins?|min)\b/gi, '10 minutes')
    .replace(/\bfifteen\s+(minutes?|mins?|min)\b/gi, '15 minutes')
    .replace(/\btwenty\s+(minutes?|mins?|min)\b/gi, '20 minutes')
    .replace(/\bthirty\s+(minutes?|mins?|min)\b/gi, '30 minutes')
    .replace(/\bforty[-\s]?five\s+(minutes?|mins?|min)\b/gi, '45 minutes')
    .replace(/\bninety\s+(minutes?|mins?|min)\b/gi, '90 minutes');

  // "half past four" -> "4:30", "quarter past three" -> "3:15", "quarter to five" -> "4:45"
  s = s.replace(
    /\b(half|quarter)\s+past\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi,
    (_, frac: string, hrTok: string) => {
      const h = WORD_HOURS[hrTok.toLowerCase()] ?? Number(hrTok);
      const mins = frac.toLowerCase() === 'half' ? '30' : '15';
      return `${h}:${mins}`;
    }
  );
  s = s.replace(
    /\bquarter\s+(?:to|til)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi,
    (_, hrTok: string) => {
      const h = WORD_HOURS[hrTok.toLowerCase()] ?? Number(hrTok);
      const prevH = h === 1 ? 12 : h - 1;
      return `${prevH}:45`;
    }
  );

  // Spoken hour + spoken minutes: "four thirty" -> "4:30", "eight thirty" -> "8:30"
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(fifteen|thirty|forty[-\s]?five)\b/gi,
    (_, hWord: string, mWord: string) => {
      const h = WORD_HOURS[hWord.toLowerCase()];
      const m = /fifteen/i.test(mWord) ? '15' : /thirty/i.test(mWord) ? '30' : '45';
      return `${h}:${m}`;
    }
  );

  // Spoken word-to-word or word-to-digit ranges ("four to five" -> "4 to 5", "four - 5" -> "4 - 5")
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(to|until|til|through|and|-)\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2}(?::\d{2})?)\b/gi,
    (_, left: string, sep: string, right: string) => {
      const lh = WORD_HOURS[left.toLowerCase()];
      const rh = WORD_HOURS[right.toLowerCase()] ?? right;
      return `${lh} ${sep} ${rh}`;
    }
  );
  s = s.replace(
    /\b(\d{1,2}(?::\d{2})?)\s*(to|until|til|through|and|-)\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (_, left: string, sep: string, right: string) => `${left} ${sep} ${WORD_HOURS[right.toLowerCase()]}`
  );

  // Spoken hour after prepositions or before am/pm ("for six" -> "for 6", "start at five" -> "start at 5")
  s = s.replace(
    /\b(at|for|from|between|by|around|until|til|to|it)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (_, prep: string, hWord: string) => `${prep} ${WORD_HOURS[hWord.toLowerCase()]}`
  );
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(am|pm|o'?clock)\b/gi,
    (_, hWord: string, suf: string) => {
      const cleanSuf = /clock/i.test(suf) ? '' : suf.toLowerCase();
      return `${WORD_HOURS[hWord.toLowerCase()]}${cleanSuf}`;
    }
  );

  // Space-separated hour + quarter-hour minute from acoustic STT: "8 30" -> "8:30", "6 15" -> "6:15"
  s = s.replace(
    /\b(1[0-2]|[1-9])\s+(15|30|45)\b(?!\s*(?:hours?|hrs?|hr|minutes?|mins?|min|days?|am|pm|:)\b)/gi,
    '$1:$2'
  );

  // Acoustic STT "4 2 5" or "425" ("to" heard as "2"):
  s = s.replace(/\b(1[0-2]|[1-9])\s+2\s+(1[0-2]|[1-9])\b/g, '$1 to $2');
  s = s.replace(
    /\b([1-8])2([2-9])\b/g,
    (full: string, a: string, b: string) => (Number(b) > Number(a) ? `${a} to ${b}` : full)
  );

  // Acoustic STT consecutive-hour fusion ("from 45 tomorrow" / "gym 45 today" -> "4 to 5", "at 67" -> "6 to 7")
  // Never touches ":45" (preceded by colon) or "45 minutes" (followed by unit)!
  s = s.replace(
    /(?<![:\d])\b(23|34|45|56|67|78|89)\b(?!\s*(?:minutes?|mins?|min|hours?|hrs?|hr|days?|am|pm|%|\$))/gi,
    (numStr: string) => `${numStr[0]} to ${numStr[1]}`
  );
  s = s.replace(
    /\b(from|between)\s+(12|13|14|24|25|35|36|46|47|57|58|68|69)\b(?!\s*(?:minutes?|mins?|min|hours?|hrs?|am|pm|:|\s+to\b|\s+and\b))/gi,
    (_, prep: string, pair: string) => `${prep} ${pair[0]} to ${pair[1]}`
  );

  // Re-run space-separated minute normalization in case "45 30" expanded to "4 to 5 30" -> "4 to 5:30"!
  s = s.replace(
    /\b(1[0-2]|[1-9])\s+(15|30|45)\b(?!\s*(?:hours?|hrs?|hr|minutes?|mins?|min|days?|am|pm|:)\b)/gi,
    '$1:$2'
  );

  // Acoustic STT "four to five" -> "4:50" / "4 50" (because "five" & "fifty" both begin with /f/!):
  // Only rewrites when NOT followed by an explicit end-time connector ("4:50 to 5:30" stays 4:50–5:30!).
  s = s.replace(
    /\b([1-4])(?::50|\s+50)(?:\s*(am|pm))?\b(?!\s*(?:to|until|til|through|and|-)\s*\d)/gi,
    (_, hStr: string, mer?: string) => `${hStr} to 5${mer || ''}`
  );
  s = s.replace(
    /\b(from|between)\s+([5-9]|1[0-1])(?::50|\s+50)(?:\s*(am|pm))?\b(?!\s*(?:to|until|til|through|and|-)\s*\d)/gi,
    (_, prep: string, hStr: string, mer?: string) => {
      const h = Number(hStr);
      const nextH = h === 12 ? 1 : h + 1;
      return `${prep} ${h} to ${nextH}${mer || ''}`;
    }
  );

  return s;
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
      // Keep 1..11 as AM and 12 as 12:00pm (noon)
    } else {
      // Conversational default: bare 1..6 ("4 to 5", "for 6", "for 3") -> 1:00pm..6:00pm
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
  if (endHourRaw === 12 && endMinuteRaw === 0 && endMeridiem?.toLowerCase() === 'am' && startMins > 0) {
    return 24 * 60;
  }
  let endMins = resolveSingleHour(endHourRaw, endMinuteRaw, endMeridiem, periodHint);
  if (endMins === null) return null;
  if (!endMeridiem && endMins <= startMins && endMins + 12 * 60 <= 24 * 60) {
    endMins += 12 * 60;
  }
  if (endMins <= startMins) {
    endMins = Math.min(24 * 60, startMins + 60);
  }
  return endMins;
}

interface DateMatchToken {
  date: string;
  start: number;
  end: number;
}

/**
 * Finds ALL explicit date mentions in `text` sorted by position so the LATEST spoken date wins
 * (e.g. "tomorrow ... wait make it today" -> resolves to Today!).
 */
function extractAllDatesChronological(text: string, todayIso: string): DateMatchToken[] {
  const matches: DateMatchToken[] = [];

  const pushAll = (re: RegExp, resolver: (m: RegExpExecArray) => string | null) => {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const globalRe = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(text)) !== null) {
      const iso = resolver(m);
      if (iso) {
        matches.push({ date: iso, start: m.index, end: m.index + m[0].length });
      }
    }
  };

  pushAll(/\b(?:the\s+)?day\s+after\s+tomorrow\b/gi, () => addDays(todayIso, 2));
  pushAll(/\bin\s+(\d{1,2})\s+days?\b/gi, (m) => addDays(todayIso, Number(m[1])));
  pushAll(/\btomorrow'?s?\b/gi, () => addDays(todayIso, 1));
  pushAll(/\b(?:today'?s?|tonight|this\s+morning|this\s+afternoon|this\s+evening)\b/gi, () => todayIso);

  const weekdays: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };
  pushAll(
    /\b(?:(on|this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun)\b/gi,
    (m) => {
      const modifier = (m[1] || '').toLowerCase();
      const targetDow = weekdays[m[2].toLowerCase()];
      const [y, mo, d] = todayIso.split('-').map(Number);
      const currentDow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
      let diff = (targetDow - currentDow + 7) % 7;
      if (modifier === 'next' && diff === 0) diff = 7;
      else if (modifier === 'next') diff += 7;
      return addDays(todayIso, diff);
    }
  );

  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };
  pushAll(
    /\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
    (m) => {
      const year = Number(todayIso.slice(0, 4));
      const mo = months[m[1].toLowerCase()];
      const day = Number(m[2]);
      if (!mo || day < 1 || day > 31) return null;
      return `${year}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  );

  // Deduplicate overlapping spans (keep longest span, e.g. "day after tomorrow" over "tomorrow")
  matches.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - a.end));
  const filtered: DateMatchToken[] = [];
  for (const tok of matches) {
    const prev = filtered[filtered.length - 1];
    if (prev && tok.start < prev.end) continue;
    filtered.push(tok);
  }
  return filtered;
}

function stripSpans(text: string, spans: { start: number; end: number }[]): string {
  if (!spans.length) return text;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const sp of sorted) {
    if (sp.start > cursor) {
      out += text.slice(cursor, sp.start) + ' ';
    }
    cursor = Math.max(cursor, sp.end);
  }
  out += text.slice(cursor);
  return out;
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

function formatPossessiveNoun(ownerRaw: string): string {
  const clean = ownerRaw.trim().replace(/'s$/i, '');
  const singularized = clean.replace(
    /^(mom|mum|dad|mother|father|sister|brother|grandma|grandpa|nana|papa|aunt|uncle|cousin|wife|husband|partner|boss|friend|doctor|dentist)s$/i,
    '$1'
  );
  const cap = singularized.charAt(0).toUpperCase() + singularized.slice(1).toLowerCase();
  return /s$/i.test(cap) ? `${cap}'` : `${cap}'s`;
}

const SMALL_TITLE_WORDS = new Set(['w/', 'to', 'for', 'of', 'in', 'on', 'at', '&', 'vs']);

function toPunchyTitleCase(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  return words
    .map((w, idx) => {
      if (w.toLowerCase() === 'w/') return 'w/';
      if (idx > 0 && SMALL_TITLE_WORDS.has(w.toLowerCase())) {
        return w.toLowerCase();
      }
      if (/^[A-Z0-9]{2,5}$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/**
 * Strips trailing conversational confirmation chatter, hesitation, and filler
 * ("yeah I think that works", "okay cool thanks", "um put that down", "of key thanks").
 */
function stripTrailingRamble(raw: string): string {
  let t = raw.trim();
  for (let pass = 0; pass < 4; pass += 1) {
    const before = t;
    t = t
      .replace(
        /(?:[\s,.;:-]+|^)(?:yeah|yep|yup|yes|nah|okay|ok|of\s+key|alright|all\s+right|cool|great|awesome|perfect|nice|sweet|sounds\s+good|looks\s+good|that\s+works|that\s+should\s+work|that'?s\s+good|that\s+is\s+good|that'?s\s+right|is\s+that\s+right|i\s+think(?:\s+that\s+works|\s+so|\s+that'?s\s+it|\s+that'?s\s+good)?|let\s+me\s+(?:see|check|think)|um+\s+yeah|uh+\s+yeah|i'?m\s+yet|put\s+that\s+down|put\s+it\s+down|lock\s+that\s+in|add\s+that|do\s+that|that'?s\s+all|that'?s\s+it|thank\s+you|thanks|please|right\s+now|right\s+here|in\s+here|here|on\s+my\s+(?:schedule|calendar)|to\s+my\s+(?:schedule|calendar)|for\s+me)\s*$/i,
        ''
      )
      .trim();
    if (t === before) break;
  }
  return t;
}

/**
 * Checks whether a phrase is purely filler/confirmation chatter with zero real event title content.
 */
function isPureChatterOrEmpty(raw: string): boolean {
  const stripped = stripTrailingRamble(raw)
    .replace(/^(?:um+|uh+|er+|ah+|hmm+|so|well|like|and|or|then|now|wait|let'?s\s+see)+[\s,.;:-]*/gi, '')
    .trim();
  return stripped.length === 0;
}

/**
 * Distills rambling, conversational, or self-clarifying speech into a short, punchy 1–4 word calendar title.
 */
export function summarizePunchyTitle(raw: string): string {
  let t = stripTrailingRamble(raw);
  if (!t) return '';

  // 1. Peel stacked conversational, polite, rename, and scheduling wrappers
  for (let pass = 0; pass < 6; pass += 1) {
    const before = t;
    t = t
      .replace(
        /^(?:(?:hey|hi|yo|ok|okay|um+|uh+|er+|ah+|like|so|well|basically|actually|wait\s+actually|wait\s+no|no\s+wait|scratch\s+that|never\s*mind|instead|i\s+mean|sorry|intuition|please|real\s+quick)\b[, ]*)+/i,
        ''
      )
      .replace(
        /^(?:no\b[, ]*(?!\s*(?:problem|worries|thanks|thank\s+you)\b))/i,
        ''
      )
      .replace(
        /^(?:can\s+you|could\s+you|would\s+you|will\s+you|do\s+me\s+a\s+favor\s+and|i\s+was\s+wondering\s+if\s+you\s+could|make\s+sure\s+(?:to|i)|don'?t\s+let\s+me\s+forget\s+to|let'?s\s+(?:do|say|make\s+it|call\s+it)|let'?s)(?:\s+please)?(?:\s+|$)/i,
        ''
      )
      .replace(
        /^(?:(?:the\s+)?(?:name|title)\s+(?:should\s+be|is)|it\s+should\s+be(?:\s+called|\s+named)?|change\s+(?:the\s+)?(?:name|title|event|it|that)\s*(?:to|into)|rename(?:\s+(?:it|that))?(?:\s+to)?|call\s+(?:it|that)|name\s+(?:it|that)|title\s+(?:it|that)|make\s+(?:the\s+(?:name|title)|it|that)|switch\s+(?:(?:it|that)\s+)?to|update\s+(?:(?:it|that)\s+)?to|instead\s+of\s+[a-z0-9\s]{1,20}?\s+(?:make\s+it|call\s+it|do))(?:\s+|$)/i,
        ''
      )
      .replace(
        /^(?:go\s+ahead\s+and|put\s+down(?:\s+that)?|write\s+down(?:\s+that)?|jot\s+down(?:\s+that)?|note\s+that|add\s+on\s+here(?:\s+that)?|mark\s+down(?:\s+that)?|to\s+(?=(?:schedule|set|add|create|make)\b))(?:\s+|$)/i,
        ''
      )
      .replace(
        /^(?:i\s+am\s+going\s+to\s+be|i'?m\s+going\s+to\s+be|i'?m\s+gonna\s+be|i\s+am\s+going\s+to|i'?m\s+going\s+to|i'?m\s+gonna|we\s+are\s+going\s+to|we'?re\s+going\s+to|we'?re\s+gonna|i\s+have\s+got\s+to|i'?ve\s+got\s+to|i\s+got\s+to|i\s+gotta|i\s+need\s+to|i\s+have\s+to|i\s+want\s+to|i\s+wanna|i\s+should|i\s+have(?:\s+got)?|i'?ve\s+got|i\s+got|we\s+have|there'?s\s+going\s+to\s+be|there\s+is\s+going\s+to\s+be|there'?s|there\s+is|add|create|schedule|put|set\s+up|set|book|block\s+out|block|fit\s+in|drop\s+in|open\s+up|open|make|log|record)(?:\s+|$)/i,
        ''
      )
      .replace(
        /^(?:a\s+|an\s+|the\s+|my\s+|some\s+)?(?:reminder|scheduled\s+event|calendar\s+event|event|time\s+block|block)\s*(?:for\s+me\s+)?(?:(?:to|for|about|on|that)(?:\s+|$))?\s*/i,
        ''
      )
      .replace(/^remind(?:\s+me)?\s*(?:(?:to|about|for|that)(?:\s+|$))?\s*/i, '')
      .replace(/^(?:a|an|the|some)(?:\s+|$)/i, '')
      .replace(/^(?:to|for|about|that|on|at|in|into|from|until|til|between|and)(?:\s+|$)/i, '')
      .trim();
    if (t === before) break;
  }

  t = stripTrailingRamble(t)
    .replace(/\s+(?:because|since|so\s+that\s+i\s+can|so\s+i\s+can)\s+.+$/i, '')
    .replace(
      /\s+(?:at|for|from|between|on|in|into|to|by|around|about|until|til|end|ending|ends|change|make|actually|wait|instead|and|or)\s*$/gi,
      ''
    )
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .trim();

  if (!t) return '';

  // 2. Generic-to-Specific Possessive Clarification ("family mebers birthday, my moms" -> "Mom's Birthday")
  const genericOwnerClarify = t.match(
    /^(?:(?:a|an|the|my|our|some|one\s+of\s+my|\d+\s+[a-z]+)\s+)?(?:family\s+me[a-z]*'?s?|relative'?s?|friend'?s?|coworker'?s?|colleague'?s?|somebody'?s?|someone'?s?|person'?s?|kid'?s?|child'?s?|parent'?s?|sibling'?s?)\s+(birthday(?:\s+party|\s+dinner)?|anniversary(?:\s+dinner|\s+party)?|wedding|graduation|baby\s+shower|bridal\s+shower|shower|party|dinner|lunch|brunch|game|recital|visit|appointment|checkup)(?:\s*[,;:-]\s*|\s+)(?:it'?s\s+|specifically\s+|namely\s+|which\s+is\s+|for\s+|i\s+)?(?:my\s+|our\s+)?([a-z]{2,18})(?:'s)?(?:\s+(?:birthday|party|dinner|anniversary|wedding|appointment))?\s*$/i
  );
  if (genericOwnerClarify) {
    return toPunchyTitleCase(
      `${formatPossessiveNoun(genericOwnerClarify[2])} ${genericOwnerClarify[1]}`
    );
  }

  // 2b. "[EventHead] for [my/our] [Person]" -> "Mom's Birthday"
  const eventForPerson = t.match(
    /^(?:(?:a|an|the|my)\s+)?(birthday(?:\s+party|\s+dinner)?|anniversary(?:\s+dinner|\s+party)?|party|baby\s+shower|graduation)\s+for\s+(?:my\s+|our\s+)?([a-z]{2,16})\s*$/i
  );
  if (eventForPerson) {
    return toPunchyTitleCase(
      `${formatPossessiveNoun(eventForPerson[2])} ${eventForPerson[1]}`
    );
  }

  // 2c. Generic Category + Specific Appositive ("appointment, haircut" / "workout, leg day")
  const genericShellAppositive = t.match(
    /^(?:(?:a|an|the|my|our)\s+)?(?:appointment|meeting|workout|exercise|session|class|errand|task|chore|thing|something)\s*(?:[,;:-]|\b(?:called|named|which\s+is|it'?s)\b)\s*(.+)$/i
  );
  if (genericShellAppositive && genericShellAppositive[1].trim().length >= 2) {
    t = genericShellAppositive[1].trim();
  }

  // 3. Everyday Phrase Compression
  t = t
    .replace(/^(?:going\s+to\s+the\s+gym|go\s+to\s+the\s+gym|hit\s+the\s+gym|working\s+out)$/i, 'Gym')
    .replace(
      /^(?:going\s+grocery\s+shopping|go\s+grocery\s+shopping|go\s+to\s+the\s+grocery\s+store|going\s+to\s+the\s+grocery\s+store|pick\s+up\s+groceries|get\s+groceries)$/i,
      'Groceries'
    )
    .replace(/^(?:working|my\s+work\s+shift|work\s+shift)$/i, 'Work')
    .replace(/^(?:working\s+on|work\s+on)\s+(.+)$/i, '$1')
    .replace(/^(?:studying\s+for|study\s+for)\s+(?:my\s+|the\s+|a\s+|an\s+)?(.+)$/i, 'Study $1')
    .replace(
      /^(?:going\s+to\s+(?:a\s+|my\s+|the\s+)?)?(dentist|doctor|haircut|barber|therapy|therapist|optometrist|eye\s+doctor|vet|chiropractor|dermatologist)(?:'?s)?\s+appointment$/i,
      '$1'
    )
    .replace(
      /^(dinner|lunch|brunch|breakfast|coffee|drinks)\s+with\s+(?:my\s+|our\s+)?(.+)$/i,
      '$1 w/ $2'
    )
    .replace(
      /^(?:meeting(?:\s+up)?|meet(?:\s+up)?|sync(?:ing)?|catching\s+up|catch\s+up|check[- ]?in)\s+with\s+(?:my\s+|our\s+)?(.+)$/i,
      'Sync w/ $1'
    )
    .replace(/^calling\s+(?:my\s+|the\s+)?(.+)$/i, 'Call $1')
    .replace(/^picking\s+up\s+(?:my\s+|the\s+)?(.+)$/i, 'Pick Up $1')
    .replace(/^dropping\s+off\s+(?:my\s+|the\s+)?(.+)$/i, 'Drop Off $1');

  // 4. Strip leading self-possessives & restore spoken apostrophes ("moms birthday" -> "Mom's Birthday")
  t = t.replace(/^(?:my|our|the|a|an)\s+/i, '');
  t = t.replace(
    /\b(mom|mum|dad|mother|father|sister|brother|grandma|grandpa|nana|papa|aunt|uncle|cousin|wife|husband|partner)s\s+(birthday|party|dinner|lunch|brunch|anniversary|wedding|visit|appointment|house|game|recital|graduation)\b/gi,
    (_, rel: string, ev: string) => `${formatPossessiveNoun(rel)} ${ev}`
  );

  // 5. Trim interior filler articles & cap to 5 punchy words max
  let words = t.split(/\s+/).filter(Boolean);
  if (words.length > 3) {
    const dropInterior = new Set(['a', 'an', 'the', 'my', 'our', 'some', 'that', 'just', 'really']);
    words = words.filter((w, i) => i === 0 || !dropInterior.has(w.toLowerCase()));
  }
  if (words.length > 5) {
    words = words.slice(0, 5);
  }

  return toPunchyTitleCase(words.join(' '));
}

/**
 * Refines an existing event title when a short follow-up specifier is spoken
 * (e.g. existingTitle = "Family Members Birthday" + followUp = "my moms" -> "Mom's Birthday").
 */
function tryRefineExistingTitle(existingTitle: string | undefined, clauseText: string): string | null {
  if (!existingTitle) return null;
  const cleanedClause = stripTrailingRamble(clauseText)
    .replace(/^[,;:-]+\s*/, '')
    .trim();
  if (!cleanedClause) return null;

  // Only refine a title's owner when the existing title is bare ("Birthday") or generic ("Family Members Birthday")
  const genericOrBareHead = existingTitle.match(
    /^(?:(?:Family\s+Me[a-z]*'?s?|Relative'?s?|Friend'?s?|Someone'?s?|Somebody'?s?|Person'?s?)\s+)?(Birthday(?:\s+Party|\s+Dinner)?|Anniversary(?:\s+Dinner|\s+Party)?|Wedding|Graduation|Shower|Party|Recital)\b$/i
  );
  const ownerOnlyMatch = cleanedClause.match(
    /^(?:it'?s\s+|for\s+|specifically\s+)?(?:my\s+|our\s+)?([a-z]{2,16}?)(?:'s|s)?(?:\s+(?:birthday|party|dinner|anniversary|wedding|appointment))?$/i
  );
  if (genericOrBareHead && ownerOnlyMatch) {
    const word = ownerOnlyMatch[1].toLowerCase();
    const stopWords = new Set([
      'today', 'tomorrow', 'tonight', 'here', 'now', 'yes', 'yeah', 'ok', 'okay', 'thanks',
      'good', 'work', 'works', 'we', 'us', 'me', 'my', 'you', 'he', 'him', 'she', 'her',
      'it', 'they', 'them', 'this', 'that', 'there', 'then', 'wait', 'no', 'actually',
    ]);
    if (!stopWords.has(word)) {
      return toPunchyTitleCase(`${formatPossessiveNoun(ownerOnlyMatch[1])} ${genericOrBareHead[1]}`);
    }
  }

  // Generic shell title ("Meeting", "Appointment", "Workout", "Event", "Session") refined by short noun phrase
  if (
    /^(?:Meeting|Appointment|Workout|Exercise|Session|Class|Errand|Task|Event)$/i.test(
      existingTitle.trim()
    )
  ) {
    const candidate = summarizePunchyTitle(cleanedClause);
    if (candidate && candidate.split(/\s+/).length <= 4) {
      return candidate;
    }
  }

  return null;
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
    return 'Say what the event is';
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
    return 'Say start & end time — e.g. "from 4 to 5"';
  }
  if (needEnd) {
    return `Say end time — e.g. "to ${suggestedEnd}" or "for 1 hour"`;
  }
  return 'Keep speaking to finish details…';
}

interface ClauseTemporalExtraction {
  dates: DateMatchToken[];
  startMins: number | null;
  endMins: number | null;
  endOnlyUpdate: boolean;
  startOnlyUpdate: boolean;
  explicitDurationMins: number | null;
  firstTemporalIdx: number | null;
  beforeTemporalText: string;
  afterTemporalText: string;
  strippedFullText: string;
}

/**
 * Extracts all dates, durations, and time spans inside a single conversational clause
 * (using LAST match wins within the clause too!) and cleanly separates text spoken
 * BEFORE the temporal markers from text spoken AFTER the temporal markers so post-time
 * rambling never pollutes an already-stated event name!
 */
function extractClauseTemporals(
  clause: string,
  todayIso: string,
  periodHint: DayPeriodHint,
  priorStartMins: number | null
): ClauseTemporalExtraction {
  const dates = extractAllDatesChronological(clause, todayIso);
  const spans: { start: number; end: number }[] = dates.map((d) => ({
    start: d.start,
    end: d.end,
  }));

  let startMins: number | null = null;
  let endMins: number | null = null;
  let endOnlyUpdate = false;
  let startOnlyUpdate = false;
  let explicitDurationMins: number | null = null;

  // Mask out date spans with spaces of equal length so character indices stay 1:1 aligned!
  const maskSpan = (src: string, s: number, e: number) =>
    src.slice(0, s) + ' '.repeat(e - s) + src.slice(e);

  let scan = clause;
  for (const d of dates) {
    scan = maskSpan(scan, d.start, d.end);
  }

  // 1. Relative time ("in 2 hours", "in 30 minutes")
  const relRe = /\bin\s+(\d{1,2})\s*(hours?|hrs?|minutes?|mins?)\b/gi;
  let rm: RegExpExecArray | null;
  while ((rm = relRe.exec(scan)) !== null) {
    const now = new Date();
    const baseM = now.getHours() * 60 + now.getMinutes();
    const delta = /^h/i.test(rm[2]) ? Number(rm[1]) * 60 : Number(rm[1]);
    startMins = Math.min(23 * 60 + 30, Math.ceil((baseM + delta) / 5) * 5);
    spans.push({ start: rm.index, end: rm.index + rm[0].length });
    scan = maskSpan(scan, rm.index, rm.index + rm[0].length);
  }

  // 2. Explicit duration ("for 1 hour", "90 minutes")
  const durRe = /\b(?:for\s+)?(\d{1,3}(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/gi;
  let dm: RegExpExecArray | null;
  while ((dm = durRe.exec(scan)) !== null) {
    const val = Number(dm[1]);
    const isHours = /^h/i.test(dm[2]);
    explicitDurationMins = Math.max(15, Math.min(480, Math.round(isHours ? val * 60 : val)));
    spans.push({ start: dm.index, end: dm.index + dm[0].length });
    scan = maskSpan(scan, dm.index, dm.index + dm[0].length);
  }

  // 3. Time ranges ("from 4 to 5", "4:30-6", "between 4 and 5", "make it 7 to 8:30") — LATEST range in clause wins!
  const rangeRe =
    /(?:\b(?:change\s+(?:the\s+)?time\s+to|move\s+(?:it\s+)?to|at|from|between|for)\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|and|until|til|through|ending\s+at|ends?\s+at|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  let rgm: RegExpExecArray | null;
  while ((rgm = rangeRe.exec(scan)) !== null) {
    const sh = Number(rgm[1]);
    const sm = rgm[2] ? Number(rgm[2]) : 0;
    let sMer = rgm[3]?.toLowerCase();
    const eh = Number(rgm[4]);
    const em = rgm[5] ? Number(rgm[5]) : 0;
    const eMer = rgm[6]?.toLowerCase();

    if (!sMer && eMer) {
      if (eMer === 'pm' && sh >= 7 && sh <= 11 && eh >= 1 && eh <= 6) {
        sMer = 'am';
      } else if (sh === 12 && eMer === 'pm') {
        sMer = 'pm';
      } else if (sh <= eh) {
        sMer = eMer;
      }
    }

    const resolvedS = resolveSingleHour(sh, sm, sMer, periodHint);
    if (resolvedS !== null) {
      const resolvedE = resolveEndAfterStart(resolvedS, eh, em, eMer ?? sMer, periodHint);
      if (resolvedE !== null) {
        startMins = resolvedS;
        endMins = resolvedE;
        endOnlyUpdate = false;
        startOnlyUpdate = false;
        spans.push({ start: rgm.index, end: rgm.index + rgm[0].length });
        scan = maskSpan(scan, rgm.index, rgm.index + rgm[0].length);
      }
    }
  }

  // 4. Explicit Start-Time update ("start at 4:30", "change start time to 5") MUST run before bare "to X" end check!
  if (startMins === null) {
    const explicitStartRe =
      /\b(?:start(?:s|ing)?\s+at|change\s+(?:the\s+)?start(?:\s+time)?\s+to|move\s+(?:the\s+)?start(?:\s+time)?\s+to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
    let esm: RegExpExecArray | null;
    while ((esm = explicitStartRe.exec(scan)) !== null) {
      const resolvedS = resolveSingleHour(
        Number(esm[1]),
        Number(esm[2] ?? 0),
        esm[3],
        periodHint
      );
      if (resolvedS !== null) {
        startMins = resolvedS;
        startOnlyUpdate = true;
        spans.push({ start: esm.index, end: esm.index + esm[0].length });
        scan = maskSpan(scan, esm.index, esm.index + esm[0].length);
      }
    }
  }

  // 5. Explicit standalone End-Time update ("until 7:30", "end at 8", "change end time to 8", or "to 7:30" when start already known)
  if (startMins === null) {
    const endUpdateRe =
      /\b(?:until|til|through|ending\s+at|ends?\s+at|finish(?:es|ing)?\s+at|change\s+(?:the\s+)?end(?:\s+time)?\s+to|(?:^|\s)to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
    let emMatch: RegExpExecArray | null;
    while ((emMatch = endUpdateRe.exec(scan)) !== null) {
      const anchorStart = startMins ?? priorStartMins;
      const rawLead = emMatch[0].trim().toLowerCase();
      const prefixBeforeTo = scan.slice(Math.max(0, emMatch.index - 24), emMatch.index);
      if (
        rawLead.startsWith('to') &&
        (anchorStart === null || /\b(?:change|move|switch|set|update)\b/i.test(prefixBeforeTo))
      ) {
        continue;
      }
      const eh = Number(emMatch[1]);
      const emn = Number(emMatch[2] ?? 0);
      const emer = emMatch[3];
      const resolvedE =
        anchorStart !== null
          ? resolveEndAfterStart(anchorStart, eh, emn, emer, periodHint)
          : resolveSingleHour(eh, emn, emer, periodHint);
      if (resolvedE !== null) {
        endMins = resolvedE;
        if (startMins === null) endOnlyUpdate = true;
        spans.push({ start: emMatch.index, end: emMatch.index + emMatch[0].length });
        scan = maskSpan(scan, emMatch.index, emMatch.index + emMatch[0].length);
      }
    }
  }

  if (startMins === null && !endOnlyUpdate) {
    const singleTimeRe =
      /(?:\b(?:change\s+(?:the\s+)?time\s+to|move\s+(?:it\s+)?to|make\s+it|at|for|by|around|from)\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\b(\d{1,2}):(\d{2})\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/gi;
    let sm: RegExpExecArray | null;
    const foundSingles: { mins: number; start: number; end: number }[] = [];
    while ((sm = singleTimeRe.exec(scan)) !== null) {
      const h = Number(sm[1] ?? sm[4] ?? sm[7]);
      const m = Number(sm[2] ?? sm[5] ?? 0);
      const mer = sm[3] ?? sm[6] ?? sm[8];
      const resolved = resolveSingleHour(h, m, mer, periodHint);
      if (resolved !== null) {
        foundSingles.push({ mins: resolved, start: sm.index, end: sm.index + sm[0].length });
      }
    }

    if (foundSingles.length >= 2) {
      // e.g. "for 6 ... 7:30" in the same clause -> start + end!
      startMins = foundSingles[0].mins;
      endMins =
        foundSingles[1].mins > startMins
          ? foundSingles[1].mins
          : Math.min(23 * 60 + 55, foundSingles[1].mins + 12 * 60);
      for (const f of foundSingles) spans.push({ start: f.start, end: f.end });
    } else if (foundSingles.length === 1) {
      const only = foundSingles[0];
      spans.push({ start: only.start, end: only.end });
      // If a prior clause already established startMins and no end time yet, a bare follow-up time ("7:30") fills endMins!
      if (
        priorStartMins !== null &&
        !/\b(?:start|from|at|for|change\s+(?:the\s+)?time|make\s+it)\b/i.test(
          clause.slice(only.start, only.end)
        )
      ) {
        endMins = only.mins > priorStartMins ? only.mins : Math.min(23 * 60 + 55, only.mins + 12 * 60);
        endOnlyUpdate = true;
      } else {
        startMins = only.mins;
      }
    }
  }

  if (startMins !== null && endMins === null && explicitDurationMins !== null) {
    endMins = Math.min(23 * 60 + 55, startMins + explicitDurationMins);
  }

  let firstTemporalIdx: number | null = null;
  let lastTemporalEnd = 0;
  for (const sp of spans) {
    if (firstTemporalIdx === null || sp.start < firstTemporalIdx) {
      firstTemporalIdx = sp.start;
    }
    if (sp.end > lastTemporalEnd) {
      lastTemporalEnd = sp.end;
    }
  }

  const beforeTemporalText =
    firstTemporalIdx !== null ? clause.slice(0, firstTemporalIdx).trim() : clause.trim();
  const afterTemporalText =
    firstTemporalIdx !== null ? clause.slice(lastTemporalEnd).trim() : '';
  const strippedFullText = stripSpans(clause, spans).replace(/\s{2,}/g, ' ').trim();

  return {
    dates,
    startMins,
    endMins,
    endOnlyUpdate,
    startOnlyUpdate,
    explicitDurationMins,
    firstTemporalIdx,
    beforeTemporalText,
    afterTemporalText,
    strippedFullText,
  };
}

const SPOKEN_COLOR_MAP: Record<string, EventColorId> = {
  red: 'crimson',
  crimson: 'crimson',
  scarlet: 'crimson',
  tomato: 'crimson',
  maroon: 'crimson',
  orange: 'coral',
  coral: 'coral',
  tangerine: 'coral',
  peach: 'coral',
  rust: 'coral',
  yellow: 'amber',
  gold: 'amber',
  golden: 'amber',
  amber: 'amber',
  mustard: 'amber',
  green: 'emerald',
  emerald: 'emerald',
  lime: 'emerald',
  forest: 'emerald',
  mint: 'emerald',
  olive: 'emerald',
  sage: 'emerald',
  teal: 'teal',
  turquoise: 'teal',
  aqua: 'teal',
  cyan: 'teal',
  sky: 'sky',
  'sky blue': 'sky',
  'light blue': 'sky',
  'baby blue': 'sky',
  blue: 'cobalt',
  cobalt: 'cobalt',
  navy: 'cobalt',
  'royal blue': 'cobalt',
  indigo: 'cobalt',
  purple: 'violet',
  violet: 'violet',
  lavender: 'violet',
  plum: 'violet',
  grape: 'violet',
  lilac: 'violet',
  pink: 'pink',
  magenta: 'pink',
  rose: 'pink',
  fuchsia: 'pink',
  flamingo: 'pink',
  gray: 'slate',
  grey: 'slate',
  slate: 'slate',
  charcoal: 'slate',
  black: 'slate',
  graphite: 'slate',
};

const COLOR_NAME_ALT =
  'sky\\s+blue|light\\s+blue|baby\\s+blue|royal\\s+blue|red|crimson|scarlet|tomato|maroon|orange|coral|tangerine|peach|rust|yellow|golden|gold|amber|mustard|emerald|green|lime|forest|mint|olive|sage|teal|turquoise|aqua|cyan|sky|cobalt|navy|indigo|blue|purple|violet|lavender|plum|grape|lilac|pink|magenta|rose|fuchsia|flamingo|charcoal|graphite|slate|grey|gray|black';

interface SpokenEnrichmentResult {
  cleanedText: string;
  customColor?: EventColorId;
  notes?: string;
  alertOffsetMinutes?: number | null;
}

/**
 * Extracts verbal Color, Description/Note, and Alert instructions (both "at time of event"
 * and "N minutes/hours/days earlier") before temporal & title parsing so modifiers never
 * pollute event titles, durations, or standalone reminder detection.
 */
function extractSpokenEventEnrichments(
  text: string,
  blocks: CalendarBlock[]
): SpokenEnrichmentResult {
  let working = text;
  let customColor: EventColorId | undefined;
  let notes: string | undefined;
  let alertOffsetMinutes: number | null | undefined;

  // 1. Extract spoken Description / Details ("description bring ID card", "with a note ask about pricing")
  const descRe =
    /(?:[,;.\s]+|^)(?:(?:and\s+|also\s+)?(?:with\s+(?:the\s+|a\s+)?|add\s+(?:a\s+|the\s+)?|set\s+(?:the\s+)?|include\s+(?:a\s+|the\s+)?|put\s+(?:in\s+)?(?:a\s+|the\s+)?)?(?:description|details?)(?:\s+(?:is|as|saying|that\s+says|to\s+say|of|:))?|(?:and\s+|also\s+)?(?:with\s+(?:a\s+|the\s+)?|add\s+(?:a\s+|the\s+)?|put\s+(?:a\s+)?)notes?(?:\s+(?:is|as|saying|that\s+says|to\s+say|to|:))?)\s+(.+?)(?=(?:[,;.]?\s+\b(?:and\s+|also\s+)?(?:make\s+(?:it|the\s+color)|(?:change|set|switch)\s+(?:the\s+)?color|in\s+(?:color\s+)?(?:red|orange|yellow|gold|amber|green|emerald|teal|cyan|sky|blue|cobalt|navy|purple|violet|pink|rose|gray|grey|slate|black)|(?:with\s+an?\s+|make\s+(?:it|this)\s+an?\s+|set\s+an?\s+|add\s+an?\s+|no\s+|without\s+(?:an?\s+)?|an?\s+|the\s+)(?:alert|alarm|notification)|(?:with\s+|set\s+|add\s+)?a\s+\d{1,3}[-\s]*(?:minute|min|hour|hr|day)\s+(?:early\s+)?(?:alert|alarm|notification)|alert(?:\s+me)?\b|notify\s+me\b|remind\s+me\s+\d+\s*(?:minutes?|mins?|hours?|hrs?)\s+(?:before|early|earlier|ahead|prior)))|$)/i;
  const dm = working.match(descRe);
  if (dm && dm[1]) {
    let rawDesc = stripTrailingRamble(dm[1].trim()).replace(/^[,:;-]+\s*|[,.;-]+$/g, '').trim();
    let rescuedTargetSuffix = '';

    // Check if speaker put "... to/for/on <ExistingBlockTitle>" at the end of "add description X to Physics Honors"
    const trailingTarget = rawDesc.match(/\s+\b(?:to|for|on)\s+([a-z0-9][a-z0-9\s'/-]{2,44})$/i);
    if (trailingTarget) {
      const candCore = trailingTarget[1]
        .replace(/\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
        .trim()
        .toLowerCase();
      const matchesBlock =
        candCore.length >= 3 && blocks.some((b) => b.title.toLowerCase().includes(candCore));
      if (matchesBlock) {
        rescuedTargetSuffix = ` ${trailingTarget[1].trim()} `;
        rawDesc = rawDesc.slice(0, trailingTarget.index).trim();
      }
    }

    if (rawDesc) {
      notes = rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1);
      working =
        working.slice(0, dm.index ?? 0) +
        rescuedTargetSuffix +
        working.slice((dm.index ?? 0) + dm[0].length);
    }
  }

  // 2. Extract spoken Alert ("alert me 15 minutes early", "make it an alert", "alert at the time", "no alert")
  const disableAlertRe =
    /(?:[,;.\s]+|^)(?:and\s+)?(?:no|without(?:\s+an?)?|remove(?:\s+the)?|turn\s+off(?:\s+the)?|disable(?:\s+the)?|cancel(?:\s+the)?)\s+(?:alert|alarm|notification)s?\b/gi;
  if (disableAlertRe.test(working)) {
    alertOffsetMinutes = null;
    working = working.replace(disableAlertRe, ' ');
  } else {
    // 2a. Early lead-time alert ("alert me 15 minutes before", "with a 30 minute alert", "goes off 10 minutes early", "remind me 15 minutes early")
    const earlyAlertPatterns: RegExp[] = [
      /(?:[,;.\s]+|^)(?:and\s+|also\s+)?(?:(?:make\s+(?:it|this|that)\s+an?\s+|with\s+an?\s+|set\s+(?:up\s+)?an?\s+|add\s+an?\s+|give\s+me\s+an?\s+|an?\s+|the\s+)?(?:alert|alarm|notification)(?:\s+that\s+goes\s+off|\s+going\s+off)?(?:\s+me)?(?:\s+for)?|\b(?:alert|notify|remind)\s+me)\s+(\d{1,3})\s*(minutes?|mins?|min|hours?|hrs?|hr|days?)\s*(?:before(?:\s+(?:it(?:\s+starts)?|the\s+event|start|that))?|early|earlier(?:\s+than\s+that)?|ahead(?:\s+of\s+time)?|prior|in\s+advance)?\b/gi,
      /(?:[,;.\s]+|^)(?:and\s+|also\s+)?(?:with\s+|set\s+|add\s+)a\s+(\d{1,3})[-\s]*(minute|min|hour|hr|day)\s+(?:early\s+)?(?:alert|alarm|notification)\b/gi,
      /(?:[,;.\s]+|^)(?:and\s+|also\s+)?(?:that\s+)?goes\s+off\s+(\d{1,3})\s*(minutes?|mins?|min|hours?|hrs?|hr|days?)\s*(?:before|early|earlier(?:\s+than\s+that)?|ahead|prior)\b/gi,
    ];

    for (const pat of earlyAlertPatterns) {
      let m: RegExpExecArray | null;
      const gPat = new RegExp(pat.source, 'gi');
      while ((m = gPat.exec(working)) !== null) {
        const n = Number(m[1]);
        const unit = m[2].toLowerCase();
        const mult = unit.startsWith('d') ? 1440 : unit.startsWith('h') ? 60 : 1;
        alertOffsetMinutes = Math.max(0, Math.min(10080, n * mult));
      }
      working = working.replace(pat, ' ');
    }

    // 2b. At-event-time alert ("make it an alert", "with an alert", "alert at the time of the event", "alert when it starts")
    const atStartAlertRe =
      /(?:[,;.\s]+|^)(?:and\s+|also\s+)?(?:make\s+(?:it|this|that)\s+an?\s+(?:alert|alarm)|(?:with|add|set(?:\s+up)?|put|give\s+me|turn\s+on)\s+(?:an?\s+|the\s+)?(?:alert|alarm|notification)(?:\s+(?:at\s+(?:the\s+)?(?:time(?:\s+of\s+the\s+event)?|start(?:\s+time)?)|on\s+time|when\s+it\s+starts))?|(?:an?\s+)?(?:alert|alarm)\s+(?:at\s+(?:the\s+)?(?:time(?:\s+of\s+the\s+event)?|start)|when\s+it\s+starts|on\s+time)|\b(?:alert|notify)\s+me(?:\s+(?:at\s+(?:the\s+)?(?:time(?:\s+of\s+the\s+event)?|start)|when\s+it\s+starts|on\s+time))?)(?=\s*(?:[,;.]|$|\b(?:for|on|to|in|and)\b))/gi;
    if (atStartAlertRe.test(working)) {
      if (alertOffsetMinutes === undefined) {
        alertOffsetMinutes = 0;
      }
      working = working.replace(atStartAlertRe, ' ');
    }
  }

  // 3. Extract spoken Color ("make it red", "change color to purple", "color teal", "in emerald")
  const colorPatterns: RegExp[] = [
    new RegExp(
      `(?:[,;.\\s]+|^)(?:and\\s+|also\\s+)?(?:(?:change|set|switch|update|make)\\s+(?:the\\s+)?color(?:\\s+(?:of|for))?\\s+(?:to\\s+|into\\s+)?|make\\s+(?:it|that|this|the\\s+event)\\s+(?:colored\\s+)?|(?:with\\s+)?color(?:ed)?(?:\\s+is|\\s+as)?\\s+|in\\s+(?:color\\s+)?)(${COLOR_NAME_ALT})\\b(?:\\s+color)?`,
      'gi'
    ),
    new RegExp(`(?:[,;.\\s]+|^)(?:and\\s+)?(${COLOR_NAME_ALT})\\s+color\\b`, 'gi'),
  ];

  for (const cPat of colorPatterns) {
    let cm: RegExpExecArray | null;
    const scanRe = new RegExp(cPat.source, 'gi');
    while ((cm = scanRe.exec(working)) !== null) {
      const key = cm[1].toLowerCase().replace(/\s+/g, ' ').trim();
      const mapped = SPOKEN_COLOR_MAP[key];
      if (mapped) {
        customColor = mapped;
      }
    }
    working = working.replace(cPat, ' ');
  }

  // Also support "make <EventName> <Color>" when modifying an existing event ("make Physics Honors purple")
  const makeTargetColorRe = new RegExp(
    `^(\\s*(?:hey\\s+|ok\\s+|okay\\s+|please\\s+|can\\s+you\\s+)?)(?:make|color|turn)\\s+(.+?)\\s+(${COLOR_NAME_ALT})\\b(?:\\s+color)?\\s*$`,
    'i'
  );
  const mtc = working.trim().match(makeTargetColorRe);
  if (mtc) {
    const key = mtc[3].toLowerCase().replace(/\s+/g, ' ').trim();
    const mapped = SPOKEN_COLOR_MAP[key];
    if (mapped && !/\b(?:from|to|at|for)\s+\d/i.test(mtc[2])) {
      customColor = mapped;
      working = `${mtc[1]}${mtc[2]}`;
    }
  }

  return {
    cleanedText: working.replace(/\s{2,}/g, ' ').trim(),
    customColor,
    notes,
    alertOffsetMinutes,
  };
}

function findMatchingBlockForUpdate(
  rawSubject: string,
  explicitDate: string | undefined,
  ctx: ScheduleAiContext,
  explicitStartMins?: number | null
): CalendarBlock | undefined {
  const cleaned = rawSubject
    .replace(
      /^(?:(?:hey|ok|okay|please|actually|wait|instead|can\s+you|could\s+you)\s+)*(?:change|set|update|modify|edit|make|turn|put|add|give|move|reschedule|shift|push|bump|delay|postpone|rebook|relocate|switch)(?:\s+(?:the|an?|my))?(?:\s+(?:color|description|details?|notes?|alert|alarm|notification|time|date|day))?(?:\s+(?:of|for|on|to))?\s+/i,
      ''
    )
    .replace(/^(?:the|my|an?|our|for|on|to|of)\s+/i, '')
    .replace(/\b(?:event|block|appointment|session)\s*$/i, '')
    .trim();

  const candidateTitle = summarizePunchyTitle(cleaned) || cleaned;
  const needle = candidateTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const rawNeedle = cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const searchNeedle = needle.length >= 2 ? needle : rawNeedle;
  if (searchNeedle.length < 2) return undefined;

  const stopWords = new Set(['the', 'my', 'our', 'for', 'on', 'at', 'in', 'to', 'of', 'from', 'event', 'block', 'meeting', 'appointment']);
  const needleWords = searchNeedle
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  const scoreBlock = (b: CalendarBlock): number => {
    const hay = b.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!hay) return 0;
    let score = 0;
    if (hay === searchNeedle) score = 110;
    else if (hay.startsWith(searchNeedle) || searchNeedle.startsWith(hay)) score = 90;
    else if (hay.includes(searchNeedle) || searchNeedle.includes(hay)) score = 78;
    else if (needleWords.length > 0) {
      const matched = needleWords.filter((w) => hay.includes(w));
      if (matched.length === needleWords.length) score = 72;
      else if (matched.length > 0 && matched.length >= Math.ceil(needleWords.length * 0.6)) score = 60;
    }
    if (score === 0) return 0;

    if (!b.completed) score += 8;
    if (explicitDate && b.date === explicitDate) score += 55;
    else if (!explicitDate && b.date === ctx.selectedDate) score += 38;
    else if (!explicitDate && b.date === ctx.todayIso) score += 32;
    else if (b.date >= ctx.todayIso) {
      // Prefer closer upcoming occurrences over far-future repeating school blocks
      const diffDays = Math.max(
        0,
        Math.round((Date.parse(`${b.date}T00:00:00Z`) - Date.parse(`${ctx.todayIso}T00:00:00Z`)) / 86400000)
      );
      score += Math.max(4, 24 - Math.min(20, diffDays));
    }

    if (typeof explicitStartMins === 'number') {
      const bStart = toMinutes(b.startTime);
      if (Math.abs(bStart - explicitStartMins) <= 15) score += 45;
    }
    return score;
  };

  const pool = explicitDate ? ctx.blocks.filter((b) => b.date === explicitDate) : ctx.blocks;
  const searchPool = pool.length > 0 ? pool : ctx.blocks;
  let best: CalendarBlock | undefined;
  let bestScore = 0;
  for (const b of searchPool) {
    const s = scoreBlock(b);
    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  }
  return bestScore >= 60 ? best : undefined;
}

function tryParseMoveExistingEvent(
  rawTrimmed: string,
  workingNormalized: string,
  enrich: SpokenEnrichmentResult,
  globalPeriodHint: DayPeriodHint,
  ctx: ScheduleAiContext
): VoiceScheduleDraft | null {
  const leadMoveRe =
    /^\s*(?:(?:hey|ok|okay|please|actually|wait|instead|um|uh|can\s+you|could\s+you)\s+)*(move|reschedule|shift|push|bump|delay|postpone|rebook|relocate|switch|change|put)\s+(.+)$/i;
  const leadMatch = workingNormalized.match(leadMoveRe);
  if (!leadMatch) return null;

  const verb = leadMatch[1].toLowerCase();
  const rest = leadMatch[2].replace(/\binstead\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  if (!rest) return null;

  // Guard: "put X in next focus slot" belongs to fill-slot, not move-existing
  if (/\b(?:focus\s*(?:slot|zone|block)|empty\s*(?:zone|slot|block)|open\s*slot)\b/i.test(rest)) {
    return null;
  }

  // Guard: "change color/description/alert of X" belongs to enrichment update, not move-time
  if (
    (verb === 'change' || verb === 'put' || verb === 'switch') &&
    /^(?:the\s+)?(?:color|description|details?|notes?|alert|alarm|notification|name|title)\b/i.test(rest)
  ) {
    return null;
  }

  // 1) Check relative shifts first:
  //    "push dentist back 30 minutes", "move gym earlier by 1 hour", "move meeting back 2 days", "delay physics by 45 min"
  const relativeRe =
    /^(.+?)\s+(?:(back|later|forward|ahead|up|earlier)\s+(?:by\s+)?|(?:by\s+))(?:a|an|one|(\d{1,3}))\s+(minutes?|mins?|min|hours?|hrs?|hr|days?)(?:\s+(back|later|forward|ahead|up|earlier))?\s*$/i;
  const relMatch = rest.match(relativeRe);
  if (relMatch) {
    const rawSubject = relMatch[1].trim();
    const dirWord = (relMatch[2] || relMatch[5] || (verb === 'delay' || verb === 'postpone' || verb === 'push' ? 'back' : '')).toLowerCase();
    const qty = relMatch[3] ? Number(relMatch[3]) : 1;
    const unit = relMatch[4].toLowerCase();

    if (dirWord && qty > 0) {
      const srcPeriod = detectPeriodHint(rawSubject) ?? globalPeriodHint;
      const srcTemp = extractClauseTemporals(rawSubject, ctx.todayIso, srcPeriod, null);
      const srcDate = srcTemp.dates.length ? srcTemp.dates[srcTemp.dates.length - 1].date : undefined;
      const subjectClean = (srcTemp.strippedFullText || rawSubject).replace(/\bfrom\s*$/i, '').trim();
      const matched = findMatchingBlockForUpdate(subjectClean, srcDate, ctx, srcTemp.startMins);

      if (matched) {
        const isEarlier = dirWord === 'earlier' || dirWord === 'up';
        const sign = isEarlier ? -1 : 1;
        let nextDate = matched.date;
        let nextStartTime = matched.startTime;
        let nextEndTime = matched.endTime;

        if (unit.startsWith('day')) {
          nextDate = addDays(matched.date, sign * qty);
        } else {
          const deltaMins = (unit.startsWith('h') ? qty * 60 : qty) * sign;
          const origStart = toMinutes(matched.startTime);
          const origDur = Math.max(15, toMinutes(matched.endTime) - origStart);
          const shiftedStart = Math.max(0, Math.min(24 * 60 - origDur, origStart + deltaMins));
          nextStartTime = fromMinutes(shiftedStart);
          nextEndTime = fromMinutes(Math.min(24 * 60, shiftedStart + origDur));
        }

        return {
          rawTranscript: rawTrimmed,
          mode: 'update-event',
          targetBlockId: matched.id,
          title: matched.title,
          date: nextDate,
          dateSpoken: true,
          startTime: nextStartTime,
          endTime: nextEndTime,
          whyCategory: matched.whyCategory,
          customColor: enrich.customColor ?? matched.customColor,
          notes: enrich.notes ?? matched.notes,
          alertOffsetMinutes:
            enrich.alertOffsetMinutes === null
              ? null
              : enrich.alertOffsetMinutes ?? matched.alertOffsetMinutes,
          missingFields: [],
          nextPrompt: `Move "${matched.title}" — tap ✓ or press Enter`,
          isComplete: true,
        };
      }
    }
  }

  // 2) Split subject vs destination target ("move [subject] to [destination]" or "put [subject] on [destination]")
  let subjectPart = rest;
  let targetPart = '';

  // Find the FIRST primary separator ("to"/"into", else "for"/"on") whose right side carries a date/time
  // and isn't the middle "to" of a time range ("from 10am to 11:30am").
  const sepCandidates: { idx: number; len: number; prep: string }[] = [];
  const sepRe = /\s+(to|into|for|on)\s+/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sepRe.exec(rest)) !== null) {
    sepCandidates.push({ idx: sm.index, len: sm[0].length, prep: sm[1].toLowerCase() });
  }

  const orderedCandidates = [
    ...sepCandidates.filter((c) => c.prep === 'to' || c.prep === 'into'),
    ...sepCandidates.filter((c) => c.prep !== 'to' && c.prep !== 'into'),
  ];

  for (const cand of orderedCandidates) {
    const left = rest.slice(0, cand.idx).trim();
    const right = rest.slice(cand.idx + cand.len).trim();
    if (!left || !right) continue;
    // Skip the "to" inside a time range like "from 10am to 11:30am"
    if (cand.prep === 'to' && /\bfrom\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*$/i.test(left)) {
      continue;
    }
    const rightPeriod = detectPeriodHint(right) ?? globalPeriodHint;
    const rightTemp = extractClauseTemporals(right, ctx.todayIso, rightPeriod, null);
    const hasTemporal =
      rightTemp.dates.length > 0 ||
      rightTemp.startMins !== null ||
      rightTemp.endMins !== null;

    if (hasTemporal) {
      subjectPart = left;
      targetPart = right;
      break;
    }
  }

  // Fallback: if user is mid-sentence ("move dentist to...") with trailing "to"
  if (!targetPart && /\s+to\s*$/i.test(rest)) {
    subjectPart = rest.replace(/\s+to\s*$/i, '').trim();
  }

  // Extract optional source hints from subjectPart ("move Thursday's gym to Friday", "move my 3pm dentist to 5pm")
  const srcPeriod = detectPeriodHint(subjectPart) ?? globalPeriodHint;
  const srcTemp = extractClauseTemporals(subjectPart, ctx.todayIso, srcPeriod, null);
  const srcDate = srcTemp.dates.length ? srcTemp.dates[srcTemp.dates.length - 1].date : undefined;
  const cleanSubject = (srcTemp.strippedFullText || subjectPart)
    .replace(/\bfrom\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const matched = findMatchingBlockForUpdate(cleanSubject, srcDate, ctx, srcTemp.startMins);
  if (!matched) return null;

  // If user spoke "move dentist" without destination yet, guide them live!
  if (!targetPart) {
    const hasEnrichment =
      enrich.customColor !== undefined ||
      enrich.notes !== undefined ||
      enrich.alertOffsetMinutes !== undefined;

    if (!hasEnrichment) {
      return {
        rawTranscript: rawTrimmed,
        mode: 'update-event',
        targetBlockId: matched.id,
        title: matched.title,
        date: matched.date,
        dateSpoken: false,
        startTime: matched.startTime,
        endTime: matched.endTime,
        whyCategory: matched.whyCategory,
        customColor: matched.customColor,
        notes: matched.notes,
        alertOffsetMinutes: matched.alertOffsetMinutes,
        missingFields: ['date'],
        nextPrompt: `Say new day or time for "${matched.title}"`,
        isComplete: false,
      };
    }
  }

  const targetPeriod = detectPeriodHint(targetPart) ?? globalPeriodHint;
  const targetTemp = extractClauseTemporals(targetPart, ctx.todayIso, targetPeriod, null);

  const origStart = toMinutes(matched.startTime);
  const origEnd = toMinutes(matched.endTime);
  const origDur = Math.max(15, origEnd - origStart);

  const nextDate = targetTemp.dates.length
    ? targetTemp.dates[targetTemp.dates.length - 1].date
    : matched.date;

  let nextStartTime = matched.startTime;
  let nextEndTime = matched.endTime;

  if (targetTemp.startMins !== null && targetTemp.endMins !== null) {
    nextStartTime = fromMinutes(targetTemp.startMins);
    nextEndTime = fromMinutes(targetTemp.endMins);
  } else if (targetTemp.startMins !== null) {
    const dur = targetTemp.explicitDurationMins ?? origDur;
    nextStartTime = fromMinutes(targetTemp.startMins);
    nextEndTime = fromMinutes(Math.min(24 * 60, targetTemp.startMins + dur));
  } else if (targetTemp.explicitDurationMins !== null) {
    nextEndTime = fromMinutes(Math.min(24 * 60, origStart + targetTemp.explicitDurationMins));
  }

  const changedSchedule =
    nextDate !== matched.date ||
    nextStartTime !== matched.startTime ||
    nextEndTime !== matched.endTime;
  const hasEnrichment =
    enrich.customColor !== undefined ||
    enrich.notes !== undefined ||
    enrich.alertOffsetMinutes !== undefined;

  if (!changedSchedule && !hasEnrichment && targetPart) {
    // User said "move dentist to 3pm" and it's already at 3pm, still allow confirming!
  }

  return {
    rawTranscript: rawTrimmed,
    mode: 'update-event',
    targetBlockId: matched.id,
    title: matched.title,
    date: nextDate,
    dateSpoken: true,
    startTime: nextStartTime,
    endTime: nextEndTime,
    whyCategory: matched.whyCategory,
    customColor: enrich.customColor ?? matched.customColor,
    notes: enrich.notes ?? matched.notes,
    alertOffsetMinutes:
      enrich.alertOffsetMinutes === null
        ? null
        : enrich.alertOffsetMinutes ?? matched.alertOffsetMinutes,
    missingFields: [],
    nextPrompt: `Move "${matched.title}" — tap ✓ or press Enter`,
    isComplete: true,
  };
}

const REVISION_SPLIT_RE =
  /(?:[,;!?]+|\.(?=\s+[a-z])|\b(?=(?:wait\s+no|no\s+wait|wait\s+actually|scratch\s+that|never\s*mind|actually|instead|i\s+mean|sorry|(?:the\s+)?(?:name|title)\s+should\s+be|it\s+should\s+be(?:\s+called|\s+named)?|change\s+(?:the\s+)?(?:name|title|event|time|start|end|day|date|it|that)|rename(?:\s+(?:it|that))?|call\s+(?:it|that)|name\s+(?:it|that)|title\s+(?:it|that)|make\s+(?:the\s+(?:name|title|time|day)|it|that)|switch\s+(?:(?:it|that)\s+)?to|update\s+(?:(?:it|that)\s+)?to|let'?s\s+(?:make\s+it|call\s+it|do)|no\b(?!\s*(?:problem|worries|thanks|thank\s+you)\b)\s+[a-z0-9])\b))/i;

const EXPLICIT_RENAME_TRIGGER_RE =
  /\b(?:(?:the\s+)?(?:name|title)\s+should\s+be|it\s+should\s+be(?:\s+called|\s+named)?|change\s+(?:the\s+)?(?:name|title|event|it|that)\s*(?:to|into)?|rename(?:\s+(?:it|that))?(?:\s+to)?|call\s+(?:it|that)|name\s+(?:it|that)|title\s+(?:it|that)|make\s+(?:the\s+(?:name|title)|it|that)|switch\s+(?:(?:it|that)\s+)?to|update\s+(?:(?:it|that)\s+)?to|let'?s\s+(?:make\s+it|call\s+it|do)|wait\s+no|no\s+wait|scratch\s+that|never\s*mind|actually|instead|i\s+mean|sorry|^no\b)\b/i;

/**
 * Progressive Live Voice Interpreter (Chronological Multi-Clause Revision Engine):
 *  1. Understands revisions & mind-changes anywhere in the stream ("actually make it 7 to 8:30",
 *     "change the name to dentist", "no call it Mom's Birthday", "make it tomorrow").
 *  2. Ignores post-time rambling & confirmation chatter ("yeah I think that works", "okay thanks")
 *     once the event name has already been stated.
 *  3. Repairs acoustic STT homophones ("4 to 5" -> "45" / "4:50" / "4 2 5", "8 30" -> "8:30").
 */
export function parseProgressiveVoiceDraft(
  rawInput: string,
  ctx: ScheduleAiContext
): VoiceScheduleDraft | null {
  const rawTrimmed = rawInput.trim();
  if (!rawTrimmed) return null;

  const normalized = normalizeSpokenTranscript(rawTrimmed);
  const enrich = extractSpokenEventEnrichments(normalized, ctx.blocks);
  const workingNormalized = enrich.cleanedText || normalized;
  const globalPeriodHint = detectPeriodHint(workingNormalized);

  // Check Move / Reschedule Existing Event Intent ("move Dentist to Friday at 3pm", "push Gym back 1 hour")
  const moveDraft = tryParseMoveExistingEvent(
    rawTrimmed,
    workingNormalized,
    enrich,
    globalPeriodHint,
    ctx
  );
  if (moveDraft) {
    return moveDraft;
  }

  // Check Slot-Placement Intent ("add ___ for the next focus slot")
  const slotTargetRegex =
    /(?:\b(?:for|in|into|to|during|on|at)\s+(?:the\s+|my\s+|a\s+|an\s+)?(?:(?:next|upcoming|first|open|available)\s+)?(?:focus\s*(?:slot|zone|block|time|session)|empty\s*(?:zone|slot|block)|open\s*(?:focus\s*)?(?:slot|zone|block)|free\s*(?:slot|block|time))\b|\b(?:the\s+|my\s+)?(?:next|upcoming|first)\s+(?:open\s+)?(?:focus\s*(?:slot|zone|block|time|session)|empty\s*(?:zone|slot|block)|open\s*(?:focus\s*)?(?:slot|zone|block)|free\s*(?:slot|block|time))\b)/i;
  const slotMatch = workingNormalized.match(slotTargetRegex);

  if (slotMatch && slotMatch.index !== undefined) {
    const beforeSlot = workingNormalized.slice(0, slotMatch.index);
    const afterSlot = workingNormalized.slice(slotMatch.index + slotMatch[0].length);
    const allDates = extractAllDatesChronological(workingNormalized, ctx.todayIso);
    const latestDate = allDates.length ? allDates[allDates.length - 1].date : undefined;
    const searchFromDate = latestDate ?? ctx.todayIso;

    // Check if user renamed after mentioning the focus slot ("...actually call it patio photos")
    let rawSubject = stripSpans(beforeSlot, allDates).trim();
    if (EXPLICIT_RENAME_TRIGGER_RE.test(afterSlot)) {
      const renamed = summarizePunchyTitle(stripSpans(afterSlot, []));
      if (renamed) rawSubject = renamed;
    } else if (!summarizePunchyTitle(rawSubject) && !isPureChatterOrEmpty(afterSlot)) {
      rawSubject = afterSlot;
    }

    const taskTitle = summarizePunchyTitle(rawSubject);
    const orderedOpenZones = [...ctx.blocks]
      .filter((b) => isOpenFocusBlock(b))
      .sort((a, b) =>
        a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
      );

    const chosenZone = latestDate
      ? orderedOpenZones.find((b) => b.date === latestDate) ??
        orderedOpenZones.find((b) => b.date >= latestDate)
      : orderedOpenZones.find((b) => b.date >= searchFromDate) ?? orderedOpenZones[0];

    const matchedIdea = taskTitle ? matchExistingIdea(taskTitle, ctx.ideas) : undefined;
    const finalTitle = taskTitle || matchedIdea?.title || undefined;
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
        customColor: enrich.customColor,
        notes: enrich.notes,
        alertOffsetMinutes: enrich.alertOffsetMinutes,
        targetBlockId: chosenZone.id,
        matchedIdeaId: matchedIdea?.id,
        startingStepHint: matchedIdea?.startingStep,
        missingFields: missing,
        nextPrompt: buildMissingPrompt('fill-slot', missing),
        isComplete: missing.length === 0,
      };
    }

    const gap = findOpenScheduleGap(ctx.blocks, searchFromDate, 60);
    return {
      rawTranscript: rawTrimmed,
      mode: 'empty-zone',
      title: finalTitle ? `Empty Zone — ${finalTitle}` : undefined,
      date: searchFromDate,
      dateSpoken: true,
      startTime: gap.startTime,
      endTime: gap.endTime,
      customColor: enrich.customColor,
      notes: enrich.notes,
      alertOffsetMinutes: enrich.alertOffsetMinutes,
      matchedIdeaId: matchedIdea?.id,
      startingStepHint: matchedIdea?.startingStep,
      missingFields: missing,
      nextPrompt: buildMissingPrompt('fill-slot', missing),
      isComplete: missing.length === 0,
    };
  }

  // Split transcript into ordered conversational clauses
  const rawClauses = workingNormalized
    .split(REVISION_SPLIT_RE)
    .map((c) => c.trim())
    .filter(Boolean);

  let title: string | undefined;
  let knownDate: string | undefined;
  let startMins: number | null = null;
  let endMins: number | null = null;
  let durationMins: number | null = null;

  for (let idx = 0; idx < rawClauses.length; idx += 1) {
    const clause = rawClauses[idx];
    if (isPureChatterOrEmpty(clause)) continue;

    const clausePeriod = detectPeriodHint(clause) ?? globalPeriodHint;
    const ext = extractClauseTemporals(clause, ctx.todayIso, clausePeriod, startMins);

    // 1. Apply sequential Date updates (latest date wins!)
    if (ext.dates.length > 0) {
      knownDate = ext.dates[ext.dates.length - 1].date;
    }

    // 2. Apply sequential Time / Duration updates (latest wins!)
    if (ext.explicitDurationMins !== null) {
      durationMins = ext.explicitDurationMins;
    }

    if (ext.startMins !== null && ext.endMins !== null) {
      startMins = ext.startMins;
      endMins = ext.endMins;
    } else if (ext.endOnlyUpdate && ext.endMins !== null) {
      endMins = ext.endMins;
    } else if (ext.startOnlyUpdate && ext.startMins !== null) {
      const prevDur =
        startMins !== null && endMins !== null && endMins > startMins
          ? endMins - startMins
          : durationMins;
      startMins = ext.startMins;
      if (prevDur !== null) {
        endMins = Math.min(23 * 60 + 55, startMins + prevDur);
      }
    } else if (ext.startMins !== null) {
      startMins = ext.startMins;
      endMins =
        durationMins !== null ? Math.min(23 * 60 + 55, startMins + durationMins) : null;
    } else if (ext.explicitDurationMins !== null && startMins !== null) {
      endMins = Math.min(23 * 60 + 55, startMins + ext.explicitDurationMins);
    }

    // 3. Title extraction & revision logic (guards strictly against post-time rambling!)
    const isExplicitRevision = idx > 0 && EXPLICIT_RENAME_TRIGGER_RE.test(clause);

    if (!title) {
      // Prefer subject spoken BEFORE time/date; only inspect post-time text if pre-time had no title
      const preCandidate = summarizePunchyTitle(ext.beforeTemporalText);
      if (preCandidate) {
        title = preCandidate;
        // Allow genuine complement right after time ("add dinner at 6 with parents", "family member's birthday tomorrow, my mom's")
        if (ext.afterTemporalText && !isPureChatterOrEmpty(ext.afterTemporalText)) {
          const refined = tryRefineExistingTitle(title, ext.afterTemporalText);
          if (refined) {
            title = refined;
          } else {
            const withComp = stripTrailingRamble(ext.afterTemporalText).match(
              /^(?:with|w\/)\s+(?:my\s+|our\s+)?([a-z][a-z\s]{1,22})$/i
            );
            if (withComp && /^(?:Dinner|Lunch|Brunch|Breakfast|Coffee|Drinks|Sync|Meet|Meeting)$/i.test(title)) {
              title = toPunchyTitleCase(`${title} w/ ${withComp[1].trim()}`);
            }
          }
        }
      } else if (ext.afterTemporalText && !isPureChatterOrEmpty(ext.afterTemporalText)) {
        const postCandidate = summarizePunchyTitle(ext.afterTemporalText);
        if (postCandidate) {
          title = postCandidate;
        }
      } else {
        const fullCandidate = summarizePunchyTitle(ext.strippedFullText);
        if (fullCandidate) {
          title = fullCandidate;
        }
      }
    } else if (isExplicitRevision) {
      // Explicit rename / correction clause ("change the name to dentist", "no make it Mom's Birthday", "actually yoga")
      const remainder = ext.strippedFullText
        .replace(
          /^(?:wait\s+actually|actually|wait\s+no|no\s+wait|no|instead|i\s+mean|sorry|scratch\s+that|never\s*mind)\s*/i,
          ''
        )
        .replace(
          /^(?:change\s+(?:the\s+)?(?:time|start(?:\s+time)?|end(?:\s+time)?|day|date)\s*(?:to)?|move\s+(?:it\s+)?to)\s*$/i,
          ''
        )
        .trim();

      // Only replace title if something substantive besides time/date words was actually spoken!
      if (remainder && !isPureChatterOrEmpty(remainder)) {
        const refined = tryRefineExistingTitle(title, remainder);
        if (refined) {
          title = refined;
        } else {
          const nextTitle = summarizePunchyTitle(remainder);
          if (
            nextTitle &&
            !/^(?:Time|Start|End|Day|Date|Schedule|Calendar|It)$/i.test(nextTitle)
          ) {
            title = nextTitle;
          }
        }
      }
    } else {
      // Non-revision follow-up clause (e.g., ", my moms" after "family members birthday", OR trailing ramble!)
      const refined = tryRefineExistingTitle(title, ext.strippedFullText);
      if (refined) {
        title = refined;
      }
      // Otherwise, ignore post-time chatter completely so `title` stays crisp and untouched!
    }
  }

  // Check if speaker is verbally modifying an existing calendar event's color, description, or alert
  // (e.g., "make Physics Honors purple and alert 10 minutes early", "add description bring calculator to AP Pre-Calculus")
  const hasEnrichment =
    enrich.customColor !== undefined ||
    enrich.notes !== undefined ||
    enrich.alertOffsetMinutes !== undefined;
  const startsWithExplicitNewEventVerb =
    /^\s*(?:hey\s+|ok\s+|okay\s+|please\s+|can\s+you\s+)?(?:add|create|schedule|new|book)\s+(?!(?:a\s+|the\s+|an\s+)?(?:description|details?|notes?|alert|alarm|notification|color)\b)/i.test(
      normalized
    );

  if (startMins === null && endMins === null && hasEnrichment && !startsWithExplicitNewEventVerb) {
    const matchedExisting = findMatchingBlockForUpdate(enrich.cleanedText, knownDate, ctx);
    if (matchedExisting) {
      return {
        rawTranscript: rawTrimmed,
        mode: 'update-event',
        targetBlockId: matchedExisting.id,
        title: matchedExisting.title,
        date: matchedExisting.date,
        dateSpoken: true,
        startTime: matchedExisting.startTime,
        endTime: matchedExisting.endTime,
        whyCategory: matchedExisting.whyCategory,
        customColor: enrich.customColor ?? matchedExisting.customColor,
        notes: enrich.notes ?? matchedExisting.notes,
        alertOffsetMinutes:
          enrich.alertOffsetMinutes === null
            ? null
            : enrich.alertOffsetMinutes ?? matchedExisting.alertOffsetMinutes,
        missingFields: [],
        nextPrompt: 'Complete — tap ✓ or press Enter to update',
        isComplete: true,
      };
    }
  }

  // Determine final mode
  const isPureEmptyZoneRequest =
    /\b(?:open\s+(?:an?\s+)?empty\s*zone|new\s+empty\s*zone|add\s+(?:an?\s+)?empty\s*zone)\b/i.test(
      workingNormalized
    );
  const isReminder =
    !isPureEmptyZoneRequest && /\b(remind(?:\s+me)?|reminder)\b/i.test(workingNormalized);

  if (isReminder) {
    const hasDate = Boolean(knownDate) || startMins !== null;
    const remDate = hasDate ? (knownDate ?? ctx.todayIso) : undefined;
    const remStart = startMins !== null ? fromMinutes(startMins) : undefined;
    const missing: MissingVoiceField[] = [];
    if (!title) missing.push('title');
    if (!remDate) missing.push('date');
    if (!remStart) missing.push('startTime');

    return {
      rawTranscript: rawTrimmed,
      mode: 'reminder',
      title,
      date: remDate,
      dateSpoken: Boolean(knownDate),
      startTime: remStart,
      missingFields: missing,
      nextPrompt: buildMissingPrompt('reminder', missing),
      isComplete: missing.length === 0,
    };
  }

  const mode: 'event' | 'empty-zone' = isPureEmptyZoneRequest ? 'empty-zone' : 'event';
  const effectiveTitle = isPureEmptyZoneRequest
    ? title && !/^empty zone/i.test(title)
      ? `Empty Zone — ${title}`
      : 'Empty Zone — Open Focus Slot'
    : title;

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
    dateSpoken: Boolean(knownDate),
    startTime: knownStart,
    endTime: knownEnd,
    whyCategory:
      mode === 'event' && effectiveTitle
        ? inferWhyFromTitle(effectiveTitle, workingNormalized)
        : undefined,
    customColor: enrich.customColor,
    notes: enrich.notes,
    alertOffsetMinutes: enrich.alertOffsetMinutes,
    missingFields: missing,
    nextPrompt: buildMissingPrompt(mode, missing, knownStart),
    isComplete: missing.length === 0,
  };
}

/**
 * Full single-shot interpreter (retained for compatibility).
 */
export function interpretScheduleInput(
  rawInput: string,
  ctx: ScheduleAiContext
): ParsedLiveInput | null {
  const draft = parseProgressiveVoiceDraft(rawInput, ctx);
  if (!draft) return null;

  const date = draft.date ?? (ctx.selectedDate || ctx.todayIso);

  if (draft.mode === 'update-event' && draft.targetBlockId && draft.startTime) {
    return {
      mode: 'update-event',
      title: draft.title ?? 'Event',
      date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      whyCategory: draft.whyCategory,
      customColor: draft.customColor,
      notes: draft.notes,
      alertOffsetMinutes: draft.alertOffsetMinutes,
      targetBlockId: draft.targetBlockId,
      explanation: 'Updated existing calendar event',
    };
  }

  if (draft.mode === 'fill-slot' && draft.targetBlockId && draft.startTime) {
    return {
      mode: 'fill-slot',
      title: draft.title ?? 'Deep Focus Work',
      date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      customColor: draft.customColor,
      notes: draft.notes,
      alertOffsetMinutes: draft.alertOffsetMinutes,
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
    customColor: draft.customColor,
    notes: draft.notes,
    alertOffsetMinutes: draft.alertOffsetMinutes,
    matchedIdeaId: draft.matchedIdeaId,
    startingStepHint: draft.startingStepHint,
    explanation,
  };
}
