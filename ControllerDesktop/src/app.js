// app.js – Renderer-Prozess
// ControllerDesktop – Gamepad-Steuerung für Windows

// ═══ Konfiguration ═══
const DEFAULT_MAPPINGS = [
  { name: 'Bestätigen', trigger: 'button-0', actionType: 'key', action: { key: 'ENTER', modifiers: [] }, cooldown: 150 },
  { name: 'Abbrechen', trigger: 'button-1', actionType: 'key', action: { key: 'ESC', modifiers: [] }, cooldown: 150 },
  { name: 'Löschen', trigger: 'button-2', actionType: 'key', action: { key: 'BACKSPACE', modifiers: [] }, cooldown: 80 },
  { name: 'Leertaste', trigger: 'button-3', actionType: 'key', action: { key: 'SPACE', modifiers: [] }, cooldown: 80 },
  { name: 'Nach oben', trigger: 'button-12', actionType: 'key', action: { key: 'UP', modifiers: [] }, cooldown: 90 },
  { name: 'Nach unten', trigger: 'button-13', actionType: 'key', action: { key: 'DOWN', modifiers: [] }, cooldown: 90 },
  { name: 'Nach links', trigger: 'button-14', actionType: 'key', action: { key: 'LEFT', modifiers: [] }, cooldown: 90 },
  { name: 'Nach rechts', trigger: 'button-15', actionType: 'key', action: { key: 'RIGHT', modifiers: [] }, cooldown: 90 },
  { name: 'Klick links', trigger: 'button-10', actionType: 'mouse', action: { action: 'click' }, cooldown: 200 },
  { name: 'Klick rechts', trigger: 'button-11', actionType: 'mouse', action: { action: 'rightclick' }, cooldown: 200 },
  { name: 'App minimieren', trigger: 'button-8', actionType: 'app', action: { command: 'minimize' }, cooldown: 500 },
  { name: 'App an/aus', trigger: 'button-9', actionType: 'app', action: { command: 'toggle' }, cooldown: 500 }
];

const DEFAULT_CONFIG = {
  version: 2,
  theme: 'light',
  language: 'de',
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

// ═══ Browser-Vorschau ═══
// src/index.html lässt sich auch ohne Electron öffnen (Design-Vorschau).
// In der Desktop-App wird window.api vom preload-Skript bereitgestellt.
const IS_ELECTRON = Boolean(window.api && typeof window.api.getConfig === 'function');

if (!IS_ELECTRON) {
  let previewConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  window.api = {
    getConfig: async () => JSON.parse(JSON.stringify(previewConfig)),
    saveConfig: async (next) => { previewConfig = JSON.parse(JSON.stringify(next)); return next; },
    executeAction: async () => {},
    movePointer: () => {},
    scrollPointer: () => {},
    minimizeApp: async () => {},
    toggleApp: async () => {},
    exitApp: async () => {},
    showMessage: async () => {},
    getAppVersion: async () => '1.1.0',
    reportControllerState: () => {},
    getUpdateState: async () => ({
      status: 'unavailable',
      currentVersion: '1.1.0',
      message: 'Nur in der installierten Windows-App verfügbar.'
    }),
    checkForUpdates: async () => ({
      status: 'unavailable',
      currentVersion: '1.1.0',
      message: 'Nur in der installierten Windows-App verfügbar.'
    }),
    downloadUpdate: async () => ({ status: 'unavailable' }),
    installUpdate: async () => false,
    onUpdateState: () => {}
  };
}

// ═══ State ═══
const state = {
  config: null,
  activeProfileId: 'default',
  selectedMappingIndex: -1,
  lastButtons: [],
  lastAxes: [],
  lastFire: Object.create(null),
  scrollAccum: 0,
  activity: [],
  connected: false,
  deviceName: '',
  lastInput: '–',
  version: '1.1.0',
  update: null
};

const POINTER_SPEED = 16; // Pixel pro Frame bei Vollausschlag (~60 fps)

// ═══ DOM-Helfer ═══
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const TRIGGER_SHORT = {
  'button-0': 'A', 'button-1': 'B', 'button-2': 'X', 'button-3': 'Y',
  'button-4': 'LB', 'button-5': 'RB', 'button-6': 'LT', 'button-7': 'RT',
  'button-8': 'Select', 'button-9': 'Start', 'button-10': 'L3', 'button-11': 'R3',
  'button-12': 'D-Pad ↑', 'button-13': 'D-Pad ↓', 'button-14': 'D-Pad ←', 'button-15': 'D-Pad →',
  'axis-0-pos': 'Stick L →', 'axis-0-neg': 'Stick L ←', 'axis-1-pos': 'Stick L ↓', 'axis-1-neg': 'Stick L ↑',
  'axis-2-pos': 'Stick R →', 'axis-2-neg': 'Stick R ←', 'axis-3-pos': 'Stick R ↓', 'axis-3-neg': 'Stick R ↑'
};

const MOD_LABELS = { CTRL: 'Strg', ALT: 'Alt', SHIFT: 'Umschalt', META: 'Win' };

// ═══ Start ═══
async function init() {
  try {
    state.config = normalizeConfig(await window.api.getConfig());
    state.activeProfileId = state.config.activeProfile || 'default';

    cacheControllerElements();
    setupNavigation();
    setupMappings();
    setupKeyboard();
    setupProfiles();
    setupSettings();
    setupUpdates();
    setupQuickActions();
    setupModal();
    bindWindowEvents();

    applyTheme(state.config.theme);
    renderAll();
    renderSettings();

    const version = await window.api.getAppVersion();
    state.version = version;
    $('#app-version').textContent = `v${version}`;

    if (!IS_ELECTRON) devPreview();
    else requestAnimationFrame(tick);
  } catch (err) {
    console.error('Init error:', err);
    showToast('Start fehlgeschlagen – siehe Konsole', 'error');
  }
}

// ═══ Konfiguration normalisieren ═══
function normalizeConfig(raw) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, raw || {});
  cfg.controller = Object.assign({}, DEFAULT_CONFIG.controller, cfg.controller || {});
  cfg.updates = Object.assign({}, DEFAULT_CONFIG.updates, cfg.updates || {});
  cfg.profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];

  if (!cfg.profiles.length) {
    cfg.profiles = [{ id: 'default', name: 'Standard', mappings: JSON.parse(JSON.stringify(DEFAULT_MAPPINGS)) }];
  }
  if (!cfg.profiles.some(p => p.id === 'default')) {
    cfg.profiles.unshift({ id: 'default', name: 'Standard', mappings: [] });
  }
  cfg.profiles.forEach(profile => {
    profile.mappings = Array.isArray(profile.mappings) ? profile.mappings : [];
    profile.mappings.forEach(m => {
      m.trigger = normalizeTrigger(m.trigger);
      m.cooldown = Number(m.cooldown) || 0;
    });
  });
  if (!cfg.profiles.some(p => p.id === cfg.activeProfile)) cfg.activeProfile = 'default';

  // Altlast: frühere Versionen speicherten Mappings parallel zu den Profilen
  delete cfg.mappings;
  return cfg;
}

