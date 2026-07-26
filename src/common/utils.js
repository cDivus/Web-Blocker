/**
 * Parses a raw URL into structured components for pattern matching.
 * Handles the stripping of protocols, www. prefix, and trailing slashes internally.
 */
export function parseUrl(url) {
  if (!url) return null;
  let trimmed = url.trim().toLowerCase();
  if (!trimmed || /^(chrome|chrome-extension|moz-extension|about|edge):/.test(trimmed)) return null;

  const strip = (str) => str.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

  try {
    const urlToParse = trimmed.includes('://') ? trimmed : 'http://' + trimmed;
    const parsed = new URL(urlToParse);
    const hostname = strip(parsed.hostname);
    const pathname = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();
    const fullUrl = strip(hostname + pathname + search);
    return { fullUrl, hostname, pathname };
  } catch {
    const cleaned = strip(trimmed);
    return { fullUrl: cleaned, hostname: cleaned.split('/')[0], pathname: '' };
  }
}

/**
 * Parses any rule input or line into structured rule properties.
 * Handles comment stripping (#), allowlist prefix (!), time limit (; mins),
 * comma-separated sub-patterns, and domain cleaning via parseUrl.
 */
export function parseLine(input) {
  if (!input || !input.trim()) {
    return { domain: '', limitMinutes: null, patterns: [], isAllowlist: false, isBlank: true, rawLine: input || '' };
  }

  let cleanLine = input.trim();
  const hashIdx = cleanLine.indexOf('#');
  if (hashIdx !== -1) {
    cleanLine = cleanLine.slice(0, hashIdx).trim();
  }

  if (!cleanLine) {
    return { domain: '', limitMinutes: null, patterns: [], isAllowlist: false, isBlank: true, isComment: true, rawLine: input };
  }

  const isAllowlist = cleanLine.startsWith('!');
  if (isAllowlist) {
    cleanLine = cleanLine.slice(1).trim();
  }
  if (!cleanLine) {
    return { error: `Invalid empty entry: "${input.trim()}"`, domain: '', limitMinutes: null, patterns: [], isAllowlist, rawLine: input };
  }

  const parts = cleanLine.split(';');
  if (parts.length > 2) {
    return { error: `Too many semicolons: "${input.trim()}"`, domain: '', limitMinutes: null, patterns: [], isAllowlist, rawLine: input };
  }

  const rawPatterns = parts[0].split(',').map(s => s.trim()).filter(Boolean);
  if (rawPatterns.length === 0) {
    return { error: `Invalid empty entry: "${parts[0]}"`, domain: '', limitMinutes: null, patterns: [], isAllowlist, rawLine: input };
  }

  const patterns = [];
  for (const item of rawPatterns) {
    if (item.startsWith('.')) {
      patterns.push(item.toLowerCase());
    } else {
      const parsed = parseUrl(item);
      const cleaned = parsed ? parsed.fullUrl : item.toLowerCase();
      if (!cleaned) return { error: `Invalid entry: "${item}"`, domain: '', limitMinutes: null, patterns: [], isAllowlist, rawLine: input };
      patterns.push(cleaned);
    }
  }

  let limitMinutes = null;
  if (parts.length === 2) {
    const minStr = parts[1].trim();
    if (minStr === '') {
      return { error: `Missing minutes after semicolon: "${input.trim()}"`, domain: '', limitMinutes: null, patterns: [], isAllowlist, rawLine: input };
    }
    const mins = Number(minStr);
    if (!Number.isInteger(mins) || mins <= 0) {
      return { error: `Minutes must be a positive integer, got: "${minStr}"`, domain: '', limitMinutes: null, patterns: [], isAllowlist, rawLine: input };
    }
    limitMinutes = mins;
  }

  const formattedDomain = (isAllowlist ? '!' : '') + patterns.join(', ');
  return {
    domain: formattedDomain,
    limitMinutes,
    patterns,
    isAllowlist,
    isBlank: false,
    isComment: false,
    rawLine: input
  };
}

/**
 * Checks if a URL matches a rule string (domain, path, keyword, comma-separated list, or allowlist).
 */
export function entryMatches(urlObj, entryDomain) {
  if (!urlObj || !entryDomain) return false;
  const target = typeof urlObj === 'string' ? parseUrl(urlObj) : urlObj;
  if (!target) return false;

  const rule = parseLine(entryDomain);
  if (!rule || rule.error || !rule.patterns.length) return false;

  return rule.patterns.some(pattern => {
    if (pattern.startsWith('.')) {
      return target.hostname.endsWith(pattern) ||
             target.pathname.endsWith(pattern) ||
             target.fullUrl.endsWith(pattern);
    }
    if (pattern.includes('/')) {
      const cleanEntry = pattern.replace(/\/+$/, '');
      return target.fullUrl.includes(cleanEntry) || target.fullUrl.startsWith(cleanEntry);
    }
    if (pattern.includes('.')) {
      return target.hostname === pattern ||
             target.hostname.endsWith('.' + pattern) ||
             target.fullUrl.startsWith(pattern);
    }
    return target.fullUrl.includes(pattern);
  });
}

