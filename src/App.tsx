import React, { useEffect } from 'react';
import {
  Activity,
  Calendar,
  Cloud,
  Lightbulb,
  RefreshCw,
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
import { AlertMonitor } from './components/AlertMonitor';
import { ActiveTimersBar } from './components/ActiveTimersBar';

const ClearOpsWorkspace: React.FC = () => {
  const { state, actions, syncStatus } = useOpsStore();
  const isScheduleLocked = state.activeTab === 'schedule';

  // Hard-lock viewport on iPhone/iOS Safari when on Schedule so touching/dragging
  // outside the calendar grid never drops/bounces the page AND opening the iOS keyboard
  // inside an event edit sheet keeps the visible shell + sheet locked to visualViewport.
  useEffect(() => {
    const root = document.documentElement;
    if (!isScheduleLocked) {
      root.classList.remove('is-schedule-locked', 'is-kb-open');
      root.style.removeProperty('--app-vvh');
      root.style.removeProperty('--app-vv-top');
      root.style.removeProperty('--app-vv-left');
      return;
    }

    root.classList.add('is-schedule-locked');
    window.scrollTo(0, 0);

    const vv = window.visualViewport;
    let settleTimerA: number | null = null;
    let settleTimerB: number | null = null;

    const syncViewport = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      const h = vv ? Math.round(vv.height) : window.innerHeight;
      const top = vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
      const left = vv ? Math.max(0, Math.round(vv.offsetLeft)) : 0;
      root.style.setProperty('--app-vvh', `${h}px`);
      root.style.setProperty('--app-vv-top', `${top}px`);
      root.style.setProperty('--app-vv-left', `${left}px`);
      const kbOpen = vv ? vv.height < window.innerHeight - 110 : false;
      root.classList.toggle('is-kb-open', kbOpen);
    };

    const handleFocusChange = () => {
      syncViewport();
      if (settleTimerA !== null) window.clearTimeout(settleTimerA);
      if (settleTimerB !== null) window.clearTimeout(settleTimerB);
      settleTimerA = window.setTimeout(syncViewport, 70);
      settleTimerB = window.setTimeout(syncViewport, 280);
    };

    syncViewport();
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);

    const preventRubberBand = (e: TouchEvent) => {
      if (state.isReflectionOpen) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Allow scrolling inside the calendar time grid
      if (target.closest('.gcal-scroll')) {
        return;
      }

      // Allow scrolling inside an event edit/detail sheet only when its contents overflow
      const sheet = target.closest('.gcal-sheet') as HTMLElement | null;
      if (sheet) {
        if (sheet.scrollHeight > sheet.clientHeight + 1) {
          return;
        }
        e.preventDefault();
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
      if (settleTimerA !== null) window.clearTimeout(settleTimerA);
      if (settleTimerB !== null) window.clearTimeout(settleTimerB);
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
      document.removeEventListener('touchmove', preventRubberBand);
      root.classList.remove('is-schedule-locked', 'is-kb-open');
      root.style.removeProperty('--app-vvh');
      root.style.removeProperty('--app-vv-top');
      root.style.removeProperty('--app-vv-left');
    };
  }, [isScheduleLocked, state.isReflectionOpen]);

  const activeIdeasCount = state.ideas.filter((i) => i.status === 'active').length;
  const activeGoalsCount = state.pacedGoals.filter((g) => g.status === 'active').length;

  const navOptions: { value: RouteTab; label: string; count?: number }[] = [
    { value: 'schedule', label: 'Schedule' },
    { value: 'today', label: 'Today' },
    { value: 'ideas', label: 'Ideas', count: activeIdeasCount },
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
          <button
            type="button"
            className={`ops-sync-btn is-${syncStatus}`}
            aria-label={
              syncStatus === 'synced'
                ? 'Cloud synced across all devices (tap to sync now)'
                : syncStatus === 'pending'
                ? 'Edits saved locally — waiting to sync (tap to sync now)'
                : syncStatus === 'syncing'
                ? 'Syncing across devices…'
                : 'Offline — saved locally, tap to retry cloud sync'
            }
            title={
              syncStatus === 'synced'
                ? 'Synced across all devices — tap to sync now'
                : syncStatus === 'pending'
                ? 'Saved locally — will sync in a moment (tap to sync now)'
                : syncStatus === 'syncing'
                ? 'Syncing across devices…'
                : 'Saved locally — tap to sync with cloud'
            }
            onClick={() => void actions.syncNow()}
          >
            {syncStatus === 'syncing' ? (
              <RefreshCw size={14} className="ops-sync-spin" />
            ) : (
              <Cloud size={14} />
            )}
            <span className="ops-sync-dot" aria-hidden="true" />
          </button>

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

      <ActiveTimersBar />

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
      <AlertMonitor />

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
