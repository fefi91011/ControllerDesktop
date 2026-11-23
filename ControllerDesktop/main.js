// main.js – Electron-Hauptprozess
// ControllerDesktop – Gamepad-Steuerung für Windows
//
// Verantwortung: Fenster/Tray, Konfiguration, systemweite Eingaben.
// Der Renderer liest nur den Gamepad und schickt Aktionen über IPC.

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { keyboard, Key, mouse, Button, Point } = require('@nut-tree-fork/nut-js');
const { autoUpdater } = require('electron-updater');
const i18n = require('./src/i18n');

const t = (key, params) => i18n.t(key, params);

// ─── Standardbelegung ─────────────────────────────────────────
// Wird nur beim ersten Start (oder nach „Zurücksetzen“) verwendet.
// nameKey übersetzt die Bezeichnung, solange der Nutzer sie nicht selbst ändert.
const DEFAULT_MAPPINGS = [
  { name: 'Bestätigen', nameKey: 'mapping.default.confirm', trigger: 'button-0', actionType: 'key', action: { key: 'ENTER', modifiers: [] }, cooldown: 150 },
  { name: 'Abbrechen', nameKey: 'mapping.default.cancel', trigger: 'button-1', actionType: 'key', action: { key: 'ESC', modifiers: [] }, cooldown: 150 },
  { name: 'Löschen', nameKey: 'mapping.default.remove', trigger: 'button-2', actionType: 'key', action: { key: 'BACKSPACE', modifiers: [] }, cooldown: 80 },
  { name: 'Leertaste', nameKey: 'mapping.default.space', trigger: 'button-3', actionType: 'key', action: { key: 'SPACE', modifiers: [] }, cooldown: 80 },
  { name: 'Nach oben', nameKey: 'mapping.default.up', trigger: 'button-12', actionType: 'key', action: { key: 'UP', modifiers: [] }, cooldown: 90 },
  { name: 'Nach unten', nameKey: 'mapping.default.down', trigger: 'button-13', actionType: 'key', action: { key: 'DOWN', modifiers: [] }, cooldown: 90 },
  { name: 'Nach links', nameKey: 'mapping.default.left', trigger: 'button-14', actionType: 'key', action: { key: 'LEFT', modifiers: [] }, cooldown: 90 },
  { name: 'Nach rechts', nameKey: 'mapping.default.right', trigger: 'button-15', actionType: 'key', action: { key: 'RIGHT', modifiers: [] }, cooldown: 90 },
  { name: 'Klick links', nameKey: 'mapping.default.clickLeft', trigger: 'button-10', actionType: 'mouse', action: { action: 'click' }, cooldown: 200 },
  { name: 'Klick rechts', nameKey: 'mapping.default.clickRight', trigger: 'button-11', actionType: 'mouse', action: { action: 'rightclick' }, cooldown: 200 },
  { name: 'App minimieren', nameKey: 'mapping.default.appMinimize', trigger: 'button-8', actionType: 'app', action: { command: 'minimize' }, cooldown: 500 },
  { name: 'App an/aus', nameKey: 'mapping.default.appToggle', trigger: 'button-9', actionType: 'app', action: { command: 'toggle' }, cooldown: 500 }
];

const DEFAULT_CONFIG = {
  version: 2,
  theme: 'light',
  language: 'system',
  startMinimized: false,
  autoStart: false,
  updates: { checkOnStart: true },
  controller: {
    deadzone: 0.15,
    mouseSensitivity: 1.0,
    scrollSpeed: 1.0,
    rumble: true,
    swapSticks: false
  },
  profiles: [{ id: 'default', name: 'Standard', mappings: DEFAULT_MAPPINGS }],
  activeProfile: 'default'
};

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let mainWindow = null;
let tray = null;
let isQuitting = false;
let inputPaused = false;
let controllerState = { connected: false, name: '' };

