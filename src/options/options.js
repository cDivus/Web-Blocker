// ===== HELPERS =====

// Normalize a raw domain/keyword string (no timer part)
function normalizeDomain(raw) {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes(' ')) return ''; // Spaces are never allowed in domains or keywords!
  if (!trimmed.includes('.')) return trimmed; // keyword
  try {
    let url = trimmed;
    if (!url.startsWith('http')) url = 'https://' + url;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '');
  }
}

/**
 * Parse a single textarea line into { domain, limitMinutes } or null on error.
 * Valid formats:
 *   "facebook.com"          → { domain: 'facebook.com', limitMinutes: null }
 *   "facebook.com; 15"      → { domain: 'facebook.com', limitMinutes: 15 }
 * Returns null for malformed lines.
 */
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null; // blank — skip, not an error

  const parts = trimmed.split(';');
  if (parts.length > 2) return { error: `Too many semicolons: "${trimmed}"` };

  const rawDomains = parts[0].split(',').map(s => s.trim()).filter(Boolean);
  if (rawDomains.length === 0) return { error: `Invalid empty domains list: "${parts[0]}"` };

  const normalizedItems = [];
  for (const item of rawDomains) {
    const norm = normalizeDomain(item);
    if (!norm) return { error: `Invalid domain or keyword: "${item}"` };
    normalizedItems.push(norm);
  }
  const domainPattern = normalizedItems.join(', ');

  if (parts.length === 1) {
    return { domain: domainPattern, limitMinutes: null };
  }

  const minStr = parts[1].trim();
  if (minStr === '') return { error: `Missing minutes after semicolon: "${trimmed}"` };
  const mins = Number(minStr);
  if (!Number.isInteger(mins) || mins <= 0) {
    return { error: `Minutes must be a positive integer, got: "${minStr}"` };
  }
  return { domain: domainPattern, limitMinutes: mins };
}

/**
 * Serialize an array of { domain, limitMinutes } entries back into textarea text.
 */
function serializeEntries(entries) {
  return (entries || []).map(e => {
    if (e.limitMinutes != null) return `${e.domain}; ${e.limitMinutes}`;
    return e.domain;
  }).join('\n');
}


function sendMsg(action, data = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...data }, response => {
      // Accessing lastError silences potential uncaught context errors
      const err = chrome.runtime.lastError;
      resolve(response);
    });
  });
}



// Assign persistent colors to modes if they are missing
function assignModeColors(modes) {
  const colors = ['blue', 'emerald', 'orange', 'purple', 'rose', 'amber', 'teal', 'magenta'];
  (modes || []).forEach((mode, index) => {
    if (!mode.color) {
      mode.color = colors[index % colors.length];
    }
  });
}

function renderLegend() {
  const legendContainer = document.getElementById('calendar-modes-legend');
  if (!legendContainer) return;
  legendContainer.textContent = '';
  
  const modes = state.modes || [];
  modes.forEach(mode => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '6px';
    item.style.fontSize = '0.75rem';
    item.style.fontWeight = '700';
    item.style.textTransform = 'uppercase';
    
    const dot = document.createElement('span');
    dot.className = `legend-dot mode-color-${mode.color}`;
    
    const name = document.createElement('span');
    name.textContent = mode.name;
    
    item.appendChild(dot);
    item.appendChild(name);
    legendContainer.appendChild(item);
  });
}

// ===== STATE =====
let state = {};
let selectedModeId = null;
let scheduleModeId = null;
let originalDomainsText = '';
let originalBlockPageText = '';
let analyticsInterval = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  state = await sendMsg('getState');

  // Password Lock screen check
  const sessionCheck = await new Promise(resolve => {
    chrome.storage.local.get('sessionUnlocked', resolve);
  });
  const isUnlocked = sessionCheck.sessionUnlocked === true;
  await new Promise(resolve => {
    chrome.storage.local.remove('sessionUnlocked', resolve);
  });

  const lockScreen = document.getElementById('password-lock-screen');
  const layoutEl = document.querySelector('.layout');

  if (state.password && !isUnlocked) {
    if (layoutEl) layoutEl.style.setProperty('display', 'none', 'important');
    if (lockScreen) lockScreen.style.display = 'flex';
  } else {
    if (lockScreen) lockScreen.style.display = 'none';
    if (layoutEl) layoutEl.style.display = '';
  }

  assignModeColors(state.modes);
  setupNav();
  renderModes();
  renderSchedule();
  renderBlockPage();
  setupListeners();
  renderAnalytics();
  renderPasswordSettings();
  
  // Visibility change logic to stop/start polling
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (analyticsInterval) {
        clearInterval(analyticsInterval);
        analyticsInterval = null;
      }
    } else {
      const activeBtn = document.querySelector('.nav-btn.active');
      if (activeBtn && activeBtn.dataset.section === 'analytics') {
        renderAnalytics();
        if (!analyticsInterval) {
          analyticsInterval = setInterval(renderAnalytics, 1000);
        }
      }
    }
  });
});

