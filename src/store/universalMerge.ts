import type {
  CalendarBlock,
  DailyReflectionEntry,
  IdeaItem,
  OffloadedTask,
  PacedGoal,
  PacingUpdateLog,
  ProjectCheckup,
  ProtectedStreakState,
  ReminderItem,
  SiteConfig,
  WhyCategory,
} from '../types/schema';

export interface SyncTombstones {
  ideas: Record<string, number>;
  projects: Record<string, number>;
  blocks: Record<string, number>;
  reminders: Record<string, number>;
  pacedGoals: Record<string, number>;
  offloadedTasks: Record<string, number>;
  checkups: Record<string, number>;
}

export interface SchoolDelayRecord {
  mode: 'regular' | 'late-90' | 'late-2hr';
  updatedAtMs: number;
}

export interface UniversalSyncPayload {
  schemaVersion: 1;
  updatedAtMs: number;
  metaUpdatedAtMs: number;
  siteConfig: SiteConfig;
  whyStatements: Record<WhyCategory, string>;
  hourlyRateDollars: number;
  projects: string[];
  ideas: IdeaItem[];
  /** All non-OHCHS user blocks PLUS any customized OHCHS blocks */
  userBlocks: CalendarBlock[];
  /** Snow-day / late-start bell schedule overrides keyed by YYYY-MM-DD */
  ohchsDelayedDates: Record<string, SchoolDelayRecord>;
  /** All non-OHCHS user reminders PLUS any customized OHCHS rotation pins */
  userReminders: ReminderItem[];
  checkups: ProjectCheckup[];
  pacedGoals: PacedGoal[];
  pacingLogs: PacingUpdateLog[];
  offloadedTasks: OffloadedTask[];
  reflections: DailyReflectionEntry[];
  draftDailyNote: string;
  draftReflectionPrompt: string;
  draftReflectionText: string;
  streak: ProtectedStreakState;
  tombstones: SyncTombstones;
}

export function createEmptyTombstones(): SyncTombstones {
  return {
    ideas: {},
    projects: {},
    blocks: {},
    reminders: {},
    pacedGoals: {},
    offloadedTasks: {},
    checkups: {},
  };
}

const STATIC_SEED_IDEA_TITLES: Record<string, string> = {
  'idea-ohcr-1': 'Written Plan',
  'idea-ohcr-2': 'Supplier Resource Bottleneck',
  'idea-ohcr-3': 'Listing Photos',
  'idea-ohcr-wait-1': 'Vendor Quote Approval',
  'idea-cbs-1': 'Q4 Crew Dispatch Optimization',
  'idea-cbs-2': 'Calibration Parts Bottleneck',
  'idea-pers-1': 'Outline Q4 Ops Memo',
  'idea-710-1': 'Hero Listing Photos & Direct Booking Gallery',
  'idea-710-2': 'Railway Domain Provisioning Bottleneck (airbnb710.com)',
  'idea-710-3': 'Digital House Manual & Wi-Fi QR Card',
  'idea-710-wait-1': 'Backup Par-3 Hotel Linen Restock',
  'idea-710-4': 'Holiday & Weekend Minimum-Stay Pricing Floor',
};

const STATIC_SEED_PROJECTS = new Set([
  'OHCR',
  'CBS',
  'Personal',
  'Airbnb710',
  'Turnovers & Guests',
  'Listing & Pricing',
]);

export function isUntouchedSeedIdea(idea: IdeaItem): boolean {
  const expectedSeedTitle = STATIC_SEED_IDEA_TITLES[idea.id];
  if (!expectedSeedTitle) return false;
  if (idea.updatedAt || idea.archivedAt) return false;
  if (idea.notes && idea.notes.trim().length > 0) return false;
  if (idea.blocksBelow !== undefined || idea.responsibilityType !== undefined) return false;
  if (idea.title !== expectedSeedTitle) return false;
  if (idea.status === 'completed') return false;
  return true;
}

