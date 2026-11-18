import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  Send,
  Share,
  Smartphone,
} from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader } from '../../components/ui';
import { useOpsStore } from '../../store/opsStore';
import {
  disableBackgroundPush,
  enableBackgroundPush,
  getPushClientStatus,
  sendTestPushNotification,
  type PushClientStatus,
} from '../../store/pushClient';

export const PushNotificationsCard: React.FC = () => {
  const { actions } = useOpsStore();
  const [status, setStatus] = useState<PushClientStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const next = await getPushClientStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    void refreshStatus();
    const onChanged = () => void refreshStatus();
    window.addEventListener('intuition:push-status-changed', onChanged);
    window.addEventListener('focus', onChanged);
    return () => {
      window.removeEventListener('intuition:push-status-changed', onChanged);
      window.removeEventListener('focus', onChanged);
    };
  }, [refreshStatus]);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const res = await enableBackgroundPush();
      actions.showToast(res.message);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      const res = await disableBackgroundPush();
      actions.showToast(res.message);
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async (delaySeconds: number) => {
    setBusy(true);
    try {
      const res = await sendTestPushNotification(delaySeconds);
      actions.showToast(res.message);
    } finally {
      setBusy(false);
    }
  };

  const capState = status?.state ?? 'ready-to-enable';

  const statusBadge = (() => {
    if (capState === 'active') {
      return (
        <Badge tone="streak">
          <CheckCircle2 size={12} />
          Active{status && status.deviceCount > 0 ? ` · ${status.deviceCount}` : ''}
        </Badge>
      );
    }
    if (capState === 'ios-needs-homescreen') {
      return (
        <Badge tone="amber">
          <Smartphone size={12} />
          Add to Home Screen
        </Badge>
      );
    }
    if (capState === 'denied') {
      return (
        <Badge tone="danger">
          <BellOff size={12} />
          Blocked
        </Badge>
      );
    }
    return (
      <Badge tone="neutral">
        <Bell size={12} />
        Off
      </Badge>
    );
  })();

  return (
    <Card>
      <CardHeader
        title="Phone Lock-Screen Alerts & Home Screen App"
        subtitle="Receive scheduled event alerts even when Intuition is closed or your screen is locked"
        action={statusBadge}
      />
      <CardBody className="ops-stack-md">
        {/* Home Screen Icon Preview Strip */}
        <div className="push-app-preview">
          <img
            src="/apple-touch-icon.png"
            alt="Intuition Home Screen app icon"
            width={48}
            height={48}
            className="push-app-icon-img"
          />
          <div className="ops-stack-xs" style={{ minWidth: 0 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Intuition Home Screen Icon Ready
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {status?.isStandalone
                ? 'Running as your installed Home Screen app.'
                : 'In Safari, tap Share → Add to Home Screen to install with the Intuition logo.'}
            </span>
          </div>
        </div>

        {capState === 'ios-needs-homescreen' && (
          <div className="push-ios-guide">
            <div className="push-ios-guide-title">
              <Share size={14} />
              <span>2 quick steps for iPhone background alerts</span>
            </div>
            <ol className="push-ios-steps">
              <li>
                In Safari, tap the <strong>Share</strong> button at the bottom and select{' '}
                <strong>Add to Home Screen</strong> (you&apos;ll see the Intuition logo).
              </li>
              <li>
                Open <strong>Intuition</strong> from your Home Screen icon, come back to{' '}
                <strong>Settings</strong>, and tap <strong>Enable Background Alerts</strong>.
              </li>
            </ol>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Apple requires web apps to be launched from the Home Screen before iOS allows
              lock-screen push notifications.
            </span>
          </div>
        )}

        {capState === 'ready-to-enable' && (
          <div className="ops-stack-sm">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={busy}
              iconLeft={<BellRing size={16} />}
              onClick={() => void handleEnable()}
            >
              {busy ? 'Connecting Push Alerts…' : 'Enable Background Phone Alerts'}
            </Button>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Delivers your event alerts (at start time or earlier) directly to your phone lock
              screen even when Intuition is closed.
            </span>
          </div>
        )}

        {capState === 'active' && (
          <div className="ops-stack-sm">
            <div className="ops-row-wrap" style={{ gap: 8 }}>
              <Button
                variant="primary"
                size="md"
                disabled={busy}
                iconLeft={<Send size={14} />}
                onClick={() => void handleTest(0)}
              >
                Send Test Now
              </Button>
              <Button
                variant="secondary"
                size="md"
                disabled={busy}
                iconLeft={<Clock size={14} />}
                onClick={() => void handleTest(10)}
              >
                Test in 10s (Close App)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                iconLeft={<BellOff size={13} />}
                onClick={() => void handleDisable()}
              >
                Turn Off
              </Button>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Tap <strong>Test in 10s</strong>, then swipe Intuition closed or lock your phone to
              verify lock-screen delivery. Timezone: <strong>{status?.timezone || 'America/New_York'}</strong>.
            </span>
          </div>
        )}

        {capState === 'denied' && (
          <div className="push-ios-guide">
            <div className="push-ios-guide-title">
              <BellOff size={14} />
              <span>Notifications are blocked for Intuition</span>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              On iPhone, open <strong>Settings → Notifications → Intuition</strong> and turn{' '}
              <strong>Allow Notifications</strong> on, then return here.
            </span>
          </div>
        )}

        {capState === 'unsupported' && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            This browser doesn&apos;t support Web Push. On iPhone, open{' '}
            <strong>airbnb710.com</strong> in Safari and tap <strong>Share → Add to Home Screen</strong>.
          </span>
        )}
      </CardBody>
    </Card>
  );
};
