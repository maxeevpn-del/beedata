const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fetch: (params) => ipcRenderer.invoke('api:fetch', params),
  exportExcel: (params) => ipcRenderer.invoke('api:export', params),
  tvFetch: (params) => ipcRenderer.invoke('api:tv:fetch', params),
  tvExport: (params) => ipcRenderer.invoke('api:tv:export', params),
  getTopics: () => ipcRenderer.invoke('api:topics'),
  getConfig: () => ipcRenderer.invoke('api:config:get'),
  saveConfig: (params) => ipcRenderer.invoke('api:config:save', params),
  testProxy: (params) => ipcRenderer.invoke('api:test-proxy', params),
  detectProxy: () => ipcRenderer.invoke('api:detect-proxy'),
  getHistory: () => ipcRenderer.invoke('api:history'),
  getVersion: () => ipcRenderer.invoke('api:version'),
  checkUpdate: () => ipcRenderer.invoke('api:check-update'),
  doUpgrade: () => ipcRenderer.invoke('api:upgrade'),
  openFile: (filepath) => ipcRenderer.invoke('api:open-file', filepath),
  openHistoryFile: (filename) => ipcRenderer.invoke('api:open-history-file', filename),
  onFetchProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('fetch:progress', handler);
    return handler;
  },
  offFetchProgress: (handler) => {
    ipcRenderer.removeListener('fetch:progress', handler);
  },
});
