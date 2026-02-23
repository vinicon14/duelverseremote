// Custom Service Worker for Push Notifications
// This extends the auto-generated PWA service worker

self.addEventListener('install', (event) => {
  console.log('✅ Service Worker instalado');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker ativado');
  event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('📩 Push notification recebida:', event);
  
  let notificationData = {
    title: 'Duelverse',
    body: 'Nova notificação',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: {},
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('📦 Payload recebido:', payload);
      
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        data: payload.data || payload,
      };
    } catch (e) {
      try {
        const text = event.data.text();
        notificationData.body = text;
      } catch (e2) {
        console.error('❌ Erro ao processar payload:', e2);
      }
    }
  }

  const promiseChain = self.registration.showNotification(notificationData.title, {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    requireInteraction: false,
    tag: 'duelverse-' + Date.now(),
    vibrate: [200, 100, 200],
  });

  event.waitUntil(promiseChain);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notificação clicada:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';
  console.log('🔗 Abrindo URL:', urlToOpen);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if ('focus' in client) {
            return client.focus().then((focusedClient) => {
              if (focusedClient && 'navigate' in focusedClient) {
                return focusedClient.navigate(urlToOpen);
              }
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});
