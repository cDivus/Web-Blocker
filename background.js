import {
  getLocalDateString,
  parseUrl,
  entryMatches,
  findMatchingEntry
} from './src/common/utils.js';

// ===== TIMER HELPERS =====
const TODAY_KEY = () => getLocalDateString(); // 'YYYY-MM-DD'

async function getTimerUsage(domain) {
  const data = await get(['siteTimers']);
  const timers = data.siteTimers || {};
  const rec = timers[domain];
  if (!rec || rec.date !== TODAY_KEY()) return 0;
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
const get = keys => chrome.storage.local.get(keys);
const set = data => chrome.storage.local.set(data);

// ===== SIMPLE SCHEDULE HELPER =====
function isScheduleActive(schedule) {
  if (!schedule || !schedule.enabled) return true;
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  const isWeekend = (day === 0 || day === 6);
  const isWeekday = !isWeekend;

  if (schedule.days === 'weekdays' && isWeekend) return false;
  if (schedule.days === 'weekends' && isWeekday) return false;

  const currentMins = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = (schedule.start || '09:00').split(':').map(Number);
  const [endH, endM] = (schedule.end || '17:00').split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins <= endMins;
  } else {
    return currentMins >= startMins || currentMins <= endMins;
  }
}

// ===== BLOCKING LOGIC =====
async function shouldBlock(url) {
  const data = await get([
    'enabled', 'blocklist', 'perpetualBlock', 'perpetualEnabled', 'tempUnblocks', 'schedule'
  ]);

  if (data.enabled === false) return false;

  const urlObj = parseUrl(url);
  if (!urlObj) return false;

  const now = Date.now();
  const tmp = data.tempUnblocks || {};

  if ((tmp[urlObj.hostname] && tmp[urlObj.hostname] > now) || (tmp[urlObj.fullUrl] && tmp[urlObj.fullUrl] > now)) {
    return false;
  }

  // 1. CHECK PERPETUAL BLOCK (24/7 - Bypasses Schedule Always)
  const perpetualBlock = data.perpetualBlock || [];
  if (perpetualBlock.length > 0) {
    const hasPerpetualAllowlist = perpetualBlock.some(e => {
      const d = (typeof e === 'string') ? e : e.domain;
      if (!d || !d.startsWith('!')) return false;
      return entryMatches(urlObj, d);
    });

    if (!hasPerpetualAllowlist) {
      const matchedPerpetual = findMatchingEntry(urlObj, perpetualBlock);
      if (matchedPerpetual) {
        const entry = typeof matchedPerpetual === 'string' ? { domain: matchedPerpetual, limitMinutes: null } : matchedPerpetual;
        if (entry.limitMinutes != null) {
          const usedMs = await getTimerUsage(entry.domain);
          if (usedMs >= entry.limitMinutes * 60 * 1000) return true;
        } else {
          return true; // Permanently blocked 24/7!
        }
      }
    }
  }

  // 2. CHECK SCHEDULED BLOCKLIST (Subject to Schedule Window)
  if (!isScheduleActive(data.schedule)) return false;

  const blocklist = data.blocklist || [];
  if (!blocklist.length) return false;

  const hasAllowlistMatch = blocklist.some(e => {
    const d = (typeof e === 'string') ? e : e.domain;
    if (!d || !d.startsWith('!')) return false;
    return entryMatches(urlObj, d);
  });

  if (hasAllowlistMatch) return false;

  const matchedEntry = findMatchingEntry(urlObj, blocklist);
  if (!matchedEntry) return false;

  const entry = typeof matchedEntry === 'string'
    ? { domain: matchedEntry, limitMinutes: null }
    : matchedEntry;

  if (entry.limitMinutes != null) {
    const usedMs = await getTimerUsage(entry.domain);
    const limitMs = entry.limitMinutes * 60 * 1000;
    if (usedMs >= limitMs) return true;
    return false;
  }

  return true;
}

