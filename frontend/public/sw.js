self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    payload = null;
  }

  if (!payload) return;

  const title = payload.title || 'CampusLynk';
  const message = payload.message || 'You have a new notification';
  const entityType = payload.entityType || null;
  const entityId = payload.entityId || null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: message,
      icon: '/logo.png',
      data: {
        entityType,
        entityId,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const entityType = event.notification.data?.entityType || null;
  const entityId = event.notification.data?.entityId || null;
  const targetUrl =
    entityType === 'chat' && entityId
      ? `/chat?chatId=${encodeURIComponent(entityId)}`
      : '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
