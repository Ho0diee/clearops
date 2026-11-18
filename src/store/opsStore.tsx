import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CalendarBlock,
  CloudSyncStatus,
  ConfidenceLevel,
  IdeaItem,
  OffloadedTask,
  OpsActions,
  OpsState,
  PacingUpdateLog,
  ParsedLiveInput,
  ReminderItem,
  RouteTab,
  ScheduleViewMode,
  SiteConfig,
  VoiceScheduleDraft,
  WhyCategory,
} from '../types/schema';
import {
  AIRBNB710_STR_PRESET,
  DEFAULT_SITE_CONFIG,
  getTodayISO,
  INITIAL_OPS_STATE,
  REFLECTION_PROMPTS,
} from './seedData';
import {
  buildFullOhchsSchedule,
  buildOhchsBlocksForEntry,
  buildOhchsPinForEntry,
  OHCHS_BY_DATE,
} from './ohchsSchedule';
import { interpretScheduleInput, parseProgressiveVoiceDraft } from './scheduleAi';
import { useSchoolworkExtractorBridge } from './schoolworkBridge';
import {
  getEasternNow,
  reconcileSchoolworkLifecycle,
} from '../schoolwork/standardizedEngine';
import {
  mergeTombstones,
  mergeUniversalPayload,
  type SchoolDelayRecord,
  type SyncTombstones,
} from './universalMerge';
import {
  applySyncPayloadToState,
  ensurePreSyncBackupSaved,
  extractSyncPayloadFromState,
  fetchCloudWorkspace,
  loadLocalTombstones,
  pushAndMergeCloudWorkspace,
  saveLocalTombstones,
} from './universalSyncClient';

export { getTodayISO };

const STORAGE_KEY = 'clearops_state_v1';
const CLEAN_SLATE_VERSION = 2;
const OHCHS_SCHEDULE_VERSION = 1;

type PersistedOpsEnvelope = Partial<OpsState> & {
  _cleanSlateVersion?: number;
  _ohchsScheduleVersion?: number;
  _lastSavedToday?: string;
  _metaUpdatedAtMs?: number;
  _ohchsDelayedDates?: Record<string, SchoolDelayRecord>;
};

/* ==========================================================================
   Date & Time Utility Helpers (Exported for Subagents)
   ========================================================================== */

export function addDaysISO(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function getWeekDatesISO(anchorDate: string): string[] {
  const [y, m, d] = anchorDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDaysISO(anchorDate, diffToMonday);
  return Array.from({ length: 7 }, (_, idx) => addDaysISO(monday, idx));
}

export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function addMinutesToTime(hhmm: string, deltaMinutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 55, h * 60 + m + deltaMinutes));
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function parseClockToken(token: string): string | null {
  const clean = token.trim().toLowerCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function inferWhyCategory(title: string): WhyCategory {
  const lower = title.toLowerCase();
  if (/(class|lecture|seminar|lab|study|exam|homework|problem set|school|cs\b)/.test(lower)) {
    return 'School';
  }
  if (/(gym|run|workout|strength|mobility|dentist|doctor|sleep|walk|health)/.test(lower)) {
    return 'Health';
  }
  if (/(family|dinner|mom|dad|sister|brother|kids|parents|call home)/.test(lower)) {
    return 'Family';
  }
  return 'Organization';
}

export function parseNaturalLanguageInput(
  rawText: string,
  baseDate: string
): ParsedLiveInput | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const liveToday = getTodayISO();
  let targetDate = baseDate;
  if (/\btomorrow\b/i.test(trimmed)) {
    targetDate = addDaysISO(liveToday, 1);
  } else if (/\btoday\b/i.test(trimmed)) {
    targetDate = liveToday;
  }

  const isEmptyZone = /\b(empty\s+zone|focus\s+zone|focus\s+slot)\b/i.test(trimmed);
  const isReminder = !isEmptyZone && /\b(remind|reminder)\b/i.test(trimmed);

  // Check range: "between 2pm and 3:30pm" or "from 14:00 to 15:30" or "2pm-3pm"
  const rangeRegex =
    /(?:between|from)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:and|to|-|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const rangeMatch = trimmed.match(rangeRegex);

  let startTime = '16:30';
  let endTime = '17:30';

  if (rangeMatch) {
    let rawStart = rangeMatch[1].trim();
    const rawEnd = rangeMatch[2].trim();
    // Inherit meridiem if start lacks am/pm and end has am/pm (e.g., "between 2 and 3pm")
    const endMeridiem = rawEnd.match(/(am|pm)$/i)?.[1];
    if (endMeridiem && !/(am|pm)$/i.test(rawStart) && !rawStart.includes(':')) {
      const sNum = Number(rawStart);
      const eNum = Number(rawEnd.replace(/(am|pm)/i, '').split(':')[0]);
      if (sNum <= eNum || sNum === 12) {
        rawStart = `${rawStart}${endMeridiem}`;
      }
    }
    const parsedStart = parseClockToken(rawStart);
    const parsedEnd = parseClockToken(rawEnd);
    if (parsedStart) startTime = parsedStart;
    if (parsedEnd) endTime = parsedEnd;
    else if (parsedStart) endTime = addMinutesToTime(parsedStart, 60);
  } else {
    const atMatch = trimmed.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (atMatch) {
      const parsedAt = parseClockToken(atMatch[1]);
      if (parsedAt) {
        startTime = parsedAt;
        endTime = addMinutesToTime(parsedAt, 60);
      }
    }
  }

  // Clean conversational filler from title
  let cleanTitle = trimmed
    .replace(/^(hey[, ]+|hi[, ]+|okay[, ]+|please\s+)?(can you\s+|could you\s+)?/i, '')
    .replace(/^(add|create|schedule|set|put)\s+(a\s+|an\s+)?/i, '')
    .replace(/^(reminder\s+(for|to)\s+|scheduled\s+event\s+(for\s+)?|event\s+(for\s+)?|block\s+(for\s+)?)/i, '')
    .replace(rangeRegex, ' ')
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i, ' ')
    .replace(/\b(today|tomorrow)\b/gi, ' ')
    .replace(/\s+(for|between|from|on)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanTitle) {
    cleanTitle = isEmptyZone
      ? 'Empty Zone — Open Focus Slot'
      : isReminder
      ? 'Quick Reminder'
      : 'Scheduled Commitment';
  } else {
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  }

  if (isReminder) {
    return {
      mode: 'reminder',
      title: cleanTitle,
      date: targetDate,
      startTime,
    };
  }

  if (isEmptyZone) {
    const zoneTitle = /^empty zone/i.test(cleanTitle)
      ? cleanTitle
      : `Empty Zone — ${cleanTitle}`;
    return {
      mode: 'empty-zone',
      title: zoneTitle,
      date: targetDate,
      startTime,
      endTime,
    };
  }

  return {
    mode: 'event',
    title: cleanTitle,
    date: targetDate,
    startTime,
    endTime,
    whyCategory: inferWhyCategory(cleanTitle),
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function sortBlocks(blocks: CalendarBlock[]): CalendarBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
}

function normalizeProjectRanks(ideas: IdeaItem[], project: string): IdeaItem[] {
  const projectActive = ideas
    .filter((i) => i.project === project && i.status !== 'completed')
    .sort((a, b) => a.priorityRank - b.priorityRank);

  const rankMap = new Map<string, number>();
  projectActive.forEach((item, index) => {
    rankMap.set(item.id, index + 1);
  });

  return ideas.map((item) =>
    rankMap.has(item.id) ? { ...item, priorityRank: rankMap.get(item.id)! } : item
  );
}

function normalizeAllProjectsRanks(ideas: IdeaItem[], projects: string[]): IdeaItem[] {
  const allProjects = Array.from(new Set([...projects, ...ideas.map((i) => i.project)]));
  return allProjects.reduce((acc, proj) => normalizeProjectRanks(acc, proj), ideas);
}

/* ==========================================================================
   React Store Context
   ========================================================================== */

interface OpsStoreValue {
  state: OpsState;
  actions: OpsActions;
  reflectionPrompts: string[];
  todayIso: string;
  syncStatus: CloudSyncStatus;
  lastSyncedAt: number | null;
}

const OpsStoreContext = createContext<OpsStoreValue | null>(null);

function computeSyncFingerprint(
  state: OpsState,
  tombstones: SyncTombstones,
  ohchsDelays: Record<string, SchoolDelayRecord>
): string {
  const payload = extractSyncPayloadFromState(state, tombstones, 0, ohchsDelays, 0);
  return JSON.stringify({
    siteConfig: payload.siteConfig,
    whyStatements: payload.whyStatements,
    hourlyRateDollars: payload.hourlyRateDollars,
    projects: payload.projects,
    ideas: payload.ideas,
    userBlocks: payload.userBlocks,
    ohchsDelayedDates: payload.ohchsDelayedDates,
    userReminders: payload.userReminders,
    checkups: payload.checkups,
    pacedGoals: payload.pacedGoals,
    pacingLogs: payload.pacingLogs,
    offloadedTasks: payload.offloadedTasks,
    reflections: payload.reflections,
    draftDailyNote: payload.draftDailyNote,
    draftReflectionPrompt: payload.draftReflectionPrompt,
    draftReflectionText: payload.draftReflectionText,
    streak: payload.streak,
    tombstones: payload.tombstones,
  });
}