// ===== NAVIGATION =====
chrome.webNavigation.onBeforeNavigate.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  if (!url || /^(chrome|chrome-extension|moz-extension|about|edge):/.test(url)) return;

  if (await shouldBlock(url)) {
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL('src/blocked/blocked.html') + '?blocked=' + encodeURIComponent(url) });
  }
});

let lastPopupActiveTime = 0;

// ===== REAL-TIME TIMER TRACKING =====
let _trackerLock = Promise.resolve();
function updateTracker() {
  _trackerLock = _trackerLock.then(() => _updateTrackerImpl()).catch(() => {});
  return _trackerLock;
}

async function _updateTrackerImpl() {
  const lastWin = await new Promise(resolve => {
    chrome.windows.getLastFocused({ populate: false }, (w) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(w);
    });
  });

  let win = lastWin;
  let isBrowserFocused = lastWin && lastWin.focused;

  if (Date.now() - lastPopupActiveTime < 2500) {
    isBrowserFocused = true;
  }

  if (isBrowserFocused && (!win || win.type !== 'normal')) {
    const normalWin = await new Promise(resolve => {
      chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (w) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(w);
      });
    });
    if (normalWin) {
      win = normalWin;
    }
  }

  const [activeTab] = await new Promise(resolve => {
    chrome.tabs.query({ active: true, windowId: win ? win.id : undefined }, (tabs) => {
      if (chrome.runtime.lastError) resolve([]);
      else resolve(tabs || []);
    });
  });

  const data = await get(['currentTracker', 'blocklist', 'perpetualBlock', 'enabled', 'schedule']);

  const tracker = data.currentTracker || null;
  const isEnabled = data.enabled !== false;
  const isScheduleOn = isScheduleActive(data.schedule);

  const blocklist = isScheduleOn ? (data.blocklist || []) : [];
  const perpetualBlock = data.perpetualBlock || [];
  const combinedLists = [...perpetualBlock, ...blocklist];

  let activeDomain = null;
  let activeTabId = null;
  let limitMinutes = null;
  let activeTabUrl = null;

  if (isEnabled && isBrowserFocused && activeTab && activeTab.url && !/^(chrome|chrome-extension|moz-extension|about|edge):/.test(activeTab.url)) {
    const urlObj = parseUrl(activeTab.url);
    if (urlObj) {
      const isAllowed = combinedLists.some(e => {
        const d = (typeof e === 'string') ? e : e.domain;
        if (!d || !d.startsWith('!')) return false;
        return entryMatches(urlObj, d);
      });

      if (!isAllowed) {
        const matched = findMatchingEntry(urlObj, combinedLists);
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

  if (tracker && tracker.tabId === activeTabId && tracker.domain === activeDomain) {
    const usedMs = await getTimerUsage(tracker.domain);
    const elapsed = now - tracker.startMs;
    const totalUsedMs = usedMs + elapsed;
    const limitMs = limitMinutes * 60 * 1000;

    if (totalUsedMs >= limitMs) {
      await recordTrackerExit(tracker);
      chrome.tabs.update(tracker.tabId, { url: chrome.runtime.getURL('src/blocked/blocked.html') + '?blocked=' + encodeURIComponent(activeTabUrl) });
    } else {
      const remainingTimeMs = limitMs - totalUsedMs;
      await chrome.alarms.create('block_active_tab', { when: now + remainingTimeMs });
    }
    return;
  }

  if (tracker) {
    await recordTrackerExit(tracker);
  }

  if (activeDomain) {
    const usedMs = await getTimerUsage(activeDomain);
    const limitMs = limitMinutes * 60 * 1000;

    if (usedMs >= limitMs) {
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
chrome.tabs.onRemoved.addListener((tabId) => {
  _trackerLock = _trackerLock.then(async () => {
    const data = await get(['currentTracker']);
    if (data.currentTracker && data.currentTracker.tabId === tabId) {
      await recordTrackerExit(data.currentTracker);
    }
  }).catch(() => {});
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
  handle(msg).then(reply).catch(err => {
    console.error('Error handling message:', err);
    reply({ ok: false, error: err.message });
  });
  return true;
});

async function checkAndRedirectBlockedTabs() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.url && await shouldBlock(t.url)) {
      chrome.tabs.update(t.id, { url: chrome.runtime.getURL('src/blocked/blocked.html') + '?blocked=' + encodeURIComponent(t.url) });
    }
  }
}

async function handle(msg) {
  const { action } = msg;

  if (action === 'getState') {
    const data = await get([
      'enabled', 'blocklist', 'perpetualBlock', 'perpetualEnabled', 'schedule', 'tempUnblocks',
      'blockPageContent', 'password', 'blockPageType',
      'customBlockHtml', 'customBlockAssets', 'customBlockName',
      'blockPageUseQuotes', 'blockPageQuotes'
    ]);
    return {
      ...data,
      enabled: data.enabled !== false,
      blocklist: data.blocklist || [],
      perpetualBlock: data.perpetualBlock || [],
      perpetualEnabled: data.perpetualEnabled === true,
      schedule: data.schedule || { enabled: false, start: '09:00', end: '17:00', days: 'weekdays' }
    };

  } else if (action === 'getTimers') {
    lastPopupActiveTime = Date.now();
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
    return { siteTimers: timers };

  } else if (action === 'saveBlocklist') {
    const blocklist = (msg.domains || []).map(d =>
      typeof d === 'string' ? { domain: d, limitMinutes: null } : d
    );
    await set({ blocklist });
    await updateTracker();
    await checkAndRedirectBlockedTabs();
    return { ok: true, blocklist };

  } else if (action === 'savePerpetualBlock') {
    const perpetualBlock = (msg.domains || []).map(d =>
      typeof d === 'string' ? { domain: d, limitMinutes: null } : d
    );
    await set({ perpetualBlock });
    await updateTracker();
    await checkAndRedirectBlockedTabs();
    return { ok: true, perpetualBlock };

  } else if (action === 'savePerpetualEnabled') {
    const perpetualEnabled = !!msg.enabled;
    await set({ perpetualEnabled });
    await updateTracker();
    await checkAndRedirectBlockedTabs();
    return { ok: true, perpetualEnabled };

  } else if (action === 'setSchedule') {
    await set({ schedule: msg.schedule });
    await updateTracker();
    await checkAndRedirectBlockedTabs();
    return { ok: true };

  } else if (action === 'setPassword') {
    await set({ password: msg.password || '' });
    return { ok: true };

  } else if (action === 'addDomain') {
    const domain = msg.domain;
    if (!domain) { return { ok: false, error: 'Invalid domain' }; }
    const targetListKey = msg.isPerpetual ? 'perpetualBlock' : 'blocklist';
    const data = await get([targetListKey]);
    const list = data[targetListKey] || [];
    const alreadyExists = list.some(e =>
      (typeof e === 'string' ? e : e.domain) === domain
    );
    if (!alreadyExists) {
      list.push({ domain, limitMinutes: null });
      await set({ [targetListKey]: list });
      await updateTracker();
      await checkAndRedirectBlockedTabs();
    }
    return { ok: true, domain, [targetListKey]: list };

  } else if (action === 'saveBlockPage') {
    if (msg.type === 'custom') {
      await set({
        blockPageType: 'custom',
        customBlockHtml: msg.html,
        customBlockAssets: msg.assets,
        customBlockName: msg.name
      });
    } else {
      await set({
        blockPageType: 'default',
        blockPageContent: msg.content,
        blockPageUseQuotes: msg.useQuotes || false
      });
    }
    return { ok: true };

  } else if (action === 'saveBlockPageQuotes') {
    await set({ blockPageQuotes: msg.quotes });
    return { ok: true };

  } else if (action === 'getCurrentTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { url: tab ? tab.url : null };
  }
}

// ===== INIT =====
chrome.runtime.onInstalled.addListener(async () => {
  const data = await get(['blocklist']);
  if (!data.blocklist) {
    await set({
      enabled: true,
      blocklist: [],
      perpetualBlock: [],
      perpetualEnabled: false,
      schedule: { enabled: false, start: '09:00', end: '17:00', days: 'weekdays' },
      tempUnblocks: {},
      siteTimers: {}
    });
  }
});
