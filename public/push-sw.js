// Push Notification handlers for DuelVerse
// This file is imported by the main Workbox service worker via importScripts

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
      notificationData.body = event.data.text();
    }
  }

  // Use unique tag per notification to prevent replacing previous ones
  const uniqueTag = 'duelverse-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

  // Check if this is a duel invite notification - add action buttons
  const isDuelInvite = notificationData.data?.type === 'duel_invite';
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    requireInteraction: true,
    tag: uniqueTag,
    vibrate: [200, 100, 200, 100, 200],
    renotify: true,
  };

  if (isDuelInvite) {
    options.actions = [
      { action: 'accept_duel', title: '✅ Aceitar' },
      { action: 'reject_duel', title: '❌ Recusar' },
    ];
    options.vibrate = [300, 100, 300, 100, 300, 100, 300];
    options.requireInteraction = true;
  }

  const promiseChain = self.registration.showNotification(notificationData.title, options);

  event.waitUntil(promiseChain);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notificação clicada:', event);
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  // Handle duel invite actions
  if (action === 'accept_duel' && data.duelId) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          // Try to focus an existing window and navigate to duel
          for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            if ('focus' in client) {
              client.focus();
              client.postMessage({ type: 'ACCEPT_DUEL', duelId: data.duelId, inviteId: data.inviteId });
              return;
            }
          }
          // Open new window to duel room
          if (self.clients.openWindow) {
            return self.clients.openWindow('/duel/' + data.duelId);
          }
        })
    );
    return;
  }

  if (action === 'reject_duel') {
    // Just close the notification - the invite will timeout
    return;
  }

  const urlToOpen = data.url || '/';
  console.log('🔗 Abrindo URL:', urlToOpen);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});