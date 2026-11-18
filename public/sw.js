/* Intuition Service Worker — Background Push Notifications (iOS Home Screen PWA + Desktop) */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Intuition Alert',
    body: 'You have an upcoming scheduled event.',
    tag: 'intuition-alert',
    url: '/',
    blockId: '',
    date: '',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        data = {
          title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : data.title,
          body: typeof parsed.body === 'string' ? parsed.body : data.body,
          tag: typeof parsed.tag === 'string' && parsed.tag.trim() ? parsed.tag : data.tag,
          url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url : '/',
          blockId: typeof parsed.blockId === 'string' ? parsed.blockId : '',
          date: typeof parsed.date === 'string' ? parsed.date : '',
        };
      }
    } catch {
      try {
        const text = event.data.text();
        if (text) data.body = text;
      } catch {
        /* ignore */
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: data.tag,
      renotify: true,
      data: {
        url: data.url,
        blockId: data.blockId,
        date: data.date,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = (event.notification && event.notification.data) || {};
  const blockId = typeof notifData.blockId === 'string' ? notifData.blockId : '';
  const date = typeof notifData.date === 'string' ? notifData.date : '';

  const params = new URLSearchParams();
  if (blockId) params.set('openBlock', blockId);
  if (date) params.set('date', date);
  const targetUrl = params.toString() ? `/?${params.toString()}` : notifData.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if (blockId) {
              client.postMessage({
                type: 'INTUITION_OPEN_BLOCK',
                blockId,
                date,
              });
            }
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
