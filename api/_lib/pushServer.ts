import { BlobNotFoundError, get, put } from '@vercel/blob';
import { send as sendQueueMessage } from '@vercel/queue';
import * as webpush from 'web-push';
import type { CalendarBlock } from '../../src/types/schema.js';
import type { UniversalSyncPayload } from '../../src/store/universalMerge.js';

const VAPID_BLOB_PATH = 'intuition/vapid-keys-v1.json';
const SUBS_BLOB_PATH = 'intuition/push-subscriptions-v1.json';
const SENT_LOG_BLOB_PATH = 'intuition/push-sent-log-v1.json';
const WORKSPACE_BLOB_PATH = 'intuition/universal-workspace-v1.json';
const PUSH_QUEUE_TOPIC = 'push-alerts';
const DEFAULT_TIMEZONE = 'America/New_York';

export interface VapidKeyStore {
  publicKey: string;
  privateKey: string;
  subject: string;
  createdAtMs: number;
}

export interface StoredPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceLabel?: string;
  timezone?: string;
  updatedAtMs: number;
}

export interface PushSubscriptionsStore {
  timezone: string;
  updatedAtMs: number;
  subscriptions: StoredPushSubscription[];
}

export interface PushSentLogStore {
  sent: Record<string, number>;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  tag: string;
  url?: string;
  blockId?: string;
  date?: string;
}

export interface PushQueueMessage {
  kind: 'block-alert' | 'test-delayed';
  blockId?: string;
  date?: string;
  startTime?: string;
  alertOffsetMinutes?: number;
  signature?: string;
  scheduledForMs?: number;
  testTitle?: string;
  testBody?: string;
}

export function buildPushCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowedOrigin =
    /^https:\/\/([a-z0-9-]+\.)?(airbnb710\.com|vercel\.app)$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
      ? origin
      : 'https://airbnb710.com';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Vary: 'Origin',
  };
}

