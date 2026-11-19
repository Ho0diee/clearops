import { createHash } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import {
  BlobPreconditionFailedError,
  readPrivateJsonStore,
  writePrivateJsonStore,
} from './kvStore.js';
import {
  buildFullOhchsSchedule,
  buildOhchsBlocksForEntry,
  OHCHS_BY_DATE,
} from '../store/ohchsSchedule.js';
import {
  createEmptyTombstones,
  isCustomizedOhchsBlock,
  mergeUniversalPayload,
  type UniversalSyncPayload,
} from '../store/universalMerge.js';
import {
  fetchLiveAudiobookTracks,
  parseAudiobookTracksFromCsv,
} from './audiobookCatalog.js';
import {
  addDays,
  applyExtractedAssignmentsToSchedule,
  getEasternNow,
  reconcileSchoolworkLifecycle,
  SCHOOL_COURSES,
  stripAllAutoSchoolworkSections,
  type SchoolCourseId,
  type StandardizedExtractedAssignment,
} from './standardizedEngine.js';

export const WORKSPACE_BLOB_PATH = 'intuition/universal-workspace-v1.json';
export const AUTOMATION_CONFIG_BLOB_PATH = 'intuition/schoolwork-automation-v1.json';
export const DEBUG_CAPTURES_BLOB_PATH = 'intuition/schoolwork-debug-v1.json';

export const DEFAULT_ECO_SLIDE_ID = '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI';

export interface CourseScrapeMeta {
  accountSelector?: string;
  expandedCount?: number;
  detailCount?: number;
  sourceUrls?: string[];
  error?: string;
}

export interface CourseDebugCapture {
  courseId: SchoolCourseId;
  capturedAt: string;
  ok: boolean;
  slideTitle: string;
  sourceUrl?: string;
  rawCharCount: number;
  rawText: string;
  scrapeMeta?: CourseScrapeMeta;
  aiModelUsed?: string;
  aiSummary?: string;
  extractedAssignments: StandardizedExtractedAssignment[];
  addedCount: number;
  updatedCount: number;
}

export interface SchoolworkDebugStore {
  updatedAt: string;
  byCourse: Partial<Record<SchoolCourseId, CourseDebugCapture>>;
}

export async function loadSchoolworkDebugCaptures(): Promise<SchoolworkDebugStore> {
  try {
    const res = await readPrivateJsonStore<Partial<SchoolworkDebugStore>>(
      DEBUG_CAPTURES_BLOB_PATH
    );
    return {
      updatedAt: res.data?.updatedAt || new Date().toISOString(),
      byCourse: res.data?.byCourse ?? {},
    };
  } catch {
    return {
      updatedAt: new Date().toISOString(),
      byCourse: {},
    };
  }
}

export async function saveCourseDebugCapture(
  capture: CourseDebugCapture
): Promise<void> {
  try {
    const current = await loadSchoolworkDebugCaptures();
    const next: SchoolworkDebugStore = {
      updatedAt: new Date().toISOString(),
      byCourse: {
        ...current.byCourse,
        [capture.courseId]: {
          ...capture,
          rawText: String(capture.rawText || '').slice(0, 65000),
        },
      },
    };
    await writePrivateJsonStore(DEBUG_CAPTURES_BLOB_PATH, next, { pretty: false });
  } catch {
    // Non-fatal: never break schoolwork sync if debug snapshot write fails
  }
}

export interface SchoolworkAutomationConfig {
  slidesByCourse: Record<SchoolCourseId, string>; // Presentation IDs
  lastHashByCourse: Partial<Record<SchoolCourseId, string>>;
  lastRunAt?: string;
  lastSummary?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;
  connectedEmail?: string;
  geminiApiKey?: string;
  webhookSecret?: string;
}

const DEFAULT_CONFIG: SchoolworkAutomationConfig = {
  slidesByCourse: {
    eco: DEFAULT_ECO_SLIDE_ID,
    lit: '',
    precalc: '',
    physics: '',
  },
  lastHashByCourse: {},
};