// Ältere Konfigurationen speicherten nur den Button-Index ("0"), heute "button-0".
function normalizeTrigger(trigger) {
  if (trigger == null) return '';
  const value = String(trigger);
  if (/^\d+$/.test(value)) return `button-${value}`;
  return value;
}

function currentProfile() {
  return state.config.profiles.find(p => p.id === state.activeProfileId) || state.config.profiles[0];
}

async function persist() {
  state.config.activeProfile = state.activeProfileId;
  await window.api.saveConfig(state.config);
}

// ═══ Navigation ═══
function setupNavigation() {
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => showPage(item.dataset.page));
  });
}

function showPage(page) {
  $$('.nav-item').forEach(item => {
    const active = item.dataset.page === page;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $$('.page').forEach(section => {
    section.classList.toggle('active', section.id === `page-${page}`);
  });
  $('.main').scrollTop = 0;
}

// ═══ Controller-Elemente ═══
const buttonElements = new Map();
let leftNub = null;
let rightNub = null;
const stickOrigin = { left: { x: 195, y: 258 }, right: { x: 465, y: 258 } };

function cacheControllerElements() {
  $$('[data-btn]').forEach(el => {
    const index = Number(el.dataset.btn);
    if (!buttonElements.has(index)) buttonElements.set(index, []);
    buttonElements.get(index).push(el);
  });
  leftNub = $('#stick-left .stick-nub');
  rightNub = $('#stick-right .stick-nub');
}

// ═══ Controller-Status ═══
function cleanDeviceName(id) {
  if (!id) return 'Unbekanntes Gerät';
  const cut = id.split('(')[0].replace(/Vendor:.*$/i, '').trim();
  return (cut || id).slice(0, 42);
}

function setConnection(connected, deviceId) {
  const nextName = connected ? cleanDeviceName(deviceId) : '';
  // Wird pro Frame aufgerufen – nur echte Zustandswechsel dürfen Arbeit auslösen.
  if (state.connected === connected && state.deviceName === nextName) return;

  state.connected = connected;
  state.deviceName = nextName;

  $('#status-dot').classList.toggle('connected', connected);
  $('#status-text').textContent = connected ? state.deviceName : 'Kein Controller';

  const badge = $('#controller-badge');
  badge.textContent = connected ? 'Verbunden' : 'Nicht verbunden';
  badge.classList.toggle('connected', connected);

  $('#controller-info').textContent = connected
    ? `${state.deviceName} erkannt. Eingaben werden direkt umgesetzt.`
    : 'Verbinde einen Controller, um zu beginnen.';
  $('#pad-device').textContent = connected ? state.deviceName : 'Kein Gerät';

  window.api.reportControllerState({ connected, name: state.deviceName });
}

function firstGamepad() {
  if (!navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

function tick() {
  const pad = firstGamepad();
  if (pad) {
    setConnection(true, pad.id);
    updateControllerVisual(pad);
    processInput(pad);
  } else if (state.connected) {
    setConnection(false, null);
  }
  setTimeout(tick, 16);
}

function bindWindowEvents() {
  window.addEventListener('gamepadconnected', e => {
    setConnection(true, e.gamepad.id);
    showToast('Controller verbunden', 'success');
    addActivity(`Verbunden: ${cleanDeviceName(e.gamepad.id)}`);
  });

  window.addEventListener('gamepaddisconnected', () => {
    if (firstGamepad()) return;
    setConnection(false, null);
    showToast('Controller getrennt', 'info');
    addActivity('Controller getrennt');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#modal-overlay').classList.contains('active')) {
      closeModal();
    }
  });

  if (typeof window.api.onInputPaused === 'function') {
    window.api.onInputPaused(paused => {
      showToast(paused ? 'Eingaben pausiert (Tray)' : 'Eingaben wieder aktiv', paused ? 'info' : 'success');
      addActivity(paused ? 'Eingaben pausiert' : 'Eingaben aktiv');
    });
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  prefersDark.addEventListener('change', () => {
    if (state.config.theme === 'system') applyTheme('system');
  });
}

// ═══ Live-Anzeige ═══
function updateControllerVisual(pad) {
  buttonElements.forEach((elements, index) => {
    const button = pad.buttons[index];
    const pressed = Boolean(button && button.pressed);
    elements.forEach(el => el.classList.toggle('pressed', pressed));
  });

  const nubs = [
    { nub: leftNub, origin: stickOrigin.left, x: pad.axes[0] || 0, y: pad.axes[1] || 0, group: $('#stick-left') },
    { nub: rightNub, origin: stickOrigin.right, x: pad.axes[2] || 0, y: pad.axes[3] || 0, group: $('#stick-right') }
  ];

  nubs.forEach(({ nub, origin, x, y, group }) => {
    if (!nub) return;
    nub.setAttribute('cx', origin.x + x * 15);
    nub.setAttribute('cy', origin.y + y * 15);
    if (group) group.classList.toggle('active', Math.abs(x) > 0.12 || Math.abs(y) > 0.12);
  });
}

// ═══ Eingaben ═══
function deadzoneCurve(value, deadzone) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  const scaled = (magnitude - deadzone) / (1 - deadzone);
  return Math.sign(value) * Math.pow(scaled, 1.7);
}

function processInput(pad) {
  const now = performance.now();
  const deadzone = state.config.controller.deadzone;

  pad.buttons.forEach((button, index) => {
    const wasPressed = state.lastButtons[index] || false;
    if (button.pressed && !wasPressed) fireTrigger(`button-${index}`, now);
    state.lastButtons[index] = button.pressed;
  });

  pad.axes.forEach((value, index) => {
    const current = deadzoneCurve(value, deadzone);
    const previous = deadzoneCurve(state.lastAxes[index] || 0, deadzone);
    if (current !== 0 && previous === 0) {
      fireTrigger(`axis-${index}-${current > 0 ? 'pos' : 'neg'}`, now);
    }
    state.lastAxes[index] = value;
  });

  applySticks(pad.axes);
}

function applySticks(axes) {
  const cfg = state.config.controller;
  const pointerAxes = cfg.swapSticks ? [2, 3] : [0, 1];
  const scrollAxis = cfg.swapSticks ? 1 : 3;

  const dx = deadzoneCurve(axes[pointerAxes[0]] || 0, cfg.deadzone);
  const dy = deadzoneCurve(axes[pointerAxes[1]] || 0, cfg.deadzone);

  if (dx !== 0 || dy !== 0) {
    const factor = POINTER_SPEED * cfg.mouseSensitivity;
    window.api.movePointer(dx * factor, dy * factor);
  }

  const scroll = deadzoneCurve(axes[scrollAxis] || 0, cfg.deadzone);
  if (scroll !== 0) {
    state.scrollAccum += scroll * cfg.scrollSpeed;
    const steps = Math.trunc(state.scrollAccum);
    if (steps !== 0) {
      state.scrollAccum -= steps;
      window.api.scrollPointer(steps);
    }
  }
}

function fireTrigger(trigger, now) {
  const profile = currentProfile();
  if (!profile) return;

  const mapping = profile.mappings.find(m => m.trigger === trigger);
  if (!mapping) return;

  const last = state.lastFire[trigger] || 0;
  if (now - last < mapping.cooldown) return;
  state.lastFire[trigger] = now;

  runMapping(mapping);
}

async function runMapping(mapping) {
  state.lastInput = mapping.name;
  $('#fact-last-input').textContent = mapping.name;
  addActivity(`${mapping.name} · ${actionLabel(mapping)}`);

  try {
    await window.api.executeAction({
      type: mapping.actionType,
      ...(mapping.action || {})
    });
  } catch (err) {
    console.error('Aktion fehlgeschlagen:', err);
  }
}

function actionLabel(mapping) {
  const action = mapping.action || {};
  switch (mapping.actionType) {
    case 'key': {
      const parts = (action.modifiers || []).map(m => MOD_LABELS[m] || m);
      if (action.key) parts.push(action.key);
      return parts.join(' + ') || 'Taste';
    }
    case 'mouse':
      return { click: 'Linksklick', doubleclick: 'Doppelklick', rightclick: 'Rechtsklick' }[action.action] || 'Mausklick';
    case 'scroll':
      return action.direction === 'up' ? 'Scrollen hoch' : 'Scrollen runter';
    case 'macro':
      return `Makro (${(action.steps || []).length} Schritte)`;
    case 'app':
      return { minimize: 'App minimieren', toggle: 'App an/aus', close: 'App schließen' }[action.command] || 'App-Befehl';
    default:
      return mapping.actionType || 'Aktion';
  }
}

// ═══ Rendern ═══
function renderAll() {
  renderProfileContext();
  renderMappingsList();
  renderProfilesList();
  renderDashboardTable();
}

function renderProfileContext() {
  const profile = currentProfile();
  const name = profile ? profile.name : 'Standard';
  const count = profile ? profile.mappings.length : 0;

  $('#profile-chip').textContent = `Profil: ${name}`;
  $('#mappings-profile').textContent = `Profil: ${name}`;
  $('#fact-profile').textContent = name;
  $('#fact-mappings').textContent = String(count);
  $('#pad-profile').textContent = name;
  $('#mapping-count').textContent = `${count} ${count === 1 ? 'Mapping' : 'Mappings'}`;
  $('#profiles-count').textContent = `${state.config.profiles.length} ${state.config.profiles.length === 1 ? 'Profil' : 'Profile'}`;
}

function renderDashboardTable() {
  const container = $('#active-mapping');
  const profile = currentProfile();
  container.replaceChildren();

  if (!profile || !profile.mappings.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Noch keine Mappings. Lege im Tab Mappings den ersten Eintrag an.';
    container.append(empty);
    return;
  }

  profile.mappings.forEach(mapping => {
    const row = document.createElement('div');
    row.className = 'map-row';

    const key = document.createElement('span');
    key.className = 'keycap';
    key.textContent = TRIGGER_SHORT[mapping.trigger] || mapping.trigger;

    const text = document.createElement('span');
    text.className = 'map-text';
    const name = document.createElement('span');
    name.className = 'map-name';
    name.textContent = mapping.name;
    const action = document.createElement('span');
    action.className = 'map-do';
    action.textContent = actionLabel(mapping);
    text.append(name, action);

    row.append(key, text);
    container.append(row);
  });
}

// ═══ Mappings ═══
function setupMappings() {
  $('#btn-add-mapping').addEventListener('click', () => {
    state.selectedMappingIndex = -1;
    renderMappingsList();
    showMappingEditor(null);
    $('#mapping-name').focus();
  });

  $('#btn-save-mapping').addEventListener('click', saveMapping);
  $('#btn-cancel-mapping').addEventListener('click', hideMappingEditor);
  $('#btn-delete-mapping').addEventListener('click', deleteMapping);
  $('#btn-duplicate-mapping').addEventListener('click', duplicateMapping);

  $('#mapping-action-type').addEventListener('change', e => updateActionFields(e.target.value));

  showMappingEditor(null);
}

function renderMappingsList() {
  const list = $('#mappings-list');
  const profile = currentProfile();
  list.replaceChildren();

  if (!profile || !profile.mappings.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Noch keine Mappings.';
    list.append(empty);
    renderProfileContext();
    return;
  }

  profile.mappings.forEach((mapping, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mapping-item';
    if (index === state.selectedMappingIndex) item.classList.add('active');

    const name = document.createElement('span');
    name.className = 'mapping-name';
    name.textContent = mapping.name || 'Ohne Namen';

    const trigger = document.createElement('span');
    trigger.className = 'mapping-trigger';
    trigger.textContent = TRIGGER_SHORT[mapping.trigger] || mapping.trigger;

    item.append(name, trigger);
    item.addEventListener('click', () => {
      state.selectedMappingIndex = index;
      renderMappingsList();
      showMappingEditor(mapping);
    });
    list.append(item);
  });

  renderProfileContext();
}

function showMappingEditor(mapping) {
  if (!mapping) state.selectedMappingIndex = -1;
  renderMappingsList();

  if (mapping) {
    $('#mapping-name').value = mapping.name || '';
    $('#mapping-trigger').value = mapping.trigger || '';
    $('#mapping-action-type').value = mapping.actionType || 'key';
    $('#mapping-key').value = mapping.action?.key || '';
    $('#mapping-cooldown').value = mapping.cooldown ?? 200;
    $('#mod-ctrl').checked = Boolean(mapping.action?.modifiers?.includes('CTRL'));
    $('#mod-alt').checked = Boolean(mapping.action?.modifiers?.includes('ALT'));
    $('#mod-shift').checked = Boolean(mapping.action?.modifiers?.includes('SHIFT'));
    $('#mod-meta').checked = Boolean(mapping.action?.modifiers?.includes('META'));
    $('#mapping-mouse-action').value = mapping.action?.action || 'click';
    $('#mapping-scroll-direction').value = mapping.action?.direction || 'up';
    $('#mapping-app-command').value = mapping.action?.command || 'minimize';
  } else {
    $('#mapping-name').value = '';
    $('#mapping-trigger').value = '';
    $('#mapping-action-type').value = 'key';
    $('#mapping-key').value = '';
    $('#mapping-cooldown').value = 200;
    $('#mod-ctrl').checked = false;
    $('#mod-alt').checked = false;
    $('#mod-shift').checked = false;
    $('#mod-meta').checked = false;
    $('#mapping-mouse-action').value = 'click';
    $('#mapping-scroll-direction').value = 'up';
    $('#mapping-app-command').value = 'minimize';
  }

  updateActionFields($('#mapping-action-type').value);
}

function hideMappingEditor() {
  showMappingEditor(null);
}

function updateActionFields(type) {
  $('#action-key-group').hidden = type !== 'key';
  $('#action-modifiers-group').hidden = type !== 'key';
  $('#action-mouse-group').hidden = type !== 'mouse';
  $('#action-scroll-group').hidden = type !== 'scroll';
  $('#action-app-group').hidden = type !== 'app';
}

async function saveMapping() {
  const profile = currentProfile();
  if (!profile) return;

  const name = $('#mapping-name').value.trim();
  const trigger = $('#mapping-trigger').value;
  const actionType = $('#mapping-action-type').value;
  const cooldown = Math.max(0, Math.min(5000, parseInt($('#mapping-cooldown').value, 10) || 0));

  if (!name || !trigger) {
    showToast('Name und Controller-Eingabe sind nötig', 'error');
    return;
  }

  const conflict = profile.mappings.find((m, i) =>
    m.trigger === trigger && i !== state.selectedMappingIndex);
  if (conflict) {
    showToast(`Diese Eingabe ist schon mit „${conflict.name}“ belegt`, 'error');
    return;
  }

  const modifiers = [];
  if ($('#mod-ctrl').checked) modifiers.push('CTRL');
  if ($('#mod-alt').checked) modifiers.push('ALT');
  if ($('#mod-shift').checked) modifiers.push('SHIFT');
  if ($('#mod-meta').checked) modifiers.push('META');

  let action = {};
  if (actionType === 'key') {
    const key = $('#mapping-key').value.trim().toUpperCase();
    if (!key) {
      showToast('Bitte eine Taste eintragen, z. B. ENTER', 'error');
      return;
    }
    action = { key, modifiers };
  } else if (actionType === 'mouse') {
    action = { action: $('#mapping-mouse-action').value };
  } else if (actionType === 'scroll') {
    action = { direction: $('#mapping-scroll-direction').value, amount: 1 };
  } else if (actionType === 'app') {
    action = { command: $('#mapping-app-command').value };
  } else if (actionType === 'macro') {
    action = { steps: [] };
  }

  const mapping = { name, trigger, actionType, action, cooldown };

  if (state.selectedMappingIndex >= 0 && state.selectedMappingIndex < profile.mappings.length) {
    profile.mappings[state.selectedMappingIndex] = mapping;
  } else {
    profile.mappings.push(mapping);
  }

  await persist();
  renderMappingsList();
  renderDashboardTable();
  hideMappingEditor();
  showToast('Mapping gespeichert', 'success');
}

async function deleteMapping() {
  const profile = currentProfile();
  if (!profile || state.selectedMappingIndex < 0) {
    showToast('Wähle zuerst ein Mapping aus', 'info');
    return;
  }

  profile.mappings.splice(state.selectedMappingIndex, 1);
  await persist();
  hideMappingEditor();
  renderDashboardTable();
  showToast('Mapping gelöscht', 'info');
}

async function duplicateMapping() {
  const profile = currentProfile();
  if (!profile || state.selectedMappingIndex < 0) {
    showToast('Wähle zuerst ein Mapping aus', 'info');
    return;
  }

  const copy = JSON.parse(JSON.stringify({
    ...profile.mappings[state.selectedMappingIndex],
    name: `${profile.mappings[state.selectedMappingIndex].name} (Kopie)`
  }));
  profile.mappings.push(copy);
  state.selectedMappingIndex = profile.mappings.length - 1;
  await persist();
  renderMappingsList();
  renderDashboardTable();
  showMappingEditor(copy);
  showToast('Mapping dupliziert', 'success');
}

// ═══ Bildschirmtastatur ═══
const KEYBOARD_ROWS = [
  [['ESC', 'Esc'], ['F1', 'F1'], ['F2', 'F2'], ['F3', 'F3'], ['F4', 'F4'], ['F5', 'F5'], ['F6', 'F6'],
   ['F7', 'F7'], ['F8', 'F8'], ['F9', 'F9'], ['F10', 'F10'], ['F11', 'F11'], ['F12', 'F12']],
  [['`', '`'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'],
   ['8', '8'], ['9', '9'], ['0', '0'], ['-', '-'], ['=', '='], ['BACKSPACE', 'Backspace']],
  [['TAB', 'Tab'], ['Q', 'Q'], ['W', 'W'], ['E', 'E'], ['R', 'R'], ['T', 'T'], ['Y', 'Y'], ['U', 'U'],
   ['I', 'I'], ['O', 'O'], ['P', 'P'], ['[', '['], [']', ']'], ['\\', '\\']],
  [['CAPSLOCK', 'Caps'], ['A', 'A'], ['S', 'S'], ['D', 'D'], ['F', 'F'], ['G', 'G'], ['H', 'H'],
   ['J', 'J'], ['K', 'K'], ['L', 'L'], [';', ';'], ["'", "'"], ['ENTER', 'Enter']],
  [['SHIFT', 'Shift'], ['Z', 'Z'], ['X', 'X'], ['C', 'C'], ['V', 'V'], ['B', 'B'], ['N', 'N'],
   ['M', 'M'], [',', ','], ['.', '.'], ['/', '/'], ['SHIFT', 'Shift']],
  [['CTRL', 'Strg'], ['ALT', 'Alt'], ['SPACE', 'Leertaste'], ['ALT', 'Alt'], ['CTRL', 'Strg']]
];

function setupKeyboard() {
  const board = $('#screen-keyboard');
  board.replaceChildren();

  KEYBOARD_ROWS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';

    row.forEach(([key, legend]) => {
      const keyEl = document.createElement('button');
      keyEl.type = 'button';
      keyEl.className = 'kb-key';
      keyEl.dataset.key = key;
      keyEl.textContent = legend;
      keyEl.title = `${legend} senden`;

      if (key === 'SPACE') keyEl.classList.add('space');
      else if (['BACKSPACE', 'TAB', 'CAPSLOCK', 'ENTER'].includes(key)) keyEl.classList.add('wide');
      else if (['SHIFT', 'CTRL', 'ALT'].includes(key)) keyEl.classList.add('extra-wide');

      keyEl.addEventListener('click', () => {
        keyEl.classList.add('pressed');
        setTimeout(() => keyEl.classList.remove('pressed'), 110);
        sendKey(key, legend);
      });

      rowEl.append(keyEl);
    });

    board.append(rowEl);
  });

  $('#btn-keyboard-close').addEventListener('click', () => showPage('dashboard'));
}

function sendKey(key, legend) {
  window.api.executeAction({ type: 'key', key, modifiers: [] });
  addActivity(`Taste gesendet: ${legend}`);
}

// ═══ Profile ═══
function setupProfiles() {
  $('#btn-add-profile').addEventListener('click', () => {
    showModal('Neues Profil', `
      <div class="field">
        <label for="profile-name">Profilname</label>
        <input type="text" id="profile-name" placeholder="z. B. Medien" class="input">
      </div>
    `, [
      { label: 'Abbrechen', className: 'btn-quiet', action: closeModal },
      { label: 'Erstellen', className: 'btn-primary', action: createProfile }
    ]);
    $('#profile-name').focus();
  });
}

function renderProfilesList() {
  const list = $('#profiles-list');
  list.replaceChildren();

  state.config.profiles.forEach(profile => {
    const row = document.createElement('div');
    row.className = 'profile-item';
    if (profile.id === state.activeProfileId) row.classList.add('active');

    const name = document.createElement('span');
    name.className = 'profile-name';
    name.textContent = profile.name;

    const meta = document.createElement('span');
    meta.className = 'profile-meta';
    meta.textContent = `${profile.mappings.length} Mappings`;

    row.append(name, meta);

    if (profile.id === state.activeProfileId) {
      const mark = document.createElement('span');
      mark.className = 'profile-active-mark';
      mark.textContent = 'aktiv';
      row.append(mark);
    }

    const actions = document.createElement('div');
    actions.className = 'profile-actions';

    if (profile.id !== state.activeProfileId) {
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'btn btn-quiet btn-sm';
      load.textContent = 'Aktivieren';
      load.addEventListener('click', () => loadProfile(profile.id, true));
      actions.append(load);
    }

    if (profile.id !== 'default') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-quiet btn-quiet--danger btn-sm';
      remove.textContent = 'Löschen';
      remove.addEventListener('click', () => deleteProfile(profile));
      actions.append(remove);
    }

    row.append(actions);
    list.append(row);
  });

  renderProfileContext();
}

async function createProfile() {
  const input = $('#profile-name');
  const name = input ? input.value.trim() : '';
  if (!name) {
    showToast('Name erforderlich', 'error');
    return;
  }

  state.config.profiles.push({ id: `profile-${Date.now()}`, name, mappings: [] });
  await persist();
  closeModal();
  renderProfilesList();
  showToast('Profil erstellt', 'success');
}

async function loadProfile(id, announce = false) {
  const profile = state.config.profiles.find(p => p.id === id);
  if (!profile) return;

  state.activeProfileId = id;
  state.selectedMappingIndex = -1;
  hideMappingEditor();
  await persist();
  renderProfilesList();
  renderMappingsList();
  renderDashboardTable();

  if (announce) {
    showToast(`Profil „${profile.name}“ aktiv`, 'success');
    addActivity(`Profil aktiv: ${profile.name}`);
  }
}

async function deleteProfile(profile) {
  if (profile.id === 'default') {
    showToast('Das Standardprofil bleibt erhalten', 'error');
    return;
  }

  state.config.profiles = state.config.profiles.filter(p => p.id !== profile.id);
  if (state.activeProfileId === profile.id) {
    state.activeProfileId = 'default';
  }

  await persist();
  renderProfilesList();
  renderMappingsList();
  renderDashboardTable();
  showToast('Profil gelöscht', 'info');
}

// ═══ Einstellungen ═══
function setupSettings() {
  const save = () => saveSettings();

  ['setting-start-minimized', 'setting-autostart', 'setting-rumble', 'setting-swapsticks']
    .forEach(id => $(`#${id}`).addEventListener('change', save));

  $('#setting-theme').addEventListener('change', e => {
    applyTheme(e.target.value);
    save();
  });

  [['setting-deadzone', 'deadzone-value', 2], ['setting-sensitivity', 'sensitivity-value', 1], ['setting-scrollspeed', 'scrollspeed-value', 1]]
    .forEach(([id, valueId, digits]) => {
      const input = $(`#${id}`);
      input.addEventListener('input', () => {
        $(`#${valueId}`).textContent = Number(input.value).toFixed(digits).replace(/\.0$/, '.0');
      });
      input.addEventListener('change', save);
    });

  $('#btn-export-config').addEventListener('click', exportConfig);
  $('#btn-import-config').addEventListener('click', importConfig);
  $('#btn-reset-config').addEventListener('click', resetConfig);
}

function renderSettings() {
  const cfg = state.config;
  $('#setting-start-minimized').checked = Boolean(cfg.startMinimized);
  $('#setting-autostart').checked = Boolean(cfg.autoStart);
  $('#setting-theme').value = cfg.theme || 'light';
  $('#setting-deadzone').value = cfg.controller.deadzone;
  $('#setting-sensitivity').value = cfg.controller.mouseSensitivity;
  $('#setting-scrollspeed').value = cfg.controller.scrollSpeed;
  $('#setting-rumble').checked = cfg.controller.rumble !== false;
  $('#setting-swapsticks').checked = Boolean(cfg.controller.swapSticks);
  $('#setting-update-check').checked = cfg.updates.checkOnStart !== false;

  $('#deadzone-value').textContent = Number(cfg.controller.deadzone).toFixed(2);
  $('#sensitivity-value').textContent = Number(cfg.controller.mouseSensitivity).toFixed(1);
  $('#scrollspeed-value').textContent = Number(cfg.controller.scrollSpeed).toFixed(1);
}

async function saveSettings() {
  const cfg = state.config;
  cfg.startMinimized = $('#setting-start-minimized').checked;
  cfg.autoStart = $('#setting-autostart').checked;
  cfg.theme = $('#setting-theme').value;
  cfg.controller.deadzone = parseFloat($('#setting-deadzone').value);
  cfg.controller.mouseSensitivity = parseFloat($('#setting-sensitivity').value);
  cfg.controller.scrollSpeed = parseFloat($('#setting-scrollspeed').value);
  cfg.controller.rumble = $('#setting-rumble').checked;
  cfg.controller.swapSticks = $('#setting-swapsticks').checked;
  cfg.updates.checkOnStart = $('#setting-update-check').checked;
  await persist();
}

function applyTheme(theme) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved === 'dark' ? 'dark' : 'light');
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'controllerdesktop-config.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Konfiguration exportiert', 'success');
}

function importConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || !Array.isArray(imported.profiles)) throw new Error('Kein gültiges Profil enthalten');
      state.config = normalizeConfig(imported);
      state.activeProfileId = state.config.activeProfile || 'default';
      await persist();
      applyTheme(state.config.theme);
      renderSettings();
      renderAll();
      showToast('Konfiguration importiert', 'success');
    } catch (err) {
      console.error('Import error:', err);
      showToast('Import fehlgeschlagen – Datei prüfen', 'error');
    }
  });
  input.click();
}

function resetConfig() {
  showModal('Auf Standard zurücksetzen', `
    <p>Alle Mappings, Profile und Einstellungen werden durch die Standardwerte ersetzt.</p>
    <p class="field-hint">Die aktuelle Konfiguration wird vorher nicht gesichert.</p>
  `, [
    { label: 'Abbrechen', className: 'btn-quiet', action: closeModal },
    { label: 'Zurücksetzen', className: 'btn-quiet btn-quiet--danger', action: async () => {
      state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      state.activeProfileId = 'default';
      state.selectedMappingIndex = -1;
      await persist();
      applyTheme(state.config.theme);
      renderSettings();
      hideMappingEditor();
      renderAll();
      closeModal();
      showToast('Standardwerte wiederhergestellt', 'success');
    } }
  ]);
}

