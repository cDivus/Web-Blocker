// ===== UTILS & HELPERS =====

export function normalizeDomain(raw) {
  let trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  const isAllowlist = trimmed.startsWith('!');
  if (isAllowlist) {
    trimmed = trimmed.slice(1).trim();
  }
  if (trimmed.includes(' ')) return ''; // Spaces are never allowed in domains or keywords!
  if (!trimmed.includes('.')) return isAllowlist ? '!' + trimmed : trimmed; // keyword
  try {
    let url = trimmed;
    if (!url.startsWith('http')) url = 'https://' + url;
    const host = new URL(url).hostname.replace(/^www\./, '');
    return isAllowlist ? '!' + host : host;
  } catch {
    const host = trimmed.replace(/^www\./, '');
    return isAllowlist ? '!' + host : host;
  }
}

/**
 * Parse a single textarea line into { domain, limitMinutes } or null on error.
 */
export function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null; // blank — skip, not an error

  const parts = trimmed.split(';');
  if (parts.length > 2) return { error: `Too many semicolons: "${trimmed}"` };

  const rawDomains = parts[0].split(',').map(s => s.trim()).filter(Boolean);
  if (rawDomains.length === 0) return { error: `Invalid empty domains list: "${parts[0]}"` };

  const normalizedItems = [];
  for (const item of rawDomains) {
    const norm = normalizeDomain(item);
    if (!norm) return { error: `Invalid domain or keyword: "${item}"` };
    normalizedItems.push(norm);
  }
  const domainPattern = normalizedItems.join(', ');

  if (parts.length === 1) {
    return { domain: domainPattern, limitMinutes: null };
  }

  const minStr = parts[1].trim();
  if (minStr === '') return { error: `Missing minutes after semicolon: "${trimmed}"` };
  const mins = Number(minStr);
  if (!Number.isInteger(mins) || mins <= 0) {
    return { error: `Minutes must be a positive integer, got: "${minStr}"` };
  }
  return { domain: domainPattern, limitMinutes: mins };
}

/**
 * Serialize entries back into textarea text.
 */
export function serializeEntries(entries) {
  return (entries || []).map(e => {
    if (e.limitMinutes != null) return `${e.domain}; ${e.limitMinutes}`;
    return e.domain;
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
