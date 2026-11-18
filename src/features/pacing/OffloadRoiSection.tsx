import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SelectField,
  StatCard,
  TextField,
} from '../../components/ui';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import type { OffloadedTask, PaymentMethodType, WhyCategory } from '../../types/schema';

const CATEGORIES: Array<WhyCategory | 'Profitable Ops'> = [
  'Profitable Ops',
  'Organization',
  'Health',
  'Family',
  'School',
];

const PAYMENT_METHODS: PaymentMethodType[] = [
  'Hourly Contractor',
  'Flat-Rate Service',
  'Monthly Retainer',
  'Software Automation',
];

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

function getTaskRoiMetrics(task: OffloadedTask, hourlyRateDollars: number) {
  const safeHours = Math.max(0, task.hoursSaved);
  const impliedRate = safeHours > 0 ? task.costDollars / safeHours : task.costDollars;
  const reclaimedValue = safeHours * hourlyRateDollars;
  const netDelta = reclaimedValue - task.costDollars;
  return {
    impliedRate,
    reclaimedValue,
    netDelta,
    isPositive: netDelta > 0,
    isNegative: netDelta < 0,
  };
}

export const OffloadRoiSection: React.FC = () => {
  const { state, actions } = useOpsStore();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<WhyCategory | 'Profitable Ops'>('Profitable Ops');
  const [hoursSaved, setHoursSaved] = useState<number>(3);
  const [costDollars, setCostDollars] = useState<number>(90);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('Flat-Rate Service');
  const [paymentDetail, setPaymentDetail] = useState('');

  const totals = useMemo(() => {
    const totalHours = state.offloadedTasks.reduce((sum, t) => sum + t.hoursSaved, 0);
    const totalSpend = state.offloadedTasks.reduce((sum, t) => sum + t.costDollars, 0);
    const valueSaved = totalHours * state.hourlyRateDollars;
    const netRoi = valueSaved - totalSpend;
    const avgImpliedRate = totalHours > 0 ? totalSpend / totalHours : 0;
    const payingOffCount = state.offloadedTasks.filter(
      (t) => t.hoursSaved * state.hourlyRateDollars > t.costDollars
    ).length;

    return {
      totalHours,
      totalSpend,
      valueSaved,
      netRoi,
      avgImpliedRate,
      payingOffCount,
    };
  }, [state.offloadedTasks, state.hourlyRateDollars]);

  const draftPreview = useMemo(() => {
    const hrs = Math.max(0, Number(hoursSaved) || 0);
    const cost = Math.max(0, Number(costDollars) || 0);
    const implied = hrs > 0 ? cost / hrs : cost;
    const delta = hrs * state.hourlyRateDollars - cost;
    return { hrs, cost, implied, delta };
  }, [hoursSaved, costDollars, state.hourlyRateDollars]);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const hrs = Math.max(0.25, Number(hoursSaved) || 0.25);
    const cost = Math.max(0, Number(costDollars) || 0);

    actions.addOffloadedTask({
      title: cleanTitle,
      category,
      hoursSaved: hrs,
      costDollars: cost,
      paymentMethod,
      paymentDetail: paymentDetail.trim() || `${paymentMethod} ($${cost} total)`,
    });

    setTitle('');
    setPaymentDetail('');
  };

  return (
    <section className="ops-stack-md" aria-labelledby="offload-roi-heading">
      <div
        className="ui-section-heading"
        style={{ flexWrap: 'wrap', gap: '10px 16px', alignItems: 'center' }}
      >
        <div
          className="ops-row-wrap"
          style={{ alignItems: 'baseline', flex: '1 1 240px', minWidth: 0 }}
        >
          <h2 className="ui-section-title" id="offload-roi-heading">
            Offloaded Responsibilities &amp; Hourly ROI Check
          </h2>
          <span className="ui-section-meta" style={{ whiteSpace: 'normal' }}>
            {totals.payingOffCount} of {state.offloadedTasks.length} paying off vs $
            {state.hourlyRateDollars}/hr benchmark
          </span>
        </div>

        <div className="ops-row-wrap" style={{ alignItems: 'center' }}>
          <label
            htmlFor="profitable-hourly-rate"
            className="ui-stat-label"
            style={{ whiteSpace: 'nowrap' }}
          >
            Profitable Rate ($/hr)
          </label>
          <div style={{ width: '96px' }}>
            <TextField
              id="profitable-hourly-rate"
              type="number"
              min={0}
              step={5}
              value={state.hourlyRateDollars}
              onChange={(e) => actions.setHourlyRateDollars(Number(e.target.value))}
              aria-label="Profitable Hourly Rate in dollars per hour"
            />
          </div>
        </div>
      </div>

      {/* Aggregate ROI Summary Row */}
      <div className="ops-grid-stats">
        <StatCard
          label="Total Hours Saved"
          value={`${totals.totalHours.toFixed(1)} hrs`}
          hint={`Across ${state.offloadedTasks.length} offloaded tasks`}
        />
        <StatCard
          label="Total Delegation Spend"
          value={formatCurrency(totals.totalSpend)}
          hint={`Blended rate: $${totals.avgImpliedRate.toFixed(0)}/hr`}
        />
        <StatCard
          label="Value of Time Saved"
          value={formatCurrency(totals.valueSaved)}
          hint={`At $${state.hourlyRateDollars}/hr profitable rate`}
        />
        <StatCard
          label="Net ROI Gain / Loss"
          value={
            totals.netRoi >= 0
              ? `+${formatCurrency(totals.netRoi)}`
              : `-${formatCurrency(totals.netRoi)}`
          }
          badge={
            <Badge tone={totals.netRoi >= 0 ? 'streak' : 'danger'}>
              {totals.netRoi >= 0 ? 'Positive ROI' : 'Negative ROI'}
            </Badge>
          }
          hint="Reclaimed time value minus spend"
        />
      </div>

      {/* Quick-Add Offloaded Responsibility */}
      <Card>
        <CardHeader
          title={
            <span className="ops-row">
              <DollarSign size={16} />
              <span>Log Offloaded Responsibility</span>
            </span>
          }
          subtitle="Record delegated work, cost, and payment terms to test whether it beats your profitable hourly rate."
          action={
            draftPreview.hrs > 0 ? (
              <Badge
                tone={draftPreview.delta >= 0 ? 'streak' : 'danger'}
                style={{ whiteSpace: 'normal', maxWidth: '100%' }}
              >
                Preview: ${draftPreview.implied.toFixed(0)}/hr ·{' '}
                {draftPreview.delta >= 0
                  ? `Pays Off +${formatCurrency(draftPreview.delta)}`
                  : `Negative ROI -${formatCurrency(draftPreview.delta)}`}
              </Badge>
            ) : null
          }
        />
        <CardBody>
          <form onSubmit={handleAddTask} className="ops-stack-sm">
            <div className="ops-row-wrap" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '2 1 220px', minWidth: 0 }}>
                <TextField
                  id="offload-title"
                  label="Delegated Task"
                  placeholder="e.g., Weekly Invoice Reconciliation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ flex: '1 1 120px', minWidth: '110px' }}>
                <SelectField
                  id="offload-category"
                  label="Category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as WhyCategory | 'Profitable Ops')
                  }
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                <TextField
                  id="offload-hours"
                  label="Hrs Saved"
                  type="number"
                  min={0.25}
                  max={100}
                  step={0.25}
                  value={hoursSaved}
                  onChange={(e) => setHoursSaved(Number(e.target.value))}
                />
              </div>

              <div style={{ flex: '1 1 120px', minWidth: '100px' }}>
                <TextField
                  id="offload-cost"
                  label="Cost ($)"
                  type="number"
                  min={0}
                  step={1}
                  value={costDollars}
                  onChange={(e) => setCostDollars(Number(e.target.value))}
                />
              </div>

              <div style={{ flex: '1.2 1 150px', minWidth: '140px' }}>
                <SelectField
                  id="offload-payment-method"
                  label="Payment Method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodType)}
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div style={{ flex: '1.5 1 180px', minWidth: '140px' }}>
                <TextField
                  id="offload-payment-detail"
                  label="Payment Detail"
                  placeholder="e.g., Paid Fridays via ACH"
                  value={paymentDetail}
                  onChange={(e) => setPaymentDetail(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                style={{ flex: '1 0 150px' }}
                iconLeft={<Plus size={15} />}
                disabled={!title.trim()}
              >
                Log Offload
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Offloaded Tasks ROI Ledger */}
      <Card>
        <CardHeader
          title="Offload ROI Ledger"
          subtitle={`Comparing implied delegation cost against your $${state.hourlyRateDollars}/hr profitable rate`}
          action={<Badge tone="neutral">{state.offloadedTasks.length} logged</Badge>}
        />
        <CardBody flush>
          {state.offloadedTasks.length === 0 ? (
            <div className="ui-card-body">
              <EmptyState message="No offloaded responsibilities logged yet. Add one above to check its hourly ROI." />
            </div>
          ) : (
            <div className="ui-divider-list">
              {state.offloadedTasks.map((task) => {
                const metrics = getTaskRoiMetrics(task, state.hourlyRateDollars);

                return (
                  <div key={task.id} className="ui-list-row" style={{ flexWrap: 'wrap' }}>
                    <div className="ops-stack-xs" style={{ minWidth: 0, flex: '1 1 280px' }}>
                      <div className="ops-row-wrap">
                        <strong style={{ fontSize: 'var(--text-base)' }}>{task.title}</strong>
                        <Badge tone="why">{task.category}</Badge>
                        <Badge tone="neutral">{task.paymentMethod}</Badge>
                      </div>
                      <div className="ui-stat-hint tabular">
                        {task.hoursSaved} hrs saved · {formatCurrency(task.costDollars)} spent ·{' '}
                        {task.paymentDetail} · Logged {formatShortDate(task.dateLogged)}
                      </div>
                    </div>

                    <div
                      className="ops-row-wrap"
                      style={{
                        justifyContent: 'space-between',
                        maxWidth: '100%',
                        flex: '0 1 auto',
                      }}
                    >
                      <div className="ops-stack-xs" style={{ marginRight: '6px' }}>
                        <span className="ui-stat-label tabular">
                          Implied <strong>${metrics.impliedRate.toFixed(0)}/hr</strong> vs{' '}
                          <strong>${state.hourlyRateDollars}/hr</strong>
                        </span>
                        <span className="ui-stat-hint tabular">
                          Value reclaimed: {formatCurrency(metrics.reclaimedValue)}
                        </span>
                      </div>

                      <div className="ops-row" style={{ flexShrink: 0, marginLeft: 'auto' }}>
                        {metrics.isPositive ? (
                          <Badge tone="streak" icon={<CheckCircle2 size={13} />}>
                            Pays Off · +{formatCurrency(metrics.netDelta)}
                          </Badge>
                        ) : metrics.isNegative ? (
                          <Badge tone="danger" icon={<AlertTriangle size={13} />}>
                            Negative ROI · -{formatCurrency(metrics.netDelta)}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Break-Even · $0</Badge>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${task.title}`}
                          title="Delete offloaded task"
                          onClick={() => actions.deleteOffloadedTask(task.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </section>
  );
};