function parseIsoMs(iso?: string): number {
  if (!iso) return 0;
  // Date-only strings like '2026-11-18' parse as midnight UTC
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function ideaTimestampMs(idea: IdeaItem): number {
  return Math.max(
    parseIsoMs(idea.updatedAt),
    parseIsoMs(idea.archivedAt),
    parseIsoMs(idea.createdAt)
  );
}

function ideaRichnessScore(idea: IdeaItem): number {
  let score = 0;
  if (idea.updatedAt) score += 1000;
  if (idea.archivedAt) score += 500;
  if (idea.notes) score += Math.min(400, idea.notes.length);
  if (idea.title) score += Math.min(100, idea.title.length);
  if (idea.blocksBelow) score += 50;
  if (idea.responsibilityType) score += 50;
  if (typeof idea.earnedAmountDollars === 'number') score += 60;
  return score;
}

function pickWinningIdea(a: IdeaItem, b: IdeaItem): IdeaItem {
  const aSeed = isUntouchedSeedIdea(a);
  const bSeed = isUntouchedSeedIdea(b);
  if (aSeed && !bSeed) return b;
  if (!aSeed && bSeed) return a;

  const ta = parseIsoMs(a.updatedAt) || parseIsoMs(a.archivedAt);
  const tb = parseIsoMs(b.updatedAt) || parseIsoMs(b.archivedAt);
  if (ta !== tb) {
    return tb > ta ? b : a;
  }

  return ideaRichnessScore(b) > ideaRichnessScore(a) ? b : a;
}

function mergeRecordMax(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined
): Record<string, number> {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (typeof v === 'number' && v > (out[k] ?? 0)) {
      out[k] = v;
    }
  }
  return out;
}

export function mergeTombstones(
  a: Partial<SyncTombstones> | undefined,
  b: Partial<SyncTombstones> | undefined
): SyncTombstones {
  return {
    ideas: mergeRecordMax(a?.ideas, b?.ideas),
    projects: mergeRecordMax(a?.projects, b?.projects),
    blocks: mergeRecordMax(a?.blocks, b?.blocks),
    reminders: mergeRecordMax(a?.reminders, b?.reminders),
    pacedGoals: mergeRecordMax(a?.pacedGoals, b?.pacedGoals),
    offloadedTasks: mergeRecordMax(a?.offloadedTasks, b?.offloadedTasks),
    checkups: mergeRecordMax(a?.checkups, b?.checkups),
  };
}

function normalizeRanksPerFolder(ideas: IdeaItem[], projects: string[]): IdeaItem[] {
  const allFolders = Array.from(new Set([...projects, ...ideas.map((i) => i.project)]));
  let working = [...ideas];

  for (const folder of allFolders) {
    const activeInFolder = working
      .filter((i) => i.project === folder && i.status !== 'completed')
      .sort((x, y) => {
        if (x.priorityRank !== y.priorityRank) return x.priorityRank - y.priorityRank;
        return ideaTimestampMs(y) - ideaTimestampMs(x);
      });

    const rankById = new Map<string, number>();
    activeInFolder.forEach((item, idx) => {
      rankById.set(item.id, idx + 1);
    });

    working = working.map((item) =>
      rankById.has(item.id) ? { ...item, priorityRank: rankById.get(item.id)! } : item
    );
  }

  return working;
}

export function isCustomizedOhchsBlock(block: CalendarBlock, todayIso?: string): boolean {
  if (!block.id.startsWith('ohchs-')) return false;
  const completedOverride = todayIso ? block.date >= todayIso && block.completed : false;
  return Boolean(
    block.updatedAt ||
      completedOverride ||
      block.customColor !== undefined ||
      (block.notes && block.notes.trim().length > 0) ||
      typeof block.alertOffsetMinutes === 'number'
  );
}

export function isCustomizedOhchsReminder(rem: ReminderItem, todayIso?: string): boolean {
  if (!rem.id.startsWith('ohchs-rot-')) return false;
  const completedOverride = todayIso ? rem.date >= todayIso && rem.completed : false;
  return Boolean(
    rem.updatedAt ||
      completedOverride ||
      rem.title.includes('(90m Delay)') ||
      rem.title.includes('(2hr Delay)')
  );
}

function mergeByIdLww<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  listA: T[],
  listB: T[],
  tombstones: Record<string, number>,
  tieBreaker?: (a: T, b: T) => T
): T[] {
  const map = new Map<string, T>();

  for (const item of listA ?? []) {
    if (!item?.id) continue;
    map.set(item.id, item);
  }

  for (const item of listB ?? []) {
    if (!item?.id) continue;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const ta = parseIsoMs(existing.updatedAt) || parseIsoMs(existing.createdAt);
      const tb = parseIsoMs(item.updatedAt) || parseIsoMs(item.createdAt);
      if (tb > ta) {
        map.set(item.id, item);
      } else if (tb === ta && tieBreaker) {
        map.set(item.id, tieBreaker(existing, item));
      }
    }
  }

  const result: T[] = [];
  for (const item of map.values()) {
    const delMs = tombstones[item.id] ?? 0;
    const itemMs = parseIsoMs(item.updatedAt) || parseIsoMs(item.createdAt);
    if (delMs > 0 && delMs >= itemMs) {
      continue;
    }
    result.push(item);
  }

  return result;
}

