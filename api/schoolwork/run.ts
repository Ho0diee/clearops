import {
  loadAutomationConfig,
  loadSchoolworkDebugCaptures,
  reprocessCachedSchoolworkCaptures,
  resolveCredentials,
  runAutomatedSchoolworkPipeline,
  saveAutomationConfig,
  saveCourseDebugCapture,
  wipeSyncedSchoolworkData,
  type CourseScrapeMeta,
} from '../../src/schoolwork/cloudSyncRunner.js';
import { getActiveStorageBackend } from '../../src/schoolwork/kvStore.js';
import type { SchoolCourseId } from '../../src/schoolwork/standardizedEngine.js';

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
    'Cache-Control': 'no-store',
  };
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  const headers = corsHeaders(request);
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('debug') === '1') {
      const captures = await loadSchoolworkDebugCaptures();
      return Response.json(
        {
          ok: true,
          storageBackend: getActiveStorageBackend(),
          updatedAt: captures.updatedAt,
          byCourse: captures.byCourse,
        },
        { status: 200, headers }
      );
    }

    const cfg = await loadAutomationConfig();
    const creds = resolveCredentials(cfg);
    return Response.json(
      {
        ok: true,
        storageBackend: getActiveStorageBackend(),
        hasGeminiKey: Boolean(creds.geminiApiKey),
        hasGoogleClientCreds: Boolean(creds.googleClientId && creds.googleClientSecret),
        hasGoogleRefreshToken: Boolean(creds.googleRefreshToken),
        connectedEmail: cfg.connectedEmail || null,
        slidesByCourse: cfg.slidesByCourse,
        lastRunAt: cfg.lastRunAt || null,
        lastSummary: cfg.lastSummary || null,
      },
      { status: 200, headers }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Status check failed' },
      { status: 500, headers }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const headers = corsHeaders(request);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = (body.action as string) || 'sync-now';

    const cfg = await loadAutomationConfig();
    const creds = resolveCredentials(cfg);

    // Check optional webhook secret when invoked from an external cloud trigger
    if (action === 'webhook-ingest' && creds.webhookSecret) {
      const provided =
        request.headers.get('x-webhook-secret') || (body.secret as string) || '';
      if (provided !== creds.webhookSecret) {
        return Response.json(
          { ok: false, error: 'Unauthorized webhook secret' },
          { status: 401, headers }
        );
      }
    }

    if (action === 'save-config') {
      if (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim()) {
        cfg.geminiApiKey = body.geminiApiKey.trim();
      }
      if (typeof body.googleClientId === 'string' && body.googleClientId.trim()) {
        cfg.googleClientId = body.googleClientId.trim();
      }
      if (typeof body.googleClientSecret === 'string' && body.googleClientSecret.trim()) {
        cfg.googleClientSecret = body.googleClientSecret.trim();
      }
      if (typeof body.webhookSecret === 'string') {
        cfg.webhookSecret = body.webhookSecret.trim();
      }
      if (body.slidesByCourse && typeof body.slidesByCourse === 'object') {
        const sbc = body.slidesByCourse as Partial<Record<SchoolCourseId, string>>;
        for (const k of ['eco', 'lit', 'precalc', 'physics'] as SchoolCourseId[]) {
          if (typeof sbc[k] === 'string') {
            cfg.slidesByCourse[k] = sbc[k]!.trim();
          }
        }
      }
      await saveAutomationConfig(cfg);
      return Response.json({ ok: true, message: 'Saved automation settings' }, { status: 200, headers });
    }

    if (action === 'wipe-schoolwork') {
      const res = await wipeSyncedSchoolworkData();
      return Response.json(res, { status: 200, headers });
    }

    if (action === 'reprocess-cached') {
      const res = await reprocessCachedSchoolworkCaptures({
        reextractWithAi: Boolean(body.reextractWithAi),
      });
      return Response.json(res, { status: res.ok ? 200 : 400, headers });
    }

    if (action === 'log-scrape-failure') {
      const courseId = ((body.courseId as SchoolCourseId) || 'eco') as SchoolCourseId;
      const slideTitle = String(body.slideTitle || 'Scrape Diagnostic');
      const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : undefined;
      const rawText = String(body.rawSlideText || '');
      const errorText = String(body.error || 'Scrape failed');
      const scrapeMeta =
        body.scrapeMeta && typeof body.scrapeMeta === 'object'
          ? (body.scrapeMeta as CourseScrapeMeta)
          : { error: errorText };
      await saveCourseDebugCapture({
        courseId,
        capturedAt: new Date().toISOString(),
        ok: false,
        slideTitle,
        sourceUrl,
        rawCharCount: rawText.length,
        rawText,
        scrapeMeta: { ...scrapeMeta, error: errorText },
        aiSummary: errorText,
        extractedAssignments: [],
        addedCount: 0,
        updatedCount: 0,
      });
      return Response.json({ ok: true, logged: true }, { status: 200, headers });
    }

    if (action === 'webhook-ingest' || action === 'test-raw-slide') {
      const courseId = ((body.courseId as SchoolCourseId) || 'eco') as SchoolCourseId;
      const rawSlideText = String(body.rawSlideText || '');
      const slideTitle = String(body.slideTitle || 'School Slide');
      const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : undefined;
      const scrapeMeta =
        body.scrapeMeta && typeof body.scrapeMeta === 'object'
          ? (body.scrapeMeta as CourseScrapeMeta)
          : undefined;
      if (!rawSlideText.trim()) {
        return Response.json(
          { ok: false, error: 'rawSlideText is required' },
          { status: 400, headers }
        );
      }
      const res = await runAutomatedSchoolworkPipeline({
        manualCourseId: courseId,
        manualRawSlideText: rawSlideText,
        manualSlideTitle: slideTitle,
        manualSourceUrl: sourceUrl,
        manualAudiobookCsv:
          typeof body.audiobookSheetCsv === 'string' ? body.audiobookSheetCsv : undefined,
        manualScrapeMeta: scrapeMeta,
        forceExtract: true,
      });
      return Response.json(res, { status: 200, headers });
    }

    // Default: 'sync-now'
    const res = await runAutomatedSchoolworkPipeline({
      forceExtract: Boolean(body.forceExtract),
    });
    return Response.json(res, { status: 200, headers });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Automation run failed' },
      { status: 500, headers }
    );
  }
}
