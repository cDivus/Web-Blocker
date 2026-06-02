// ===== BLOCK PAGE MODULE =====
import { store } from './state.js';
import { sendMsg, getMimeType } from './utils.js';

export function renderBlockPage() {
  // Load original states
  store.originalBlockPageType = store.state.blockPageType || 'default';
  store.originalBlockPageText = store.state.blockPageContent || 'You blocked this site for a reason.';
  store.originalBlockPageUseQuotes = store.state.blockPageUseQuotes || false;
  store.originalCustomHtml = store.state.customBlockHtml || '';
  store.originalCustomAssets = store.state.customBlockAssets || {};
  store.originalCustomName = store.state.customBlockName || '';

  // Reset temp/current states
  store.currentBlockPageType = store.originalBlockPageType;
  store.tempCustomHtml = null;
  store.tempCustomAssets = null;
  store.tempCustomName = null;

  // Set default message inputs
  const textarea = document.getElementById('block-page-content');
  const preview = document.getElementById('preview-box');
  const checkbox = document.getElementById('block-page-use-quotes');

  if (checkbox) checkbox.checked = store.originalBlockPageUseQuotes;
  if (textarea) {
    textarea.value = store.originalBlockPageText;
    textarea.disabled = store.originalBlockPageUseQuotes;
  }
  if (preview) {
    preview.textContent = store.originalBlockPageUseQuotes ? '“Committing to nothing makes you distracted by everything.” — Quotes Option Active' : store.originalBlockPageText;
  }

  // Set custom file names
  const fileNameEl = document.getElementById('blockpage-file-name');
  if (fileNameEl) fileNameEl.textContent = store.originalCustomName || 'No file selected';

  // Render toggle button active styles
  updateBlockPageToggleButtons();

  // Show the correct container
  toggleBlockPageContainers();

  // Load custom preview iframe if it exists
  const container = document.getElementById('custom-preview-container');
  if (store.originalBlockPageType === 'custom' && store.originalCustomHtml && container) {
    try {
      renderCustomPreview(store.originalCustomHtml, store.originalCustomAssets);
    } catch (err) {
      console.error('Failed to load custom block page preview:', err);
    }
  } else if (container) {
    container.style.display = 'none';
  }

  // Clear file input
  const fileInput = document.getElementById('blockpage-file-input');
  if (fileInput) fileInput.value = '';
}

export function updateBlockPageToggleButtons() {
  const btnDefault = document.getElementById('btn-blockpage-type-default');
  const btnCustom = document.getElementById('btn-blockpage-type-custom');
  if (!btnDefault || !btnCustom) return;

  if (store.currentBlockPageType === 'custom') {
    btnDefault.className = 'btn btn-outline-theme';
    btnCustom.className = 'btn btn-active-toggle';
  } else {
    btnDefault.className = 'btn btn-active-toggle';
    btnCustom.className = 'btn btn-outline-theme';
  }
}

export function toggleBlockPageContainers() {
  const containerDefault = document.getElementById('blockpage-container-default');
  const containerCustom = document.getElementById('blockpage-container-custom');
  if (!containerDefault || !containerCustom) return;

  if (store.currentBlockPageType === 'custom') {
    containerDefault.style.display = 'none';
    containerCustom.style.display = 'block';
  } else {
    containerDefault.style.display = 'block';
    containerCustom.style.display = 'none';
  }
}

export async function saveBlockPageSettings() {
  if (store.currentBlockPageType === 'custom') {
    const html = store.tempCustomHtml !== null ? store.tempCustomHtml : store.originalCustomHtml;
    const assets = store.tempCustomAssets !== null ? store.tempCustomAssets : store.originalCustomAssets;
    const name = store.tempCustomName !== null ? store.tempCustomName : store.originalCustomName;

    if (!html) return; // Don't auto-save if custom block page isn't set up yet

    await sendMsg('saveBlockPage', {
      type: 'custom',
      html,
      assets,
      name
    });
    store.state.blockPageType = 'custom';
    store.state.customBlockHtml = html;
    store.state.customBlockAssets = assets;
    store.state.customBlockName = name;
  } else {
    const content = document.getElementById('block-page-content').value;
    const useQuotes = document.getElementById('block-page-use-quotes').checked;
    await sendMsg('saveBlockPage', {
      type: 'default',
      content,
      useQuotes
    });
    store.state.blockPageType = 'default';
    store.state.blockPageContent = content;
    store.state.blockPageUseQuotes = useQuotes;
  }
  renderBlockPage();
}