// ===== NAVIGATION =====
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('section-' + btn.dataset.section).classList.add('active');
      
      if (analyticsInterval) {
        clearInterval(analyticsInterval);
        analyticsInterval = null;
      }
      
      if (btn.dataset.section === 'analytics') {
        renderAnalytics();
        analyticsInterval = setInterval(renderAnalytics, 1000);
      }
    });
  });
}

// ===== MODES =====
function renderModes() {
  const modes = state.modes || [];
  const activeModeId = state.activeModeId || null;
  const grid = document.getElementById('modes-grid');
  grid.textContent = '';

  const isScheduled = state.scheduleEnabled || false;
  const warningBanner = document.getElementById('schedule-warning-banner');
  if (warningBanner) {
    warningBanner.style.display = isScheduled ? 'block' : 'none';
  }

  if (isScheduled) {
    grid.classList.add('schedule-active');
  } else {
    grid.classList.remove('schedule-active');
  }

  modes.forEach(mode => {
    const isActive = (mode.id === activeModeId);
    const card = document.createElement('div');
    card.className = 'mode-card' + (isActive ? ' active' : '');
    card.dataset.id = mode.id;

    // Header row: name
    const header = document.createElement('div');
    header.className = 'mode-card-header';

    const name = document.createElement('div');
    name.className = 'mode-card-name';
    name.textContent = mode.name;

    header.appendChild(name);

    const count = document.createElement('div');
    count.className = 'mode-card-count';
    const entries = mode.domains || [];
    let n = 0;
    let t = 0;
    entries.forEach(e => {
      if (e && e.domain) {
        const countOfDomains = e.domain.split(',').filter(Boolean).length;
        n += countOfDomains;
        if (e.limitMinutes != null) {
          t += countOfDomains;
        }
      }
    });
    count.textContent = `${n} site${n !== 1 ? 's' : ''}${t > 0 ? ` · ${t} timed` : ''}`;

    card.appendChild(header);
    card.appendChild(count);

    if (isActive) {
      const badge = document.createElement('div');
      badge.className = 'mode-card-status';
      badge.textContent = 'Active';
      card.appendChild(badge);
    }

    card.addEventListener('click', () => handlePencilClick(mode.id));
    grid.appendChild(card);
  });
}

async function handleCardClick(modeId) {
  if (state.scheduleEnabled) return; // Prevent activation when scheduling is enabled!
  const wasActive = state.activeModeId === modeId;
  // Toggle active: click active card → deactivate; click inactive → activate
  const newActiveId = wasActive ? null : modeId;
  await sendMsg('setActiveMode', { modeId: newActiveId });
  state.activeModeId = newActiveId;
  renderModes();
}

function handlePencilClick(modeId) {
  if (selectedModeId === modeId) {
    // Already open for this mode — close it
    selectedModeId = null;
    document.getElementById('mode-editor').style.display = 'none';
  } else {
    selectedModeId = modeId;
    renderModeEditor();
  }
}

