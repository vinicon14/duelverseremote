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

// Handle push notifications - Processa data messages do FCM
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
      // FCM envia os dados no formato { data: { ... } }
      const payload = event.data.json();
      console.log('📦 Payload recebido:', payload);
      
      // Extrai os dados do campo 'data' do FCM
      const data = payload.data || payload;
      
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge || notificationData.badge,
        data: data,
      };
      console.log('📋 Notificação processada:', notificationData);
    } catch (e) {
      console.error('❌ Erro ao fazer parse do payload:', e);
      // Tenta usar o texto direto
      notificationData.body = event.data.text();
    }
  }

  const promiseChain = self.registration.showNotification(notificationData.title, {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    requireInteraction: false,
    tag: 'duelverse-notification',
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
        // Check if there's already a window open
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            console.log('✅ Focando janela existente');
            return client.focus();
          }
        }
        // If no window is open, open a new one
        if (self.clients.openWindow) {
          console.log('🆕 Abrindo nova janela');
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});
