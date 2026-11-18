import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FolderPlus,
  Globe,
  Layers,
  Plus,
  Server,
  Smartphone,
  Sparkles,
  Upload,
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
} from '../../components/ui';
import { useOpsStore } from '../../store/opsStore';
import { WhyAnchorsCard } from './WhyAnchorsCard';
import { SchoolworkAutomationCard } from './SchoolworkAutomationCard';
import { AIRBNB710_STR_PRESET, INITIAL_OPS_STATE } from '../../store/seedData';
import type { AccentThemeId } from '../../types/schema';

type PresetOptionId = 'airbnb710-str' | 'personal-cbs-ohcr';

interface ThemeSwatchOption {
  id: AccentThemeId;
  label: string;
  hex: string;
}

const THEME_SWATCHES: ThemeSwatchOption[] = [
  { id: 'cobalt', label: 'Cobalt Blue', hex: '#1D5EFF' },
  { id: 'obsidian', label: 'Obsidian Slate', hex: '#1F2937' },
  { id: 'sage', label: 'Sage Teal', hex: '#1D705E' },
  { id: 'coral', label: 'Hospitality Coral', hex: '#E03E52' },
  { id: 'amber', label: 'Warm Amber', hex: '#B45309' },
];

const DEPLOY_COMMAND = 'vercel --prod && vercel domains add airbnb710.com clearops';

