// ===== ANALYTICS MODULE =====
import { sendMsg } from './utils.js';

export async function renderAnalytics() {
  const container = document.getElementById('analytics-content');
  if (!container) return;

  // Re-fetch fresh state so timer data is current
  const freshState = await sendMsg('getState') || {};
  const timerData  = await sendMsg('getTimers') || {};
  const siteTimers = timerData.siteTimers || {};

  const activeModeId = freshState.activeModeId || null;
  const activeMode = (freshState.modes || []).find(m => m.id === activeModeId);

  // Only show entries that have a limitMinutes
  const timedEntries = activeMode
    ? (activeMode.domains || []).filter(e => e && e.limitMinutes != null)
    : [];

  if (!activeMode) {
    container.textContent = '';
    const p = document.createElement('p');
    p.className = 'analytics-empty';
    p.textContent = 'No active mode selected. Activate a mode from the Block List tab to see timer data.';
    container.appendChild(p);
    return;
  }

  if (timedEntries.length === 0) {
    container.textContent = '';
    const p = document.createElement('p');
    p.className = 'analytics-empty';
    p.textContent = 'No timed sites in the ';
    const strong = document.createElement('strong');
    strong.textContent = activeMode.name;
    const endText = document.createTextNode(' mode. Add entries in the format ');
    const code = document.createElement('code');
    code.textContent = 'domain; minutes';
    const endText2 = document.createTextNode(' to track daily usage.');
    
    p.appendChild(strong);
    p.appendChild(endText);
    p.appendChild(code);
    p.appendChild(endText2);
    container.appendChild(p);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  container.textContent = '';
  
  const modeLabel = document.createElement('div');
  modeLabel.className = 'analytics-mode-label';
  modeLabel.textContent = 'Active mode: ';
  const strongMode = document.createElement('strong');
  strongMode.textContent = activeMode.name;
  modeLabel.appendChild(strongMode);
  container.appendChild(modeLabel);

  const fmt = ms => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  timedEntries.forEach(entry => {
    const limitMs  = entry.limitMinutes * 60 * 1000;
    const rec      = siteTimers[entry.domain];
    const usedMs   = (rec && rec.date === today) ? (rec.usedMs || 0) : 0;
    const remMs    = Math.max(0, limitMs - usedMs);
    const pct      = Math.min(100, Math.round((usedMs / limitMs) * 100));

    const statusClass = pct >= 100 ? 'timer-bar-full' : pct >= 75 ? 'timer-bar-warn' : '';

    // Create .analytics-card
    const card = document.createElement('div');
    card.className = 'analytics-card';

    // Header
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

    // Bar track
    const barTrack = document.createElement('div');
    barTrack.className = 'analytics-bar-track';
    
    const barFill = document.createElement('div');
    barFill.className = `analytics-bar-fill ${statusClass}`.trim();
    barFill.style.width = `${pct}%`;
    barTrack.appendChild(barFill);

    // Footer
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