function renderModeEditor() {
  const modes = state.modes || [];
  const mode = modes.find(m => m.id === selectedModeId);
  const editor = document.getElementById('mode-editor');

  if (!mode) { editor.style.display = 'none'; return; }
  editor.style.display = 'block';

  document.getElementById('mode-editor-name').textContent = mode.name;
  document.getElementById('mode-editor-name').style.display = '';
  document.getElementById('mode-editor-name-input').style.display = 'none';
  // Populate textarea — one entry per line in "domain" or "domain; minutes" format
  const serialized = serializeEntries(mode.domains);
  document.getElementById('mode-domains-textarea').value = serialized;
  originalDomainsText = serialized;

  // Disable the save button initially since no changes are made yet
  const btnSave = document.getElementById('btn-save-mode-domains');
  if (btnSave) btnSave.disabled = true;

  // Clear any previous error
  const errEl = document.getElementById('textarea-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  const btnActivate = document.getElementById('btn-activate-mode');
  if (btnActivate) {
    if (state.scheduleEnabled) {
      btnActivate.style.display = 'none';
    } else {
      btnActivate.style.display = 'inline-block';
      const isActive = (state.activeModeId === selectedModeId);
      btnActivate.textContent = isActive ? 'Deactivate' : 'Activate';
      if (isActive) {
        btnActivate.classList.add('btn-active-toggle');
      } else {
        btnActivate.classList.remove('btn-active-toggle');
      }
    }
  }
}



// ===== SCHEDULE =====
function renderSchedule() {
  const select = document.getElementById('schedule-mode-select');
  const configContainer = document.getElementById('schedule-config-container');
  const noModesContainer = document.getElementById('schedule-no-modes');

  const modes = state.modes || [];
  if (!modes.length) {
    configContainer.style.display = 'none';
    noModesContainer.style.display = 'block';
    select.textContent = '';
    return;
  }

  configContainer.style.display = 'block';
  noModesContainer.style.display = 'none';

  // Populate modes dropdown
  select.textContent = '';
  modes.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    select.appendChild(opt);
  });

  // Fallback to active mode or first mode if scheduleModeId is invalid or null
  if (!scheduleModeId || !modes.some(m => m.id === scheduleModeId)) {
    scheduleModeId = (state.activeModeId && modes.some(m => m.id === state.activeModeId))
      ? state.activeModeId
      : modes[0].id;
  }
  select.value = scheduleModeId;

  const mode = modes.find(m => m.id === scheduleModeId);
  if (!mode) return;

  const enabled = state.scheduleEnabled || false;
  document.getElementById('schedule-enabled').checked = enabled;

  const wrapper = document.getElementById('schedule-content-wrapper');
  if (wrapper) {
    if (enabled) wrapper.classList.remove('disabled-blur');
    else wrapper.classList.add('disabled-blur');
  }

  // Render Calendar Grid
  const grid = document.getElementById('calendar-map-grid');
  grid.textContent = '';

  // 1. Render Hours Header Row
  const emptyHeader = document.createElement('div');
  emptyHeader.className = 'calendar-header-cell';
  grid.appendChild(emptyHeader);

  const hours = [
    '12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a',
    '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'
  ];
  hours.forEach(h => {
    const el = document.createElement('div');
    el.className = 'calendar-header-cell';
    el.textContent = h;
    grid.appendChild(el);
  });

  // 2. Render Sun-Sat (0-6) rows
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const globalSchedule = state.globalSchedule || {};

  days.forEach((dayName, dayIndex) => {
    // Day Label Cell
    const dayLabel = document.createElement('div');
    dayLabel.className = 'calendar-day-label';
    dayLabel.textContent = dayName;
    grid.appendChild(dayLabel);

    // 24 Hour Cell clickables
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-hour-cell';
      cell.dataset.day = dayIndex;
      cell.dataset.hour = h;
      
      const key = `${dayIndex}-${h}`;
      const modeId = globalSchedule[key];
      if (modeId) {
        const cellMode = modes.find(m => m.id === modeId);
        if (cellMode) {
          cell.classList.add('selected', `mode-color-${cellMode.color}`);
          cell.dataset.modeId = modeId;
        }
      }

      grid.appendChild(cell);
    }
  });

  renderLegend();
}

// ===== BLOCK PAGE =====
function renderBlockPage() {
  const content = state.blockPageContent || 'You blocked this site for a reason.';
  document.getElementById('block-page-content').value = content;
  document.getElementById('preview-box').textContent = content;
  originalBlockPageText = content;

  const btnSave = document.getElementById('btn-save-blockpage');
  if (btnSave) btnSave.disabled = true;
}

