// ===== GLOBAL STATE & STORE MODULE =====
import { sendMsg, assignModeColors } from './utils.js';

export const store = {
  state: {},
  selectedModeId: null,
  scheduleModeId: null,
  originalDomainsText: '',
  originalBlockPageText: '',
  originalBlockPageType: 'default',
  originalCustomHtml: '',
  originalCustomAssets: {},
  originalCustomName: '',

  tempCustomHtml: null,
  tempCustomAssets: null,
  tempCustomName: null,
  currentBlockPageType: 'default',
  analyticsInterval: null,
  perpetualUnlocked: false,
  isPerpetualEditorOpen: false
};

export async function refreshState() {
  store.state = await sendMsg('getState');
  assignModeColors(store.state.modes);
  return store.state;
}

export function renderLegend() {
  const legendContainer = document.getElementById('calendar-modes-legend');
  if (!legendContainer) return;
  legendContainer.textContent = '';
  
  const modes = store.state.modes || [];
  modes.forEach(mode => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '6px';
    item.style.fontSize = '0.75rem';
    item.style.fontWeight = '700';
    item.style.textTransform = 'uppercase';
    
    const dot = document.createElement('span');
    dot.className = `legend-dot mode-color-${mode.color}`;
    
    const name = document.createElement('span');
    name.textContent = mode.name;
    
    item.appendChild(dot);
    item.appendChild(name);
    legendContainer.appendChild(item);
  });
}
