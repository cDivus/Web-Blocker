/**
 * Strips leading protocols (http://, https://) and www. prefix.
 */
export function stripProtocolAndWww(str) {
  if (!str) return '';
  return str.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

/**
 * Normalizes a domain input. Handles optional allowlist '!' prefix.
 * Removes 'www.' prefix and protocols.
 */
export function normalizeDomain(input) {
  let trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  const isAllowlist = trimmed.startsWith('!');
  if (isAllowlist) {
    trimmed = trimmed.slice(1).trim();
  }
  if (!trimmed) return '';

  const cleaned = stripProtocolAndWww(trimmed);
  return isAllowlist ? '!' + cleaned : cleaned;
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
