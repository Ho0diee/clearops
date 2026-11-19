import type { CalendarBlock, ReminderItem } from '../types/schema';

export type OhchsDayCode =
  | 'GREEN MON'
  | 'GOLD TUES'
  | 'GREEN WED'
  | 'GOLD WED'
  | 'GREEN THURS'
  | 'EN THURS'
  | 'GOLD FRIDAY'
  | 'GREEN LATE 90 MINS'
  | 'GOLD LATE 90 MINS'
  | 'GREEN LATE 2 HRS'
  | 'GOLD LATE 2 HRS';

export type OhchsDelayMode = 'regular' | 'late-90' | 'late-2hr';

interface PeriodTemplate {
  key: string;
  startTime: string;
  endTime: string;
  title: string;
  detail: string;
}

export const OHCHS_BELL_SCHEDULES: Record<OhchsDayCode, PeriodTemplate[]> = {
  'GREEN MON': [
    {
      key: 'adv',
      startTime: '07:35',
      endTime: '07:45',
      title: 'Advisory · E213',
      detail: 'Teacher: Ms. Daley · Room E213',
    },
    {
      key: 'p1',
      startTime: '07:50',
      endTime: '09:08',
      title: 'AP Pre-Calculus w/ Trig · B262',
      detail: 'Period 01 · Ms. Grover · Room B262',
    },
    {
      key: 'p2',
      startTime: '09:13',
      endTime: '10:31',
      title: 'Physics Honors · A203',
      detail: 'Period 02 · Mr. Otterson · Room A203',
    },
    {
      key: 'p3',
      startTime: '10:36',
      endTime: '12:29',
      title: 'Senior Privileges',
      detail: 'Period 03 · Admin',
    },
    {
      key: 'p4',
      startTime: '12:34',
      endTime: '13:52',
      title: 'Senior Privileges',
      detail: 'Period 04 · Admin',
    },
  ],

  'GOLD TUES': [
    {
      key: 'adv',
      startTime: '07:35',
      endTime: '08:15',
      title: 'Advisory · E213',
      detail: 'Teacher: Ms. Daley · Room E213',
    },
    {
      key: 'p5',
      startTime: '08:20',
      endTime: '09:30',
      title: 'AP Environmental Science',
      detail: 'Period 05 · Ms. Fox',
    },
    {
      key: 'p6',
      startTime: '09:35',
      endTime: '10:45',
      title: 'AP US Gov & Politics · B231',
      detail: 'Period 06 · Ms. Kurtz · Room B231',
    },
    {
      key: 'p7',
      startTime: '10:50',
      endTime: '12:35',
      title: 'AP Literature & Comp · A222',
      detail: 'Period 07 · Mr. Lauby · Room A222 · A Lunch',
    },
  ],

  'GREEN WED': [
    {
      key: 'adv',
      startTime: '07:35',
      endTime: '07:45',
      title: 'Advisory · E213',
      detail: 'Teacher: Ms. Daley · Room E213',
    },
    {
      key: 'p1',
      startTime: '07:50',
      endTime: '08:53',
      title: 'AP Pre-Calculus w/ Trig · B262',
      detail: 'Period 01 · Ms. Grover · Room B262',
    },
    {
      key: 'p2',
      startTime: '08:58',
      endTime: '10:01',
      title: 'Physics Honors · A203',
      detail: 'Period 02 · Mr. Otterson · Room A203',
    },
    {
      key: 'p3',
      startTime: '10:06',
      endTime: '11:44',
      title: 'Senior Privileges',
      detail: 'Period 03 · Admin',
    },
    {
      key: 'p4',
      startTime: '11:49',
      endTime: '12:52',
      title: 'Senior Privileges',
      detail: 'Period 04 · Admin',
    },
  ],

  'GREEN THURS': [
    {
      key: 'adv',
      startTime: '07:35',
      endTime: '08:15',
      title: 'Advisory · E213',
      detail: 'Teacher: Ms. Daley · Room E213',
    },
    {
      key: 'p1',
      startTime: '08:20',
      endTime: '09:30',
      title: 'AP Pre-Calculus w/ Trig · B262',
      detail: 'Period 01 · Ms. Grover · Room B262',
    },
    {
      key: 'p2',
      startTime: '09:35',
      endTime: '10:45',
      title: 'Physics Honors · A203',
      detail: 'Period 02 · Mr. Otterson · Room A203',
    },
    {
      key: 'p3',
      startTime: '10:50',
      endTime: '12:35',
      title: 'Senior Privileges',
      detail: 'Period 03 · Admin',
    },
    {
      key: 'p4',
      startTime: '12:40',
      endTime: '13:52',
      title: 'Senior Privileges',
      detail: 'Period 04 · Admin',
    },
  ],

  'EN THURS': [
    {
      key: 'en',
      startTime: '07:35',
      endTime: '08:15',
      title: 'Enrichment (Puzzles) · B256',
      detail: 'Period EN: Puzzles (Room B256) · Advisory: Ms. Daley (Room E213)',
    },
    {
      key: 'p1',
      startTime: '08:20',
      endTime: '09:30',
      title: 'AP Pre-Calculus w/ Trig · B262',
      detail: 'Period 01 · Ms. Grover · Room B262',
    },
    {
      key: 'p2',
      startTime: '09:35',
      endTime: '10:45',
      title: 'Physics Honors · A203',
      detail: 'Period 02 · Mr. Otterson · Room A203',
    },
    {
      key: 'p3',
      startTime: '10:50',
      endTime: '12:35',
      title: 'Senior Privileges',
      detail: 'Period 03 · Admin',
    },
    {
      key: 'p4',
      startTime: '12:40',
      endTime: '13:52',
      title: 'Senior Privileges',
      detail: 'Period 04 · Admin',
    },
  ],

  'GOLD FRIDAY': [
    {
      key: 'adv',
      startTime: '07:35',
      endTime: '07:45',
      title: 'Advisory · E213',
      detail: 'Teacher: Ms. Daley · Room E213',
    },
    {
      key: 'p5',
      startTime: '07:50',
      endTime: '09:08',
      title: 'AP Environmental Science',
      detail: 'Period 05 · Ms. Fox',
    },
    {
      key: 'p6',
      startTime: '09:13',
      endTime: '10:31',
      title: 'AP US Gov & Politics · B231',
      detail: 'Period 06 · Ms. Kurtz · Room B231',
    },
    {
      key: 'p7',
      startTime: '10:36',
      endTime: '12:29',
      title: 'AP Literature & Comp · A222',
      detail: 'Period 07 · Mr. Lauby · Room A222 · A Lunch',
    },
  ],

  'GOLD WED': [
    {
      key: 'adv',
      startTime: '07:35',
      endTime: '07:45',
      title: 'Advisory · E213',
      detail: 'Teacher: Ms. Daley · Room E213',
    },
    {
      key: 'p5',
      startTime: '07:50',
      endTime: '08:53',
      title: 'AP Environmental Science',
      detail: 'Period 05 · Ms. Fox',
    },
    {
      key: 'p6',
      startTime: '08:58',
      endTime: '10:01',
      title: 'AP US Gov & Politics · B231',
      detail: 'Period 06 · Ms. Kurtz · Room B231',
    },
    {
      key: 'p7a',
      startTime: '10:06',
      endTime: '11:44',
      title: 'AP Literature & Comp · A222',
      detail: 'Period 07 · Mr. Lauby · Room A222 · A Lunch',
    },
    {
      key: 'p7b',
      startTime: '10:06',
      endTime: '11:44',
      title: 'Business Internship · B260',
      detail: 'Period 07 · Ms. Dillingham · Room B260 · B Lunch',
    },
    {
      key: 'p8',
      startTime: '11:49',
      endTime: '12:52',
      title: 'Business Internship · B260',
      detail: 'Period 08 · Ms. Dillingham · Room B260 · B Lunch',
    },
  ],

  'GREEN LATE 90 MINS': [
    {
      key: 'adv',
      startTime: '09:05',
      endTime: '09:15',
      title: 'Advisory · E213',
      detail: '90-Min Delay · Ms. Daley · Room E213',
    },
    {
      key: 'p1',
      startTime: '09:20',
      endTime: '10:15',
      title: 'AP Pre-Calculus w/ Trig · B262',
      detail: 'Period 01 (90-Min Delay) · Ms. Grover · Room B262',
    },
    {
      key: 'p2',
      startTime: '10:20',
      endTime: '11:15',
      title: 'Physics Honors · A203',
      detail: 'Period 02 (90-Min Delay) · Mr. Otterson · Room A203',
    },
    {
      key: 'p3',
      startTime: '11:20',
      endTime: '12:36',
      title: 'Senior Privileges',
      detail: 'Period 03 (90-Min Delay) · Admin',
    },
    {
      key: 'p4',
      startTime: '12:50',
      endTime: '13:52',
      title: 'Senior Privileges',
      detail: 'Period 04 (90-Min Delay) · Admin',
    },
  ],

  'GOLD LATE 90 MINS': [
    {
      key: 'adv',
      startTime: '09:05',
      endTime: '09:15',
      title: 'Advisory · E213',
      detail: '90-Min Delay · Ms. Daley · Room E213',
    },
    {
      key: 'p5',
      startTime: '09:20',
      endTime: '10:15',
      title: 'AP Environmental Science',
      detail: 'Period 05 (90-Min Delay) · Ms. Fox',
    },
    {
      key: 'p6',
      startTime: '10:20',
      endTime: '11:15',
      title: 'AP US Gov & Politics · B231',
      detail: 'Period 06 (90-Min Delay) · Ms. Kurtz · Room B231',
    },
    {
      key: 'p7a',
      startTime: '11:20',
      endTime: '12:36',
      title: 'AP Literature & Comp · A222',
      detail: 'Period 07 (90-Min Delay) · Mr. Lauby · Room A222 · A Lunch',
    },
    {
      key: 'p7b',
      startTime: '11:20',
      endTime: '12:36',
      title: 'Business Internship · B260',
      detail: 'Period 07 (90-Min Delay) · Ms. Dillingham · Room B260 · B Lunch',
    },
    {
      key: 'p8',
      startTime: '12:50',
      endTime: '13:52',
      title: 'Business Internship · B260',
      detail: 'Period 08 (90-Min Delay) · Ms. Dillingham · Room B260 · B Lunch',
    },
  ],

  'GREEN LATE 2 HRS': [
    {
      key: 'adv',
      startTime: '09:35',
      endTime: '09:45',
      title: 'Advisory · E213',
      detail: '2-Hr Delay · Ms. Daley · Room E213',
    },
    {
      key: 'p1',
      startTime: '09:50',
      endTime: '10:40',
      title: 'AP Pre-Calculus w/ Trig · B262',
      detail: 'Period 01 (2-Hr Delay) · Ms. Grover · Room B262',
    },
    {
      key: 'p2',
      startTime: '10:45',
      endTime: '12:03',
      title: 'Physics Honors · A203',
      detail: 'Period 02 (2-Hr Delay) · Mr. Otterson · Room A203',
    },
    {
      key: 'p3',
      startTime: '12:10',
      endTime: '13:00',
      title: 'Senior Privileges',
      detail: 'Period 03 (2-Hr Delay) · Admin',
    },
    {
      key: 'p4',
      startTime: '13:05',
      endTime: '13:52',
      title: 'Senior Privileges',
      detail: 'Period 04 (2-Hr Delay) · Admin',
    },
  ],

  'GOLD LATE 2 HRS': [
    {
      key: 'adv',
      startTime: '09:35',
      endTime: '09:45',
      title: 'Advisory · E213',
      detail: '2-Hr Delay · Ms. Daley · Room E213',
    },
    {
      key: 'p5',
      startTime: '09:50',
      endTime: '10:40',
      title: 'AP Environmental Science',
      detail: 'Period 05 (2-Hr Delay) · Ms. Fox',
    },
    {
      key: 'p6',
      startTime: '10:45',
      endTime: '12:03',
      title: 'AP US Gov & Politics · B231',
      detail: 'Period 06 (2-Hr Delay) · Ms. Kurtz · Room B231',
    },
    {
      key: 'p7a',
      startTime: '12:10',
      endTime: '13:00',
      title: 'AP Literature & Comp · A222',
      detail: 'Period 07 (2-Hr Delay) · Mr. Lauby · Room A222 · A Lunch',
    },
    {
      key: 'p7b',
      startTime: '12:10',
      endTime: '13:00',
      title: 'Business Internship · B260',
      detail: 'Period 07 (2-Hr Delay) · Ms. Dillingham · Room B260 · B Lunch',
    },
    {
      key: 'p8',
      startTime: '13:05',
      endTime: '13:52',
      title: 'Business Internship · B260',
      detail: 'Period 08 (2-Hr Delay) · Ms. Dillingham · Room B260 · B Lunch',
    },
  ],
};

