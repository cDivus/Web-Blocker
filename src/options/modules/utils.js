import { parseLine } from '../../common/utils.js';

export { parseLine };

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
