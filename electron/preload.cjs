const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  syncAuth: (token, userId) => ipcRenderer.send('sync-auth', { token, userId }),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  isElectron: true,
});
