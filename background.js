// ===== UTILITY =====
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

function getDomainFromUrl(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return null; }
}

function singleEntryMatches(hostname, entryPart) {
  const trimmed = entryPart.trim();
  if (!trimmed.includes('.')) {
    return hostname.includes(trimmed);
  }
  return hostname === trimmed || hostname.endsWith('.' + trimmed);
}

function entryMatches(hostname, entryDomain) {
  const parts = entryDomain.split(',').map(s => s.trim()).filter(Boolean);
  return parts.some(p => singleEntryMatches(hostname, p));
}

/** Return the raw entry object { domain, limitMinutes } for this hostname, or null. */
function findMatchingEntry(hostname, entries) {
  return (entries || []).find(e => {
    const d = (typeof e === 'string') ? e : e.domain;
    return d && entryMatches(hostname, d);
  }) || null;
}

function getActiveModeAtTime(data, timestamp) {
  if (data.enabled === false) return null;

  const modes = data.modes || [];
  
  if (data.scheduleEnabled) {
    // 1. Schedule is enabled: follow the global calendar schedule only
    const globalSchedule = data.globalSchedule || {};
    const d2 = new Date(timestamp);
    const day = d2.getDay(); // 0-6
    const hour = d2.getHours(); // 0-23
    const key = `${day}-${hour}`;
    
    const scheduledModeId = globalSchedule[key];
    if (scheduledModeId) {
      return modes.find(m => m.id === scheduledModeId) || null;
    }
    return null; // nothing blocked when no mode is scheduled
  } else {
    // 2. Schedule is disabled: follow the manually active mode
    if (data.activeModeId) {
      return modes.find(m => m.id === data.activeModeId) || null;
    }
    return null;
  }
}

// ===== TIMER HELPERS =====
const TODAY_KEY = () => new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

async function getTimerUsage(domain) {
  const data = await get(['siteTimers']);
  const timers = data.siteTimers || {};
  const rec = timers[domain];
  if (!rec || rec.date !== TODAY_KEY()) return 0; // no usage today
  return rec.usedMs || 0;
}

async function addTimerUsage(domain, ms) {
  const data = await get(['siteTimers']);
  const timers = data.siteTimers || {};
  const today = TODAY_KEY();
  const rec = timers[domain];
  const prevMs = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
  timers[domain] = { date: today, usedMs: prevMs + ms };
  await set({ siteTimers: timers });
}

// ===== STORAGE =====
const get = keys => new Promise(r => chrome.storage.local.get(keys, r));
const set = data  => new Promise(r => chrome.storage.local.set(data, r));

// ===== BLOCKING LOGIC =====
async function shouldBlock(url) {
  const data = await get([
    'enabled', 'modes', 'activeModeId', 'globalSchedule', 'tempUnblocks', 'scheduleEnabled'
  ]);

  if (data.enabled === false) return false;

  const activeMode = getActiveModeAtTime(data, Date.now());
  if (!activeMode || !(activeMode.domains || []).length) return false;

  const req = getDomainFromUrl(url);
  if (!req) return false;

  const matchedEntry = findMatchingEntry(req, activeMode.domains);
  if (!matchedEntry) return false;

  const now = Date.now();
  const tmp = data.tempUnblocks || {};
  if (tmp[req] && tmp[req] > now) return false;

  // Timer check: if this entry has a daily limit, check usage
  const entry = typeof matchedEntry === 'string'
    ? { domain: matchedEntry, limitMinutes: null }
    : matchedEntry;

  if (entry.limitMinutes != null) {
    const usedMs = await getTimerUsage(entry.domain);
    const limitMs = entry.limitMinutes * 60 * 1000;
    if (usedMs >= limitMs) return true; // Over limit → block
    return false; // Under limit → allow
  }

  return true;
}

// ===== NAVIGATION =====
chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  if (!url || /^(chrome|chrome-extension|about):/.test(url)) return;

  if (await shouldBlock(url)) {
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL('src/blocked/blocked.html') + '?blocked=' + encodeURIComponent(url) });
  }
});

