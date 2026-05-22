
function normalizeDomain(input) {
  try {
    let url = input.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return input.trim().toLowerCase().replace(/^www\./, '');
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
