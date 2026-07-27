// ===== MAIN OPTIONS CONTROLLER & ROUTER =====
import { store, refreshState } from './modules/state.js';
import { renderBlocklist, initBlocklistEvents, saveBlocklistFromTextarea } from './modules/blocklist.js';
import { renderSchedule, setupScheduleListeners } from './modules/schedule.js';
import { renderBlockPage, setupBlockPageListeners } from './modules/blockpage.js';
import { renderAnalytics } from './modules/analytics.js';
import { renderPasswordSettings, setupPasswordListeners } from './modules/password.js';

// Apply theme immediately on script load
chrome.storage.local.get('theme', (data) => {
  document.documentElement.setAttribute('data-theme', data.theme || 'teal');
});

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Load global state
  await refreshState();

  // Password Lock screen check
  const sessionCheck = await chrome.storage.local.get('sessionUnlocked');
  const isUnlocked = sessionCheck.sessionUnlocked === true;
  await chrome.storage.local.remove('sessionUnlocked');

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
  initBlocklistEvents();
  setupScheduleListeners();
  setupBlockPageListeners();
  setupPasswordListeners();
  setupGlobalListeners();
  setupThemeListeners();

  // Render all active components
  renderBlocklist();
  renderSchedule();
  renderBlockPage();
  renderAnalytics();
  renderPasswordSettings();
  renderThemeSettings();

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

      // Save blocklist when switching sections
      saveBlocklistFromTextarea();
    });
  });

  document.querySelectorAll('.btn-open-syntax-help').forEach(btn => {
    btn.addEventListener('click', () => {
      const helpNavBtn = document.querySelector('.nav-btn[data-section="help"]');
      if (helpNavBtn) helpNavBtn.click();
    });
  });
}

// ===== GLOBAL CONTROLS =====
function setupGlobalListeners() {
  // ---- RESET ALL ----
  const resetBtn = document.getElementById('btn-reset-all');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Reset all settings to defaults?')) return;
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        enabled: true,
        blocklist: [],
        schedule: { enabled: false, start: '09:00', end: '17:00', days: 'weekdays' },
        tempUnblocks: {},
        siteTimers: {},
        theme: 'teal'
      });

      // Refresh local memory
      await refreshState();

      // Redraw all components
      renderBlocklist();
      renderSchedule();
      renderBlockPage();
      renderAnalytics();
      renderPasswordSettings();
      await renderThemeSettings();
    });
  }
}

// ===== THEME CONTROLS =====
async function renderThemeSettings() {
  const data = await chrome.storage.local.get('theme');
  const activeTheme = data.theme || 'teal';

  document.documentElement.setAttribute('data-theme', activeTheme);

  const btnTeal = document.getElementById('btn-theme-teal');
  const btnMonochrome = document.getElementById('btn-theme-monochrome');

  if (btnTeal && btnMonochrome) {
    if (activeTheme === 'teal') {
      btnTeal.classList.add('active');
      btnMonochrome.classList.remove('active');
    } else {
      btnTeal.classList.remove('active');
      btnMonochrome.classList.add('active');
    }
  }
}

function setupThemeListeners() {
  const btnTeal = document.getElementById('btn-theme-teal');
  const btnMonochrome = document.getElementById('btn-theme-monochrome');

  if (btnTeal) {
    btnTeal.addEventListener('click', async () => {
      await chrome.storage.local.set({ theme: 'teal' });
      await renderThemeSettings();
    });
  }

  if (btnMonochrome) {
    btnMonochrome.addEventListener('click', async () => {
      await chrome.storage.local.set({ theme: 'monochrome' });
      await renderThemeSettings();
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.theme) {
      renderThemeSettings();
    }
  });
}
