import { readPrivateJsonStore } from '../../src/schoolwork/kvStore.js';
import type { UniversalSyncPayload } from '../../src/store/universalMerge.js';
import {
  buildPushCorsHeaders,
  enqueueUpcomingBlockAlerts,
  getOrCreateVapidKeys,
  readSubscriptionsStore,
  removeSubscription,
  upsertSubscription,
  type StoredPushSubscription,
} from '../_lib/pushServer.js';

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: buildPushCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  const headers = buildPushCorsHeaders(request);
  try {
    const [vapid, store] = await Promise.all([
      getOrCreateVapidKeys(),
      readSubscriptionsStore(),
    ]);

    let endpointParam = '';
    try {
      const url = new URL(request.url);
      endpointParam = url.searchParams.get('endpoint') || '';
    } catch {
      /* ignore */
    }

    const hasEndpoint = endpointParam
      ? store.subscriptions.some((s) => s.endpoint === endpointParam)
      : false;

    return Response.json(
      {
        ok: true,
        publicKey: vapid.publicKey,
        deviceCount: store.subscriptions.length,
        timezone: store.timezone,
        hasEndpoint,
      },
      { status: 200, headers }
    );
  } catch (err) {
    console.error('[api/push/subscribe] GET failed:', err);
    return Response.json(
      { ok: false, error: 'Failed to load push configuration' },
      { status: 500, headers }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const headers = buildPushCorsHeaders(request);
  try {
    const body = (await request.json()) as {
      subscription?: {
        endpoint?: string;
        expirationTime?: number | null;
        keys?: { p256dh?: string; auth?: string };
      };
      timezone?: string;
      deviceLabel?: string;
    };

    const sub = body?.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return Response.json(
        { ok: false, error: 'Missing valid push subscription payload' },
        { status: 400, headers }
      );
    }

    const stored: StoredPushSubscription = {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime ?? null,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      deviceLabel: body.deviceLabel || 'Device',
      timezone: body.timezone || 'America/New_York',
      updatedAtMs: Date.now(),
    };

    const nextStore = await upsertSubscription(stored);

    // Immediately enqueue upcoming alerts from the synced workspace for this newly active phone
    let enqueued = 0;
    try {
      const res = await readPrivateJsonStore<UniversalSyncPayload>(
        'intuition/universal-workspace-v1.json'
      );
      if (res.data && Array.isArray(res.data.userBlocks)) {
        enqueued = await enqueueUpcomingBlockAlerts(res.data.userBlocks, 7);
      }
    } catch (err) {
      console.warn('[api/push/subscribe] initial alert enqueue skipped:', err);
    }

    return Response.json(
      {
        ok: true,
        deviceCount: nextStore.subscriptions.length,
        timezone: nextStore.timezone,
        enqueuedAlerts: enqueued,
      },
      { status: 200, headers }
    );
  } catch (err) {
    console.error('[api/push/subscribe] POST failed:', err);
    return Response.json(
      { ok: false, error: 'Failed to save push subscription' },
      { status: 500, headers }
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const headers = buildPushCorsHeaders(request);
  try {
    const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
    if (!body.endpoint) {
      return Response.json(
        { ok: false, error: 'Missing endpoint to remove' },
        { status: 400, headers }
      );
    }

    const nextStore = await removeSubscription(body.endpoint);
    return Response.json(
      {
        ok: true,
        deviceCount: nextStore.subscriptions.length,
      },
      { status: 200, headers }
    );
  } catch (err) {
    console.error('[api/push/subscribe] DELETE failed:', err);
    return Response.json(
      { ok: false, error: 'Failed to remove push subscription' },
      { status: 500, headers }
    );
  }
}
