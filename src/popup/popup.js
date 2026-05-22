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
  return new Promise(resolve => chrome.runtime.sendMessage({ action, ...data }, resolve));
}

document.addEventListener('DOMContentLoaded', async () => {
  const state = await sendMsg('getState');
  const countEl = document.getElementById('blocked-count');

  // Show active mode info
  const modes = state.modes || [];
  const activeMode = modes.find(m => m.id === state.activeModeId);
  updateCount(countEl, activeMode);

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