export async function loadAutomationConfig(): Promise<SchoolworkAutomationConfig> {
  try {
    const res = await readPrivateJsonStore<Partial<SchoolworkAutomationConfig>>(
      AUTOMATION_CONFIG_BLOB_PATH
    );
    if (!res.data) {
      return structuredClone(DEFAULT_CONFIG);
    }
    const parsed = res.data;
    return {
      ...structuredClone(DEFAULT_CONFIG),
      ...parsed,
      slidesByCourse: {
        ...DEFAULT_CONFIG.slidesByCourse,
        ...(parsed.slidesByCourse ?? {}),
      },
      lastHashByCourse: {
        ...(parsed.lastHashByCourse ?? {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export async function saveAutomationConfig(
  cfg: SchoolworkAutomationConfig
): Promise<void> {
  await writePrivateJsonStore(AUTOMATION_CONFIG_BLOB_PATH, cfg, { pretty: true });
}

export function resolveCredentials(cfg: SchoolworkAutomationConfig) {
  return {
    geminiApiKey: (process.env.GEMINI_API_KEY || cfg.geminiApiKey || '').trim(),
    googleClientId: (process.env.GOOGLE_CLIENT_ID || cfg.googleClientId || '').trim(),
    googleClientSecret: (
      process.env.GOOGLE_CLIENT_SECRET ||
      cfg.googleClientSecret ||
      ''
    ).trim(),
    googleRefreshToken: (
      process.env.GOOGLE_REFRESH_TOKEN ||
      cfg.googleRefreshToken ||
      ''
    ).trim(),
    webhookSecret: (
      process.env.SCHOOLWORK_WEBHOOK_SECRET ||
      cfg.webhookSecret ||
      ''
    ).trim(),
  };
}

async function exchangeRefreshTokenForAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: 'refresh_token',
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await resp.json()) as { access_token?: string; error_description?: string };
  if (!resp.ok || !data.access_token) {
    throw new Error(
      `Google OAuth token refresh failed: ${data.error_description || resp.statusText}`
    );
  }
  return data.access_token;
}

interface SlidesTextElement {
  textRun?: { content?: string };
}

interface SlidesPageElement {
  shape?: { text?: { textElements?: SlidesTextElement[] } };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{ text?: { textElements?: SlidesTextElement[] } }>;
    }>;
  };
  elementGroup?: { children?: SlidesPageElement[] };
}

function collectTextFromPageElements(elements: SlidesPageElement[] | undefined): string {
  if (!Array.isArray(elements)) return '';
  const chunks: string[] = [];

  for (const el of elements) {
    if (el.shape?.text?.textElements) {
      const str = el.shape.text.textElements
        .map((te) => te.textRun?.content || '')
        .join('')
        .trim();
      if (str) chunks.push(str);
    }
    if (el.table?.tableRows) {
      const rows: string[] = [];
      for (const row of el.table.tableRows) {
        const cells = (row.tableCells || []).map((cell) =>
          (cell.text?.textElements || [])
            .map((te) => te.textRun?.content || '')
            .join('')
            .replace(/\s+/g, ' ')
            .trim()
        );
        if (cells.some(Boolean)) rows.push(cells.join(' | '));
      }
      if (rows.length > 0) chunks.push(rows.join('\n'));
    }
    if (el.elementGroup?.children) {
      const groupStr = collectTextFromPageElements(el.elementGroup.children);
      if (groupStr) chunks.push(groupStr);
    }
  }

  return chunks.join('\n');
}

export async function fetchGooglePresentationText(
  presentationId: string,
  accessToken: string
): Promise<{ title: string; rawText: string }> {
  const cleanId = presentationId
    .replace(/^.*\/presentation\/(?:u\/\d+\/)?d\//, '')
    .replace(/\/.*$/, '')
    .trim();

  const resp = await fetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(cleanId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Google Slides API ${resp.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    title?: string;
    slides?: Array<{
      pageElements?: SlidesPageElement[];
      slideProperties?: {
        notesPage?: { pageElements?: SlidesPageElement[] };
      };
    }>;
  };

  const slideSections: string[] = [];
  const slides = data.slides || [];

  for (let i = 0; i < slides.length; i++) {
    const bodyText = collectTextFromPageElements(slides[i].pageElements);
    const notesText = collectTextFromPageElements(
      slides[i].slideProperties?.notesPage?.pageElements
    );
    if (bodyText || notesText) {
      const parts = [`--- Slide ${i + 1} ---`];
      if (bodyText) parts.push(bodyText);
      if (notesText) parts.push(`[Speaker Notes]: ${notesText}`);
      slideSections.push(parts.join('\n'));
    }
  }

  return {
    title: data.title || 'School Google Slide',
    rawText: slideSections.join('\n\n'),
  };
}

function buildOhchsRotationPrompt(todayIso: string, daysAhead = 40): string {
  const lines: string[] = [];
  for (let offset = -16; offset <= daysAhead; offset++) {
    const d = addDays(todayIso, offset);
    const entry = OHCHS_BY_DATE.get(d);
    if (!entry) {
      lines.push(`${d}: WEEKEND`);
    } else if (entry.isNoSchool) {
      lines.push(`${d}: ${entry.rawLabel}`);
    } else {
      lines.push(`${d}: ${entry.rawLabel}`);
    }
  }
  return lines.join('\n');
}

export async function extractAssignmentsWithGeminiHydrogen(params: {
  courseId: SchoolCourseId;
  slideTitle: string;
  rawSlideText: string;
  sourceUrl?: string;
  todayIso: string;
  geminiApiKey: string;
}): Promise<{
  summary: string;
  assignments: StandardizedExtractedAssignment[];
  modelUsed: string;
}> {
  const { courseId, slideTitle, rawSlideText, sourceUrl, todayIso, geminiApiKey } = params;
  const course = SCHOOL_COURSES[courseId];
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const courseSpecificRules =
    courseId === 'precalc'
      ? `MATH (AP PRE-CALCULUS — MS. GROVER) RULES:
- Read EVERY Stream announcement AND EVERY ASSIGNMENT DETAIL PAGE description carefully!
- Every homework assignment tells you the exact part/problems/pages to do. Capture the EXACT problems, pages, or worksheet section in "startingStep" and "contextDetails".
- If ANY description or Stream post mentions an upcoming TEST, QUIZ, or EXAM (e.g. "test is tomorrow", "Unit test Thursday", "quiz next class"), you MUST extract a separate item with category = "test" (or "quiz"), dueTiming = "in-class", workLocation = "homework" (so a study block is scheduled beforehand!), and resolve "tomorrow" relative to the post date (or today ${todayIso} if posted today)!
- Set fallbackMinutes = 60 (1 hour).
- Default dueTiming = "before-class" and workLocation = "homework" unless explicitly done solely in class.`
      : courseId === 'lit'
      ? `LIT (AP LITERATURE — MR. LAUBY) RULES:
- Read EVERY Stream announcement AND EVERY ASSIGNMENT DETAIL PAGE description carefully!
- CRITICAL IN-CLASS RULE: Mr. Lauby explicitly specifies when an assignment/essay/activity is meant to be done IN CLASS (e.g. "in class", "timed write in class", "we will complete this during class", "do not work on outside class", "due at the end of class"). For those items (when NOT a test/quiz needing home study), set BOTH dueTiming = "in-class" AND workLocation = "in-class" so it attaches to the Lit class block instead of scheduling evening homework!
- If he does NOT specify in-class or 11:59 PM, treat it as homework due FOR THE LIT CLASS ON THE DUE DATE: set dueTiming = "before-class" AND workLocation = "homework".
- If ANY description or Stream post mentions a TEST, QUIZ, or EXAM (e.g. "test is tomorrow"), extract it with category = "test" (or "quiz"), dueTiming = "in-class", workLocation = "homework" so a 60m study block is scheduled beforehand!
- Set fallbackMinutes = 60 (1 hour).`
      : courseId === 'physics'
      ? `PHYSICS (PHYSICS HONORS — MR. OTTERSON) RULES:
- Physics Honors meets ONLY on GREEN days (Period 2).
- Read EVERY Stream announcement AND EVERY ASSIGNMENT DETAIL PAGE description carefully!
- If ANY post/description mentions a TEST, QUIZ, or EXAM (e.g. "test is tomorrow", "quiz Thursday"), extract it with category = "test" or "quiz", dueTiming = "in-class", workLocation = "homework", resolving "tomorrow" relative to the post date!
- Capture exact problem sets, labs, worksheets, or readings in "startingStep" and "contextDetails".
- Set fallbackMinutes = 60 (1 hour). Default dueTiming = "before-class", workLocation = "homework" (or "in-class" if strictly an in-class lab/activity with no outside homework).`
      : `ECO (AP ENVIRONMENTAL SCIENCE — MS. FOX) RULES:
- When textbook/audiobook Modules are assigned (e.g. "Modules 15 & 16", "Mod 20", "Modules 22-23"), set category = "module", workLocation = "homework", and populate "moduleNumbers" with EVERY integer module number assigned. Do NOT guess minutes for Eco modules — our Audiobook Sheet engine computes the exact length + 20% buffer!
- When a Lab or Lab Report is assigned, set category = "lab", workLocation = "homework", and set "assignedDate" (YYYY-MM-DD) to the exact class date introduced plus "dueDate".`;

  const prompt = `You are the automated Academic Extractor for Oxford Hills Comprehensive High School (OHCHS).
Target Course: ${course.fullName} (${course.shortName}) — Teacher: ${course.teacher}
Today's Date (America/New_York): ${todayIso}
${sourceUrl ? `Primary Source Page URL: ${sourceUrl}` : ''}

OHCHS 2026-2027 GREEN / GOLD ROTATION CALENDAR:
- AP Pre-Calculus (Pre-Calc / Math) meets ONLY on GREEN days (Period 1).
- Physics Honors (Physics) meets ONLY on GREEN days (Period 2).
- AP Environmental Science (Eco) meets ONLY on GOLD days (Period 5).
- AP Literature (Lit) meets ONLY on GOLD days (Period 7).
${buildOhchsRotationPrompt(todayIso, 42)}

COURSE-SPECIFIC RULES:
${courseSpecificRules}

STRICT EXTRACTION RULES:
1. Extract BOTH recent PAST assignments from the last 14 days (dueDate >= ${addDays(
    todayIso,
    -14
  )}) AND all current/upcoming assignments, tests, quizzes, labs, and in-class work! Ignore ancient units older than 14 days.
2. NEVER miss tests, quizzes, or deadlines written inside an assignment's DESCRIPTION or a Stream ANNOUNCEMENT! When a post says "tomorrow", "Thursday", or "next class", resolve the exact YYYY-MM-DD using the post's timestamp/date and the OHCHS calendar above (school year 2026-2027).
3. If an assignment on Google Classroom has NO explicit due date written, infer the next ${course.shortName} class meeting date on or after its posted date (only for real assignments/tests/in-class tasks from the last 14 days; skip generic reference links/syllabi).
4. Set "isCompleted" = true if the Classroom page explicitly shows "Turned in" or "Graded", OR if dueDate < ${todayIso}. Otherwise false.
5. Set "workLocation" = "in-class" ONLY when the work is done strictly during class (no outside homework needed, and NOT a test/quiz you must study for). Otherwise set "workLocation" = "homework".
6. Set "sourceUrl" to the exact === ASSIGNMENT DETAIL PAGE: https://... === URL for that specific assignment if present in the content; otherwise use "${sourceUrl || ''}".
7. Write a crisp actionable "startingStep" and include the teacher's key instructions/details verbatim in "contextDetails".

SOURCE: ${slideTitle}
CONTENT:
${rawSlideText.slice(0, 160000)}`;

  const modelsToTry: Array<{ model: string; timeoutMs: number }> = [
    { model: 'gemini-3.8-flash', timeoutMs: 18_000 },
    { model: 'gemini-flash-latest', timeoutMs: 15_000 },
    { model: 'gemini-3.7-flash', timeoutMs: 15_000 },
    { model: 'gemini-3.6-flash', timeoutMs: 15_000 },
    { model: 'gemini-3.5-flash', timeoutMs: 15_000 },
    { model: 'gemini-3.5-flash-lite', timeoutMs: 12_000 },
    { model: 'gemini-3.1-flash-lite', timeoutMs: 12_000 },
    { model: 'gemini-flash-lite-latest', timeoutMs: 12_000 },
    { model: 'gemini-4-hydrogen', timeoutMs: 15_000 },
    { model: 'gemini-4-argon', timeoutMs: 12_000 },
    { model: 'gemini-4-carbon', timeoutMs: 12_000 },
    { model: 'gemini-pro-latest', timeoutMs: 15_000 },
  ];

  let parsed: {
    summary?: string;
    assignments?: Array<Omit<StandardizedExtractedAssignment, 'courseId'>>;
  } | null = null;
  let modelUsed = '';
  const attemptErrors: string[] = [];

  for (const { model, timeoutMs } of modelsToTry) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(timeoutMs),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              assignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    slug: {
                      type: Type.STRING,
                      description: 'Deterministic kebab-case slug, e.g. modules-15-16-notes',
                    },
                    category: {
                      type: Type.STRING,
                      enum: ['module', 'homework', 'lab', 'test', 'quiz', 'project'],
                    },
                    title: { type: Type.STRING },
                    moduleNumbers: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                    },
                    assignedDate: {
                      type: Type.STRING,
                      description:
                        'YYYY-MM-DD when assigned/started (especially for labs), or empty string if unknown',
                    },
                    dueDate: { type: Type.STRING },
                    dueTiming: {
                      type: Type.STRING,
                      enum: ['before-class', 'in-class', 'end-of-day'],
                    },
                    workLocation: {
                      type: Type.STRING,
                      enum: ['homework', 'in-class'],
                    },
                    isCompleted: {
                      type: Type.BOOLEAN,
                    },
                    fallbackMinutes: { type: Type.INTEGER },
                    startingStep: { type: Type.STRING },
                    contextDetails: { type: Type.STRING },
                    sourceUrl: { type: Type.STRING },
                  },
                  required: [
                    'slug',
                    'category',
                    'title',
                    'moduleNumbers',
                    'dueDate',
                    'dueTiming',
                    'workLocation',
                    'isCompleted',
                    'fallbackMinutes',
                    'startingStep',
                    'contextDetails',
                  ],
                },
              },
            },
            required: ['summary', 'assignments'],
          },
        },
      });
      const text = resp.text?.trim();
      if (!text) {
        throw new Error(`Empty response from ${model}`);
      }
      parsed = JSON.parse(text) as {
        summary?: string;
        assignments?: Array<Omit<StandardizedExtractedAssignment, 'courseId'>>;
      };
      modelUsed = model;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const codeMatch = msg.match(/"code"\s*:\s*(\d{3})|\b(400|401|403|404|429|500|503|504)\b/);
      const shortErr = codeMatch
        ? codeMatch[1] || codeMatch[2]
        : /abort|timeout/i.test(msg)
          ? 'timeout'
          : msg.replace(/\s+/g, ' ').slice(0, 60);
      attemptErrors.push(`${model}(${shortErr})`);
      // Immediately fail on invalid API key; fall back to next model on high demand (503), rate limit (429), 404, timeout, etc.
      if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(msg)) {
        throw err;
      }
      continue;
    }
  }

  if (!parsed) {
    throw new Error(`Gemini attempts failed: ${attemptErrors.join(', ')}`);
  }

  const assignments: StandardizedExtractedAssignment[] = (parsed.assignments || [])
    .filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate || ''))
    .map((a) => ({
      slug: (a.slug || a.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 44),
      courseId,
      category: a.category || 'homework',
      title: a.title.trim(),
      moduleNumbers: Array.isArray(a.moduleNumbers) ? a.moduleNumbers : [],
      assignedDate:
        a.assignedDate && /^\d{4}-\d{2}-\d{2}$/.test(a.assignedDate)
          ? a.assignedDate
          : null,
      dueDate: a.dueDate,
      dueTiming: a.dueTiming || 'before-class',
      workLocation: a.workLocation === 'in-class' ? 'in-class' : 'homework',
      isCompleted: Boolean(a.isCompleted),
      fallbackMinutes: Number(a.fallbackMinutes) || 60,
      startingStep: a.startingStep?.trim() || `Start ${course.shortName} assignment`,
      contextDetails: a.contextDetails?.trim() || '',
      sourceUrl:
        (a.sourceUrl && /^https?:\/\//i.test(a.sourceUrl.trim())
          ? a.sourceUrl.trim()
          : sourceUrl?.trim()) || undefined,
    }));

  return {
    summary: parsed.summary || `Synced ${assignments.length} ${course.shortName} items.`,
    assignments,
    modelUsed,
  };
}

