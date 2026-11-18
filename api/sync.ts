import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';
import {
  mergeUniversalPayload,
  type UniversalSyncPayload,
} from '../src/store/universalMerge.js';
import { enqueueUpcomingBlockAlerts } from './_lib/pushServer.js';

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowedOrigin =
    /^https:\/\/([a-z0-9-]+\.)?(airbnb710\.com|vercel\.app)$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
      ? origin
      : 'https://airbnb710.com';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Vary: 'Origin',
  };
}

function resolveBlobPathname(request: Request): string {
  try {
    const url = new URL(request.url);
    const ns = url.searchParams.get('ns');
    if (ns === 'e2e-test') {
      return 'intuition/e2e-test-workspace-v1.json';
    }
  } catch {
    /* ignore */
  }
  return 'intuition/universal-workspace-v1.json';
}

async function readCurrentWorkspace(
  pathname: string
): Promise<{ payload: UniversalSyncPayload | null; etag: string | null }> {
  try {
    const res = await get(pathname, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) {
      return { payload: null, etag: res?.blob?.etag ?? null };
    }
    const text = await new Response(res.stream).text();
    if (!text.trim()) {
      return { payload: null, etag: res.blob.etag };
    }
    const parsed = JSON.parse(text) as UniversalSyncPayload;
    return { payload: parsed, etag: res.blob.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError) {
      return { payload: null, etag: null };
    }
    console.error('[api/sync] readCurrentWorkspace failed:', err);
    throw err;
  }
}

async function handleUpsert(request: Request): Promise<Response> {
  const headers = buildCorsHeaders(request);
  const pathname = resolveBlobPathname(request);

  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return Response.json(
        { ok: false, error: 'Empty sync payload' },
        { status: 400, headers }
      );
    }

    const incoming = JSON.parse(rawBody) as UniversalSyncPayload;
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.ideas)) {
      return Response.json(
        { ok: false, error: 'Malformed sync payload' },
        { status: 400, headers }
      );
    }

    const current = await readCurrentWorkspace(pathname);
    const merged = mergeUniversalPayload(current.payload, incoming);

    try {
      const saved = await put(pathname, JSON.stringify(merged), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        ...(current.etag ? { ifMatch: current.etag } : {}),
      });

      if (pathname === 'intuition/universal-workspace-v1.json' && Array.isArray(merged.userBlocks)) {
        try {
          await enqueueUpcomingBlockAlerts(merged.userBlocks, 7);
        } catch {
          /* non-fatal */
        }
      }

      return Response.json(
        {
          ok: true,
          etag: saved.etag,
          serverTimeMs: Date.now(),
          payload: merged,
        },
        { status: 200, headers }
      );
    } catch (writeErr) {
      if (writeErr instanceof BlobPreconditionFailedError) {
        // Concurrent update from another device — re-read latest and merge atomically
        const latest = await readCurrentWorkspace(pathname);
        const remerged = mergeUniversalPayload(latest.payload, incoming);
        const saved = await put(pathname, JSON.stringify(remerged), {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
        });
        if (pathname === 'intuition/universal-workspace-v1.json' && Array.isArray(remerged.userBlocks)) {
          try {
            await enqueueUpcomingBlockAlerts(remerged.userBlocks, 7);
          } catch {
            /* non-fatal */
          }
        }
        return Response.json(
          {
            ok: true,
            etag: saved.etag,
            serverTimeMs: Date.now(),
            payload: remerged,
          },
          { status: 200, headers }
        );
      }
      throw writeErr;
    }
  } catch (err) {
    console.error('[api/sync] upsert failed:', err);
    return Response.json(
      { ok: false, error: 'Cloud sync write failed' },
      { status: 500, headers }
    );
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  const headers = buildCorsHeaders(request);
  const pathname = resolveBlobPathname(request);

  try {
    const current = await readCurrentWorkspace(pathname);
    return Response.json(
      {
        ok: true,
        etag: current.etag,
        serverTimeMs: Date.now(),
        payload: current.payload,
      },
      { status: 200, headers }
    );
  } catch (err) {
    console.error('[api/sync] GET failed:', err);
    return Response.json(
      { ok: false, error: 'Cloud sync read failed' },
      { status: 500, headers }
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  return handleUpsert(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleUpsert(request);
}
