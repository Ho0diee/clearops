import React from 'react';
import { Check, X } from 'lucide-react';
import type { BlockKind, WhyCategory } from '../../types/schema';

/* ==========================================================================
   Button Primitive
   ========================================================================== */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'tonal-zone'
  | 'tonal-amber'
  | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  iconLeft,
  iconRight,
  children,
  className = '',
  type = 'button',
  ...rest
}) => {
  const classes = [
    'ui-btn',
    `ui-btn-${variant}`,
    `ui-btn-${size}`,
    fullWidth ? 'ui-btn-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
};

/* ==========================================================================
   Card & Section Primitives
   ========================================================================== */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  subtle?: boolean;
}

export const Card: React.FC<CardProps> = ({
  subtle = false,
  className = '',
  children,
  ...rest
}) => (
  <div className={`${subtle ? 'ui-card-subtle' : 'ui-card'} ${className}`.trim()} {...rest}>
    {children}
  </div>
);

export interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, subtitle, action }) => (
  <div className="ui-card-header">
    <div>
      <h3 className="ui-card-title">{title}</h3>
      {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
    </div>
    {action && <div className="ops-row">{action}</div>}
  </div>
);

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  flush?: boolean;
}

export const CardBody: React.FC<CardBodyProps> = ({
  flush = false,
  className = '',
  children,
  ...rest
}) => (
  <div className={`${flush ? 'ui-card-body-flush' : 'ui-card-body'} ${className}`.trim()} {...rest}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...rest
}) => (
  <div className={`ui-card-footer ${className}`.trim()} {...rest}>
    {children}
  </div>
);

export interface SectionHeadingProps {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({ title, meta, action }) => (
  <div className="ui-section-heading">
    <div className="ops-row">
      <h2 className="ui-section-title">{title}</h2>
      {meta && <span className="ui-section-meta">{meta}</span>}
    </div>
    {action && <div className="ops-row">{action}</div>}
  </div>
);

/* ==========================================================================
   Badge, RankBadge, Banner, StatCard, ProgressBar
   ========================================================================== */

export type BadgeTone =
  | 'neutral'
  | 'why'
  | 'zone'
  | 'amber'
  | 'streak'
  | 'primary'
  | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  icon,
  children,
  className = '',
  ...rest
}) => (
  <span className={`ui-badge ui-badge-${tone} ${className}`.trim()} {...rest}>
    {icon}
    {children}
  </span>
);

export const RankBadge: React.FC<{ rank: number }> = ({ rank }) => (
  <span className="ui-rank-badge">{rank}</span>
);

export interface BannerProps {
  tone?: 'streak' | 'zone' | 'amber' | 'neutral';
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export const Banner: React.FC<BannerProps> = ({
  tone = 'neutral',
  icon,
  children,
  action,
}) => (
  <div className={`ui-banner ui-banner-${tone}`}>
    <div className="ops-row" style={{ alignItems: 'flex-start' }}>
      {icon}
      <div>{children}</div>
    </div>
    {action && <div className="ops-row">{action}</div>}
  </div>
);

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  badge?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, hint, badge }) => (
  <div className="ui-stat-card">
    <div className="ops-row-between">
      <span className="ui-stat-label">{label}</span>
      {badge}
    </div>
    <div className="ui-stat-value">{value}</div>
    {hint && <div className="ui-stat-hint">{hint}</div>}
  </div>
);

export interface ProgressBarProps {
  percent: number;
  tone?: 'primary' | 'zone' | 'amber';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ percent, tone = 'primary' }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const toneClass = tone === 'zone' ? 'is-zone' : tone === 'amber' ? 'is-amber' : '';
  return (
    <div className="ui-progress-track" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={`ui-progress-fill ${toneClass}`.trim()} style={{ width: `${clamped}%` }} />
    </div>
  );
};