async function readWorkspaceBlob(): Promise<{
  payload: UniversalSyncPayload | null;
  etag: string | null;
}> {
  const res = await readPrivateJsonStore<UniversalSyncPayload>(WORKSPACE_BLOB_PATH);
  return { payload: res.data, etag: res.etag };
}

function hydrateFullBlocksFromPayload(
  payload: UniversalSyncPayload | null,
  todayIso: string
) {
  const baseOhchs = buildFullOhchsSchedule(todayIso);
  const delays = payload?.ohchsDelayedDates ?? {};
  const delayedDates = new Set(
    Object.entries(delays)
      .filter(([, r]) => r.mode !== 'regular')
      .map(([d]) => d)
  );

  const ohchsFiltered = baseOhchs.blocks.filter((b) => !delayedDates.has(b.date));
  for (const iso of delayedDates) {
    const entry = OHCHS_BY_DATE.get(iso);
    const rec = delays[iso];
    if (entry && rec) {
      ohchsFiltered.push(...buildOhchsBlocksForEntry(entry, todayIso, rec.mode));
    }
  }

  const customOhchs = new Map<string, (typeof ohchsFiltered)[number]>();
  const pureUser: typeof ohchsFiltered = [];
  for (const b of payload?.userBlocks ?? []) {
    if (b.id.startsWith('ohchs-')) customOhchs.set(b.id, b);
    else pureUser.push(b);
  }

  const mergedOhchs = ohchsFiltered.map((b) => customOhchs.get(b.id) ?? b);
  return [...mergedOhchs, ...pureUser];
}

