// main.js - Electron Hauptprozess
// ControllerDesktop - Portable Gamepad Desktop Steuerung
// Plug & Play: Download, entpacken, ControllerDesktop-Portable.exe starten

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { keyboard, Key, mouse } = require('@nut-tree/nut-js');

// ─── Konfiguration ────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG = {
  version: 1,
  theme: 'dark',
  language: 'de',
  startMinimized: false,
  autoStart: false,
  controller: {
    deadzone: 0.15,
    mouseSensitivity: 1.0,
    scrollSpeed: 1.0,
    rumble: true,
    swapSticks: false
  },
  mappings: [],
  profiles: [],
  activeProfile: 'default',
  appToggleCombo: { buttons: [8, 9], duration: 500 }
};

let config = { ...DEFAULT_CONFIG };

// ─── Config laden/speichern ───────────────────────────────────
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    config = { ...DEFAULT_CONFIG, ...parsed };
    if (!config.controller) config.controller = { ...DEFAULT_CONFIG.controller };
  } catch {
    saveConfig();
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Config save error:', err);
  }
}

loadConfig();

// ─── Hauptfenster ─────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'src', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: true,
    show: !config.startMinimized,
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Tray Icon ────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'src', 'icons', 'tray.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'ControllerDesktop oeffnen', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: 'Controller: Nicht verbunden', enabled: false },
    { type: 'separator' },
    {
      label: 'App minimieren (an/aus)',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) mainWindow.hide();
          else mainWindow.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ControllerDesktop');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) mainWindow.show();
  });
}

// ─── Action Executor ──────────────────────────────────────────
async function executeAction(action) {
  if (!action) return;

  try {
    switch (action.type) {
      case 'key':
        await simulateKey(action.key, action.modifiers || []);
        break;
      case 'mouse':
        await simulateMouse(action);
        break;
      case 'scroll':
        await simulateScroll(action);
        break;
      case 'macro':
        await runMacro(action.steps || []);
        break;
      case 'app':
        runAppCommand(action.command);
        break;
      case 'toggle':
        runToggleCommand(action.command);
        break;
    }
  } catch (err) {
    console.error('Action error:', err);
  }
}

async function simulateKey(key, modifiers = []) {
  const mods = modifiers.map(m => {
    switch (m.toUpperCase()) {
      case 'CTRL': return Key.LeftControl;
      case 'ALT': return Key.LeftAlt;
      case 'SHIFT': return Key.LeftShift;
      case 'META': return Key.LeftSuper;
      default: return null;
    }
  }).filter(Boolean);

  const keyCode = keyToNutKey(key);
  if (!keyCode) {
    console.warn('Unknown key:', key);
    return;
  }

  await keyboard.pressKey(...mods, keyCode);
  await keyboard.releaseKey(...mods, keyCode);
}

async function simulateMouse(action) {
  switch (action.action) {
    case 'click':
      await mouse.click(mouse.Button.LEFT);
      break;
    case 'rightclick':
      await mouse.click(mouse.Button.RIGHT);
      break;
    case 'doubleclick':
      await mouse.click(mouse.Button.LEFT);
      await new Promise(r => setTimeout(r, 50));
      await mouse.click(mouse.Button.LEFT);
      break;
  }
}

async function simulateScroll(action) {
  const amount = Math.round((action.amount || 1) * (config.controller.scrollSpeed || 1));
  const direction = action.direction === 'up' ? -1 : 1;
  for (let i = 0; i < Math.abs(amount); i++) {
    await mouse.wheel(direction);
    await new Promise(r => setTimeout(r, 10));
  }
}

async function runMacro(steps) {
  let delay = 0;
  for (const step of steps) {
    delay += step.delay || 100;
    await new Promise(r => setTimeout(r, delay));
    await executeAction(step);
  }
}

function runAppCommand(command) {
  if (!mainWindow) return;
  switch (command) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'close':
      mainWindow.close();
      break;
    case 'toggle':
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
      break;
  }
}

function runToggleCommand(command) {
  if (command === 'toggle-app') {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    }
  }
}

function keyToNutKey(key) {
  if (!key) return null;
  const k = key.toUpperCase();
  const map = {
    'A': Key.A, 'B': Key.B, 'C': Key.C, 'D': Key.D,
    'E': Key.E, 'F': Key.F, 'G': Key.G, 'H': Key.H,
    'I': Key.I, 'J': Key.J, 'K': Key.K, 'L': Key.L,
    'M': Key.M, 'N': Key.N, 'O': Key.O, 'P': Key.P,
    'Q': Key.Q, 'R': Key.R, 'S': Key.S, 'T': Key.T,
    'U': Key.U, 'V': Key.V, 'W': Key.W, 'X': Key.X,
    'Y': Key.Y, 'Z': Key.Z,
    '0': Key.Digit0, '1': Key.Digit1, '2': Key.Digit2,
    '3': Key.Digit3, '4': Key.Digit4, '5': Key.Digit5,
    '6': Key.Digit6, '7': Key.Digit7, '8': Key.Digit8,
    '9': Key.Digit9,
    'F1': Key.F1, 'F2': Key.F2, 'F3': Key.F3,
    'F4': Key.F4, 'F5': Key.F5, 'F6': Key.F6,
    'F7': Key.F7, 'F8': Key.F8, 'F9': Key.F9,
    'F10': Key.F10, 'F11': Key.F11, 'F12': Key.F12,
    'SPACE': Key.Space, 'ENTER': Key.Enter, 'ESC': Key.Escape,
    'TAB': Key.Tab, 'BACKSPACE': Key.Backspace,
    'DELETE': Key.Delete, 'INSERT': Key.Insert,
    'HOME': Key.Home, 'END': Key.End,
    'PAGEUP': Key.PageUp, 'PAGEDOWN': Key.PageDown,
    'UP': Key.ArrowUp, 'DOWN': Key.ArrowDown,
    'LEFT': Key.ArrowLeft, 'RIGHT': Key.ArrowRight,
    'SHIFT': Key.LeftShift, 'CTRL': Key.LeftControl,
    'ALT': Key.LeftAlt, 'META': Key.LeftSuper,
    'CAPSLOCK': Key.CapsLock, 'NUMLOCK': Key.NumLock,
    'SCROLLLOCK': Key.ScrollLock, 'PRINTSCREEN': Key.PrintScreen,
    'PAUSE': Key.Pause,
    'VOLUMEUP': Key.VolumeUp, 'VOLUMEDOWN': Key.VolumeDown,
    'VOLUMEMUTE': Key.VolumeMute,
  };
  return map[k] || null;
}

// ─── IPC Handler ──────────────────────────────────────────────
ipcMain.handle('get-config', () => config);

ipcMain.handle('save-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  return config;
});

ipcMain.handle('execute-action', async (event, action) => {
  await executeAction(action);
});

ipcMain.handle('minimize-app', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('toggle-app', () => {
  if (mainWindow) {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  }
});

ipcMain.handle('exit-app', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('show-message', (event, options) => {
  dialog.showMessageBox(mainWindow, options);
});

ipcMain.handle('get-app-version', () => app.getVersion());

// ─── App Lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  if (config.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe')
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Nicht beenden - laeuft im Tray
});

app.on('before-quit', () => {
  isQuitting = true;
});
