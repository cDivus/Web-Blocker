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
  if (trimmed.includes(' ')) return ''; // Spaces are never allowed in domains or keywords!
  if (!trimmed.includes('.')) return isAllowlist ? '!' + trimmed : trimmed;
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