/**
 * Lossless CRDT-style workspace merge:
 * - Preserves 100% of user-created or user-edited notes (`ideas`), folders (`projects`),
 *   archived notes, custom colors, descriptions, alerts, and calendar commitments from BOTH sides.
 * - Never resurrects untouched default seed notes/folders onto a workspace that already has real user notes/folders.
 * - Honors explicit deletion tombstones (`tombstoneMs >= itemUpdatedAtMs`).
 */
export function mergeUniversalPayload(
  baseOrRemote: UniversalSyncPayload | null | undefined,
  incomingOrLocal: UniversalSyncPayload
): UniversalSyncPayload {
  if (!baseOrRemote) {
    return {
      ...incomingOrLocal,
      schemaVersion: 1,
      tombstones: mergeTombstones(undefined, incomingOrLocal.tombstones),
    };
  }

  const a = baseOrRemote;
  const b = incomingOrLocal;
  const tombstones = mergeTombstones(a.tombstones, b.tombstones);

  // Detect whether each side has real user-created/edited Ideas (ignoring automated sch-* schoolwork items)
  const aHasRealIdeas = (a.ideas ?? []).some(
    (i) => !isUntouchedSeedIdea(i) && !i.id.startsWith('sch-')
  );
  const bHasRealIdeas = (b.ideas ?? []).some(
    (i) => !isUntouchedSeedIdea(i) && !i.id.startsWith('sch-')
  );

  const aIdeaIds = new Set((a.ideas ?? []).map((i) => i.id));
  const bIdeaIds = new Set((b.ideas ?? []).map((i) => i.id));

  // Filter out untouched seed clutter ONLY when the other side has real user notes/folders and dropped that seed
  const filteredAIdeas = (a.ideas ?? []).filter((i) => {
    if (!isUntouchedSeedIdea(i)) return true;
    if (bHasRealIdeas && !aHasRealIdeas && !bIdeaIds.has(i.id)) return false;
    return true;
  });

  const filteredBIdeas = (b.ideas ?? []).filter((i) => {
    if (!isUntouchedSeedIdea(i)) return true;
    if (aHasRealIdeas && !bHasRealIdeas && !aIdeaIds.has(i.id)) return false;
    return true;
  });

  const ideaMap = new Map<string, IdeaItem>();
  for (const item of filteredAIdeas) {
    if (item?.id) ideaMap.set(item.id, item);
  }
  for (const item of filteredBIdeas) {
    if (!item?.id) continue;
    const prev = ideaMap.get(item.id);
    ideaMap.set(item.id, prev ? pickWinningIdea(prev, item) : item);
  }

  const mergedIdeasRaw: IdeaItem[] = [];
  for (const item of ideaMap.values()) {
    const delMs = tombstones.ideas[item.id] ?? 0;
    const modMs = parseIsoMs(item.updatedAt) || parseIsoMs(item.archivedAt);
    if (delMs > 0 && delMs >= modMs) {
      continue;
    }
    mergedIdeasRaw.push(item);
  }

  // Merge folders (`projects`) preserving custom folder order without losing any folder that holds ideas
  const primaryProjects =
    bHasRealIdeas && !aHasRealIdeas
      ? b.projects ?? []
      : aHasRealIdeas && !bHasRealIdeas
      ? a.projects ?? []
      : (b.updatedAtMs ?? 0) >= (a.updatedAtMs ?? 0)
      ? [...(b.projects ?? []), ...(a.projects ?? [])]
      : [...(a.projects ?? []), ...(b.projects ?? [])];

  const secondaryCustomProjects = [
    ...(a.projects ?? []).filter((p) => !STATIC_SEED_PROJECTS.has(p)),
    ...(b.projects ?? []).filter((p) => !STATIC_SEED_PROJECTS.has(p)),
  ];

  const ideasFolderSet = new Set(mergedIdeasRaw.map((i) => i.project));
  const rawProjectList = Array.from(
    new Set([...primaryProjects, ...secondaryCustomProjects, ...ideasFolderSet])
  ).filter(Boolean);

  const mergedProjects = rawProjectList.filter((proj) => {
    if (ideasFolderSet.has(proj)) return true; // Never orphan a note's folder!
    if ((tombstones.projects[proj] ?? 0) > 0) return false;
    return true;
  });

  const finalProjects = mergedProjects.length > 0 ? mergedProjects : ['Personal'];
  const mergedIdeas = normalizeRanksPerFolder(mergedIdeasRaw, finalProjects);

  // Merge calendar userBlocks & userReminders
  const mergedUserBlocks = mergeByIdLww(
    a.userBlocks ?? [],
    b.userBlocks ?? [],
    tombstones.blocks,
    (x, y) => {
      const score = (blk: CalendarBlock) =>
        (blk.customColor ? 10 : 0) +
        (blk.notes ? blk.notes.length : 0) +
        (typeof blk.alertOffsetMinutes === 'number' ? 10 : 0) +
        (blk.completed ? 5 : 0);
      return score(y) >= score(x) ? y : x;
    }
  );

  const mergedUserReminders = mergeByIdLww(
    a.userReminders ?? [],
    b.userReminders ?? [],
    tombstones.reminders,
    (x, y) => (y.completed && !x.completed ? y : x)
  );

  // Merge OHCHS snow-day / delay overrides per date
  const mergedDelays: Record<string, SchoolDelayRecord> = { ...(a.ohchsDelayedDates ?? {}) };
  for (const [iso, rec] of Object.entries(b.ohchsDelayedDates ?? {})) {
    const prev = mergedDelays[iso];
    if (!prev || rec.updatedAtMs >= prev.updatedAtMs) {
      mergedDelays[iso] = rec;
    }
  }

  // Merge other collections
  const mergedCheckups = mergeByIdLww(a.checkups ?? [], b.checkups ?? [], tombstones.checkups);
  const mergedGoals = mergeByIdLww(a.pacedGoals ?? [], b.pacedGoals ?? [], tombstones.pacedGoals);
  const mergedLogs = mergeByIdLww(a.pacingLogs ?? [], b.pacingLogs ?? [], {});
  const mergedOffloaded = mergeByIdLww(
    a.offloadedTasks ?? [],
    b.offloadedTasks ?? [],
    tombstones.offloadedTasks
  );
  const mergedReflections = mergeByIdLww(a.reflections ?? [], b.reflections ?? [], {}).sort(
    (x, y) => y.date.localeCompare(x.date)
  );

  // Merge streak
  const completedDates = Array.from(
    new Set([...(a.streak?.completedDates ?? []), ...(b.streak?.completedDates ?? [])])
  ).sort();
  const lastLockedDate =
    (b.streak?.lastLockedDate ?? '') > (a.streak?.lastLockedDate ?? '')
      ? b.streak.lastLockedDate
      : a.streak?.lastLockedDate ?? '';
  const mergedStreak: ProtectedStreakState = {
    currentDays: Math.max(a.streak?.currentDays ?? 0, b.streak?.currentDays ?? 0),
    bestDays: Math.max(a.streak?.bestDays ?? 0, b.streak?.bestDays ?? 0),
    lastLockedDate,
    completedDates,
    protectionRuleNote:
      b.streak?.protectionRuleNote || a.streak?.protectionRuleNote || '',
  };

  // Scalar workspace settings: newer metaUpdatedAtMs wins (preserving non-empty drafts if other is empty)
  const bMetaNewer = (b.metaUpdatedAtMs ?? 0) >= (a.metaUpdatedAtMs ?? 0);
  const primaryMeta = bMetaNewer ? b : a;
  const secondaryMeta = bMetaNewer ? a : b;

  return {
    schemaVersion: 1,
    updatedAtMs: Math.max(Date.now(), a.updatedAtMs ?? 0, b.updatedAtMs ?? 0),
    metaUpdatedAtMs: Math.max(a.metaUpdatedAtMs ?? 0, b.metaUpdatedAtMs ?? 0),
    siteConfig: primaryMeta.siteConfig ?? secondaryMeta.siteConfig,
    whyStatements: {
      ...secondaryMeta.whyStatements,
      ...primaryMeta.whyStatements,
    },
    hourlyRateDollars:
      primaryMeta.hourlyRateDollars ?? secondaryMeta.hourlyRateDollars ?? 85,
    projects: finalProjects,
    ideas: mergedIdeas,
    userBlocks: mergedUserBlocks,
    ohchsDelayedDates: mergedDelays,
    userReminders: mergedUserReminders,
    checkups: mergedCheckups,
    pacedGoals: mergedGoals,
    pacingLogs: mergedLogs,
    offloadedTasks: mergedOffloaded,
    reflections: mergedReflections,
    draftDailyNote: primaryMeta.draftDailyNote || secondaryMeta.draftDailyNote || '',
    draftReflectionPrompt:
      primaryMeta.draftReflectionPrompt || secondaryMeta.draftReflectionPrompt || '',
    draftReflectionText:
      primaryMeta.draftReflectionText || secondaryMeta.draftReflectionText || '',
    streak: mergedStreak,
    tombstones,
  };
}