export const OpsStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [todayIso, setTodayIso] = useState<string>(() => getTodayISO());
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('syncing');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const initialMetaMsRef = useRef<number>(0);
  const initialDelaysRef = useRef<Record<string, SchoolDelayRecord>>({});

  // IMPORTANT: Keep useState initializer 100% pure (read-only) so React 18 <StrictMode>
  // double-invocation returns the exact same migrated state on both passes before useEffect commits.
  const [state, setState] = useState<OpsState>(() => {
    const liveToday = getTodayISO();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedOpsEnvelope;
        if (parsed && Array.isArray(parsed.blocks) && Array.isArray(parsed.ideas)) {
          if (typeof parsed._metaUpdatedAtMs === 'number') {
            initialMetaMsRef.current = parsed._metaUpdatedAtMs;
          }
          if (parsed._ohchsDelayedDates && typeof parsed._ohchsDelayedDates === 'object') {
            initialDelaysRef.current = parsed._ohchsDelayedDates;
          }

          const mergedProjects = parsed.projects ?? INITIAL_OPS_STATE.projects;
          const savedName = parsed.siteConfig?.workspaceName;
          const migratedName =
            !savedName || savedName === 'ClearOps' || savedName === 'Airbnb 710 Operations'
              ? 'Intuition'
              : savedName;

          if (parsed._cleanSlateVersion !== CLEAN_SLATE_VERSION) {
            const ohchs = buildFullOhchsSchedule(liveToday);
            return {
              ...INITIAL_OPS_STATE,
              selectedDate: liveToday,
              scheduleViewMode: parsed.scheduleViewMode ?? 'week',
              activeTab: parsed.activeTab ?? 'schedule',
              siteConfig: {
                ...DEFAULT_SITE_CONFIG,
                ...(parsed.siteConfig ?? {}),
                workspaceName: migratedName,
              },
              whyStatements: parsed.whyStatements
                ? { ...INITIAL_OPS_STATE.whyStatements, ...parsed.whyStatements }
                : INITIAL_OPS_STATE.whyStatements,
              hourlyRateDollars:
                typeof parsed.hourlyRateDollars === 'number'
                  ? parsed.hourlyRateDollars
                  : INITIAL_OPS_STATE.hourlyRateDollars,
              projects: mergedProjects,
              ideas: normalizeAllProjectsRanks(parsed.ideas, mergedProjects),
              blocks: ohchs.blocks,
              reminders: ohchs.reminders,
              checkups: [],
              pacedGoals: [],
              pacingLogs: [],
              offloadedTasks: [],
              reflections: [],
              draftDailyNote: '',
              draftReflectionText: '',
              streak: {
                currentDays: 0,
                bestDays: 0,
                lastLockedDate: '',
                completedDates: [],
                protectionRuleNote: INITIAL_OPS_STATE.streak.protectionRuleNote,
              },
              toastMessage: null,
            };
          }

          let nextBlocks = parsed.blocks;
          let nextReminders = parsed.reminders ?? [];
          if (parsed._ohchsScheduleVersion !== OHCHS_SCHEDULE_VERSION) {
            const ohchs = buildFullOhchsSchedule(liveToday);
            const userBlocks = parsed.blocks.filter((b) => !b.id.startsWith('ohchs-'));
            const userReminders = nextReminders.filter((r) => !r.id.startsWith('ohchs-rot-'));
            nextBlocks = sortBlocks([...ohchs.blocks, ...userBlocks]);
            nextReminders = [...ohchs.reminders, ...userReminders];
          }

          const shouldRollToToday = parsed._lastSavedToday !== liveToday;
          return {
            ...INITIAL_OPS_STATE,
            ...parsed,
            blocks: nextBlocks,
            reminders: nextReminders,
            selectedDate: shouldRollToToday ? liveToday : parsed.selectedDate || liveToday,
            siteConfig: {
              ...DEFAULT_SITE_CONFIG,
              ...(parsed.siteConfig ?? {}),
              workspaceName: migratedName,
            },
            ideas: normalizeAllProjectsRanks(parsed.ideas, mergedProjects),
            toastMessage: null,
          };
        }
      }
    } catch {
      // Ignore storage read errors
    }
    return {
      ...INITIAL_OPS_STATE,
      selectedDate: liveToday,
    };
  });

  const stateRef = useRef<OpsState>(state);
  stateRef.current = state;

  const tombstonesRef = useRef<SyncTombstones | null>(null);
  if (tombstonesRef.current === null) {
    tombstonesRef.current = loadLocalTombstones();
  }

  const metaUpdatedAtRef = useRef<number>(initialMetaMsRef.current);
  const ohchsDelaysRef = useRef<Record<string, SchoolDelayRecord>>(initialDelaysRef.current);
  const lastEtagRef = useRef<string | null>(null);
  const syncInFlightRef = useRef<boolean>(false);
  const pendingPushAfterFlightRef = useRef<boolean>(false);
  const pushDebounceRef = useRef<number | null>(null);
  const didBootSyncRef = useRef<boolean>(false);

  const lastSyncedFingerprintRef = useRef<string>(
    computeSyncFingerprint(state, tombstonesRef.current, ohchsDelaysRef.current)
  );

  // Automatically follow the real-world calendar across midnight or when waking the phone on a new day
  useEffect(() => {
    const syncRealWorldToday = () => {
      const nextToday = getTodayISO();
      setTodayIso((prevToday) => {
        if (prevToday === nextToday) return prevToday;
        setState((prev) => ({
          ...prev,
          selectedDate: nextToday,
        }));
        return nextToday;
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncRealWorldToday();
      }
    };

    const intervalId = window.setInterval(syncRealWorldToday, 30_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', syncRealWorldToday);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', syncRealWorldToday);
    };
  }, []);

  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const { toastMessage: _omit, ...persisted } = state;
      const envelope: PersistedOpsEnvelope = {
        ...persisted,
        _cleanSlateVersion: CLEAN_SLATE_VERSION,
        _ohchsScheduleVersion: OHCHS_SCHEDULE_VERSION,
        _lastSavedToday: todayIso,
        _metaUpdatedAtMs: metaUpdatedAtRef.current,
        _ohchsDelayedDates: ohchsDelaysRef.current,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // Ignore storage write errors
    }
  }, [state, todayIso]);

  const performCloudSync = useCallback(
    async (mode: 'boot' | 'push' | 'pull', keepalive = false): Promise<boolean> => {
      if (syncInFlightRef.current) {
        if (mode === 'push') {
          pendingPushAfterFlightRef.current = true;
        }
        return false;
      }

      syncInFlightRef.current = true;
      if (mode !== 'pull') {
        setSyncStatus('syncing');
      }

      try {
        // Save a one-time read-only local backup of pre-sync phone data before first cloud merge
        ensurePreSyncBackupSaved(STORAGE_KEY);

        const currentTombstones = tombstonesRef.current ?? loadLocalTombstones();
        const snapshotAtStartFp = computeSyncFingerprint(
          stateRef.current,
          currentTombstones,
          ohchsDelaysRef.current
        );
        const localPayload = extractSyncPayloadFromState(
          stateRef.current,
          currentTombstones,
          metaUpdatedAtRef.current,
          ohchsDelaysRef.current,
          Date.now()
        );

        const hasUnpushedLocalChanges = snapshotAtStartFp !== lastSyncedFingerprintRef.current;

        if (mode === 'pull' && !hasUnpushedLocalChanges && didBootSyncRef.current) {
          const remoteRes = await fetchCloudWorkspace();
          if (!remoteRes) {
            setSyncStatus('offline');
            return false;
          }
          if (!remoteRes.payload) {
            // Cloud store is empty — push this device's state up to initialize universal store
            const pushed = await pushAndMergeCloudWorkspace(localPayload);
            if (!pushed?.payload) {
              setSyncStatus('offline');
              return false;
            }
            lastEtagRef.current = pushed.etag ?? null;
            setSyncStatus('synced');
            setLastSyncedAt(Date.now());
            return true;
          }

          if (remoteRes.etag && remoteRes.etag === lastEtagRef.current) {
            setSyncStatus('synced');
            return true;
          }

          // Merge latest local (in case user edited during fetch) with remote payload
          const latestLocal = extractSyncPayloadFromState(
            stateRef.current,
            tombstonesRef.current ?? currentTombstones,
            metaUpdatedAtRef.current,
            ohchsDelaysRef.current,
            Date.now()
          );
          const merged = mergeUniversalPayload(remoteRes.payload, latestLocal);
          tombstonesRef.current = mergeTombstones(merged.tombstones, tombstonesRef.current ?? {});
          saveLocalTombstones(tombstonesRef.current);
          metaUpdatedAtRef.current = Math.max(metaUpdatedAtRef.current, merged.metaUpdatedAtMs);
          ohchsDelaysRef.current = merged.ohchsDelayedDates;
          lastEtagRef.current = remoteRes.etag ?? null;

          const liveToday = getTodayISO();
          const nextState = applySyncPayloadToState(stateRef.current, merged, liveToday);
          lastSyncedFingerprintRef.current = computeSyncFingerprint(
            nextState,
            tombstonesRef.current,
            ohchsDelaysRef.current
          );
          setState((prev) => applySyncPayloadToState(prev, merged, liveToday));
          setSyncStatus('synced');
          setLastSyncedAt(Date.now());
          return true;
        }

        // 'boot' or 'push': atomically push & merge local workspace with cloud
        const pushRes = await pushAndMergeCloudWorkspace(localPayload, keepalive);
        if (!pushRes || !pushRes.payload) {
          setSyncStatus('offline');
          return false;
        }

        didBootSyncRef.current = true;
        lastEtagRef.current = pushRes.etag ?? null;

        // Re-merge with live stateRef in case the user typed characters while PUT was in flight
        const latestLocal = extractSyncPayloadFromState(
          stateRef.current,
          tombstonesRef.current ?? currentTombstones,
          metaUpdatedAtRef.current,
          ohchsDelaysRef.current,
          Date.now()
        );
        const finalMerged = mergeUniversalPayload(pushRes.payload, latestLocal);

        tombstonesRef.current = mergeTombstones(
          finalMerged.tombstones,
          tombstonesRef.current ?? {}
        );
        saveLocalTombstones(tombstonesRef.current);
        metaUpdatedAtRef.current = Math.max(metaUpdatedAtRef.current, finalMerged.metaUpdatedAtMs);
        ohchsDelaysRef.current = finalMerged.ohchsDelayedDates;

        const liveToday = getTodayISO();
        const nextState = applySyncPayloadToState(stateRef.current, finalMerged, liveToday);
        const postFlightFp = computeSyncFingerprint(
          stateRef.current,
          tombstonesRef.current,
          ohchsDelaysRef.current
        );
        const mergedFp = computeSyncFingerprint(
          nextState,
          tombstonesRef.current,
          ohchsDelaysRef.current
        );

        // If user did NOT type new characters mid-flight, mark mergedFp as synced;
        // if user DID type mid-flight, keep pendingPushAfterFlightRef true so the new characters push next!
        if (postFlightFp === snapshotAtStartFp) {
          lastSyncedFingerprintRef.current = mergedFp;
        } else {
          pendingPushAfterFlightRef.current = true;
        }

        if (mergedFp !== postFlightFp) {
          setState((prev) => applySyncPayloadToState(prev, finalMerged, liveToday));
        }

        setSyncStatus('synced');
        setLastSyncedAt(Date.now());
        return true;
      } catch {
        setSyncStatus('offline');
        return false;
      } finally {
        syncInFlightRef.current = false;
        if (pendingPushAfterFlightRef.current) {
          pendingPushAfterFlightRef.current = false;
          if (pushDebounceRef.current !== null) window.clearTimeout(pushDebounceRef.current);
          pushDebounceRef.current = window.setTimeout(() => {
            pushDebounceRef.current = null;
            void performCloudSync('push');
          }, 350);
        }
      }
    },
    []
  );

  // Boot sync + periodic multi-device pull + focus/visibility/pagehide handlers
  useEffect(() => {
    void performCloudSync('boot');

    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void performCloudSync('pull');
      }
    }, 8000);

    const onFocusOrOnline = () => {
      void performCloudSync(didBootSyncRef.current ? 'pull' : 'boot');
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void performCloudSync(didBootSyncRef.current ? 'pull' : 'boot');
      } else {
        // Flush any unsaved phone edits immediately with keepalive when switching apps or locking screen
        const currFp = computeSyncFingerprint(
          stateRef.current,
          tombstonesRef.current ?? loadLocalTombstones(),
          ohchsDelaysRef.current
        );
        if (currFp !== lastSyncedFingerprintRef.current) {
          void performCloudSync('push', true);
        }
      }
    };

    const onPageHide = () => {
      const currFp = computeSyncFingerprint(
        stateRef.current,
        tombstonesRef.current ?? loadLocalTombstones(),
        ohchsDelaysRef.current
      );
      if (currFp !== lastSyncedFingerprintRef.current) {
        void performCloudSync('push', true);
      }
    };

    window.addEventListener('focus', onFocusOrOnline);
    window.addEventListener('online', onFocusOrOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(pollId);
      if (pushDebounceRef.current !== null) window.clearTimeout(pushDebounceRef.current);
      window.removeEventListener('focus', onFocusOrOnline);
      window.removeEventListener('online', onFocusOrOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [performCloudSync]);

  // Watch state changes and debounce push to universal cloud whenever local data changes
  useEffect(() => {
    const currFp = computeSyncFingerprint(
      state,
      tombstonesRef.current ?? loadLocalTombstones(),
      ohchsDelaysRef.current
    );
    if (currFp === lastSyncedFingerprintRef.current) return;

    setSyncStatus('syncing');
    if (pushDebounceRef.current !== null) {
      window.clearTimeout(pushDebounceRef.current);
    }
    pushDebounceRef.current = window.setTimeout(() => {
      pushDebounceRef.current = null;
      void performCloudSync('push');
    }, 450);
  }, [state, performCloudSync]);

  useSchoolworkExtractorBridge(state, setState, tombstonesRef, ohchsDelaysRef, () => {
    void performCloudSync('pull');
  });

  useEffect(() => {
    document.documentElement.dataset.accent = state.siteConfig.accentTheme || 'cobalt';
    document.title = state.siteConfig.workspaceName || 'Intuition';
  }, [state.siteConfig.accentTheme, state.siteConfig.workspaceName]);

  useEffect(() => {
    if (!state.toastMessage) return;
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setState((prev) => ({ ...prev, toastMessage: null }));
    }, 3200);
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [state.toastMessage]);

  const showToast = (message: string) => {
    setState((prev) => ({ ...prev, toastMessage: message }));
  };

  const actions = useMemo<OpsActions>(() => {
    return {
      setActiveTab: (tab: RouteTab) => {
        setState((prev) => ({ ...prev, activeTab: tab }));
      },

      setReflectionOpen: (open: boolean) => {
        setState((prev) => ({ ...prev, isReflectionOpen: open }));
      },

      setSelectedDate: (date: string) => {
        setState((prev) => ({ ...prev, selectedDate: date }));
      },

      setScheduleViewMode: (mode: ScheduleViewMode) => {
        setState((prev) => ({ ...prev, scheduleViewMode: mode }));
      },

      showToast,

      addCalendarBlock: (blockInput) => {
        const id = makeId('blk');
        const nowIso = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          blocks: sortBlocks([...prev.blocks, { ...blockInput, id, updatedAt: nowIso }]),
        }));
        return id;
      },

      updateCalendarBlock: (blockId, patch) => {
        const nowIso = new Date().toISOString();
        const { todayIso: eastToday, nowMinutesOfDay } = getEasternNow();
        setState((prev) => {
          const patched = sortBlocks(
            prev.blocks.map((b) =>
              b.id === blockId ? { ...b, ...patch, updatedAt: nowIso } : b
            )
          );
          const reconciled = reconcileSchoolworkLifecycle({
            blocks: patched,
            todayIso: eastToday,
            nowMinutesOfDay,
            delaysByDate: ohchsDelaysRef.current,
          });
          return {
            ...prev,
            blocks: reconciled.blocks,
          };
        });
      },

      toggleBlockCompleted: (blockId: string) => {
        const nowIso = new Date().toISOString();
        const { todayIso: eastToday, nowMinutesOfDay } = getEasternNow();
        setState((prev) => {
          let toggledCompleted = false;
          let linkedIdeaId: string | undefined;
          const mapped = prev.blocks.map((b) => {
            if (b.id !== blockId) return b;
            toggledCompleted = !b.completed;
            linkedIdeaId = b.assignedIdeaId;
            return { ...b, completed: toggledCompleted, updatedAt: nowIso };
          });
          const reconciled = reconcileSchoolworkLifecycle({
            blocks: mapped,
            todayIso: eastToday,
            nowMinutesOfDay,
            delaysByDate: ohchsDelaysRef.current,
          });
          const nextIdeas =
            blockId.startsWith('sch-hw-') && linkedIdeaId
              ? prev.ideas.map((i) =>
                  i.id === linkedIdeaId
                    ? {
                        ...i,
                        status: (toggledCompleted ? 'completed' : 'active') as
                          | 'completed'
                          | 'active',
                        updatedAt: nowIso,
                      }
                    : i
                )
              : prev.ideas;
          return {
            ...prev,
            blocks: reconciled.blocks,
            ideas: nextIdeas,
          };
        });
      },

      deleteCalendarBlock: (blockId: string) => {
        if (tombstonesRef.current) {
          tombstonesRef.current = {
            ...tombstonesRef.current,
            blocks: { ...tombstonesRef.current.blocks, [blockId]: Date.now() },
          };
          saveLocalTombstones(tombstonesRef.current);
        }
        const { todayIso: eastToday, nowMinutesOfDay } = getEasternNow();
        setState((prev) => {
          const remaining = prev.blocks.filter((b) => b.id !== blockId);
          const reconciled = reconcileSchoolworkLifecycle({
            blocks: remaining,
            todayIso: eastToday,
            nowMinutesOfDay,
            delaysByDate: ohchsDelaysRef.current,
          });
          return {
            ...prev,
            blocks: reconciled.blocks,
          };
        });
      },

      updateWhyStatement: (category: WhyCategory, statement: string) => {
        metaUpdatedAtRef.current = Date.now();
        setState((prev) => ({
          ...prev,
          whyStatements: {
            ...prev.whyStatements,
            [category]: statement,
          },
        }));
        showToast(`Updated ${category} Why anchor`);
      },

      spilloverEmptyZone: (blockId: string) => {
        let outcome: { targetDate: string; targetTime: string } | null = null;

        setState((prev) => {
          const ordered = sortBlocks(prev.blocks);
          const sourceIdx = ordered.findIndex((b) => b.id === blockId);
          if (sourceIdx === -1) return prev;
          const source = ordered[sourceIdx];

          const workLabel = source.title.replace(/^Empty Zone\s*[—-]\s*/i, '').trim();
          const hasAssignedWork = Boolean(
            source.assignedIdeaId ||
              source.assignedGoalId ||
              (workLabel && !/^open focus slot$/i.test(workLabel))
          );

          // Find next chronological open Empty Zone after source
          const targetIdx = ordered.findIndex(
            (b, idx) =>
              idx > sourceIdx &&
              b.kind === 'empty-zone' &&
              !b.completed &&
              !b.assignedIdeaId &&
              !b.assignedGoalId &&
              /open focus slot|^empty zone$/i.test(b.title)
          );

          const carriedTitle = hasAssignedWork
            ? `Empty Zone — ${workLabel}`
            : source.title;

          if (targetIdx !== -1) {
            const target = ordered[targetIdx];
            outcome = { targetDate: target.date, targetTime: target.startTime };
            const updated = ordered.map((b, idx) => {
              if (idx === sourceIdx) {
                return {
                  ...b,
                  title: 'Empty Zone — Open Focus Slot (Spilled Over)',
                  assignedIdeaId: undefined,
                  assignedGoalId: undefined,
                  startingStepHint: `Moved to ${target.date} at ${target.startTime}`,
                  spilloverCount: (b.spilloverCount ?? 0) + 1,
                };
              }
              if (idx === targetIdx) {
                return {
                  ...b,
                  title: carriedTitle,
                  assignedIdeaId: source.assignedIdeaId,
                  assignedGoalId: source.assignedGoalId,
                  startingStepHint: source.startingStepHint,
                  spilloverCount: (source.spilloverCount ?? 0) + 1,
                };
              }
              return b;
            });
            return { ...prev, blocks: sortBlocks(updated) };
          }

          // Otherwise create a fresh open Empty Zone tomorrow morning
          const nextDate = addDaysISO(source.date, 1);
          outcome = { targetDate: nextDate, targetTime: '10:00' };
          const newTarget: CalendarBlock = {
            id: makeId('blk'),
            date: nextDate,
            startTime: '10:00',
            endTime: '11:30',
            title: carriedTitle,
            kind: 'empty-zone',
            completed: false,
            assignedIdeaId: source.assignedIdeaId,
            assignedGoalId: source.assignedGoalId,
            startingStepHint: source.startingStepHint,
            spilloverCount: (source.spilloverCount ?? 0) + 1,
          };

          const updated = ordered.map((b, idx) =>
            idx === sourceIdx
              ? {
                  ...b,
                  title: 'Empty Zone — Open Focus Slot (Spilled Over)',
                  assignedIdeaId: undefined,
                  assignedGoalId: undefined,
                  startingStepHint: `Moved to ${nextDate} at 10:00`,
                }
              : b
          );

          return { ...prev, blocks: sortBlocks([...updated, newTarget]) };
        });

        if (outcome) {
          const { targetDate, targetTime } = outcome;
          showToast(`Spilled over to ${formatShortDate(targetDate)} · ${targetTime} Empty Zone`);
        }
        return outcome;
      },

      assignIdeaToBlock: (blockId: string, ideaId: string | undefined) => {
        setState((prev) => {
          const idea = ideaId ? prev.ideas.find((i) => i.id === ideaId) : undefined;
          if (idea && idea.status === 'waiting-on') {
            return prev; // Waiting-On items never enter Empty Zones
          }
          return {
            ...prev,
            blocks: prev.blocks.map((b) => {
              if (b.id !== blockId) return b;
              if (!idea) {
                return {
                  ...b,
                  title: 'Empty Zone — Open Focus Slot',
                  assignedIdeaId: undefined,
                  startingStepHint: undefined,
                };
              }
              return {
                ...b,
                title: `Empty Zone — ${idea.title || 'Untitled Idea'}`,
                assignedIdeaId: idea.id,
                startingStepHint: idea.startingStep || undefined,
              };
            }),
          };
        });
      },

      assignIdeaToNextEmptyZone: (ideaId: string, fromDate?: string) => {
        let matchedBlock: CalendarBlock | null = null;

        setState((prev) => {
          const idea = prev.ideas.find((i) => i.id === ideaId);
          if (!idea || idea.status === 'waiting-on') return prev;

          const anchor = fromDate ?? prev.selectedDate;
          const ordered = sortBlocks(prev.blocks);
          const openIdx = ordered.findIndex(
            (b) =>
              b.date >= anchor &&
              b.kind === 'empty-zone' &&
              !b.completed &&
              !b.assignedIdeaId &&
              !b.assignedGoalId
          );

          const blockTitle = `Empty Zone — ${idea.title || 'Untitled Idea'}`;

          if (openIdx !== -1) {
            const updated = ordered.map((b, idx) => {
              if (idx !== openIdx) return b;
              const nextBlock: CalendarBlock = {
                ...b,
                title: blockTitle,
                assignedIdeaId: idea.id,
                startingStepHint: idea.startingStep,
              };
              matchedBlock = nextBlock;
              return nextBlock;
            });
            return { ...prev, blocks: updated };
          }

          const created: CalendarBlock = {
            id: makeId('blk'),
            date: anchor,
            startTime: '16:00',
            endTime: '17:00',
            title: blockTitle,
            kind: 'empty-zone',
            completed: false,
            assignedIdeaId: idea.id,
            startingStepHint: idea.startingStep,
          };
          matchedBlock = created;
          return { ...prev, blocks: sortBlocks([...prev.blocks, created]) };
        });

        if (matchedBlock) {
          const b = matchedBlock as CalendarBlock;
          showToast(`Scheduled in ${formatShortDate(b.date)} · ${b.startTime} Empty Zone`);
        }
        return matchedBlock;
      },

      parseLiveCommand: (rawText: string) => {
        return interpretScheduleInput(rawText, {
          todayIso: getTodayISO(),
          selectedDate: state.selectedDate,
          blocks: state.blocks,
          ideas: state.ideas,
        });
      },

      submitLiveCommand: (rawText: string) => {
        const parsed = interpretScheduleInput(rawText, {
          todayIso: getTodayISO(),
          selectedDate: state.selectedDate,
          blocks: state.blocks,
          ideas: state.ideas,
        });
        if (!parsed) return null;

        if (typeof parsed.alertOffsetMinutes === 'number' && typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => undefined);
          }
        }

        if (parsed.mode === 'update-event' && parsed.targetBlockId) {
          setState((prev) => ({
            ...prev,
            selectedDate: parsed.date,
            activeTab: 'schedule',
            blocks: prev.blocks.map((b) =>
              b.id === parsed.targetBlockId
                ? {
                    ...b,
                    ...(parsed.customColor !== undefined ? { customColor: parsed.customColor } : {}),
                    ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
                    ...(parsed.alertOffsetMinutes !== undefined
                      ? {
                          alertOffsetMinutes:
                            parsed.alertOffsetMinutes === null
                              ? undefined
                              : parsed.alertOffsetMinutes,
                        }
                      : {}),
                  }
                : b
            ),
          }));
          showToast(`Updated "${parsed.title}"`);
          return parsed;
        }

        if (parsed.mode === 'fill-slot' && parsed.targetBlockId) {
          const slotTitle = /^empty zone/i.test(parsed.title)
            ? parsed.title
            : `Empty Zone — ${parsed.title}`;
          setState((prev) => ({
            ...prev,
            selectedDate: parsed.date,
            activeTab: 'schedule',
            blocks: prev.blocks.map((b) =>
              b.id === parsed.targetBlockId
                ? {
                    ...b,
                    title: slotTitle,
                    ...(parsed.customColor !== undefined ? { customColor: parsed.customColor } : {}),
                    ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
                    ...(typeof parsed.alertOffsetMinutes === 'number'
                      ? { alertOffsetMinutes: parsed.alertOffsetMinutes }
                      : {}),
                    assignedIdeaId: parsed.matchedIdeaId ?? b.assignedIdeaId,
                    startingStepHint: parsed.startingStepHint ?? b.startingStepHint,
                  }
                : b
            ),
          }));
          showToast(`Placed "${parsed.title}" into ${parsed.startTime} Focus Slot`);
          return parsed;
        }

        if (parsed.mode === 'reminder') {
          const remId = makeId('rem');
          const newRem: ReminderItem = {
            id: remId,
            date: parsed.date,
            time: parsed.startTime,
            title: parsed.title,
            completed: false,
          };
          setState((prev) => ({
            ...prev,
            selectedDate: parsed.date,
            reminders: [...prev.reminders, newRem].sort((a, b) =>
              a.time.localeCompare(b.time)
            ),
          }));
          showToast(`Added reminder "${parsed.title}" at ${parsed.startTime}`);
          return { ...parsed, targetBlockId: remId };
        }

        const blockId = makeId('blk');
        const newBlock: CalendarBlock = {
          id: blockId,
          date: parsed.date,
          startTime: parsed.startTime,
          endTime: parsed.endTime ?? addMinutesToTime(parsed.startTime, 60),
          title: parsed.title,
          kind: parsed.mode === 'empty-zone' ? 'empty-zone' : 'baseline',
          completed: false,
          whyCategory: parsed.mode === 'event' ? parsed.whyCategory : undefined,
          customColor: parsed.customColor,
          notes: parsed.notes,
          alertOffsetMinutes:
            typeof parsed.alertOffsetMinutes === 'number'
              ? parsed.alertOffsetMinutes
              : undefined,
          assignedIdeaId: parsed.matchedIdeaId,
          startingStepHint: parsed.startingStepHint,
        };

        setState((prev) => ({
          ...prev,
          selectedDate: parsed.date,
          activeTab: 'schedule',
          blocks: sortBlocks([...prev.blocks, newBlock]),
        }));
        showToast(
          `Scheduled "${parsed.title}" (${newBlock.startTime}-${newBlock.endTime})`
        );
        return { ...parsed, targetBlockId: blockId };
      },

      parseVoiceDraft: (rawText: string) => {
        return parseProgressiveVoiceDraft(rawText, {
          todayIso: getTodayISO(),
          selectedDate: state.selectedDate,
          blocks: state.blocks,
          ideas: state.ideas,
        });
      },

      commitVoiceDraft: (draft: VoiceScheduleDraft) => {
        if (!draft.isComplete || !draft.title || !draft.date || !draft.startTime) {
          return null;
        }

        if (typeof draft.alertOffsetMinutes === 'number' && typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => undefined);
          }
        }

        if (draft.mode === 'update-event' && draft.targetBlockId) {
          setState((prev) => ({
            ...prev,
            selectedDate: draft.date!,
            activeTab: 'schedule',
            blocks: prev.blocks.map((b) =>
              b.id === draft.targetBlockId
                ? {
                    ...b,
                    ...(draft.customColor !== undefined ? { customColor: draft.customColor } : {}),
                    ...(draft.notes !== undefined ? { notes: draft.notes } : {}),
                    ...(draft.alertOffsetMinutes !== undefined
                      ? {
                          alertOffsetMinutes:
                            draft.alertOffsetMinutes === null
                              ? undefined
                              : draft.alertOffsetMinutes,
                        }
                      : {}),
                  }
                : b
            ),
          }));
          showToast(`Updated "${draft.title}"`);
          return {
            mode: 'update-event',
            title: draft.title,
            date: draft.date,
            startTime: draft.startTime,
            endTime: draft.endTime,
            customColor: draft.customColor,
            notes: draft.notes,
            alertOffsetMinutes: draft.alertOffsetMinutes,
            targetBlockId: draft.targetBlockId,
          };
        }

        if (draft.mode === 'fill-slot' && draft.targetBlockId) {
          const slotTitle = /^empty zone/i.test(draft.title)
            ? draft.title
            : `Empty Zone — ${draft.title}`;
          setState((prev) => ({
            ...prev,
            selectedDate: draft.date!,
            activeTab: 'schedule',
            blocks: prev.blocks.map((b) =>
              b.id === draft.targetBlockId
                ? {
                    ...b,
                    title: slotTitle,
                    ...(draft.customColor !== undefined ? { customColor: draft.customColor } : {}),
                    ...(draft.notes !== undefined ? { notes: draft.notes } : {}),
                    ...(typeof draft.alertOffsetMinutes === 'number'
                      ? { alertOffsetMinutes: draft.alertOffsetMinutes }
                      : {}),
                    assignedIdeaId: draft.matchedIdeaId ?? b.assignedIdeaId,
                    startingStepHint: draft.startingStepHint ?? b.startingStepHint,
                  }
                : b
            ),
          }));
          showToast(`Placed "${draft.title}" into Focus Slot`);
          return {
            mode: 'fill-slot',
            title: draft.title,
            date: draft.date,
            startTime: draft.startTime,
            endTime: draft.endTime,
            customColor: draft.customColor,
            notes: draft.notes,
            alertOffsetMinutes: draft.alertOffsetMinutes,
            targetBlockId: draft.targetBlockId,
            matchedIdeaId: draft.matchedIdeaId,
            startingStepHint: draft.startingStepHint,
          };
        }

        if (draft.mode === 'reminder') {
          const remId = makeId('rem');
          const newRem: ReminderItem = {
            id: remId,
            date: draft.date,
            time: draft.startTime,
            title: draft.title,
            completed: false,
          };
          setState((prev) => ({
            ...prev,
            selectedDate: draft.date!,
            reminders: [...prev.reminders, newRem].sort((a, b) => a.time.localeCompare(b.time)),
          }));
          showToast(`Reminder set: "${draft.title}"`);
          return {
            mode: 'reminder',
            title: draft.title,
            date: draft.date,
            startTime: draft.startTime,
            targetBlockId: remId,
          };
        }

        if (!draft.endTime) return null;
        const blockId = makeId('blk');
        const newBlock: CalendarBlock = {
          id: blockId,
          date: draft.date,
          startTime: draft.startTime,
          endTime: draft.endTime,
          title: draft.title,
          kind: draft.mode === 'empty-zone' ? 'empty-zone' : 'baseline',
          completed: false,
          whyCategory: draft.mode === 'event' ? draft.whyCategory : undefined,
          customColor: draft.customColor,
          notes: draft.notes,
          alertOffsetMinutes:
            typeof draft.alertOffsetMinutes === 'number'
              ? draft.alertOffsetMinutes
              : undefined,
          assignedIdeaId: draft.matchedIdeaId,
          startingStepHint: draft.startingStepHint,
        };

        setState((prev) => ({
          ...prev,
          selectedDate: draft.date!,
          activeTab: 'schedule',
          blocks: sortBlocks([...prev.blocks, newBlock]),
        }));
        showToast(`Added "${draft.title}"`);
        return {
          mode: draft.mode,
          title: draft.title,
          date: draft.date,
          startTime: draft.startTime,
          endTime: draft.endTime,
          whyCategory: draft.whyCategory,
          customColor: draft.customColor,
          notes: draft.notes,
          alertOffsetMinutes: draft.alertOffsetMinutes,
          targetBlockId: blockId,
        };
      },

      addReminder: (remInput) => {
        const id = makeId('rem');
        const nowIso = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          reminders: [...prev.reminders, { ...remInput, id, updatedAt: nowIso }].sort((a, b) =>
            a.time.localeCompare(b.time)
          ),
        }));
        return id;
      },

      updateReminder: (reminderId, patch) => {
        const nowIso = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          reminders: prev.reminders
            .map((r) => (r.id === reminderId ? { ...r, ...patch, updatedAt: nowIso } : r))
            .sort((a, b) => a.time.localeCompare(b.time)),
        }));
      },

      toggleReminder: (reminderId: string) => {
        const nowIso = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          reminders: prev.reminders.map((r) =>
            r.id === reminderId ? { ...r, completed: !r.completed, updatedAt: nowIso } : r
          ),
        }));
      },

      deleteReminder: (reminderId: string) => {
        if (tombstonesRef.current) {
          tombstonesRef.current = {
            ...tombstonesRef.current,
            reminders: { ...tombstonesRef.current.reminders, [reminderId]: Date.now() },
          };
          saveLocalTombstones(tombstonesRef.current);
        }
        setState((prev) => ({
          ...prev,
          reminders: prev.reminders.filter((r) => r.id !== reminderId),
        }));
      },

      setSchoolDayDelay: (date, delayMode) => {
        const entry = OHCHS_BY_DATE.get(date);
        if (!entry || entry.isNoSchool || !entry.dayCode) return;
        ohchsDelaysRef.current = {
          ...ohchsDelaysRef.current,
          [date]: { mode: delayMode, updatedAtMs: Date.now() },
        };
        const liveToday = getTodayISO();
        setState((prev) => {
          const keptBlocks = prev.blocks.filter(
            (b) => !(b.date === date && b.id.startsWith('ohchs-'))
          );
          const keptRems = prev.reminders.filter((r) => r.id !== `ohchs-rot-${date}`);
          const nextDayBlocks = buildOhchsBlocksForEntry(entry, liveToday, delayMode);
          const nextPin = buildOhchsPinForEntry(entry, liveToday, delayMode);
          return {
            ...prev,
            blocks: sortBlocks([...keptBlocks, ...nextDayBlocks]),
            reminders: [...keptRems, nextPin].sort((a, b) => a.time.localeCompare(b.time)),
          };
        });
        showToast(
          delayMode === 'regular'
            ? `Restored regular ${entry.dayCode} bell schedule`
            : delayMode === 'late-90'
            ? `Switched ${formatShortDate(date)} to 90-Min Delay`
            : `Switched ${formatShortDate(date)} to 2-Hr Delay`
        );
      },

      addIdea: ({ project, title, startingStep, isBottleneck = false, estimatedMinutes = 45 }) => {
        const id = makeId('idea');
        const cleanProject = project.trim() || 'Personal';
        const cleanTitle = title.trim();
        const cleanStep = startingStep.trim();
        if (tombstonesRef.current && tombstonesRef.current.projects[cleanProject]) {
          const nextProjTomb = { ...tombstonesRef.current.projects };
          delete nextProjTomb[cleanProject];
          tombstonesRef.current = { ...tombstonesRef.current, projects: nextProjTomb };
          saveLocalTombstones(tombstonesRef.current);
        }
        setState((prev) => {
          const existingCount = prev.ideas.filter(
            (i) => i.project === cleanProject && i.status !== 'completed'
          ).length;
          const nextIdea: IdeaItem = {
            id,
            project: cleanProject,
            priorityRank: existingCount + 1,
            title: cleanTitle,
            startingStep: cleanStep,
            notes: cleanStep,
            isBottleneck,
            status: 'active',
            estimatedMinutes,
            createdAt: prev.selectedDate,
            updatedAt: new Date().toISOString(),
          };
          const projects = prev.projects.includes(cleanProject)
            ? prev.projects
            : [...prev.projects, cleanProject];
          return {
            ...prev,
            projects,
            ideas: normalizeProjectRanks([nextIdea, ...prev.ideas], cleanProject),
          };
        });
        if (cleanTitle) {
          showToast(`Added "${cleanTitle}" to ${cleanProject}`);
        }
        return id;
      },

      updateIdea: (ideaId, patch) => {
        const nowIso = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          ideas: prev.ideas.map((i) =>
            i.id === ideaId ? { ...i, ...patch, updatedAt: nowIso } : i
          ),
        }));
      },

      archiveIdea: (ideaId, outcome = 'completed', earnedAmountDollars) => {
        let archivedTitle = '';
        const cleanEarned =
          typeof earnedAmountDollars === 'number' && Number.isFinite(earnedAmountDollars)
            ? Math.max(0, Math.round(earnedAmountDollars * 100) / 100)
            : undefined;
        setState((prev) => {
          const target = prev.ideas.find((i) => i.id === ideaId);
          if (!target || target.status === 'completed') return prev;
          archivedTitle = target.title.trim() || 'Untitled Note';
          const nowIso = new Date().toISOString();
          const updatedIdeas = prev.ideas.map((i) =>
            i.id === ideaId
              ? {
                  ...i,
                  status: 'completed' as const,
                  archivedAt: nowIso,
                  archivedOutcome: outcome,
                  ...(cleanEarned !== undefined ? { earnedAmountDollars: cleanEarned } : {}),
                  updatedAt: nowIso,
                }
              : i
          );
          const cleanedBlocks = prev.blocks.map((b) =>
            b.assignedIdeaId === ideaId && !b.completed
              ? {
                  ...b,
                  title: 'Empty Zone — Open Focus Slot',
                  assignedIdeaId: undefined,
                  startingStepHint: undefined,
                }
              : b
          );
          return {
            ...prev,
            blocks: cleanedBlocks,
            ideas: normalizeProjectRanks(updatedIdeas, target.project),
          };
        });
        if (archivedTitle) {
          const earnedSuffix =
            cleanEarned !== undefined
              ? ` · $${cleanEarned % 1 === 0 ? cleanEarned.toFixed(0) : cleanEarned.toFixed(2)}`
              : '';
          showToast(
            outcome === 'completed'
              ? `Archived "${archivedTitle}" as Complete${earnedSuffix}`
              : `Archived "${archivedTitle}" as Not Complete${earnedSuffix}`
          );
        }
      },

      unarchiveIdea: (ideaId) => {
        let restoredProject = '';
        setState((prev) => {
          const target = prev.ideas.find((i) => i.id === ideaId);
          if (!target || target.status !== 'completed') return prev;
          const folder = target.project.trim() || prev.projects[0] || 'Personal';
          restoredProject = folder;
          const existingActiveCount = prev.ideas.filter(
            (i) => i.project === folder && i.status !== 'completed'
          ).length;
          const projects = prev.projects.includes(folder)
            ? prev.projects
            : [...prev.projects, folder];
          const updatedIdeas = prev.ideas.map((i) =>
            i.id === ideaId
              ? {
                  ...i,
                  project: folder,
                  status: 'active' as const,
                  priorityRank: existingActiveCount + 1,
                  archivedAt: undefined,
                  archivedOutcome: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : i
          );
          return {
            ...prev,
            projects,
            ideas: normalizeProjectRanks(updatedIdeas, folder),
          };
        });
        if (restoredProject) {
          showToast(`Restored to ${restoredProject}`);
        }
      },

      deleteIdea: (ideaId) => {
        if (tombstonesRef.current) {
          tombstonesRef.current = {
            ...tombstonesRef.current,
            ideas: { ...tombstonesRef.current.ideas, [ideaId]: Date.now() },
          };
          saveLocalTombstones(tombstonesRef.current);
        }
        setState((prev) => {
          const target = prev.ideas.find((i) => i.id === ideaId);
          const remaining = prev.ideas.filter((i) => i.id !== ideaId);
          const cleanedBlocks = prev.blocks.map((b) =>
            b.assignedIdeaId === ideaId
              ? {
                  ...b,
                  title: 'Empty Zone — Open Focus Slot',
                  assignedIdeaId: undefined,
                  startingStepHint: undefined,
                }
              : b
          );
          return {
            ...prev,
            blocks: cleanedBlocks,
            ideas: target ? normalizeProjectRanks(remaining, target.project) : remaining,
          };
        });
      },

      moveIdeaRank: (ideaId, direction) => {
        const nowIso = new Date().toISOString();
        setState((prev) => {
          const target = prev.ideas.find((i) => i.id === ideaId);
          if (!target) return prev;
          const siblings = prev.ideas
            .filter((i) => i.project === target.project && i.status !== 'completed')
            .sort((a, b) => a.priorityRank - b.priorityRank);
          const idx = siblings.findIndex((s) => s.id === ideaId);
          if (idx === -1) return prev;
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= siblings.length) return prev;

          const reordered = [...siblings];
          const [moved] = reordered.splice(idx, 1);
          reordered.splice(swapIdx, 0, moved);

          const rankLookup = new Map<string, number>();
          reordered.forEach((item, i) => rankLookup.set(item.id, i + 1));

          return {
            ...prev,
            ideas: prev.ideas.map((item) =>
              rankLookup.has(item.id)
                ? { ...item, priorityRank: rankLookup.get(item.id)!, updatedAt: nowIso }
                : item
            ),
          };
        });
      },

      setIdeaRank: (ideaId, newRank) => {
        const nowIso = new Date().toISOString();
        setState((prev) => {
          const target = prev.ideas.find((i) => i.id === ideaId);
          if (!target) return prev;
          const siblings = prev.ideas
            .filter((i) => i.project === target.project && i.status !== 'completed')
            .sort((a, b) => a.priorityRank - b.priorityRank);
          const currentIdx = siblings.findIndex((s) => s.id === ideaId);
          if (currentIdx === -1) return prev;
          const boundedIdx = Math.max(0, Math.min(siblings.length - 1, newRank - 1));
          const reordered = [...siblings];
          const [moved] = reordered.splice(currentIdx, 1);
          reordered.splice(boundedIdx, 0, moved);

          const rankLookup = new Map<string, number>();
          reordered.forEach((item, idx) => rankLookup.set(item.id, idx + 1));

          return {
            ...prev,
            ideas: prev.ideas.map((item) =>
              rankLookup.has(item.id)
                ? { ...item, priorityRank: rankLookup.get(item.id)!, updatedAt: nowIso }
                : item
            ),
          };
        });
      },

      toggleWaitingOn: (ideaId, waitingReason) => {
        const nowIso = new Date().toISOString();
        setState((prev) => {
          const target = prev.ideas.find((i) => i.id === ideaId);
          if (!target) return prev;
          const nextStatus: IdeaItem['status'] =
            target.status === 'waiting-on' ? 'active' : 'waiting-on';

          const nextIdeas = prev.ideas.map((i) =>
            i.id === ideaId
              ? {
                  ...i,
                  status: nextStatus,
                  updatedAt: nowIso,
                  waitingReason:
                    nextStatus === 'waiting-on'
                      ? waitingReason ||
                        i.waitingReason ||
                        `Externally blocked — resurfaces in ${i.project} Checkup`
                      : undefined,
                }
              : i
          );

          // Ensure Waiting-On items never sit inside daily uncompleted Empty Zones
          const nextBlocks =
            nextStatus === 'waiting-on'
              ? prev.blocks.map((b) =>
                  b.assignedIdeaId === ideaId && !b.completed
                    ? {
                        ...b,
                        title: 'Empty Zone — Open Focus Slot',
                        assignedIdeaId: undefined,
                        startingStepHint: undefined,
                      }
                    : b
                )
              : prev.blocks;

          return {
            ...prev,
            ideas: normalizeProjectRanks(nextIdeas, target.project),
            blocks: nextBlocks,
            toastMessage:
              nextStatus === 'waiting-on'
                ? `"${target.title}" moved to Waiting-On (hidden from Empty Zones)`
                : `"${target.title}" restored to Active Queue`,
          };
        });
      },

      toggleIdeaBottleneck: (ideaId) => {
        const nowIso = new Date().toISOString();
        setState((prev) => ({
          ...prev,
          ideas: prev.ideas.map((i) =>
            i.id === ideaId ? { ...i, isBottleneck: !i.isBottleneck, updatedAt: nowIso } : i
          ),
        }));
      },

      addProject: (projectName) => {
        const clean = projectName.trim();
        if (!clean) return;
        if (tombstonesRef.current && tombstonesRef.current.projects[clean]) {
          const nextProjTomb = { ...tombstonesRef.current.projects };
          delete nextProjTomb[clean];
          tombstonesRef.current = { ...tombstonesRef.current, projects: nextProjTomb };
          saveLocalTombstones(tombstonesRef.current);
        }
        setState((prev) => ({
          ...prev,
          projects: prev.projects.includes(clean)
            ? prev.projects
            : [...prev.projects, clean],
        }));
      },

      toggleCheckupBenchmark: (checkupId, benchmarkId) => {
        setState((prev) => ({
          ...prev,
          checkups: prev.checkups.map((chk) =>
            chk.id !== checkupId
              ? chk
              : {
                  ...chk,
                  benchmarks: chk.benchmarks.map((bm) =>
                    bm.id === benchmarkId ? { ...bm, checked: !bm.checked } : bm
                  ),
                }
          ),
        }));
      },

      addCheckupBenchmark: (checkupId, label) => {
        const clean = label.trim();
        if (!clean) return;
        setState((prev) => ({
          ...prev,
          checkups: prev.checkups.map((chk) =>
            chk.id !== checkupId
              ? chk
              : {
                  ...chk,
                  benchmarks: [
                    ...chk.benchmarks,
                    { id: makeId('bm'), label: clean, checked: false },
                  ],
                }
          ),
        }));
      },

      updateCheckupDeliverables: (checkupId, deliverables) => {
        setState((prev) => ({
          ...prev,
          checkups: prev.checkups.map((chk) =>
            chk.id === checkupId ? { ...chk, nextWeekDeliverables: deliverables } : chk
          ),
        }));
      },

      completeProjectCheckup: (checkupId, promoteDeliverablesToIdeas = false) => {
        setState((prev) => {
          const target = prev.checkups.find((c) => c.id === checkupId);
          if (!target) return prev;

          let nextIdeas = prev.ideas;
          if (promoteDeliverablesToIdeas && target.nextWeekDeliverables.length > 0) {
            const existingTitles = new Set(
              prev.ideas
                .filter((i) => i.project === target.project)
                .map((i) => i.title.toLowerCase())
            );
            const additions: IdeaItem[] = [];
            target.nextWeekDeliverables.forEach((deliv, idx) => {
              if (deliv.trim() && !existingTitles.has(deliv.trim().toLowerCase())) {
                additions.push({
                  id: makeId('idea'),
                  project: target.project,
                  priorityRank: 99 + idx,
                  title: deliv.trim(),
                  startingStep: `Execute first 25m deliverable block for ${target.project}`,
                  isBottleneck: false,
                  status: 'active',
                  estimatedMinutes: 45,
                  createdAt: prev.selectedDate,
                });
              }
            });
            if (additions.length > 0) {
              nextIdeas = [...prev.ideas, ...additions];
            }
          }
          nextIdeas = normalizeProjectRanks(nextIdeas, target.project);

          const updatedCheckups = prev.checkups.map((chk) =>
            chk.id !== checkupId
              ? chk
              : {
                  ...chk,
                  lastReviewedDate: prev.selectedDate,
                  nextReviewDate: addDaysISO(prev.selectedDate, 7),
                  completedCount: chk.completedCount + 1,
                  benchmarks: chk.benchmarks.map((bm) => ({ ...bm, checked: true })),
                }
          );

          return {
            ...prev,
            ideas: nextIdeas,
            checkups: updatedCheckups,
            toastMessage: `${target.project} Checkup locked — next review in 7 days`,
          };
        });
      },

      schedulePacedGoal: ({
        title,
        project,
        linkedIdeaId,
        totalEstimatedHours,
        targetDays,
        dailyMinutesAllocated,
      }) => {
        const goalId = makeId('goal');
        setState((prev) => {
          const newGoal = {
            id: goalId,
            title: title.trim(),
            project,
            linkedIdeaId,
            totalEstimatedHours,
            targetDays: Math.max(2, targetDays),
            daysElapsed: 1,
            actualProgressPct: 0,
            dailyMinutesAllocated,
            confidenceLevel: 'on-track' as ConfidenceLevel,
            startDate: prev.selectedDate,
            status: 'active' as const,
          };

          // Allocate across up to 3 upcoming days immediately
          const daysToSeed = Math.min(3, newGoal.targetDays);
          const createdBlocks: CalendarBlock[] = Array.from(
            { length: daysToSeed },
            (_, idx) => {
              const date = addDaysISO(prev.selectedDate, idx);
              const startTime = '15:00';
              const endTime = addMinutesToTime(startTime, dailyMinutesAllocated);
              return {
                id: makeId('blk'),
                date,
                startTime,
                endTime,
                title: `Paced Goal — ${newGoal.title} (Day ${idx + 1})`,
                kind: 'goal-session',
                completed: false,
                assignedGoalId: goalId,
                startingStepHint: `${dailyMinutesAllocated}m multi-day goal block`,
              };
            }
          );

          return {
            ...prev,
            pacedGoals: [newGoal, ...prev.pacedGoals],
            blocks: sortBlocks([...prev.blocks, ...createdBlocks]),
            toastMessage: `Scheduled "${newGoal.title}" across ${newGoal.targetDays} days`,
          };
        });
        return goalId;
      },

      submitConfidenceCheckIn: ({ goalId, actualProgressPct, confidence, note }) => {
        let createdLog: PacingUpdateLog | null = null;

        setState((prev) => {
          const goal = prev.pacedGoals.find((g) => g.id === goalId);
          if (!goal) return prev;

          const expectedPct = Math.min(
            100,
            Math.round((goal.daysElapsed / Math.max(1, goal.targetDays)) * 100)
          );
          const clampedActual = Math.max(0, Math.min(100, Math.round(actualProgressPct)));

          let deltaMinutes = 0;
          let nextBlocks = [...prev.blocks];
          let blocksAdjustedCount = 0;
          let summary = '';

          if (confidence === 'behind') {
            deltaMinutes = 30;
            // Extend existing future blocks for this goal AND add 1 booster block
            nextBlocks = nextBlocks.map((b) => {
              if (b.assignedGoalId === goalId && !b.completed && b.date >= prev.selectedDate) {
                blocksAdjustedCount += 1;
                return {
                  ...b,
                  endTime: addMinutesToTime(b.endTime, 30),
                  startingStepHint: 'Extended +30m via Confidence Recalibration',
                };
              }
              return b;
            });

            const boosterDate = addDaysISO(prev.selectedDate, 1);
            nextBlocks.push({
              id: makeId('blk'),
              date: boosterDate,
              startTime: '16:00',
              endTime: '17:00',
              title: `Pace Catch-Up — ${goal.title}`,
              kind: 'goal-session',
              completed: false,
              assignedGoalId: goalId,
              startingStepHint: 'Added automatically to close pacing gap (Streak Protected)',
            });
            blocksAdjustedCount += 1;
            summary = `Behind ${expectedPct}% benchmark (at ${clampedActual}%). Added +30m/day & scheduled catch-up block on ${formatShortDate(boosterDate)}.`;
          } else if (confidence === 'ahead') {
            deltaMinutes = -20;
            // Free the furthest future uncompleted goal-session block back into an open Empty Zone
            const futureGoalBlocks = sortBlocks(nextBlocks).filter(
              (b) => b.assignedGoalId === goalId && !b.completed && b.date >= prev.selectedDate
            );
            const blockToFree = futureGoalBlocks[futureGoalBlocks.length - 1];
            nextBlocks = nextBlocks.map((b) => {
              if (blockToFree && b.id === blockToFree.id) {
                blocksAdjustedCount += 1;
                return {
                  ...b,
                  kind: 'empty-zone',
                  title: 'Empty Zone — Reclaimed Focus Slot',
                  assignedGoalId: undefined,
                  startingStepHint: `Reclaimed from ahead-of-pace ${goal.project} goal`,
                };
              }
              if (b.assignedGoalId === goalId && !b.completed) {
                blocksAdjustedCount += 1;
                return {
                  ...b,
                  endTime: addMinutesToTime(b.endTime, -15),
                };
              }
              return b;
            });
            summary = `Ahead of ${expectedPct}% benchmark (at ${clampedActual}%). Reduced future block load (-20m/day) & reclaimed open Empty Zone.`;
          } else {
            summary = `On track at ${clampedActual}% vs ${expectedPct}% expected. Kept ${goal.dailyMinutesAllocated}m/day schedule steady.`;
          }

          const newDailyMinutes = Math.max(
            25,
            Math.min(180, goal.dailyMinutesAllocated + deltaMinutes)
          );

          createdLog = {
            id: makeId('plog'),
            goalId: goal.id,
            goalTitle: goal.title,
            date: prev.selectedDate,
            daysElapsed: goal.daysElapsed,
            expectedPct,
            actualPct: clampedActual,
            confidence,
            deltaMinutesPerDay: deltaMinutes,
            blocksAdjustedCount,
            summary,
          };

          return {
            ...prev,
            blocks: sortBlocks(nextBlocks),
            pacedGoals: prev.pacedGoals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    actualProgressPct: clampedActual,
                    confidenceLevel: confidence,
                    dailyMinutesAllocated: newDailyMinutes,
                    lastCheckInNote: note?.trim() || g.lastCheckInNote,
                    status: clampedActual >= 100 ? 'completed' : 'active',
                  }
                : g
            ),
            pacingLogs: [createdLog, ...prev.pacingLogs],
            toastMessage:
              confidence === 'behind'
                ? 'Added catch-up time on Schedule (Protected Streak intact)'
                : confidence === 'ahead'
                ? 'Trimmed excess future blocks & reclaimed open Empty Zone'
                : 'Confidence check-in logged — pace steady',
          };
        });

        return createdLog;
      },

      advanceGoalDay: (goalId: string) => {
        setState((prev) => ({
          ...prev,
          pacedGoals: prev.pacedGoals.map((g) =>
            g.id === goalId
              ? { ...g, daysElapsed: Math.min(g.targetDays, g.daysElapsed + 1) }
              : g
          ),
        }));
      },

      setHourlyRateDollars: (rate: number) => {
        metaUpdatedAtRef.current = Date.now();
        const valid = Number.isFinite(rate) ? Math.max(0, rate) : 0;
        setState((prev) => ({ ...prev, hourlyRateDollars: valid }));
      },

      addOffloadedTask: (taskInput) => {
        setState((prev) => ({
          ...prev,
          offloadedTasks: [
            {
              ...taskInput,
              id: makeId('off'),
              dateLogged: prev.selectedDate,
            },
            ...prev.offloadedTasks,
          ],
        }));
        showToast(`Logged offloaded task "${taskInput.title}"`);
      },

      deleteOffloadedTask: (taskId: string) => {
        if (tombstonesRef.current) {
          tombstonesRef.current = {
            ...tombstonesRef.current,
            offloadedTasks: { ...tombstonesRef.current.offloadedTasks, [taskId]: Date.now() },
          };
          saveLocalTombstones(tombstonesRef.current);
        }
        setState((prev) => ({
          ...prev,
          offloadedTasks: prev.offloadedTasks.filter((t) => t.id !== taskId),
        }));
      },

      setDraftDailyNote: (note: string) => {
        metaUpdatedAtRef.current = Date.now();
        setState((prev) => ({ ...prev, draftDailyNote: note }));
      },

      setDraftReflectionPrompt: (prompt: string) => {
        metaUpdatedAtRef.current = Date.now();
        setState((prev) => ({ ...prev, draftReflectionPrompt: prompt }));
      },

      setDraftReflectionText: (text: string) => {
        metaUpdatedAtRef.current = Date.now();
        setState((prev) => ({ ...prev, draftReflectionText: text }));
      },

      completeDailyReflection: () => {
        let result = { streakLocked: false, currentDays: state.streak.currentDays };

        setState((prev) => {
          const dayBaselines = prev.blocks.filter(
            (b) => b.date === prev.selectedDate && b.kind === 'baseline'
          );
          const allBaselinesDone =
            dayBaselines.length === 0 || dayBaselines.every((b) => b.completed);
          const hasReflection = prev.draftReflectionText.trim().length > 0;

          const qualifiesForProtectedStreak = allBaselinesDone && hasReflection;
          const alreadyLockedForDay = prev.streak.completedDates.includes(
            prev.selectedDate
          );

          const nextCurrentDays =
            qualifiesForProtectedStreak && !alreadyLockedForDay
              ? prev.streak.currentDays + 1
              : prev.streak.currentDays;

          const nextBestDays = Math.max(prev.streak.bestDays, nextCurrentDays);
          const nextCompletedDates =
            qualifiesForProtectedStreak && !alreadyLockedForDay
              ? [...prev.streak.completedDates, prev.selectedDate]
              : prev.streak.completedDates;

          result = {
            streakLocked: qualifiesForProtectedStreak,
            currentDays: nextCurrentDays,
          };

          const newEntry = {
            id: makeId('ref'),
            date: prev.selectedDate,
            promptQuestion: prev.draftReflectionPrompt,
            reflectionResponse: prev.draftReflectionText.trim(),
            dailyNote: prev.draftDailyNote.trim(),
            completedBaselineIds: dayBaselines.filter((b) => b.completed).map((b) => b.id),
            baselineTotalCount: dayBaselines.length,
            streakAwarded: qualifiesForProtectedStreak,
            createdAt: new Date().toISOString(),
          };

          const updatedReflections = [
            newEntry,
            ...prev.reflections.filter((r) => r.date !== prev.selectedDate),
          ];

          const updatedBlocks = prev.blocks.map((b) =>
            b.date === prev.selectedDate && b.kind === 'reflection'
              ? { ...b, completed: true }
              : b
          );

          return {
            ...prev,
            blocks: updatedBlocks,
            reflections: updatedReflections,
            streak: {
              ...prev.streak,
              currentDays: nextCurrentDays,
              bestDays: nextBestDays,
              lastLockedDate: qualifiesForProtectedStreak
                ? prev.selectedDate
                : prev.streak.lastLockedDate,
              completedDates: nextCompletedDates,
            },
            toastMessage: qualifiesForProtectedStreak
              ? `Protected Streak locked at ${nextCurrentDays} days!`
              : 'Reflection saved — check off remaining Baseline obligations to lock streak',
          };
        });

        return result;
      },

      generateGeminiWeeklyExport: () => {
        const recentReflections = state.reflections.slice(0, 7);
        const recentPacing = state.pacingLogs.slice(0, 5);
        const activeBottlenecks = state.ideas.filter((i) => i.isBottleneck);

        const lines: string[] = [
          '# Intuition Weekly Operations & Self-Reflection Brief (for Gemini)',
          `Generated: ${state.selectedDate} | Protected Streak: ${state.streak.currentDays} days (Best: ${state.streak.bestDays}d)`,
          '',
          '## 1. Core Why Anchors',
          ...Object.entries(state.whyStatements).map(
            ([cat, stmt]) => `- **${cat}**: ${stmt}`
          ),
          '',
          '## 2. Guided Reflections & Daily Notes',
          ...(recentReflections.length > 0
            ? recentReflections.flatMap((r) => [
                `### ${r.date} ${r.streakAwarded ? '(Protected Streak Locked)' : '(Draft)'}`,
                `- **Prompt**: ${r.promptQuestion}`,
                `- **Reflection**: ${r.reflectionResponse}`,
                `- **Daily Note**: ${r.dailyNote || 'None'}`,
                `- **Baseline Completion**: ${r.completedBaselineIds.length}/${r.baselineTotalCount}`,
                '',
              ])
            : [
                `- **Current Draft (${state.selectedDate})**: ${state.draftReflectionText}`,
                `- **Daily Note**: ${state.draftDailyNote}`,
                '',
              ]),
          '## 3. Multi-Day Goal Pacing & Confidence Updates',
          ...state.pacedGoals.map((g) => {
            const expected = Math.round((g.daysElapsed / Math.max(1, g.targetDays)) * 100);
            return `- **${g.title} (${g.project})**: Day ${g.daysElapsed}/${g.targetDays} · Expected ${expected}%, Actual ${g.actualProgressPct}% · Confidence: ${g.confidenceLevel.toUpperCase()} (${g.dailyMinutesAllocated}m/day)`;
          }),
          ...(recentPacing.length > 0
            ? [
                '',
                '### Recent Recalibrations:',
                ...recentPacing.map((p) => `- [${p.date}] ${p.goalTitle}: ${p.summary}`),
              ]
            : []),
          '',
          '## 4. Flagged Bottlenecks & Waiting-On Status',
          ...activeBottlenecks.map(
            (b) =>
              `- **[${b.project} #${b.priorityRank}] ${b.title}** (${b.status}): Starting step -> "${b.startingStep}"${
                b.waitingReason ? ` | Waiting Note: ${b.waitingReason}` : ''
              }`
          ),
          '',
          '## 5. Gemini Coaching Request',
          'Based on my reflections, baseline consistency, and pacing adjustments above:',
          '1. Spot any hidden friction pattern between my Baseline Responsibilities and Empty Zones.',
          '2. Suggest sharper 15-minute starting steps for my active bottlenecks.',
          '3. Recommend one adjustment for next week without overloading daily focus.',
        ];

        return lines.join('\n');
      },

      updateSiteConfig: (patch: Partial<SiteConfig>) => {
        metaUpdatedAtRef.current = Date.now();
        setState((prev) => {
          const nextDomain = patch.targetDomain ?? prev.siteConfig.targetDomain;
          let derivedLabel = patch.domainLabel ?? prev.siteConfig.domainLabel;
          if (patch.targetDomain !== undefined && patch.domainLabel === undefined) {
            derivedLabel = nextDomain
              .trim()
              .replace(/^https?:\/\//i, '')
              .replace(/\/.*$/, '');
          }
          return {
            ...prev,
            siteConfig: {
              ...prev.siteConfig,
              ...patch,
              domainLabel: derivedLabel || 'airbnb710.com',
            },
          };
        });
      },

      applySiteTemplate: (templateId, mode = 'replace') => {
        setState((prev) => {
          const source =
            templateId === 'airbnb710-str' ? AIRBNB710_STR_PRESET : INITIAL_OPS_STATE;

          if (mode === 'merge') {
            const mergedProjects = Array.from(
              new Set([...source.projects, ...prev.projects])
            );
            const existingIdeaIds = new Set(prev.ideas.map((i) => i.id));
            const mergedIdeas = normalizeAllProjectsRanks(
              [
                ...source.ideas.filter((i) => !existingIdeaIds.has(i.id)),
                ...prev.ideas,
              ],
              mergedProjects
            );
            const existingCheckupIds = new Set(prev.checkups.map((c) => c.id));
            const mergedCheckups = [
              ...source.checkups.filter((c) => !existingCheckupIds.has(c.id)),
              ...prev.checkups,
            ];

            return {
              ...prev,
              siteConfig: {
                ...prev.siteConfig,
                ...source.siteConfig,
                accentTheme: prev.siteConfig.accentTheme,
              },
              hourlyRateDollars: source.hourlyRateDollars,
              projects: mergedProjects,
              ideas: mergedIdeas,
              checkups: mergedCheckups,
              toastMessage:
                templateId === 'airbnb710-str'
                  ? 'Merged airbnb710.com hospitality projects & checkups into workspace'
                  : 'Merged OHCR & CBS operations template into workspace',
            };
          }

          return {
            ...prev,
            selectedDate: getTodayISO(),
            siteConfig: {
              ...source.siteConfig,
              accentTheme: prev.siteConfig.accentTheme,
            },
            hourlyRateDollars: source.hourlyRateDollars,
            whyStatements: { ...source.whyStatements },
            projects: [...source.projects],
            blocks: sortBlocks([...source.blocks]),
            reminders: [...source.reminders],
            ideas: normalizeAllProjectsRanks([...source.ideas], source.projects),
            checkups: source.checkups.map((c) => ({
              ...c,
              benchmarks: c.benchmarks.map((b) => ({ ...b })),
              nextWeekDeliverables: [...c.nextWeekDeliverables],
            })),
            pacedGoals: source.pacedGoals.map((g) => ({ ...g })),
            offloadedTasks: source.offloadedTasks.map((o) => ({ ...o })),
            toastMessage:
              templateId === 'airbnb710-str'
                ? 'Configured workspace for airbnb710.com (Short-Term Rental Ops)'
                : 'Restored OHCR + CBS + Personal workspace preset',
          };
        });
      },

      removeProject: (projectName: string) => {
        if (tombstonesRef.current) {
          tombstonesRef.current = {
            ...tombstonesRef.current,
            projects: { ...tombstonesRef.current.projects, [projectName]: Date.now() },
          };
          saveLocalTombstones(tombstonesRef.current);
        }
        setState((prev) => {
          if (prev.projects.length <= 1) return prev;
          return {
            ...prev,
            projects: prev.projects.filter((p) => p !== projectName),
          };
        });
      },

      exportSiteConfigJson: () => {
        const payload = {
          version: '1.1.0',
          exportedAt: new Date().toISOString(),
          siteConfig: state.siteConfig,
          hourlyRateDollars: state.hourlyRateDollars,
          whyStatements: state.whyStatements,
          projects: state.projects,
          checkups: state.checkups,
          ideas: state.ideas,
          pacedGoals: state.pacedGoals,
          offloadedTasks: state.offloadedTasks,
        };
        return JSON.stringify(payload, null, 2);
      },

      importSiteConfigJson: (jsonText: string) => {
        try {
          const parsed = JSON.parse(jsonText) as Partial<OpsState>;
          if (!parsed || typeof parsed !== 'object') return false;
          metaUpdatedAtRef.current = Date.now();
          setState((prev) => {
            const nextProjects = Array.isArray(parsed.projects)
              ? parsed.projects
              : prev.projects;
            const nextIdeas = Array.isArray(parsed.ideas)
              ? normalizeAllProjectsRanks(parsed.ideas, nextProjects)
              : prev.ideas;
            return {
              ...prev,
              siteConfig: parsed.siteConfig
                ? { ...prev.siteConfig, ...parsed.siteConfig }
                : prev.siteConfig,
              hourlyRateDollars:
                typeof parsed.hourlyRateDollars === 'number'
                  ? parsed.hourlyRateDollars
                  : prev.hourlyRateDollars,
              whyStatements: parsed.whyStatements
                ? { ...prev.whyStatements, ...parsed.whyStatements }
                : prev.whyStatements,
              projects: nextProjects,
              checkups: Array.isArray(parsed.checkups) ? parsed.checkups : prev.checkups,
              ideas: nextIdeas,
              pacedGoals: Array.isArray(parsed.pacedGoals)
                ? parsed.pacedGoals
                : prev.pacedGoals,
              offloadedTasks: Array.isArray(parsed.offloadedTasks)
                ? parsed.offloadedTasks
                : prev.offloadedTasks,
              toastMessage: 'Imported site configuration cleanly',
            };
          });
          return true;
        } catch {
          showToast('Invalid JSON configuration payload');
          return false;
        }
      },

      syncNow: async () => {
        const ok = await performCloudSync('push');
        if (ok) {
          showToast('Synced across all devices');
        } else {
          showToast('Saved locally — will sync automatically when online');
        }
        return ok;
      },
    };
  }, [state, performCloudSync]);

  const value = useMemo(
    () => ({
      state,
      actions,
      reflectionPrompts: REFLECTION_PROMPTS,
      todayIso,
      syncStatus,
      lastSyncedAt,
    }),
    [state, actions, todayIso, syncStatus, lastSyncedAt]
  );

  return <OpsStoreContext.Provider value={value}>{children}</OpsStoreContext.Provider>;
};

export function useOpsStore(): OpsStoreValue {
  const ctx = useContext(OpsStoreContext);
  if (!ctx) {
    throw new Error('useOpsStore must be used inside <OpsStoreProvider>');
  }
  return ctx;
}
