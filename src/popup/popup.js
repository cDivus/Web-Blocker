function normalizeDomain(input) {
  try {
    let url = input.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return input.trim().toLowerCase().replace(/^www\./, '');
  }
}

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

  // Open settings
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
  });
});

function updateCount(el, mode) {
  if (!mode) {
    el.textContent = 'No mode active';
    return;
  }
  const n = (mode.domains || []).length;
  el.textContent = `${mode.name}: ${n} site${n !== 1 ? 's' : ''}`;
}