// ─── Konfiguration ────────────────────────────────────────────
function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      updates: { ...DEFAULT_CONFIG.updates, ...(parsed.updates || {}) },
      controller: { ...DEFAULT_CONFIG.controller, ...(parsed.controller || {}) }
    };

    if (!Array.isArray(config.profiles) || config.profiles.length === 0) {
      config.profiles = JSON.parse(JSON.stringify(DEFAULT_CONFIG.profiles));
      config.activeProfile = 'default';
    }
    config.profiles.forEach(profile => {
      profile.mappings = Array.isArray(profile.mappings) ? profile.mappings : [];
    });
    if (!config.profiles.some(p => p.id === config.activeProfile)) {
      config.activeProfile = config.profiles[0].id;
    }
    delete config.mappings;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Config konnte nicht gelesen werden:', err);
    saveConfig();
  }
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Config konnte nicht gespeichert werden:', err);
  }
}

function applyAutoStart(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath });
  } catch (err) {
    console.error('Autostart konnte nicht gesetzt werden:', err);
  }
}

loadConfig();

// ─── Fenster ──────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    icon: path.join(__dirname, 'src', 'icons', 'icon.png'),
    backgroundColor: config.theme === 'dark' ? '#131614' : '#e6e7e2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Wichtig: im Tray bleibt der Gamepad-Loop sonst stehen.
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!config.startMinimized) mainWindow.show();
  });

  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Tray ─────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: t('tray.open'), click: () => showWindow() },
    { type: 'separator' },
    {
      label: controllerState.connected
        ? t('tray.controller', { name: controllerState.name })
        : t('tray.noController'),
      enabled: false
    },
    {
      label: t('tray.pause'),
      type: 'checkbox',
      checked: inputPaused,
      click: item => setInputPaused(item.checked)
    },
    ...(updatesSupported()
      ? [
          {
            label: t('tray.checkUpdates'),
            click: () => {
              showWindow();
              checkForUpdates();
            }
          }
        ]
      : []),
    { type: 'separator' },
    {
      label: t('tray.toggleWindow'),
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else showWindow();
      }
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function refreshTray() {
  if (!tray) return;
  const status = controllerState.connected ? controllerState.name : t('status.noController');
  const tooltip = t('tray.tooltip', { status }) + (inputPaused ? ` – ${t('tray.paused')}` : '');
  tray.setToolTip(tooltip);
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  let icon = nativeImage.createEmpty();
  try {
    const loaded = nativeImage.createFromPath(path.join(__dirname, 'src', 'icons', 'tray.png'));
    if (!loaded.isEmpty()) icon = loaded.resize({ width: 16, height: 16 });
  } catch (err) {
    console.warn('Tray-Icon fehlt:', err.message);
  }

  tray = new Tray(icon);
  tray.on('click', () => showWindow());
  refreshTray();
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function setInputPaused(paused) {
  inputPaused = Boolean(paused);
  refreshTray();
  if (mainWindow) mainWindow.webContents.send('input-paused', inputPaused);
}

// ─── Zeiger ───────────────────────────────────────────────────
const cursor = { x: 0, y: 0, ready: false };
const moveQueue = { dx: 0, dy: 0 };
let moveBusy = false;
const scrollQueue = { steps: 0 };
let scrollBusy = false;

async function initCursor() {
  try {
    const position = await mouse.getPosition();
    cursor.x = position.x;
    cursor.y = position.y;
  } catch (err) {
    console.warn('Zeigerposition nicht lesbar:', err.message);
    const bounds = screen.getPrimaryDisplay().bounds;
    cursor.x = bounds.x + bounds.width / 2;
    cursor.y = bounds.y + bounds.height / 2;
  }
  cursor.ready = true;
}

function virtualBounds() {
  const displays = screen.getAllDisplays().map(d => d.bounds);
  if (!displays.length) return { minX: 0, minY: 0, maxX: 1919, maxY: 1079 };
  return {
    minX: Math.min(...displays.map(b => b.x)),
    minY: Math.min(...displays.map(b => b.y)),
    maxX: Math.max(...displays.map(b => b.x + b.width - 1)),
    maxY: Math.max(...displays.map(b => b.y + b.height - 1))
  };
}

function queueMove(dx, dy) {
  if (!cursor.ready || inputPaused) return;
  moveQueue.dx += dx;
  moveQueue.dy += dy;
  flushMove();
}

async function flushMove() {
  if (moveBusy) return;
  moveBusy = true;

  try {
    while (moveQueue.dx !== 0 || moveQueue.dy !== 0) {
      const step = { dx: moveQueue.dx, dy: moveQueue.dy };
      moveQueue.dx = 0;
      moveQueue.dy = 0;

      const bounds = virtualBounds();
      cursor.x = Math.min(Math.max(cursor.x + step.dx, bounds.minX), bounds.maxX);
      cursor.y = Math.min(Math.max(cursor.y + step.dy, bounds.minY), bounds.maxY);

      await mouse.setPosition(new Point(Math.round(cursor.x), Math.round(cursor.y)));
    }
  } catch (err) {
    console.error('Zeigerbewegung fehlgeschlagen:', err);
  } finally {
    moveBusy = false;
  }
}

function queueScroll(steps) {
  if (inputPaused) return;
  scrollQueue.steps += steps;
  flushScroll();
}

async function flushScroll() {
  if (scrollBusy) return;
  scrollBusy = true;

  try {
    while (scrollQueue.steps !== 0) {
      const steps = Math.trunc(scrollQueue.steps);
      if (steps === 0) {
        scrollQueue.steps = 0;
        break;
      }
      scrollQueue.steps -= steps;

      if (steps > 0) await mouse.scrollDown(steps);
      else await mouse.scrollUp(-steps);
    }
  } catch (err) {
    console.error('Scrollen fehlgeschlagen:', err);
  } finally {
    scrollBusy = false;
  }
}

// ─── Aktionen ─────────────────────────────────────────────────
async function executeAction(action) {
  if (!action || inputPaused) return;

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
      default:
        console.warn('Unbekannter Aktionstyp:', action.type);
    }
  } catch (err) {
    console.error('Aktion fehlgeschlagen:', err);
  }
}