export async function runAutomatedSchoolworkPipeline(options?: {
  manualCourseId?: SchoolCourseId;
  manualRawSlideText?: string;
  manualSlideTitle?: string;
  manualSourceUrl?: string;
  manualAudiobookCsv?: string;
  manualScrapeMeta?: CourseScrapeMeta;
  forceExtract?: boolean;
}): Promise<{
  ok: boolean;
  addedCount: number;
  updatedCount: number;
  rolloverChanged: boolean;
  summary: string;
  aiModelUsed?: string;
  extractedAssignments?: StandardizedExtractedAssignment[];
}> {
  const cfg = await loadAutomationConfig();
  const creds = resolveCredentials(cfg);
  const { todayIso, nowMinutesOfDay } = getEasternNow();

  const extractedAll: StandardizedExtractedAssignment[] = [];
  const summaries: string[] = [];
  let accessToken: string | undefined;
  let lastAiModelUsed: string | undefined;
  const pendingCaptures: Array<{
    courseId: SchoolCourseId;
    slideTitle: string;
    sourceUrl?: string;
    rawText: string;
    scrapeMeta?: CourseScrapeMeta;
    aiModelUsed: string;
    aiSummary: string;
    assignments: StandardizedExtractedAssignment[];
  }> = [];

  if (options?.manualRawSlideText && options.manualCourseId) {
    if (!creds.geminiApiKey) {
      throw new Error('Missing GEMINI_API_KEY in Vercel environment or automation config.');
    }
    const res = await extractAssignmentsWithGeminiHydrogen({
      courseId: options.manualCourseId,
      slideTitle: options.manualSlideTitle || 'Manual Test Slide',
      rawSlideText: options.manualRawSlideText,
      sourceUrl: options.manualSourceUrl,
      todayIso,
      geminiApiKey: creds.geminiApiKey,
    });
    extractedAll.push(...res.assignments);
    summaries.push(res.summary);
    lastAiModelUsed = res.modelUsed;
    pendingCaptures.push({
      courseId: options.manualCourseId,
      slideTitle: options.manualSlideTitle || 'Manual Test Slide',
      sourceUrl: options.manualSourceUrl,
      rawText: options.manualRawSlideText,
      scrapeMeta: options.manualScrapeMeta,
      aiModelUsed: res.modelUsed,
      aiSummary: res.summary,
      assignments: res.assignments,
    });
  } else if (
    creds.googleClientId &&
    creds.googleClientSecret &&
    creds.googleRefreshToken &&
    creds.geminiApiKey
  ) {
    accessToken = await exchangeRefreshTokenForAccessToken({
      clientId: creds.googleClientId,
      clientSecret: creds.googleClientSecret,
      refreshToken: creds.googleRefreshToken,
    });

    for (const courseId of ['eco', 'lit', 'precalc', 'physics'] as SchoolCourseId[]) {
      const presId = cfg.slidesByCourse[courseId]?.trim();
      if (!presId) continue;

      const deck = await fetchGooglePresentationText(presId, accessToken);
      const hash = createHash('sha256').update(deck.rawText).digest('hex').slice(0, 16);

      if (!options?.forceExtract && cfg.lastHashByCourse[courseId] === hash) {
        summaries.push(`${SCHOOL_COURSES[courseId].shortName}: No slide changes`);
        continue;
      }

      const res = await extractAssignmentsWithGeminiHydrogen({
        courseId,
        slideTitle: deck.title,
        rawSlideText: deck.rawText,
        todayIso,
        geminiApiKey: creds.geminiApiKey,
      });

      extractedAll.push(...res.assignments);
      cfg.lastHashByCourse[courseId] = hash;
      summaries.push(`${SCHOOL_COURSES[courseId].shortName}: ${res.summary}`);
      lastAiModelUsed = res.modelUsed;
      pendingCaptures.push({
        courseId,
        slideTitle: deck.title,
        rawText: deck.rawText,
        aiModelUsed: res.modelUsed,
        aiSummary: res.summary,
        assignments: res.assignments,
      });
    }
  }

  const audiobookTracks = options?.manualAudiobookCsv?.trim()
    ? parseAudiobookTracksFromCsv(options.manualAudiobookCsv)
    : await fetchLiveAudiobookTracks(accessToken);

  // Atomically read, reconcile/schedule, and write Vercel Blob workspace
  const commitOnce = async (
    useIfMatch: boolean
  ): Promise<{
    addedCount: number;
    updatedCount: number;
    rolloverChanged: boolean;
  }> => {
    const current = await readWorkspaceBlob();
    const basePayload: UniversalSyncPayload = current.payload ?? {
      schemaVersion: 1,
      updatedAtMs: Date.now(),
      metaUpdatedAtMs: Date.now(),
      siteConfig: {
        targetDomain: 'https://airbnb710.com',
        domainLabel: 'airbnb710.com',
        workspaceName: 'Intuition',
        accentTheme: 'cobalt',
        activeTemplate: 'personal-cbs-ohcr',
        hostingProvider: 'Vercel',
        pwaInstallEnabled: true,
      },
      whyStatements: {
        School: 'Master core technical foundations cleanly so long-term capability compounds.',
        Health: 'Protect daily strength, mobility, and sleep so energy never becomes the bottleneck.',
        Family: 'Be fully present at the table every evening with zero work bleed.',
        Organization: 'Keep personal and financial systems frictionless so profitable work runs calm.',
      },
      hourlyRateDollars: 85,
      projects: ['School'],
      ideas: [],
      userBlocks: [],
      ohchsDelayedDates: {},
      userReminders: [],
      checkups: [],
      pacedGoals: [],
      pacingLogs: [],
      offloadedTasks: [],
      reflections: [],
      draftDailyNote: '',
      draftReflectionPrompt:
        'How do you think this week went? Which baseline commitments felt effortless, and where did friction appear?',
      draftReflectionText: '',
      streak: {
        currentDays: 0,
        bestDays: 0,
        lastLockedDate: '',
        completedDates: [],
        protectionRuleNote:
          'Counts strictly Baseline Obligations + Daily Self-Reflection.',
      },
      tombstones: createEmptyTombstones(),
    };

    const fullBlocks = hydrateFullBlocksFromPayload(basePayload, todayIso);

    let nextBlocks = fullBlocks;
    let nextIdeas = basePayload.ideas ?? [];
    let nextProjects = basePayload.projects ?? [];
    let addedCount = 0;
    let updatedCount = 0;
    let rolloverChanged = false;
    let removedBlockIds: string[] = [];

    if (extractedAll.length > 0) {
      const applied = applyExtractedAssignmentsToSchedule({
        assignments: extractedAll,
        existingBlocks: fullBlocks,
        existingIdeas: nextIdeas,
        existingProjects: nextProjects,
        audiobookTracks,
        todayIso,
        nowMinutesOfDay,
        delaysByDate: basePayload.ohchsDelayedDates,
      });
      nextBlocks = applied.blocks;
      nextIdeas = applied.ideas;
      nextProjects = applied.projects;
      removedBlockIds = applied.removedBlockIds;
      addedCount = applied.addedCount;
      updatedCount = applied.updatedCount;
    } else {
      const reconciled = reconcileSchoolworkLifecycle({
        blocks: fullBlocks,
        todayIso,
        nowMinutesOfDay,
        delaysByDate: basePayload.ohchsDelayedDates,
      });
      nextBlocks = reconciled.blocks;
      rolloverChanged = reconciled.changed;
    }

    const nextUserBlocks = nextBlocks.filter(
      (b) => !b.id.startsWith('ohchs-') || isCustomizedOhchsBlock(b, todayIso)
    );

    const nextTombstones = structuredClone(
      basePayload.tombstones ?? createEmptyTombstones()
    );
    for (const blk of nextUserBlocks) {
      if (blk.id.startsWith('sch-hw-')) delete nextTombstones.blocks[blk.id];
    }
    const delNowMs = Date.now() + 1000;
    for (const remId of removedBlockIds) {
      nextTombstones.blocks[remId] = delNowMs;
    }
    for (const idea of nextIdeas) {
      if (idea.id.startsWith('sch-idea-')) delete nextTombstones.ideas[idea.id];
    }
    for (const proj of nextProjects) {
      delete nextTombstones.projects[proj];
    }

    const updatedPayload: UniversalSyncPayload = {
      ...basePayload,
      updatedAtMs: Date.now(),
      projects: nextProjects,
      ideas: nextIdeas,
      userBlocks: nextUserBlocks,
      tombstones: nextTombstones,
    };

    const merged = mergeUniversalPayload(current.payload, updatedPayload);

    await writePrivateJsonStore(WORKSPACE_BLOB_PATH, merged, {
      ifMatch: useIfMatch ? current.etag : null,
    });

    return { addedCount, updatedCount, rolloverChanged };
  };

  let writeRes: { addedCount: number; updatedCount: number; rolloverChanged: boolean };
  try {
    writeRes = await commitOnce(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      err instanceof BlobPreconditionFailedError ||
      /etag|precondition|412/i.test(msg)
    ) {
      // Re-read latest workspace, re-merge atomically, and save without ifMatch (same as api/sync.ts)
      writeRes = await commitOnce(false);
    } else {
      throw err;
    }
  }

  const finalSummary =
    summaries.join(' | ') ||
    (writeRes.rolloverChanged
      ? 'Rolled over unfinished past-window homework to next open slot.'
      : 'Checked schedule lifecycle & rollover windows.');

  cfg.lastRunAt = new Date().toISOString();
  cfg.lastSummary = finalSummary;
  await saveAutomationConfig(cfg);

  for (const cap of pendingCaptures) {
    await saveCourseDebugCapture({
      courseId: cap.courseId,
      capturedAt: cfg.lastRunAt,
      ok: true,
      slideTitle: cap.slideTitle,
      sourceUrl: cap.sourceUrl,
      rawCharCount: cap.rawText.length,
      rawText: cap.rawText,
      scrapeMeta: cap.scrapeMeta,
      aiModelUsed: cap.aiModelUsed,
      aiSummary: cap.aiSummary,
      extractedAssignments: cap.assignments,
      addedCount: writeRes.addedCount,
      updatedCount: writeRes.updatedCount,
    });
  }

  return {
    ok: true,
    ...writeRes,
    summary: finalSummary,
    aiModelUsed: lastAiModelUsed,
    extractedAssignments: extractedAll,
  };
}

