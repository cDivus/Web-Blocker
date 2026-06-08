import { store } from './state.js';
import { sendMsg, getMimeType } from './utils.js';
import { DEFAULT_QUOTES } from '../../common/utils.js';
export function renderBlockPage(skipTextareaUpdate = false, keepError = false) {
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
  const label = document.getElementById('blockpage-label');

  if (checkbox) checkbox.checked = store.originalBlockPageUseQuotes;

  if (textarea) {
    textarea.disabled = false;
    if (store.originalBlockPageUseQuotes) {
      if (label) label.textContent = 'Quotes List';
      textarea.rows = 10;
      textarea.placeholder = '"Discipline is choosing between what you want now and what you want most." - Abraham Lincoln';
      if (!skipTextareaUpdate) {
        const quotes = store.state.blockPageQuotes || DEFAULT_QUOTES;
        textarea.value = quotes.map(q => `"${q.text}" - ${q.author}`).join('\n');
      }
    } else {
      if (label) label.textContent = 'Message';
      textarea.rows = 4;
      textarea.placeholder = 'You blocked this site for a reason.';
      if (!skipTextareaUpdate) {
        textarea.value = store.originalBlockPageText;
      }
    }
  }

  if (preview) {
    preview.textContent = store.originalBlockPageUseQuotes ? '“Committing to nothing makes you distracted by everything.” — Quotes Option Active' : store.originalBlockPageText;
  }

  if (!keepError) {
    const errEl = document.getElementById('blockpage-error');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
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
    const useQuotes = document.getElementById('block-page-use-quotes').checked;
    if (useQuotes) return; // If quotes are active, saveQuotesFromTextarea should handle saving.

    const content = document.getElementById('block-page-content').value;
    await sendMsg('saveBlockPage', {
      type: 'default',
      content,
      useQuotes: false
    });
    store.state.blockPageType = 'default';
    store.state.blockPageContent = content;
    store.state.blockPageUseQuotes = false;
  }
  renderBlockPage(true);
}

export async function saveQuotesFromTextarea() {
  const textarea = document.getElementById('block-page-content');
  if (!textarea) return;

  const raw = textarea.value;
  const lines = raw.split('\n');
  const errEl = document.getElementById('blockpage-error');

  const entries = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // skip blank lines

    // format: "quote" - author
    const match = line.trim().match(/^"(.+)"\s*-\s*(.+)$/);
    if (!match) {
      errors.push(`Line ${i + 1}: Invalid format. Expected "quote" - author`);
      continue;
    }

    const text = match[1].trim();
    const author = match[2].trim();

    if (!text || !author) {
      errors.push(`Line ${i + 1}: Quote and author cannot be empty`);
      continue;
    }

    entries.push({ text, author });
  }

  const hasErrors = errors.length > 0;
  if (hasErrors) {
    if (errEl) {
      errEl.textContent = errors.join(' · ');
      errEl.style.display = 'block';
    }
  } else {
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
  }

  // Send the valid entries to background
  await sendMsg('saveBlockPageQuotes', { quotes: entries });
  store.state.blockPageQuotes = entries;
  renderBlockPage(true, hasErrors);
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
      const useQuotes = document.getElementById('block-page-use-quotes').checked;
      if (!useQuotes) {
        const preview = document.getElementById('preview-box');
        if (preview) {
          preview.textContent = e.target.value || 'You blocked this site for a reason.';
        }
      }
    });

    blockPageContentEl.addEventListener('blur', () => {
      const useQuotes = document.getElementById('block-page-use-quotes').checked;
      if (useQuotes) {
        saveQuotesFromTextarea();
      } else {
        saveBlockPageSettings();
      }
    });

    blockPageContentEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        setTimeout(() => {
          const useQuotes = document.getElementById('block-page-use-quotes').checked;
          if (useQuotes) {
            saveQuotesFromTextarea();
          } else {
            saveBlockPageSettings();
          }
        }, 0);
      }
    });
  }

  const useQuotesEl = document.getElementById('block-page-use-quotes');
  if (useQuotesEl) {
    useQuotesEl.addEventListener('change', async e => {
      const checked = e.target.checked;
      
      // Save setting (keeping the old block message)
      await sendMsg('saveBlockPage', {
        type: 'default',
        content: store.state.blockPageContent || 'You blocked this site for a reason.',
        useQuotes: checked
      });
      store.state.blockPageUseQuotes = checked;
      
      // Render to reload values and switch between message and quotes list
      renderBlockPage(false);
    });
  }
}
