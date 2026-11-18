import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarPlus, Clock } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, CheckboxRow, EmptyState } from '../../components/ui';
import { formatShortDate, useOpsStore } from '../../store/opsStore';

const TODAY_ANCHOR = '2026-11-17';

function fmt(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const s = h % 12 === 0 ? 12 : h % 12;
  return `${s}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

/** Daily Reminder / Briefing page — links straight back into today's schedule. */
export const TodayView: React.FC = () => {
  const { state, actions } = useOpsStore();
  const [remTitle, setRemTitle] = useState('');
  const [remTime, setRemTime] = useState('17:00');

  const todayBlocks = useMemo(
    () => state.blocks.filter((b) => b.date === TODAY_ANCHOR).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [state.blocks]
  );
  const baselines = todayBlocks.filter((b) => b.kind === 'baseline');
  const remaining = baselines.filter((b) => !b.completed);
  const openZones = todayBlocks.filter((b) => b.kind === 'empty-zone' && !b.completed);
  const activeIdeas = useMemo(
    () => state.ideas.filter((i) => i.status === 'active').sort((a, b) => a.priorityRank - b.priorityRank),
    [state.ideas]
  );
  const bottlenecks = activeIdeas.filter((i) => i.isBottleneck);
  const waitingCount = state.ideas.filter((i) => i.status === 'waiting-on').length;
  const reminders = state.reminders
    .filter((r) => r.date === TODAY_ANCHOR)
    .sort((a, b) => a.time.localeCompare(b.time));
  const nextUp = todayBlocks.find((b) => !b.completed);

  const openSchedule = () => {
    actions.setSelectedDate(TODAY_ANCHOR);
    actions.setScheduleViewMode('day');
    actions.setActiveTab('schedule');
  };

  return (
    <div className="ops-stack-md today-page">
      <div className="ops-stack-xs">
        <h1 className="ui-section-title" style={{ fontSize: 'var(--text-xl)' }}>
          Today
        </h1>
        <span className="ui-section-meta">{formatShortDate(TODAY_ANCHOR)} · Daily briefing</span>
      </div>

      {/* Daily Briefing → sends you into the schedule */}
      <Card>
        <CardBody className="ops-stack-sm">
          <div className="ops-row-between">
            <h3 className="ui-card-title">Daily Briefing</h3>
            <Badge tone={remaining.length ? 'neutral' : 'streak'}>
              {remaining.length ? `${remaining.length} baseline left` : 'Baselines done'}
            </Badge>
          </div>

          {nextUp && (
            <div className="ops-row" style={{ gap: 8 }}>
              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 'var(--text-sm)' }}>
                Next: <strong>{nextUp.title}</strong> · {fmt(nextUp.startTime)}
              </span>
            </div>
          )}

          {activeIdeas[0] && (
            <div className="ops-stack-xs">
              <span className="ui-field-label" style={{ marginBottom: 0 }}>
                Top priority
              </span>
              <span style={{ fontWeight: 600 }}>
                {activeIdeas[0].project} #{activeIdeas[0].priorityRank}: {activeIdeas[0].title}
              </span>
            </div>
          )}

          <div className="ops-row-wrap">
            <Badge tone="zone">{openZones.length} Empty Zone{openZones.length === 1 ? '' : 's'} today</Badge>
            {bottlenecks.length > 0 && (
              <Badge
                tone="amber"
                icon={<AlertTriangle size={12} />}
                style={{ cursor: 'pointer' }}
                onClick={() => actions.setActiveTab('ideas')}
              >
                {bottlenecks.length} bottleneck{bottlenecks.length === 1 ? '' : 's'}
              </Badge>
            )}
            {waitingCount > 0 && <Badge tone="neutral">{waitingCount} waiting-on</Badge>}
          </div>

          <Button variant="primary" size="lg" fullWidth iconRight={<ArrowRight size={15} />} onClick={openSchedule}>
            Open today's schedule
          </Button>
        </CardBody>
      </Card>

      {/* Priority queue */}
      <Card>
        <CardHeader title="Ideas & bottlenecks to fit in" subtitle="Tap to drop one into the next open Empty Zone" />
        <CardBody flush>
          {activeIdeas.length === 0 ? (
            <div className="ui-card-body">
              <EmptyState message="No active ideas. Add some in Ideas." />
            </div>
          ) : (
            <div className="ui-divider-list">
              {activeIdeas.slice(0, 5).map((idea) => (
                <div key={idea.id} className="today-row">
                  <div className="ops-stack-xs" style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      {idea.project} #{idea.priorityRank}: {idea.title}
                    </span>
                    <span className="ui-section-meta" style={{ whiteSpace: 'normal' }}>
                      Start: {idea.startingStep}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<CalendarPlus size={13} />}
                    onClick={() => actions.assignIdeaToNextEmptyZone(idea.id, TODAY_ANCHOR)}
                  >
                    Schedule
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Reminders */}
      <Card>
        <CardHeader title="Reminders" />
        <CardBody className="ops-stack-sm">
          {reminders.length === 0 ? (
            <span className="ui-section-meta">No reminders today. Add one here or from the schedule chat.</span>
          ) : (
            reminders.map((r) => (
              <CheckboxRow
                key={r.id}
                checked={r.completed}
                onChange={() => actions.toggleReminder(r.id)}
                label={r.title}
                strikeWhenDone
                rightMeta={<span className="mono ui-section-meta">{fmt(r.time)}</span>}
              />
            ))
          )}
          <form
            className="ops-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!remTitle.trim()) return;
              actions.addReminder({ date: TODAY_ANCHOR, time: remTime, title: remTitle.trim(), completed: false });
              setRemTitle('');
            }}
          >
            <input
              className="ui-input"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="Quick reminder…"
              value={remTitle}
              onChange={(e) => setRemTitle(e.target.value)}
            />
            <input
              type="time"
              className="ui-input mono"
              style={{ width: 104 }}
              value={remTime}
              onChange={(e) => setRemTime(e.target.value)}
            />
            <Button type="submit" variant="secondary" size="md">
              Add
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
};
