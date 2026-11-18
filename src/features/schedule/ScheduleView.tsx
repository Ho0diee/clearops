import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Edit3,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CheckboxRow,
  EmptyState,
  SectionHeading,
  SegmentedControl,
  TimeBlock,
} from '../../components/ui';
import {
  addDaysISO,
  formatShortDate,
  getWeekDatesISO,
  useOpsStore,
} from '../../store/opsStore';
import type { CalendarBlock, ScheduleViewMode, WhyCategory } from '../../types/schema';

const TODAY_ANCHOR = '2026-11-17';
const WHY_CATEGORIES: WhyCategory[] = ['School', 'Health', 'Family', 'Organization'];

function isBlockOpenEmptyZone(block: CalendarBlock): boolean {
  if (block.kind !== 'empty-zone') return false;
  const workLabel = block.title.replace(/^Empty Zone\s*[—-]\s*/i, '').trim();
  return (
    !block.assignedIdeaId &&
    !block.assignedGoalId &&
    (/open focus slot|^empty zone$/i.test(block.title) || !workLabel)
  );
}

export const ScheduleView: React.FC = () => {
  const { state, actions } = useOpsStore();

  // Quick Add Block inline bar state
  const [showAddBar, setShowAddBar] = useState(false);
  const [newBlockMode, setNewBlockMode] = useState<'baseline' | 'empty-zone' | 'reminder'>(
    'baseline'
  );
  const [newTitle, setNewTitle] = useState('');
  const [newStartTime, setNewStartTime] = useState('16:00');
  const [newEndTime, setNewEndTime] = useState('17:00');
  const [newWhyCategory, setNewWhyCategory] = useState<WhyCategory>('School');

  // Inline Why Anchor editor state
  const [editingWhyCategory, setEditingWhyCategory] = useState<WhyCategory | null>(null);
  const [draftWhyText, setDraftWhyText] = useState('');

  // Inline Reminder quick-add state
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderTime, setReminderTime] = useState('17:30');

  // Active non-waiting ideas ordered by priorityRank and project order
  const activeIdeas = useMemo(() => {
    return state.ideas
      .filter((i) => i.status === 'active')
      .sort((a, b) => {
        if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
        const projA = state.projects.indexOf(a.project);
        const projB = state.projects.indexOf(b.project);
        if (projA !== projB) return (projA === -1 ? 99 : projA) - (projB === -1 ? 99 : projB);
        return a.isBottleneck === b.isBottleneck ? 0 : a.isBottleneck ? -1 : 1;
      });
  }, [state.ideas, state.projects]);

  const waitingOnCount = useMemo(
    () => state.ideas.filter((i) => i.status === 'waiting-on').length,
    [state.ideas]
  );

  const activeBottlenecksCount = useMemo(
    () => state.ideas.filter((i) => i.status === 'active' && i.isBottleneck).length,
    [state.ideas]
  );

  const dayBlocks = useMemo(() => {
    return state.blocks
      .filter((b) => b.date === state.selectedDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [state.blocks, state.selectedDate]);

  const dayReminders = useMemo(() => {
    return state.reminders
      .filter((r) => r.date === state.selectedDate)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return b.time.localeCompare(a.time);
      });
  }, [state.reminders, state.selectedDate]);

  const dayBaselines = useMemo(
    () => dayBlocks.filter((b) => b.kind === 'baseline'),
    [dayBlocks]
  );

  const remainingBaselinesCount = useMemo(
    () => dayBaselines.filter((b) => !b.completed).length,
    [dayBaselines]
  );

  const openEmptyZonesTodayCount = useMemo(
    () => dayBlocks.filter((b) => isBlockOpenEmptyZone(b) && !b.completed).length,
    [dayBlocks]
  );

  const assignedIdeaIdsOnDay = useMemo(() => {
    return new Set(
      dayBlocks
        .filter((b) => b.assignedIdeaId && !b.completed)
        .map((b) => b.assignedIdeaId as string)
    );
  }, [dayBlocks]);

  // Top active idea overall & top unassigned active idea for 1-click Empty Zone pull
  const topPriorityIdea = activeIdeas[0] ?? null;
  const topUnassignedIdea =
    activeIdeas.find((i) => !assignedIdeaIdsOnDay.has(i.id)) ?? topPriorityIdea;

  const weekDates = useMemo(
    () => getWeekDatesISO(state.selectedDate),
    [state.selectedDate]
  );

  const handleQuickCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim();
    if (newBlockMode === 'reminder') {
      actions.addReminder({
        date: state.selectedDate,
        time: newStartTime,
        title: cleanTitle || 'Scheduled Check-In Reminder',
        completed: false,
      });
      actions.showToast(`Added reminder at ${newStartTime}`);
    } else if (newBlockMode === 'empty-zone') {
      const zoneTitle = cleanTitle
        ? /^empty zone/i.test(cleanTitle)
          ? cleanTitle
          : `Empty Zone — ${cleanTitle}`
        : 'Empty Zone — Open Focus Slot';
      actions.addCalendarBlock({
        date: state.selectedDate,
        startTime: newStartTime,
        endTime: newEndTime,
        title: zoneTitle,
        kind: 'empty-zone',
        completed: false,
      });
      actions.showToast(`Added Empty Zone (${newStartTime}–${newEndTime})`);
    } else {
      actions.addCalendarBlock({
        date: state.selectedDate,
        startTime: newStartTime,
        endTime: newEndTime,
        title: cleanTitle || `${newWhyCategory} Commitment`,
        kind: 'baseline',
        completed: false,
        whyCategory: newWhyCategory,
      });
      actions.showToast(`Added ${newWhyCategory} baseline block (${newStartTime}–${newEndTime})`);
    }
    setNewTitle('');
    setShowAddBar(false);
  };

  const handleAddInlineReminder = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = reminderTitle.trim();
    if (!clean) return;
    actions.addReminder({
      date: state.selectedDate,
      time: reminderTime || '17:00',
      title: clean,
      completed: false,
    });
    actions.showToast(`Reminder "${clean}" set for ${reminderTime}`);
    setReminderTitle('');
  };

  const startEditingWhy = (cat: WhyCategory) => {
    setEditingWhyCategory(cat);
    setDraftWhyText(state.whyStatements[cat]);
  };

  const saveWhyStatement = (cat: WhyCategory) => {
    const clean = draftWhyText.trim();
    if (clean) {
      actions.updateWhyStatement(cat, clean);
    }
    setEditingWhyCategory(null);
  };

  return (
    <div className="ops-split-schedule">
      {/* LEFT COLUMN: CLEAR CALENDAR & WHY ANCHORS */}
      <div className="ops-stack-lg">
        <div className="ops-stack-md">
          {/* Calendar Top Control Bar */}
          <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <div className="ops-row-wrap" style={{ gap: '8px' }}>
              <SegmentedControl<ScheduleViewMode>
                ariaLabel="Schedule view mode"
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                ]}
                value={state.scheduleViewMode}
                onChange={actions.setScheduleViewMode}
              />

              <div className="ops-row" style={{ gap: '4px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Previous day or week"
                  onClick={() =>
                    actions.setSelectedDate(
                      addDaysISO(
                        state.selectedDate,
                        state.scheduleViewMode === 'week' ? -7 : -1
                      )
                    )
                  }
                >
                  <ChevronLeft size={14} />
                </Button>

                <Button
                  variant={state.selectedDate === TODAY_ANCHOR ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => actions.setSelectedDate(TODAY_ANCHOR)}
                >
                  Today
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Next day or week"
                  onClick={() =>
                    actions.setSelectedDate(
                      addDaysISO(
                        state.selectedDate,
                        state.scheduleViewMode === 'week' ? 7 : 1
                      )
                    )
                  }
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>

            <div
              className="ops-row-wrap"
              style={{
                gap: '8px',
                flex: '1 1 260px',
                justifyContent: 'space-between',
              }}
            >
              <div className="ops-row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 'var(--text-md)',
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatShortDate(state.selectedDate)}
                </span>

                {state.selectedDate === TODAY_ANCHOR && (
                  <Badge tone="zone">Active Today</Badge>
                )}
              </div>

              <div className="ops-row-wrap" style={{ gap: '6px' }}>
                <Button
                  variant="tonal-zone"
                  size="sm"
                  iconLeft={<Sparkles size={13} />}
                  onClick={() => {
                    actions.addCalendarBlock({
                      date: state.selectedDate,
                      startTime: '16:00',
                      endTime: '17:30',
                      title: 'Empty Zone — Open Focus Slot',
                      kind: 'empty-zone',
                      completed: false,
                    });
                    actions.showToast(
                      `Added open Empty Zone on ${formatShortDate(state.selectedDate)} (16:00–17:30)`
                    );
                  }}
                >
                  + Empty Zone
                </Button>

                <Button
                  variant={showAddBar ? 'primary' : 'secondary'}
                  size="sm"
                  iconLeft={<Plus size={14} />}
                  onClick={() => setShowAddBar((prev) => !prev)}
                >
                  Block
                </Button>
              </div>
            </div>
          </div>

          {/* Inline 1-Click Block / Empty Zone / Reminder Creator */}
          {showAddBar && (
            <form className="ui-capture-bar" onSubmit={handleQuickCreateSubmit}>
              <div className="ops-row-wrap" style={{ gap: '8px' }}>
                <select
                  className="ui-select"
                  aria-label="Block type"
                  style={{ width: 'auto', minWidth: '130px', flex: '1 1 120px' }}
                  value={newBlockMode}
                  onChange={(e) =>
                    setNewBlockMode(
                      e.target.value as 'baseline' | 'empty-zone' | 'reminder'
                    )
                  }
                >
                  <option value="baseline">Baseline Commitment</option>
                  <option value="empty-zone">Empty Zone (Focus)</option>
                  <option value="reminder">Time Reminder</option>
                </select>

                {newBlockMode === 'baseline' && (
                  <select
                    className="ui-select"
                    aria-label="Why category"
                    style={{ width: 'auto', minWidth: '120px', flex: '1 1 120px' }}
                    value={newWhyCategory}
                    onChange={(e) => setNewWhyCategory(e.target.value as WhyCategory)}
                  >
                    {WHY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        Why: {cat}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <input
                type="text"
                className="ui-capture-input-bare"
                placeholder={
                  newBlockMode === 'empty-zone'
                    ? 'Optional focus label (or leave blank for Open Focus Slot)...'
                    : newBlockMode === 'reminder'
                    ? 'Reminder title...'
                    : 'Commitment title (e.g. Operating Systems Seminar)...'
                }
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />

              <div className="ops-row-wrap" style={{ gap: '8px' }}>
                <input
                  type="time"
                  className="ui-input mono"
                  aria-label="Start time"
                  style={{
                    width: 'auto',
                    minWidth: '108px',
                    flex: '1 1 120px',
                    padding: '6px 8px',
                  }}
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                />
                {newBlockMode !== 'reminder' && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input
                      type="time"
                      className="ui-input mono"
                      aria-label="End time"
                      style={{
                        width: 'auto',
                        minWidth: '108px',
                        flex: '1 1 120px',
                        padding: '6px 8px',
                      }}
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                    />
                  </>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  style={{ flex: '1 0 auto' }}
                >
                  Save to {formatShortDate(state.selectedDate)}
                </Button>
              </div>
            </form>
          )}

          {/* DAY TIMELINE VIEW */}
          {state.scheduleViewMode === 'day' ? (
            dayBlocks.length === 0 ? (
              <EmptyState
                message={`No blocks scheduled on ${formatShortDate(state.selectedDate)}.`}
                action={
                  <div className="ops-row" style={{ justifyContent: 'center' }}>
                    <Button
                      variant="tonal-zone"
                      size="sm"
                      onClick={() =>
                        actions.addCalendarBlock({
                          date: state.selectedDate,
                          startTime: '10:00',
                          endTime: '11:30',
                          title: 'Empty Zone — Open Focus Slot',
                          kind: 'empty-zone',
                          completed: false,
                        })
                      }
                    >
                      + Seed Morning Empty Zone
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => actions.setSelectedDate(TODAY_ANCHOR)}
                    >
                      Jump to Today
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="ui-timeline" role="list" aria-label="Daily schedule timeline">
                {dayBlocks.map((block) => {
                  const openZone = isBlockOpenEmptyZone(block);
                  const assignedEmptyZone = block.kind === 'empty-zone' && !openZone;

                  let subtitleNode: React.ReactNode = undefined;
                  if (block.startingStepHint) {
                    subtitleNode = (
                      <div className="ops-row-wrap" style={{ marginTop: '2px' }}>
                        <Badge tone="zone">Starting step: {block.startingStepHint}</Badge>
                        {typeof block.spilloverCount === 'number' &&
                          block.spilloverCount > 0 && (
                            <Badge tone="neutral">
                              Spilled ×{block.spilloverCount}
                            </Badge>
                          )}
                      </div>
                    );
                  } else if (openZone) {
                    subtitleNode = (
                      <span>
                        Open focus slot · Ready for active priority (Waiting-On items
                        excluded)
                      </span>
                    );
                  } else if (block.kind === 'reflection') {
                    subtitleNode = (
                      <span>
                        End-of-day baseline checkoff &amp; guided reflection (locks Protected
                        Streak)
                      </span>
                    );
                  }

                  return (
                    <div
                      key={block.id}
                      className="ui-timeline-row"
                      role="listitem"
                    >
                      <div className="ui-timeline-hour">{block.startTime}</div>

                      <TimeBlock
                        startTime={block.startTime}
                        endTime={block.endTime}
                        title={block.title}
                        kind={block.kind}
                        completed={block.completed}
                        subtitle={subtitleNode}
                        whyCategory={
                          block.kind === 'baseline' ? block.whyCategory : undefined
                        }
                        whyTooltip={
                          block.whyCategory
                            ? state.whyStatements[block.whyCategory]
                            : undefined
                        }
                        onToggleComplete={() => actions.toggleBlockCompleted(block.id)}
                        actions={
                          <>
                            {assignedEmptyZone && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => actions.spilloverEmptyZone(block.id)}
                                iconRight={<ArrowRight size={13} />}
                                title="One-Tap Spillover: push unfinished work into the next open Empty Zone"
                              >
                                Spillover
                              </Button>
                            )}

                            {openZone && topUnassignedIdea && (
                              <Button
                                variant="tonal-zone"
                                size="sm"
                                style={{ maxWidth: '100%' }}
                                onClick={() =>
                                  actions.assignIdeaToBlock(
                                    block.id,
                                    topUnassignedIdea.id
                                  )
                                }
                                title={`Assign ${topUnassignedIdea.project} #${topUnassignedIdea.priorityRank}: ${topUnassignedIdea.title}`}
                              >
                                + Pull {topUnassignedIdea.project} #
                                {topUnassignedIdea.priorityRank}
                              </Button>
                            )}

                            {block.kind === 'reflection' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => actions.setReflectionOpen(true)}
                              >
                                Open Check-In
                              </Button>
                            )}

                            {block.kind === 'goal-session' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => actions.setActiveTab('pacing')}
                              >
                                Pacing Check-In
                              </Button>
                            )}

                            <button
                              type="button"
                              className="ui-command-mic"
                              style={{ marginLeft: 'auto' }}
                              aria-label={`Delete ${block.title}`}
                              title="Remove block"
                              onClick={() => actions.deleteCalendarBlock(block.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* WEEK 7-COLUMN OVERVIEW GRID */
            <div className="ops-stack-sm">
              <div
                className="ops-row-between"
                style={{ flexWrap: 'wrap', gap: '8px' }}
                aria-label="Week day quick jump"
              >
                <div
                  className="ops-row"
                  style={{
                    gap: '4px',
                    overflowX: 'auto',
                    maxWidth: '100%',
                    paddingBottom: '2px',
                  }}
                >
                  {weekDates.map((isoDate) => {
                    const isSelected = isoDate === state.selectedDate;
                    const shortLabel = formatShortDate(isoDate).split(',')[0];
                    const dayNum = isoDate.slice(8, 10).replace(/^0/, '');
                    return (
                      <Button
                        key={isoDate}
                        variant={isSelected ? 'primary' : 'secondary'}
                        size="sm"
                        style={{ padding: '4px 8px', minHeight: '28px' }}
                        onClick={() => {
                          actions.setSelectedDate(isoDate);
                          document
                            .getElementById(`week-col-${isoDate}`)
                            ?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'nearest',
                              inline: 'start',
                            });
                        }}
                      >
                        {shortLabel} {dayNum}
                      </Button>
                    );
                  })}
                </div>
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Swipe days →
                </span>
              </div>

              <div className="ui-week-grid" role="region" aria-label="Weekly schedule grid">
                {weekDates.map((isoDate) => {
                  const isSelected = isoDate === state.selectedDate;
                  const colBlocks = state.blocks
                    .filter((b) => b.date === isoDate)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));

                  return (
                    <div
                      key={isoDate}
                      id={`week-col-${isoDate}`}
                      className={`ui-week-day-col ${isSelected ? 'is-selected' : ''}`.trim()}
                    >
                      <div
                        className="ui-week-day-header"
                        onClick={() => actions.setSelectedDate(isoDate)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            actions.setSelectedDate(isoDate);
                          }
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 'var(--text-xs)',
                            color: isSelected
                              ? 'var(--accent-primary)'
                              : 'var(--text-primary)',
                          }}
                        >
                          {formatShortDate(isoDate)}
                        </span>
                        <Badge tone={isoDate === TODAY_ANCHOR ? 'zone' : 'neutral'}>
                          {colBlocks.length}
                        </Badge>
                      </div>

                      <div className="ops-stack-xs" style={{ flex: 1 }}>
                        {colBlocks.length === 0 ? (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--text-muted)',
                              paddingTop: '8px',
                            }}
                          >
                            Clear day
                          </span>
                        ) : (
                          colBlocks.map((b) => {
                            const openZone = isBlockOpenEmptyZone(b);
                            const assignedZone = b.kind === 'empty-zone' && !openZone;
                            return (
                              <div
                                key={b.id}
                                className={`ui-timeblock ui-timeblock-${b.kind} ${
                                  b.completed ? 'is-completed' : ''
                                }`.trim()}
                                style={{
                                  padding: '8px 10px',
                                  flexDirection: 'column',
                                  alignItems: 'flex-start',
                                  gap: '4px',
                                }}
                              >
                                <div
                                  className="ops-row-between"
                                  style={{ width: '100%', gap: '4px', minWidth: 0 }}
                                >
                                  <span className="ui-timeblock-range mono">
                                    {b.startTime}
                                  </span>
                                  {b.whyCategory && (
                                    <Badge
                                      tone="why"
                                      style={{
                                        maxWidth: '72px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                      }}
                                      title={`Why: ${b.whyCategory}`}
                                    >
                                      {b.whyCategory}
                                    </Badge>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: 'var(--text-xs)',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)',
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {b.title}
                                </div>
                                {assignedZone && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => actions.spilloverEmptyZone(b.id)}
                                  >
                                    Spillover →
                                  </Button>
                                )}
                                {openZone && topUnassignedIdea && (
                                  <Button
                                    variant="tonal-zone"
                                    size="sm"
                                    onClick={() =>
                                      actions.assignIdeaToBlock(
                                        b.id,
                                        topUnassignedIdea.id
                                      )
                                    }
                                  >
                                    + {topUnassignedIdea.project} #
                                    {topUnassignedIdea.priorityRank}
                                  </Button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        fullWidth
                        onClick={() => {
                          actions.setSelectedDate(isoDate);
                          actions.setScheduleViewMode('day');
                        }}
                      >
                        Inspect Day →
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* BASELINE RESPONSIBILITIES & WHY ANCHORS PANEL */}
        <Card>
          <CardHeader
            title={
              <span className="ops-row" style={{ flexWrap: 'wrap' }}>
                <Compass size={16} style={{ flexShrink: 0 }} />
                <span>Baseline Why Anchors — Family, School, Organization &amp; Health</span>
              </span>
            }
            subtitle="Every non-negotiable baseline obligation connects directly to one of your 4 core Why statements."
          />
          <CardBody flush>
            <div className="ui-divider-list">
              {WHY_CATEGORIES.map((category) => {
                const isEditing = editingWhyCategory === category;
                const countInWeek = state.blocks.filter(
                  (b) => b.kind === 'baseline' && b.whyCategory === category
                ).length;

                return (
                  <div key={category} className="ui-list-row">
                    <div className="ops-stack-xs" style={{ flex: 1, minWidth: 0 }}>
                      <div className="ops-row">
                        <Badge tone="why">Why: {category}</Badge>
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {countInWeek} baseline block{countInWeek === 1 ? '' : 's'}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="ops-row-wrap" style={{ marginTop: '4px' }}>
                          <input
                            type="text"
                            className="ui-input"
                            style={{ flex: '1 1 180px' }}
                            aria-label={`Edit ${category} Why statement`}
                            value={draftWhyText}
                            onChange={(e) => setDraftWhyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveWhyStatement(category);
                              if (e.key === 'Escape') setEditingWhyCategory(null);
                            }}
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            iconLeft={<Check size={13} />}
                            onClick={() => saveWhyStatement(category)}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 'var(--text-sm)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {state.whyStatements[category]}
                        </p>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="ops-row">
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<Edit3 size={13} />}
                          onClick={() => startEditingWhy(category)}
                        >
                          Edit Why
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* RIGHT COLUMN: DAILY REMINDER & PRIORITY QUEUE RAIL */}
      <aside className="ops-stack-md" aria-label="Daily Reminder and Priority Queue">
        <SectionHeading title="Daily Reminder & Priority Queue" />

        {/* 1. DAILY BRIEFING CARD */}
        <Card>
          <CardBody className="ops-stack-sm">
            <div className="ops-row-between">
              <h3 className="ui-card-title">Daily Briefing</h3>
              <Badge tone="neutral">{formatShortDate(state.selectedDate)}</Badge>
            </div>

            <div
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              {remainingBaselinesCount} baseline obligation
              {remainingBaselinesCount === 1 ? '' : 's'} remaining
            </div>

            <div className="ops-stack-xs" style={{ paddingTop: '4px' }}>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                }}
              >
                Top priority
              </span>
              {topPriorityIdea ? (
                <button
                  type="button"
                  onClick={() => actions.assignIdeaToNextEmptyZone(topPriorityIdea.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 'var(--text-md)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  title="Click to schedule into next open Empty Zone"
                >
                  {topPriorityIdea.project} #{topPriorityIdea.priorityRank}:{' '}
                  {topPriorityIdea.title}
                </button>
              ) : (
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  All active priorities complete
                </span>
              )}
            </div>

            <div className="ops-row-wrap" style={{ paddingTop: '4px' }}>
              <Badge
                tone="amber"
                icon={<AlertTriangle size={12} />}
                style={{ cursor: 'pointer' }}
                onClick={() => actions.setActiveTab('ideas')}
                title="Click to inspect flagged bottlenecks in Ideas & Checkups"
              >
                {activeBottlenecksCount} Flagged Bottleneck
                {activeBottlenecksCount === 1 ? '' : 's'}
              </Badge>

              {waitingOnCount > 0 && (
                <Badge
                  tone="neutral"
                  style={{ cursor: 'pointer' }}
                  onClick={() => actions.setActiveTab('ideas')}
                  title="Waiting-On items are hidden from Empty Zones until unblocked"
                >
                  {waitingOnCount} Waiting-On Hidden
                </Badge>
              )}
            </div>
          </CardBody>

          <CardFooter>
            <button
              type="button"
              onClick={() => {
                actions.setSelectedDate(TODAY_ANCHOR);
                actions.setScheduleViewMode('day');
              }}
              className="ops-row"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--accent-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>Today&apos;s Schedule</span>
              <ArrowRight size={14} />
            </button>

            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {openEmptyZonesTodayCount} open zone{openEmptyZonesTodayCount === 1 ? '' : 's'}
            </span>
          </CardFooter>
        </Card>

        {/* 2. PRIORITY QUEUE CARD (Active Non-Waiting Ideas Only) */}
        <Card>
          <CardHeader
            title="Priority Queue"
            subtitle="Active non-waiting priorities ready for Empty Zones"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => actions.setActiveTab('ideas')}
              >
                Hub →
              </Button>
            }
          />
          <CardBody className="ops-stack-xs">
            {activeIdeas.length === 0 ? (
              <EmptyState message="No active unblocked ideas in queue." />
            ) : (
              activeIdeas.slice(0, 4).map((idea, idx) => {
                const isScheduledToday = assignedIdeaIdsOnDay.has(idea.id);
                return (
                  <CheckboxRow
                    key={idea.id}
                    checked={false}
                    onChange={() =>
                      actions.updateIdea(idea.id, { status: 'completed' })
                    }
                    label={
                      <span>
                        {idea.project} #{idea.priorityRank}: {idea.title}
                      </span>
                    }
                    badge={
                      idea.isBottleneck ? (
                        <Badge tone="amber">Bottleneck</Badge>
                      ) : undefined
                    }
                    rightMeta={
                      <Button
                        variant={isScheduledToday ? 'tonal-zone' : 'secondary'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.assignIdeaToNextEmptyZone(idea.id);
                        }}
                        title={`Schedule "${idea.title}" into next open Empty Zone`}
                      >
                        {idx === 0 || isScheduledToday
                          ? 'Next'
                          : `${idea.estimatedMinutes ?? 30}m`}
                      </Button>
                    }
                  />
                );
              })
            )}
          </CardBody>
        </Card>

        {/* 3. REMINDERS CARD */}
        <Card>
          <CardHeader
            title="Reminders"
            subtitle={`Scheduled for ${formatShortDate(state.selectedDate)}`}
            action={
              <Badge tone="neutral">
                <Calendar size={11} />
                <span>{dayReminders.length}</span>
              </Badge>
            }
          />
          <CardBody className="ops-stack-sm">
            {dayReminders.length === 0 ? (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  padding: '4px 0',
                }}
              >
                No reminders for this date. Add one below or via the voice command bar.
              </div>
            ) : (
              <div className="ops-stack-xs">
                {dayReminders.map((rem) => (
                  <CheckboxRow
                    key={rem.id}
                    checked={rem.completed}
                    onChange={() => actions.toggleReminder(rem.id)}
                    strikeWhenDone
                    label={rem.title}
                    rightMeta={
                      <span
                        className="mono"
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {rem.time}
                      </span>
                    }
                  />
                ))}
              </div>
            )}

            <form
              onSubmit={handleAddInlineReminder}
              className="ops-row-wrap"
              style={{
                paddingTop: '8px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <input
                type="text"
                className="ui-input"
                style={{ flex: '1 1 140px', minWidth: '120px' }}
                placeholder="Quick reminder..."
                aria-label="New reminder title"
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
              />
              <input
                type="time"
                className="ui-input mono"
                aria-label="Reminder time"
                style={{ width: '104px', flex: '0 0 auto', padding: '7px 6px' }}
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm">
                Add
              </Button>
            </form>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
};