export const SiteConfigView: React.FC = () => {
  const { state, actions } = useOpsStore();

  // Default to 'airbnb710-str' so the airbnb710.com hospitality preset is immediately ready in 1 tap
  const [selectedPreset, setSelectedPreset] = useState<PresetOptionId>('airbnb710-str');
  const [previewCheckedMap, setPreviewCheckedMap] = useState<Record<string, boolean>>({});
  const [newProjectInput, setNewProjectInput] = useState('');
  const [copiedDeploy, setCopiedDeploy] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  const targetUrl = state.siteConfig.targetDomain.trim().startsWith('http')
    ? state.siteConfig.targetDomain.trim()
    : `https://${state.siteConfig.targetDomain.trim() || 'airbnb710.com'}`;

  const presetSource =
    selectedPreset === 'airbnb710-str' ? AIRBNB710_STR_PRESET : INITIAL_OPS_STATE;

  const presetCheckup = presetSource.checkups[0];
  const liveMatchingCheckup = state.checkups.find((chk) => chk.id === presetCheckup?.id);
  const displayedBenchmarks = liveMatchingCheckup
    ? liveMatchingCheckup.benchmarks
    : presetCheckup?.benchmarks ?? [];

  const handleToggleBenchmark = (bmId: string, defaultChecked: boolean) => {
    if (liveMatchingCheckup) {
      actions.toggleCheckupBenchmark(liveMatchingCheckup.id, bmId);
      return;
    }
    setPreviewCheckedMap((prev) => ({
      ...prev,
      [bmId]: !(prev[bmId] ?? defaultChecked),
    }));
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectInput.trim();
    if (!trimmed) return;
    actions.addProject(trimmed);
    actions.showToast(`Added "${trimmed}" project bucket`);
    setNewProjectInput('');
  };

  const handleCopyDeployCommand = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(DEPLOY_COMMAND);
      }
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
    setCopiedDeploy(true);
    actions.showToast('Copied Railway deploy & domain command');
    window.setTimeout(() => setCopiedDeploy(false), 2200);
  };

  const handleExportConfig = async () => {
    const json = actions.exportSiteConfigJson();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      }
    } catch {
      // Ignore clipboard fallback
    }

    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'intuition-config.json';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      // Ignore download errors in headless environments
    }

    actions.showToast('Exported intuition-config.json & copied to clipboard');
  };

  const handleImportSubmit = () => {
    if (!importJsonText.trim()) {
      actions.showToast('Paste a valid Site Config JSON payload first');
      return;
    }
    const ok = actions.importSiteConfigJson(importJsonText);
    if (ok) {
      setImportJsonText('');
      setIsImportOpen(false);
    }
  };

  const isAirbnbPresetActive = state.siteConfig.activeTemplate === 'airbnb710-str';

  return (
    <div className="ops-stack-lg">
      {/* Top Section Header */}
      <div className="ops-row-between" style={{ flexWrap: 'wrap' }}>
        <div className="ops-stack-xs" style={{ minWidth: 0 }}>
          <h1 className="ui-section-title" style={{ fontSize: 'var(--text-xl)' }}>
            Site Configuration
          </h1>
          <span className="ui-section-meta" style={{ whiteSpace: 'normal' }}>
            Bind domain settings, brand accent, and 1-tap operations templates for{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {state.siteConfig.domainLabel || 'airbnb710.com'}
            </strong>
            .
          </span>
        </div>

        <Badge
          tone="zone"
          icon={
            <span
              aria-hidden="true"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--check-green)',
                display: 'inline-block',
              }}
            />
          }
        >
          Live: {state.siteConfig.domainLabel || 'airbnb710.com'}
        </Badge>
      </div>

      {/* Main 2-Column Split Hub (Stacks cleanly on 390x844 mobile) */}
      <div className="ops-split-hub">
        {/* LEFT / PRIMARY COLUMN */}
        <div className="ops-stack-md">
          <WhyAnchorsCard />
          {/* CARD 1: Website & Workspace Profile */}
          <Card>
            <CardHeader
              title="Website & Workspace Profile"
              subtitle="Live domain binding, workspace title, hourly ROI benchmark, and instant theme accent"
              action={
                <Badge tone="neutral">
                  <Globe size={12} />
                  {state.siteConfig.hostingProvider}
                </Badge>
              }
            />
            <CardBody className="ops-stack-md">
              {/* Target Domain + Open Site -> */}
              <div>
                <div className="ops-row-between" style={{ marginBottom: '5px' }}>
                  <label htmlFor="site-target-domain" className="ui-field-label" style={{ marginBottom: 0 }}>
                    Target Domain
                  </label>
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--accent-primary)',
                      textDecoration: 'none',
                    }}
                  >
                    <span>Open Site</span>
                    <ArrowRight size={13} />
                  </a>
                </div>
                <input
                  id="site-target-domain"
                  type="url"
                  className="ui-input"
                  value={state.siteConfig.targetDomain}
                  placeholder="https://airbnb710.com"
                  onChange={(e) =>
                    actions.updateSiteConfig({ targetDomain: e.target.value })
                  }
                />
              </div>

              {/* Workspace Name */}
              <div>
                <label htmlFor="site-workspace-name" className="ui-field-label">
                  Workspace Name
                </label>
                <input
                  id="site-workspace-name"
                  type="text"
                  className="ui-input"
                  value={state.siteConfig.workspaceName}
                  placeholder="Intuition"
                  onChange={(e) =>
                    actions.updateSiteConfig({ workspaceName: e.target.value })
                  }
                />
              </div>

              {/* Responsive Row: Profitable Rate ($/hr) + Brand Accent 5-Swatch Picker */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                  gap: 'var(--space-4)',
                  alignItems: 'end',
                }}
              >
                <div>
                  <label htmlFor="site-hourly-rate" className="ui-field-label">
                    Profitable Rate ($/hr)
                  </label>
                  <div
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: '12px',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        pointerEvents: 'none',
                      }}
                    >
                      $
                    </span>
                    <input
                      id="site-hourly-rate"
                      type="number"
                      min={0}
                      step={5}
                      className="ui-input tabular"
                      style={{ paddingLeft: '24px', paddingRight: '38px', fontWeight: 600 }}
                      value={state.hourlyRateDollars}
                      onChange={(e) =>
                        actions.setHourlyRateDollars(Number(e.target.value))
                      }
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        right: '12px',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        pointerEvents: 'none',
                      }}
                    >
                      /hr
                    </span>
                  </div>
                </div>

                <div>
                  <span className="ui-field-label">Brand Accent</span>
                  <div
                    className="ui-swatch-row"
                    role="radiogroup"
                    aria-label="Brand accent color theme"
                    style={{ minHeight: '38px' }}
                  >
                    {THEME_SWATCHES.map((swatch) => {
                      const selected = state.siteConfig.accentTheme === swatch.id;
                      return (
                        <button
                          key={swatch.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={swatch.label}
                          title={swatch.label}
                          className={`ui-swatch-btn ${selected ? 'is-selected' : ''}`.trim()}
                          style={{ backgroundColor: swatch.hex }}
                          onClick={() => {
                            actions.updateSiteConfig({ accentTheme: swatch.id });
                            actions.showToast(`Brand accent set to ${swatch.label}`);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* CARD 2: 1-Tap Operations Template & Checkup Rules */}
          <Card>
            <CardHeader
              title="1-Tap Operations Template & Checkup Rules"
              subtitle="Pre-populate project buckets, standing hospitality checkups, and daily schedule anchors"
              action={
                <Badge tone={isAirbnbPresetActive ? 'primary' : 'neutral'}>
                  {isAirbnbPresetActive ? 'airbnb710.com Active' : 'OHCR & CBS Active'}
                </Badge>
              }
            />
            <CardBody className="ops-stack-md">
              {/* Selectable Preset Cards */}
              <div className="ops-stack-sm" role="radiogroup" aria-label="Operations Workspace Preset">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedPreset === 'airbnb710-str'}
                  className={`ui-preset-card ${
                    selectedPreset === 'airbnb710-str' ? 'is-selected' : ''
                  }`.trim()}
                  onClick={() => setSelectedPreset('airbnb710-str')}
                >
                  <div className="ops-row" style={{ alignItems: 'flex-start', gap: '10px' }}>
                    <span
                      style={{
                        marginTop: '2px',
                        color:
                          selectedPreset === 'airbnb710-str'
                            ? 'var(--accent-primary)'
                            : 'var(--text-muted)',
                        display: 'inline-flex',
                      }}
                    >
                      <Check size={16} strokeWidth={2.5} />
                    </span>
                    <div className="ops-stack-xs">
                      <span
                        style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        Short-Term Rental / Hospitality Ops (airbnb710.com)
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        $95/hr benchmark · Direct booking launch, guest turnovers &amp; dynamic pricing
                      </span>
                    </div>
                  </div>
                  {state.siteConfig.activeTemplate === 'airbnb710-str' && (
                    <Badge tone="primary">Live</Badge>
                  )}
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedPreset === 'personal-cbs-ohcr'}
                  className={`ui-preset-card ${
                    selectedPreset === 'personal-cbs-ohcr' ? 'is-selected' : ''
                  }`.trim()}
                  onClick={() => setSelectedPreset('personal-cbs-ohcr')}
                >
                  <div className="ops-row" style={{ alignItems: 'flex-start', gap: '10px' }}>
                    <span
                      style={{
                        marginTop: '2px',
                        color:
                          selectedPreset === 'personal-cbs-ohcr'
                            ? 'var(--accent-primary)'
                            : 'var(--text-muted)',
                        display: 'inline-flex',
                      }}
                    >
                      <Check size={16} strokeWidth={2.5} />
                    </span>
                    <div className="ops-stack-xs">
                      <span
                        style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        Personal + Profitable Ops (OHCR &amp; CBS)
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        $85/hr benchmark · OHCR milestones, CBS field routes &amp; school/family baseline
                      </span>
                    </div>
                  </div>
                  {state.siteConfig.activeTemplate === 'personal-cbs-ohcr' && (
                    <Badge tone="primary">Live</Badge>
                  )}
                </button>
              </div>

              {/* Auto-configured Project Buckets */}
              <div className="ops-stack-sm">
                <span className="ui-field-label" style={{ marginBottom: 0 }}>
                  Auto-configured Project Buckets
                </span>
                <div className="ops-row-wrap">
                  {presetSource.projects.map((bucket) => (
                    <Badge key={bucket} tone="neutral">
                      {bucket}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Standing Checkup Benchmarks */}
              <div className="ops-stack-xs">
                <div className="ops-row-between">
                  <span className="ui-field-label" style={{ marginBottom: 0 }}>
                    Standing Checkup Benchmarks
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {presetCheckup?.cadenceLabel}
                  </span>
                </div>
                <div>
                  {displayedBenchmarks.map((bm) => {
                    const isChecked = liveMatchingCheckup
                      ? bm.checked
                      : previewCheckedMap[bm.id] ?? bm.checked;
                    return (
                      <CheckboxRow
                        key={bm.id}
                        checked={isChecked}
                        onChange={() => handleToggleBenchmark(bm.id, bm.checked)}
                        label={bm.label}
                        checkTone="primary"
                      />
                    );
                  })}
                </div>
              </div>

              {/* Primary & Merge Template Buttons */}
              <div
                className="ops-stack-sm"
                style={{
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  iconLeft={<Sparkles size={16} />}
                  onClick={() => actions.applySiteTemplate(selectedPreset, 'replace')}
                >
                  {selectedPreset === 'airbnb710-str'
                    ? 'Apply airbnb710.com Configuration'
                    : 'Apply OHCR & CBS Configuration'}
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  iconLeft={<Layers size={15} />}
                  onClick={() => actions.applySiteTemplate(selectedPreset, 'merge')}
                >
                  Merge Template Into Current Workspace
                </Button>
              </div>
            </CardBody>

            {isAirbnbPresetActive && (
              <CardFooter>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  <strong>airbnb710.com</strong> hospitality blocks &amp; checkups are live in your workspace.
                </span>
                <div className="ops-row">
                  <Button
                    variant="tonal-zone"
                    size="sm"
                    iconRight={<ArrowRight size={13} />}
                    onClick={() => actions.setActiveTab('schedule')}
                  >
                    Open Schedule
                  </Button>
                </div>
              </CardFooter>
            )}
          </Card>
        </div>

        {/* RIGHT / SECONDARY COLUMN */}
        <div className="ops-stack-md">
          {/* CARD 3: Custom Project Buckets Manager */}
          <Card>
            <CardHeader
              title="Custom Project Buckets Manager"
              subtitle="Tailor active buckets for airbnb710.com Ideas, Bottlenecks & Weekly Checkups"
              action={<Badge tone="neutral">{state.projects.length} Buckets</Badge>}
            />
            <CardBody className="ops-stack-md">
              <div className="ops-row-wrap">
                {state.projects.map((proj) => {
                  const activeIdeaCount = state.ideas.filter(
                    (i) => i.project === proj && i.status !== 'completed'
                  ).length;
                  const canRemove = state.projects.length > 1;
                  return (
                    <span
                      key={proj}
                      className="ui-badge ui-badge-neutral"
                      style={{
                        padding: '5px 10px',
                        gap: '6px',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{proj}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-surface)',
                          padding: '0 5px',
                          borderRadius: 'var(--radius-pill)',
                        }}
                      >
                        {activeIdeaCount}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${proj} bucket`}
                        disabled={!canRemove}
                        title={
                          canRemove
                            ? `Remove ${proj} bucket`
                            : 'At least one project bucket is required'
                        }
                        onClick={() => {
                          actions.removeProject(proj);
                          actions.showToast(`Removed "${proj}" bucket`);
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          cursor: canRemove ? 'pointer' : 'not-allowed',
                          padding: '1px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          opacity: canRemove ? 1 : 0.4,
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>

              <form onSubmit={handleAddProject} className="ops-row-wrap">
                <input
                  type="text"
                  className="ui-input"
                  style={{ flex: '1 1 180px', minWidth: 0 }}
                  placeholder="Add bucket (e.g. Direct Bookings, Maintenance)..."
                  aria-label="New project bucket name"
                  value={newProjectInput}
                  onChange={(e) => setNewProjectInput(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="md"
                  iconLeft={<Plus size={15} />}
                  disabled={!newProjectInput.trim()}
                >
                  Add Bucket
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* CARD 4: airbnb710.com Vercel + Cloudflare Domain & Mobile PWA Readiness */}
          <Card>
            <CardHeader
              title="airbnb710.com Vercel + Cloudflare & Mobile PWA Readiness"
              subtitle="Connected Git production pipeline, SPA rewrites, and configuration backup"
              action={
                <Badge tone="streak">
                  <CheckCircle2 size={12} />
                  Vercel Connected
                </Badge>
              }
            />
            <CardBody className="ops-stack-md">
              {/* Readiness Checklist */}
              <div className="ops-stack-sm">
                <div
                  className="ui-card-subtle"
                  style={{ padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}
                >
                  <Server
                    size={16}
                    style={{ color: 'var(--check-green)', marginTop: '2px', flexShrink: 0 }}
                  />
                  <div className="ops-stack-xs">
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                      <code className="mono">vercel.json</code> &amp;{' '}
                      <code className="mono">vite.config.ts</code>
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Configured with SPA client-side routing rewrites and{' '}
                      <code className="mono">airbnb710.com</code> auto-preset detection.
                    </span>
                  </div>
                </div>

                <div
                  className="ui-card-subtle"
                  style={{ padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}
                >
                  <Globe
                    size={16}
                    style={{ color: 'var(--check-green)', marginTop: '2px', flexShrink: 0 }}
                  />
                  <div className="ops-stack-xs">
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                      Vercel Git CI/CD (<code className="mono">Ho0diee/clearops</code>)
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Linked to Vercel with <code className="mono">airbnb710.com</code> attached — auto-deploys every push to <code className="mono">main</code>.
                    </span>
                  </div>
                </div>

                <div
                  className="ui-card-subtle"
                  style={{ padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}
                >
                  <Smartphone
                    size={16}
                    style={{ color: 'var(--check-green)', marginTop: '2px', flexShrink: 0 }}
                  />
                  <div className="ops-stack-xs">
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                      <code className="mono">manifest.webmanifest</code> Mobile Home Screen PWA
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Standalone Home Screen Web App enabled (<em>Add to Home Screen</em> on iOS Safari
                      &amp; Android Chrome).
                    </span>
                  </div>
                </div>
              </div>

              {/* 1-Click Copy Deploy Command */}
              <div className="ops-stack-xs">
                <span className="ui-field-label" style={{ marginBottom: 0 }}>
                  Vercel CLI Deploy &amp; Domain Command
                </span>
                <div
                  className="ops-row-between"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <code
                    className="mono"
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-primary)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {DEPLOY_COMMAND}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={copiedDeploy ? <Check size={13} /> : <Copy size={13} />}
                    onClick={handleCopyDeployCommand}
                  >
                    {copiedDeploy ? 'Copied' : 'Copy Command'}
                  </Button>
                </div>
              </div>

              {/* Export & Collapsible Import Site Config JSON */}
              <div
                className="ops-stack-sm"
                style={{
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  iconLeft={<Download size={16} />}
                  onClick={handleExportConfig}
                >
                  Export Site Config JSON
                </Button>

                <div className="ops-row-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={isImportOpen ? <X size={13} /> : <Upload size={13} />}
                    onClick={() => setIsImportOpen((prev) => !prev)}
                  >
                    {isImportOpen ? 'Cancel JSON Import' : 'Import Site Config JSON'}
                  </Button>
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                    }}
                  >
                    <span>Verify {state.siteConfig.domainLabel || 'airbnb710.com'}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                {isImportOpen && (
                  <div className="ops-stack-sm">
                    <textarea
                      className="ui-textarea mono"
                      style={{ fontSize: 'var(--text-xs)', minHeight: '110px' }}
                      placeholder='Paste exported "airbnb710-clearops-config.json" payload here...'
                      aria-label="Import Site Config JSON payload"
                      value={importJsonText}
                      onChange={(e) => setImportJsonText(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      iconLeft={<FolderPlus size={15} />}
                      onClick={handleImportSubmit}
                    >
                      Apply Imported Site Config JSON
                    </Button>
                  </div>
                )}
              </div>

              <Banner tone="neutral">
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  All changes persist automatically in browser storage and update the top bar domain
                  pill &amp; document title live.
                </span>
              </Banner>
            </CardBody>
          </Card>

          <SchoolworkAutomationCard />
        </div>
      </div>
    </div>
  );
};