async function simulateKey(keyName, modifiers = []) {
  const key = keyToNutKey(keyName);
  if (key === undefined) {
    console.warn('Unbekannte Taste:', keyName);
    return;
  }

  const modifierKeys = modifiers.map(keyToModifierKey).filter(k => k !== undefined);
  const combo = [...new Set([...modifierKeys, key])];

  await keyboard.pressKey(...combo);
  await keyboard.releaseKey(...combo);
}

async function simulateMouse(action) {
  switch (action.action) {
    case 'click':
      await mouse.leftClick();
      break;
    case 'rightclick':
      await mouse.rightClick();
      break;
    case 'middleclick':
      await mouse.click(Button.MIDDLE);
      break;
    case 'doubleclick':
      await mouse.doubleClick(Button.LEFT);
      break;
    default:
      console.warn('Unbekannte Mausaktion:', action.action);
  }
}

async function simulateScroll(action) {
  const speed = config.controller.scrollSpeed || 1;
  const amount = Math.max(1, Math.round((action.amount || 1) * speed));

  if (action.direction === 'up') await mouse.scrollUp(amount);
  else await mouse.scrollDown(amount);
}

async function runMacro(steps) {
  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, step.delay || 100));
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
      else showWindow();
      break;
    default:
      console.warn('Unbekannter App-Befehl:', command);
  }
}