// ===== LISTENERS =====
function setupListeners() {

  // ---- MODES ----
  document.getElementById('btn-new-mode').addEventListener('click', () => {
    document.getElementById('new-mode-form').style.display = 'flex';
    document.getElementById('new-mode-name').focus();
  });

  document.getElementById('btn-cancel-mode').addEventListener('click', () => {
    document.getElementById('new-mode-form').style.display = 'none';
    document.getElementById('new-mode-name').value = '';
  });

  document.getElementById('btn-create-mode').addEventListener('click', createMode);
  document.getElementById('new-mode-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') createMode();
  });

  const nameSpan = document.getElementById('mode-editor-name');
  const nameInput = document.getElementById('mode-editor-name-input');

  const saveInlineName = async () => {
    const mode = (state.modes || []).find(m => m.id === selectedModeId);
    if (!mode) return;
    const newName = nameInput.value.trim();
    if (newName && newName !== mode.name) {
      const res = await sendMsg('renameMode', { modeId: selectedModeId, name: newName });
      if (res && res.ok) {
        mode.name = newName;
        nameSpan.textContent = newName;
        renderModes();
      }
    }
    nameSpan.style.display = '';
    nameInput.style.display = 'none';
  };

  nameSpan.addEventListener('dblclick', () => {
    const mode = (state.modes || []).find(m => m.id === selectedModeId);
    if (!mode) return;

    nameSpan.style.display = 'none';
    nameInput.style.display = '';
    nameInput.value = mode.name;
    nameInput.focus();
    nameInput.select();
  });

  nameInput.addEventListener('blur', () => {
    if (nameInput.style.display !== 'none') {
      saveInlineName();
    }
  });

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      saveInlineName();
    } else if (e.key === 'Escape') {
      nameSpan.style.display = '';
      nameInput.style.display = 'none';
      nameInput.blur();
    }
  });

  document.getElementById('btn-activate-mode').addEventListener('click', async () => {
    if (state.scheduleEnabled) return;
    const mode = (state.modes || []).find(m => m.id === selectedModeId);
    if (!mode) return;
    const wasActive = state.activeModeId === selectedModeId;
    const newActiveId = wasActive ? null : selectedModeId;
    await sendMsg('setActiveMode', { modeId: newActiveId });
    state.activeModeId = newActiveId;
    renderModes();
    renderModeEditor();
  });

  document.getElementById('btn-delete-mode').addEventListener('click', async () => {
    const mode = (state.modes || []).find(m => m.id === selectedModeId);
    if (!mode) return;
    if (!confirm(`Delete mode "${mode.name}"? This cannot be undone.`)) return;
    const res = await sendMsg('deleteMode', { modeId: selectedModeId });
    if (res && res.ok) {
      state.modes = res.modes;
      if (state.activeModeId === selectedModeId) state.activeModeId = null;
      selectedModeId = null;
      renderModes();
      document.getElementById('mode-editor').style.display = 'none';
    }
  });

  document.getElementById('btn-save-mode-domains').addEventListener('click', saveModeDomainsFromTextarea);

  document.getElementById('mode-domains-textarea').addEventListener('input', () => {
    const currentText = document.getElementById('mode-domains-textarea').value;
    const btnSave = document.getElementById('btn-save-mode-domains');
    if (btnSave) {
      btnSave.disabled = (currentText === originalDomainsText);
    }
  });



  // ---- SCHEDULE ----
  document.getElementById('schedule-mode-select').addEventListener('change', (e) => {
    scheduleModeId = e.target.value;
    renderSchedule();
  });

  document.getElementById('schedule-enabled').addEventListener('change', saveSchedule);

  document.getElementById('btn-calendar-clear').addEventListener('click', () => {
    document.querySelectorAll('.calendar-hour-cell').forEach(cell => {
      if (cell.dataset.modeId === scheduleModeId) {
        cell.classList.remove('selected');
        for (const cls of Array.from(cell.classList)) {
          if (cls.startsWith('mode-color-')) {
            cell.classList.remove(cls);
          }
        }
        delete cell.dataset.modeId;
      }
    });
    saveSchedule();
  });

  document.getElementById('btn-calendar-weekdays').addEventListener('click', () => {
    const modes = state.modes || [];
    const mode = modes.find(m => m.id === scheduleModeId);
    if (!mode) return;

    document.querySelectorAll('.calendar-hour-cell').forEach(cell => {
      const day = parseInt(cell.dataset.day);
      const hour = parseInt(cell.dataset.hour);
      if (day >= 1 && day <= 5 && hour >= 9 && hour < 17) {
        cell.classList.add('selected');
        for (const cls of Array.from(cell.classList)) {
          if (cls.startsWith('mode-color-')) {
            cell.classList.remove(cls);
          }
        }
        cell.classList.add(`mode-color-${mode.color}`);
        cell.dataset.modeId = scheduleModeId;
      } else {
        if (cell.dataset.modeId === scheduleModeId) {
          cell.classList.remove('selected');
          for (const cls of Array.from(cell.classList)) {
            if (cls.startsWith('mode-color-')) {
              cell.classList.remove(cls);
            }
          }
          delete cell.dataset.modeId;
        }
      }
    });
    saveSchedule();
  });

  // Calendar Click & Drag Painting
  let isDrawing = false;
  let drawState = true; // true = select, false = deselect

  const grid = document.getElementById('calendar-map-grid');
  
  grid.addEventListener('mousedown', e => {
    const cell = e.target.closest('.calendar-hour-cell');
    if (!cell) return;
    isDrawing = true;
    drawState = (cell.dataset.modeId !== scheduleModeId);
    toggleCell(cell, drawState);
    e.preventDefault();
  });

  grid.addEventListener('mouseover', e => {
    if (!isDrawing) return;
    const cell = e.target.closest('.calendar-hour-cell');
    if (!cell) return;
    toggleCell(cell, drawState);
  });

  window.addEventListener('mouseup', () => {
    if (isDrawing) {
      isDrawing = false;
      saveSchedule();
    }
  });

  function toggleCell(cell, select) {
    const modes = state.modes || [];
    const mode = modes.find(m => m.id === scheduleModeId);
    if (!mode) return;

    if (select) {
      cell.classList.add('selected');
      for (const cls of Array.from(cell.classList)) {
        if (cls.startsWith('mode-color-')) {
          cell.classList.remove(cls);
        }
      }
      cell.classList.add(`mode-color-${mode.color}`);
      cell.dataset.modeId = scheduleModeId;
    } else {
      if (cell.dataset.modeId === scheduleModeId) {
        cell.classList.remove('selected');
        for (const cls of Array.from(cell.classList)) {
          if (cls.startsWith('mode-color-')) {
            cell.classList.remove(cls);
          }
        }
        delete cell.dataset.modeId;
      }
    }
  }

  // ---- BLOCK PAGE ----
  document.getElementById('block-page-content').addEventListener('input', e => {
    document.getElementById('preview-box').textContent = e.target.value || 'You blocked this site for a reason.';
    const btnSave = document.getElementById('btn-save-blockpage');
    if (btnSave) {
      btnSave.disabled = (e.target.value === originalBlockPageText);
    }
  });

  document.getElementById('btn-save-blockpage').addEventListener('click', async () => {
    const content = document.getElementById('block-page-content').value;
    await sendMsg('saveBlockPage', { content });
    state.blockPageContent = content;
    renderBlockPage();
  });

  // ---- DANGER ----
  document.getElementById('btn-reset-all').addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      enabled: true,
      modes: [{
        id: 'builtin-social', name: 'Focus', builtin: true, color: 'blue',
        domains: []
      }],
      activeModeId: null,
      globalSchedule: {},
      scheduleEnabled: false,
      tempUnblocks: {}, siteTimers: {}
    });
    state = await sendMsg('getState');
    selectedModeId = null;
    renderModes();
    renderSchedule();
    renderBlockPage();
    document.getElementById('mode-editor').style.display = 'none';
  });

  // ---- PASSWORD SETTINGS & LOCK SCREEN ----
  const setupContainer = document.getElementById('password-setup-container');
  const activeContainer = document.getElementById('password-active-container');
  const statusDesc = document.getElementById('password-status-desc');
  const lockScreen = document.getElementById('password-lock-screen');
  const layoutEl = document.querySelector('.layout');

  document.getElementById('btn-save-password').addEventListener('click', async () => {
    const pwdInput = document.getElementById('settings-password-input');
    const errEl = document.getElementById('password-settings-error');
    const pwd = pwdInput.value.trim();
    if (!pwd) {
      if (errEl) { errEl.textContent = 'Password cannot be empty.'; errEl.style.display = 'block'; }
      return;
    }
    await sendMsg('setPassword', { password: pwd });
    state.password = pwd;
    renderPasswordSettings();
  });

  document.getElementById('btn-remove-password').addEventListener('click', async () => {
    const pwdInput = document.getElementById('settings-password-remove-input');
    const errEl = document.getElementById('password-settings-error');
    const pwd = pwdInput.value.trim();
    if (pwd !== state.password) {
      if (errEl) { errEl.textContent = 'Incorrect password.'; errEl.style.display = 'block'; }
      return;
    }
    await sendMsg('setPassword', { password: '' });
    state.password = '';
    renderPasswordSettings();
  });

  document.getElementById('btn-unlock-settings').addEventListener('click', () => {
    const input = document.getElementById('lock-password-input');
    const errEl = document.getElementById('lock-error');
    if (input.value === state.password) {
      if (errEl) { errEl.style.display = 'none'; }
      if (lockScreen) lockScreen.style.display = 'none';
      if (layoutEl) layoutEl.style.display = '';
    } else {
      if (errEl) {
        errEl.textContent = 'Incorrect password.';
        errEl.style.display = 'block';
      }
    }
  });

  document.getElementById('lock-password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-unlock-settings').click();
    }
  });
}

