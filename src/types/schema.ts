export type RouteTab = 'schedule' | 'today' | 'ideas' | 'pacing' | 'config';

export type AccentThemeId = 'cobalt' | 'obsidian' | 'sage' | 'coral' | 'amber';

export type SiteTemplateId = 'airbnb710-str' | 'personal-cbs-ohcr' | 'custom';

export interface SiteConfig {
  targetDomain: string; // e.g., 'https://airbnb710.com'
  domainLabel: string; // e.g., 'airbnb710.com'
  workspaceName: string; // e.g., 'Airbnb 710 Operations'
  accentTheme: AccentThemeId;
  activeTemplate: SiteTemplateId;
  hostingProvider: 'Railway + Cloudflare' | 'Vercel' | 'Custom';
  pwaInstallEnabled: boolean;
}

export type ScheduleViewMode = 'day' | 'week';

export type WhyCategory = 'Family' | 'School' | 'Organization' | 'Health';

export type EventColorId =
  | 'crimson'
  | 'coral'
  | 'amber'
  | 'emerald'
  | 'teal'
  | 'sky'
  | 'cobalt'
  | 'violet'
  | 'pink'
  | 'slate';

export type BlockKind = 'baseline' | 'empty-zone' | 'goal-session' | 'reflection';

export interface CalendarBlock {
  id: string;
  date: string; // YYYY-MM-DD (e.g., '2026-11-18')
  startTime: string; // HH:MM 24h (e.g., '09:00')
  endTime: string; // HH:MM 24h (e.g., '10:30')
  title: string;
  kind: BlockKind;
  completed: boolean;
  /** Baseline obligations link directly to a core Why category & statement */
  whyCategory?: WhyCategory;
  whyStatement?: string;
  /** Optional custom event color override beyond the Why category */
  customColor?: EventColorId;
  /** Optional alert lead time in minutes before startTime (0 = at event start, >0 = earlier) */
  alertOffsetMinutes?: number;
  /** Empty Zones & Goal Sessions link to an active Idea or Multi-Day Paced Goal */
  assignedIdeaId?: string;
  assignedGoalId?: string;
  startingStepHint?: string;
  spilloverCount?: number;
  /** Event description / freeform details */
  notes?: string;
  /** Structured clickable links rendered as 1-tap pills (keeps Notes clean without raw URLs) */
  links?: Array<{ label: string; url: string }>;
  /** Internal schoolwork automation metadata (keeps Notes free of `[Meta: ...]` footers) */
  autoMeta?: {
    courseId: 'eco' | 'lit' | 'precalc' | 'physics';
    dueDate: string;
    dueTiming: 'before-class' | 'in-class' | 'end-of-day';
    slug: string;
  };
  updatedAt?: string;
}

export interface ReminderItem {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  completed: boolean;
  linkedIdeaId?: string;
  updatedAt?: string;
}

export type IdeaStatus = 'active' | 'waiting-on' | 'completed';

export type ArchiveOutcome = 'completed' | 'not-completed';

export type IdeaResponsibilityType = 'paid' | 'cost' | 'time-saving';

export interface IdeaItem {
  id: string;
  project: string; // Folder / Category name (e.g., 'OHCR', 'CBS', 'Personal')
  priorityRank: number;
  title: string;
  startingStep: string;
  notes?: string; // Freeform multi-line note body (Apple Notes style)
  isBottleneck: boolean;
  /** When a bottleneck, it covers (blocks) every lower-priority task below it in the same folder */
  blocksBelow?: boolean;
  responsibilityType?: IdeaResponsibilityType;
  status: IdeaStatus;
  waitingReason?: string;
  estimatedMinutes?: number;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedOutcome?: ArchiveOutcome;
  /** Dollars earned on a Paid task (asked before archiving) */
  earnedAmountDollars?: number;
}

export interface CheckupBenchmark {
  id: string;
  label: string;
  checked: boolean;
}

export interface ProjectCheckup {
  id: string;
  project: string; // e.g., 'CBS', 'OHCR'
  cadenceLabel: string; // e.g., 'Weekly Friday Review'
  lastReviewedDate: string;
  nextReviewDate: string;
  benchmarks: CheckupBenchmark[];
  nextWeekDeliverables: string[];
  completedCount: number;
}

export type ConfidenceLevel = 'behind' | 'on-track' | 'ahead';

