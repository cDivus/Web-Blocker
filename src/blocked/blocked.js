import { parseUrl, DEFAULT_QUOTES, sanitizeCustomHtml } from '../common/utils.js';

// Apply theme immediately on script load
chrome.storage.local.get('theme', (data) => {
  document.documentElement.setAttribute('data-theme', data.theme || 'teal');
});

// Live theme listener
chrome.storage.onChanged.addListener((changes) => {
  if (changes.theme) {
    document.documentElement.setAttribute('data-theme', changes.theme.newValue || 'teal');
  }
});

// Parse blocked URL from query string
const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get('blocked') || '';
const blockedDomain = blockedUrl ? parseUrl(blockedUrl)?.hostname || blockedUrl : '';

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

// Load custom block page message or custom ZIP/HTML template
chrome.storage.local.get(['blockPageContent', 'blockPageType', 'customBlockHtml', 'customBlockAssets', 'blockPageUseQuotes', 'blockPageQuotes'], (data) => {
  document.title = `Blocked — ${blockedDomain || 'Web Blocker'}`;

  if (data.blockPageType === 'custom' && data.customBlockHtml) {
    try {
      const compiled = sanitizeCustomHtml(data.customBlockHtml, data.customBlockAssets || {});
      const iframe = document.getElementById('custom-frame');
      if (iframe && compiled) {
        iframe.srcdoc = compiled;
        iframe.style.display = 'block';
        return;
      }
    } catch (err) {
      console.error('Failed to load custom block page:', err);
    }
  }

  // Fallback to default message-based blocker
  if (data.blockPageUseQuotes) {
    const quotes = data.blockPageQuotes || DEFAULT_QUOTES;
    const rand = quotes[Math.floor(Math.random() * quotes.length)];
    const el = document.getElementById('block-message');
    if (el) {
      el.textContent = '';
      const quoteSpan = document.createElement('span');
      quoteSpan.style.fontSize = '1.35rem';
      quoteSpan.style.fontStyle = 'italic';
      quoteSpan.style.fontWeight = '400';
      quoteSpan.style.display = 'block';
      quoteSpan.style.marginBottom = '8px';
      quoteSpan.textContent = `“${rand.text}”`;

      const authorSpan = document.createElement('span');
      authorSpan.style.fontSize = '0.8rem';
      authorSpan.style.fontWeight = '700';
      authorSpan.style.textTransform = 'uppercase';
      authorSpan.style.letterSpacing = '0.05em';
      authorSpan.style.color = 'var(--text-secondary)';
      authorSpan.style.display = 'block';
      authorSpan.style.opacity = '0.8';
      authorSpan.textContent = `— ${rand.author}`;

      el.appendChild(quoteSpan);
      el.appendChild(authorSpan);
    }
  } else {
    const msg = (data.blockPageContent || '').trim();
    if (msg) {
      const el = document.getElementById('block-message');
      if (el) el.textContent = msg;
    }
  }
});
