import { normalizeDomain } from '../../common/utils.js';

export { normalizeDomain };

/**
 * Parse a single textarea line into { domain, limitMinutes, rawLine } or error object.
 */
export function parseLine(line) {
  if (!line || !line.trim()) {
    return { domain: '', limitMinutes: null, isBlank: true, rawLine: line };
  }

  // Strip comment starting with #
  let cleanLine = line;
  const hashIdx = line.indexOf('#');
  if (hashIdx !== -1) {
    cleanLine = line.slice(0, hashIdx);
  }

  if (!cleanLine.trim()) {
    return { domain: '', limitMinutes: null, isBlank: true, isComment: true, rawLine: line };
  }

  const parts = cleanLine.split(';');
  if (parts.length > 2) return { error: `Too many semicolons: "${line.trim()}"` };

  const rawDomains = parts[0].split(',').map(s => s.trim()).filter(Boolean);
  if (rawDomains.length === 0) return { error: `Invalid empty entry: "${parts[0]}"` };

  const normalizedItems = [];
  for (const item of rawDomains) {
    const norm = normalizeDomain(item);
    if (!norm) return { error: `Invalid entry: "${item}"` };
    normalizedItems.push(norm);
  }
  const domainPattern = normalizedItems.join(', ');

  if (parts.length === 1) {
    return { domain: domainPattern, limitMinutes: null, rawLine: line };
  }

  const minStr = parts[1].trim();
  if (minStr === '') return { error: `Missing minutes after semicolon: "${line.trim()}"` };
  const mins = Number(minStr);
  if (!Number.isInteger(mins) || mins <= 0) {
    return { error: `Minutes must be a positive integer, got: "${minStr}"` };
  }
  return { domain: domainPattern, limitMinutes: mins, rawLine: line };
}

/**
 * Serialize entries back into textarea text, preserving exact raw lines / newlines.
 */
export function serializeEntries(entries) {
  return (entries || []).map(e => {
    if (e.rawLine != null) return e.rawLine;
    if (e.limitMinutes != null) return `${e.domain}; ${e.limitMinutes}`;
    return e.domain || '';
  }).join('\n');
}

export function sendMsg(action, data = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action, ...data }, response => {
      const err = chrome.runtime.lastError;
      resolve(response);
    });
  });
}

// Assign persistent colors to modes
export function assignModeColors(modes) {
  const colors = ['blue', 'emerald', 'orange', 'purple', 'rose', 'amber', 'teal', 'magenta'];
  (modes || []).forEach((mode, index) => {
    if (!mode.color) {
      mode.color = colors[index % colors.length];
    }
  });
}

export function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'css': return 'text/css';
    case 'js': return 'application/javascript';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'woff': return 'font/woff';
    case 'woff2': return 'font/woff2';
    case 'ttf': return 'font/ttf';
    case 'otf': return 'font/otf';
    case 'html':
    case 'htm': return 'text/html';
    default: return 'application/octet-stream';
  }
}
