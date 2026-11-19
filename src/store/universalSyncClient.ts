import type { CalendarBlock, OpsState, ReminderItem } from '../types/schema';
import {
  buildFullOhchsSchedule,
  buildOhchsBlocksForEntry,
  buildOhchsPinForEntry,
  OHCHS_BY_DATE,
} from './ohchsSchedule';
import {
  createEmptyTombstones,
  mergeUniversalPayload,
  shouldIncludeOhchsBlockInSync,
  shouldIncludeOhchsReminderInSync,
  type SchoolDelayRecord,
  type SyncTombstones,
  type UniversalSyncPayload,
} from './universalMerge';

export const TOMBSTONES_STORAGE_KEY = 'clearops_sync_tombstones_v1';
export const PRESYNC_BACKUP_STORAGE_KEY = 'clearops_presync_phone_backup_v1';

export interface PersistedSyncMeta {
  etag: string | null;
  syncedFingerprint: string | null;
}

function getSyncMetaStorageKey(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('syncNs') === 'e2e-test') {
      return 'clearops_sync_meta_e2e_v1';
    }
  } catch {
    /* ignore */
  }
  return 'clearops_sync_meta_v1';
}

export function loadPersistedSyncMeta(): PersistedSyncMeta {
  try {
    const raw = window.localStorage.getItem(getSyncMetaStorageKey());
    if (!raw) return { etag: null, syncedFingerprint: null };
    const parsed = JSON.parse(raw) as Partial<PersistedSyncMeta>;
    return {
      etag: typeof parsed.etag === 'string' && parsed.etag.trim() ? parsed.etag : null,
      syncedFingerprint:
        typeof parsed.syncedFingerprint === 'string' && parsed.syncedFingerprint.trim()
          ? parsed.syncedFingerprint
          : null,
    };
  } catch {
    return { etag: null, syncedFingerprint: null };
  }
}

