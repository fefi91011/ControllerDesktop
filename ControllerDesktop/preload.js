// preload.js – Sichere IPC-Brücke (contextIsolation, kein Node im Renderer)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  executeAction: (action) => ipcRenderer.invoke('execute-action', action),

  // Hochfrequente Eingaben: send statt invoke, damit der 60-fps-Loop nicht blockiert.
  movePointer: (dx, dy) => ipcRenderer.send('pointer-move', { dx, dy }),
  scrollPointer: (steps) => ipcRenderer.send('pointer-scroll', steps),
  reportControllerState: (state) => ipcRenderer.send('controller-state', state),
  onInputPaused: (callback) => ipcRenderer.on('input-paused', (event, paused) => callback(paused)),

  minimizeApp: () => ipcRenderer.invoke('minimize-app'),
  toggleApp: () => ipcRenderer.invoke('toggle-app'),
  exitApp: () => ipcRenderer.invoke('exit-app'),
  showMessage: (options) => ipcRenderer.invoke('show-message', options),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Updates
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (callback) => ipcRenderer.on('update-state', (event, state) => callback(state))
});
