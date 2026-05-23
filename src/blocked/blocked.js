
function normalizeDomain(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.includes(' ')) return ''; // Spaces are never allowed in domains or keywords!
  if (!trimmed.includes('.')) return trimmed;
  try {
    let url = trimmed;
    if (!url.startsWith('http')) url = 'https://' + url;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '');
  }
}

// Parse blocked URL from query string
const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get('blocked') || '';
const blockedDomain = blockedUrl ? normalizeDomain(blockedUrl) : '';

// Show the blocked URL
if (blockedUrl) {
  try {
    const parsed = new URL(blockedUrl);
    document.getElementById('blocked-url').textContent = parsed.hostname + parsed.pathname.slice(0, 40) + (parsed.pathname.length > 40 ? '…' : '');
  } catch {
    document.getElementById('blocked-url').textContent = blockedUrl.slice(0, 60);
  }
} else {
  document.getElementById('blocked-url').style.display = 'none';
}

// Load custom block page message
chrome.storage.local.get(['blockPageContent'], (data) => {
  const msg = (data.blockPageContent || '').trim();
  if (msg) {
    document.getElementById('block-message').textContent = msg;
  }
  document.title = `Blocked — ${blockedDomain || 'Web Blocker'}`;
});
