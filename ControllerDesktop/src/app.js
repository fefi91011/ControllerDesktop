// app.js – Renderer Prozess
// ControllerDesktop – Portable Gamepad Desktop Steuerung

// ═══ State ═══
let config = null;
let gamepadState = {
  connected: false,
  id: null,
  buttons: [],
  axes: [],
  lastButtons: [],
  lastAxes: [],
  lastActionTime: 0
};
let activeMappingId = null;
let mappings = [];
let profiles = [];
let activeProfileId = 'default';
let activityLog = [];
let keyboardVisible = false;
let selectedMappingIndex = -1;

// ═══ DOM Elements ═══
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ═══ Initialization ═══
async function init() {
  try {
    config = await window.api.getConfig();
    mappings = config.mappings || [];
    profiles = config.profiles || [];
    activeProfileId = config.activeProfile || 'default';

    // Ensure default profile exists
    if (!profiles.find(p => p.id === 'default')) {
      profiles.push({ id: 'default', name: 'Standard', mappings: [] });
    }

    setupNavigation();
    setupDashboard();
    setupMappings();
    setupKeyboard();
    setupProfiles();
    setupSettings();
    setupGamepad();
    setupQuickActions();
    setupModal();
    setupToasts();

    // Load active profile
    loadProfile(activeProfileId);

    // Update version
    const version = await window.api.getAppVersion();
    $('#app-version').textContent = `v${version}`;

    // Apply theme
    applyTheme(config.theme || 'dark');

    // Start gamepad loop
    requestAnimationFrame(gamepadLoop);

    console.log('ControllerDesktop initialized');
  } catch (err) {
    console.error('Init error:', err);
    showToast('Fehler beim Initialisieren', 'error');
  }
}

// ═══ Navigation ═══
function setupNavigation() {
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      $$('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      $$('.page').forEach(p => p.classList.remove('active'));
      $(`#page-${page}`).classList.add('active');
    });
  });
}

// ═══ Dashboard ═══
function setupDashboard() {
  // Controller visual buttons
  $$('.dpad-btn, .face-btn, .shoulder-btn, .small-btn').forEach(btn => {
    btn.addEventListener('mousedown', () => btn.classList.add('pressed'));
    btn.addEventListener('mouseup', () => btn.classList.remove('pressed'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('pressed'));
  });
}

function updateControllerVisual(gp) {
  if (!gp) return;

  // Update buttons
  gp.buttons.forEach((btn, i) => {
    const el = document.querySelector(`[data-btn="${i}"]`);
    if (el) {
      if (btn.pressed) el.classList.add('pressed');
      else el.classList.remove('pressed');
    }
  });

  // Update sticks
  const leftStick = $('#stick-left');
  const rightStick = $('#stick-right');
  if (leftStick && gp.axes.length >= 2) {
    const x = gp.axes[0] || 0;
    const y = gp.axes[1] || 0;
    const nub = leftStick.querySelector('.stick-nub');
    nub.style.transform = `translate(${x * 12}px, ${y * 12}px)`;
    if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) leftStick.classList.add('active');
    else leftStick.classList.remove('active');
  }
  if (rightStick && gp.axes.length >= 4) {
    const x = gp.axes[2] || 0;
    const y = gp.axes[3] || 0;
    const nub = rightStick.querySelector('.stick-nub');
    nub.style.transform = `translate(${x * 12}px, ${y * 12}px)`;
    if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) rightStick.classList.add('active');
    else rightStick.classList.remove('active');
  }
}

// ═══ Gamepad ═══
function setupGamepad() {
  window.addEventListener('gamepadconnected', (e) => {
    console.log('Gamepad connected:', e.gamepad.id);
    gamepadState.connected = true;
    gamepadState.id = e.gamepad.id;
    updateControllerStatus(true, e.gamepad.id);
    showToast('Controller verbunden', 'success');
    addActivity('Controller verbunden');
  });

  window.addEventListener('gamepaddisconnected', (e) => {
    console.log('Gamepad disconnected:', e.gamepad.id);
    gamepadState.connected = false;
    gamepadState.id = null;
    updateControllerStatus(false);
    showToast('Controller getrennt', 'info');
    addActivity('Controller getrennt');
  });
}

