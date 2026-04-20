const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  syncAuth: (token, userId) => ipcRenderer.invoke('sync-auth', { token, userId }),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  setSelectedSource: (sourceId) => ipcRenderer.send('set-selected-source', sourceId),
  // Save a recording blob locally via system save dialog
  saveFileLocally: (arrayBuffer, defaultName) => ipcRenderer.invoke('save-file-locally', arrayBuffer, defaultName),
  isElectron: true,
});
