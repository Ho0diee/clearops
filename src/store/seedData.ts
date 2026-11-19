import type { OpsState, SiteConfig } from '../types/schema';
import { buildFullOhchsSchedule } from './ohchsSchedule';

/** Returns the real-world local calendar date in YYYY-MM-DD format. */
export function getTodayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const TODAY_ISO = getTodayISO();

const INITIAL_OHCHS = buildFullOhchsSchedule(TODAY_ISO);

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  targetDomain: 'https://airbnb710.com',
  domainLabel: 'airbnb710.com',
  workspaceName: 'Intuition',
  accentTheme: 'cobalt',
  activeTemplate: 'personal-cbs-ohcr',
  hostingProvider: 'Vercel',
  pwaInstallEnabled: true,
};

export const REFLECTION_PROMPTS: string[] = [
  'How do you think this week went? Which baseline commitments felt effortless, and where did friction appear?',
  'Where did profitable focus compound today, and which bottleneck needs a smaller starting step tomorrow?',
  'Did your schedule protect Family, Health, School, and Organization without work bleed?',
  'Looking at multi-day pacing: were your time estimates realistic, or should tomorrow have more breathing room?',
];

export const INITIAL_OPS_STATE: OpsState = {
  activeTab: 'schedule',
  isReflectionOpen: false,
  selectedDate: getTodayISO(),
  scheduleViewMode: 'week',
  siteConfig: DEFAULT_SITE_CONFIG,
  whyStatements: {
    School: 'Master core technical foundations cleanly so long-term capability compounds.',
    Health: 'Protect daily strength, mobility, and sleep so energy never becomes the bottleneck.',
    Family: 'Be fully present at the table every evening with zero work bleed.',
    Organization: 'Keep personal and financial systems frictionless so profitable work runs calm.',
  },
  blocks: INITIAL_OHCHS.blocks,
  reminders: INITIAL_OHCHS.reminders,
  projects: ['OHCR', 'CBS', 'Personal'],
  activeTimers: [],
  pendingPlacement: null,
  ideas: [
    {
      id: 'idea-ohcr-1',
      project: 'OHCR',
      priorityRank: 1,
      title: 'Written Plan',
      startingStep: 'Outline 3 core milestones & scope boundaries',
      isBottleneck: false,
      status: 'active',
      estimatedMinutes: 60,
      createdAt: '2026-11-14',
    },
    {
      id: 'idea-ohcr-2',
      project: 'OHCR',
      priorityRank: 2,
      title: 'Supplier Resource Bottleneck',
      startingStep: 'Compare lead-time sheet from backup materials vendor',
      isBottleneck: true,
      status: 'active',
      estimatedMinutes: 45,
      createdAt: '2026-11-15',
    },
    {
      id: 'idea-ohcr-3',
      project: 'OHCR',
      priorityRank: 3,
      title: 'Listing Photos',
      startingStep: 'Prepare 12-frame shot list & natural light schedule',
      isBottleneck: false,
      status: 'active',
      estimatedMinutes: 40,
      createdAt: '2026-11-15',
    },
    {
      id: 'idea-ohcr-wait-1',
      project: 'OHCR',
      priorityRank: 4,
      title: 'Vendor Quote Approval',
      startingStep: 'Review signed rate card once distributor replies',
      isBottleneck: true,
      status: 'waiting-on',
      waitingReason: 'Waiting on regional distributor sign-off — resurfaces in Friday checkup',
      estimatedMinutes: 30,
      createdAt: '2026-11-13',
    },
    {
      id: 'idea-cbs-1',
      project: 'CBS',
      priorityRank: 1,
      title: 'Q4 Crew Dispatch Optimization',
      startingStep: 'Audit Tuesday route overlap across 3 field stops',
      isBottleneck: false,
      status: 'active',
      estimatedMinutes: 50,
      createdAt: '2026-11-14',
    },
    {
      id: 'idea-cbs-2',
      project: 'CBS',
      priorityRank: 2,
      title: 'Calibration Parts Bottleneck',
      startingStep: 'Install replacement pressure sensor on Rig #2',
      isBottleneck: true,
      status: 'waiting-on',
      waitingReason: 'Parts shipment in transit — verify in CBS Weekly Checkup',
      estimatedMinutes: 45,
      createdAt: '2026-11-12',
    },
    {
      id: 'idea-pers-1',
      project: 'Personal',
      priorityRank: 1,
      title: 'Outline Q4 Ops Memo',
      startingStep: 'Write 5-bullet summary of winter schedule anchors',
      isBottleneck: false,
      status: 'active',
      estimatedMinutes: 25,
      createdAt: '2026-11-16',
    },
  ],
  checkups: [],
  pacedGoals: [],
  pacingLogs: [],
  hourlyRateDollars: 85,
  offloadedTasks: [],
  reflections: [],
  draftDailyNote: '',
  draftReflectionPrompt: REFLECTION_PROMPTS[0],
  draftReflectionText: '',
  streak: {
    currentDays: 0,
    bestDays: 0,
    lastLockedDate: '',
    completedDates: [],
    protectionRuleNote:
      'Counts strictly Baseline Obligations + Daily Self-Reflection. Multi-day pacing recalibrations and Empty Zone spillovers never break your streak.',
  },
  toastMessage: null,
};