// ===== REAL-TIME TIMER TRACKING =====
async function updateTracker() {
  const [activeTab] = await new Promise(resolve => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) resolve([]);
      else resolve(tabs || []);
    });
  });

  const win = await new Promise(resolve => {
    chrome.windows.getLastFocused({ populate: false }, (w) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(w);
    });
  });

  const isBrowserFocused = win && win.focused;
  const data = await get(['currentTracker', 'modes', 'activeModeId', 'enabled', 'globalSchedule', 'scheduleEnabled']);
  
  const tracker = data.currentTracker || null;
  const isEnabled = data.enabled !== false;
  
  let activeDomain = null;
  let activeTabId = null;
  let limitMinutes = null;
  let activeTabUrl = null;
  
  if (isEnabled && isBrowserFocused && activeTab && activeTab.url && !/^(chrome|chrome-extension|about):/.test(activeTab.url)) {
    const domain = getDomainFromUrl(activeTab.url);
    if (domain) {
      const activeMode = getActiveModeAtTime(data, Date.now());
      if (activeMode) {
        const matched = findMatchingEntry(domain, activeMode.domains);
        if (matched) {
          const entry = typeof matched === 'string' ? { domain: matched, limitMinutes: null } : matched;
          if (entry.limitMinutes != null) {
            activeDomain = entry.domain;
            activeTabId = activeTab.id;
            limitMinutes = entry.limitMinutes;
            activeTabUrl = activeTab.url;
          }
        }
      }
    }
  }
  
  const now = Date.now();
  
  // Case 1: Active tab is still the same tracked tab
  if (tracker && tracker.tabId === activeTabId && tracker.domain === activeDomain) {
    // Check if we exceeded the limit in real-time
    const usedMs = await getTimerUsage(tracker.domain);
    const elapsed = now - tracker.startMs;
    const totalUsedMs = usedMs + elapsed;
    const limitMs = limitMinutes * 60 * 1000;
    
    if (totalUsedMs >= limitMs) {
      // Exceeded limit! Block immediately
      await recordTrackerExit(tracker);
      chrome.tabs.update(tracker.tabId, { url: chrome.runtime.getURL('src/blocked/blocked.html') + '?blocked=' + encodeURIComponent(activeTabUrl) });
    } else {
      // Still under limit, update alarm with new remaining time
      const remainingTimeMs = limitMs - totalUsedMs;
      await chrome.alarms.create('block_active_tab', { when: now + remainingTimeMs });
    }
    return;
  }
  
  // Case 2: Tracked tab has changed
  if (tracker) {
    await recordTrackerExit(tracker);
  }
  
  if (activeDomain) {
    // Start tracking new tab
    const usedMs = await getTimerUsage(activeDomain);
    const limitMs = limitMinutes * 60 * 1000;
    
    if (usedMs >= limitMs) {
      // Already over limit, block immediately!
      chrome.tabs.update(activeTabId, { url: chrome.runtime.getURL('src/blocked/blocked.html') + '?blocked=' + encodeURIComponent(activeTabUrl) });
    } else {
      const remainingTimeMs = limitMs - usedMs;
      const newTracker = {
        tabId: activeTabId,
        domain: activeDomain,
        startMs: now,
        limitMinutes
      };
      await set({ currentTracker: newTracker });
      await chrome.alarms.create('block_active_tab', { when: now + remainingTimeMs });
    }
  } else {
    await set({ currentTracker: null });
    await chrome.alarms.clear('block_active_tab');
  }
}

async function recordTrackerExit(tracker) {
  if (!tracker) return;
  const elapsed = Date.now() - tracker.startMs;
  if (elapsed > 0) {
    await addTimerUsage(tracker.domain, elapsed);
  }
  await set({ currentTracker: null });
  await chrome.alarms.clear('block_active_tab');
}

// ===== EVENT LISTENERS =====
chrome.tabs.onActivated.addListener(() => { updateTracker(); });
chrome.windows.onFocusChanged.addListener(() => { updateTracker(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateTracker();
  }
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await get(['currentTracker']);
  if (data.currentTracker && data.currentTracker.tabId === tabId) {
    await recordTrackerExit(data.currentTracker);
  }
});
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'idle' || state === 'locked') {
    const data = await get(['currentTracker']);
    if (data.currentTracker) {
      await recordTrackerExit(data.currentTracker);
    }
  } else if (state === 'active') {
    await updateTracker();
  }
});

