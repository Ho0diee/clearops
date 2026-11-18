import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FastForward,
  Flame,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ProgressBar,
  SelectField,
  TextField,
} from '../../components/ui';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import type { ConfidenceLevel, PacedGoal } from '../../types/schema';

function computeExpectedPct(goal: PacedGoal): number {
  return Math.min(100, Math.round((goal.daysElapsed / Math.max(1, goal.targetDays)) * 100));
}

function getConfidenceMeta(confidence: ConfidenceLevel): {
  label: string;
  tone: 'amber' | 'primary' | 'streak';
} {
  if (confidence === 'behind') return { label: 'Behind Pace', tone: 'amber' };
  if (confidence === 'ahead') return { label: 'Ahead of Pace', tone: 'streak' };
  return { label: 'On Track', tone: 'primary' };
}

interface GoalCardProps {
  goal: PacedGoal;
  upcomingBlockCount: number;
  onAdvanceDay: (goalId: string) => void;
  onViewSchedule: () => void;
  onSubmitCheckIn: (input: {
    goalId: string;
    actualProgressPct: number;
    confidence: ConfidenceLevel;
    note?: string;
  }) => void;
}

const PacedGoalCard: React.FC<GoalCardProps> = ({
  goal,
  upcomingBlockCount,
  onAdvanceDay,
  onViewSchedule,
  onSubmitCheckIn,
}) => {
  const [actualDraft, setActualDraft] = useState<number>(goal.actualProgressPct);
  const [noteDraft, setNoteDraft] = useState<string>('');

  useEffect(() => {
    setActualDraft(goal.actualProgressPct);
  }, [goal.actualProgressPct]);

  const expectedPct = computeExpectedPct(goal);
  const confidenceMeta = getConfidenceMeta(goal.confidenceLevel);
  const progressDelta = actualDraft - expectedPct;
  const progressTone: 'primary' | 'zone' | 'amber' =
    goal.confidenceLevel === 'behind' || progressDelta < -10
      ? 'amber'
      : goal.confidenceLevel === 'ahead' || progressDelta >= 10
      ? 'zone'
      : 'primary';

  const handleRecalibrate = (confidence: ConfidenceLevel) => {
    onSubmitCheckIn({
      goalId: goal.id,
      actualProgressPct: actualDraft,
      confidence,
      note: noteDraft,
    });
    setNoteDraft('');
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="ops-row-wrap">
            <span>{goal.title}</span>
            <Badge tone="neutral">{goal.project}</Badge>
            <Badge tone={goal.status === 'completed' ? 'streak' : confidenceMeta.tone}>
              {goal.status === 'completed' ? 'Completed' : confidenceMeta.label}
            </Badge>
          </span>
        }
        subtitle={
          <span className="ops-row-wrap tabular">
            <span>
              Day {goal.daysElapsed} of {goal.targetDays}
            </span>
            <span>·</span>
            <span>{goal.dailyMinutesAllocated}m/day allocated</span>
            <span>·</span>
            <span>{goal.totalEstimatedHours}h total est.</span>
            <span>·</span>
            <span>{upcomingBlockCount} upcoming calendar blocks</span>
          </span>
        }
        action={
          <div className="ops-row-wrap">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<FastForward size={14} />}
              disabled={goal.daysElapsed >= goal.targetDays}
              onClick={() => onAdvanceDay(goal.id)}
              title="Simulate advancing 1 day to test multi-day milestone check-ins"
            >
              +1 Day
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconRight={<ArrowRight size={14} />}
              onClick={onViewSchedule}
            >
              View on Schedule
            </Button>
          </div>
        }
      />

      <CardBody className="ops-stack-md">
        <div className="ops-stack-xs">
          <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
            <span className="ui-stat-label">
              Milestone Progress · Expected{' '}
              <strong className="tabular">{expectedPct}%</strong> vs Actual{' '}
              <strong className="tabular">{actualDraft}%</strong>
            </span>
            <span className="ui-stat-hint tabular">
              {progressDelta >= 0 ? `+${progressDelta}% vs pace` : `${progressDelta}% vs pace`}
            </span>
          </div>
          <ProgressBar percent={actualDraft} tone={progressTone} />
        </div>

        <Banner
          tone={
            goal.confidenceLevel === 'behind'
              ? 'amber'
              : goal.confidenceLevel === 'ahead'
              ? 'zone'
              : 'neutral'
          }
          icon={<Clock size={16} style={{ marginTop: '2px', flexShrink: 0 }} />}
        >
          <div className="ops-stack-xs">
            <strong>
              {goal.daysElapsed} {goal.daysElapsed === 1 ? 'day' : 'days'} in: You are supposed to be{' '}
              {expectedPct}% done with this project. How confident are you that you are on track?
            </strong>
            {goal.lastCheckInNote && (
              <span className="ui-stat-hint">Last check-in note: {goal.lastCheckInNote}</span>
            )}
          </div>
        </Banner>

        <div className="ops-stack-sm">
          <div className="ops-row-wrap" style={{ alignItems: 'flex-end', gap: '12px' }}>
            <div style={{ flex: '2 1 180px', minWidth: '150px' }}>
              <label htmlFor={`pct-range-${goal.id}`} className="ui-field-label">
                Actual Progress ({actualDraft}%)
              </label>
              <input
                id={`pct-range-${goal.id}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={actualDraft}
                onChange={(e) => setActualDraft(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            <div style={{ flex: '1 1 110px', minWidth: '90px' }}>
              <TextField
                id={`pct-num-${goal.id}`}
                label="% Done"
                type="number"
                min={0}
                max={100}
                value={actualDraft}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) {
                    setActualDraft(Math.max(0, Math.min(100, val)));
                  }
                }}
              />
            </div>

            <div style={{ flex: '2 1 200px', minWidth: '180px' }}>
              <TextField
                id={`note-${goal.id}`}
                label="Optional Check-In Note"
                placeholder="What shifted pace today?"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
            </div>
          </div>

          <div className="ops-row-wrap">
            <Button
              variant="tonal-amber"
              size="sm"
              style={{ flex: '1 1 auto', whiteSpace: 'normal', textAlign: 'center' }}
              iconLeft={<TrendingDown size={14} />}
              onClick={() => handleRecalibrate('behind')}
            >
              Behind Pace (+Add Time)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              style={{ flex: '1 1 auto', whiteSpace: 'normal', textAlign: 'center' }}
              iconLeft={<CheckCircle2 size={14} />}
              onClick={() => handleRecalibrate('on-track')}
            >
              On Track (Keep Pace)
            </Button>
            <Button
              variant="tonal-zone"
              size="sm"
              style={{ flex: '1 1 auto', whiteSpace: 'normal', textAlign: 'center' }}
              iconLeft={<TrendingUp size={14} />}
              onClick={() => handleRecalibrate('ahead')}
            >
              Ahead / Over-Scheduled (-Trim Blocks)
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

export const GoalPacingSection: React.FC = () => {
  const { state, actions } = useOpsStore();

  const activeIdeas = useMemo(
    () => state.ideas.filter((i) => i.status !== 'completed'),
    [state.ideas]
  );

  const [selectedIdeaId, setSelectedIdeaId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [project, setProject] = useState<string>(state.projects[0] ?? 'OHCR');
  const [targetDays, setTargetDays] = useState<number>(5);
  const [totalEstimatedHours, setTotalEstimatedHours] = useState<number>(6);
  const [dailyMinutesAllocated, setDailyMinutesAllocated] = useState<number>(60);

  const handleIdeaSelect = (ideaId: string) => {
    setSelectedIdeaId(ideaId);
    const idea = activeIdeas.find((i) => i.id === ideaId);
    if (idea) {
      setTitle(idea.title);
      setProject(idea.project);
      if (idea.estimatedMinutes) {
        const hrs = Math.max(2, Math.round((idea.estimatedMinutes * 4) / 60));
        setTotalEstimatedHours(hrs);
      }
    }
  };

  const handleScheduleGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    actions.schedulePacedGoal({
      title: cleanTitle,
      project,
      linkedIdeaId: selectedIdeaId || undefined,
      totalEstimatedHours: Math.max(1, Number(totalEstimatedHours) || 1),
      targetDays: Math.max(2, Number(targetDays) || 2),
      dailyMinutesAllocated: Math.max(25, Number(dailyMinutesAllocated) || 45),
    });

    setSelectedIdeaId('');
    setTitle('');
  };

  const upcomingBlocksByGoal = useMemo(() => {
    const counts = new Map<string, number>();
    state.blocks.forEach((b) => {
      if (
        b.kind === 'goal-session' &&
        b.assignedGoalId &&
        !b.completed &&
        b.date >= state.selectedDate
      ) {
        counts.set(b.assignedGoalId, (counts.get(b.assignedGoalId) ?? 0) + 1);
      }
    });
    return counts;
  }, [state.blocks, state.selectedDate]);

  return (
    <section className="ops-stack-md" aria-labelledby="pacing-section-heading">
      <div
        className="ui-section-heading"
        style={{ flexWrap: 'wrap', gap: '8px 12px', alignItems: 'center' }}
      >
        <div className="ops-row-wrap" style={{ alignItems: 'baseline', flex: '1 1 240px', minWidth: 0 }}>
          <h2 className="ui-section-title" id="pacing-section-heading">
            Multi-Day Goal Delegation &amp; Confidence Pacing
          </h2>
          <span className="ui-section-meta" style={{ whiteSpace: 'normal' }}>
            {state.pacedGoals.filter((g) => g.status === 'active').length} active multi-day goals
          </span>
        </div>
        <div className="ops-row-wrap">
          <Badge tone="streak" icon={<ShieldCheck size={13} />} style={{ whiteSpace: 'normal' }}>
            Recalibrations never break streaks
          </Badge>
        </div>
      </div>

      {/* Quick-Delegate Multi-Day Goal Card */}
      <Card>
        <CardHeader
          title={
            <span className="ops-row">
              <CalendarPlus size={16} />
              <span>Delegate Multi-Day Goal</span>
            </span>
          }
          subtitle="Break substantial ideas or bottlenecks into daily scheduled sessions across multiple days in 1 click."
        />
        <CardBody>
          <form onSubmit={handleScheduleGoal} className="ops-stack-sm">
            <div className="ops-row-wrap" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <SelectField
                  id="delegate-idea-select"
                  label="Link Idea / Bottleneck (Optional)"
                  value={selectedIdeaId}
                  onChange={(e) => handleIdeaSelect(e.target.value)}
                >
                  <option value="">Custom multi-day goal…</option>
                  {activeIdeas.map((idea) => (
                    <option key={idea.id} value={idea.id}>
                      [{idea.project} #{idea.priorityRank}] {idea.title}
                      {idea.isBottleneck ? ' (Bottleneck)' : ''}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div style={{ flex: '2 1 220px', minWidth: 0 }}>
                <TextField
                  id="delegate-goal-title"
                  label="Goal Title"
                  placeholder="e.g., OHCR Launch Blueprint Rollout"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ flex: '1 1 110px', minWidth: '100px' }}>
                <SelectField
                  id="delegate-goal-project"
                  label="Project"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  {state.projects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div style={{ flex: '1 1 110px', minWidth: '100px' }}>
                <TextField
                  id="delegate-target-days"
                  label="Target Days"
                  type="number"
                  min={2}
                  max={60}
                  value={targetDays}
                  onChange={(e) => setTargetDays(Number(e.target.value))}
                />
              </div>

              <div style={{ flex: '1 1 110px', minWidth: '100px' }}>
                <TextField
                  id="delegate-est-hours"
                  label="Est. Hours"
                  type="number"
                  min={1}
                  max={200}
                  step={0.5}
                  value={totalEstimatedHours}
                  onChange={(e) => setTotalEstimatedHours(Number(e.target.value))}
                />
              </div>

              <div style={{ flex: '1 1 110px', minWidth: '100px' }}>
                <TextField
                  id="delegate-daily-mins"
                  label="Daily Min"
                  type="number"
                  min={25}
                  max={240}
                  step={5}
                  value={dailyMinutesAllocated}
                  onChange={(e) => setDailyMinutesAllocated(Number(e.target.value))}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                style={{ flex: '1 0 180px' }}
                iconLeft={<Plus size={15} />}
                disabled={!title.trim()}
              >
                Schedule Across Days
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Active Goals + Pacing Recalibration Log Split */}
      <div className="ops-split-hub">
        <div className="ops-stack-md">
          {state.pacedGoals.length === 0 ? (
            <EmptyState message="No multi-day goals delegated yet. Use the bar above to spread a large idea across upcoming days." />
          ) : (
            state.pacedGoals.map((goal) => (
              <PacedGoalCard
                key={goal.id}
                goal={goal}
                upcomingBlockCount={upcomingBlocksByGoal.get(goal.id) ?? 0}
                onAdvanceDay={actions.advanceGoalDay}
                onViewSchedule={() => actions.setActiveTab('schedule')}
                onSubmitCheckIn={actions.submitConfidenceCheckIn}
              />
            ))
          )}
        </div>

        <aside className="ops-stack-md">
          <Banner
            tone="streak"
            icon={<Flame size={16} style={{ marginTop: '2px', flexShrink: 0 }} />}
          >
            <div className="ops-stack-xs">
              <strong>Protected Streak Immunity ({state.streak.currentDays}d)</strong>
              <span>{state.streak.protectionRuleNote}</span>
            </div>
          </Banner>

          <Card>
            <CardHeader
              title="Pacing Recalibration Log"
              subtitle="Automatic calendar updates from Confidence Check-Ins"
              action={<Badge tone="neutral">{state.pacingLogs.length}</Badge>}
            />
            <CardBody flush>
              {state.pacingLogs.length === 0 ? (
                <div className="ui-card-body">
                  <EmptyState message="Submit any Confidence Check-In to log dynamic schedule recalibrations." />
                </div>
              ) : (
                <div className="ui-divider-list">
                  {state.pacingLogs.map((log) => {
                    const meta = getConfidenceMeta(log.confidence);
                    const deltaLabel =
                      log.deltaMinutesPerDay > 0
                        ? `+${log.deltaMinutesPerDay}m/day`
                        : log.deltaMinutesPerDay < 0
                        ? `${log.deltaMinutesPerDay}m/day`
                        : 'Steady';

                    return (
                      <div key={log.id} className="ui-list-row" style={{ alignItems: 'flex-start' }}>
                        <div className="ops-stack-xs" style={{ minWidth: 0, flex: 1 }}>
                          <div className="ops-row-wrap">
                            <strong style={{ fontSize: 'var(--text-sm)' }}>{log.goalTitle}</strong>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </div>
                          <div className="ui-stat-hint tabular">
                            {formatShortDate(log.date)} · Day {log.daysElapsed} ({log.actualPct}%
                            actual vs {log.expectedPct}% expected) · {deltaLabel} ·{' '}
                            {log.blocksAdjustedCount}{' '}
                            {log.blocksAdjustedCount === 1 ? 'block' : 'blocks'} updated
                          </div>
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                            {log.summary}
                          </div>
                          <div className="ui-stat-hint">
                            Protected Streak: unaffected (Baseline + Reflection only)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </section>
  );
};
