// ===== HELPERS =====
function normalizeEntry(input) {
  const trimmed = input.trim().toLowerCase();
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

function sendMsg(action, data = {}) {
  return new Promise(resolve => chrome.runtime.sendMessage({ action, ...data }, resolve));
}



function showSaveMsg(id) {
  const el = document.getElementById(id);
  el.style.display = 'inline-block';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

// ===== STATE =====
let state = {};
let selectedModeId = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  state = await sendMsg('getState');
  setupNav();
  renderModes();
  renderSchedule();
  renderBlockPage();
  setupListeners();
});

// ===== NAVIGATION =====
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('section-' + btn.dataset.section).classList.add('active');
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

    const name = document.createElement('div');
    name.className = 'mode-card-name';
    name.textContent = mode.name;

    const count = document.createElement('div');
    count.className = 'mode-card-count';
    const n = (mode.domains || []).length;
    count.textContent = `${n} site${n !== 1 ? 's' : ''}`;

    card.appendChild(name);
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
  // Always open editor for clicked mode
  selectedModeId = modeId;
  renderModeEditor();
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
  document.getElementById('btn-rename-mode').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  // Populate textarea — one domain per line
  document.getElementById('mode-domains-textarea').value = (mode.domains || []).join('\n');
}



// ===== SCHEDULE =====
function renderSchedule() {
  document.getElementById('schedule-enabled').checked = state.scheduleEnabled || false;
  const schedule = state.schedule || {};
  const activeDays = schedule.days || [1,2,3,4,5];
  document.querySelectorAll('.day-btn input').forEach(cb => {
    cb.checked = activeDays.includes(parseInt(cb.value));
  });
  document.getElementById('sched-start').value = schedule.startTime || '08:00';
  document.getElementById('sched-end').value   = schedule.endTime   || '17:00';
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

  const renameBtn = document.getElementById('btn-rename-mode');
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
    renameBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  };

  renameBtn.addEventListener('click', () => {
    const mode = (state.modes || []).find(m => m.id === selectedModeId);
    if (!mode) return;

    const isEditing = nameInput.style.display !== 'none';
    if (isEditing) {
      saveInlineName();
    } else {
      nameSpan.style.display = 'none';
      nameInput.style.display = '';
      nameInput.value = mode.name;
      nameInput.focus();
      nameInput.select();
      renameBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }
  });

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      saveInlineName();
    } else if (e.key === 'Escape') {
      nameSpan.style.display = '';
      nameInput.style.display = 'none';
      renameBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
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
      document.getElementById('mode-domains-textarea').value = (mode.domains || []).join('\n');
    }
    document.getElementById('mode-editor').style.display = 'none';
    selectedModeId = null;
  });



  // ---- SCHEDULE ----
  document.getElementById('schedule-enabled').addEventListener('change', saveSchedule);
  document.querySelectorAll('.day-btn input').forEach(input => {
    input.addEventListener('change', saveSchedule);
  });
  document.getElementById('sched-start').addEventListener('change', saveSchedule);
  document.getElementById('sched-end').addEventListener('change', saveSchedule);

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
        id: 'builtin-social', name: 'Focus', builtin: true,
        domains: ['facebook.com','instagram.com','twitter.com','x.com','tiktok.com',
          'reddit.com','youtube.com','snapchat.com','pinterest.com',
          'linkedin.com','tumblr.com','twitch.tv','discord.com']
      }],
      activeModeId: null,
      scheduleEnabled: false,
      schedule: { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' },
      focusActive: false, focusEndTime: 0, tempUnblocks: {}
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
  // Parse: split by newlines, normalize each, deduplicate, drop empties
  const domains = [...new Set(
    raw.split('\n')
      .map(line => normalizeEntry(line))
      .filter(d => d.length > 0)
  )];

  // Send the full updated list to background
  const res = await sendMsg('setModeDomains', { modeId: selectedModeId, domains });
  if (res && res.ok) {
    const idx = (state.modes || []).findIndex(m => m.id === selectedModeId);
    if (idx !== -1) state.modes[idx].domains = domains;
    renderModes();
    // Hide the mode editor and clear selection
    document.getElementById('mode-editor').style.display = 'none';
    selectedModeId = null;
  }
}

async function saveSchedule() {
  const days = [];
  document.querySelectorAll('.day-btn input:checked').forEach(cb => days.push(parseInt(cb.value)));
  const schedule = {
    days,
    startTime: document.getElementById('sched-start').value,
    endTime:   document.getElementById('sched-end').value
  };
  const enabled = document.getElementById('schedule-enabled').checked;
  await sendMsg('setSchedule', { schedule, enabled });
  state.schedule = schedule;
  state.scheduleEnabled = enabled;
}

