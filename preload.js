const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  fetch: (params) => ipcRenderer.invoke('api:fetch', params),
  exportExcel: (params) => ipcRenderer.invoke('api:export', params),
  getTopics: () => ipcRenderer.invoke('api:topics'),
  getConfig: () => ipcRenderer.invoke('api:config:get'),
  saveConfig: (params) => ipcRenderer.invoke('api:config:save', params),
  testProxy: (params) => ipcRenderer.invoke('api:test-proxy', params),
  detectProxy: () => ipcRenderer.invoke('api:detect-proxy'),
  getHistory: () => ipcRenderer.invoke('api:history'),
  getVersion: () => ipcRenderer.invoke('api:version'),
  checkUpdate: () => ipcRenderer.invoke('api:check-update'),
  doUpgrade: () => ipcRenderer.invoke('api:upgrade'),
});