async function createMode() {
  const input = document.getElementById('new-mode-name');
  const name = input.value.trim();
  if (!name) return;
  const res = await sendMsg('createMode', { name });
  if (res && res.ok) {
    state.modes = res.modes;
    assignModeColors(state.modes);
    input.value = '';
    document.getElementById('new-mode-form').style.display = 'none';
    renderModes();
    // Auto-open the new mode's editor
    selectedModeId = res.mode.id;
    renderModeEditor();
  }
}

async function saveModeDomainsFromTextarea() {
  if (!selectedModeId) return;

  const raw = document.getElementById('mode-domains-textarea').value;
  const lines = raw.split('\n');
  const errEl = document.getElementById('textarea-error');

  const entries = [];
  const seen = new Set();
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // skip blank lines

    const result = parseLine(line);
    if (!result) continue; // blank
    if (result.error) {
      errors.push(`Line ${i + 1}: ${result.error}`);
      continue;
    }

    // Deduplicate by domain
    if (!seen.has(result.domain)) {
      seen.add(result.domain);
      entries.push(result);
    }
  }

  if (errors.length > 0) {
    errEl.textContent = errors.join(' · ');
    errEl.style.display = 'block';
    return; // Block saving
  }

  errEl.style.display = 'none';
  errEl.textContent = '';

  // Send the full updated list to background
  const res = await sendMsg('setModeDomains', { modeId: selectedModeId, domains: entries });
  if (res && res.ok) {
    const idx = (state.modes || []).findIndex(m => m.id === selectedModeId);
    if (idx !== -1) state.modes[idx].domains = entries;
    renderModes();
    renderModeEditor();
  }
}

