import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CheckboxRow,
  EmptyState,
  TextField,
  TogglePill,
} from '../../components/ui';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import type { IdeaItem } from '../../types/schema';

export const WaitingOnAndCheckupsColumn: React.FC = () => {
  const { state, actions } = useOpsStore();

  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [draftReason, setDraftReason] = useState<string>('');

  const [newBenchmarkByCheckup, setNewBenchmarkByCheckup] = useState<Record<string, string>>({});
  const [newDeliverableByCheckup, setNewDeliverableByCheckup] = useState<Record<string, string>>(
    {}
  );

  const waitingItems = state.ideas.filter((i) => i.status === 'waiting-on');

  const startEditingReason = (item: IdeaItem) => {
    setEditingReasonId(item.id);
    setDraftReason(
      item.waitingReason || `Externally blocked — resurfaces in ${item.project} checkup`
    );
  };

  const saveReason = (ideaId: string) => {
    actions.updateIdea(ideaId, {
      waitingReason: draftReason.trim() || 'Externally blocked — resurfaces in checkup',
    });
    actions.showToast('Updated Waiting-On note');
    setEditingReasonId(null);
    setDraftReason('');
  };

  const handleAddBenchmark = (checkupId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = (newBenchmarkByCheckup[checkupId] || '').trim();
    if (!text) return;
    actions.addCheckupBenchmark(checkupId, text);
    setNewBenchmarkByCheckup((prev) => ({ ...prev, [checkupId]: '' }));
    actions.showToast('Added standing checkup benchmark');
  };

  const handleAddDeliverable = (
    checkupId: string,
    currentDeliverables: string[],
    e: React.FormEvent
  ) => {
    e.preventDefault();
    const text = (newDeliverableByCheckup[checkupId] || '').trim();
    if (!text) return;
    actions.updateCheckupDeliverables(checkupId, [...currentDeliverables, text]);
    setNewDeliverableByCheckup((prev) => ({ ...prev, [checkupId]: '' }));
    actions.showToast('Added next week deliverable');
  };

  const handleRemoveDeliverable = (
    checkupId: string,
    currentDeliverables: string[],
    indexToRemove: number
  ) => {
    const updated = currentDeliverables.filter((_, idx) => idx !== indexToRemove);
    actions.updateCheckupDeliverables(checkupId, updated);
  };

  return (
    <div className="ops-stack-md">
      <div className="ui-section-heading" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
        <div className="ops-row-wrap" style={{ alignItems: 'baseline', rowGap: '2px' }}>
          <h2 className="ui-section-title">Waiting-On &amp; Recurring Checkups</h2>
          <span className="ui-section-meta">
            {waitingItems.length} hidden from Empty Zones
          </span>
        </div>
      </div>

      {/* 1. Waiting-On State Card (Hidden from Daily Empty Zones) */}
      <Card>
        <CardHeader
          title="Waiting On (Hidden from Empty Zones)"
          subtitle="Externally blocked items never clutter daily Empty Zones; they resurface automatically during project checkups."
          action={
            <Badge tone="amber" icon={<Clock size={12} />}>
              {waitingItems.length} waiting
            </Badge>
          }
        />

        <CardBody flush>
          {waitingItems.length === 0 ? (
            <div className="ui-card-body">
              <EmptyState message="Zero items in Waiting-On. Toggle 'Waiting On' on any blocked item to hide it from daily Empty Zones." />
            </div>
          ) : (
            <div className="ui-divider-list">
              {waitingItems.map((item) => {
                const isEditingReason = editingReasonId === item.id;
                const reasonText =
                  item.waitingReason || `Resurfaces in ${item.project} checkup`;

                return (
                  <div key={item.id} className="ui-list-row">
                    <div className="ops-stack-xs" style={{ flex: 1, minWidth: 0 }}>
                      <div className="ops-row-wrap">
                        <Badge tone="amber" icon={<Clock size={12} />}>
                          {item.project}
                        </Badge>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 'var(--text-sm)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {item.title}
                        </span>
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-secondary)',
                            wordBreak: 'break-word',
                          }}
                        >
                          — {reasonText}
                        </span>
                      </div>

                      {isEditingReason ? (
                        <form
                          className="ops-row-wrap"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveReason(item.id);
                          }}
                        >
                          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                            <TextField
                              aria-label={`Edit waiting reason for ${item.title}`}
                              value={draftReason}
                              onChange={(e) => setDraftReason(e.target.value)}
                              autoFocus
                            />
                          </div>
                          <Button type="submit" variant="primary" size="sm" aria-label="Save note">
                            <Check size={14} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Cancel note edit"
                            onClick={() => setEditingReasonId(null)}
                          >
                            <X size={14} />
                          </Button>
                        </form>
                      ) : (
                        <div className="ops-row-wrap">
                          <Badge tone="zone">Next step: {item.startingStep}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            iconLeft={<Edit3 size={12} />}
                            onClick={() => startEditingReason(item)}
                          >
                            Edit Note
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="ops-row-wrap">
                      <TogglePill
                        active={true}
                        onToggle={() => actions.toggleWaitingOn(item.id)}
                        label="Waiting On"
                        title="Click to restore to Active Queue"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 2. Recurring Project Checkups (CBS, OHCR, etc.) */}
      {state.checkups.map((chk) => {
        const projectWaitingBottlenecks = waitingItems.filter(
          (i) => i.project === chk.project
        );
        const checkedBenchmarksCount = chk.benchmarks.filter((b) => b.checked).length;
        const allBenchmarksChecked =
          chk.benchmarks.length > 0 && checkedBenchmarksCount === chk.benchmarks.length;

        return (
          <Card key={chk.id}>
            <CardHeader
              title={`${chk.project} — ${chk.cadenceLabel}`}
              subtitle={`Next review: ${formatShortDate(chk.nextReviewDate)} · Last locked: ${formatShortDate(chk.lastReviewedDate)}`}
              action={
                <Badge
                  tone={allBenchmarksChecked ? 'streak' : 'neutral'}
                  style={{ whiteSpace: 'normal', maxWidth: '100%' }}
                >
                  {checkedBenchmarksCount}/{chk.benchmarks.length} benchmarks · #{chk.completedCount}
                </Badge>
              }
            />

            <CardBody className="ops-stack-md">
              {/* Resurfaced Waiting-On Bottlenecks for this Project */}
              {projectWaitingBottlenecks.length > 0 && (
                <div className="ops-stack-xs">
                  <span className="ui-field-label">
                    Resurfaced Waiting-On Bottlenecks ({projectWaitingBottlenecks.length})
                  </span>
                  {projectWaitingBottlenecks.map((blocked) => (
                    <Banner
                      key={blocked.id}
                      tone="amber"
                      icon={<Clock size={15} />}
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          iconLeft={<RotateCcw size={13} />}
                          onClick={() => actions.toggleWaitingOn(blocked.id)}
                        >
                          Unblock
                        </Button>
                      }
                    >
                      <div className="ops-stack-xs">
                        <strong style={{ fontSize: 'var(--text-xs)' }}>{blocked.title}</strong>
                        <span style={{ fontSize: 'var(--text-xs)' }}>
                          {blocked.waitingReason || 'Externally blocked'}
                        </span>
                      </div>
                    </Banner>
                  ))}
                </div>
              )}

              {/* Standing Benchmarks */}
              <div className="ops-stack-xs">
                <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
                  <span className="ui-field-label" style={{ marginBottom: 0 }}>
                    Standing Benchmarks
                  </span>
                  <span className="ui-section-meta">
                    {checkedBenchmarksCount} of {chk.benchmarks.length} verified
                  </span>
                </div>

                <div>
                  {chk.benchmarks.map((bm) => (
                    <CheckboxRow
                      key={bm.id}
                      checked={bm.checked}
                      onChange={() => actions.toggleCheckupBenchmark(chk.id, bm.id)}
                      label={bm.label}
                    />
                  ))}
                </div>

                <form
                  className="ops-row-wrap"
                  onSubmit={(e) => handleAddBenchmark(chk.id, e)}
                >
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <TextField
                      placeholder={`Add standing ${chk.project} benchmark...`}
                      aria-label={`New standing benchmark for ${chk.project}`}
                      value={newBenchmarkByCheckup[chk.id] || ''}
                      onChange={(e) =>
                        setNewBenchmarkByCheckup((prev) => ({
                          ...prev,
                          [chk.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    iconLeft={<Plus size={14} />}
                  >
                    Benchmark
                  </Button>
                </form>
              </div>

              {/* Next Week's Deliverables */}
              <div className="ops-stack-xs">
                <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '6px 12px' }}>
                  <span className="ui-field-label" style={{ marginBottom: 0 }}>
                    Lock Next Week&apos;s {chk.nextWeekDeliverables.length} Deliverables
                  </span>
                  <Badge tone="zone">Promotes to {chk.project} Queue</Badge>
                </div>

                {chk.nextWeekDeliverables.length === 0 ? (
                  <EmptyState message="No deliverables queued for next week yet." />
                ) : (
                  <div className="ui-card-subtle">
                    <div className="ui-divider-list">
                      {chk.nextWeekDeliverables.map((deliv, idx) => (
                        <div
                          key={`${chk.id}-deliv-${idx}`}
                          className="ops-row-between"
                          style={{ padding: '8px 12px', gap: '8px' }}
                        >
                          <div className="ops-row" style={{ minWidth: 0, flex: 1 }}>
                            <Badge tone="neutral">{idx + 1}</Badge>
                            <span style={{ fontSize: 'var(--text-sm)', wordBreak: 'break-word' }}>
                              {deliv}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ flexShrink: 0 }}
                            aria-label={`Remove deliverable ${deliv}`}
                            onClick={() =>
                              handleRemoveDeliverable(
                                chk.id,
                                chk.nextWeekDeliverables,
                                idx
                              )
                            }
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <form
                  className="ops-row-wrap"
                  onSubmit={(e) =>
                    handleAddDeliverable(chk.id, chk.nextWeekDeliverables, e)
                  }
                >
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <TextField
                      placeholder={`Add next week deliverable for ${chk.project}...`}
                      aria-label={`New deliverable for ${chk.project}`}
                      value={newDeliverableByCheckup[chk.id] || ''}
                      onChange={(e) =>
                        setNewDeliverableByCheckup((prev) => ({
                          ...prev,
                          [chk.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    iconLeft={<Plus size={14} />}
                  >
                    Add
                  </Button>
                </form>
              </div>
            </CardBody>

            <CardFooter>
              <Button
                variant="secondary"
                size="md"
                fullWidth
                style={{ whiteSpace: 'normal', textAlign: 'center' }}
                iconLeft={<CheckCircle2 size={16} />}
                onClick={() => actions.completeProjectCheckup(chk.id, true)}
              >
                Complete Checkup &amp; Lock Deliverables
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
};
