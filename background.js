// ===== UTILITY =====
function normalizeEntry(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  // No dot = keyword, store as-is
  if (!trimmed.includes('.')) return trimmed;
  // Has dot = domain, extract hostname
  try {
    let url = trimmed;
    if (!url.startsWith('http')) url = 'https://' + url;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '');
  }
}

function getDomainFromUrl(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return null; }
}

function entryMatches(hostname, entry) {
  if (!entry.includes('.')) {
    // Keyword: match if hostname contains it anywhere
    return hostname.includes(entry);
  }
  // Domain: exact match or subdomain
  return hostname === entry || hostname.endsWith('.' + entry);
}

// ===== STORAGE =====
const get = keys => new Promise(r => chrome.storage.local.get(keys, r));
const set = data  => new Promise(r => chrome.storage.local.set(data, r));

// ===== BLOCKING LOGIC =====
async function shouldBlock(url) {
  const data = await get([
    'enabled', 'modes', 'activeModeId', 'schedule', 'scheduleEnabled',
    'focusActive', 'focusEndTime', 'tempUnblocks'
  ]);

  if (data.enabled === false) return false;

  const activeModeId = data.activeModeId || null;
  if (!activeModeId) return false;

  const activeMode = (data.modes || []).find(m => m.id === activeModeId);
  if (!activeMode || !(activeMode.domains || []).length) return false;

  const req = getDomainFromUrl(url);
  if (!req) return false;
  if (!activeMode.domains.some(d => entryMatches(req, d))) return false;

  const now = Date.now();
  const tmp = data.tempUnblocks || {};
  if (tmp[req] && tmp[req] > now) return false;

  if (data.focusActive && data.focusEndTime > now) return true;

  if (data.scheduleEnabled) {
    const s = data.schedule || {};
    const d2 = new Date();
    if (!(s.days || [1,2,3,4,5]).includes(d2.getDay())) return false;
    const cur = d2.getHours() * 60 + d2.getMinutes();
    const [sh, sm] = (s.startTime || '08:00').split(':').map(Number);
    const [eh, em] = (s.endTime   || '17:00').split(':').map(Number);
    if (cur < sh * 60 + sm || cur >= eh * 60 + em) return false;
  }

  return true;
}

// ===== NAVIGATION =====
chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  if (!url || /^(chrome|chrome-extension|about):/.test(url)) return;
  if (await shouldBlock(url)) {
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocked.html') + '?blocked=' + encodeURIComponent(url) });
  }
});

// ===== ALARMS =====
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name === 'focusEnd') {
    await set({ focusActive: false, focusEndTime: 0 });
    chrome.notifications.create('focusComplete', {
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: 'Focus Session Complete!',
      message: 'Your focus session has ended.'
    });
  } else if (name.startsWith('tempUnblock_')) {
    const domain = name.slice('tempUnblock_'.length);
    const data = await get(['tempUnblocks']);
    const tmp = data.tempUnblocks || {};
    delete tmp[domain];
    await set({ tempUnblocks: tmp });
  }
});

// ===== MESSAGES =====
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  handle(msg, reply);
  return true;
});