export const AIRBNB710_STR_PRESET: Pick<
  OpsState,
  | 'siteConfig'
  | 'hourlyRateDollars'
  | 'whyStatements'
  | 'projects'
  | 'blocks'
  | 'reminders'
  | 'ideas'
  | 'checkups'
  | 'pacedGoals'
  | 'offloadedTasks'
> = {
  siteConfig: {
    targetDomain: 'https://airbnb710.com',
    domainLabel: 'airbnb710.com',
    workspaceName: 'Intuition',
    accentTheme: 'cobalt',
    activeTemplate: 'airbnb710-str',
    hostingProvider: 'Vercel',
    pwaInstallEnabled: true,
  },
  hourlyRateDollars: 95,
  whyStatements: {
    Organization: 'Deliver 5-star guest turnovers & friction-free direct bookings on airbnb710.com.',
    Family: 'Automate property turnovers so evenings and family dinners stay 100% protected.',
    Health: 'Protect daily strength, mobility, and sleep regardless of check-in volume.',
    School: 'Keep learning and technical systems sharp so property operations compound.',
  },
  projects: ['Airbnb710', 'Turnovers & Guests', 'Listing & Pricing', 'Personal'],
  blocks: INITIAL_OHCHS.blocks,
  reminders: INITIAL_OHCHS.reminders,
  ideas: [
    {
      id: 'idea-710-1',
      project: 'Airbnb710',
      priorityRank: 1,
      title: 'Hero Listing Photos & Direct Booking Gallery',
      startingStep: 'Shoot sunlit patio, kitchen island & primary bedroom',
      isBottleneck: false,
      status: 'active',
      estimatedMinutes: 60,
      createdAt: '2026-11-16',
    },
    {
      id: 'idea-710-2',
      project: 'Airbnb710',
      priorityRank: 2,
      title: 'Railway Domain Provisioning Bottleneck (airbnb710.com)',
      startingStep: 'Attach airbnb710.com custom domain to Railway service on port $PORT',
      isBottleneck: true,
      status: 'active',
      estimatedMinutes: 35,
      createdAt: '2026-11-17',
    },
    {
      id: 'idea-710-3',
      project: 'Turnovers & Guests',
      priorityRank: 1,
      title: 'Digital House Manual & Wi-Fi QR Card',
      startingStep: 'Write 1-page mobile check-in & local coffee guide',
      isBottleneck: false,
      status: 'active',
      estimatedMinutes: 40,
      createdAt: '2026-11-16',
    },
    {
      id: 'idea-710-wait-1',
      project: 'Turnovers & Guests',
      priorityRank: 2,
      title: 'Backup Par-3 Hotel Linen Restock',
      startingStep: 'Unpack & label reserve duvet sets in owner closet',
      isBottleneck: true,
      status: 'waiting-on',
      waitingReason: 'Supplier delivery in transit — resurfaces in Friday Airbnb710 Checkup',
      estimatedMinutes: 30,
      createdAt: '2026-11-15',
    },
    {
      id: 'idea-710-4',
      project: 'Listing & Pricing',
      priorityRank: 1,
      title: 'Holiday & Weekend Minimum-Stay Pricing Floor',
      startingStep: 'Audit Thanksgiving & December weekend ADR vs local comps',
      isBottleneck: false,
      status: 'active',
      estimatedMinutes: 45,
      createdAt: '2026-11-16',
    },
  ],
  checkups: [],
  pacedGoals: [],
  offloadedTasks: [],
};
