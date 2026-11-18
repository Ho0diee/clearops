import { createHash } from 'node:crypto';
import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { GoogleGenAI, Type } from '@google/genai';
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
  type SchoolCourseId,
  type StandardizedExtractedAssignment,
} from './standardizedEngine.js';

export const WORKSPACE_BLOB_PATH = 'intuition/universal-workspace-v1.json';
export const AUTOMATION_CONFIG_BLOB_PATH = 'intuition/schoolwork-automation-v1.json';

export const DEFAULT_ECO_SLIDE_ID = '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI';

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
  },
  lastHashByCourse: {},
};

export async function loadAutomationConfig(): Promise<SchoolworkAutomationConfig> {
  try {
    const res = await get(AUTOMATION_CONFIG_BLOB_PATH, {
      access: 'private',
      useCache: false,
    });
    if (!res || res.statusCode !== 200 || !res.stream) {
      return structuredClone(DEFAULT_CONFIG);
    }
    const text = await new Response(res.stream).text();
    if (!text.trim()) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(text) as Partial<SchoolworkAutomationConfig>;
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
  } catch (err) {
    if (err instanceof BlobNotFoundError) {
      return structuredClone(DEFAULT_CONFIG);
    }
    return structuredClone(DEFAULT_CONFIG);
  }
}

export async function saveAutomationConfig(
  cfg: SchoolworkAutomationConfig
): Promise<void> {
  await put(AUTOMATION_CONFIG_BLOB_PATH, JSON.stringify(cfg, null, 2), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
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
  for (let offset = -5; offset <= daysAhead; offset++) {
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
  todayIso: string;
  geminiApiKey: string;
}): Promise<{ summary: string; assignments: StandardizedExtractedAssignment[] }> {
  const { courseId, slideTitle, rawSlideText, todayIso, geminiApiKey } = params;
  const course = SCHOOL_COURSES[courseId];
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const prompt = `You are the automated Academic Extractor for Oxford Hills Comprehensive High School (OHCHS).
Target Course: ${course.fullName} (${course.shortName}) — Teacher: ${course.teacher}
Today's Date (America/New_York): ${todayIso}

OHCHS 2026-2027 GREEN / GOLD ROTATION CALENDAR:
- AP Environmental Science (Eco) meets ONLY on GOLD days (Period 5).
- AP Literature (Lit) meets ONLY on GOLD days (Period 7).
- AP Pre-Calculus (Pre-Calc) meets ONLY on GREEN days (Period 1).
${buildOhchsRotationPrompt(todayIso, 42)}

STRICT EXTRACTION RULES:
1. Extract ONLY current or upcoming assignments, modules, labs, quizzes, projects, or exams whose dueDate is >= ${addDays(
    todayIso,
    -1
  )}. Ignore old completed units from weeks ago.
2. When textbook/audiobook Modules are assigned (e.g. "Modules 15 & 16", "Mod 20", "Modules 22-23"):
   - Set category = "module"
   - Populate "moduleNumbers" with EVERY integer module number assigned (e.g. [15, 16] or [22, 23]). Do NOT guess minutes for Eco modules — our Audiobook Sheet engine computes the exact length + 20% buffer from "moduleNumbers"!
3. When a Lab or Lab Report is assigned:
   - Set category = "lab"
   - Set "assignedDate" (YYYY-MM-DD) to the exact class date the lab was introduced/assigned on the slide, and "dueDate" (YYYY-MM-DD) to when the lab is due!
4. Resolve shorthand dates ("Fri 11/20", "next Gold day", "Tuesday after break") into exact YYYY-MM-DD dates using the OHCHS calendar above.
5. Set "dueTiming" to "before-class" (checked at start of class), "in-class" (quiz/test/in-class activity), or "end-of-day" (explicitly 11:59 PM).
6. Write a crisp 15-minute "startingStep" and put helpful details (Google Classroom check, guided notes packet, rubric notes) into "contextDetails".

SLIDE DECK: ${slideTitle}
CONTENT:
${rawSlideText.slice(0, 160000)}`;

  const modelsToTry = [
    'gemini-4-hydrogen',
    'gemini-4-argon',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
  ];

  let responseText = '{}';
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
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
                    assignedDate: { type: Type.STRING, nullable: true },
                    dueDate: { type: Type.STRING },
                    dueTiming: {
                      type: Type.STRING,
                      enum: ['before-class', 'in-class', 'end-of-day'],
                    },
                    fallbackMinutes: { type: Type.INTEGER },
                    startingStep: { type: Type.STRING },
                    contextDetails: { type: Type.STRING },
                  },
                  required: [
                    'slug',
                    'category',
                    'title',
                    'moduleNumbers',
                    'dueDate',
                    'dueTiming',
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
      responseText = resp.text || '{}';
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/404|NOT_FOUND|no longer available/i.test(msg)) continue;
      throw err;
    }
  }

  if (!responseText || responseText === '{}') {
    if (lastError) throw lastError;
  }

  const parsed = JSON.parse(responseText) as {
    summary?: string;
    assignments?: Array<Omit<StandardizedExtractedAssignment, 'courseId'>>;
  };

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
      fallbackMinutes: Number(a.fallbackMinutes) || 45,
      startingStep: a.startingStep?.trim() || `Start ${course.shortName} assignment`,
      contextDetails: a.contextDetails?.trim() || '',
    }));

  return {
    summary: parsed.summary || `Synced ${assignments.length} ${course.shortName} items.`,
    assignments,
  };
}

