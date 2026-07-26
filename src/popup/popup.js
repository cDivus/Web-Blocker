import { normalizeDomain, getLocalDateString, getNormalizedUrl, findMatchingEntry } from '../common/utils.js';

// Apply theme immediately on script load
chrome.storage.local.get('theme', (data) => {
  document.documentElement.setAttribute('data-theme', data.theme || 'teal');
});

// Live theme listener
chrome.storage.onChanged.addListener((changes) => {
  if (changes.theme) {
    document.documentElement.setAttribute('data-theme', changes.theme.newValue || 'teal');
  }
});

function sendMsg(action, data = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...data }, response => {
      const err = chrome.runtime.lastError;
      resolve(response);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const state = await sendMsg('getState');
  const countEl = document.getElementById('blocked-count');

  // Show active mode info (taking schedule into account)
  const getActiveMode = (s) => {
    if (s.enabled === false) return null;
    const modesList = s.modes || [];
    if (s.scheduleEnabled) {
      const globalSchedule = s.globalSchedule || {};
      const now = new Date();
      const key = `${now.getDay()}-${now.getHours()}`;
      const scheduledModeId = globalSchedule[key];
      return modesList.find(m => m.id === scheduledModeId) || null;
    }
    return modesList.find(m => m.id === s.activeModeId) || null;
  };

  const activeMode = getActiveMode(state);
  updateCount(countEl, activeMode);

  // Check tab block & match status
  const currentTabRes = await sendMsg('getCurrentTab');
  let matchedEntry = null;
  let isBlockable = false;
  let alreadyBlocked = false;

  if (currentTabRes && currentTabRes.url) {
    const urlObj = getNormalizedUrl(currentTabRes.url);
    if (urlObj) {
      isBlockable = true;
    }

    if (activeMode && isBlockable) {
      matchedEntry = findMatchingEntry(currentTabRes.url, activeMode.domains);
      if (matchedEntry) {
        alreadyBlocked = true;
      }
    }
  }

  // Live active tab timer countdown in Popup
  if (matchedEntry && matchedEntry.limitMinutes != null) {
    const timerBox = document.getElementById('active-timer-box');
    const timerText = document.getElementById('active-timer-text');
    const timerBar = document.getElementById('active-timer-bar');

    timerBox.style.display = 'flex';
    document.getElementById('active-timer-target').textContent = matchedEntry.domain;

    const updatePopupTimer = async () => {
      const timersRes = await sendMsg('getTimers');
      const timers = (timersRes && timersRes.siteTimers) || {};
      const today = getLocalDateString();
      const rec = timers[matchedEntry.domain];
      const usedMs = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
      const limitMs = matchedEntry.limitMinutes * 60 * 1000;
      const remMs = Math.max(0, limitMs - usedMs);

      const fmt = (ms) => {
        const s = Math.floor(ms / 1000) % 60;
        const m = Math.floor(ms / 60000) % 60;
        const h = Math.floor(ms / 3600000);
        return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
      };

      const pct = Math.min(100, (usedMs / limitMs) * 100);
      timerBar.style.width = pct + '%';

      timerBar.className = 'analytics-bar-fill';
      if (pct >= 100) {
        timerBar.classList.add('timer-bar-full');
        timerText.textContent = 'Blocked';
      } else if (pct >= 80) {
        timerBar.classList.add('timer-bar-warn');
        timerText.textContent = `${fmt(remMs)} left`;
      } else {
        timerText.textContent = `${fmt(remMs)} left`;
      }
    };

    await updatePopupTimer();
    const popupInterval = setInterval(updatePopupTimer, 1000);

    window.addEventListener('unload', () => {
      clearInterval(popupInterval);
    });
  }

  const btnBlockCurrent = document.getElementById('btn-block-current');
  const updateBlockCurrentButton = () => {
    btnBlockCurrent.disabled = !isBlockable || !activeMode || alreadyBlocked;
    btnBlockCurrent.textContent = alreadyBlocked ? 'Already Blocked' : 'Block This Site';
  };

  updateBlockCurrentButton();

  // Block current site
  btnBlockCurrent.addEventListener('click', async () => {
    const res = await sendMsg('getCurrentTab');
    if (!res || !res.url) return;

    const domain = normalizeDomain(res.url);
    if (!domain) return;

    const addRes = await sendMsg('addDomain', { domain });
    if (addRes && addRes.ok) {
      updateCount(countEl, addRes.mode);
      alreadyBlocked = true;
      updateBlockCurrentButton();
    } else {
      countEl.textContent = 'Enable a mode in Settings first';
    }
  });

  // Check password status on load
  const pwdContainer = document.getElementById('popup-password-container');
  const pwdInput = document.getElementById('popup-password-input');
  const pwdError = document.getElementById('popup-password-error');

  if (state.password) {
    pwdContainer.style.display = 'block';
  } else {
    pwdContainer.style.display = 'none';
  }

  // Open settings
  document.getElementById('btn-settings').addEventListener('click', async () => {
    if (state.password) {
      const enteredVal = pwdInput.value.trim();
      if (enteredVal !== state.password) {
        pwdError.textContent = 'Incorrect password.';
        pwdError.style.display = 'block';
        return;
      }
      pwdError.style.display = 'none';
      
      // Set a temporary session unlock key so options page lets us in automatically
      await chrome.storage.local.set({ sessionUnlocked: true });
    }

      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  });

  // Enable unlock on pressing Enter in the password field
  pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-settings').click();
    }
  });
});

function updateCount(el, mode) {
  if (!mode) {
    el.textContent = 'No mode active';
    return;
  }
  let n = 0;
  (mode.domains || []).forEach(e => {
    if (e && e.domain) {
      n += e.domain.split(',').filter(Boolean).length;
    }
  });
  el.textContent = `${mode.name}: ${n} site${n !== 1 ? 's' : ''}`;
}