/** Full OHCHS 2026–2027 Day Rotation & No School Calendar */
const RAW_OHCHS_2026_2027_CALENDAR = `
2026-08-31 | Mon | GREEN MON (First Day of School)
2026-09-01 | Tue | GOLD TUES
2026-09-02 | Wed | GREEN WED
2026-09-03 | Thu | GREEN THURS
2026-09-04 | Fri | GOLD FRIDAY
2026-09-07 | Mon | NO SCHOOL (Labor Day)
2026-09-08 | Tue | GOLD TUES
2026-09-09 | Wed | GREEN WED
2026-09-10 | Thu | GREEN THURS
2026-09-11 | Fri | GOLD FRIDAY
2026-09-14 | Mon | GREEN MON
2026-09-15 | Tue | GOLD TUES
2026-09-16 | Wed | GOLD WED
2026-09-17 | Thu | GREEN THURS
2026-09-18 | Fri | GOLD FRIDAY
2026-09-21 | Mon | GREEN MON
2026-09-22 | Tue | GOLD TUES
2026-09-23 | Wed | GREEN WED
2026-09-24 | Thu | EN THURS
2026-09-25 | Fri | GOLD FRIDAY
2026-09-28 | Mon | GREEN MON
2026-09-29 | Tue | GOLD TUES
2026-09-30 | Wed | GOLD WED
2026-10-01 | Thu | GREEN THURS
2026-10-02 | Fri | GOLD FRIDAY
2026-10-05 | Mon | GREEN MON
2026-10-06 | Tue | GOLD TUES
2026-10-07 | Wed | GREEN WED
2026-10-08 | Thu | EN THURS
2026-10-09 | Fri | NO SCHOOL (Teacher Workshop Day)
2026-10-12 | Mon | NO SCHOOL (Indigenous Peoples' Day)
2026-10-13 | Tue | GOLD TUES
2026-10-14 | Wed | GOLD WED
2026-10-15 | Thu | GREEN THURS
2026-10-16 | Fri | GOLD FRIDAY
2026-10-19 | Mon | GREEN MON
2026-10-20 | Tue | GOLD TUES
2026-10-21 | Wed | GREEN WED
2026-10-22 | Thu | EN THURS
2026-10-23 | Fri | GOLD FRIDAY
2026-10-26 | Mon | GREEN MON
2026-10-27 | Tue | GOLD TUES
2026-10-28 | Wed | GOLD WED
2026-10-29 | Thu | GREEN THURS
2026-10-30 | Fri | GOLD FRIDAY (End of Q1)
2026-11-02 | Mon | GREEN MON (Start of Q2)
2026-11-03 | Tue | GOLD TUES
2026-11-04 | Wed | GREEN WED
2026-11-05 | Thu | EN THURS
2026-11-06 | Fri | GOLD FRIDAY
2026-11-09 | Mon | GREEN MON
2026-11-10 | Tue | GOLD TUES
2026-11-11 | Wed | NO SCHOOL (Veterans Day)
2026-11-12 | Thu | GREEN THURS
2026-11-13 | Fri | GOLD FRIDAY
2026-11-16 | Mon | GREEN MON
2026-11-17 | Tue | GOLD TUES
2026-11-18 | Wed | GREEN WED
2026-11-19 | Thu | EN THURS
2026-11-20 | Fri | GOLD FRIDAY
2026-11-23 | Mon | GREEN MON
2026-11-24 | Tue | GOLD TUES
2026-11-25 | Wed | NO SCHOOL (Thanksgiving Recess)
2026-11-26 | Thu | NO SCHOOL (Thanksgiving Day)
2026-11-27 | Fri | NO SCHOOL (Thanksgiving Recess)
2026-11-30 | Mon | GREEN MON
2026-12-01 | Tue | GOLD TUES
2026-12-02 | Wed | GOLD WED
2026-12-03 | Thu | GREEN THURS
2026-12-04 | Fri | GOLD FRIDAY
2026-12-07 | Mon | GREEN MON
2026-12-08 | Tue | GOLD TUES
2026-12-09 | Wed | GREEN WED
2026-12-10 | Thu | EN THURS
2026-12-11 | Fri | GOLD FRIDAY
2026-12-14 | Mon | GREEN MON
2026-12-15 | Tue | GOLD TUES
2026-12-16 | Wed | GOLD WED
2026-12-17 | Thu | GREEN THURS
2026-12-18 | Fri | GOLD FRIDAY
2026-12-21 | Mon | GREEN MON
2026-12-22 | Tue | GOLD TUES
2026-12-23 | Wed | NO SCHOOL (Winter Holiday Recess)
2026-12-24 | Thu | NO SCHOOL (Winter Holiday Recess)
2026-12-25 | Fri | NO SCHOOL (Christmas Day)
2026-12-28 | Mon | NO SCHOOL (Winter Holiday Recess)
2026-12-29 | Tue | NO SCHOOL (Winter Holiday Recess)
2026-12-30 | Wed | NO SCHOOL (Winter Holiday Recess)
2026-12-31 | Thu | NO SCHOOL (Winter Holiday Recess)
2027-01-01 | Fri | NO SCHOOL (New Year's Day)
2027-01-04 | Mon | GREEN MON
2027-01-05 | Tue | GOLD TUES
2027-01-06 | Wed | GREEN WED
2027-01-07 | Thu | EN THURS
2027-01-08 | Fri | GOLD FRIDAY
2027-01-11 | Mon | GREEN MON
2027-01-12 | Tue | GOLD TUES
2027-01-13 | Wed | GOLD WED
2027-01-14 | Thu | GREEN THURS
2027-01-15 | Fri | GOLD FRIDAY (End of Q2 / Semester 1)
2027-01-18 | Mon | NO SCHOOL (Martin Luther King Jr. Day)
2027-01-19 | Tue | GOLD TUES (Start of Q3 / Semester 2)
2027-01-20 | Wed | GREEN WED
2027-01-21 | Thu | EN THURS
2027-01-22 | Fri | GOLD FRIDAY
2027-01-25 | Mon | GREEN MON
2027-01-26 | Tue | GOLD TUES
2027-01-27 | Wed | GOLD WED
2027-01-28 | Thu | GREEN THURS
2027-01-29 | Fri | GOLD FRIDAY
2027-02-01 | Mon | GREEN MON
2027-02-02 | Tue | GOLD TUES
2027-02-03 | Wed | GREEN WED
2027-02-04 | Thu | EN THURS
2027-02-05 | Fri | GOLD FRIDAY
2027-02-08 | Mon | GREEN MON
2027-02-09 | Tue | GOLD TUES
2027-02-10 | Wed | GOLD WED
2027-02-11 | Thu | GREEN THURS
2027-02-12 | Fri | GOLD FRIDAY
2027-02-15 | Mon | NO SCHOOL (Presidents' Day / February Break)
2027-02-16 | Tue | NO SCHOOL (February Break)
2027-02-17 | Wed | NO SCHOOL (February Break)
2027-02-18 | Thu | NO SCHOOL (February Break)
2027-02-19 | Fri | NO SCHOOL (February Break)
2027-02-22 | Mon | GREEN MON
2027-02-23 | Tue | GOLD TUES
2027-02-24 | Wed | GREEN WED
2027-02-25 | Thu | EN THURS
2027-02-26 | Fri | GOLD FRIDAY
2027-03-01 | Mon | GREEN MON
2027-03-02 | Tue | GOLD TUES
2027-03-03 | Wed | GOLD WED
2027-03-04 | Thu | GREEN THURS
2027-03-05 | Fri | GOLD FRIDAY
2027-03-08 | Mon | GREEN MON
2027-03-09 | Tue | GOLD TUES
2027-03-10 | Wed | GOLD WED (Parent-Teacher Conferences)
2027-03-11 | Thu | EN THURS
2027-03-12 | Fri | GOLD FRIDAY
2027-03-15 | Mon | GREEN MON
2027-03-16 | Tue | GOLD TUES
2027-03-17 | Wed | GREEN WED
2027-03-18 | Thu | GREEN THURS
2027-03-19 | Fri | NO SCHOOL (Teacher Workshop Day)
2027-03-22 | Mon | GREEN MON
2027-03-23 | Tue | GOLD TUES
2027-03-24 | Wed | GOLD WED
2027-03-25 | Thu | EN THURS
2027-03-26 | Fri | GOLD FRIDAY
2027-03-29 | Mon | GREEN MON
2027-03-30 | Tue | GOLD TUES
2027-03-31 | Wed | GREEN WED
2027-04-01 | Thu | GREEN THURS
2027-04-02 | Fri | GOLD FRIDAY (End of Q3)
2027-04-05 | Mon | GREEN MON (Start of Q4)
2027-04-06 | Tue | GOLD TUES
2027-04-07 | Wed | GOLD WED
2027-04-08 | Thu | EN THURS
2027-04-09 | Fri | GOLD FRIDAY
2027-04-12 | Mon | GREEN MON
2027-04-13 | Tue | GOLD TUES
2027-04-14 | Wed | GREEN WED
2027-04-15 | Thu | GREEN THURS
2027-04-16 | Fri | NO SCHOOL (Teacher Vacation)
2027-04-19 | Mon | NO SCHOOL (Patriots' Day / Spring Break)
2027-04-20 | Tue | NO SCHOOL (Spring Break)
2027-04-21 | Wed | NO SCHOOL (Spring Break)
2027-04-22 | Thu | NO SCHOOL (Spring Break)
2027-04-23 | Fri | NO SCHOOL (Spring Break)
2027-04-26 | Mon | GREEN MON
2027-04-27 | Tue | GOLD TUES
2027-04-28 | Wed | GOLD WED
2027-04-29 | Thu | EN THURS
2027-04-30 | Fri | GOLD FRIDAY
2027-05-03 | Mon | GREEN MON
2027-05-04 | Tue | GOLD TUES
2027-05-05 | Wed | GREEN WED
2027-05-06 | Thu | GREEN THURS
2027-05-07 | Fri | GOLD FRIDAY
2027-05-10 | Mon | GREEN MON
2027-05-11 | Tue | GOLD TUES
2027-05-12 | Wed | GOLD WED
2027-05-13 | Thu | EN THURS
2027-05-14 | Fri | GOLD FRIDAY
2027-05-17 | Mon | GREEN MON
2027-05-18 | Tue | GOLD TUES
2027-05-19 | Wed | GREEN WED
2027-05-20 | Thu | GREEN THURS
2027-05-21 | Fri | GOLD FRIDAY
2027-05-24 | Mon | GREEN MON
2027-05-25 | Tue | GOLD TUES
2027-05-26 | Wed | GOLD WED
2027-05-27 | Thu | EN THURS
2027-05-28 | Fri | GOLD FRIDAY
2027-05-31 | Mon | NO SCHOOL (Memorial Day)
2027-06-01 | Tue | GOLD TUES
2027-06-02 | Wed | GREEN WED
2027-06-03 | Thu | GREEN THURS
2027-06-04 | Fri | GOLD FRIDAY
2027-06-07 | Mon | GREEN MON
2027-06-08 | Tue | GOLD TUES
2027-06-09 | Wed | GOLD WED
2027-06-10 | Thu | GREEN THURS (Scheduled Last Day of School / End of Q4)
`;

