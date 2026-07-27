// ===== GLOBAL STATE & STORE MODULE =====
import { sendMsg } from '../../common/utils.js';

export const store = {
  state: {},
  originalBlocklistText: '',
  originalBlockPageText: '',
  originalBlockPageType: 'default',
  originalCustomHtml: '',
  originalCustomAssets: {},
  originalCustomName: '',

  tempCustomHtml: null,
  tempCustomAssets: null,
  tempCustomName: null,
  currentBlockPageType: 'default',
  analyticsInterval: null
};

export async function refreshState() {
  store.state = await sendMsg('getState');
  return store.state;
}