// ═══ Updates ═══
function setupUpdates() {
  $('#btn-update-check').addEventListener('click', async () => {
    renderUpdateState({ status: 'checking', message: '' });
    renderUpdateState(await window.api.checkForUpdates());
  });

  $('#btn-update-download').addEventListener('click', async () => {
    renderUpdateState({ status: 'downloading', percent: 0 });
    renderUpdateState(await window.api.downloadUpdate());
  });

  $('#btn-update-install').addEventListener('click', () => window.api.installUpdate());
  $('#setting-update-check').addEventListener('change', saveSettings);

  if (typeof window.api.onUpdateState === 'function') {
    window.api.onUpdateState(renderUpdateState);
  }

  if (typeof window.api.getUpdateState === 'function') {
    window.api.getUpdateState().then(renderUpdateState).catch(() => {});
  } else {
    renderUpdateState({ status: 'unavailable', message: 'Updates stehen nur in der installierten App zur Verfügung.' });
  }
}

function renderUpdateState(next) {
  if (!next) return;
  state.update = { ...(state.update || {}), ...next };
  const update = state.update;
  const version = update.currentVersion || state.version;

  $('#update-version').textContent = `Version ${version}`;

  const status = $('#update-status');
  status.classList.remove('is-ready', 'is-error');

  switch (update.status) {
    case 'checking':
      status.textContent = 'Suche nach Updates …';
      break;
    case 'current':
      status.textContent = 'Du nutzt die neueste Version.';
      status.classList.add('is-ready');
      break;
    case 'available':
      status.textContent = update.portable
        ? `Version ${update.version} ist verfügbar. Portable-Version: lade die neue EXE aus den Releases.`
        : `Version ${update.version} ist verfügbar.`;
      break;
    case 'downloading':
      status.textContent = `Update wird geladen … ${update.percent || 0} %`;
      break;
    case 'ready':
      status.textContent = `Version ${update.version} ist bereit. Ein Neustart installiert sie.`;
      status.classList.add('is-ready');
      break;
    case 'error':
      status.textContent = `Prüfung fehlgeschlagen: ${update.message || 'unbekannter Fehler'}`;
      status.classList.add('is-error');
      break;
    case 'unavailable':
      status.textContent = update.message || 'Updates stehen nur in der installierten Windows-App zur Verfügung.';
      break;
    default:
      status.textContent = 'Noch nicht geprüft.';
  }

  const downloading = update.status === 'downloading';
  $('#update-progress').hidden = !downloading;
  $('#update-progress-bar').style.width = `${Math.min(100, Math.max(0, update.percent || 0))}%`;
  $('#btn-update-download').hidden = update.portable || update.status !== 'available';
  $('#btn-update-install').hidden = update.portable || update.status !== 'ready';
  $('#btn-update-check').disabled = update.status === 'checking' || downloading;
}

