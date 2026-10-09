// preload.js – Sichere IPC-Brücke
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  executeAction: (action) => ipcRenderer.invoke('execute-action', action),
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  toggleApp: () => ipcRenderer.invoke('toggle-app'),
  exitApp: () => ipcRenderer.invoke('exit-app'),
  showMessage: (options) => ipcRenderer.invoke('show-message', options),
  getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
