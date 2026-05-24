// ===== PASSWORD SETTINGS MODULE =====
import { store } from './state.js';
import { sendMsg } from './utils.js';

export function renderPasswordSettings() {
  const setupContainer = document.getElementById('password-setup-container');
  const activeContainer = document.getElementById('password-active-container');
  const statusDesc = document.getElementById('password-status-desc');
  const errEl = document.getElementById('password-settings-error');

  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  const settingsInput = document.getElementById('settings-password-input');
  const removeInput = document.getElementById('settings-password-remove-input');
  if (settingsInput) settingsInput.value = '';
  if (removeInput) removeInput.value = '';

  if (store.state.password) {
    if (setupContainer) setupContainer.style.display = 'none';
    if (activeContainer) activeContainer.style.display = 'block';
    if (statusDesc) statusDesc.textContent = 'Password Protection is ACTIVE. Settings are locked.';
  } else {
    if (setupContainer) setupContainer.style.display = 'block';
    if (activeContainer) activeContainer.style.display = 'none';
    if (statusDesc) statusDesc.textContent = 'Restrict settings access using a password.';
  }
}

export function setupPasswordListeners() {
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
    store.state.password = pwd;
    renderPasswordSettings();
  });

  document.getElementById('btn-remove-password').addEventListener('click', async () => {
    const pwdInput = document.getElementById('settings-password-remove-input');
    const errEl = document.getElementById('password-settings-error');
    const pwd = pwdInput.value.trim();
    if (pwd !== store.state.password) {
      if (errEl) { errEl.textContent = 'Incorrect password.'; errEl.style.display = 'block'; }
      return;
    }
    await sendMsg('setPassword', { password: '' });
    store.state.password = '';
    renderPasswordSettings();
  });

  document.getElementById('btn-unlock-settings').addEventListener('click', () => {
    const input = document.getElementById('lock-password-input');
    const errEl = document.getElementById('lock-error');
    if (input.value === store.state.password) {
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
