// ===== MAIN OPTIONS CONTROLLER & ROUTER =====
import { store, refreshState } from './modules/state.js';
import { sendMsg } from './modules/utils.js';
import { renderModes, setupModesListeners } from './modules/modes.js';
import { renderSchedule, setupScheduleListeners } from './modules/schedule.js';
import { renderBlockPage, setupBlockPageListeners } from './modules/blockpage.js';
import { renderAnalytics } from './modules/analytics.js';
import { renderPasswordSettings, setupPasswordListeners } from './modules/password.js';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Load global state
  await refreshState();

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

  if (store.state.password && !isUnlocked) {
    if (layoutEl) layoutEl.style.setProperty('display', 'none', 'important');
    if (lockScreen) lockScreen.style.display = 'flex';
  } else {
    if (lockScreen) lockScreen.style.display = 'none';
    if (layoutEl) layoutEl.style.display = '';
  }

  // Setup navigation & all listeners
  setupNav();
  setupModesListeners();
  setupScheduleListeners();
  setupBlockPageListeners();
  setupPasswordListeners();
  setupGlobalListeners();

  // Render all active components
  renderModes();
  renderSchedule();
  renderBlockPage();
  renderAnalytics();
  renderPasswordSettings();
  
  // Visibility change logic to stop/start polling
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (store.analyticsInterval) {
        clearInterval(store.analyticsInterval);
        store.analyticsInterval = null;
      }
    } else {
      const activeBtn = document.querySelector('.nav-btn.active');
      if (activeBtn && activeBtn.dataset.section === 'analytics') {
        renderAnalytics();
        if (!store.analyticsInterval) {
          store.analyticsInterval = setInterval(renderAnalytics, 1000);
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
      
      const sec = document.getElementById('section-' + btn.dataset.section);
      if (sec) sec.classList.add('active');
      
      if (store.analyticsInterval) {
        clearInterval(store.analyticsInterval);
        store.analyticsInterval = null;
      }
      
      if (btn.dataset.section === 'analytics') {
        renderAnalytics();
        store.analyticsInterval = setInterval(renderAnalytics, 1000);
      }
    });
  });
}

// ===== GLOBAL CONTROLS =====
function setupGlobalListeners() {
  // ---- RESET ALL ----
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
    
    // Refresh local memory
    await refreshState();
    store.selectedModeId = null;

    // Redraw all components
    renderModes();
    renderSchedule();
    renderBlockPage();
    renderAnalytics();
    renderPasswordSettings();

    const editor = document.getElementById('mode-editor');
    if (editor) editor.style.display = 'none';
  });
}