async function readPrivateJson<T>(pathname: string): Promise<T | null> {
  try {
    const res = await get(pathname, { access: 'private', useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const text = await new Response(res.stream).text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

async function writePrivateJson<T>(pathname: string, data: T): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export async function getOrCreateVapidKeys(): Promise<VapidKeyStore> {
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  const envSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:alerts@airbnb710.com';

  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: envSubject,
      createdAtMs: 0,
    };
  }

  const existing = await readPrivateJson<VapidKeyStore>(VAPID_BLOB_PATH);
  if (existing?.publicKey && existing?.privateKey) {
    return existing;
  }

  const generated = webpush.generateVAPIDKeys();
  const created: VapidKeyStore = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: envSubject,
    createdAtMs: Date.now(),
  };
  await writePrivateJson(VAPID_BLOB_PATH, created);
  return created;
}

export async function readSubscriptionsStore(): Promise<PushSubscriptionsStore> {
  const existing = await readPrivateJson<PushSubscriptionsStore>(SUBS_BLOB_PATH);
  if (existing && Array.isArray(existing.subscriptions)) {
    return {
      timezone: existing.timezone || DEFAULT_TIMEZONE,
      updatedAtMs: existing.updatedAtMs || Date.now(),
      subscriptions: existing.subscriptions.filter(
        (s) => Boolean(s?.endpoint && s?.keys?.p256dh && s?.keys?.auth)
      ),
    };
  }
  return {
    timezone: DEFAULT_TIMEZONE,
    updatedAtMs: Date.now(),
    subscriptions: [],
  };
}

export async function upsertSubscription(
  sub: StoredPushSubscription
): Promise<PushSubscriptionsStore> {
  const store = await readSubscriptionsStore();
  const filtered = store.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
  filtered.push({
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    deviceLabel: sub.deviceLabel?.slice(0, 80) || 'Device',
    timezone: sub.timezone || store.timezone || DEFAULT_TIMEZONE,
    updatedAtMs: Date.now(),
  });

  const next: PushSubscriptionsStore = {
    timezone: sub.timezone || store.timezone || DEFAULT_TIMEZONE,
    updatedAtMs: Date.now(),
    subscriptions: filtered.slice(-15),
  };
  await writePrivateJson(SUBS_BLOB_PATH, next);
  return next;
}

export async function removeSubscription(endpoint: string): Promise<PushSubscriptionsStore> {
  const store = await readSubscriptionsStore();
  const next: PushSubscriptionsStore = {
    ...store,
    updatedAtMs: Date.now(),
    subscriptions: store.subscriptions.filter((s) => s.endpoint !== endpoint),
  };
  await writePrivateJson(SUBS_BLOB_PATH, next);
  return next;
}

export async function readSentLog(): Promise<PushSentLogStore> {
  const existing = await readPrivateJson<PushSentLogStore>(SENT_LOG_BLOB_PATH);
  if (existing && existing.sent && typeof existing.sent === 'object') {
    return existing;
  }
  return { sent: {} };
}

export async function markSignaturesSent(signatures: string[]): Promise<void> {
  if (signatures.length === 0) return;
  const log = await readSentLog();
  const now = Date.now();
  for (const sig of signatures) {
    log.sent[sig] = now;
  }
  // Keep only the 500 most recent entries so the blob stays tiny
  const entries = Object.entries(log.sent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500);
  await writePrivateJson(SENT_LOG_BLOB_PATH, {
    sent: Object.fromEntries(entries),
  });
}

function getZonedParts(
  utcMs: number,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const safeTz = timeZone || DEFAULT_TIMEZONE;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const lookup = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
  return {
    year: lookup('year'),
    month: lookup('month'),
    day: lookup('day'),
    hour: lookup('hour') % 24,
    minute: lookup('minute'),
    second: lookup('second'),
  };
}

/**
 * Converts a wall-clock local date + HH:MM in an IANA timezone (e.g. America/New_York)
 * into an exact UTC epoch timestamp in milliseconds, handling DST cleanly.
 */
export function zonedWallTimeToUtcMs(
  isoDate: string,
  hhmm: string,
  timeZone = DEFAULT_TIMEZONE
): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hhRaw, mmRaw] = hhmm.split(':').map(Number);
  const hh = hhRaw === 24 ? 23 : hhRaw || 0;
  const mm = hhRaw === 24 ? 59 : mmRaw || 0;
  const ss = hhRaw === 24 ? 59 : 0;

  const targetAsUtc = Date.UTC(y || 2026, (m || 1) - 1, d || 1, hh, mm, ss);
  let guess = targetAsUtc;

  for (let i = 0; i < 3; i++) {
    const zoned = getZonedParts(guess, timeZone);
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    const diff = targetAsUtc - zonedAsUtc;
    if (diff === 0) break;
    guess += diff;
  }

  return guess;
}

export function fmt12(hhmm: string): string {
  const [hRaw, m] = hhmm.split(':').map(Number);
  const h = (hRaw || 0) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

export function buildAlertSignature(block: CalendarBlock): string {
  return `${block.id}|${block.date}|${block.startTime}|${block.alertOffsetMinutes}`;
}

export function formatBlockNotificationPayload(
  block: CalendarBlock,
  nowMs: number,
  timeZone = DEFAULT_TIMEZONE
): PushNotificationPayload {
  const startMs = zonedWallTimeToUtcMs(block.date, block.startTime, timeZone);
  const minsUntil = Math.round((startMs - nowMs) / 60_000);
  const timingLabel =
    minsUntil <= 0
      ? 'Starting now'
      : minsUntil === 1
      ? 'Starts in 1 min'
      : `Starts in ${minsUntil} min`;

  const bodyParts = [
    `${timingLabel} · ${fmt12(block.startTime)}–${fmt12(block.endTime)}`,
    block.notes ? block.notes.trim().slice(0, 140) : '',
  ].filter(Boolean);

  return {
    title: block.title || 'Scheduled Event',
    body: bodyParts.join('\n'),
    tag: buildAlertSignature(block),
    url: `/?openBlock=${encodeURIComponent(block.id)}&date=${encodeURIComponent(block.date)}`,
    blockId: block.id,
    date: block.date,
  };
}

export async function sendPushToAllDevices(payload: PushNotificationPayload): Promise<{
  sent: number;
  failed: number;
  pruned: number;
  totalDevices: number;
}> {
  const store = await readSubscriptionsStore();
  if (store.subscriptions.length === 0) {
    return { sent: 0, failed: 0, pruned: 0, totalDevices: 0 };
  }

  const vapid = await getOrCreateVapidKeys();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const jsonBody = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const deadEndpoints = new Set<string>();

  await Promise.all(
    store.subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            expirationTime: sub.expirationTime ?? null,
            keys: sub.keys,
          },
          jsonBody,
          {
            TTL: 3600,
            urgency: 'high',
          }
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: unknown }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.add(sub.endpoint);
        } else {
          console.error('[pushServer] sendNotification error:', statusCode, err);
        }
      }
    })
  );

  if (deadEndpoints.size > 0) {
    const nextSubs = store.subscriptions.filter((s) => !deadEndpoints.has(s.endpoint));
    await writePrivateJson(SUBS_BLOB_PATH, {
      ...store,
      updatedAtMs: Date.now(),
      subscriptions: nextSubs,
    });
  }

  return {
    sent,
    failed,
    pruned: deadEndpoints.size,
    totalDevices: store.subscriptions.length,
  };
}