// ─── Tastenzuordnung ──────────────────────────────────────────
const KEY_MAP = {
  A: Key.A, B: Key.B, C: Key.C, D: Key.D, E: Key.E, F: Key.F, G: Key.G, H: Key.H,
  I: Key.I, J: Key.J, K: Key.K, L: Key.L, M: Key.M, N: Key.N, O: Key.O, P: Key.P,
  Q: Key.Q, R: Key.R, S: Key.S, T: Key.T, U: Key.U, V: Key.V, W: Key.W, X: Key.X,
  Y: Key.Y, Z: Key.Z,

  '0': Key.Num0, '1': Key.Num1, '2': Key.Num2, '3': Key.Num3, '4': Key.Num4,
  '5': Key.Num5, '6': Key.Num6, '7': Key.Num7, '8': Key.Num8, '9': Key.Num9,

  '-': Key.Minus, '=': Key.Equal, '[': Key.LeftBracket, ']': Key.RightBracket,
  '\\': Key.Backslash, ';': Key.Semicolon, "'": Key.Quote, ',': Key.Comma,
  '.': Key.Period, '/': Key.Slash, '`': Key.Grave,

  SPACE: Key.Space, LEERZEICHEN: Key.Space,
  ENTER: Key.Return, RETURN: Key.Return, NUMPADENTER: Key.Enter,
  ESC: Key.Escape, ESCAPE: Key.Escape,
  TAB: Key.Tab, BACKSPACE: Key.Backspace, DELETE: Key.Delete, INSERT: Key.Insert,
  HOME: Key.Home, END: Key.End,
  PAGEUP: Key.PageUp, PGUP: Key.PageUp,
  PAGEDOWN: Key.PageDown, PGDN: Key.PageDown,
  UP: Key.Up, DOWN: Key.Down, LEFT: Key.Left, RIGHT: Key.Right,

  CAPSLOCK: Key.CapsLock, NUMLOCK: Key.NumLock, SCROLLLOCK: Key.ScrollLock,
  PRINT: Key.Print, PRINTSCREEN: Key.Print, PAUSE: Key.Pause, MENU: Key.Menu,

  VOLUMEUP: Key.AudioVolUp, LAUTER: Key.AudioVolUp,
  VOLUMEDOWN: Key.AudioVolDown, LEISER: Key.AudioVolDown,
  VOLUMEMUTE: Key.AudioMute, MUTE: Key.AudioMute, STUMM: Key.AudioMute,
  MEDIAPLAY: Key.AudioPlay, PLAY: Key.AudioPlay,
  MEDIASTOP: Key.AudioStop, MEDIAPREV: Key.AudioPrev, MEDIANEXT: Key.AudioNext,

  SHIFT: Key.LeftShift, UMSCHALT: Key.LeftShift,
  CTRL: Key.LeftControl, STRG: Key.LeftControl, CONTROL: Key.LeftControl,
  ALT: Key.LeftAlt,
  META: Key.LeftSuper, WIN: Key.LeftSuper, SUPER: Key.LeftSuper,
  COMMAND: Key.LeftSuper, CMD: Key.LeftSuper
};

for (let i = 1; i <= 24; i += 1) KEY_MAP[`F${i}`] = Key[`F${i}`];

function keyToNutKey(name) {
  if (!name) return undefined;
  const normalized = String(name).trim();
  return KEY_MAP[normalized.toUpperCase()];
}

function keyToModifierKey(name) {
  switch (String(name).toUpperCase()) {
    case 'CTRL':
    case 'STRG':
      return Key.LeftControl;
    case 'ALT':
      return Key.LeftAlt;
    case 'SHIFT':
    case 'UMSCHALT':
      return Key.LeftShift;
    case 'META':
    case 'WIN':
    case 'SUPER':
      return Key.LeftSuper;
    default:
      return undefined;
  }
}

// ─── IPC ──────────────────────────────────────────────────────
ipcMain.handle('get-config', () => config);

ipcMain.handle('save-config', (event, nextConfig) => {
  if (!nextConfig || typeof nextConfig !== 'object') return config;

  const autoStartChanged = Boolean(nextConfig.autoStart) !== Boolean(config.autoStart);
  const languageChanged = (nextConfig.language || 'system') !== (config.language || 'system');
  config = {
    ...config,
    ...nextConfig,
    updates: { ...config.updates, ...(nextConfig.updates || {}) },
    controller: { ...config.controller, ...(nextConfig.controller || {}) }
  };
  if (!Array.isArray(config.profiles) || config.profiles.length === 0) {
    config.profiles = JSON.parse(JSON.stringify(DEFAULT_CONFIG.profiles));
  }

  saveConfig();
  if (autoStartChanged) applyAutoStart(config.autoStart);
  if (languageChanged) {
    i18n.setLanguage(config.language, app.getLocale());
    refreshTray();
  }
  return config;
});

ipcMain.handle('execute-action', async (event, action) => {
  await executeAction(action);
});