async function handle(msg, reply) {
  const { action } = msg;

  if (action === 'getState') {
    const data = await get(['enabled','modes','activeModeId','schedule','scheduleEnabled',
      'focusActive','focusEndTime','focusDuration','tempUnblocks','blockPageContent']);
    reply({ ...data, enabled: data.enabled !== false });

  } else if (action === 'setEnabled') {
    await set({ enabled: msg.value }); reply({ ok: true });

  } else if (action === 'getModes') {
    const data = await get(['modes', 'activeModeId']);
    reply({ modes: data.modes || [], activeModeId: data.activeModeId || null });

  } else if (action === 'setActiveMode') {
    await set({ activeModeId: msg.modeId || null }); reply({ ok: true });

  } else if (action === 'createMode') {
    const data = await get(['modes']);
    const modes = data.modes || [];
    const mode = { id: 'mode_' + Date.now(), name: msg.name, builtin: false, domains: [] };
    modes.push(mode);
    await set({ modes });
    reply({ ok: true, mode, modes });

  } else if (action === 'deleteMode') {
    const data = await get(['modes', 'activeModeId']);
    let modes = (data.modes || []).filter(m => m.id !== msg.modeId);
    const upd = { modes };
    if (data.activeModeId === msg.modeId) upd.activeModeId = null;
    await set(upd); reply({ ok: true, modes });

  } else if (action === 'renameMode') {
    const data = await get(['modes']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === msg.modeId);
    if (idx !== -1) { modes[idx].name = msg.name; await set({ modes }); }
    reply({ ok: true });

  } else if (action === 'addDomainToMode') {
    const domain = normalizeEntry(msg.domain);
    if (!domain) { reply({ ok: false }); return; }
    const data = await get(['modes']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === msg.modeId);
    if (idx === -1) { reply({ ok: false }); return; }
    if (!modes[idx].domains.includes(domain)) modes[idx].domains.push(domain);
    await set({ modes });
    reply({ ok: true, mode: modes[idx] });

  } else if (action === 'removeDomainFromMode') {
    const data = await get(['modes']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === msg.modeId);
    if (idx === -1) { reply({ ok: false }); return; }
    modes[idx].domains = modes[idx].domains.filter(d => d !== msg.domain);
    await set({ modes });
    reply({ ok: true, mode: modes[idx] });

  } else if (action === 'setModeDomains') {
    const data = await get(['modes']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === msg.modeId);
    if (idx === -1) { reply({ ok: false }); return; }
    modes[idx].domains = msg.domains || [];
    await set({ modes });
    reply({ ok: true });

  } else if (action === 'addDomain') {
    // popup "Block This Site" — adds to active mode
    const domain = normalizeEntry(msg.domain);
    if (!domain) { reply({ ok: false, error: 'Invalid domain' }); return; }
    const data = await get(['modes', 'activeModeId']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === data.activeModeId);
    if (idx === -1) { reply({ ok: false, error: 'No active mode' }); return; }
    if (!modes[idx].domains.includes(domain)) modes[idx].domains.push(domain);
    await set({ modes });
    reply({ ok: true, domain, mode: modes[idx] });

  } else if (action === 'startFocus') {
    const endTime = Date.now() + msg.duration * 60000;
    await set({ focusActive: true, focusEndTime: endTime, focusDuration: msg.duration });
    chrome.alarms.create('focusEnd', { delayInMinutes: msg.duration });
    reply({ ok: true, endTime });

  } else if (action === 'stopFocus') {
    await set({ focusActive: false, focusEndTime: 0 });
    chrome.alarms.clear('focusEnd');
    reply({ ok: true });

  } else if (action === 'setSchedule') {
    await set({ schedule: msg.schedule, scheduleEnabled: msg.enabled }); reply({ ok: true });

  } else if (action === 'saveBlockPage') {
    await set({ blockPageContent: msg.content }); reply({ ok: true });

  } else if (action === 'getCurrentTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    reply({ url: tab ? tab.url : null });
  }
}

// ===== INIT =====
chrome.runtime.onInstalled.addListener(async () => {
  const data = await get(['modes']);
  if (!data.modes) {
    await set({
      enabled: true,
      modes: [{
        id: 'builtin-social',
        name: 'Focus',
        builtin: true,
        domains: [
          'facebook.com','instagram.com','twitter.com','x.com','tiktok.com',
          'reddit.com','youtube.com','snapchat.com','pinterest.com',
          'linkedin.com','tumblr.com','twitch.tv','discord.com'
        ]
      }],
      activeModeId: null,
      scheduleEnabled: false,
      schedule: { days: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' },
      focusActive: false, focusEndTime: 0, tempUnblocks: {}
    });
  }
});
