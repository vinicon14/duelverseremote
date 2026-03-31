const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

app.setAppUserModelId('com.duelverse.desktop');

const REMOTE_URL = 'https://duelverse.site';
const BACKEND_URL = 'https://xxttwzewtqxvpgefggah.supabase.co';
const BACKEND_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4dHR3emV3dHF4dnBnZWZnZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjY5NzQsImV4cCI6MjA3NTQ0Mjk3NH0.jhVKEu8tyid1gMnAxXZJdfrYt0a55eNpJT17hSdqtPQ';
const NOTIFICATION_POLL_INTERVAL_MS = 15000;
const MAX_TRACKED_NOTIFICATIONS = 200;
let mainWindow;
let tray;
let authToken = null;
let authUserId = null;
let notificationPollInterval = null;
let knownNotificationIds = new Set();

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function trimKnownNotificationIds() {
  if (knownNotificationIds.size <= MAX_TRACKED_NOTIFICATIONS) return;
  const ids = Array.from(knownNotificationIds);
  knownNotificationIds = new Set(ids.slice(ids.length - MAX_TRACKED_NOTIFICATIONS));
}

function stopNotificationPolling() {
  if (notificationPollInterval) {
    clearInterval(notificationPollInterval);
    notificationPollInterval = null;
  }
}