ipcMain.handle('minimize-app', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('toggle-app', () => {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else showWindow();
});

ipcMain.handle('exit-app', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('show-message', (event, options) => {
  return dialog.showMessageBox(mainWindow, options);
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.on('pointer-move', (event, delta) => {
  if (!delta) return;
  queueMove(Number(delta.dx) || 0, Number(delta.dy) || 0);
});

ipcMain.on('pointer-scroll', (event, steps) => {
  queueScroll(Number(steps) || 0);
});

ipcMain.on('controller-state', (event, nextState) => {
  controllerState = {
    connected: Boolean(nextState && nextState.connected),
    name: (nextState && nextState.name) || ''
  };
  refreshTray();
});

// ─── Updates ─────────────────────────────────────────────────
// Prüft GitHub-Releases über electron-updater. Kein Download ohne Zustimmung,
// keine Telemetrie – nur die Versionsabfrage und der vom Nutzer gestartete Download.
const updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  version: null,
  percent: 0,
  message: '',
  portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
};

function publishUpdateState(patch = {}) {
  Object.assign(updateState, patch);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-state', { ...updateState });
  }
}

function updatesSupported() {
  return app.isPackaged && process.platform === 'win32';
}

// Liefert entweder einen Übersetzungsschlüssel (bekannte Fälle) oder den rohen
// Fehlertext. Der Schlüssel erlaubt dem Renderer, die Meldung später erneut zu
// übersetzen, wenn die Sprache gewechselt wird.
function describeUpdateError(error) {
  const message = String(error && error.message ? error.message : error).split('\n')[0].slice(0, 200);
  if (/404|latest\.yml|cannot find/i.test(message)) return { messageKey: 'update.error.noRelease' };
  if (/net::|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network/i.test(message)) return { messageKey: 'update.error.offline' };
  return { message };
}

// Ein Fehler trifft sowohl als Event als auch als abgelehntes Promise ein.
// Die Prüfung auf identischen Zustand verhindert doppelte Meldungen.
function reportUpdateError(error) {
  const described = describeUpdateError(error);
  const messageKey = described.messageKey || null;
  const message = messageKey ? t(messageKey) : described.message;
  if (updateState.status === 'error' && updateState.message === message) return;
  publishUpdateState({ status: 'error', message, messageKey });
}

// Gemeinsamer Rahmen für Prüfen und Herunterladen: Support-Check plus Fehlerbehandlung.
async function runUpdateTask(task) {
  if (!updatesSupported()) {
    const messageKey = app.isPackaged ? 'update.error.windowsOnly' : 'update.error.devMode';
    publishUpdateState({ status: 'unavailable', messageKey, message: t(messageKey) });
    return updateState;
  }

  try {
    await task();
  } catch (error) {
    reportUpdateError(error);
  }

  return updateState;
}

function checkForUpdates() {
  return runUpdateTask(() => autoUpdater.checkForUpdates());
}

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking', message: '', messageKey: null }));
  autoUpdater.on('update-available', info => publishUpdateState({ status: 'available', version: info.version, message: '', messageKey: null }));
  autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'current', message: '', messageKey: null }));
  autoUpdater.on('download-progress', progress => publishUpdateState({ status: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', info => publishUpdateState({ status: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', reportUpdateError);

  if (config.updates.checkOnStart && updatesSupported()) {
    setTimeout(() => checkForUpdates(), 8000);
  }
}

ipcMain.handle('update:state', () => updateState);

ipcMain.handle('update:check', () => checkForUpdates());

ipcMain.handle('update:download', () => {
  if (updateState.status !== 'available') return updateState;
  return runUpdateTask(() => autoUpdater.downloadUpdate());
});

ipcMain.handle('update:install', () => {
  if (updateState.status !== 'ready') return false;
  isQuitting = true;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});

// ─── Lebenszyklus ─────────────────────────────────────────────
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(async () => {
    // app.getLocale() liefert unter Windows erst nach 'ready' die echte Sprache.
    i18n.setLanguage(config.language, app.getLocale());

    createWindow();
    createTray();
    initCursor();
    applyAutoStart(config.autoStart);
    setupUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // Läuft im Tray weiter.
});

app.on('before-quit', () => {
  isQuitting = true;
});