/**
 * Returns the matching domain entry object or string from a domain list, or null.
 */
export function findMatchingEntry(urlObj, entries) {
  const target = typeof urlObj === 'string' ? parseUrl(urlObj) : urlObj;
  if (!target) return null;
  return (entries || []).find(e => {
    const d = (typeof e === 'string') ? e : e.domain;
    if (!d || d.startsWith('!')) return false;
    return entryMatches(target, d);
  }) || null;
}

/**
 * Returns the current date in local time zone as a YYYY-MM-DD string.
 * This ensures daily resets happen at local midnight instead of UTC midnight.
 */
export function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the currently active mode based on state and schedule.
 * Works with both manual activation and schedule-based activation.
 */
export function getActiveMode(data, timestamp = Date.now()) {
  if (data.enabled === false) return null;

  const modes = data.modes || [];

  if (data.scheduleEnabled) {
    const globalSchedule = data.globalSchedule || {};
    const d = new Date(timestamp);
    const key = `${d.getDay()}-${d.getHours()}`;
    const scheduledModeId = globalSchedule[key];
    if (scheduledModeId) {
      return modes.find(m => m.id === scheduledModeId) || null;
    }
    return null;
  }

  if (data.activeModeId) {
    return modes.find(m => m.id === data.activeModeId) || null;
  }
  return null;
}

export const DEFAULT_QUOTES = [
  { text: "Deep work is not a chore. It is a highly satisfying flow state.", author: "Cal Newport" },
  { text: "Distractions are temporary escapes. Your ambitions are permanent.", author: "Unknown" },
  { text: "Only in quiet waters can things reflect undistorted. Only in a quiet mind is adequate perception of the world.", author: "Hans Margolius" },
  { text: "You will never reach your destination if you stop to throw stones at every dog that barks.", author: "Winston Churchill" },
  { text: "If you commit to nothing, you’ll be distracted by everything.", author: "James Clear" },
  { text: "Distraction is the only thing that stands between you and your goals.", author: "Unknown" },
  { text: "It is not that we have so little time but that we lose so much. The life we receive is not short but we make it so.", author: "Seneca" },
  { text: "The shorter way to do many things is to only do one thing at a time.", author: "Samuel Smiles" },
  { text: "Time is what we want most, but what we use worst.", author: "William Penn" },
  { text: "You have power over your mind—not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { text: "Freedom is secured not by the fulfilling of men's desires, but by the removal of desire.", author: "Epictetus" }
];

/**
 * Counts total sites and timed sites for a domain entry list.
 */
export function countDomainEntries(domains = []) {
  let sites = 0;
  let timed = 0;
  domains.forEach(e => {
    if (e && e.domain) {
      const count = e.domain.split(',').filter(Boolean).length;
      sites += count;
      if (e.limitMinutes != null) timed += count;
    }
  });
  const label = `${sites} site${sites !== 1 ? 's' : ''}${timed > 0 ? ` · ${timed} timed` : ''}`;
  return { sites, timed, label };
}

/**
 * Compiles and sanitizes custom block page HTML for security.
 */
export function sanitizeCustomHtml(html, assets = {}) {
  if (!html) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const resolveAsset = (relPath) => {
    const cleanPath = relPath.replace(/^\.\//, '');
    return assets[cleanPath] || relPath;
  };

  doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const href = el.getAttribute('href');
    if (href) {
      const resolved = resolveAsset(href);
      if (resolved !== href) el.setAttribute('href', resolved);
    }
  });

  doc.querySelectorAll('img').forEach(el => {
    const src = el.getAttribute('src');
    if (src) {
      const resolved = resolveAsset(src);
      if (resolved !== src) el.setAttribute('src', resolved);
    }
  });

  // Strip scripts strictly for security
  doc.querySelectorAll('script').forEach(tag => tag.remove());

  // Strip inline event handlers and javascript: URIs
  doc.querySelectorAll('*').forEach(el => {
    for (let i = el.attributes.length - 1; i >= 0; i--) {
      const attrName = el.attributes[i].name.toLowerCase();
      if (attrName.startsWith('on')) {
        el.removeAttribute(el.attributes[i].name);
      }
    }
    const href = el.getAttribute('href');
    if (href && href.trim().toLowerCase().startsWith('javascript:')) {
      el.removeAttribute('href');
    }
    const src = el.getAttribute('src');
    if (src && src.trim().toLowerCase().startsWith('javascript:')) {
      el.removeAttribute('src');
    }
  });

  return doc.documentElement.outerHTML;
}