export interface OhchsCalendarEntry {
  date: string;
  isNoSchool: boolean;
  dayCode?: OhchsDayCode;
  note?: string;
  rawLabel: string;
}

const KNOWN_CODES: OhchsDayCode[] = [
  'GREEN MON',
  'GOLD TUES',
  'GREEN WED',
  'GOLD WED',
  'GREEN THURS',
  'EN THURS',
  'GOLD FRIDAY',
];

export const OHCHS_CALENDAR_ENTRIES: OhchsCalendarEntry[] = RAW_OHCHS_2026_2027_CALENDAR.trim()
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [datePart, , labelPart] = line.split('|').map((s) => s.trim());
    if (labelPart.startsWith('NO SCHOOL')) {
      const reason = labelPart.match(/\(([^)]+)\)/)?.[1];
      return {
        date: datePart,
        isNoSchool: true,
        note: reason,
        rawLabel: reason ? `NO SCHOOL — ${reason}` : 'NO SCHOOL',
      };
    }

    const matchedCode = KNOWN_CODES.find((c) => labelPart.startsWith(c));
    const extraNote = labelPart.match(/\(([^)]+)\)/)?.[1];
    return {
      date: datePart,
      isNoSchool: false,
      dayCode: matchedCode,
      note: extraNote,
      rawLabel: extraNote ? `${matchedCode ?? labelPart} · ${extraNote}` : matchedCode ?? labelPart,
    };
  });

