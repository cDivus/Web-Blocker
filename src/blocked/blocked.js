
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

function compileCustomBlockPage(html, assets) {
  if (!html) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Helper to resolve relative path references
  function resolveAsset(ref) {
    if (!ref || ref.startsWith('data:') || ref.startsWith('http:') || ref.startsWith('https:')) {
      return ref;
    }
    // Clean leading ./ or /
    const cleanRef = ref.replace(/^\.\//, '').replace(/^\//, '').toLowerCase();
    
    // Look for exact match
    for (let key in assets) {
      if (key.toLowerCase() === cleanRef) {
        return assets[key];
      }
    }

    // Try finding key ending with cleanRef
    for (let key in assets) {
      if (key.toLowerCase().endsWith(cleanRef)) {
        return assets[key];
      }
    }
    return ref;
  }

  // Rewrite stylesheet links
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const href = el.getAttribute('href');
    if (href) {
      const resolved = resolveAsset(href);
      if (resolved !== href) el.setAttribute('href', resolved);
    }
  });

  // Rewrite images
  doc.querySelectorAll('img').forEach(el => {
    const src = el.getAttribute('src');
    if (src) {
      const resolved = resolveAsset(src);
      if (resolved !== src) el.setAttribute('src', resolved);
    }
  });

  // Strip scripts strictly for security
  doc.querySelectorAll('script').forEach(tag => tag.remove());
  
  // Defense-in-depth: strip inline event handlers and javascript: protocol URIs on all elements
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

  // Safe serialization
  return doc.documentElement.outerHTML;
}

// Load custom block page message or custom ZIP/HTML template
chrome.storage.local.get(['blockPageContent', 'blockPageType', 'customBlockHtml', 'customBlockAssets'], (data) => {
  document.title = `Blocked — ${blockedDomain || 'Web Blocker'}`;

  if (data.blockPageType === 'custom' && data.customBlockHtml) {
    try {
      const compiled = compileCustomBlockPage(data.customBlockHtml, data.customBlockAssets || {});
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
  const msg = (data.blockPageContent || '').trim();
  if (msg) {
    document.getElementById('block-message').textContent = msg;
  }
});
