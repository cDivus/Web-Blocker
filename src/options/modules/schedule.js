// ===== SIMPLE SCHEDULE MODULE =====
import { store } from './state.js';
import { sendMsg } from '../../common/utils.js';

export function renderSchedule() {
  const schedule = store.state.schedule || { enabled: false, start: '09:00', end: '17:00', days: 'weekdays' };
  const enabledCheckbox = document.getElementById('schedule-enabled');
  const startInput = document.getElementById('schedule-start-time');
  const endInput = document.getElementById('schedule-end-time');
  const daysSelect = document.getElementById('schedule-days-select');
  const wrapper = document.getElementById('schedule-content-wrapper');

  if (enabledCheckbox) enabledCheckbox.checked = !!schedule.enabled;
  if (startInput) startInput.value = schedule.start || '09:00';
  if (endInput) endInput.value = schedule.end || '17:00';
  if (daysSelect) daysSelect.value = schedule.days || 'weekdays';

  if (wrapper) {
    if (schedule.enabled) wrapper.classList.remove('disabled-blur');
    else wrapper.classList.add('disabled-blur');
  }
}

export async function saveSchedule() {
  const enabled = document.getElementById('schedule-enabled')?.checked || false;
  const start = document.getElementById('schedule-start-time')?.value || '09:00';
  const end = document.getElementById('schedule-end-time')?.value || '17:00';
  const days = document.getElementById('schedule-days-select')?.value || 'weekdays';

  const schedule = { enabled, start, end, days };
  store.state.schedule = schedule;

  const wrapper = document.getElementById('schedule-content-wrapper');
  if (wrapper) {
    if (enabled) wrapper.classList.remove('disabled-blur');
    else wrapper.classList.add('disabled-blur');
  }

  await sendMsg('setSchedule', { schedule });
}

export function setupScheduleListeners() {
  const enabledCheckbox = document.getElementById('schedule-enabled');
  const startInput = document.getElementById('schedule-start-time');
  const endInput = document.getElementById('schedule-end-time');
  const daysSelect = document.getElementById('schedule-days-select');

  if (enabledCheckbox) enabledCheckbox.addEventListener('change', saveSchedule);
  if (startInput) startInput.addEventListener('change', saveSchedule);
  if (endInput) endInput.addEventListener('change', saveSchedule);
  if (daysSelect) daysSelect.addEventListener('change', saveSchedule);
}