async function readWorkspaceBlob(): Promise<{
  payload: UniversalSyncPayload | null;
  etag: string | null;
}> {
  try {
    const res = await get(WORKSPACE_BLOB_PATH, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) {
      return { payload: null, etag: res?.blob?.etag ?? null };
    }
    const text = await new Response(res.stream).text();
    if (!text.trim()) return { payload: null, etag: res.blob.etag };
    return { payload: JSON.parse(text) as UniversalSyncPayload, etag: res.blob.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { payload: null, etag: null };
    throw err;
  }
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
  manualAudiobookCsv?: string;
  forceExtract?: boolean;
}): Promise<{
  ok: boolean;
  addedCount: number;
  updatedCount: number;
  rolloverChanged: boolean;
  summary: string;
}> {
  const cfg = await loadAutomationConfig();
  const creds = resolveCredentials(cfg);
  const { todayIso, nowMinutesOfDay } = getEasternNow();

  const extractedAll: StandardizedExtractedAssignment[] = [];
  const summaries: string[] = [];
  let accessToken: string | undefined;

  if (options?.manualRawSlideText && options.manualCourseId) {
    if (!creds.geminiApiKey) {
      throw new Error('Missing GEMINI_API_KEY in Vercel environment or automation config.');
    }
    const res = await extractAssignmentsWithGeminiHydrogen({
      courseId: options.manualCourseId,
      slideTitle: options.manualSlideTitle || 'Manual Test Slide',
      rawSlideText: options.manualRawSlideText,
      todayIso,
      geminiApiKey: creds.geminiApiKey,
    });
    extractedAll.push(...res.assignments);
    summaries.push(res.summary);
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

    for (const courseId of ['eco', 'lit', 'precalc'] as SchoolCourseId[]) {
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
    }
  }

  const audiobookTracks = options?.manualAudiobookCsv?.trim()
    ? parseAudiobookTracksFromCsv(options.manualAudiobookCsv)
    : await fetchLiveAudiobookTracks(accessToken);

  // Atomically read, reconcile/schedule, and write Vercel Blob workspace
  const commitOnce = async (): Promise<{
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

    await put(WORKSPACE_BLOB_PATH, JSON.stringify(merged), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      ...(current.etag ? { ifMatch: current.etag } : {}),
    });

    return { addedCount, updatedCount, rolloverChanged };
  };

  let writeRes: { addedCount: number; updatedCount: number; rolloverChanged: boolean };
  try {
    writeRes = await commitOnce();
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) {
      writeRes = await commitOnce();
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

  return {
    ok: true,
    ...writeRes,
    summary: finalSummary,
  };
}
