import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  Check,
  Edit3,
  Trash2,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  RankBadge,
  SegmentedControl,
  TextField,
  TogglePill,
} from '../../components/ui';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import type { IdeaItem } from '../../types/schema';

export type BottleneckFilterMode = 'all' | 'bottlenecks';

interface ProjectRankingColumnProps {
  selectedProject: string;
  onSelectProject: (project: string) => void;
  filterMode: BottleneckFilterMode;
  onSelectFilterMode: (mode: BottleneckFilterMode) => void;
}

export const ProjectRankingColumn: React.FC<ProjectRankingColumnProps> = ({
  selectedProject,
  onSelectProject,
  filterMode,
  onSelectFilterMode,
}) => {
  const { state, actions } = useOpsStore();
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [draftStepText, setDraftStepText] = useState<string>('');

  const activeIdeas = state.ideas.filter((i) => i.status === 'active');
  const activeBottlenecksCount = activeIdeas.filter((i) => i.isBottleneck).length;

  const projectOptions = [
    {
      value: 'ALL',
      label: 'All Projects',
      count: activeIdeas.length,
    },
    ...state.projects.map((proj) => ({
      value: proj,
      label: proj,
      count: activeIdeas.filter((i) => i.project === proj).length,
    })),
  ];

  const filterModeOptions: { value: BottleneckFilterMode; label: string; count?: number }[] = [
    { value: 'all', label: 'All Active', count: activeIdeas.length },
    { value: 'bottlenecks', label: 'Bottlenecks Only', count: activeBottlenecksCount },
  ];

  const visibleProjects =
    selectedProject === 'ALL'
      ? state.projects
      : state.projects.filter((p) => p === selectedProject);

  const startEditStep = (item: IdeaItem) => {
    setEditingStepId(item.id);
    setDraftStepText(item.startingStep);
  };

  const saveEditStep = (ideaId: string) => {
    const clean = draftStepText.trim();
    if (clean) {
      actions.updateIdea(ideaId, { startingStep: clean });
      actions.showToast('Updated concrete starting step');
    }
    setEditingStepId(null);
    setDraftStepText('');
  };

  return (
    <div className="ops-stack-md">
      <div className="ui-section-heading" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
        <div className="ops-row-wrap" style={{ alignItems: 'baseline', rowGap: '2px' }}>
          <h2 className="ui-section-title">Ranked Projects &amp; Bottlenecks</h2>
          <span className="ui-section-meta">
            {activeIdeas.length} active · {activeBottlenecksCount} flagged bottlenecks
          </span>
        </div>
      </div>

      <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <SegmentedControl<string>
          ariaLabel="Filter by project"
          options={projectOptions}
          value={selectedProject}
          onChange={onSelectProject}
        />

        <SegmentedControl<BottleneckFilterMode>
          ariaLabel="Filter active ideas vs bottlenecks"
          options={filterModeOptions}
          value={filterMode}
          onChange={onSelectFilterMode}
        />
      </div>

      {visibleProjects.map((projectName) => {
        const allProjectActive = activeIdeas
          .filter((i) => i.project === projectName)
          .sort((a, b) => a.priorityRank - b.priorityRank);

        const displayedItems =
          filterMode === 'bottlenecks'
            ? allProjectActive.filter((i) => i.isBottleneck)
            : allProjectActive;

        const projectWaitingCount = state.ideas.filter(
          (i) => i.project === projectName && i.status === 'waiting-on'
        ).length;

        const projectBottlenecksCount = allProjectActive.filter((i) => i.isBottleneck).length;

        return (
          <Card key={projectName}>
            <CardHeader
              title={projectName}
              subtitle={`${allProjectActive.length} ranked active${
                projectWaitingCount > 0 ? ` · ${projectWaitingCount} waiting-on` : ''
              }`}
              action={
                <div className="ops-row">
                  {projectBottlenecksCount > 0 && (
                    <Badge tone="amber" icon={<AlertTriangle size={12} />}>
                      {projectBottlenecksCount}{' '}
                      {projectBottlenecksCount === 1 ? 'Bottleneck' : 'Bottlenecks'}
                    </Badge>
                  )}
                </div>
              }
            />

            <CardBody flush>
              {displayedItems.length === 0 ? (
                <div className="ui-card-body">
                  <EmptyState
                    message={
                      filterMode === 'bottlenecks'
                        ? `No active bottlenecks flagged in ${projectName}.`
                        : `No active ranked items in ${projectName}. Capture one above.`
                    }
                  />
                </div>
              ) : (
                <div className="ui-divider-list">
                  {displayedItems.map((item) => {
                    const rankIdx = allProjectActive.findIndex((x) => x.id === item.id);
                    const isFirst = rankIdx <= 0;
                    const isLast = rankIdx === -1 || rankIdx >= allProjectActive.length - 1;

                    const scheduledBlock = state.blocks.find(
                      (b) => b.assignedIdeaId === item.id && !b.completed
                    );

                    const isEditingThisStep = editingStepId === item.id;

                    return (
                      <div key={item.id} className="ui-list-row">
                        <div
                          className="ops-row"
                          style={{ alignItems: 'flex-start', flex: 1, minWidth: 0 }}
                        >
                          <div className="ops-row" style={{ gap: '4px' }}>
                            <RankBadge rank={item.priorityRank} />
                            <div className="ops-stack-xs">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isFirst}
                                aria-label={`Move ${item.title} rank up`}
                                title="Move priority rank up"
                                onClick={() => actions.moveIdeaRank(item.id, 'up')}
                              >
                                <ArrowUp size={13} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isLast}
                                aria-label={`Move ${item.title} rank down`}
                                title="Move priority rank down"
                                onClick={() => actions.moveIdeaRank(item.id, 'down')}
                              >
                                <ArrowDown size={13} />
                              </Button>
                            </div>
                          </div>

                          <div className="ops-stack-xs" style={{ flex: 1, minWidth: 0 }}>
                            <div className="ops-row-wrap">
                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize: 'var(--text-md)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {item.title}
                              </span>

                              {item.isBottleneck && (
                                <Badge
                                  tone="amber"
                                  title="Click to unflag bottleneck"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => actions.toggleIdeaBottleneck(item.id)}
                                >
                                  Bottleneck
                                </Badge>
                              )}

                              {scheduledBlock && (
                                <Badge
                                  tone="primary"
                                  title="Click to view on Schedule"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    actions.setSelectedDate(scheduledBlock.date);
                                    actions.setActiveTab('schedule');
                                  }}
                                >
                                  Scheduled {formatShortDate(scheduledBlock.date)} ·{' '}
                                  {scheduledBlock.startTime}
                                </Badge>
                              )}
                            </div>

                            {isEditingThisStep ? (
                              <form
                                className="ops-row-wrap"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  saveEditStep(item.id);
                                }}
                              >
                                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                                  <TextField
                                    aria-label={`Edit starting step for ${item.title}`}
                                    value={draftStepText}
                                    onChange={(e) => setDraftStepText(e.target.value)}
                                    autoFocus
                                  />
                                </div>
                                <Button
                                  type="submit"
                                  variant="primary"
                                  size="sm"
                                  aria-label="Save starting step"
                                >
                                  <Check size={14} />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Cancel editing starting step"
                                  onClick={() => setEditingStepId(null)}
                                >
                                  <X size={14} />
                                </Button>
                              </form>
                            ) : (
                              <div className="ops-row-wrap">
                                <Badge
                                  tone="zone"
                                  title="Click to edit concrete starting step"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => startEditStep(item)}
                                  icon={<Edit3 size={12} />}
                                >
                                  Starting step: {item.startingStep}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          className="ops-row-wrap"
                          style={{
                            alignItems: 'center',
                            flexShrink: 0,
                            justifyContent: 'space-between',
                            maxWidth: '100%',
                          }}
                        >
                          {!item.isBottleneck && (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Flag ${item.title} as bottleneck`}
                              title="Flag as bottleneck"
                              onClick={() => actions.toggleIdeaBottleneck(item.id)}
                            >
                              <AlertTriangle size={14} />
                            </Button>
                          )}

                          <Button
                            variant="secondary"
                            size="sm"
                            iconLeft={<CalendarPlus size={14} />}
                            onClick={() => actions.assignIdeaToNextEmptyZone(item.id)}
                          >
                            Send to Empty Zone
                          </Button>

                          <TogglePill
                            active={item.status === 'waiting-on'}
                            onToggle={() => actions.toggleWaitingOn(item.id)}
                            label="Waiting On"
                            title="Move to Waiting-On (hides from daily Empty Zones until unblocked)"
                          />

                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${item.title}`}
                            title="Delete item"
                            onClick={() => actions.deleteIdea(item.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
};