function updateControllerStatus(connected, id) {
  const dot = $('#status-dot');
  const text = $('#status-text');
  const badge = $('#controller-badge');

  if (connected) {
    dot.classList.add('connected');
    text.textContent = id ? `${id.substring(0, 30)}...` : 'Verbunden';
    badge.textContent = 'Verbunden';
    badge.classList.add('connected');
  } else {
    dot.classList.remove('connected');
    text.textContent = 'Kein Controller';
    badge.textContent = 'Nicht verbunden';
    badge.classList.remove('connected');
  }
}

function gamepadLoop() {
  const gamepads = navigator.getGamepads();
  let gp = null;

  for (const g of gamepads) {
    if (g && g.connected) {
      gp = g;
      break;
    }
  }

  if (gp) {
    gamepadState.buttons = gp.buttons.map(b => b.pressed);
    gamepadState.axes = [...gp.axes];

    updateControllerVisual(gp);
    processGamepadInput(gp);
  }

  requestAnimationFrame(gamepadLoop);
}

function processGamepadInput(gp) {
  const now = Date.now();
  const deadzone = config.controller?.deadzone || 0.15;

  // Check button mappings
  gp.buttons.forEach((btn, i) => {
    const wasPressed = gamepadState.lastButtons[i] || false;
    const isPressed = btn.pressed;

    if (isPressed && !wasPressed) {
      // Button just pressed
      const mapping = getMappingForButton(i);
      if (mapping) {
        const cooldown = mapping.cooldown || 200;
        if (now - gamepadState.lastActionTime > cooldown) {
          executeMapping(mapping);
          gamepadState.lastActionTime = now;
        }
      }
    }
  });

  // Check axis (stick) mappings
  gp.axes.forEach((axis, i) => {
    const lastAxis = gamepadState.lastAxes[i] || 0;
    const deadzoned = Math.abs(axis) > deadzone ? axis : 0;
    const lastDeadzoned = Math.abs(lastAxis) > deadzone ? lastAxis : 0;

    if (Math.abs(deadzoned) > 0 && Math.abs(lastDeadzoned) === 0) {
      // Axis just moved
      const mapping = getMappingForAxis(i, deadzoned);
      if (mapping) {
        const cooldown = mapping.cooldown || 200;
        if (now - gamepadState.lastActionTime > cooldown) {
          executeMapping(mapping);
          gamepadState.lastActionTime = now;
        }
      }
    }
  });

  gamepadState.lastButtons = [...gamepadState.buttons];
  gamepadState.lastAxes = [...gamepadState.axes];
}

function getMappingForButton(buttonIndex) {
  const profile = profiles.find(p => p.id === activeProfileId);
  if (!profile) return null;
  return profile.mappings.find(m => m.trigger === `button-${buttonIndex}`);
}

function getMappingForAxis(axisIndex, value) {
  const profile = profiles.find(p => p.id === activeProfileId);
  if (!profile) return null;
  return profile.mappings.find(m => m.trigger === `axis-${axisIndex}-${value > 0 ? 'pos' : 'neg'}`);
}

async function executeMapping(mapping) {
  if (!mapping) return;

  addActivity(`${mapping.name}: ${mapping.actionType}`);

  try {
    await window.api.executeAction({
      type: mapping.actionType,
      ...mapping.action
    });
  } catch (err) {
    console.error('Execute action error:', err);
  }
}

// ═══ Mappings ═══
function setupMappings() {
  // Add mapping button
  $('#btn-add-mapping').addEventListener('click', () => {
    showMappingEditor(null);
  });

  // Save mapping
  $('#btn-save-mapping').addEventListener('click', saveMapping);

  // Cancel
  $('#btn-cancel-mapping').addEventListener('click', () => {
    hideMappingEditor();
  });

  // Delete
  $('#btn-delete-mapping').addEventListener('click', deleteMapping);

  // Duplicate
  $('#btn-duplicate-mapping').addEventListener('click', duplicateMapping);

  // Action type change
  $('#mapping-action-type').addEventListener('change', (e) => {
    updateActionFields(e.target.value);
  });

  renderMappingsList();
}