// ===== ALARMS =====
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name.startsWith('tempUnblock_')) {
    const domain = name.slice('tempUnblock_'.length);
    const data = await get(['tempUnblocks']);
    const tmp = data.tempUnblocks || {};
    delete tmp[domain];
    await set({ tempUnblocks: tmp });
  } else if (name === 'block_active_tab') {
    await updateTracker();
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
    const data = await get(['enabled','modes','activeModeId','globalSchedule',
      'tempUnblocks','blockPageContent','scheduleEnabled']);
    reply({ ...data, enabled: data.enabled !== false });

  } else if (action === 'getTimers') {
    const data = await get(['siteTimers', 'currentTracker']);
    const timers = data.siteTimers || {};
    const tracker = data.currentTracker;
    if (tracker) {
      const today = TODAY_KEY();
      const elapsed = Date.now() - tracker.startMs;
      if (elapsed > 0) {
        const rec = timers[tracker.domain];
        const prevMs = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
        timers[tracker.domain] = { date: today, usedMs: prevMs + elapsed };
      }
    }
    reply({ siteTimers: timers });

  } else if (action === 'getModes') {
    const data = await get(['modes', 'activeModeId']);
    reply({ modes: data.modes || [], activeModeId: data.activeModeId || null });

  } else if (action === 'setActiveMode') {
    await set({ activeModeId: msg.modeId || null });
    await updateTracker();
    reply({ ok: true });

  } else if (action === 'createMode') {
    const data = await get(['modes']);
    const modes = data.modes || [];
    const colors = ['blue', 'emerald', 'orange', 'purple', 'rose', 'amber', 'teal', 'magenta'];
    const assignedColor = colors[modes.length % colors.length];
    const mode = { id: 'mode_' + Date.now(), name: msg.name, builtin: false, domains: [], color: assignedColor };
    modes.push(mode);
    await set({ modes });
    reply({ ok: true, mode, modes });

  } else if (action === 'deleteMode') {
    const data = await get(['modes', 'activeModeId']);
    let modes = (data.modes || []).filter(m => m.id !== msg.modeId);
    const upd = { modes };
    if (data.activeModeId === msg.modeId) upd.activeModeId = null;
    await set(upd);
    await updateTracker();
    reply({ ok: true, modes });

  } else if (action === 'renameMode') {
    const data = await get(['modes']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === msg.modeId);
    if (idx !== -1) { modes[idx].name = msg.name; await set({ modes }); }
    reply({ ok: true });

  } else if (action === 'setModeDomains') {
    const data = await get(['modes']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === msg.modeId);
    if (idx === -1) { reply({ ok: false }); return; }
    modes[idx].domains = (msg.domains || []).map(d =>
      typeof d === 'string' ? { domain: d, limitMinutes: null } : d
    );
    await set({ modes });
    await updateTracker();
    reply({ ok: true });

  } else if (action === 'addDomain') {
    const domain = normalizeDomain(msg.domain);
    if (!domain) { reply({ ok: false, error: 'Invalid domain' }); return; }
    const data = await get(['modes', 'activeModeId']);
    const modes = data.modes || [];
    const idx = modes.findIndex(m => m.id === data.activeModeId);
    if (idx === -1) { reply({ ok: false, error: 'No active mode' }); return; }
    const alreadyExists = modes[idx].domains.some(e =>
      (typeof e === 'string' ? e : e.domain) === domain
    );
    if (!alreadyExists) modes[idx].domains.push({ domain, limitMinutes: null });
    await set({ modes });
    await updateTracker();
    reply({ ok: true, domain, mode: modes[idx] });

  } else if (action === 'setGlobalSchedule') {
    const upd = { scheduleEnabled: msg.enabled, globalSchedule: msg.globalSchedule || {} };
    if (msg.enabled) {
      upd.activeModeId = null;
    }
    await set(upd);
    await updateTracker();
    reply({ ok: true });

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
        color: 'blue',
        domains: [
          { domain: 'facebook.com',  limitMinutes: null },
          { domain: 'instagram.com', limitMinutes: null },
          { domain: 'twitter.com',   limitMinutes: null },
          { domain: 'x.com',         limitMinutes: null },
          { domain: 'tiktok.com',    limitMinutes: null },
          { domain: 'reddit.com',    limitMinutes: null },
          { domain: 'youtube.com',   limitMinutes: null },
          { domain: 'snapchat.com',  limitMinutes: null },
          { domain: 'pinterest.com', limitMinutes: null },
          { domain: 'tumblr.com',    limitMinutes: null },
          { domain: 'twitch.tv',     limitMinutes: null }
        ]
      }],
      activeModeId: null,
      globalSchedule: {},
      scheduleEnabled: false,
      tempUnblocks: {}, siteTimers: {}
    });
  }
});
