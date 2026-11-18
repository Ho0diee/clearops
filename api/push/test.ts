import {
  buildPushCorsHeaders,
  enqueueDelayedTestPush,
  sendPushToAllDevices,
} from '../_lib/pushServer.js';

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: buildPushCorsHeaders(request) });
}

export async function POST(request: Request): Promise<Response> {
  const headers = buildPushCorsHeaders(request);
  try {
    const body = (await request.json().catch(() => ({}))) as {
      delaySeconds?: number;
    };
    const delaySeconds =
      typeof body.delaySeconds === 'number' && Number.isFinite(body.delaySeconds)
        ? Math.max(0, Math.min(60, Math.round(body.delaySeconds)))
        : 0;

    if (delaySeconds > 0) {
      const title = 'Intuition Lock-Screen Alert';
      const msgBody =
        'It works! Your scheduled alerts will now pop up even when Intuition is closed.';

      const queued = await enqueueDelayedTestPush(delaySeconds, title, msgBody);
      if (queued) {
        return Response.json(
          {
            ok: true,
            mode: 'queued',
            delaySeconds,
          },
          { status: 200, headers }
        );
      }

      // Direct fallback wait (up to 15s) if queue delivery isn't enabled in this environment
      const waitMs = Math.min(delaySeconds, 15) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      const result = await sendPushToAllDevices({
        title,
        body: msgBody,
        tag: `intuition-test-${Date.now()}`,
        url: '/',
      });
      return Response.json(
        {
          ok: result.sent > 0,
          mode: 'direct-delayed',
          ...result,
          error:
            result.totalDevices === 0
              ? 'No subscribed devices yet. Tap Enable Background Push Alerts first.'
              : undefined,
        },
        { status: result.totalDevices === 0 ? 400 : 200, headers }
      );
    }

    const result = await sendPushToAllDevices({
      title: 'Intuition Alert Test',
      body: 'Background phone notifications are connected and ready.',
      tag: `intuition-test-${Date.now()}`,
      url: '/',
    });

    if (result.totalDevices === 0) {
      return Response.json(
        {
          ok: false,
          error: 'No subscribed devices yet. Enable Background Push Alerts on your phone first.',
          ...result,
        },
        { status: 400, headers }
      );
    }

    return Response.json({ ok: result.sent > 0, mode: 'immediate', ...result }, { status: 200, headers });
  } catch (err) {
    console.error('[api/push/test] POST failed:', err);
    return Response.json(
      { ok: false, error: 'Failed to send test push notification' },
      { status: 500, headers }
    );
  }
}