function renderMappingsList() {
  const container = $('#mappings-list');
  const profile = profiles.find(p => p.id === activeProfileId);
  if (!profile) return;

  container.innerHTML = '';

  if (profile.mappings.length === 0) {
    container.innerHTML = '<p class="empty-state">Keine Mappings vorhanden</p>';
    return;
  }

  profile.mappings.forEach((mapping, index) => {
    const item = document.createElement('div');
    item.className = `mapping-item ${index === selectedMappingIndex ? 'active' : ''}`;
    item.innerHTML = `
      <span class="mapping-name">${mapping.name}</span>
      <span class="mapping-trigger">${getTriggerLabel(mapping.trigger)}</span>
    `;
    item.addEventListener('click', () => {
      selectedMappingIndex = index;
      renderMappingsList();
      showMappingEditor(mapping);
    });
    container.appendChild(item);
  });
}

function getTriggerLabel(trigger) {
  if (!trigger) return '';
  if (trigger.startsWith('button-')) {
    const btn = parseInt(trigger.split('-')[1]);
    const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right'];
    return names[btn] || `Btn ${btn}`;
  }
  if (trigger.startsWith('axis-')) {
    return `Axis ${trigger.split('-')[1]}`;
  }
  return trigger;
}

function showMappingEditor(mapping) {
  const editor = $('#mapping-editor');
  editor.style.display = 'block';

  if (mapping) {
    $('#mapping-name').value = mapping.name || '';
    $('#mapping-trigger').value = mapping.trigger || '';
    $('#mapping-action-type').value = mapping.actionType || 'key';
    $('#mapping-key').value = mapping.action?.key || '';
    $('#mapping-cooldown').value = mapping.cooldown || 200;
    $('#mod-ctrl').checked = mapping.action?.modifiers?.includes('CTRL') || false;
    $('#mod-alt').checked = mapping.action?.modifiers?.includes('ALT') || false;
    $('#mod-shift').checked = mapping.action?.modifiers?.includes('SHIFT') || false;
    $('#mod-meta').checked = mapping.action?.modifiers?.includes('META') || false;
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
  }

  updateActionFields($('#mapping-action-type').value);
}

function hideMappingEditor() {
  $('#mapping-editor').style.display = 'none';
  selectedMappingIndex = -1;
  renderMappingsList();
}

function updateActionFields(type) {
  $('#action-key-group').style.display = type === 'key' ? 'block' : 'none';
  $('#action-modifiers-group').style.display = type === 'key' ? 'block' : 'none';
  $('#action-mouse-group').style.display = type === 'mouse' ? 'block' : 'none';
  $('#action-scroll-group').style.display = type === 'scroll' ? 'block' : 'none';
  $('#action-app-group').style.display = type === 'app' ? 'block' : 'none';
}

async function saveMapping() {
  const profile = profiles.find(p => p.id === activeProfileId);
  if (!profile) return;

  const name = $('#mapping-name').value.trim();
  const trigger = $('#mapping-trigger').value;
  const actionType = $('#mapping-action-type').value;
  const cooldown = parseInt($('#mapping-cooldown').value) || 200;

  if (!name || !trigger) {
    showToast('Name und Trigger erforderlich', 'error');
    return;
  }

  const modifiers = [];
  if ($('#mod-ctrl').checked) modifiers.push('CTRL');
  if ($('#mod-alt').checked) modifiers.push('ALT');
  if ($('#mod-shift').checked) modifiers.push('SHIFT');
  if ($('#mod-meta').checked) modifiers.push('META');

  let action = {};
  switch (actionType) {
    case 'key':
      action = { key: $('#mapping-key').value, modifiers };
      break;
    case 'mouse':
      action = { action: $('#mapping-mouse-action').value };
      break;
    case 'scroll':
      action = { direction: $('#mapping-scroll-direction').value, amount: 1 };
      break;
    case 'app':
      action = { command: $('#mapping-app-command').value };
      break;
  }

  const mapping = { name, trigger, actionType, action, cooldown };

  if (selectedMappingIndex >= 0 && selectedMappingIndex < profile.mappings.length) {
    profile.mappings[selectedMappingIndex] = mapping;
  } else {
    profile.mappings.push(mapping);
  }

  await saveConfig();
  renderMappingsList();
  hideMappingEditor();
  showToast('Mapping gespeichert', 'success');
}

