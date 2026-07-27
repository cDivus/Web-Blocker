// ===== UNIFIED BLOCKLIST MODULE =====
import { store } from './state.js';
import { sendMsg, serializeEntries, parseLine } from '../../common/utils.js';

export function renderBlocklist() {
  // 1. Scheduled Blocklist
  const textarea = document.getElementById('blocklist-textarea');
  if (textarea) {
    const blocklist = store.state.blocklist || [];
    const text = serializeEntries(blocklist);
    textarea.value = text;
    store.originalBlocklistText = text;
    updateBlocklistStats(text, 'textarea-error', 'blocklist-stats');
  }

  // 2. Perpetual Blocklist (24/7) Checkbox & Section Visibility
  const isPerpetualEnabled = store.state.perpetualEnabled === true;
  const cbDanger = document.getElementById('perpetual-enabled-danger');
  if (cbDanger) cbDanger.checked = isPerpetualEnabled;

  const perpetualContainer = document.getElementById('perpetual-section-container');
  if (perpetualContainer) {
    perpetualContainer.style.display = isPerpetualEnabled ? 'block' : 'none';
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

  const perpetualTextarea = document.getElementById('perpetual-textarea');

  if (perpetualTextarea) {
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
  let blocklistTimer = null;
  let perpetualTimer = null;

  const textarea = document.getElementById('blocklist-textarea');
  if (textarea) {
    const scheduleUpdateAndSave = () => {
      clearTimeout(blocklistTimer);
      blocklistTimer = setTimeout(() => {
        updateBlocklistStats(textarea.value, 'textarea-error', 'blocklist-stats');
        saveBlocklistFromTextarea();
      }, 400);
    };

    textarea.addEventListener('input', scheduleUpdateAndSave);
    textarea.addEventListener('blur', scheduleUpdateAndSave);
  }

  const perpetualTextarea = document.getElementById('perpetual-textarea');
  if (perpetualTextarea) {
    const schedulePerpetualUpdateAndSave = () => {
      clearTimeout(perpetualTimer);
      perpetualTimer = setTimeout(() => {
        updateBlocklistStats(perpetualTextarea.value, 'perpetual-textarea-error', 'perpetual-stats');
        saveBlocklistFromTextarea();
      }, 400);
    };

    perpetualTextarea.addEventListener('input', schedulePerpetualUpdateAndSave);
    perpetualTextarea.addEventListener('blur', schedulePerpetualUpdateAndSave);
  }

  // Toggle Perpetual Block Enabled state
  const handlePerpetualToggle = async (e) => {
    const enabled = e.target.checked;
    store.state.perpetualEnabled = enabled;
    const cbDanger = document.getElementById('perpetual-enabled-danger');
    if (cbDanger) cbDanger.checked = enabled;

    const perpetualContainer = document.getElementById('perpetual-section-container');
    if (perpetualContainer) {
      perpetualContainer.style.display = enabled ? 'block' : 'none';
    }

    await sendMsg('savePerpetualEnabled', { enabled });
  };

  const cbDanger = document.getElementById('perpetual-enabled-danger');
  if (cbDanger) cbDanger.addEventListener('change', handlePerpetualToggle);
}