export function savePersistedSyncMeta(meta: PersistedSyncMeta): void {
  try {
    window.localStorage.setItem(getSyncMetaStorageKey(), JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function loadLocalTombstones(): SyncTombstones {
  try {
    const raw = window.localStorage.getItem(TOMBSTONES_STORAGE_KEY);
    if (!raw) return createEmptyTombstones();
    const parsed = JSON.parse(raw) as Partial<SyncTombstones>;
    return {
      ideas: parsed.ideas ?? {},
      projects: parsed.projects ?? {},
      blocks: parsed.blocks ?? {},
      reminders: parsed.reminders ?? {},
      pacedGoals: parsed.pacedGoals ?? {},
      offloadedTasks: parsed.offloadedTasks ?? {},
      checkups: parsed.checkups ?? {},
    };
  } catch {
    return createEmptyTombstones();
  }
}

export function saveLocalTombstones(tombstones: SyncTombstones): void {
  try {
    window.localStorage.setItem(TOMBSTONES_STORAGE_KEY, JSON.stringify(tombstones));
  } catch {
    /* ignore */
  }
}

export function ensurePreSyncBackupSaved(storageKey: string): void {
  try {
    if (window.localStorage.getItem(PRESYNC_BACKUP_STORAGE_KEY)) return;
    const currentRaw = window.localStorage.getItem(storageKey);
    if (currentRaw) {
      window.localStorage.setItem(PRESYNC_BACKUP_STORAGE_KEY, currentRaw);
    }
  } catch {
    /* ignore */
  }
}

export function deriveOhchsDelaysFromReminders(
  reminders: ReminderItem[],
  explicitDelays: Record<string, SchoolDelayRecord>
): Record<string, SchoolDelayRecord> {
  const out: Record<string, SchoolDelayRecord> = { ...explicitDelays };
  for (const r of reminders) {
    if (!r.id.startsWith('ohchs-rot-')) continue;
    const mode = r.title.includes('(2hr Delay)')
      ? 'late-2hr'
      : r.title.includes('(90m Delay)')
      ? 'late-90'
      : null;
    if (mode && !out[r.date]) {
      out[r.date] = {
        mode,
        updatedAtMs: r.updatedAt ? Date.parse(r.updatedAt) || 1 : 1,
      };
    }
  }
  return out;
}

export function extractSyncPayloadFromState(
  state: OpsState,
  tombstones: SyncTombstones,
  metaUpdatedAtMs: number,
  explicitDelays: Record<string, SchoolDelayRecord>,
  updatedAtMs: number
): UniversalSyncPayload {
  const nowDate = new Date();
  const liveToday = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(nowDate.getDate()).padStart(2, '0')}`;
  const ohchsDelayedDates = deriveOhchsDelaysFromReminders(state.reminders, explicitDelays);
  const userBlocks = state.blocks.filter((b) =>
    shouldIncludeOhchsBlockInSync(b, liveToday, ohchsDelayedDates)
  );
  const userReminders = state.reminders.filter((r) =>
    shouldIncludeOhchsReminderInSync(r, liveToday, ohchsDelayedDates)
  );

  return {
    schemaVersion: 1,
    updatedAtMs,
    metaUpdatedAtMs,
    siteConfig: state.siteConfig,
    whyStatements: state.whyStatements,
    hourlyRateDollars: state.hourlyRateDollars,
    projects: state.projects,
    ideas: state.ideas,
    userBlocks,
    ohchsDelayedDates,
    userReminders,
    checkups: state.checkups,
    pacedGoals: state.pacedGoals,
    pacingLogs: state.pacingLogs,
    offloadedTasks: state.offloadedTasks,
    reflections: state.reflections,
    draftDailyNote: state.draftDailyNote,
    draftReflectionPrompt: state.draftReflectionPrompt,
    draftReflectionText: state.draftReflectionText,
    streak: state.streak,
    tombstones,
  };
}

function sortBlocks(blocks: CalendarBlock[]): CalendarBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

export function applySyncPayloadToState(
  prev: OpsState,
  payload: UniversalSyncPayload,
  liveToday: string
): OpsState {
  const baseOhchs = buildFullOhchsSchedule(liveToday);
  const delays = payload.ohchsDelayedDates ?? {};

  // Rebuild OHCHS base blocks & pins with any snow-day delay overrides applied
  const delayedDatesSet = new Set(
    Object.entries(delays)
      .filter(([, rec]) => rec.mode !== 'regular')
      .map(([iso]) => iso)
  );

  const ohchsBlocksFiltered = baseOhchs.blocks.filter((b) => !delayedDatesSet.has(b.date));
  const ohchsPinsFiltered = baseOhchs.reminders.filter((r) => !delayedDatesSet.has(r.date));

  const rebuiltDelayBlocks: CalendarBlock[] = [];
  const rebuiltDelayPins: ReminderItem[] = [];

  for (const iso of delayedDatesSet) {
    const entry = OHCHS_BY_DATE.get(iso);
    const rec = delays[iso];
    if (entry && rec) {
      rebuiltDelayBlocks.push(...buildOhchsBlocksForEntry(entry, liveToday, rec.mode));
      rebuiltDelayPins.push(buildOhchsPinForEntry(entry, liveToday, rec.mode));
    }
  }

  const customOhchsBlockMap = new Map<string, CalendarBlock>();
  const pureUserBlocks: CalendarBlock[] = [];
  for (const blk of payload.userBlocks ?? []) {
    if (blk.id.startsWith('ohchs-')) {
      customOhchsBlockMap.set(blk.id, blk);
    } else {
      pureUserBlocks.push(blk);
    }
  }

  const blockTombstones = payload.tombstones?.blocks ?? {};
  const finalOhchsBlocks = [...ohchsBlocksFiltered, ...rebuiltDelayBlocks]
    .filter((b) => !(blockTombstones[b.id] > 0))
    .map((b) => {
      const custom = customOhchsBlockMap.get(b.id);
      if (!custom) return b;
      // Preserve delayed bell times if date is delayed, while applying custom color/notes/alert/completed
      if (delayedDatesSet.has(b.date)) {
        return {
          ...custom,
          startTime: b.startTime,
          endTime: b.endTime,
        };
      }
      return custom;
    });

  const customOhchsRemMap = new Map<string, ReminderItem>();
  const pureUserReminders: ReminderItem[] = [];
  for (const rem of payload.userReminders ?? []) {
    if (rem.id.startsWith('ohchs-rot-')) {
      customOhchsRemMap.set(rem.id, rem);
    } else {
      pureUserReminders.push(rem);
    }
  }

  const remTombstones = payload.tombstones?.reminders ?? {};
  const finalOhchsReminders = [...ohchsPinsFiltered, ...rebuiltDelayPins]
    .filter((r) => !(remTombstones[r.id] > 0))
    .map((r) => {
      const custom = customOhchsRemMap.get(r.id);
      if (!custom) return r;
      if (delayedDatesSet.has(r.date)) {
        return { ...custom, title: r.title };
      }
      return custom;
    });

  const allReminders = [...finalOhchsReminders, ...pureUserReminders].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time)
  );

  return {
    ...prev,
    siteConfig: payload.siteConfig ?? prev.siteConfig,
    whyStatements: payload.whyStatements ?? prev.whyStatements,
    hourlyRateDollars: payload.hourlyRateDollars ?? prev.hourlyRateDollars,
    projects: payload.projects?.length ? payload.projects : prev.projects,
    ideas: payload.ideas ?? prev.ideas,
    blocks: sortBlocks([...finalOhchsBlocks, ...pureUserBlocks]),
    reminders: allReminders,
    checkups: payload.checkups ?? prev.checkups,
    pacedGoals: payload.pacedGoals ?? prev.pacedGoals,
    pacingLogs: payload.pacingLogs ?? prev.pacingLogs,
    offloadedTasks: payload.offloadedTasks ?? prev.offloadedTasks,
    reflections: payload.reflections ?? prev.reflections,
    draftDailyNote: payload.draftDailyNote ?? prev.draftDailyNote,
    draftReflectionPrompt: payload.draftReflectionPrompt ?? prev.draftReflectionPrompt,
    draftReflectionText: payload.draftReflectionText ?? prev.draftReflectionText,
    streak: payload.streak ?? prev.streak,
  };
}

function getSyncQuerySuffix(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const ns = params.get('syncNs');
    if (ns === 'e2e-test') return '?ns=e2e-test';
  } catch {
    /* ignore */
  }
  return '';
}

function getCandidateSyncEndpoints(): string[] {
  const qs = getSyncQuerySuffix();
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  if (host === 'localhost' || host === '127.0.0.1') {
    return [`/api/sync${qs}`, `https://airbnb710.com/api/sync${qs}`];
  }
  return [`/api/sync${qs}`];
}

export interface SyncApiResult {
  ok: boolean;
  notModified?: boolean;
  etag?: string | null;
  serverTimeMs?: number;
  payload: UniversalSyncPayload | null;
}

export async function fetchCloudWorkspace(
  ifNoneMatch?: string | null
): Promise<SyncApiResult | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (ifNoneMatch && ifNoneMatch.trim()) {
    headers['If-None-Match'] = ifNoneMatch.trim();
  }

  for (const endpoint of getCandidateSyncEndpoints()) {
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      if (res.status === 304) {
        return {
          ok: true,
          notModified: true,
          etag: res.headers.get('etag') || ifNoneMatch || null,
          payload: null,
        };
      }
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) continue;
      const data = (await res.json()) as SyncApiResult;
      if (data && data.ok) {
        return {
          ...data,
          etag: data.etag ?? res.headers.get('etag') ?? null,
        };
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

export async function pushAndMergeCloudWorkspace(
  localPayload: UniversalSyncPayload,
  keepalive = false
): Promise<SyncApiResult | null> {
  const body = JSON.stringify(localPayload);
  // Browsers reject fetch({ keepalive: true }) payloads above 64 KiB
  const canKeepalive = keepalive && body.length <= 60_000;

  for (const endpoint of getCandidateSyncEndpoints()) {
    try {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
          cache: 'no-store',
          keepalive: canKeepalive,
        });
      } catch (fetchErr) {
        if (canKeepalive) {
          res = await fetch(endpoint, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body,
            cache: 'no-store',
          });
        } else {
          throw fetchErr;
        }
      }
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) continue;
      const data = (await res.json()) as SyncApiResult;
      if (data && data.ok && data.payload) {
        return {
          ...data,
          etag: data.etag ?? res.headers.get('etag') ?? null,
          payload: mergeUniversalPayload(data.payload, localPayload),
        };
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}
