function normalizeDomain(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes(' ')) return ''; // Spaces are never allowed in domains or keywords!
  if (!trimmed.includes('.')) return trimmed;
  try {
    let url = trimmed;
    if (!url.startsWith('http')) url = 'https://' + url;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '');
  }
}

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

  // Show active mode info
  const modes = state.modes || [];
  const activeMode = modes.find(m => m.id === state.activeModeId);
  updateCount(countEl, activeMode);

  // Live active tab timer countdown in Popup
  const currentTabRes = await sendMsg('getCurrentTab');
  if (currentTabRes && currentTabRes.url && activeMode) {
    const hostname = normalizeDomain(currentTabRes.url);
    const entry = (activeMode.domains || []).find(e => {
      const d = (typeof e === 'string') ? e : e.domain;
      if (!d) return false;
      const parts = d.split(',').map(s => s.trim()).filter(Boolean);
      return parts.some(p => {
        if (!p.includes('.')) return hostname.includes(p);
        return hostname === p || hostname.endsWith('.' + p);
      });
    });

    if (entry && entry.limitMinutes != null) {
      const timerBox = document.getElementById('active-timer-box');
      const timerText = document.getElementById('active-timer-text');
      const timerBar = document.getElementById('active-timer-bar');

      timerBox.style.display = 'flex';
      document.getElementById('active-timer-target').textContent = entry.domain;

      const updatePopupTimer = async () => {
        const timersRes = await sendMsg('getTimers');
        const timers = (timersRes && timersRes.siteTimers) || {};
        const today = new Date().toISOString().slice(0, 10);
        const rec = timers[entry.domain];
        const usedMs = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
        const limitMs = entry.limitMinutes * 60 * 1000;
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
  }

  // Block current site
  document.getElementById('btn-block-current').addEventListener('click', async () => {
    const res = await sendMsg('getCurrentTab');
    if (!res || !res.url) return;

    const domain = normalizeDomain(res.url);
    if (!domain) return;

    const addRes = await sendMsg('addDomain', { domain });
    if (addRes && addRes.ok) {
      updateCount(countEl, addRes.mode);
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
      await new Promise(resolve => {
        chrome.storage.local.set({ sessionUnlocked: true }, resolve);
      });
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
