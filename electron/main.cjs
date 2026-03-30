const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

app.setAppUserModelId('com.duelverse.desktop');

const REMOTE_URL = 'https://duelverse.site';
let mainWindow;
let tray;
let authToken = null;
let authUserId = null;

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
    { label: 'Abrir Duelverse', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('Duelverse');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
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
    icon: process.execPath,
    iconIndex: 0,
  };

  const desktopShortcut = path.join(app.getPath('desktop'), 'Duelverse.lnk');
  if (!fs.existsSync(desktopShortcut)) {
    shell.writeShortcutLink(desktopShortcut, shortcutOptions);
  }

  const startMenuShortcut = path.join(app.getPath('startMenu'), 'Programs', 'Duelverse.lnk');
  fs.mkdirSync(path.dirname(startMenuShortcut), { recursive: true });
  if (!fs.existsSync(startMenuShortcut)) {
    shell.writeShortcutLink(startMenuShortcut, shortcutOptions);
  }
}

ipcMain.on('show-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body, icon: path.join(__dirname, 'icon.png') });
    notif.on('click', () => { mainWindow.show(); mainWindow.focus(); });
    notif.show();
  }
});

ipcMain.on('sync-auth', (_, { token, userId }) => {
  authToken = token;
  authUserId = userId;
  console.log('[Electron] Auth synced for user:', userId);
});

app.whenReady().then(() => {
  setAutoLaunch();
  createWindow();
  createTray();
  createShortcuts();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
