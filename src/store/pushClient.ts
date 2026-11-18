export type PushCapabilityState =
  | 'active'
  | 'ready-to-enable'
  | 'ios-needs-homescreen'
  | 'denied'
  | 'unsupported';

export interface PushClientStatus {
  state: PushCapabilityState;
  isIos: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribedLocally: boolean;
  syncedWithServer: boolean;
  deviceCount: number;
  timezone: string;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports MacIntel with multi-touch points
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

export function supportsWebPush(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) {
    return isStandalonePwa() ? 'iPhone Home Screen' : 'iPhone Safari';
  }
  if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return isStandalonePwa() ? 'iPad Home Screen' : 'iPad Safari';
  }
  if (/Android/i.test(ua)) return 'Android Phone';
  if (/Mac/i.test(ua)) return 'Mac Browser';
  if (/Windows/i.test(ua)) return 'Windows Browser';
  return 'Web Device';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch {
    return null;
  }
}

async function fetchPushServerConfig(endpoint?: string): Promise<{
  ok: boolean;
  publicKey?: string;
  deviceCount?: number;
  timezone?: string;
  hasEndpoint?: boolean;
} | null> {
  const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  try {
    const res = await fetch(`/api/push/subscribe${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return (await res.json()) as {
      ok: boolean;
      publicKey?: string;
      deviceCount?: number;
      timezone?: string;
      hasEndpoint?: boolean;
    };
  } catch {
    return null;
  }
}

export async function getPushClientStatus(): Promise<PushClientStatus> {
  const isIos = isIosDevice();
  const isStandalone = isStandalonePwa();
  const tz = getLocalTimezone();

  // On iPhone/iPad Safari (not installed to Home Screen), Apple hides PushManager/Notification
  if (isIos && !isStandalone) {
    const serverCfg = await fetchPushServerConfig();
    return {
      state: 'ios-needs-homescreen',
      isIos,
      isStandalone,
      permission: 'unsupported',
      subscribedLocally: false,
      syncedWithServer: false,
      deviceCount: serverCfg?.deviceCount ?? 0,
      timezone: serverCfg?.timezone ?? tz,
    };
  }

  if (!supportsWebPush()) {
    return {
      state: 'unsupported',
      isIos,
      isStandalone,
      permission: 'unsupported',
      subscribedLocally: false,
      syncedWithServer: false,
      deviceCount: 0,
      timezone: tz,
    };
  }

  const permission = Notification.permission;
  let existingSub: PushSubscription | null = null;
  try {
    const reg = await registerServiceWorker();
    if (reg) {
      existingSub = await reg.pushManager.getSubscription();
    }
  } catch {
    /* ignore */
  }

  const serverCfg = await fetchPushServerConfig(existingSub?.endpoint);
  const subscribedLocally = Boolean(existingSub);
  const syncedWithServer = Boolean(existingSub && serverCfg?.hasEndpoint);

  let state: PushCapabilityState;
  if (permission === 'denied') {
    state = 'denied';
  } else if (permission === 'granted' && subscribedLocally) {
    state = 'active';
  } else {
    state = 'ready-to-enable';
  }

  return {
    state,
    isIos,
    isStandalone,
    permission,
    subscribedLocally,
    syncedWithServer,
    deviceCount: serverCfg?.deviceCount ?? 0,
    timezone: serverCfg?.timezone ?? tz,
  };
}

/**
 * Silently ensures an already-granted browser push subscription is synced with the backend.
 * Safe to call on app mount without prompting the user.
 */
export async function syncExistingPushSubscription(): Promise<void> {
  if (!supportsWebPush() || Notification.permission !== 'granted') return;
  try {
    const reg = await registerServiceWorker();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: json,
        timezone: getLocalTimezone(),
        deviceLabel: getDeviceLabel(),
      }),
    });
  } catch {
    /* ignore */
  }
}

export async function enableBackgroundPush(): Promise<{
  ok: boolean;
  message: string;
  deviceCount?: number;
}> {
  if (isIosDevice() && !isStandalonePwa()) {
    return {
      ok: false,
      message:
        'Add Intuition to your Home Screen via Safari Share first, then open it from your Home Screen.',
    };
  }

  if (!supportsWebPush()) {
    return {
      ok: false,
      message: 'This browser does not support Web Push notifications.',
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        message:
          permission === 'denied'
            ? 'Notifications are blocked. Allow Notifications for Intuition in your device Settings.'
            : 'Notification permission was dismissed.',
      };
    }

    const reg = await registerServiceWorker();
    if (!reg) {
      return {
        ok: false,
        message: 'Could not register the background service worker.',
      };
    }

    const readyReg = await navigator.serviceWorker.ready;
    const serverCfg = await fetchPushServerConfig();
    if (!serverCfg?.ok || !serverCfg.publicKey) {
      return {
        ok: false,
        message: 'Push server is not reachable yet. Make sure the latest version is deployed.',
      };
    }

    const appServerKey = urlBase64ToUint8Array(serverCfg.publicKey);
    let subscription = await readyReg.pushManager.getSubscription();

    // If an old subscription exists with a different VAPID key, rotate it cleanly
    if (subscription) {
      try {
        const existingKey = subscription.options?.applicationServerKey;
        if (existingKey) {
          const existingArr = new Uint8Array(existingKey);
          const mismatch =
            existingArr.length !== appServerKey.length ||
            existingArr.some((v, idx) => v !== appServerKey[idx]);
          if (mismatch) {
            await subscription.unsubscribe();
            subscription = null;
          }
        }
      } catch {
        /* keep existing */
      }
    }

    if (!subscription) {
      subscription = await readyReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }

    const json = subscription.toJSON();
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: json,
        timezone: getLocalTimezone(),
        deviceLabel: getDeviceLabel(),
      }),
    });

    const saveData = (await saveRes.json().catch(() => null)) as {
      ok?: boolean;
      deviceCount?: number;
      error?: string;
    } | null;

    if (!saveRes.ok || !saveData?.ok) {
      return {
        ok: false,
        message: saveData?.error || 'Could not save device subscription on the server.',
      };
    }

    window.dispatchEvent(new CustomEvent('intuition:push-status-changed'));

    return {
      ok: true,
      message: 'Background phone alerts are now active — even when Intuition is closed!',
      deviceCount: saveData.deviceCount ?? 1,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Could not enable push: ${err.message}`
          : 'Could not enable background push notifications.',
    };
  }
}

export async function disableBackgroundPush(): Promise<{ ok: boolean; message: string }> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined);
      }
    }
    window.dispatchEvent(new CustomEvent('intuition:push-status-changed'));
    return { ok: true, message: 'Background alerts turned off on this device.' };
  } catch {
    return { ok: false, message: 'Could not disable background alerts.' };
  }
}

export async function sendTestPushNotification(
  delaySeconds = 0
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ delaySeconds }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      mode?: string;
      sent?: number;
    } | null;

    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        message: data?.error || 'Could not send test notification.',
      };
    }

    if (delaySeconds > 0) {
      return {
        ok: true,
        message: `Test alert scheduled in ${delaySeconds}s — close Intuition or lock your phone now!`,
      };
    }
    return {
      ok: true,
      message: `Sent test notification to ${data.sent || 1} device${(data.sent || 1) === 1 ? '' : 's'}.`,
    };
  } catch {
    return {
      ok: false,
      message: 'Could not reach the push server.',
    };
  }
}
