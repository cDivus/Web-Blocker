// ===== UNIFIED BLOCKLIST MODULE =====
import { store } from './state.js';
import { sendMsg, serializeEntries, parseLine } from '../../common/utils.js';

export function renderBlocklist() {
  const hasPassword = !!store.state.password;
  const isUnlocked = !hasPassword || store.perpetualUnlocked === true;

  // 1. Scheduled Blocklist
  const textarea = document.getElementById('blocklist-textarea');
  if (textarea) {
    const blocklist = store.state.blocklist || [];
    const text = serializeEntries(blocklist);
    textarea.value = text;
    store.originalBlocklistText = text;
    updateBlocklistStats(text, 'textarea-error', 'blocklist-stats');
  }

  // 2. Perpetual Blocklist (24/7) Section Visibility (Hidden away until unlocked)
  const perpetualContainer = document.getElementById('perpetual-section-container');
  if (perpetualContainer) {
    perpetualContainer.style.display = isUnlocked ? 'block' : 'none';
  }

  // 3. Perpetual Settings Card in Other Settings
  const statusDesc = document.getElementById('perpetual-status-desc');
  const unlockContainer = document.getElementById('perpetual-unlock-container');
  const unlockedBadge = document.getElementById('perpetual-unlocked-badge');

  if (statusDesc && unlockContainer && unlockedBadge) {
    if (hasPassword) {
      if (isUnlocked) {
        statusDesc.textContent = 'Unlocked and visible on the Block List page.';
        unlockContainer.style.display = 'none';
        unlockedBadge.style.display = 'block';
      } else {
        statusDesc.textContent = 'Locked and hidden away for this session. Enter your password to reveal and edit perpetual blocks.';
        unlockContainer.style.display = 'block';
        unlockedBadge.style.display = 'none';
      }
    } else {
      statusDesc.textContent = 'Visible and active 24/7 on the Block List page.';
      unlockContainer.style.display = 'none';
      unlockedBadge.style.display = 'none';
    }
  }

  const perpetualTextarea = document.getElementById('perpetual-textarea');
  if (perpetualTextarea) {
    const perpetualBlock = store.state.perpetualBlock || [];
    const perpetualText = serializeEntries(perpetualBlock);
    perpetualTextarea.value = perpetualText;
    store.originalPerpetualText = perpetualText;
    updateBlocklistStats(perpetualText, 'perpetual-textarea-error', 'perpetual-stats');
  }
}

export function updateBlocklistStats(text, errorElId = 'textarea-error', statsElId = 'blocklist-stats') {
  const errorEl = document.getElementById(errorElId);
  const statsEl = document.getElementById(statsElId);

  const lines = text.split('\n');
  let totalRules = 0;
  let allowedCount = 0;
  let timedCount = 0;
  let errors = [];

  lines.forEach((line, index) => {
    const parsed = parseLine(line);
    if (parsed.error) {
      errors.push(`Line ${index + 1}: ${parsed.error}`);
    } else if (!parsed.isBlank && !parsed.isComment) {
      const subCount = parsed.patterns.length;
      totalRules += subCount;
      if (parsed.isAllowlist) allowedCount += subCount;
      if (parsed.limitMinutes != null) timedCount += subCount;
    }
  });

  if (errorEl) {
    if (errors.length > 0) {
      errorEl.textContent = errors.join('\n');
      errorEl.style.display = 'block';
    } else {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  if (statsEl) {
    statsEl.textContent = `${totalRules} site${totalRules !== 1 ? 's' : ''}` +
      (allowedCount > 0 ? ` · ${allowedCount} allowed` : '') +
      (timedCount > 0 ? ` · ${timedCount} timed` : '');
  }
}

function parseTextareaEntries(rawText) {
  const lines = rawText.split('\n');
  const entries = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed.error) {
      entries.push({ domain: line.trim(), limitMinutes: null, rawLine: line });
    } else if (parsed.isBlank || parsed.isComment) {
      entries.push({ domain: '', limitMinutes: null, rawLine: line });
    } else {
      entries.push({
        domain: parsed.domain,
        limitMinutes: parsed.limitMinutes,
        rawLine: line
      });
    }
  }

  return entries;
}

export async function saveBlocklistFromTextarea() {
  const textarea = document.getElementById('blocklist-textarea');
  if (textarea) {
    const rawText = textarea.value;
    if (rawText !== store.originalBlocklistText) {
      const entries = parseTextareaEntries(rawText);
      const res = await sendMsg('saveBlocklist', { domains: entries });
      if (res?.ok) {
        store.state.blocklist = res.blocklist || entries;
        store.originalBlocklistText = rawText;
      }
    }
  }

  const hasPassword = !!store.state.password;
  const isUnlocked = !hasPassword || store.perpetualUnlocked === true;
  const perpetualTextarea = document.getElementById('perpetual-textarea');

  if (isUnlocked && perpetualTextarea) {
    const rawPerpetualText = perpetualTextarea.value;
    if (rawPerpetualText !== store.originalPerpetualText) {
      const perpetualEntries = parseTextareaEntries(rawPerpetualText);
      const res = await sendMsg('savePerpetualBlock', { domains: perpetualEntries });
      if (res?.ok) {
        store.state.perpetualBlock = res.perpetualBlock || perpetualEntries;
        store.originalPerpetualText = rawPerpetualText;
      }
    }
  }
}

export function initBlocklistEvents() {
  const textarea = document.getElementById('blocklist-textarea');
  if (textarea) {
    textarea.addEventListener('input', () => {
      updateBlocklistStats(textarea.value, 'textarea-error', 'blocklist-stats');
    });
    textarea.addEventListener('blur', () => {
      saveBlocklistFromTextarea();
    });
  }

  const perpetualTextarea = document.getElementById('perpetual-textarea');
  if (perpetualTextarea) {
    perpetualTextarea.addEventListener('input', () => {
      updateBlocklistStats(perpetualTextarea.value, 'perpetual-textarea-error', 'perpetual-stats');
    });
    perpetualTextarea.addEventListener('blur', () => {
      saveBlocklistFromTextarea();
    });
  }

  // Password Unlock Handler for Perpetual Block Access
  const unlockBtn = document.getElementById('btn-unlock-perpetual');
  const pwdInput = document.getElementById('perpetual-password-input');
  const errorEl = document.getElementById('perpetual-unlock-error');

  const attemptUnlock = () => {
    if (!pwdInput) return;
    const entered = pwdInput.value.trim();
    if (entered === store.state.password) {
      store.perpetualUnlocked = true;
      if (errorEl) errorEl.style.display = 'none';
      pwdInput.value = '';
      renderBlocklist();
    } else {
      if (errorEl) {
        errorEl.textContent = 'Incorrect password.';
        errorEl.style.display = 'block';
      }
    }
  };

  if (unlockBtn) {
    unlockBtn.addEventListener('click', attemptUnlock);
  }
  if (pwdInput) {
    pwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attemptUnlock();
    });
  }
}