/**
 * Cleanly wipes ONLY auto-synced schoolwork items (`sch-hw-*`, `sch-idea-*`, and auto-injected
 * In-Class / Homework sections on OHCHS class blocks) across all synced devices via tombstones,
 * while leaving 100% of personal events, alerts, classes, and notes untouched.
 */
export async function wipeSyncedSchoolworkData(): Promise<{
  ok: boolean;
  wipedBlocks: number;
  wipedIdeas: number;
  cleanedClasses: number;
  summary: string;
}> {
  const wipeOnce = async (useIfMatch: boolean) => {
    const current = await readWorkspaceBlob();
    if (!current.payload) {
      return { wipedBlocks: 0, wipedIdeas: 0, cleanedClasses: 0 };
    }

    const base = current.payload;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const nextTombstones = structuredClone(base.tombstones ?? createEmptyTombstones());

    let wipedBlocks = 0;
    let cleanedClasses = 0;
    const nextUserBlocks = [];

    for (const blk of base.userBlocks ?? []) {
      if (blk.id.startsWith('sch-hw-')) {
        nextTombstones.blocks[blk.id] = nowMs;
        wipedBlocks += 1;
        continue;
      }
      if (
        blk.id.startsWith('ohchs-') &&
        blk.notes &&
        (blk.notes.includes('--- Homework & Deadlines ---') ||
          blk.notes.includes('--- In-Class Work ---'))
      ) {
        const cleanedNotes = stripAllAutoSchoolworkSections(blk.notes);
        cleanedClasses += 1;
        nextUserBlocks.push({
          ...blk,
          notes: cleanedNotes,
          alertOffsetMinutes: undefined,
          updatedAt: nowIso,
        });
        continue;
      }
      nextUserBlocks.push(blk);
    }

    let wipedIdeas = 0;
    const nextIdeas = [];
    for (const idea of base.ideas ?? []) {
      if (idea.id.startsWith('sch-idea-')) {
        nextTombstones.ideas[idea.id] = nowMs;
        wipedIdeas += 1;
        continue;
      }
      nextIdeas.push(idea);
    }

    const updatedPayload: UniversalSyncPayload = {
      ...base,
      updatedAtMs: nowMs,
      userBlocks: nextUserBlocks,
      ideas: nextIdeas,
      tombstones: nextTombstones,
    };

    const merged = mergeUniversalPayload(current.payload, updatedPayload);
    await writePrivateJsonStore(WORKSPACE_BLOB_PATH, merged, {
      ifMatch: useIfMatch ? current.etag : null,
    });

    return { wipedBlocks, wipedIdeas, cleanedClasses };
  };

  let res: { wipedBlocks: number; wipedIdeas: number; cleanedClasses: number };
  try {
    res = await wipeOnce(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof BlobPreconditionFailedError || /etag|precondition|412/i.test(msg)) {
      res = await wipeOnce(false);
    } else {
      throw err;
    }
  }

  const cfg = await loadAutomationConfig();
  cfg.lastHashByCourse = {};
  cfg.lastRunAt = new Date().toISOString();
  const summary = `Wiped ${res.wipedBlocks} auto-synced homework block(s), ${res.wipedIdeas} schoolwork note(s), and cleaned ${res.cleanedClasses} class entry note(s).`;
  cfg.lastSummary = summary;
  await saveAutomationConfig(cfg);

  return {
    ok: true,
    ...res,
    summary,
  };
}