export const OHCHS_BY_DATE = new Map<string, OhchsCalendarEntry>(
  OHCHS_CALENDAR_ENTRIES.map((e) => [e.date, e])
);

export function resolveDelayedDayCode(
  baseCode: OhchsDayCode,
  delayMode: OhchsDelayMode
): OhchsDayCode {
  if (delayMode === 'regular') return baseCode;
  const isGold = baseCode.startsWith('GOLD');
  if (delayMode === 'late-90') {
    return isGold ? 'GOLD LATE 90 MINS' : 'GREEN LATE 90 MINS';
  }
  return isGold ? 'GOLD LATE 2 HRS' : 'GREEN LATE 2 HRS';
}

export function buildOhchsBlocksForEntry(
  entry: OhchsCalendarEntry,
  todayIso: string,
  delayMode: OhchsDelayMode = 'regular'
): CalendarBlock[] {
  if (entry.isNoSchool || !entry.dayCode) return [];
  const effectiveCode = resolveDelayedDayCode(entry.dayCode, delayMode);
  const periods = OHCHS_BELL_SCHEDULES[effectiveCode] ?? [];
  const isPast = entry.date < todayIso;

  return periods.map((p) => ({
    id: `ohchs-${entry.date}-${p.key}`,
    date: entry.date,
    startTime: p.startTime,
    endTime: p.endTime,
    title: p.title,
    kind: 'baseline',
    completed: isPast,
    whyCategory: 'School',
    startingStepHint: p.detail,
  }));
}