async function fetchUnreadNotifications({ primeOnly = false } = {}) {
  if (!authToken || !authUserId) return;

  try {
    const url = new URL(`${BACKEND_URL}/rest/v1/notifications`);
    url.searchParams.set('select', 'id,title,message,created_at,read,type,data');
    url.searchParams.set('user_id', `eq.${authUserId}`);
    url.searchParams.set('read', 'eq.false');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '20');

    const response = await fetch(url, {
      headers: {
        apikey: BACKEND_ANON_KEY,
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Notification polling failed with status ${response.status}`);
    }

    const notifications = await response.json();
    if (!Array.isArray(notifications)) return;

    if (primeOnly) {
      for (const notification of notifications) {
        if (notification?.id) {
          knownNotificationIds.add(notification.id);
        }
      }
      trimKnownNotificationIds();
      return;
    }

    const freshNotifications = notifications
      .filter((notification) => notification?.id && !knownNotificationIds.has(notification.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (const notification of freshNotifications) {
      knownNotificationIds.add(notification.id);
      
      const isDuelInvite = notification.type === 'duel_invite';
      
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: notification.title || 'Duelverse',
          body: notification.message || 'Você recebeu uma nova notificação.',
          icon: path.join(__dirname, 'icon.png'),
          urgency: isDuelInvite ? 'critical' : 'normal',
        });
        notif.on('click', () => {
          showMainWindow();
          if (isDuelInvite && notification.data?.duel_id) {
            mainWindow.webContents.executeJavaScript(
              `window.location.hash = ''; window.location.href = '/duel/${notification.data.duel_id}';`
            );
          }
        });
        notif.show();
      }

      // For duel invites, force-show the window so the in-app overlay with audio triggers
      if (isDuelInvite) {
        showMainWindow();
      }
    }

    trimKnownNotificationIds();
  } catch (error) {
    console.error('[Electron] Failed to poll notifications:', error);
  }
}

// Also poll duel_invites directly for faster response
async function pollDuelInvites() {
  if (!authToken || !authUserId) return;

  try {
    const url = new URL(`${BACKEND_URL}/rest/v1/duel_invites`);
    url.searchParams.set('select', 'id,sender_id,duel_id,created_at');
    url.searchParams.set('receiver_id', `eq.${authUserId}`);
    url.searchParams.set('status', 'eq.pending');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      headers: {
        apikey: BACKEND_ANON_KEY,
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) return;
    const invites = await response.json();
    if (!Array.isArray(invites) || invites.length === 0) return;

    const invite = invites[0];
    const inviteKey = `invite_${invite.id}`;
    if (knownNotificationIds.has(inviteKey)) return;
    knownNotificationIds.add(inviteKey);

    // Force show window so the web DuelCallNotification overlay activates with audio
    showMainWindow();
    
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: '⚔️ Desafio de Duelo!',
        body: 'Você recebeu um convite para duelar!',
        icon: path.join(__dirname, 'icon.png'),
        urgency: 'critical',
      });
      notif.on('click', () => showMainWindow());
      notif.show();
    }
  } catch (error) {
    // Silent fail for invite polling
  }
}

async function startNotificationPolling({ resetKnown = false } = {}) {
  if (!authToken || !authUserId) {
    stopNotificationPolling();
    knownNotificationIds = new Set();
    return;
  }

  if (resetKnown) {
    knownNotificationIds = new Set();
  }

  await fetchUnreadNotifications({ primeOnly: true });
  stopNotificationPolling();
  notificationPollInterval = setInterval(() => {
    void fetchUnreadNotifications();
    void pollDuelInvites();
  }, NOTIFICATION_POLL_INTERVAL_MS);
}

function setupZoomShortcuts() {
  if (!mainWindow) return;

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isAccelerator = input.control || input.meta;
    if (!isAccelerator || input.type !== 'keyDown') return;

    const currentZoom = mainWindow.webContents.getZoomFactor();

    if (['+', '=', 'Add'].includes(input.key)) {
      event.preventDefault();
      mainWindow.webContents.setZoomFactor(Math.min(currentZoom + 0.1, 3));
      return;
    }

    if (['-', '_', 'Subtract'].includes(input.key)) {
      event.preventDefault();
      mainWindow.webContents.setZoomFactor(Math.max(currentZoom - 0.1, 0.5));
      return;
    }

    if (['0', 'Numpad0'].includes(input.key)) {
      event.preventDefault();
      mainWindow.webContents.setZoomFactor(1);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nativeWindowOpen: true,
    },
    autoHideMenuBar: true,
    title: 'Duelverse',
  });

  mainWindow.loadURL(REMOTE_URL);
  setupZoomShortcuts();

  // Open external links in the default browser, but allow OAuth popups and in-app remote pages
  mainWindow.webContents.setWindowOpenHandler(({ url, disposition }) => {
    if (url.startsWith(REMOTE_URL)) {
      return { action: 'allow' };
    }

    if (disposition === 'new-window') {
      return { action: 'allow' };
    }

      shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'Duelverse',
          content: 'O app continua rodando em segundo plano. Você receberá notificações!',
        });
      }
    }
  });
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'icon.png'));
  } catch {
    tray = null;
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir Duelverse', click: () => { showMainWindow(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('Duelverse');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { showMainWindow(); });
}

function setAutoLaunch() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: [],
  });
}

function createShortcuts() {
  if (process.platform !== 'win32' || !app.isPackaged) return;

  const shortcutOptions = {
    target: process.execPath,
    args: '',
    description: 'Duelverse',
    icon: path.join(__dirname, 'icon.ico'),
    iconIndex: 0,
  };

  const desktopShortcut = path.join(app.getPath('desktop'), 'Duelverse.lnk');
  shell.writeShortcutLink(desktopShortcut, fs.existsSync(desktopShortcut) ? 'update' : 'create', shortcutOptions);

  const startMenuShortcut = path.join(app.getPath('startMenu'), 'Programs', 'Duelverse.lnk');
  fs.mkdirSync(path.dirname(startMenuShortcut), { recursive: true });
  shell.writeShortcutLink(startMenuShortcut, fs.existsSync(startMenuShortcut) ? 'update' : 'create', shortcutOptions);
}

ipcMain.on('show-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body, icon: path.join(__dirname, 'icon.png') });
    notif.on('click', () => { showMainWindow(); });
    notif.show();
  }
});

ipcMain.on('sync-auth', async (_, { token, userId }) => {
  const normalizedToken = token || null;
  const normalizedUserId = userId || null;
  const userChanged = authUserId !== normalizedUserId;

  authToken = normalizedToken;
  authUserId = normalizedUserId;

  if (!authToken || !authUserId) {
    console.log('[Electron] Auth cleared');
    stopNotificationPolling();
    knownNotificationIds = new Set();
    return;
  }

  console.log('[Electron] Auth synced for user:', authUserId);
  await startNotificationPolling({ resetKnown: userChanged || !notificationPollInterval });
});

app.whenReady().then(() => {
  setAutoLaunch();
  createWindow();
  createTray();
  createShortcuts();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopNotificationPolling();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
