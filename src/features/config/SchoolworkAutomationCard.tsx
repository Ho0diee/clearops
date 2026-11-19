import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Copy,
  ExternalLink,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
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

function extractGoogleSlideForIntuition(targetOrigin: string, courseId: string) {
  try {
    const svgLines = Array.from(document.querySelectorAll('svg text'))
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);

    const ariaLines = Array.from(
      document.querySelectorAll('g[aria-label], [role="img"][aria-label]')
    )
      .map((el) => (el.getAttribute('aria-label') || '').trim())
      .filter((s) => s.length > 3);

    const notesEl = document.querySelector(
      '#speakernotes-workspace, .punch-viewer-speakernotes-text-body'
    ) as HTMLElement | null;
    const notesText = notesEl ? (notesEl.innerText || notesEl.textContent || '').trim() : '';

    const chunkLines: string[] = [];
    const seen = new Set<string>();
    const strRegex = /"((?:\\.|[^"\\]){2,500})"/g;

    for (const sc of Array.from(document.scripts)) {
      const t = sc.textContent || '';
      if (t.indexOf('DOCS_modelChunk') === -1) continue;
      let m: RegExpExecArray | null;
      strRegex.lastIndex = 0;
      while ((m = strRegex.exec(t)) !== null) {
        let s = m[1];
        try {
          s = JSON.parse('"' + s + '"');
        } catch {
          // keep raw
        }
        s = String(s).replace(/\r/g, '').trim();
        if (!s || s.length < 2 || seen.has(s)) continue;
        if (
          /^(https?:|data:|blob:|#[0-9a-f]{3,8}$|g[0-9a-f_]{5,}$|[a-z]{1,3}\d+(_\d+)*$)/i.test(
            s
          )
        )
          continue;
        if (/^[A-Z0-9]+_[A-Z0-9_]+$/.test(s)) continue;
        if (
          s.indexOf(' ') === -1 &&
          !/(\d{1,2}\/\d{1,2}|\d{4}|due|lab|test|quiz|exam|hw|unit|mon|tue|wed|thu|fri)/i.test(
            s
          )
        )
          continue;
        if (/\S{60,}/.test(s)) continue;
        seen.add(s);
        chunkLines.push(s);
      }
    }

    const combined = [
      svgLines.length ? '--- Active Slide ---\n' + svgLines.join('\n') : '',
      ariaLines.length ? ariaLines.join('\n') : '',
      notesText ? '[Speaker Notes]:\n' + notesText : '',
      chunkLines.length ? '--- Presentation Slides ---\n' + chunkLines.join('\n') : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 140000);

    if (!combined.trim()) {
      alert('Open Ms. Fox’s Google Slide tab first so the bookmark can read the slide text.');
      return;
    }

    const payload = {
      courseId,
      slideUrl: location.href,
      slideTitle:
        document.title.replace(/\s*-\s*Google Slides$/i, '') ||
        courseId.toUpperCase() + ' Google Slide',
      rawText: combined,
      ts: Date.now(),
    };

    window.open(
      targetOrigin + '/#schoolwork-sync=' + encodeURIComponent(JSON.stringify(payload)),
      '_blank'
    );
  } catch (err) {
    alert('Bookmarklet error: ' + err);
  }
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

  const apiBase =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://airbnb710.com'
      : '';

  const prodOrigin = 'https://airbnb710.com';

  const ecoBookmarkletCode = useMemo(() => {
    const code = `(${extractGoogleSlideForIntuition.toString()})(${JSON.stringify(
      prodOrigin
    )},"eco");`;
    return `javascript:${encodeURIComponent(code)}`;
  }, []);

  const ecoSlideUrl = `https://docs.google.com/presentation/d/${ecoSlideId.trim()}/edit`;

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
      // Ignore offline
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
        actions.showToast('Saved Vercel schoolwork settings');
        await loadStatus();
      } else {
        actions.showToast(data.error || 'Could not save config');
      }
    } catch {
      actions.showToast('Could not reach Vercel schoolwork endpoint');
    } finally {
      setBusy(false);
    }
  };

  const handleRunRolloverNow = async () => {
    setBusy(true);
    try {
      const resp = await fetch(`${apiBase}/api/schoolwork/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-now' }),
      });
      const data = await resp.json();
      if (data.ok) {
        actions.showToast(`Vercel Check OK: ${data.summary || 'Up to date'}`);
        await loadStatus();
      } else {
        actions.showToast(data.error || 'Sync check failed');
      }
    } catch {
      actions.showToast('Could not reach Vercel schoolwork endpoint');
    } finally {
      setBusy(false);
    }
  };

  const handleWipeSyncedSchoolwork = async () => {
    const confirmed = window.confirm(
      'Wipe all auto-synced schoolwork blocks, in-class tags, and schoolwork notes? Your personal events, alerts, classes, and notes will stay untouched.'
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      const resp = await fetch(`${apiBase}/api/schoolwork/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'wipe-schoolwork' }),
      });
      const data = await resp.json();
      if (data.ok) {
        await actions.syncNow();
        actions.showToast(data.summary || 'Wiped all auto-synced schoolwork data');
        await loadStatus();
      } else {
        actions.showToast(data.error || 'Wipe failed');
      }
    } catch {
      actions.showToast('Could not reach Vercel schoolwork endpoint');
    } finally {
      setBusy(false);
    }
  };

  const isReady = Boolean(status?.hasGeminiKey);

  return (
    <Card>
      <CardHeader
        title="Schoolwork Auto-Extractor (Vercel · Direct Bookmark)"
        subtitle="1-click bookmark posts straight to airbnb710.com (zero local server needed) — Audiobook +20% buffer, 1hr Labs, 6pm night-before class alarms & 2hr rollovers."
        action={
          <div className="ops-row">
            <Badge tone={isReady ? 'streak' : 'zone'}>
              {isReady ? 'Vercel Ready ✓' : 'Setup'}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Settings2 size={14} />}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Hide' : 'Bookmark & Settings'}
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
                  <strong>Last Vercel Run:</strong> {status.lastSummary}
                </span>
              </Banner>
            )}

            <Banner tone="zone">
              <div className="ops-stack-xs" style={{ width: '100%' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  Direct-to-Vercel Eco Bookmark (Works on any computer — PC server NOT needed)
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  Drag the button below to your Chrome Bookmarks Bar once. Open Ms. Fox&apos;s Eco
                  slide and click the bookmark — it sends directly to{' '}
                  <strong>airbnb710.com</strong> (Gemini 4 Hydrogen + Audiobook +20% + 6pm class
                  alert).
                </div>
                <div className="ops-row-wrap" style={{ marginTop: 6 }}>
                  <a
                    draggable
                    ref={(el) => {
                      if (el) el.setAttribute('href', ecoBookmarkletCode);
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/uri-list', ecoBookmarkletCode);
                      e.dataTransfer.setData('text/plain', ecoBookmarkletCode);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      actions.showToast('Drag this button up to your Chrome Bookmarks Bar!');
                    }}
                    className="ui-btn ui-btn-primary ui-btn-sm"
                    style={{ textDecoration: 'none', cursor: 'grab' }}
                  >
                    <Bookmark size={14} />
                    <span>Sync Eco Slide → airbnb710</span>
                  </a>

                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Copy size={13} />}
                    onClick={async () => {
                      await navigator.clipboard.writeText(ecoBookmarkletCode);
                      actions.showToast('Copied direct-to-Vercel bookmarklet URL!');
                    }}
                  >
                    Copy Bookmark URL
                  </Button>

                  <a
                    href={ecoSlideUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <span>Open Eco Slide</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            </Banner>

            <div className="ops-split-equal">
              <TextField
                label="Eco (Ms. Fox) Google Slide ID"
                value={ecoSlideId}
                onChange={(e) => setEcoSlideId(e.target.value)}
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
                label="Lit (Mr. Lauby) Slide ID (Optional)"
                placeholder="Paste Slide ID when ready"
                value={litSlideId}
                onChange={(e) => setLitSlideId(e.target.value)}
              />
              <TextField
                label="Pre-Calc (Ms. Grover) Slide ID (Optional)"
                placeholder="Paste Slide ID when ready"
                value={precalcSlideId}
                onChange={(e) => setPrecalcSlideId(e.target.value)}
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

              <Button
                variant="tonal-zone"
                size="sm"
                disabled={busy}
                iconLeft={busy ? <RefreshCw size={14} /> : <Play size={14} />}
                onClick={handleRunRolloverNow}
              >
                Run Rollover Check Now
              </Button>

              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                iconLeft={<Trash2 size={14} />}
                onClick={handleWipeSyncedSchoolwork}
              >
                Wipe Synced Schoolwork
              </Button>
            </div>
          </div>
        </CardBody>
      )}
    </Card>
  );
};