async function deleteMapping() {
  const profile = profiles.find(p => p.id === activeProfileId);
  if (!profile || selectedMappingIndex < 0) return;

  profile.mappings.splice(selectedMappingIndex, 1);
  await saveConfig();
  renderMappingsList();
  hideMappingEditor();
  showToast('Mapping gelöscht', 'info');
}

async function duplicateMapping() {
  const profile = profiles.find(p => p.id === activeProfileId);
  if (!profile || selectedMappingIndex < 0) return;

  const original = profile.mappings[selectedMappingIndex];
  const copy = { ...original, name: `${original.name} (Kopie)` };
  profile.mappings.push(copy);
  await saveConfig();
  renderMappingsList();
  showToast('Mapping dupliziert', 'success');
}

// ═══ Screen Keyboard ═══
function setupKeyboard() {
  const keyboard = $('#screen-keyboard');
  const rows = [
    ['ESC', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'BACKSPACE'],
    ['TAB', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
    ['CAPSLOCK', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'ENTER'],
    ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'SHIFT'],
    ['CTRL', 'ALT', 'SPACE', 'ALT', 'CTRL']
  ];

  rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';

    row.forEach(key => {
      const keyEl = document.createElement('div');
      keyEl.className = 'kb-key';
      keyEl.textContent = key;
      keyEl.dataset.key = key;

      if (key === 'SPACE') keyEl.classList.add('space');
      else if (key === 'BACKSPACE' || key === 'TAB' || key === 'CAPSLOCK' || key === 'ENTER') keyEl.classList.add('wide');
      else if (key === 'SHIFT' || key === 'CTRL' || key === 'ALT') keyEl.classList.add('extra-wide');

      keyEl.addEventListener('click', () => {
        keyEl.classList.add('pressed');
        setTimeout(() => keyEl.classList.remove('pressed'), 100);
        simulateKey(key);
      });

      rowEl.appendChild(keyEl);
    });

    keyboard.appendChild(rowEl);
  });

  $('#btn-keyboard-clear').addEventListener('click', () => {
    showToast('Tastatur geleert', 'info');
  });

  $('#btn-keyboard-close').addEventListener('click', () => {
    // Navigate back to dashboard
    $$('.nav-item').forEach(i => i.classList.remove('active'));
    $('.nav-item[data-page="dashboard"]').classList.add('active');
    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-dashboard').classList.add('active');
  });
}

function simulateKey(key) {
  const action = { type: 'key', key: key, modifiers: [] };
  window.api.executeAction(action);
  addActivity(`Taste: ${key}`);
}

// ═══ Profiles ═══
function setupProfiles() {
  $('#btn-add-profile').addEventListener('click', () => {
    showModal('Neues Profil', `
      <div class="form-group">
        <label for="profile-name">Profilname</label>
        <input type="text" id="profile-name" placeholder="Profilname..." class="form-input">
      </div>
    `, [
      { label: 'Abbrechen', class: 'btn-secondary', action: closeModal },
      { label: 'Erstellen', class: 'btn-primary', action: createProfile }
    ]);
  });

  renderProfilesList();
}

