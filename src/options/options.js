// ===== HELPERS =====

// Normalize a raw domain/keyword string (no timer part)
function normalizeDomain(raw) {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
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
  return new Promise(resolve => chrome.runtime.sendMessage({ action, ...data }, resolve));
}



function showSaveMsg(id) {
  const el = document.getElementById(id);
  el.style.display = 'inline-block';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
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
  legendContainer.innerHTML = '';
  
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
let analyticsInterval = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  state = await sendMsg('getState');
  assignModeColors(state.modes);
  setupNav();
  renderModes();
  renderSchedule();
  renderBlockPage();
  setupListeners();
  renderAnalytics();
  
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
  grid.innerHTML = '';

  modes.forEach(mode => {
    const card = document.createElement('div');
    card.className = 'mode-card' + (mode.id === activeModeId ? ' active' : '');
    card.dataset.id = mode.id;

    // Header row: name + pencil icon
    const header = document.createElement('div');
    header.className = 'mode-card-header';

    const name = document.createElement('div');
    name.className = 'mode-card-name';
    name.textContent = mode.name;

    const pencil = document.createElement('button');
    pencil.className = 'btn-icon mode-card-pencil';
    pencil.title = 'Configure mode';
    pencil.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    pencil.addEventListener('click', e => {
      e.stopPropagation();
      handlePencilClick(mode.id);
    });

    header.appendChild(name);
    header.appendChild(pencil);

    const count = document.createElement('div');
    count.className = 'mode-card-count';
    const entries = mode.domains || [];
    const n = entries.length;
    const t = entries.filter(e => e && e.limitMinutes != null).length;
    count.textContent = `${n} site${n !== 1 ? 's' : ''}${t > 0 ? ` · ${t} timed` : ''}`;

    card.appendChild(header);
    card.appendChild(count);

    if (mode.id === activeModeId) {
      const badge = document.createElement('div');
      badge.className = 'mode-card-status';
      badge.textContent = 'Active';
      card.appendChild(badge);
    }

    card.addEventListener('click', () => handleCardClick(mode.id));
    grid.appendChild(card);
  });
}

async function handleCardClick(modeId) {
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
  document.getElementById('mode-domains-textarea').value = serializeEntries(mode.domains);
  // Clear any previous error
  const errEl = document.getElementById('textarea-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
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
    select.innerHTML = '';
    return;
  }

  configContainer.style.display = 'block';
  noModesContainer.style.display = 'none';

  // Populate modes dropdown
  select.innerHTML = modes.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

  // Fallback to active mode or first mode if scheduleModeId is invalid or null
  if (!scheduleModeId || !modes.some(m => m.id === scheduleModeId)) {
    scheduleModeId = state.activeModeId || modes[0].id;
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
  grid.innerHTML = '';

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
  document.getElementById('btn-cancel-mode-domains').addEventListener('click', () => {
    const mode = (state.modes || []).find(m => m.id === selectedModeId);
    if (mode) {
      document.getElementById('mode-domains-textarea').value = serializeEntries(mode.domains);
    }
    const errEl = document.getElementById('textarea-error');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    document.getElementById('mode-editor').style.display = 'none';
    selectedModeId = null;
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
  });

  document.getElementById('btn-save-blockpage').addEventListener('click', async () => {
    const content = document.getElementById('block-page-content').value.trim();
    await sendMsg('saveBlockPage', { content });
    state.blockPageContent = content;
    showSaveMsg('blockpage-saved');
  });

  // ---- DANGER ----
  document.getElementById('btn-reset-all').addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      enabled: true,
      modes: [{
        id: 'builtin-social', name: 'Focus', builtin: true, color: 'blue',
        domains: [
          { domain: 'facebook.com',  limitMinutes: null },
          { domain: 'instagram.com', limitMinutes: null },
          { domain: 'twitter.com',   limitMinutes: null },
          { domain: 'x.com',         limitMinutes: null },
          { domain: 'tiktok.com',    limitMinutes: null },
          { domain: 'reddit.com',    limitMinutes: null },
          { domain: 'youtube.com',   limitMinutes: null },
          { domain: 'snapchat.com',  limitMinutes: null },
          { domain: 'pinterest.com', limitMinutes: null },
          { domain: 'linkedin.com',  limitMinutes: null },
          { domain: 'tumblr.com',    limitMinutes: null },
          { domain: 'twitch.tv',     limitMinutes: null },
          { domain: 'discord.com',   limitMinutes: null }
        ]
      }],
      activeModeId: null,
      globalSchedule: {},
      tempUnblocks: {}, siteTimers: {}
    });
    state = await sendMsg('getState');
    selectedModeId = null;
    renderModes();
    renderSchedule();
    renderBlockPage();
    document.getElementById('mode-editor').style.display = 'none';
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
    // Hide the mode editor and clear selection
    document.getElementById('mode-editor').style.display = 'none';
    selectedModeId = null;
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
}

// ===== ANALYTICS =====
async function renderAnalytics() {
  const container = document.getElementById('analytics-content');
  if (!container) return;

  // Re-fetch fresh state so timer data is current
  const freshState = await sendMsg('getState');
  const timerData  = await sendMsg('getTimers');
  const siteTimers = (timerData && timerData.siteTimers) || {};

  const activeModeId = freshState.activeModeId || null;
  const activeMode = (freshState.modes || []).find(m => m.id === activeModeId);

  // Only show entries that have a limitMinutes
  const timedEntries = activeMode
    ? (activeMode.domains || []).filter(e => e && e.limitMinutes != null)
    : [];

  if (!activeMode) {
    container.innerHTML = `<p class="analytics-empty">No active mode selected. Activate a mode from the Block List tab to see timer data.</p>`;
    return;
  }

  if (timedEntries.length === 0) {
    container.innerHTML = `<p class="analytics-empty">No timed sites in the <strong>${activeMode.name}</strong> mode. Add entries in the format <code>domain; minutes</code> to track daily usage.</p>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  const rows = timedEntries.map(entry => {
    const limitMs  = entry.limitMinutes * 60 * 1000;
    const rec      = siteTimers[entry.domain];
    const usedMs   = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
    const remMs    = Math.max(0, limitMs - usedMs);
    const pct      = Math.min(100, Math.round((usedMs / limitMs) * 100));

    const fmt = ms => {
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    };

    const statusClass = pct >= 100 ? 'timer-bar-full' : pct >= 75 ? 'timer-bar-warn' : '';

    return `
      <div class="analytics-card">
        <div class="analytics-card-header">
          <span class="analytics-domain">${entry.domain}</span>
          <span class="analytics-limit">${entry.limitMinutes} min / day</span>
        </div>
        <div class="analytics-bar-track">
          <div class="analytics-bar-fill ${statusClass}" style="width:${pct}%"></div>
        </div>
        <div class="analytics-card-footer">
          <span class="analytics-used">Used: ${fmt(usedMs)}</span>
          <span class="analytics-remaining ${pct >= 100 ? 'analytics-exhausted' : ''}">${pct >= 100 ? 'Blocked' : fmt(remMs) + ' left'}</span>
        </div>
      </div>`;
  });

  container.innerHTML = `
    <div class="analytics-mode-label">Active mode: <strong>${activeMode.name}</strong></div>
    ${rows.join('')}
  `;
}
