import React from 'react';
import {
  Activity,
  Calendar,
  Globe,
  Lightbulb,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Badge, Button, SegmentedControl } from './components/ui';
import { OpsStoreProvider, useOpsStore } from './store/opsStore';
import type { RouteTab } from './types/schema';
import { LiveCalendarInput, ScheduleView } from './features/schedule';
import { IdeasHubView } from './features/ideas';
import { PacingRoiView } from './features/pacing';
import { ReflectionDrawer } from './features/reflection';
import { SiteConfigView } from './features/config';

const ClearOpsWorkspace: React.FC = () => {
  const { state, actions } = useOpsStore();

  const activeIdeasCount = state.ideas.filter((i) => i.status === 'active').length;
  const activeGoalsCount = state.pacedGoals.filter((g) => g.status === 'active').length;

  const navOptions: { value: RouteTab; label: string; count?: number }[] = [
    { value: 'schedule', label: 'Schedule' },
    { value: 'ideas', label: 'Ideas & Checkups', count: activeIdeasCount },
    { value: 'pacing', label: 'Pacing & ROI', count: activeGoalsCount },
    { value: 'config', label: 'Site Config' },
  ];

  return (
    <div className="ops-shell">
      <header className="ops-topbar">
        <div className="ops-topbar-left">
          <button
            type="button"
            className="ops-brand"
            onClick={() => actions.setActiveTab('schedule')}
          >
            <span className="ops-brand-mark" aria-hidden="true" />
            <span>{state.siteConfig.workspaceName || 'ClearOps'}</span>
          </button>

          <button
            type="button"
            className="ops-domain-pill"
            onClick={() => actions.setActiveTab('config')}
            title={`Configure ${state.siteConfig.targetDomain}`}
          >
            <Globe size={12} />
            <span>{state.siteConfig.domainLabel || 'airbnb710.com'}</span>
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

        <div className="ops-topbar-center">
          <LiveCalendarInput />
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

      {/* Mobile Touch-Friendly Command Pill (visible <= 768px) */}
      <div className="ops-mobile-command-bar">
        <LiveCalendarInput />
      </div>

      <main className="ops-main">
        {state.activeTab === 'schedule' && <ScheduleView />}
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
            state.activeTab === 'config' && !state.isReflectionOpen ? 'is-active' : ''
          }`.trim()}
          onClick={() => {
            actions.setReflectionOpen(false);
            actions.setActiveTab('config');
          }}
        >
          <SlidersHorizontal size={19} />
          <span>Config</span>
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

      {state.toastMessage && (
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