function renderProfilesList() {
  const container = $('#profiles-list');
  container.innerHTML = '';

  profiles.forEach(profile => {
    const item = document.createElement('div');
    item.className = `profile-item ${profile.id === activeProfileId ? 'active' : ''}`;
    item.innerHTML = `
      <span class="profile-name">${profile.name}</span>
      <div class="profile-actions">
        <button class="btn btn-sm btn-secondary" data-action="load">Laden</button>
        <button class="btn btn-sm btn-danger" data-action="delete">Löschen</button>
      </div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'load') {
        loadProfile(profile.id);
      } else if (e.target.dataset.action === 'delete') {
        deleteProfile(profile.id);
      }
    });
    container.appendChild(item);
  });
}

async function createProfile() {
  const name = $('#profile-name').value.trim();
  if (!name) {
    showToast('Name erforderlich', 'error');
    return;
  }

  const id = 'profile-' + Date.now();
  profiles.push({ id, name, mappings: [] });
  await saveConfig();
  renderProfilesList();
  closeModal();
  showToast('Profil erstellt', 'success');
}

function loadProfile(id) {
  activeProfileId = id;
  const profile = profiles.find(p => p.id === id);
  if (profile) {
    mappings = profile.mappings;
    renderMappingsList();
    showToast(`Profil "${profile.name}" geladen`, 'success');
    addActivity(`Profil geladen: ${profile.name}`);
  }
}

async function deleteProfile(id) {
  if (id === 'default') {
    showToast('Standardprofil kann nicht gelöscht werden', 'error');
    return;
  }

  profiles = profiles.filter(p => p.id !== id);
  if (activeProfileId === id) {
    activeProfileId = 'default';
    loadProfile('default');
  }
  await saveConfig();
  renderProfilesList();
  showToast('Profil gelöscht', 'info');
}

// ═══ Settings ═══
function setupSettings() {
  // Load current values
  $('#setting-start-minimized').checked = config.startMinimized || false;
  $('#setting-autostart').checked = config.autoStart || false;
  $('#setting-theme').value = config.theme || 'dark';
  $('#setting-deadzone').value = config.controller?.deadzone || 0.15;
  $('#setting-sensitivity').value = config.controller?.mouseSensitivity || 1.0;
  $('#setting-scrollspeed').value = config.controller?.scrollSpeed || 1.0;
  $('#setting-rumble').checked = config.controller?.rumble !== false;
  $('#setting-swapsticks').checked = config.controller?.swapSticks || false;

  // Update range displays
  $('#deadzone-value').textContent = $('#setting-deadzone').value;
  $('#sensitivity-value').textContent = $('#setting-sensitivity').value;
  $('#scrollspeed-value').textContent = $('#setting-scrollspeed').value;

  // Event listeners
  $('#setting-start-minimized').addEventListener('change', saveSettings);
  $('#setting-autostart').addEventListener('change', saveSettings);
  $('#setting-theme').addEventListener('change', (e) => {
    applyTheme(e.target.value);
    saveSettings();
  });
  $('#setting-deadzone').addEventListener('input', (e) => {
    $('#deadzone-value').textContent = e.target.value;
    saveSettings();
  });
  $('#setting-sensitivity').addEventListener('input', (e) => {
    $('#sensitivity-value').textContent = e.target.value;
    saveSettings();
  });
  $('#setting-scrollspeed').addEventListener('input', (e) => {
    $('#scrollspeed-value').textContent = e.target.value;
    saveSettings();
  });
  $('#setting-rumble').addEventListener('change', saveSettings);
  $('#setting-swapsticks').addEventListener('change', saveSettings);

  // Export/Import/Reset
  $('#btn-export-config').addEventListener('click', exportConfig);
  $('#btn-import-config').addEventListener('click', importConfig);
  $('#btn-reset-config').addEventListener('click', resetConfig);
}

async function saveSettings() {
  config.startMinimized = $('#setting-start-minimized').checked;
  config.autoStart = $('#setting-autostart').checked;
  config.theme = $('#setting-theme').value;
  config.controller = {
    ...config.controller,
    deadzone: parseFloat($('#setting-deadzone').value),
    mouseSensitivity: parseFloat($('#setting-sensitivity').value),
    scrollSpeed: parseFloat($('#setting-scrollspeed').value),
    rumble: $('#setting-rumble').checked,
    swapSticks: $('#setting-swapsticks').checked
  };
  await saveConfig();
}

function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

async function saveConfig() {
  config.mappings = mappings;
  config.profiles = profiles;
  config.activeProfile = activeProfileId;
  await window.api.saveConfig(config);
}

function exportConfig() {
  const data = JSON.stringify(config, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'controllerdesktop-config.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Config exportiert', 'success');
}

function importConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      config = { ...config, ...imported };
      mappings = config.mappings || [];
      profiles = config.profiles || [];
      activeProfileId = config.activeProfile || 'default';
      await saveConfig();
      renderProfilesList();
      renderMappingsList();
      showToast('Config importiert', 'success');
    } catch (err) {
      showToast('Import fehlgeschlagen', 'error');
    }
  };
  input.click();
}

async function resetConfig() {
  showModal('Zurücksetzen', `
    <p>Möchtest du wirklich alle Einstellungen zurücksetzen?</p>
    <p style="color: var(--text-secondary); font-size: 12px; margin-top: 8px;">Alle Mappings und Profile werden gelöscht.</p>
  `, [
    { label: 'Abbrechen', class: 'btn-secondary', action: closeModal },
    { label: 'Zurücksetzen', class: 'btn-danger', action: async () => {
      config = {
        version: 1,
        theme: 'dark',
        language: 'de',
        startMinimized: false,
        autoStart: false,
        controller: { deadzone: 0.15, mouseSensitivity: 1.0, scrollSpeed: 1.0, rumble: true, swapSticks: false },
        mappings: [],
        profiles: [{ id: 'default', name: 'Standard', mappings: [] }],
        activeProfile: 'default'
      };
      mappings = [];
      profiles = config.profiles;
      activeProfileId = 'default';
      await saveConfig();
      renderProfilesList();
      renderMappingsList();
      closeModal();
      showToast('Zurückgesetzt', 'success');
    }}
  ]);
}

// ═══ Quick Actions ═══
function setupQuickActions() {
  $$('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      handleQuickAction(action);
    });
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
      addActivity('Lauter');
      break;
    case 'volume-down':
      await window.api.executeAction({ type: 'key', key: 'VOLUMEDOWN', modifiers: [] });
      addActivity('Leiser');
      break;
    case 'mute':
      await window.api.executeAction({ type: 'key', key: 'VOLUMEMUTE', modifiers: [] });
      addActivity('Stumm');
      break;
  }
}

// ═══ Modal ═══
function setupModal() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#modal-overlay')) closeModal();
  });
}

function showModal(title, bodyHtml, buttons) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;

  const footer = $('#modal-footer');
  footer.innerHTML = '';

  buttons.forEach(btn => {
    const btnEl = document.createElement('button');
    btnEl.className = `btn ${btn.class}`;
    btnEl.textContent = btn.label;
    btnEl.addEventListener('click', btn.action);
    footer.appendChild(btnEl);
  });

  $('#modal-overlay').classList.add('active');
}

function closeModal() {
  $('#modal-overlay').classList.remove('active');
}

// ═══ Toasts ═══
function setupToasts() {
  // Container exists in HTML
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══ Activity Log ═══
function addActivity(action) {
  const now = new Date();
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  activityLog.unshift({ time, action });
  if (activityLog.length > 50) activityLog.pop();

  const container = $('#activity-log');
  if (activityLog.length === 0) {
    container.innerHTML = '<p class="empty-state">Keine Aktivität</p>';
    return;
  }

  container.innerHTML = activityLog.slice(0, 10).map(item => `
    <div class="activity-item">
      <span class="activity-time">${item.time}</span>
      <span class="activity-action">${item.action}</span>
    </div>
  `).join('');
}

// ═══ Start ═══
document.addEventListener('DOMContentLoaded', init);