export interface PacedGoal {
  id: string;
  title: string;
  project: string;
  linkedIdeaId?: string;
  totalEstimatedHours: number;
  targetDays: number;
  daysElapsed: number;
  actualProgressPct: number; // 0..100
  dailyMinutesAllocated: number;
  confidenceLevel: ConfidenceLevel;
  lastCheckInNote?: string;
  startDate: string; // YYYY-MM-DD
  status: 'active' | 'completed';
}

export interface PacingUpdateLog {
  id: string;
  goalId: string;
  goalTitle: string;
  date: string;
  daysElapsed: number;
  expectedPct: number;
  actualPct: number;
  confidence: ConfidenceLevel;
  deltaMinutesPerDay: number; // +30 if behind, -25 if ahead, 0 if on-track
  blocksAdjustedCount: number;
  summary: string;
}

export type PaymentMethodType =
  | 'Hourly Contractor'
  | 'Flat-Rate Service'
  | 'Monthly Retainer'
  | 'Software Automation';

export interface OffloadedTask {
  id: string;
  title: string;
  category: WhyCategory | 'Profitable Ops';
  hoursSaved: number; // Hours saved per cycle/week
  costDollars: number; // Money spent
  paymentMethod: PaymentMethodType;
  paymentDetail: string; // e.g., 'Paid Fridays via ACH ($22/hr)'
  dateLogged: string;
}

export interface DailyReflectionEntry {
  id: string;
  date: string; // YYYY-MM-DD
  promptQuestion: string;
  reflectionResponse: string;
  dailyNote: string;
  completedBaselineIds: string[];
  baselineTotalCount: number;
  streakAwarded: boolean;
  createdAt: string;
}

export interface ProtectedStreakState {
  currentDays: number;
  bestDays: number;
  lastLockedDate: string; // YYYY-MM-DD
  completedDates: string[]; // YYYY-MM-DD[]
  protectionRuleNote: string;
}

export interface ParsedLiveInput {
  mode: 'event' | 'empty-zone' | 'reminder' | 'fill-slot' | 'update-event';
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  whyCategory?: WhyCategory;
  customColor?: EventColorId;
  notes?: string;
  alertOffsetMinutes?: number | null;
  targetBlockId?: string;
  matchedIdeaId?: string;
  startingStepHint?: string;
  explanation?: string;
}

export type MissingVoiceField = 'title' | 'date' | 'startTime' | 'endTime';

export interface VoiceScheduleDraft {
  rawTranscript: string;
  mode: 'event' | 'empty-zone' | 'reminder' | 'fill-slot' | 'update-event';
  title?: string;
  date?: string;
  dateSpoken: boolean;
  startTime?: string;
  endTime?: string;
  whyCategory?: WhyCategory;
  customColor?: EventColorId;
  notes?: string;
  alertOffsetMinutes?: number | null;
  targetBlockId?: string;
  matchedIdeaId?: string;
  startingStepHint?: string;
  missingFields: MissingVoiceField[];
  nextPrompt: string;
  isComplete: boolean;
}

export interface OpsState {
  activeTab: RouteTab;
  isReflectionOpen: boolean;
  selectedDate: string; // Active day on schedule (YYYY-MM-DD)
  scheduleViewMode: ScheduleViewMode;
  siteConfig: SiteConfig;
  whyStatements: Record<WhyCategory, string>;
  blocks: CalendarBlock[];
  reminders: ReminderItem[];
  ideas: IdeaItem[];
  projects: string[];
  checkups: ProjectCheckup[];
  pacedGoals: PacedGoal[];
  pacingLogs: PacingUpdateLog[];
  hourlyRateDollars: number;
  offloadedTasks: OffloadedTask[];
  reflections: DailyReflectionEntry[];
  draftDailyNote: string;
  draftReflectionPrompt: string;
  draftReflectionText: string;
  streak: ProtectedStreakState;
  toastMessage: string | null;
}

export interface OpsActions {
  // Navigation & Shell
  setActiveTab: (tab: RouteTab) => void;
  setReflectionOpen: (open: boolean) => void;
  setSelectedDate: (date: string) => void;
  setScheduleViewMode: (mode: ScheduleViewMode) => void;
  showToast: (message: string) => void;

