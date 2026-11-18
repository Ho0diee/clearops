import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxRow,
  Drawer,
  EmptyState,
  TextArea,
  TextField,
} from '../../components/ui';
import { addDaysISO, formatShortDate, useOpsStore } from '../../store/opsStore';

function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back below if clipboard permission is denied
  }
  return false;
}

export const ReflectionDrawer: React.FC = () => {
  const { state, actions, reflectionPrompts } = useOpsStore();
  const [showRecentCheckIns, setShowRecentCheckIns] = useState(false);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportMarkdown, setExportMarkdown] = useState('');
  const exportPanelRef = useRef<HTMLDivElement | null>(null);

  const dayBaselines = useMemo(
    () => state.blocks.filter((b) => b.date === state.selectedDate && b.kind === 'baseline'),
    [state.blocks, state.selectedDate]
  );

  const reflectionBlock = useMemo(
    () => state.blocks.find((b) => b.date === state.selectedDate && b.kind === 'reflection'),
    [state.blocks, state.selectedDate]
  );

  const completedBaselineCount = dayBaselines.filter((b) => b.completed).length;
  const remainingBaselineCount = dayBaselines.length - completedBaselineCount;
  const isDateLocked = state.streak.completedDates.includes(state.selectedDate);
  const recentReflections = useMemo(() => state.reflections.slice(0, 3), [state.reflections]);

  const last7Days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, idx) => {
        const iso = addDaysISO(state.selectedDate, idx - 6);
        const [y, m, d] = iso.split('-').map(Number);
        const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
          weekday: 'narrow',
          timeZone: 'UTC',
        });
        return {
          iso,
          label,
          locked: state.streak.completedDates.includes(iso),
          isSelected: iso === state.selectedDate,
        };
      }),
    [state.selectedDate, state.streak.completedDates]
  );

  useEffect(() => {
    if (!state.isReflectionOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        actions.setReflectionOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isReflectionOpen, actions]);

  useEffect(() => {
    if (showExportPreview && exportPanelRef.current) {
      exportPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showExportPreview]);

  const handleCheckAllBaselines = () => {
    dayBaselines.forEach((block) => {
      if (!block.completed) {
        actions.toggleBlockCompleted(block.id);
      }
    });
  };

  const handleScheduleCheckInBlock = () => {
    actions.addCalendarBlock({
      date: state.selectedDate,
      startTime: '20:30',
      endTime: '20:50',
      title: 'Daily Self-Reflection Check-In',
      kind: 'reflection',
      completed: false,
    });
    actions.showToast(`Scheduled 20:30 Check-In block for ${formatShortDate(state.selectedDate)}`);
  };

  const handleNextPrompt = () => {
    if (reflectionPrompts.length === 0) return;
    const currentIndex = reflectionPrompts.indexOf(state.draftReflectionPrompt);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % reflectionPrompts.length;
    actions.setDraftReflectionPrompt(reflectionPrompts[nextIndex]);
  };

  const handleExportForGemini = () => {
    const markdown = actions.generateGeminiWeeklyExport();
    setExportMarkdown(markdown);
    setShowExportPreview((prev) => !prev);
    void copyTextToClipboard(markdown);
    actions.showToast('Copied formatted weekly brief for Gemini');
  };

  const handleCopyExport = () => {
    const markdown = exportMarkdown || actions.generateGeminiWeeklyExport();
    setExportMarkdown(markdown);
    void copyTextToClipboard(markdown);
    actions.showToast('Copied formatted weekly brief for Gemini');
  };

  const handleDownloadExport = () => {
    const markdown = exportMarkdown || actions.generateGeminiWeeklyExport();
    downloadMarkdownFile(`clearops-gemini-brief-${state.selectedDate}.md`, markdown);
    actions.showToast(`Downloaded clearops-gemini-brief-${state.selectedDate}.md`);
  };

  const handleCompleteReflection = () => {
    actions.completeDailyReflection();
  };

  const canLockStreak =
    remainingBaselineCount === 0 && state.draftReflectionText.trim().length > 0;

  useEffect(() => {
    if (showExportPreview) {
      setExportMarkdown(actions.generateGeminiWeeklyExport());
    }
  }, [showExportPreview, state.streak.currentDays, state.reflections.length, actions]);

  const drawerFooter = (
    <div className="ops-row-wrap" style={{ width: '100%', gap: '10px' }}>
      <Button
        variant="secondary"
        size="md"
        style={{ flex: '1 1 auto' }}
        iconLeft={<FileText size={15} />}
        iconRight={<Sparkles size={13} />}
        onClick={handleExportForGemini}
      >
        Export for Gemini
      </Button>
      <Button
        variant="primary"
        size="md"
        style={{ flex: '1 1 auto' }}
        iconLeft={isDateLocked ? <Check size={15} /> : <Lock size={14} />}
        onClick={handleCompleteReflection}
      >
        Complete Reflection &amp; Lock Streak
      </Button>
    </div>
  );

  return (
    <Drawer
      open={state.isReflectionOpen}
      onClose={() => actions.setReflectionOpen(false)}
      title="Daily Reflection & Report"
      footer={drawerFooter}
    >
      {/* 1. Protected Streaks Banner */}
      <Banner
        tone="streak"
        icon={<ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '2px' }} />}
        action={
          <Badge tone={isDateLocked ? 'streak' : 'neutral'}>
            {isDateLocked ? (
              <>
                <Check size={12} />
                {formatShortDate(state.selectedDate)} Locked
              </>
            ) : (
              'Open Today'
            )}
          </Badge>
        }
      >
        <div className="ops-stack-xs">
          <div style={{ fontWeight: 600 }}>
            {state.streak.currentDays}-Day Protected Streak · Counts Baseline + Reflection Only
          </div>
          <div style={{ fontSize: 'var(--text-xs)', opacity: 0.9 }}>
            (Timeline recalibrations &amp; Empty Zone spillovers never break streak) · Best:{' '}
            <strong className="tabular">{state.streak.bestDays}d</strong>
          </div>
          <div
            className="ops-row"
            style={{ gap: '6px', marginTop: '4px' }}
            aria-label="Recent 7-day protected streak history"
          >
            {last7Days.map((day) => (
              <span
                key={day.iso}
                title={`${formatShortDate(day.iso)}: ${day.locked ? 'Protected Streak Locked' : 'Not yet locked'}`}
                className="ops-stack-xs"
                style={{ alignItems: 'center', gap: '2px' }}
              >
                <span
                  className={`ui-checkbox-box ${day.locked ? 'is-checked-green' : ''}`.trim()}
                  style={{
                    width: '16px',
                    height: '16px',
                    minWidth: '16px',
                    borderColor: day.isSelected ? 'var(--streak-text)' : undefined,
                  }}
                >
                  {day.locked && <Check size={10} strokeWidth={3} />}
                </span>
                <span style={{ fontSize: '10px', fontWeight: day.isSelected ? 700 : 500 }}>
                  {day.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </Banner>

      {/* 2. Daily Report — End-of-Day Baseline Checklist & Quick Note */}
      <section className="ops-stack-sm" aria-label="End-of-Day Baseline Checklist">
        <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <div className="ops-row-wrap">
            <h3 className="ui-card-title">End-of-Day Baseline Checklist</h3>
            <span className="ui-section-meta tabular">
              {completedBaselineCount}/{dayBaselines.length} done
            </span>
          </div>

          {remainingBaselineCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<CheckCheck size={14} />}
              onClick={handleCheckAllBaselines}
            >
              Check All Baselines
            </Button>
          )}
        </div>

        {dayBaselines.length > 0 ? (
          <div className="ui-divider-list">
            {dayBaselines.map((block) => (
              <CheckboxRow
                key={block.id}
                checkTone="green"
                checked={block.completed}
                onChange={() => actions.toggleBlockCompleted(block.id)}
                label={block.title}
                badge={
                  block.whyCategory ? <Badge tone="why">Why: {block.whyCategory}</Badge> : undefined
                }
                rightMeta={
                  <span className="ui-section-meta mono">{block.startTime}</span>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            message={`No baseline obligations scheduled for ${formatShortDate(state.selectedDate)}.`}
          />
        )}

        <TextField
          value={state.draftDailyNote}
          onChange={(e) => actions.setDraftDailyNote(e.target.value)}
          placeholder="Quick daily note: Pushed OHCR #1 spillover to tomorrow's 10am Empty Zone..."
          aria-label="Quick daily note"
        />

        {/* Reflection Check-In Calendar Block Status */}
        <Card subtle style={{ padding: 'var(--space-2) var(--space-3)' }}>
          <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <div className="ops-row" style={{ fontSize: 'var(--text-xs)', minWidth: 0 }}>
              <Clock size={14} />
              {reflectionBlock ? (
                <span>
                  Daily Check-In scheduled:{' '}
                  <strong className="mono">
                    {reflectionBlock.startTime} - {reflectionBlock.endTime}
                  </strong>
                </span>
              ) : (
                <span>No reflection block scheduled on {formatShortDate(state.selectedDate)}.</span>
              )}
            </div>

            {reflectionBlock ? (
              <Badge tone={reflectionBlock.completed ? 'streak' : 'neutral'}>
                {reflectionBlock.completed ? 'Checked In' : 'Scheduled'}
              </Badge>
            ) : (
              <Button
                variant="tonal-zone"
                size="sm"
                iconLeft={<CalendarPlus size={14} />}
                onClick={handleScheduleCheckInBlock}
              >
                Schedule 20:30 Check-In Block
              </Button>
            )}
          </div>
        </Card>
      </section>

      {/* 3. Self-Reflection — Guided AI Prompts & Past History */}
      <section className="ops-stack-sm" aria-label="Guided Self-Reflection">
        <div className="ops-row-between">
          <h3 className="ui-card-title">Guided Self-Reflection</h3>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<RefreshCw size={13} />}
            onClick={handleNextPrompt}
          >
            Next Prompt
          </Button>
        </div>

        <div
          className="ui-card-subtle"
          style={{ padding: 'var(--space-3) var(--space-4)' }}
        >
          <div className="ops-row-between" style={{ alignItems: 'flex-start' }}>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
                lineHeight: 1.45,
              }}
            >
              <strong>Prompt:</strong> {state.draftReflectionPrompt}
            </p>
            <Sparkles
              size={15}
              style={{ flexShrink: 0, color: 'var(--text-muted)', marginTop: '2px' }}
              aria-hidden="true"
            />
          </div>
        </div>

        <TextArea
          rows={4}
          value={state.draftReflectionText}
          onChange={(e) => actions.setDraftReflectionText(e.target.value)}
          placeholder="What felt effortless today? Where did friction appear, and what stays protected tomorrow?"
          aria-label="Guided self-reflection response"
        />

        {!canLockStreak && !isDateLocked && (
          <div className="ui-section-meta">
            {remainingBaselineCount > 0
              ? `${remainingBaselineCount} baseline obligation${remainingBaselineCount === 1 ? '' : 's'} remaining to lock today's Protected Streak.`
              : 'Add at least one sentence above to lock today’s Protected Streak.'}
          </div>
        )}

        {/* Collapsible Recent Check-Ins */}
        <div className="ops-stack-xs">
          <div className="ops-row-between">
            <Button
              variant="ghost"
              size="sm"
              iconLeft={showRecentCheckIns ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              onClick={() => setShowRecentCheckIns((prev) => !prev)}
            >
              Recent Check-Ins ({recentReflections.length})
            </Button>
          </div>

          {showRecentCheckIns && (
            <Card>
              <CardBody flush>
                {recentReflections.length > 0 ? (
                  <div className="ui-divider-list">
                    {recentReflections.map((entry) => (
                      <div
                        key={entry.id}
                        className="ops-stack-xs"
                        style={{ padding: 'var(--space-3) var(--space-4)' }}
                      >
                        <div className="ops-row-between" style={{ flexWrap: 'wrap', gap: '6px' }}>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                            {formatShortDate(entry.date)}
                          </span>
                          <div className="ops-row">
                            <span className="ui-section-meta tabular">
                              {entry.completedBaselineIds.length}/{entry.baselineTotalCount} baselines
                            </span>
                            <Badge tone={entry.streakAwarded ? 'streak' : 'neutral'}>
                              {entry.streakAwarded ? 'Streak Locked' : 'Draft'}
                            </Badge>
                          </div>
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.45,
                          }}
                        >
                          {entry.reflectionResponse}
                        </p>
                        {entry.dailyNote && (
                          <div className="ui-section-meta">Note: {entry.dailyNote}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 'var(--space-3)' }}>
                    <EmptyState message="No past check-ins logged yet." />
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </section>

      {/* 4. Inline Gemini Export Preview & Download Panel */}
      {showExportPreview && (
        <div ref={exportPanelRef}>
          <Card>
            <CardHeader
              title="Gemini Weekly Brief (.md)"
              subtitle="Includes reflections, pacing recalibrations, bottlenecks & coaching prompts"
              action={
                <div className="ops-row-wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Copy size={13} />}
                    onClick={handleCopyExport}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="tonal-zone"
                    size="sm"
                    iconLeft={<Download size={13} />}
                    onClick={handleDownloadExport}
                  >
                    Download .md
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Close export preview"
                    onClick={() => setShowExportPreview(false)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              }
            />
            <CardBody>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  fontSize: 'var(--text-xs)',
                  lineHeight: 1.5,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-prompt)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3)',
                  maxHeight: '220px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {exportMarkdown}
              </pre>
            </CardBody>
          </Card>
        </div>
      )}
    </Drawer>
  );
};