/* ==========================================================================
   SegmentedControl Primitive
   ========================================================================== */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ui-segmented-item ${active ? 'is-active' : ''}`.trim()}
            onClick={() => onChange(opt.value)}
          >
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span className="ui-segmented-count">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   TimeBlock Primitive (Baseline, Empty Zone, Goal Session, Reflection)
   ========================================================================== */

export interface TimeBlockProps {
  startTime: string;
  endTime: string;
  title: string;
  kind: BlockKind;
  completed?: boolean;
  subtitle?: React.ReactNode;
  whyCategory?: WhyCategory;
  whyTooltip?: string;
  onToggleComplete?: () => void;
  actions?: React.ReactNode;
}

export const TimeBlock: React.FC<TimeBlockProps> = ({
  startTime,
  endTime,
  title,
  kind,
  completed = false,
  subtitle,
  whyCategory,
  whyTooltip,
  onToggleComplete,
  actions,
}) => {
  return (
    <div
      className={`ui-timeblock ui-timeblock-${kind} ${completed ? 'is-completed' : ''}`.trim()}
    >
      <div className="ops-row" style={{ minWidth: 0, alignItems: 'flex-start', gap: '12px' }}>
        {onToggleComplete && (
          <button
            type="button"
            aria-label={`Mark ${title} ${completed ? 'incomplete' : 'complete'}`}
            onClick={onToggleComplete}
            className={`ui-checkbox-box ${completed ? 'is-checked-green' : ''}`.trim()}
            style={{ marginTop: '3px', cursor: 'pointer' }}
          >
            {completed && <Check size={12} strokeWidth={3} />}
          </button>
        )}
        <div className="ui-timeblock-main">
          <span className="ui-timeblock-range">
            {startTime} - {endTime}
          </span>
          <h4 className="ui-timeblock-title">{title}</h4>
          {subtitle && <div className="ui-timeblock-sub">{subtitle}</div>}
        </div>
      </div>

      <div className="ui-timeblock-actions">
        {whyCategory && (
          <Badge tone="why" title={whyTooltip}>
            Why: {whyCategory}
          </Badge>
        )}
        {actions}
      </div>
    </div>
  );
};

/* ==========================================================================
   CheckboxRow & TogglePill Primitives
   ========================================================================== */

export interface CheckboxRowProps {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  badge?: React.ReactNode;
  rightMeta?: React.ReactNode;
  checkTone?: 'primary' | 'green';
  strikeWhenDone?: boolean;
}

export const CheckboxRow: React.FC<CheckboxRowProps> = ({
  checked,
  onChange,
  label,
  badge,
  rightMeta,
  checkTone = 'primary',
  strikeWhenDone = false,
}) => {
  const boxClass = checked
    ? checkTone === 'green'
      ? 'is-checked-green'
      : 'is-checked-primary'
    : '';
  return (
    <div
      className="ui-checkbox-row"
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange();
        }
      }}
    >
      <div className="ui-checkbox-left">
        <span className={`ui-checkbox-box ${boxClass}`.trim()}>
          {checked && <Check size={12} strokeWidth={3} />}
        </span>
        <span
          className={`ui-checkbox-label ${checked && strikeWhenDone ? 'is-done' : ''}`.trim()}
        >
          {label}
        </span>
        {badge}
      </div>
      {rightMeta && <div className="ops-row">{rightMeta}</div>}
    </div>
  );
};

export interface TogglePillProps {
  active: boolean;
  onToggle: () => void;
  label: string;
  title?: string;
}

export const TogglePill: React.FC<TogglePillProps> = ({
  active,
  onToggle,
  label,
  title,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={active}
    title={title}
    className={`ui-toggle-pill ${active ? 'is-active' : ''}`.trim()}
    onClick={onToggle}
  >
    <span>{label}</span>
    <span className="ui-toggle-knob" />
  </button>
);

/* ==========================================================================
   Form Field Primitives
   ========================================================================== */

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const TextField: React.FC<TextFieldProps> = ({ label, id, className = '', ...rest }) => (
  <div>
    {label && (
      <label htmlFor={id} className="ui-field-label">
        {label}
      </label>
    )}
    <input id={id} className={`ui-input ${className}`.trim()} {...rest} />
  </div>
);

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  id,
  children,
  className = '',
  ...rest
}) => (
  <div>
    {label && (
      <label htmlFor={id} className="ui-field-label">
        {label}
      </label>
    )}
    <select id={id} className={`ui-select ${className}`.trim()} {...rest}>
      {children}
    </select>
  </div>
);

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, id, className = '', ...rest }) => (
  <div>
    {label && (
      <label htmlFor={id} className="ui-field-label">
        {label}
      </label>
    )}
    <textarea id={id} className={`ui-textarea ${className}`.trim()} {...rest} />
  </div>
);

/* ==========================================================================
   Right Slide-Over Drawer Primitive
   ========================================================================== */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
}) => {
  if (!open) return null;

  return (
    <div
      className="ui-drawer-scrim"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="ui-drawer-panel">
        <header className="ui-drawer-header">
          <h2 className="ui-drawer-title">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </Button>
        </header>
        <div className="ui-drawer-body">{children}</div>
        {footer && <footer className="ui-drawer-footer">{footer}</footer>}
      </aside>
    </div>
  );
};

/* ==========================================================================
   EmptyState Primitive
   ========================================================================== */

export const EmptyState: React.FC<{ message: React.ReactNode; action?: React.ReactNode }> = ({
  message,
  action,
}) => (
  <div className="ui-empty-state">
    <div>{message}</div>
    {action && <div style={{ marginTop: '10px' }}>{action}</div>}
  </div>
);