async function saveSchedule() {
  const enabled = document.getElementById('schedule-enabled').checked;
  const globalSchedule = {};

  const wrapper = document.getElementById('schedule-content-wrapper');
  if (wrapper) {
    if (enabled) wrapper.classList.remove('disabled-blur');
    else wrapper.classList.add('disabled-blur');
  }

  document.querySelectorAll('.calendar-hour-cell').forEach(cell => {
    const day = cell.dataset.day;
    const hour = cell.dataset.hour;
    const modeId = cell.dataset.modeId;
    if (modeId) {
      globalSchedule[`${day}-${hour}`] = modeId;
    }
  });

  await sendMsg('setGlobalSchedule', { enabled, globalSchedule });
  
  // Keep local state in sync
  state.globalSchedule = globalSchedule;
  state.scheduleEnabled = enabled;
  if (enabled) {
    state.activeModeId = null;
  }
  renderModes();
}

// ===== ANALYTICS =====
async function renderAnalytics() {
  const container = document.getElementById('analytics-content');
  if (!container) return;

  // Re-fetch fresh state so timer data is current
  const freshState = await sendMsg('getState') || {};
  const timerData  = await sendMsg('getTimers') || {};
  const siteTimers = timerData.siteTimers || {};

  const activeModeId = freshState.activeModeId || null;
  const activeMode = (freshState.modes || []).find(m => m.id === activeModeId);

  // Only show entries that have a limitMinutes
  const timedEntries = activeMode
    ? (activeMode.domains || []).filter(e => e && e.limitMinutes != null)
    : [];

  if (!activeMode) {
    container.textContent = '';
    const p = document.createElement('p');
    p.className = 'analytics-empty';
    p.textContent = 'No active mode selected. Activate a mode from the Block List tab to see timer data.';
    container.appendChild(p);
    return;
  }

  if (timedEntries.length === 0) {
    container.textContent = '';
    const p = document.createElement('p');
    p.className = 'analytics-empty';
    p.textContent = 'No timed sites in the ';
    const strong = document.createElement('strong');
    strong.textContent = activeMode.name;
    const endText = document.createTextNode(' mode. Add entries in the format ');
    const code = document.createElement('code');
    code.textContent = 'domain; minutes';
    const endText2 = document.createTextNode(' to track daily usage.');
    
    p.appendChild(strong);
    p.appendChild(endText);
    p.appendChild(code);
    p.appendChild(endText2);
    container.appendChild(p);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  container.textContent = '';
  
  const modeLabel = document.createElement('div');
  modeLabel.className = 'analytics-mode-label';
  modeLabel.textContent = 'Active mode: ';
  const strongMode = document.createElement('strong');
  strongMode.textContent = activeMode.name;
  modeLabel.appendChild(strongMode);
  container.appendChild(modeLabel);

  const fmt = ms => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  timedEntries.forEach(entry => {
    const limitMs  = entry.limitMinutes * 60 * 1000;
    const rec      = siteTimers[entry.domain];
    const usedMs   = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
    const remMs    = Math.max(0, limitMs - usedMs);
    const pct      = Math.min(100, Math.round((usedMs / limitMs) * 100));

    const statusClass = pct >= 100 ? 'timer-bar-full' : pct >= 75 ? 'timer-bar-warn' : '';

    // Create .analytics-card
    const card = document.createElement('div');
    card.className = 'analytics-card';

    // Header
    const header = document.createElement('div');
    header.className = 'analytics-card-header';
    
    const domainSpan = document.createElement('span');
    domainSpan.className = 'analytics-domain';
    domainSpan.textContent = entry.domain;
    
    const limitSpan = document.createElement('span');
    limitSpan.className = 'analytics-limit';
    limitSpan.textContent = `${entry.limitMinutes} min / day`;
    
    header.appendChild(domainSpan);
    header.appendChild(limitSpan);

    // Bar track
    const barTrack = document.createElement('div');
    barTrack.className = 'analytics-bar-track';
    
    const barFill = document.createElement('div');
    barFill.className = `analytics-bar-fill ${statusClass}`.trim();
    barFill.style.width = `${pct}%`;
    barTrack.appendChild(barFill);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'analytics-card-footer';
    
    const usedSpan = document.createElement('span');
    usedSpan.className = 'analytics-used';
    usedSpan.textContent = `Used: ${fmt(usedMs)}`;
    
    const remainingSpan = document.createElement('span');
    remainingSpan.className = 'analytics-remaining' + (pct >= 100 ? ' analytics-exhausted' : '');
    remainingSpan.textContent = pct >= 100 ? 'Blocked' : `${fmt(remMs)} left`;
    
    footer.appendChild(usedSpan);
    footer.appendChild(remainingSpan);

    card.appendChild(header);
    card.appendChild(barTrack);
    card.appendChild(footer);
    
    container.appendChild(card);
  });
}

function renderPasswordSettings() {
  const setupContainer = document.getElementById('password-setup-container');
  const activeContainer = document.getElementById('password-active-container');
  const statusDesc = document.getElementById('password-status-desc');
  const errEl = document.getElementById('password-settings-error');

  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  document.getElementById('settings-password-input').value = '';
  document.getElementById('settings-password-remove-input').value = '';

  if (state.password) {
    if (setupContainer) setupContainer.style.display = 'none';
    if (activeContainer) activeContainer.style.display = 'block';
    if (statusDesc) statusDesc.textContent = 'Password Protection is ACTIVE. Settings are locked.';
  } else {
    if (setupContainer) setupContainer.style.display = 'block';
    if (activeContainer) activeContainer.style.display = 'none';
    if (statusDesc) statusDesc.textContent = 'Restrict settings access using a password.';
  }
}