export function compileCustomBlockPage(html, assets) {
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

export function renderCustomPreview(html, assets) {
  const iframe = document.getElementById('custom-preview-iframe');
  const container = document.getElementById('custom-preview-container');
  if (iframe && container) {
    iframe.srcdoc = compileCustomBlockPage(html, assets);
    container.style.display = 'block';
  }
}

export function setupBlockPageListeners() {
  // Toggle: Default Message
  document.getElementById('btn-blockpage-type-default').addEventListener('click', async () => {
    store.currentBlockPageType = 'default';
    updateBlockPageToggleButtons();
    toggleBlockPageContainers();
    await saveBlockPageSettings();
  });

  // Toggle: Custom ZIP / HTML
  document.getElementById('btn-blockpage-type-custom').addEventListener('click', async () => {
    store.currentBlockPageType = 'custom';
    updateBlockPageToggleButtons();
    toggleBlockPageContainers();
    await saveBlockPageSettings();
  });

  // Choose file trigger
  document.getElementById('btn-blockpage-file-select').addEventListener('click', () => {
    document.getElementById('blockpage-file-input').click();
  });

  // File input change handler (parsing ZIP or HTML)
  document.getElementById('blockpage-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    const fileNameEl = document.getElementById('blockpage-file-name');
    if (fileNameEl) fileNameEl.textContent = file.name;

    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'html' || ext === 'htm') {
      // Single HTML file
      const reader = new FileReader();
      reader.onload = async event => {
        store.tempCustomHtml = event.target.result;
        store.tempCustomAssets = {};
        store.tempCustomName = file.name;

        // Render preview
        renderCustomPreview(store.tempCustomHtml, store.tempCustomAssets);
        await saveBlockPageSettings();
      };
      reader.onerror = () => {
        alert('Failed to read HTML file.');
      };
      reader.readAsText(file);
    } else if (ext === 'zip') {
      // ZIP archive
      const reader = new FileReader();
      reader.onload = async event => {
        try {
          const arrayBuffer = event.target.result;
          const zip = await window.JSZip.loadAsync(arrayBuffer);
          
          // Find the entry HTML file
          let indexFile = null;
          for (let path in zip.files) {
            if (path.toLowerCase().endsWith('index.html') || path.toLowerCase().endsWith('index.htm')) {
              indexFile = zip.files[path];
              break;
            }
          }
          if (!indexFile) {
            for (let path in zip.files) {
              if (path.toLowerCase().endsWith('.html') || path.toLowerCase().endsWith('.htm')) {
                indexFile = zip.files[path];
                break;
              }
            }
          }

          if (!indexFile) {
            alert('Error: No HTML file (index.html or similar) found inside the ZIP archive.');
            if (fileNameEl) fileNameEl.textContent = 'No file selected';
            return;
          }

          const htmlContent = await indexFile.async('string');
          const assets = {};

          for (let path in zip.files) {
            const zipObj = zip.files[path];
            if (zipObj.dir || zipObj === indexFile) continue;

            const mime = getMimeType(path);
            const base64Data = await zipObj.async('base64');
            assets[path] = `data:${mime};base64,${base64Data}`;
          }

          store.tempCustomHtml = htmlContent;
          store.tempCustomAssets = assets;
          store.tempCustomName = file.name;

          // Render preview
          renderCustomPreview(store.tempCustomHtml, store.tempCustomAssets);
          await saveBlockPageSettings();
        } catch (err) {
          console.error(err);
          alert('Failed to parse ZIP archive. Make sure it is a valid zip file.');
          if (fileNameEl) fileNameEl.textContent = 'No file selected';
        }
      };
      reader.onerror = () => {
        alert('Failed to read ZIP file.');
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('Unsupported file type. Please upload a .zip or .html file.');
      if (fileNameEl) fileNameEl.textContent = 'No file selected';
    }
  });

  const blockPageContentEl = document.getElementById('block-page-content');
  if (blockPageContentEl) {
    blockPageContentEl.addEventListener('input', e => {
      const preview = document.getElementById('preview-box');
      if (preview) {
        preview.textContent = e.target.value || 'You blocked this site for a reason.';
      }
    });
    blockPageContentEl.addEventListener('blur', saveBlockPageSettings);
  }

  const useQuotesEl = document.getElementById('block-page-use-quotes');
  if (useQuotesEl) {
    useQuotesEl.addEventListener('change', async e => {
      const checked = e.target.checked;
      const textarea = document.getElementById('block-page-content');
      if (textarea) {
        textarea.disabled = checked;
      }
      const preview = document.getElementById('preview-box');
      if (preview) {
        preview.textContent = checked ? '“Committing to nothing makes you distracted by everything.” — Quotes Option Active' : (textarea ? textarea.value : 'You blocked this site for a reason.');
      }
      await saveBlockPageSettings();
    });
  }
}