// ═══ Schnellaktionen ═══
function setupQuickActions() {
  $$('.quick-btn').forEach(button => {
    button.addEventListener('click', () => handleQuickAction(button.dataset.action));
  });
}

async function handleQuickAction(action) {
  switch (action) {
    case 'toggle-app':
      await window.api.toggleApp();
      addActivity('App an/aus');
      break;
    case 'minimize':
      await window.api.minimizeApp();
      addActivity('App minimiert');
      break;
    case 'screenshot':
      await window.api.executeAction({ type: 'key', key: 'PRINTSCREEN', modifiers: [] });
      addActivity('Screenshot');
      break;
    case 'volume-up':
      await window.api.executeAction({ type: 'key', key: 'VOLUMEUP', modifiers: [] });
      addActivity('Lautstärke erhöht');
      break;
    case 'volume-down':
      await window.api.executeAction({ type: 'key', key: 'VOLUMEDOWN', modifiers: [] });
      addActivity('Lautstärke gesenkt');
      break;
    case 'mute':
      await window.api.executeAction({ type: 'key', key: 'VOLUMEMUTE', modifiers: [] });
      addActivity('Ton stumm');
      break;
  }
}

// ═══ Modal ═══
function setupModal() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', e => {
    if (e.target === $('#modal-overlay')) closeModal();
  });
}