/**
 * Enqueues exact-second delayed Vercel Queue messages for every upcoming alerted block
 * within the next 7 days (Vercel Queue max retention/delay window).
 * Never throws so workspace syncs remain resilient even if Queues are unavailable locally.
 */
export async function enqueueUpcomingBlockAlerts(
  blocks: CalendarBlock[],
  maxHorizonDays = 7
): Promise<number> {
  const alertBlocks = blocks.filter(
    (b) => !b.completed && typeof b.alertOffsetMinutes === 'number' && b.date && b.startTime
  );
  if (alertBlocks.length === 0) return 0;

  let store: PushSubscriptionsStore;
  try {
    store = await readSubscriptionsStore();
  } catch {
    return 0;
  }
  if (store.subscriptions.length === 0) return 0;

  const timeZone = store.timezone || DEFAULT_TIMEZONE;
  const nowMs = Date.now();
  const maxFutureMs = nowMs + maxHorizonDays * 24 * 60 * 60 * 1000;
  const sentLog = await readSentLog();

  let enqueued = 0;

  for (const block of alertBlocks) {
    const sig = buildAlertSignature(block);
    if (sentLog.sent[sig]) continue;

    const eventStartMs = zonedWallTimeToUtcMs(block.date, block.startTime, timeZone);
    const triggerMs = eventStartMs - (block.alertOffsetMinutes || 0) * 60_000;

    // Only enqueue if within [-2 min, +maxHorizonDays]
    if (triggerMs < nowMs - 2 * 60_000 || triggerMs > maxFutureMs) continue;

    const delaySeconds = Math.max(0, Math.min(604_700, Math.round((triggerMs - nowMs) / 1000)));
    const retentionSeconds = Math.min(604_800, Math.max(3600, delaySeconds + 3600));
    const safeIdem = `alert-${sig.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 120);

    try {
      await sendQueueMessage(
        PUSH_QUEUE_TOPIC,
        {
          kind: 'block-alert',
          blockId: block.id,
          date: block.date,
          startTime: block.startTime,
          alertOffsetMinutes: block.alertOffsetMinutes,
          signature: sig,
          scheduledForMs: triggerMs,
        } satisfies PushQueueMessage,
        {
          delaySeconds,
          retentionSeconds,
          idempotencyKey: safeIdem,
        }
      );
      enqueued += 1;
    } catch (err) {
      console.warn('[pushServer] queue enqueue skipped:', err instanceof Error ? err.message : err);
      break;
    }
  }

  return enqueued;
}

export async function enqueueDelayedTestPush(
  delaySeconds: number,
  title: string,
  body: string
): Promise<boolean> {
  const safeDelay = Math.max(1, Math.min(300, Math.round(delaySeconds)));
  try {
    await sendQueueMessage(
      PUSH_QUEUE_TOPIC,
      {
        kind: 'test-delayed',
        testTitle: title,
        testBody: body,
        scheduledForMs: Date.now() + safeDelay * 1000,
      } satisfies PushQueueMessage,
      {
        delaySeconds: safeDelay,
        retentionSeconds: Math.max(3600, safeDelay + 600),
        idempotencyKey: `test-push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }
    );
    return true;
  } catch (err) {
    console.warn('[pushServer] delayed test queue fallback:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function dispatchQueuedAlert(message: PushQueueMessage): Promise<void> {
  if (!message || typeof message !== 'object') return;

  if (message.kind === 'test-delayed') {
    await sendPushToAllDevices({
      title: message.testTitle || 'Intuition Background Alert Test',
      body:
        message.testBody ||
        'Success! Background push alerts are live even when Intuition is closed.',
      tag: `intuition-test-${Date.now()}`,
      url: '/',
    });
    return;
  }

  if (message.kind !== 'block-alert' || !message.blockId) return;

  const workspace = await readPrivateJson<UniversalSyncPayload>(WORKSPACE_BLOB_PATH);
  if (!workspace || !Array.isArray(workspace.userBlocks)) return;

  const liveBlock = workspace.userBlocks.find((b) => b.id === message.blockId);
  if (!liveBlock || liveBlock.completed || typeof liveBlock.alertOffsetMinutes !== 'number') {
    // Event was deleted, completed, or its alert was turned off — do not ring!
    return;
  }

  const liveSig = buildAlertSignature(liveBlock);
  if (message.signature && liveSig !== message.signature) {
    // Event time or alert offset changed since enqueueing; a newer queue message covers it
    return;
  }

  const sentLog = await readSentLog();
  if (sentLog.sent[liveSig]) return;

  const store = await readSubscriptionsStore();
  if (store.subscriptions.length === 0) return;

  const timeZone = store.timezone || DEFAULT_TIMEZONE;
  const nowMs = Date.now();
  const eventEndMs = Math.max(
    zonedWallTimeToUtcMs(liveBlock.date, liveBlock.startTime, timeZone) + 15 * 60_000,
    zonedWallTimeToUtcMs(liveBlock.date, liveBlock.endTime, timeZone)
  );
  if (nowMs > eventEndMs + 30 * 60_000) {
    // Stale outage replay well past event end — skip
    return;
  }

  const payload = formatBlockNotificationPayload(liveBlock, nowMs, timeZone);
  const result = await sendPushToAllDevices(payload);
  if (result.sent > 0) {
    await markSignaturesSent([liveSig]);
  }
}

/**
 * Safety-net periodic sweep (runs every 15 min via Vercel Schedules):
 * 1. Sends any due alerts that weren't delivered via Queue yet.
 * 2. Enqueues upcoming alerts within the next 48 hours into Vercel Queues for exact-second delivery.
 */
export async function runPushAlertSweep(): Promise<{
  dispatched: number;
  enqueued: number;
  devices: number;
}> {
  const store = await readSubscriptionsStore();
  if (store.subscriptions.length === 0) {
    return { dispatched: 0, enqueued: 0, devices: 0 };
  }

  const workspace = await readPrivateJson<UniversalSyncPayload>(WORKSPACE_BLOB_PATH);
  if (!workspace || !Array.isArray(workspace.userBlocks)) {
    return { dispatched: 0, enqueued: 0, devices: store.subscriptions.length };
  }

  const timeZone = store.timezone || DEFAULT_TIMEZONE;
  const nowMs = Date.now();
  const sentLog = await readSentLog();
  const newlySentSignatures: string[] = [];

  for (const block of workspace.userBlocks) {
    if (block.completed || typeof block.alertOffsetMinutes !== 'number') continue;
    const sig = buildAlertSignature(block);
    if (sentLog.sent[sig]) continue;

    const eventStartMs = zonedWallTimeToUtcMs(block.date, block.startTime, timeZone);
    const eventEndMs = Math.max(
      eventStartMs + 10 * 60_000,
      zonedWallTimeToUtcMs(block.date, block.endTime, timeZone)
    );
    const triggerMs = eventStartMs - block.alertOffsetMinutes * 60_000;

    // Due now (or within the last 16 min sweep window, and before event ends)
    const latestValid = Math.max(eventEndMs, triggerMs + 16 * 60_000);
    if (nowMs >= triggerMs - 30_000 && nowMs <= latestValid) {
      const payload = formatBlockNotificationPayload(block, nowMs, timeZone);
      const res = await sendPushToAllDevices(payload);
      if (res.sent > 0) {
        newlySentSignatures.push(sig);
      }
    }
  }

  if (newlySentSignatures.length > 0) {
    await markSignaturesSent(newlySentSignatures);
  }

  const enqueued = await enqueueUpcomingBlockAlerts(workspace.userBlocks, 2);

  return {
    dispatched: newlySentSignatures.length,
    enqueued,
    devices: store.subscriptions.length,
  };
}