  // Subagent 1: Schedule Engine
  addCalendarBlock: (block: Omit<CalendarBlock, 'id'>) => string;
  updateCalendarBlock: (blockId: string, patch: Partial<Omit<CalendarBlock, 'id'>>) => void;
  toggleBlockCompleted: (blockId: string) => void;
  deleteCalendarBlock: (blockId: string) => void;
  updateWhyStatement: (category: WhyCategory, statement: string) => void;
  spilloverEmptyZone: (blockId: string) => { targetDate: string; targetTime: string } | null;
  assignIdeaToBlock: (blockId: string, ideaId: string | undefined) => void;
  assignIdeaToNextEmptyZone: (ideaId: string, fromDate?: string) => CalendarBlock | null;
  parseLiveCommand: (rawText: string) => ParsedLiveInput | null;
  submitLiveCommand: (rawText: string) => ParsedLiveInput | null;
  parseVoiceDraft: (rawText: string) => VoiceScheduleDraft | null;
  commitVoiceDraft: (draft: VoiceScheduleDraft) => ParsedLiveInput | null;
  addReminder: (reminder: Omit<ReminderItem, 'id'>) => string;
  updateReminder: (reminderId: string, patch: Partial<Omit<ReminderItem, 'id'>>) => void;
  toggleReminder: (reminderId: string) => void;
  deleteReminder: (reminderId: string) => void;
  setSchoolDayDelay: (date: string, delayMode: 'regular' | 'late-90' | 'late-2hr') => void;

  // Subagent 2: Ideas & Checkups
  addIdea: (input: {
    project: string;
    title: string;
    startingStep: string;
    isBottleneck?: boolean;
    estimatedMinutes?: number;
  }) => string;
  updateIdea: (ideaId: string, patch: Partial<Omit<IdeaItem, 'id'>>) => void;
  archiveIdea: (
    ideaId: string,
    outcome?: ArchiveOutcome,
    earnedAmountDollars?: number
  ) => void;
  unarchiveIdea: (ideaId: string) => void;
  deleteIdea: (ideaId: string) => void;
  moveIdeaRank: (ideaId: string, direction: 'up' | 'down') => void;
  setIdeaRank: (ideaId: string, newRank: number) => void;
  toggleWaitingOn: (ideaId: string, waitingReason?: string) => void;
  toggleIdeaBottleneck: (ideaId: string) => void;
  addProject: (projectName: string) => void;
  renameProject: (oldName: string, newName: string) => boolean;
  toggleCheckupBenchmark: (checkupId: string, benchmarkId: string) => void;
  addCheckupBenchmark: (checkupId: string, label: string) => void;
  updateCheckupDeliverables: (checkupId: string, deliverables: string[]) => void;
  completeProjectCheckup: (checkupId: string, promoteDeliverablesToIdeas?: boolean) => void;

  // Subagent 3: Pacing & ROI
  schedulePacedGoal: (input: {
    title: string;
    project: string;
    linkedIdeaId?: string;
    totalEstimatedHours: number;
    targetDays: number;
    dailyMinutesAllocated: number;
  }) => string;
  submitConfidenceCheckIn: (input: {
    goalId: string;
    actualProgressPct: number;
    confidence: ConfidenceLevel;
    note?: string;
  }) => PacingUpdateLog | null;
  advanceGoalDay: (goalId: string) => void;
  setHourlyRateDollars: (rate: number) => void;
  addOffloadedTask: (task: Omit<OffloadedTask, 'id' | 'dateLogged'>) => void;
  deleteOffloadedTask: (taskId: string) => void;

  // Subagent 4: Reflection & Streaks
  setDraftDailyNote: (note: string) => void;
  setDraftReflectionPrompt: (prompt: string) => void;
  setDraftReflectionText: (text: string) => void;
  completeDailyReflection: () => { streakLocked: boolean; currentDays: number };
  generateGeminiWeeklyExport: () => string;

  // Site & Website Configurator (airbnb710.com)
  updateSiteConfig: (patch: Partial<SiteConfig>) => void;
  applySiteTemplate: (
    templateId: 'airbnb710-str' | 'personal-cbs-ohcr',
    mode?: 'replace' | 'merge'
  ) => void;
  removeProject: (projectName: string) => void;
  exportSiteConfigJson: () => string;
  importSiteConfigJson: (jsonText: string) => boolean;
  syncNow: () => Promise<boolean>;
}

export type CloudSyncStatus = 'syncing' | 'synced' | 'offline';
