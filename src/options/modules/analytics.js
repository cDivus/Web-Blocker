// ===== ANALYTICS MODULE =====
import { sendMsg, getLocalDateString } from '../../common/utils.js';

export async function renderAnalytics() {
  const container = document.getElementById('analytics-content');
  if (!container) return;

  // Re-fetch fresh state so timer data is current
  const freshState = await sendMsg('getState') || {};
  const timerData = await sendMsg('getTimers') || {};
  const siteTimers = timerData.siteTimers || {};

  const blocklist = freshState.blocklist || [];

  // Only show entries that have a limitMinutes
  const timedEntries = blocklist.filter(e => e && e.limitMinutes != null);

  if (timedEntries.length === 0) {
    container.textContent = '';
    const p = document.createElement('p');
    p.className = 'analytics-empty';
    p.textContent = 'No timed sites in your Block List. Add entries in the format ';
    const code = document.createElement('code');
    code.textContent = 'domain; minutes';
    const endText = document.createTextNode(' to track daily usage (e.g. reddit.com; 30).');

    p.appendChild(code);
    p.appendChild(endText);
    container.appendChild(p);
    return;
  }

  const today = getLocalDateString();

  const fmt = ms => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Check if we can perform in-place update of existing cards to prevent hover flicker
  const existingCards = container.querySelectorAll('.analytics-card');

  let match = false;
  if (existingCards.length === timedEntries.length) {
    match = true;
    for (let i = 0; i < timedEntries.length; i++) {
      const card = existingCards[i];
      if (card.dataset.domain !== timedEntries[i].domain || card.dataset.limit !== String(timedEntries[i].limitMinutes)) {
        match = false;
        break;
      }
    }
  }

  if (match) {
    timedEntries.forEach((entry, i) => {
      const limitMs = entry.limitMinutes * 60 * 1000;
      const rec = siteTimers[entry.domain];
      const usedMs = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
      const remMs = Math.max(0, limitMs - usedMs);
      const pct = Math.min(100, Math.round((usedMs / limitMs) * 100));

      const statusClass = pct >= 100 ? 'timer-bar-full' : pct >= 75 ? 'timer-bar-warn' : '';

      const card = existingCards[i];
      const barFill = card.querySelector('.analytics-bar-fill');
      const usedSpan = card.querySelector('.analytics-used');
      const remainingSpan = card.querySelector('.analytics-remaining');

      if (barFill) {
        barFill.className = `analytics-bar-fill ${statusClass}`.trim();
        barFill.style.width = `${pct}%`;
      }
      if (usedSpan) {
        usedSpan.textContent = `Used: ${fmt(usedMs)}`;
      }
      if (remainingSpan) {
        if (pct >= 100) {
          remainingSpan.className = 'analytics-remaining analytics-exhausted';
          remainingSpan.textContent = 'Blocked';
        } else {
          remainingSpan.className = 'analytics-remaining';
          remainingSpan.textContent = `${fmt(remMs)} left`;
        }
      }
    });
    return;
  }

  container.textContent = '';

  timedEntries.forEach(entry => {
    const limitMs = entry.limitMinutes * 60 * 1000;
    const rec = siteTimers[entry.domain];
    const usedMs = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
    const remMs = Math.max(0, limitMs - usedMs);
    const pct = Math.min(100, Math.round((usedMs / limitMs) * 100));

    const statusClass = pct >= 100 ? 'timer-bar-full' : pct >= 75 ? 'timer-bar-warn' : '';

    const card = document.createElement('div');
    card.className = 'analytics-card';
    card.dataset.domain = entry.domain;
    card.dataset.limit = entry.limitMinutes;

    const header = document.createElement('div');
    header.className = 'analytics-card-header';

    const domainSpan = document.createElement('span');
    domainSpan.className = 'analytics-domain';
    domainSpan.textContent = entry.domain;

    const limitSpan = document.createElement('span');
    limitSpan.className = 'analytics-limit';
    limitSpan.textContent = `${entry.limitMinutes} min / day`;

    header.appendChild(domainSpan);
    header.appendChild(limitSpan);

    const barTrack = document.createElement('div');
    barTrack.className = 'analytics-bar-track';

    const barFill = document.createElement('div');
    barFill.className = `analytics-bar-fill ${statusClass}`.trim();
    barFill.style.width = `${pct}%`;
    barTrack.appendChild(barFill);

    const footer = document.createElement('div');
    footer.className = 'analytics-card-footer';

    const usedSpan = document.createElement('span');
    usedSpan.className = 'analytics-used';
    usedSpan.textContent = `Used: ${fmt(usedMs)}`;

    const remainingSpan = document.createElement('span');
    remainingSpan.className = 'analytics-remaining' + (pct >= 100 ? ' analytics-exhausted' : '');
    remainingSpan.textContent = pct >= 100 ? 'Blocked' : `${fmt(remMs)} left`;

    footer.appendChild(usedSpan);
    footer.appendChild(remainingSpan);

    card.appendChild(header);
    card.appendChild(barTrack);
    card.appendChild(footer);

    container.appendChild(card);
  });
}