function showModal(title, bodyHtml, buttons) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;

  const footer = $('#modal-footer');
  footer.replaceChildren();

  buttons.forEach(button => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn ${button.className || 'btn-quiet'}`;
    el.textContent = button.label;
    el.addEventListener('click', button.action);
    footer.append(el);
  });

  $('#modal-overlay').classList.add('active');
}

function closeModal() {
  $('#modal-overlay').classList.remove('active');
}

// ═══ Toasts ═══
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $('#toast-container').append(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity .2s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 220);
  }, 2800);
}

// ═══ Verlauf ═══
function addActivity(text) {
  const time = new Date().toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  state.activity.unshift({ time, text });
  if (state.activity.length > 40) state.activity.length = 40;

  const log = $('#activity-log');
  log.replaceChildren();

  state.activity.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'activity-item';

    const stamp = document.createElement('span');
    stamp.className = 'activity-time';
    stamp.textContent = entry.time;

    const label = document.createElement('span');
    label.className = 'activity-action';
    label.textContent = entry.text;

    row.append(stamp, label);
    log.append(row);
  });
}

// ═══ Design-Vorschau im Browser ═══
function devPreview() {
  setConnection(true, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');
  const pressed = [0, 15];
  pressed.forEach(index => (buttonElements.get(index) || []).forEach(el => el.classList.add('pressed')));
  if (leftNub) { leftNub.setAttribute('cx', stickOrigin.left.x + 11); leftNub.setAttribute('cy', stickOrigin.left.y - 7); }
  const stick = $('#stick-left');
  if (stick) stick.classList.add('active');

  ['Bestätigen · Enter', 'Nach rechts · RIGHT', 'Profil aktiv: Standard', 'Verbunden: Xbox Wireless Controller']
    .forEach(text => addActivity(text));
}

// ═══ Los ═══
document.addEventListener('DOMContentLoaded', init);
