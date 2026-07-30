// Push Notification handlers for DuelVerse
// This file is imported by the main Workbox service worker via importScripts

const SUPABASE_URL = 'https://xxttwzewtqxvpgefggah.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4dHR3emV3dHF4dnBnZWZnZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjY5NzQsImV4cCI6MjA3NTQ0Mjk3NH0.jhVKEu8tyid1gMnAxXZJdfrYt0a55eNpJT17hSdqtPQ';

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
    } catch (e) {
      console.error('❌ Erro ao fazer parse do payload:', e);
      notificationData.body = event.data.text();
    }
  }

  const uniqueTag = 'duelverse-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  const isDuelInvite = notificationData.data?.type === 'duel_invite';
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    requireInteraction: true,
    tag: isDuelInvite ? 'duel-invite-' + (notificationData.data?.inviteId || uniqueTag) : uniqueTag,
    vibrate: isDuelInvite ? [300, 100, 300, 100, 300, 100, 300] : [200, 100, 200, 100, 200],
    renotify: true,
  };

  if (isDuelInvite) {
    options.actions = [
      { action: 'accept_duel', title: '✅ Aceitar Duelo' },
      { action: 'reject_duel', title: '❌ Recusar' },
    ];
  }

  if (isDuelInvite) {
    event.waitUntil(
      Promise.all([
        self.registration.showNotification(notificationData.title, options),
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then((windowClients) => {
            for (const client of windowClients) {
              if ('focus' in client) {
                client.postMessage({ 
                  type: 'DUEL_INVITE_RECEIVED', 
                  inviteId: notificationData.data?.inviteId,
                  duelId: notificationData.data?.duelId 
                });
                return client.focus();
              }
            }
          })
      ])
    );
  } else {
    event.waitUntil(self.registration.showNotification(notificationData.title, options));
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notificação clicada:', event);
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  if (action === 'accept_duel' && data.inviteId && data.duelId) {
    event.waitUntil(
      // Update invite status via Supabase REST API, then open duel room
      fetch(`${SUPABASE_URL}/rest/v1/duel_invites?id=eq.${data.inviteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'accepted' }),
      })
      .then(() => {
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'ACCEPT_DUEL', duelId: data.duelId, inviteId: data.inviteId });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('/duel/' + data.duelId);
        }
      })
      .catch(err => {
        console.error('Error accepting duel:', err);
        if (self.clients.openWindow) {
          return self.clients.openWindow('/duel/' + data.duelId);
        }
      })
    );
    return;
  }

  if (action === 'reject_duel' && data.inviteId) {
    event.waitUntil(
      fetch(`${SUPABASE_URL}/rest/v1/duel_invites?id=eq.${data.inviteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'rejected' }),
      })
      .catch(err => console.error('Error rejecting duel:', err))
    );
    return;
  }

  // For duel invite body click (no action button), open the app
  if (data.type === 'duel_invite' && data.duelId) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          for (const client of windowClients) {
            if ('focus' in client) {
              client.focus();
              client.postMessage({ type: 'DUEL_INVITE_RECEIVED', duelId: data.duelId, inviteId: data.inviteId });
              return;
            }
          }
          if (self.clients.openWindow) {
            return self.clients.openWindow('/duel/' + data.duelId);
          }
        })
    );
    return;
  }

  const urlToOpen = data.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
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
