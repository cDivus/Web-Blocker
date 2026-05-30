// ===== SCHEDULE MODULE =====
import { store, renderLegend } from './state.js';
import { sendMsg } from './utils.js';
import { renderModes } from './modes.js';

export function renderSchedule() {
  const select = document.getElementById('schedule-mode-select');
  const configContainer = document.getElementById('schedule-config-container');
  const noModesContainer = document.getElementById('schedule-no-modes');
  if (!select || !configContainer || !noModesContainer) return;

  const modes = store.state.modes || [];
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
  if (!store.scheduleModeId || !modes.some(m => m.id === store.scheduleModeId)) {
    store.scheduleModeId = (store.state.activeModeId && modes.some(m => m.id === store.state.activeModeId))
      ? store.state.activeModeId
      : modes[0].id;
  }
  select.value = store.scheduleModeId;

  const mode = modes.find(m => m.id === store.scheduleModeId);
  if (!mode) return;

  const enabled = store.state.scheduleEnabled || false;
  const checkbox = document.getElementById('schedule-enabled');
  if (checkbox) checkbox.checked = enabled;

  const wrapper = document.getElementById('schedule-content-wrapper');
  if (wrapper) {
    if (enabled) wrapper.classList.remove('disabled-blur');
    else wrapper.classList.add('disabled-blur');
  }

  // Render Calendar Grid
  const grid = document.getElementById('calendar-map-grid');
  if (!grid) return;
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
  const globalSchedule = store.state.globalSchedule || {};

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

export async function saveSchedule() {
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
  store.state.globalSchedule = globalSchedule;
  store.state.scheduleEnabled = enabled;
  if (enabled) {
    store.state.activeModeId = null;
  }
  renderModes();
}

export function setupScheduleListeners() {
  // dropdown select
  document.getElementById('schedule-mode-select').addEventListener('change', (e) => {
    store.scheduleModeId = e.target.value;
    renderSchedule();
  });

  // enabled toggle
  document.getElementById('schedule-enabled').addEventListener('change', saveSchedule);

  // Clear button
  document.getElementById('btn-calendar-clear').addEventListener('click', () => {
    document.querySelectorAll('.calendar-hour-cell').forEach(cell => {
      if (cell.dataset.modeId === store.scheduleModeId) {
        cell.classList.remove('selected');
        removeModeColors(cell);
        delete cell.dataset.modeId;
      }
    });
    saveSchedule();
  });

  // Weekdays preset button
  document.getElementById('btn-calendar-weekdays').addEventListener('click', () => {
    const modes = store.state.modes || [];
    const mode = modes.find(m => m.id === store.scheduleModeId);
    if (!mode) return;

    document.querySelectorAll('.calendar-hour-cell').forEach(cell => {
      const day = parseInt(cell.dataset.day);
      const hour = parseInt(cell.dataset.hour);
      if (day >= 1 && day <= 5 && hour >= 9 && hour < 17) {
        cell.classList.add('selected');
        removeModeColors(cell);
        cell.classList.add(`mode-color-${mode.color}`);
        cell.dataset.modeId = store.scheduleModeId;
      } else {
        if (cell.dataset.modeId === store.scheduleModeId) {
          cell.classList.remove('selected');
          removeModeColors(cell);
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
  if (!grid) return;
  
  grid.addEventListener('mousedown', e => {
    const cell = e.target.closest('.calendar-hour-cell');
    if (!cell) return;
    isDrawing = true;
    drawState = (cell.dataset.modeId !== store.scheduleModeId);
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
    const modes = store.state.modes || [];
    const mode = modes.find(m => m.id === store.scheduleModeId);
    if (!mode) return;

    if (select) {
      cell.classList.add('selected');
      removeModeColors(cell);
      cell.classList.add(`mode-color-${mode.color}`);
      cell.dataset.modeId = store.scheduleModeId;
    } else {
      if (cell.dataset.modeId === store.scheduleModeId) {
        cell.classList.remove('selected');
        removeModeColors(cell);
        delete cell.dataset.modeId;
      }
    }
  }
}

function removeModeColors(cell) {
  for (const cls of Array.from(cell.classList)) {
    if (cls.startsWith('mode-color-')) {
      cell.classList.remove(cls);
    }
  }
}