export function buildOhchsPinForEntry(
  entry: OhchsCalendarEntry,
  todayIso: string,
  delayMode: OhchsDelayMode = 'regular'
): ReminderItem {
  const isPast = entry.date < todayIso;
  if (entry.isNoSchool) {
    return {
      id: `ohchs-rot-${entry.date}`,
      date: entry.date,
      time: '08:00',
      title: entry.rawLabel,
      completed: isPast,
    };
  }
  const delaySuffix =
    delayMode === 'late-90'
      ? ' (90m Delay)'
      : delayMode === 'late-2hr'
      ? ' (2hr Delay)'
      : '';
  const time = delayMode === 'late-2hr' ? '09:10' : delayMode === 'late-90' ? '08:40' : '07:05';
  return {
    id: `ohchs-rot-${entry.date}`,
    date: entry.date,
    time,
    title: `${entry.rawLabel}${delaySuffix}`,
    completed: isPast,
  };
}

export function buildFullOhchsSchedule(todayIso: string): {
  blocks: CalendarBlock[];
  reminders: ReminderItem[];
} {
  const blocks: CalendarBlock[] = [];
  const reminders: ReminderItem[] = [];

  for (const entry of OHCHS_CALENDAR_ENTRIES) {
    reminders.push(buildOhchsPinForEntry(entry, todayIso, 'regular'));
    if (!entry.isNoSchool && entry.dayCode) {
      blocks.push(...buildOhchsBlocksForEntry(entry, todayIso, 'regular'));
    }
  }

  return { blocks, reminders };
}
