import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Play, RefreshCw, Settings2 } from 'lucide-react';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  CardHeader,
  TextField,
} from '../../components/ui';
import { useOpsStore } from '../../store/opsStore';

interface AutomationStatusResponse {
  ok: boolean;
  hasGeminiKey?: boolean;
  hasGoogleClientCreds?: boolean;
  hasGoogleRefreshToken?: boolean;
  connectedEmail?: string | null;
  slidesByCourse?: {
    eco?: string;
    lit?: string;
    precalc?: string;
  };
  lastRunAt?: string | null;
  lastSummary?: string | null;
}

export const SchoolworkAutomationCard: React.FC = () => {
  const { actions } = useOpsStore();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<AutomationStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const [ecoSlideId, setEcoSlideId] = useState(
    '1s0GUOKJdzfYvGJhxG7SHFZb-K9Cye0lDbdVtY7jutPI'
  );
  const [litSlideId, setLitSlideId] = useState('');
  const [precalcSlideId, setPrecalcSlideId] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');

  const apiBase =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://airbnb710.com'
      : '';

  const loadStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${apiBase}/api/schoolwork/run`);
      if (!resp.ok) return;
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return;
      const data = (await resp.json()) as AutomationStatusResponse;
      if (data.ok) {
        setStatus(data);
        if (data.slidesByCourse?.eco) setEcoSlideId(data.slidesByCourse.eco);
        if (data.slidesByCourse?.lit) setLitSlideId(data.slidesByCourse.lit);
        if (data.slidesByCourse?.precalc) setPrecalcSlideId(data.slidesByCourse.precalc);
      }
    } catch {
      // Endpoint becomes active as soon as deployed to Vercel
    }
  }, [apiBase]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSaveSettings = async () => {
    setBusy(true);
    try {
      const resp = await fetch(`${apiBase}/api/schoolwork/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-config',
          geminiApiKey: geminiKey || undefined,
          googleClientId: googleClientId || undefined,
          googleClientSecret: googleClientSecret || undefined,
          slidesByCourse: {
            eco: ecoSlideId,
            lit: litSlideId,
            precalc: precalcSlideId,
          },
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        setGeminiKey('');
        setGoogleClientSecret('');
        actions.showToast('Saved Vercel schoolwork automation config');
        await loadStatus();
      } else {
        actions.showToast(data.error || 'Could not save config');
      }
    } catch {
      actions.showToast('Deploy latest commit to Vercel first to enable cloud endpoint');
    } finally {
      setBusy(false);
    }
  };

  const handleRunTestNow = async () => {
    setBusy(true);
    try {
      const resp = await fetch(`${apiBase}/api/schoolwork/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-now', forceExtract: true }),
      });
      const data = await resp.json();
      if (data.ok) {
        actions.showToast(`Vercel Sync OK: ${data.summary || 'Updated calendar'}`);
        await loadStatus();
      } else {
        actions.showToast(data.error || 'Sync test returned an error');
      }
    } catch {
      actions.showToast('Deploy latest commit to Vercel first to run cloud sync');
    } finally {
      setBusy(false);
    }
  };

  const isFullyWired = Boolean(
    status?.hasGeminiKey && (status?.hasGoogleRefreshToken || status?.lastRunAt)
  );

  return (
    <Card>
      <CardHeader
        title="Schoolwork Auto-Extractor (Vercel Hourly Cron)"
        subtitle="Hands-off Eco, Lit & Pre-Calc extraction — Audiobook +20% buffer, 1hr Labs on assigned day, 6pm night-before class alarm & 2hr missed-window rollover."
        action={
          <div className="ops-row">
            <Badge tone={isFullyWired ? 'streak' : 'zone'}>
              {isFullyWired
                ? `Active · ${status?.connectedEmail || 'Connected'}`
                : 'Setup / Testing'}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Settings2 size={14} />}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Hide' : 'Configure & Test'}
            </Button>
          </div>
        }
      />

      {expanded && (
        <CardBody>
          <div className="ops-stack-md">
            {status?.lastSummary && (
              <Banner tone="streak">
                <span style={{ fontSize: 'var(--text-xs)' }}>
                  <strong>Last Cloud Run:</strong> {status.lastSummary}
                </span>
              </Banner>
            )}

            <div className="ops-split-equal">
              <TextField
                label="Eco (Ms. Fox) Google Slide ID"
                value={ecoSlideId}
                onChange={(e) => setEcoSlideId(e.target.value)}
              />
              <TextField
                label="Lit (Mr. Lauby) Google Slide ID (Optional)"
                placeholder="Paste Slide ID when ready"
                value={litSlideId}
                onChange={(e) => setLitSlideId(e.target.value)}
              />
            </div>

            <div className="ops-split-equal">
              <TextField
                label="Pre-Calc (Ms. Grover) Slide ID (Optional)"
                placeholder="Paste Slide ID when ready"
                value={precalcSlideId}
                onChange={(e) => setPrecalcSlideId(e.target.value)}
              />
              <TextField
                label={
                  status?.hasGeminiKey
                    ? 'Gemini 4 Hydrogen API Key (Saved ✓ — enter to replace)'
                    : 'Gemini 4 Hydrogen API Key'
                }
                type="password"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
            </div>

            <div className="ops-split-equal">
              <TextField
                label="Google Cloud OAuth Client ID (1-Time)"
                placeholder="...apps.googleusercontent.com"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
              />
              <TextField
                label="Google Cloud OAuth Client Secret (1-Time)"
                type="password"
                placeholder="GOCSPX-..."
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
              />
            </div>

            <div className="ops-row-wrap">
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                iconLeft={<CheckCircle2 size={14} />}
                onClick={handleSaveSettings}
              >
                Save Cloud Settings
              </Button>

              <a
                href={`${apiBase}/api/schoolwork/oauth?action=start`}
                className="ui-btn ui-btn-secondary ui-btn-sm"
                style={{ textDecoration: 'none' }}
              >
                <span>Connect School Google Account (1-Time)</span>
                <ExternalLink size={13} />
              </a>

              <Button
                variant="tonal-zone"
                size="sm"
                disabled={busy}
                iconLeft={busy ? <RefreshCw size={14} /> : <Play size={14} />}
                onClick={handleRunTestNow}
              >
                Run Cloud Sync Test Now
              </Button>
            </div>
          </div>
        </CardBody>
      )}
    </Card>
  );
};
