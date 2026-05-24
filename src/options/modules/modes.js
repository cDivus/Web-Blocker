// ===== MODES MODULE =====
import { store } from './state.js';
import { sendMsg, serializeEntries, parseLine, assignModeColors } from './utils.js';

export function renderModes() {
  const modes = store.state.modes || [];
  const activeModeId = store.state.activeModeId || null;
  const grid = document.getElementById('modes-grid');
  if (!grid) return;
  grid.textContent = '';

  const isScheduled = store.state.scheduleEnabled || false;
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

export function handlePencilClick(modeId) {
  if (store.selectedModeId === modeId) {
    // Already open for this mode — close it
    store.selectedModeId = null;
    const editor = document.getElementById('mode-editor');
    if (editor) editor.style.display = 'none';
  } else {
    store.selectedModeId = modeId;
    renderModeEditor();
  }
}

export function renderModeEditor() {
  const modes = store.state.modes || [];
  const mode = modes.find(m => m.id === store.selectedModeId);
  const editor = document.getElementById('mode-editor');

  if (!mode || !editor) { 
    if (editor) editor.style.display = 'none'; 
    return; 
  }
  editor.style.display = 'block';

  const editorName = document.getElementById('mode-editor-name');
  const editorInput = document.getElementById('mode-editor-name-input');
  const domainsTextarea = document.getElementById('mode-domains-textarea');

  if (editorName) {
    editorName.textContent = mode.name;
    editorName.style.display = '';
  }
  if (editorInput) {
    editorInput.style.display = 'none';
  }

  // Populate textarea — one entry per line in "domain" or "domain; minutes" format
  const serialized = serializeEntries(mode.domains);
  if (domainsTextarea) {
    domainsTextarea.value = serialized;
  }
  store.originalDomainsText = serialized;

  // Disable the save button initially since no changes are made yet
  const btnSave = document.getElementById('btn-save-mode-domains');
  if (btnSave) btnSave.disabled = true;

  // Clear any previous error
  const errEl = document.getElementById('textarea-error');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  const btnActivate = document.getElementById('btn-activate-mode');
  if (btnActivate) {
    if (store.state.scheduleEnabled) {
      btnActivate.style.display = 'none';
    } else {
      btnActivate.style.display = 'inline-block';
      const isActive = (store.state.activeModeId === store.selectedModeId);
      btnActivate.textContent = isActive ? 'Deactivate' : 'Activate';
      if (isActive) {
        btnActivate.classList.add('btn-active-toggle');
      } else {
        btnActivate.classList.remove('btn-active-toggle');
      }
    }
  }
}

export async function createMode() {
  const input = document.getElementById('new-mode-name');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const res = await sendMsg('createMode', { name });
  if (res && res.ok) {
    store.state.modes = res.modes;
    assignModeColors(store.state.modes);
    input.value = '';
    const newModeForm = document.getElementById('new-mode-form');
    if (newModeForm) newModeForm.style.display = 'none';
    renderModes();
    // Auto-open the new mode's editor
    store.selectedModeId = res.mode.id;
    renderModeEditor();
  }
}

export async function saveModeDomainsFromTextarea() {
  if (!store.selectedModeId) return;

  const textarea = document.getElementById('mode-domains-textarea');
  if (!textarea) return;

  const raw = textarea.value;
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
    if (errEl) {
      errEl.textContent = errors.join(' · ');
      errEl.style.display = 'block';
    }
    return; // Block saving
  }

  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  // Send the full updated list to background
  const res = await sendMsg('setModeDomains', { modeId: store.selectedModeId, domains: entries });
  if (res && res.ok) {
    const idx = (store.state.modes || []).findIndex(m => m.id === store.selectedModeId);
    if (idx !== -1) store.state.modes[idx].domains = entries;
    renderModes();
    renderModeEditor();
  }
}

export function setupModesListeners() {
  // ---- MODES ----
  document.getElementById('btn-new-mode').addEventListener('click', () => {
    const form = document.getElementById('new-mode-form');
    const input = document.getElementById('new-mode-name');
    if (form) form.style.display = 'flex';
    if (input) input.focus();
  });

  document.getElementById('btn-cancel-mode').addEventListener('click', () => {
    const form = document.getElementById('new-mode-form');
    const input = document.getElementById('new-mode-name');
    if (form) form.style.display = 'none';
    if (input) input.value = '';
  });

  document.getElementById('btn-create-mode').addEventListener('click', createMode);
  document.getElementById('new-mode-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') createMode();
  });

  const nameSpan = document.getElementById('mode-editor-name');
  const nameInput = document.getElementById('mode-editor-name-input');

  const saveInlineName = async () => {
    const mode = (store.state.modes || []).find(m => m.id === store.selectedModeId);
    if (!mode) return;
    const newName = nameInput.value.trim();
    if (newName && newName !== mode.name) {
      const res = await sendMsg('renameMode', { modeId: store.selectedModeId, name: newName });
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
    const mode = (store.state.modes || []).find(m => m.id === store.selectedModeId);
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
    if (store.state.scheduleEnabled) return;
    const mode = (store.state.modes || []).find(m => m.id === store.selectedModeId);
    if (!mode) return;
    const wasActive = store.state.activeModeId === store.selectedModeId;
    const newActiveId = wasActive ? null : store.selectedModeId;
    await sendMsg('setActiveMode', { modeId: newActiveId });
    store.state.activeModeId = newActiveId;
    renderModes();
    renderModeEditor();
  });

  document.getElementById('btn-delete-mode').addEventListener('click', async () => {
    const mode = (store.state.modes || []).find(m => m.id === store.selectedModeId);
    if (!mode) return;
    if (!confirm(`Delete mode "${mode.name}"? This cannot be undone.`)) return;
    const res = await sendMsg('deleteMode', { modeId: store.selectedModeId });
    if (res && res.ok) {
      store.state.modes = res.modes;
      if (store.state.activeModeId === store.selectedModeId) store.state.activeModeId = null;
      store.selectedModeId = null;
      renderModes();
      const editor = document.getElementById('mode-editor');
      if (editor) editor.style.display = 'none';
    }
  });

  document.getElementById('btn-save-mode-domains').addEventListener('click', saveModeDomainsFromTextarea);

  document.getElementById('mode-domains-textarea').addEventListener('input', () => {
    const currentText = document.getElementById('mode-domains-textarea').value;
    const btnSave = document.getElementById('btn-save-mode-domains');
    if (btnSave) {
      btnSave.disabled = (currentText === store.originalDomainsText);
    }
  });
}
