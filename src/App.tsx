import React, { useEffect } from 'react';
import {
  Activity,
  Calendar,
  Lightbulb,
  Settings,
  Sun,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge, Button, SegmentedControl } from './components/ui';
import { OpsStoreProvider, useOpsStore } from './store/opsStore';
import type { RouteTab } from './types/schema';
import { ScheduleView } from './features/schedule';
import { TodayView } from './features/today';
import { IdeasHubView } from './features/ideas';
import { PacingRoiView } from './features/pacing';
import { ReflectionDrawer } from './features/reflection';
import { SiteConfigView } from './features/config';

const ClearOpsWorkspace: React.FC = () => {
  const { state, actions } = useOpsStore();
  const isScheduleLocked = state.activeTab === 'schedule';

  // Hard-lock viewport on iPhone/iOS Safari when on Schedule so touching/dragging
  // outside the calendar grid (e.g. voice button, chat bar, header) never drops/bounces the page.
  useEffect(() => {
    const root = document.documentElement;
    if (!isScheduleLocked) {
      root.classList.remove('is-schedule-locked', 'is-kb-open');
      root.style.removeProperty('--app-vvh');
      return;
    }

    root.classList.add('is-schedule-locked');
    window.scrollTo(0, 0);

    const vv = window.visualViewport;
    const syncViewport = () => {
      const h = vv ? Math.round(vv.height) : window.innerHeight;
      root.style.setProperty('--app-vvh', `${h}px`);
      const kbOpen = vv ? vv.height < window.innerHeight - 110 : false;
      root.classList.toggle('is-kb-open', kbOpen);
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };

    syncViewport();
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);

    const preventRubberBand = (e: TouchEvent) => {
      if (state.isReflectionOpen) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Allow scrolling inside the calendar time grid or open event detail sheet
      if (target.closest('.gcal-scroll') || target.closest('.gcal-sheet')) {
        return;
      }

      // Allow scrolling inside chat log only when it actually overflows vertically
      const chatLog = target.closest('.sched-chat-log') as HTMLElement | null;
      if (chatLog && chatLog.scrollHeight > chatLog.clientHeight) {
        return;
      }

      e.preventDefault();
    };

    document.addEventListener('touchmove', preventRubberBand, { passive: false });

    return () => {
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      document.removeEventListener('touchmove', preventRubberBand);
      root.classList.remove('is-schedule-locked', 'is-kb-open');
      root.style.removeProperty('--app-vvh');
    };
  }, [isScheduleLocked, state.isReflectionOpen]);

  const activeIdeasCount = state.ideas.filter((i) => i.status === 'active').length;
  const activeGoalsCount = state.pacedGoals.filter((g) => g.status === 'active').length;

  const navOptions: { value: RouteTab; label: string; count?: number }[] = [
    { value: 'schedule', label: 'Schedule' },
    { value: 'today', label: 'Today' },
    { value: 'ideas', label: 'Ideas & Checkups', count: activeIdeasCount },
    { value: 'pacing', label: 'Pacing & ROI', count: activeGoalsCount },
    { value: 'config', label: 'Settings' },
  ];

  return (
    <div className={`ops-shell ${isScheduleLocked ? 'is-schedule-lock' : ''}`.trim()}>
      <header className="ops-topbar">
        <div className="ops-topbar-left">
          <button
            type="button"
            className="ops-brand"
            onClick={() => actions.setActiveTab('schedule')}
          >
            <span className="ops-brand-mark" aria-hidden="true" />
            <span>{state.siteConfig.workspaceName || 'Intuition'}</span>
          </button>

          <div className="ops-desktop-nav">
            <SegmentedControl<RouteTab>
              ariaLabel="Primary workspace views"
              options={navOptions}
              value={state.activeTab}
              onChange={actions.setActiveTab}
            />
          </div>
        </div>


        <div className="ops-topbar-right">
          <Badge
            tone="streak"
            icon={<ShieldCheck size={14} />}
            title={state.streak.protectionRuleNote}
            style={{ cursor: 'pointer' }}
            onClick={() => actions.setReflectionOpen(true)}
          >
            {state.streak.currentDays}d Streak
          </Badge>

          <button
            type="button"
            className="ops-settings-btn"
            aria-label="Settings"
            title="Settings & Whys"
            onClick={() => actions.setActiveTab('config')}
          >
            <Settings size={17} />
          </button>

          <div className="ops-desktop-reflect-btn">
            <Button
              variant="secondary"
              size="md"
              onClick={() => actions.setReflectionOpen(true)}
            >
              Reflect
            </Button>
          </div>
        </div>
      </header>

      <main className={`ops-main ${state.activeTab === 'schedule' ? 'is-schedule' : ''}`.trim()}>
        {state.activeTab === 'schedule' && <ScheduleView />}
        {state.activeTab === 'today' && <TodayView />}
        {state.activeTab === 'ideas' && <IdeasHubView />}
        {state.activeTab === 'pacing' && <PacingRoiView />}
        {state.activeTab === 'config' && <SiteConfigView />}
      </main>

      {/* Sticky Thumb-Zone Mobile Bottom Tab Bar (visible <= 768px) */}
      <nav className="ops-bottom-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={`ops-bottom-nav-item ${
            state.activeTab === 'schedule' && !state.isReflectionOpen ? 'is-active' : ''
          }`.trim()}
          onClick={() => {
            actions.setReflectionOpen(false);
            actions.setActiveTab('schedule');
          }}
        >
          <Calendar size={19} />
          <span>Schedule</span>
        </button>

        <button
          type="button"
          className={`ops-bottom-nav-item ${
            state.activeTab === 'ideas' && !state.isReflectionOpen ? 'is-active' : ''
          }`.trim()}
          onClick={() => {
            actions.setReflectionOpen(false);
            actions.setActiveTab('ideas');
          }}
        >
          <Lightbulb size={19} />
          <span>Ideas</span>
        </button>

        <button
          type="button"
          className={`ops-bottom-nav-item ${
            state.activeTab === 'pacing' && !state.isReflectionOpen ? 'is-active' : ''
          }`.trim()}
          onClick={() => {
            actions.setReflectionOpen(false);
            actions.setActiveTab('pacing');
          }}
        >
          <Activity size={19} />
          <span>Pacing</span>
        </button>

        <button
          type="button"
          className={`ops-bottom-nav-item ${
            state.activeTab === 'today' && !state.isReflectionOpen ? 'is-active' : ''
          }`.trim()}
          onClick={() => {
            actions.setReflectionOpen(false);
            actions.setActiveTab('today');
          }}
        >
          <Sun size={19} />
          <span>Today</span>
        </button>

        <button
          type="button"
          className={`ops-bottom-nav-item ${state.isReflectionOpen ? 'is-active' : ''}`.trim()}
          onClick={() => actions.setReflectionOpen(!state.isReflectionOpen)}
        >
          <Sparkles size={19} />
          <span>Reflect</span>
        </button>
      </nav>

      <ReflectionDrawer />

      {state.toastMessage && state.activeTab !== 'schedule' && (
        <div className="ui-toast" role="status" aria-live="polite">
          {state.toastMessage}
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => (
  <OpsStoreProvider>
    <ClearOpsWorkspace />
  </OpsStoreProvider>
);

export default App;
