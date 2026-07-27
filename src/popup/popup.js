import { getLocalDateString, parseUrl, findMatchingEntry, entryMatches } from '../common/utils.js';

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
  const blocklist = state.blocklist || [];
  const perpetualBlock = state.perpetualBlock || [];
  const combined = [...perpetualBlock, ...blocklist];

  updateCount(countEl, combined);

  // Check tab block & match status
  const currentTabRes = await sendMsg('getCurrentTab');
  let matchedEntry = null;
  let isBlockable = false;
  let alreadyBlocked = false;

  if (currentTabRes?.url && parseUrl(currentTabRes.url)) {
    const urlObj = parseUrl(currentTabRes.url);
    isBlockable = true;
    matchedEntry = findMatchingEntry(urlObj, combined);

    // Check if site matches ANY rule entry in combined list (including whitelisted ! rules)
    const hasAnyMatch = combined.some(e => {
      const d = (typeof e === 'string') ? e : e.domain;
      if (!d) return false;
      const cleanD = d.startsWith('!') ? d.slice(1).trim() : d;
      return entryMatches(urlObj, cleanD);
    });

    alreadyBlocked = !!matchedEntry || hasAnyMatch;
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
      const rec = timersRes?.siteTimers?.[matchedEntry.domain];
      const usedMs = rec?.date === getLocalDateString() ? (rec.usedMs || 0) : 0;
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
    btnBlockCurrent.disabled = !isBlockable || alreadyBlocked;
    btnBlockCurrent.textContent = alreadyBlocked ? 'Already Blocked' : 'Block This Site';
  };

  updateBlockCurrentButton();

  // Block current site
  btnBlockCurrent.addEventListener('click', async () => {
    if (!isBlockable || alreadyBlocked) return;
    const tabRes = await sendMsg('getCurrentTab');
    if (!tabRes?.url) return;

    const urlObj = parseUrl(tabRes.url);
    if (!urlObj) return;

    const domainToAdd = urlObj.hostname;
    const addRes = await sendMsg('addDomain', { domain: domainToAdd });

    if (addRes?.ok) {
      alreadyBlocked = true;
      updateBlockCurrentButton();
      state.blocklist = addRes.blocklist || [];
      const updatedCombined = [...(state.perpetualBlock || []), ...state.blocklist];
      updateCount(countEl, updatedCombined);
    }
  });

  // Open settings
  const passwordContainer = document.getElementById('popup-password-container');
  const openSettingsBtn = document.getElementById('btn-settings');
  const popupPasswordInput = document.getElementById('popup-password-input');
  const popupPasswordError = document.getElementById('popup-password-error');

  if (state.password) {
    if (passwordContainer) passwordContainer.style.display = 'block';
  } else {
    if (passwordContainer) passwordContainer.style.display = 'none';
  }

  const handleOpenSettings = async () => {
    if (popupPasswordError) {
      popupPasswordError.style.display = 'none';
      popupPasswordError.textContent = '';
    }
    if (state.password) {
      const pwd = popupPasswordInput ? popupPasswordInput.value.trim() : '';
      if (!pwd) {
        if (popupPasswordError) {
          popupPasswordError.textContent = 'Password required';
          popupPasswordError.style.display = 'block';
        }
        if (popupPasswordInput) popupPasswordInput.focus();
        return;
      }
      if (pwd !== state.password) {
        if (popupPasswordError) {
          popupPasswordError.textContent = 'Incorrect password';
          popupPasswordError.style.display = 'block';
        }
        if (popupPasswordInput) {
          popupPasswordInput.value = '';
          popupPasswordInput.focus();
        }
        return;
      }
      await chrome.storage.local.set({ sessionUnlocked: true });
    }
    chrome.runtime.openOptionsPage();
  };

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', handleOpenSettings);
  }

  if (popupPasswordInput) {
    popupPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleOpenSettings();
      }
    });
    popupPasswordInput.addEventListener('input', () => {
      if (popupPasswordError) {
        popupPasswordError.style.display = 'none';
      }
    });
  }
});

function updateCount(el, blocklist) {
  if (!el) return;
  const count = blocklist.reduce((acc, entry) => {
    const raw = typeof entry === 'string' ? entry : entry.domain;
    if (!raw || raw.startsWith('!')) return acc;
    const subCount = raw.split(',').filter(Boolean).length;
    return acc + subCount;
  }, 0);
  el.textContent = `${count} site${count !== 1 ? 's' : ''} blocked`;
}
