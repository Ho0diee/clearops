import {
  BlobPreconditionFailedError,
  readPrivateJsonStore,
  writePrivateJsonStore,
} from '../src/schoolwork/kvStore.js';
import {
  computePayloadContentFingerprint,
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
    'Access-Control-Expose-Headers': 'ETag',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Vary: 'Origin',
  };
}

function formatHttpEtag(etag: string | null): string | null {
  if (!etag) return null;
  const trimmed = etag.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') || trimmed.startsWith('W/"')) return trimmed;
  return `"${trimmed}"`;
}

function computeAlertBlocksSignature(
  blocks: UniversalSyncPayload['userBlocks'] | undefined
): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  return blocks
    .filter((b) => !b.completed && typeof b.alertOffsetMinutes === 'number')
    .map((b) => `${b.id}|${b.date}|${b.startTime}|${b.endTime}|${b.alertOffsetMinutes}|${b.title}`)
    .sort()
    .join('\n');
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
  pathname: string,
  ifNoneMatch?: string | null
): Promise<{ payload: UniversalSyncPayload | null; etag: string | null; notModified?: boolean }> {
  try {
    const res = await readPrivateJsonStore<UniversalSyncPayload>(pathname, {
      ifNoneMatch: ifNoneMatch ?? null,
    });
    return { payload: res.data, etag: res.etag, notModified: res.notModified };
  } catch (err) {
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

    // Skip redundant cloud write & alert check if merged content is identical to stored workspace
    if (
      current.payload &&
      computePayloadContentFingerprint(current.payload) ===
        computePayloadContentFingerprint(merged)
    ) {
      const httpEtag = formatHttpEtag(current.etag);
      return Response.json(
        {
          ok: true,
          etag: current.etag,
          serverTimeMs: Date.now(),
          payload: current.payload,
        },
        {
          status: 200,
          headers: { ...headers, ...(httpEtag ? { ETag: httpEtag } : {}) },
        }
      );
    }

    const prevAlertsSig = computeAlertBlocksSignature(current.payload?.userBlocks);

    try {
      const saved = await writePrivateJsonStore(pathname, merged, {
        ifMatch: current.etag,
      });

      const nextAlertsSig = computeAlertBlocksSignature(merged.userBlocks);
      if (
        pathname === 'intuition/universal-workspace-v1.json' &&
        Array.isArray(merged.userBlocks) &&
        nextAlertsSig !== prevAlertsSig
      ) {
        try {
          await enqueueUpcomingBlockAlerts(merged.userBlocks, 7);
        } catch {
          /* non-fatal */
        }
      }

      const httpEtag = formatHttpEtag(saved.etag);
      return Response.json(
        {
          ok: true,
          etag: saved.etag,
          serverTimeMs: Date.now(),
          payload: merged,
        },
        {
          status: 200,
          headers: { ...headers, ...(httpEtag ? { ETag: httpEtag } : {}) },
        }
      );
    } catch (writeErr) {
      if (writeErr instanceof BlobPreconditionFailedError) {
        // Concurrent update from another device — re-read latest and merge atomically
        const latest = await readCurrentWorkspace(pathname);
        const remerged = mergeUniversalPayload(latest.payload, incoming);
        const saved = await writePrivateJsonStore(pathname, remerged);
        const latestAlertsSig = computeAlertBlocksSignature(latest.payload?.userBlocks);
        const remergedAlertsSig = computeAlertBlocksSignature(remerged.userBlocks);
        if (
          pathname === 'intuition/universal-workspace-v1.json' &&
          Array.isArray(remerged.userBlocks) &&
          remergedAlertsSig !== latestAlertsSig
        ) {
          try {
            await enqueueUpcomingBlockAlerts(remerged.userBlocks, 7);
          } catch {
            /* non-fatal */
          }
        }
        const httpEtag = formatHttpEtag(saved.etag);
        return Response.json(
          {
            ok: true,
            etag: saved.etag,
            serverTimeMs: Date.now(),
            payload: remerged,
          },
          {
            status: 200,
            headers: { ...headers, ...(httpEtag ? { ETag: httpEtag } : {}) },
          }
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
    const ifNoneMatch = request.headers.get('if-none-match');
    const current = await readCurrentWorkspace(pathname, ifNoneMatch);
    const httpEtag = formatHttpEtag(current.etag);
    const responseHeaders = {
      ...headers,
      ...(httpEtag ? { ETag: httpEtag } : {}),
    };

    if (current.notModified) {
      return new Response(null, { status: 304, headers: responseHeaders });
    }

    return Response.json(
      {
        ok: true,
        etag: current.etag,
        serverTimeMs: Date.now(),
        payload: current.payload,
      },
      { status: 200, headers: responseHeaders }
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
