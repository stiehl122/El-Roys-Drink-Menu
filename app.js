// ─── CONFIG ───────────────────────────────────────────────────────────────────
// FB_SECRET stays in localStorage (write credential). All other settings are
// stored in Firebase and synced to localStorage as a local cache on load.
let MANAGER_PIN = localStorage.getItem('hf_pin') || '1234';
let OWNER_PIN   = localStorage.getItem('hf_owner_pin') || '';
let isOwnerMode = false;
let BOT_ID      = localStorage.getItem('hf_bot_id') || '';
let MENU_URL    = localStorage.getItem('hf_menu_url') || '';
let FB_SECRET   = localStorage.getItem('hf_fb_secret') || ''; // Firebase Database Secret (write credential)
let FB_URL      = localStorage.getItem('hf_fb_url')    || 'https://el-roy-s-drink-menu-default-rtdb.firebaseio.com'; // Firebase Realtime DB URL

let isFirstSetup = !FB_SECRET || !FB_URL; // Both Firebase URL and Secret are required
let isManagerMode = false;
let pinEntry = '';
let syncInterval = null;
const collapsedSections = new Set(); // category ids currently collapsed

// ─── CATEGORY DEFINITIONS ────────────────────────────────────────────────────
const CATEGORY_DEFS = [
  { id:'beer',      icon:'🍺', iconClass:'icon-beer',      title:'Beers on Tap',     sub:'Current draft offerings',         placeholder:'e.g. Modelo Especial...' },
  { id:'canned',    icon:'🍻', iconClass:'icon-canned',    title:'Canned & Bottled', sub:'Canned & bottled offerings',       placeholder:'e.g. Modelo Especial (can), Topo Chico...' },
  { id:'cocktails', icon:'🍹', iconClass:'icon-cocktails', title:'Cocktails',         sub:'Featured house cocktails',         placeholder:'e.g. Paloma, Ranch Water...' },
  { id:'tequila',   icon:'🌶️', iconClass:'icon-tequila',   title:'Infused Tequila',  sub:'Rotating infused marg tequila',   placeholder:'e.g. Jalapeño-Pineapple Blanco...' },
  { id:'frozen',  icon:'🧊', iconClass:'icon-frozen',  title:'Frozen Marg',     sub:'Current frozen margarita flavor', placeholder:'e.g. Strawberry Basil...' },
  { id:'special', icon:'⭐', iconClass:'icon-special', title:'Monthly Specials', sub:'Featured cocktails & promos',    placeholder:'e.g. The Valentina — raspberry, grapefruit...' },
];

// In-memory menu state — loaded from JSONBin on init
// Shape: { beer: { items:[{id,name}], lastSent:[{id,name}] }, ... }
let menuState = {};

function defaultState() {
  const s = {};
  CATEGORY_DEFS.forEach(c => { s[c.id] = { items:[], lastSent:[], removed:[] }; });
  return s;
}

function uid() { return Math.random().toString(36).slice(2,9); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

// ─── FIREBASE REALTIME DATABASE API ───────────────────────────────────────────
// Firebase stores the entire menuState object at /menu.json.
// Reads are public (no auth). Writes require the Database Secret as ?auth=.
// Security rules: { "rules": { ".read": true, ".write": false } }

async function fbRead() {
  if (!FB_URL) return null;
  const res = await fetch(`${FB_URL}/menu.json`);
  if (!res.ok) throw new Error(`Firebase read failed: ${res.status}`);
  return await res.json(); // returns the stored object directly (or null if empty)
}

async function fbWrite(state) {
  if (!FB_SECRET || !FB_URL) return;
  const res = await fetch(`${FB_URL}/menu.json?auth=${FB_SECRET}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
  if (!res.ok) throw new Error(`Firebase write failed: ${res.status}`);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  document.getElementById('loading-view').style.display = 'block';
  document.getElementById('public-view').style.display = 'none';

  if (!FB_URL) {
    // No Firebase URL configured — show empty public view
    menuState = defaultState();
    showPublicView();
    return;
  }

  try {
    const data = await fbRead();
    // Merge fetched data with defaults (in case new categories were added)
    menuState = defaultState();
    if (data && typeof data === 'object') {
      CATEGORY_DEFS.forEach(c => {
        if (data[c.id]) menuState[c.id] = data[c.id];
        if (!menuState[c.id].removed) menuState[c.id].removed = [];
      });
      if (data._meta) {
        const savedTs = data._meta.lastUpdatedTs || data._meta.lastSentTs;
        if (savedTs) localStorage.setItem('hf_last_updated_ts', savedTs);
      }
      if (data._config) {
        if (data._config.pin)     { MANAGER_PIN = data._config.pin;     localStorage.setItem('hf_pin', MANAGER_PIN); }
        if (data._config.botId)   { BOT_ID      = data._config.botId;   localStorage.setItem('hf_bot_id', BOT_ID); }
        if (data._config.menuUrl) { MENU_URL     = data._config.menuUrl; localStorage.setItem('hf_menu_url', MENU_URL); }
        if (data._config.fbSecret) { FB_SECRET = data._config.fbSecret; localStorage.setItem('hf_fb_secret', FB_SECRET); }
        if (data._config.fbUrl)    { FB_URL    = data._config.fbUrl;    localStorage.setItem('hf_fb_url', FB_URL); }
        if (data._config.ownerPin) { OWNER_PIN = data._config.ownerPin; localStorage.setItem('hf_owner_pin', OWNER_PIN); }
      }
    }
    showPublicView();
  } catch(e) {
    menuState = defaultState();
    showPublicViewWithError('⚠️ Could not load menu data. Check your Firebase configuration in Admin settings.');
  }
}

function showPublicView() {
  document.getElementById('loading-view').style.display = 'none';
  document.getElementById('public-view').style.display = 'block';
  updateLastUpdatedLabel();
  renderPublicView();
  startPolling();
}

function showPublicViewWithError(msg) {
  document.getElementById('loading-view').style.display = 'none';
  document.getElementById('public-view').style.display = 'block';
  const el = document.getElementById('public-error');
  el.textContent = msg;
  el.classList.add('visible');
  renderPublicView();
}

// ─── AUTO-REFRESH POLLING ────────────────────────────────────────────────────
// Re-reads Firebase every 60 s while in public view so changes pushed by a
// manager on another device appear without a manual page reload.
function startPolling() {
  stopPolling();
  if (!FB_URL) return;
  syncInterval = setInterval(async () => {
    if (isManagerMode) return;
    try {
      const data = await fbRead();
      if (!data || typeof data !== 'object') return;
      CATEGORY_DEFS.forEach(c => { if (data[c.id]) menuState[c.id] = data[c.id]; });
      if (data._meta) {
        const savedTs = data._meta.lastUpdatedTs || data._meta.lastSentTs;
        if (savedTs) { menuState._meta = data._meta; localStorage.setItem('hf_last_updated_ts', savedTs); }
      }
      renderPublicView();
      updateLastUpdatedLabel();
    } catch(e) { /* silently ignore transient poll failures */ }
  }, 60000);
}

function stopPolling() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

function updateLastUpdatedLabel() {
  const ts = (menuState._meta && menuState._meta.lastUpdatedTs) || localStorage.getItem('hf_last_updated_ts') || localStorage.getItem('hf_last_sent_ts');
  const el = document.getElementById('last-updated-label');
  if (ts) {
    const d = new Date(parseInt(ts));
    el.textContent = 'Last Updated: ' + d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) + ' at ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  } else {
    el.textContent = 'Last Updated: —';
  }
}

// ─── PUBLIC VIEW ──────────────────────────────────────────────────────────────
function renderPublicView() {
  const container = document.getElementById('public-categories');
  container.innerHTML = '';
  CATEGORY_DEFS.forEach(cat => {
    const state = menuState[cat.id];
    const section = document.createElement('div');
<<<<<<< claude/update-documentation-x74Np
    section.className = 'menu-section' + (collapsedSections.has(cat.id) ? ' is-collapsed' : '');
    section.id = 'pub-section-' + cat.id;
    const itemsHtml = state.items.length
      ? state.items.map(i => {
=======
    section.className = 'menu-section';
<<<<<<< HEAD
    const visibleItems = state.items.filter(i => i.onMenu !== false);
    const itemsHtml = visibleItems.length
      ? visibleItems.map(i => {
>>>>>>> main
=======
    const itemsHtml = state.items.length
      ? state.items.map(i => {
>>>>>>> parent of 00e778d (Merge pull request #19 from stiehl122/claude/store-removed-menu-items-6azDA)
          const is86      = !!i.eightySixed;
          const hasDesc   = !!(i.desc && i.desc.trim());
          const recipeIngredients = recipeArray(i.recipe);
          const hasRecipe = recipeIngredients.length > 0;
          const hasDetail = hasDesc || hasRecipe;
          const classes   = ['menu-item', is86 ? 'is-eighty-sixed' : '', hasDetail ? 'has-detail' : ''].filter(Boolean).join(' ');
          const onClick   = hasDetail ? `onclick="togglePublicDesc(this)"` : '';
          const detailHtml = hasDetail ? `<div class="item-detail-panel">
              ${hasDesc && hasRecipe
                ? `<div class="detail-section"><div class="detail-label">Description</div><div class="item-desc-text">${escHtml(i.desc)}</div></div><div class="detail-section detail-section--bordered"><div class="detail-label">Recipe</div><div class="item-desc-text">${escHtml(recipeIngredients.join(', '))}</div></div>`
                : hasDesc
                  ? `<div class="detail-section"><div class="item-desc-text">${escHtml(i.desc)}</div></div>`
                  : `<div class="detail-section"><div class="item-desc-text">${escHtml(recipeIngredients.join(', '))}</div></div>`}
            </div>` : '';
          return `<div class="${classes}" ${onClick}>
            <div class="item-main-row">
              <div class="dot"></div>
              <span class="item-name-text">${escHtml(i.name)}</span>
              ${is86 ? `<span class="eighty-sixed-tag">86'D</span>` : ''}
              ${hasDetail ? `<span class="item-expand-icon">›</span>` : ''}
            </div>
            ${detailHtml}
          </div>`;
        }).join('')
      : `<div class="empty-menu">Nothing listed yet.</div>`;
    section.innerHTML = `
      <div class="menu-section-header section-collapse-btn" onclick="toggleSection('${cat.id}')">
        <div class="menu-icon ${cat.iconClass}">${cat.icon}</div>
        <div><div class="menu-section-title">${cat.title}</div><div class="menu-section-sub">${cat.sub}</div></div>
        <span class="section-chevron">›</span>
      </div>
      <div class="menu-items">${itemsHtml}</div>`;
    container.appendChild(section);
  });
}

function togglePublicDesc(el) {
  el.classList.toggle('expanded');
}

function toggleSection(catId) {
  if (collapsedSections.has(catId)) {
    collapsedSections.delete(catId);
  } else {
    collapsedSections.add(catId);
  }
  const pubEl = document.getElementById('pub-section-' + catId);
  const mgrEl = document.getElementById('mgr-section-' + catId);
  if (pubEl) pubEl.classList.toggle('is-collapsed', collapsedSections.has(catId));
  if (mgrEl) mgrEl.classList.toggle('is-collapsed', collapsedSections.has(catId));
}

// ─── PIN ──────────────────────────────────────────────────────────────────────
function onManagerBtnClick() {
  if (isManagerMode) { exitManager(); return; }
  openPinOverlay();
}
function openPinOverlay() {
  document.getElementById('pin-overlay').classList.add('open');
  // Focus synchronously — must stay in same user-gesture tick for iOS keyboard to pop up
  const hi = document.getElementById('pin-hidden-input');
  hi.value = '';
  hi.focus();
}
function closePinOverlay() {
  document.getElementById('pin-overlay').classList.remove('open');
  pinEntry = ''; updateDots();
  document.getElementById('pin-error').classList.remove('visible');
  const hi = document.getElementById('pin-hidden-input'); hi.value = ''; hi.blur();
}
function pinPress(d) {
  if (pinEntry.length >= 4) return;
  pinEntry += d; updateDots();
  if (pinEntry.length === 4) setTimeout(checkPin, 100);
}
function pinBack() { pinEntry = pinEntry.slice(0,-1); updateDots(); document.getElementById('pin-error').classList.remove('visible'); }
function updateDots() {
  for (let i=0;i<4;i++) {
    const dot = document.getElementById('d'+i);
    dot.classList.remove('error');
    dot.classList.toggle('filled', i < pinEntry.length);
  }
}
function checkPin() {
  if (OWNER_PIN !== '' && pinEntry === OWNER_PIN) { isOwnerMode = true; closePinOverlay(); enterManager(); }
  else if (pinEntry === MANAGER_PIN) { isOwnerMode = false; closePinOverlay(); enterManager(); }
  else {
    for (let i=0;i<4;i++) document.getElementById('d'+i).classList.add('error');
    document.getElementById('pin-error').classList.add('visible');
    setTimeout(() => { pinEntry=''; updateDots(); document.getElementById('pin-error').classList.remove('visible'); }, 1200);
  }
}

// ─── MANAGER MODE ─────────────────────────────────────────────────────────────
function enterManager() {
  isManagerMode = true;
  stopPolling();
  document.body.classList.add('manager-mode');
  document.getElementById('public-view').style.display = 'none';
  document.getElementById('loading-view').style.display = 'none';
  document.getElementById('manager-view').style.display = 'block';
  document.getElementById('manager-toggle-btn').textContent = '✕ Exit';
  document.getElementById('manager-toggle-btn').classList.add('active');
  if (isFirstSetup) document.getElementById('setup-banner').style.display = 'block';
  // Pre-fill admin config fields
  document.getElementById('fb-url-input').value     = FB_URL     || '';
  document.getElementById('fb-secret-input').value  = FB_SECRET ? '••••••••••••••••' : '';
  document.getElementById('bot-id-input').value     = BOT_ID    ? '••••••••••••••••' : '';
  document.getElementById('menu-url-input').value   = MENU_URL  || '';
  // Show/hide Admin tab based on access level (owner PIN required when set)
  document.getElementById('tab-btn-admin').style.display = (OWNER_PIN === '' || isOwnerMode) ? '' : 'none';
  // Default to manager tab on entry
  switchTab('manager');
  updateDraftIndicator();
  renderManagerCategories();
}

function exitManager() {
  isManagerMode = false;
  isOwnerMode = false;
  document.body.classList.remove('manager-mode');
  document.getElementById('manager-view').style.display = 'none';
  document.getElementById('manager-toggle-btn').textContent = '⚙ Manager';
  document.getElementById('manager-toggle-btn').classList.remove('active');
  showPublicView();
}

// ─── CONFIG SAVES ─────────────────────────────────────────────────────────────
async function saveFirebaseConfig() {
  const urlVal = document.getElementById('fb-url-input').value.trim().replace(/\/+$/, '');
  const secVal = document.getElementById('fb-secret-input').value.trim();
  let changed = false;
  if (urlVal) { FB_URL = urlVal; localStorage.setItem('hf_fb_url', FB_URL); changed = true; }
  if (secVal && !secVal.startsWith('•')) { FB_SECRET = secVal; localStorage.setItem('hf_fb_secret', FB_SECRET); changed = true; }
  if (!changed) { showToast('No changes made.', 'info'); return; }
  if (FB_SECRET) document.getElementById('fb-secret-input').value = '••••••••••••••••';
  document.getElementById('setup-banner').style.display = 'none';
  isFirstSetup = false;
  await persistState(); // sync all config to Firebase so other devices pick it up
  showToast('✅ Firebase config saved!', 'success');
}
async function saveBotId() {
  const val = document.getElementById('bot-id-input').value.trim();
  if (!val || val.startsWith('•')) { showToast('No changes made.', 'info'); return; }
  BOT_ID = val; localStorage.setItem('hf_bot_id', BOT_ID);
  document.getElementById('bot-id-input').value = '••••••••••••••••';
  await persistState();
  showToast('✅ Bot ID saved!', 'success');
}
async function saveMenuUrl() {
  const val = document.getElementById('menu-url-input').value.trim();
  if (!val) { showToast('Enter a URL first.', 'info'); return; }
  MENU_URL = val; localStorage.setItem('hf_menu_url', MENU_URL);
  await persistState();
  showToast('✅ Menu URL saved!', 'success');
}
async function savePin() {
  const val = document.getElementById('new-pin-input').value.trim();
  if (!/^\d{4}$/.test(val)) { showToast('PIN must be exactly 4 digits.', 'error'); return; }
  MANAGER_PIN = val; localStorage.setItem('hf_pin', MANAGER_PIN);
  document.getElementById('new-pin-input').value = '';
  await persistState();
  showToast('✅ PIN updated!', 'success');
}
async function saveOwnerPin() {
  const val = document.getElementById('owner-pin-input').value.trim();
  if (!/^\d{4}$/.test(val)) { showToast('Owner PIN must be exactly 4 digits.', 'error'); return; }
  OWNER_PIN = val; localStorage.setItem('hf_owner_pin', OWNER_PIN);
  document.getElementById('owner-pin-input').value = '';
  await persistState();
  showToast('✅ Owner PIN updated!', 'success');
}

// ─── MANAGER CATEGORY EDIT ───────────────────────────────────────────────────
function renderManagerCategories() {
  const container = document.getElementById('manager-categories');
  container.innerHTML = '';
  CATEGORY_DEFS.forEach(cat => {
    const card = document.createElement('div');
    card.id = 'mgr-section-' + cat.id;
    card.className = 'cat-card' + (collapsedSections.has(cat.id) ? ' is-collapsed' : '');
    card.innerHTML = `
      <div class="cat-header section-collapse-btn" onclick="toggleSection('${cat.id}')">
        <div class="cat-icon ${cat.iconClass}">${cat.icon}</div>
        <div><div class="cat-title">${cat.title}</div><div class="cat-sub">${cat.sub}</div></div>
        <span class="section-chevron">›</span>
      </div>
      <div class="current-section">
        <div class="current-label">On Menu Now</div>
        <div class="current-items" id="mgr-items-${cat.id}"></div>
        <div class="add-item-wrap">
          <div class="add-item-area">
            <input class="add-item-input" id="new-input-${cat.id}" type="text" placeholder="${cat.placeholder}"
              oninput="showAutocomplete('${cat.id}')"
              onblur="setTimeout(()=>hideAutocomplete('${cat.id}'),150)"
              onkeydown="handleAddItemKeydown(event,'${cat.id}')"/>
            <button class="add-item-btn" onclick="addItem('${cat.id}')">+</button>
          </div>
          <div class="autocomplete-list" id="ac-${cat.id}"></div>
        </div>
      </div>`;
    container.appendChild(card);
    renderManagerItems(cat.id);
  });
}

function renderManagerItems(catId) {
  const state = menuState[catId];
  const lastSentNames = new Set(state.lastSent.map(i => i.name.trim().toLowerCase()));
  const listEl = document.getElementById('mgr-items-' + catId);
  listEl.innerHTML = '';
  if (!state.items.length) { listEl.innerHTML = `<div class="empty-state">Nothing on menu yet.</div>`; return; }
  state.items.forEach(item => {
    const isNew    = !lastSentNames.has(item.name.trim().toLowerCase());
    const is86     = !!item.eightySixed;
    const hasDesc   = !!(item.desc && item.desc.trim());
    const hasRecipe = recipeArray(item.recipe).length > 0;
    const wrapper  = document.createElement('div');
    wrapper.className = 'item-wrapper';
    wrapper.id = 'wrapper-' + item.id;
    const statusTitle = is86 ? "86'd" : isNew ? 'New — not yet announced' : 'On menu';
    const rowClass = ['current-item', isNew ? 'is-new' : '', is86 ? 'is-eighty-sixed' : ''].filter(Boolean).join(' ');
    wrapper.innerHTML = `
      <div class="${rowClass}">
        <div class="item-status-dot" title="${statusTitle}"></div>
        <div class="item-name"><input type="text" value="${escHtml(item.name)}"
          onblur="renameItem('${catId}','${item.id}',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()"/></div>
        <button class="desc-btn${hasDesc ? ' has-desc' : ''}" title="Add description" onclick="toggleItemDesc('${item.id}')">📝</button>
        <button class="recipe-btn${hasRecipe ? ' has-recipe' : ''}" title="Add recipe" onclick="toggleItemRecipe('${item.id}')">🧪</button>
        <button class="eighty-six-btn${is86 ? ' restore' : ''}" title="${is86 ? 'Restore to menu' : "86 this item"}" onclick="toggle86('${catId}','${item.id}')">${is86 ? '↩' : '86'}</button>
        <button class="del-item" onclick="removeItem('${catId}','${item.id}')">×</button>
      </div>
      <div class="desc-row" id="desc-row-${item.id}">
        <textarea class="desc-input" placeholder="Ingredients, description, how to sell it..."
          onblur="saveDesc('${catId}','${item.id}',this.value)">${escHtml(item.desc || '')}</textarea>
      </div>
      <div class="recipe-row" id="recipe-row-${item.id}">
        <div class="recipe-ingredient-list" id="recipe-list-${item.id}"></div>
        <div class="add-ingredient-area">
          <input class="add-ingredient-input" id="ingredient-input-${item.id}" type="text"
            placeholder="Add ingredient..."
            onkeydown="handleIngredientKeydown(event,'${catId}','${item.id}')"/>
          <button class="add-ingredient-btn" onclick="addIngredient('${catId}','${item.id}')">+</button>
        </div>
      </div>`;
    listEl.appendChild(wrapper);
    renderRecipeIngredients(catId, item.id);
  });
}

async function persistState() {
  // Write to Firebase. If not configured, silently skip (state stays in memory for session).
  if (!FB_SECRET || !FB_URL) return;
  try {
    // Always bundle current config so all devices stay in sync
    menuState._config = { pin: MANAGER_PIN, ownerPin: OWNER_PIN, botId: BOT_ID, menuUrl: MENU_URL, fbSecret: FB_SECRET, fbUrl: FB_URL };
    await fbWrite(menuState);
  } catch(e) {
    showToast('⚠️ Cloud save failed — check Firebase config in Admin settings.', 'error');
  }
}
async function saveMenu() {
  const ts = Date.now();
  menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: ts.toString() };
  localStorage.setItem('hf_last_updated_ts', ts.toString());
  await persistState();
  updateLastUpdatedLabel();
  await persistState();
  showToast('✅ Menu saved!', 'success');
}

function addItem(catId) {
  const input = document.getElementById('new-input-' + catId);
  const name = input.value.trim();
  if (!name) return;
  const stored = (menuState[catId].removed || []).find(r => r.name.toLowerCase() === name.toLowerCase());
  menuState[catId].items.push({ id: uid(), name, desc: stored ? stored.desc : '', recipe: stored ? (stored.recipe || []) : [], eightySixed: false });
  input.value = '';
  hideAutocomplete(catId);
  renderManagerItems(catId);
  input.focus();
  updateDraftIndicator();
}

// ─── AUTOCOMPLETE ─────────────────────────────────────────────────────────────
let _acIdx = -1;

function showAutocomplete(catId) {
  const val = document.getElementById('new-input-' + catId).value.trim();
  const list = document.getElementById('ac-' + catId);
  _acIdx = -1;
  if (!val) { hideAutocomplete(catId); return; }
  const matches = (menuState[catId].removed || []).filter(r => r.name.toLowerCase().startsWith(val.toLowerCase()));
  if (!matches.length) { hideAutocomplete(catId); return; }
  list.innerHTML = matches.map(r =>
    `<div class="autocomplete-item" onmousedown="selectAutocomplete(event,'${catId}','${escHtml(r.name)}')">${escHtml(r.name)}</div>`
  ).join('');
  const rect = document.getElementById('new-input-' + catId).getBoundingClientRect();
  list.style.top   = (rect.bottom + 2) + 'px';
  list.style.left  = rect.left + 'px';
  list.style.width = rect.width + 'px';
  list.classList.add('open');
}

function hideAutocomplete(catId) {
  const list = document.getElementById('ac-' + catId);
  if (list) { list.classList.remove('open'); list.innerHTML = ''; }
  _acIdx = -1;
}

function selectAutocomplete(event, catId, name) {
  event.preventDefault();
  document.getElementById('new-input-' + catId).value = name;
  hideAutocomplete(catId);
  addItem(catId);
}

function handleAddItemKeydown(event, catId) {
  const list = document.getElementById('ac-' + catId);
  const items = list ? list.querySelectorAll('.autocomplete-item') : [];
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    _acIdx = Math.min(_acIdx + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('ac-selected', i === _acIdx));
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    _acIdx = Math.max(_acIdx - 1, -1);
    items.forEach((el, i) => el.classList.toggle('ac-selected', i === _acIdx));
  } else if (event.key === 'Enter') {
    if (_acIdx >= 0 && items[_acIdx]) {
      event.preventDefault();
      items[_acIdx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else {
      addItem(catId);
    }
  } else if (event.key === 'Escape') {
    hideAutocomplete(catId);
  }
}

// ─── 86 TOGGLE ────────────────────────────────────────────────────────────────
function toggle86(catId, itemId) {
  const item = menuState[catId].items.find(i => i.id === itemId);
  if (!item) return;
  item.eightySixed = !item.eightySixed;
  renderManagerItems(catId);
  updateDraftIndicator();
  showToast(item.eightySixed ? "🚫 Marked 86'd — send update to notify group" : `↩ Marked ${restoreLabel(catId)} — send update to notify group`, 'info');
}

// ─── DESCRIPTION ──────────────────────────────────────────────────────────────
function toggleItemDesc(itemId) {
  const row = document.getElementById('desc-row-' + itemId);
  if (!row) return;
  const opening = !row.classList.contains('open');
  row.classList.toggle('open', opening);
  if (opening) row.querySelector('textarea').focus();
}

// ─── RECIPE ───────────────────────────────────────────────────────────────────
function recipeArray(recipe) {
  if (Array.isArray(recipe)) return recipe.filter(Boolean);
  if (typeof recipe === 'string' && recipe.trim()) return [recipe.trim()];
  return [];
}

function toggleItemRecipe(itemId) {
  const row = document.getElementById('recipe-row-' + itemId);
  if (!row) return;
  const opening = !row.classList.contains('open');
  row.classList.toggle('open', opening);
  if (opening) document.getElementById('ingredient-input-' + itemId)?.focus();
}

function renderRecipeIngredients(catId, itemId) {
  const item = menuState[catId].items.find(i => i.id === itemId);
  if (!item) return;
  const list = document.getElementById('recipe-list-' + itemId);
  if (!list) return;
  const ingredients = recipeArray(item.recipe);
  list.innerHTML = ingredients.map((ing, idx) =>
    `<div class="ingredient-row">
      <span class="ingredient-text">${escHtml(ing)}</span>
      <button class="del-ingredient" onclick="removeIngredient('${catId}','${itemId}',${idx})">×</button>
    </div>`
  ).join('');
}

async function addIngredient(catId, itemId) {
  const input = document.getElementById('ingredient-input-' + itemId);
  const val = input.value.trim();
  if (!val) return;
  const item = menuState[catId].items.find(i => i.id === itemId);
  if (!item) return;
  if (!Array.isArray(item.recipe)) item.recipe = recipeArray(item.recipe);
  item.recipe.push(val);
  input.value = '';
  renderRecipeIngredients(catId, itemId);
  const btn = document.querySelector('#wrapper-' + itemId + ' .recipe-btn');
  if (btn) btn.classList.toggle('has-recipe', item.recipe.length > 0);
  input.focus();
  await persistState();
}

async function removeIngredient(catId, itemId, idx) {
  const item = menuState[catId].items.find(i => i.id === itemId);
  if (!item || !Array.isArray(item.recipe)) return;
  item.recipe.splice(idx, 1);
  renderRecipeIngredients(catId, itemId);
  const btn = document.querySelector('#wrapper-' + itemId + ' .recipe-btn');
  if (btn) btn.classList.toggle('has-recipe', item.recipe.length > 0);
  await persistState();
}

function handleIngredientKeydown(event, catId, itemId) {
  if (event.key === 'Enter') { event.preventDefault(); addIngredient(catId, itemId); }
}

async function saveDesc(catId, itemId, val) {
  const item = menuState[catId].items.find(i => i.id === itemId);
  if (!item) return;
  const desc = val.trim();
  if (item.desc !== desc) {
    item.desc = desc;
    const btn = document.querySelector('#wrapper-' + itemId + ' .desc-btn');
    if (btn) btn.classList.toggle('has-desc', !!desc);
    await persistState();
  }
}

function removeItem(catId, itemId) {
  const item = menuState[catId].items.find(i => i.id === itemId);
  if (item) {
    const existing = menuState[catId].removed.find(r => r.name.toLowerCase() === item.name.toLowerCase());
    if (existing) { existing.desc = item.desc; existing.recipe = recipeArray(item.recipe); }
    else menuState[catId].removed.push({ name: item.name, desc: item.desc, recipe: recipeArray(item.recipe) });
  }
  menuState[catId].items = menuState[catId].items.filter(i => i.id !== itemId);
  renderManagerItems(catId);
  updateDraftIndicator();
}

function renameItem(catId, itemId, newName) {
  const name = newName.trim();
  if (!name) { removeItem(catId, itemId); return; }
  const item = menuState[catId].items.find(i => i.id === itemId);
  if (item && item.name !== name) { item.name = name; renderManagerItems(catId); updateDraftIndicator(); }
}

// ─── DRAFT INDICATOR ─────────────────────────────────────────────────────────
function updateDraftIndicator() {
  const btn = document.getElementById('send-btn');
  if (!btn) return;
  const diff = computeDiff();
  const total = diff.reduce((n, s) => n + s.added.length + s.removed.length + s.eightySixed.length + s.restored.length, 0);
  if (total > 0) {
    btn.innerHTML = `🔥 SEND UPDATE <span style="font-size:13px;opacity:0.85;">(${total} CHANGE${total > 1 ? 'S' : ''})</span>`;
    btn.style.boxShadow = '0 4px 22px rgba(255,77,0,0.55)';
  } else {
    btn.innerHTML = '🔥 SEND UPDATE';
    btn.style.boxShadow = '';
  }
}

// ─── DIFF ─────────────────────────────────────────────────────────────────────
function restoreLabel(catId) {
  return catId === 'beer' ? 'Back on Tap' : 'Back in Stock';
}

function computeDiff() {
  const results = [];
  CATEGORY_DEFS.forEach(cat => {
    const state = menuState[cat.id];

    // Compute 86/restored FIRST so we can exclude those names from add/remove
    const lastByName = new Map(state.lastSent.map(i => [i.name.trim().toLowerCase(), i]));
    const eightySixed = [], restored = [];
    const eightySixedNames = new Set(), restoredNames = new Set();
    state.items.forEach(item => {
      const nameLow = item.name.trim().toLowerCase();
      const prev = lastByName.get(nameLow);
      if (prev) {
        if (!prev.eightySixed &&  item.eightySixed) { eightySixed.push(item.name.trim()); eightySixedNames.add(nameLow); }
        if ( prev.eightySixed && !item.eightySixed) { restored.push(item.name.trim());    restoredNames.add(nameLow); }
      }
    });

    // Add/remove: only count items that aren't just changing 86 state
    const currentNames = state.items.filter(i => !i.eightySixed).map(i => i.name.trim()).filter(Boolean);
    const lastNames    = state.lastSent.filter(i => !i.eightySixed).map(i => i.name.trim()).filter(Boolean);
    const currentSet   = new Set(currentNames.map(n => n.toLowerCase()));
    const lastSet      = new Set(lastNames.map(n => n.toLowerCase()));
    const added   = currentNames.filter(n => !lastSet.has(n.toLowerCase())   && !restoredNames.has(n.toLowerCase()));
    const removed = lastNames.filter(n   => !currentSet.has(n.toLowerCase()) && !eightySixedNames.has(n.toLowerCase()));

    if (added.length || removed.length || eightySixed.length || restored.length) {
      results.push({ id: cat.id, icon: cat.icon, label: cat.title, added, removed, eightySixed, restored });
    }
  });
  return results;
}

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────
function openPreview() {
  const diff = computeDiff();
  const content = document.getElementById('preview-content');
  const confirmBtn = document.getElementById('confirm-btn');
  content.innerHTML = '';
  if (!diff.length) {
    content.innerHTML = `<div class="no-changes">🎉 No changes since the last update.<br><span style="font-size:11px;color:#444;">Add, remove, or 86 items to generate an update.</span></div>`;
    confirmBtn.disabled = true;
  } else {
    confirmBtn.disabled = false;
    diff.forEach(s => {
      const block = document.createElement('div');
      block.className = 'preview-block';
      let html = `<div class="preview-cat">${s.icon} ${s.label}</div>`;
      s.added.forEach(n       => { html += `<div class="preview-line add"><span>✅</span> + ${escHtml(n)}</div>`; });
      s.removed.forEach(n     => { html += `<div class="preview-line remove"><span>❌</span> − ${escHtml(n)}</div>`; });
      s.eightySixed.forEach(n => { html += `<div class="preview-line remove"><span>🚫</span> 86'd: ${escHtml(n)}</div>`; });
      s.restored.forEach(n    => { html += `<div class="preview-line add"><span>↩</span> ${restoreLabel(s.id)}: ${escHtml(n)}</div>`; });
      block.innerHTML = html;
      content.appendChild(block);
    });
  }
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal() { document.getElementById('modal-bg').classList.remove('open'); }

// ─── SEND UPDATE ──────────────────────────────────────────────────────────────
async function sendUpdate() {
  if (!BOT_ID) { closeModal(); showToast('⚠️ Set your GroupMe Bot ID first!', 'error'); return; }
  const diff = computeDiff();
  if (!diff.length) { closeModal(); return; }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });

  // Single update message — all changes grouped by category, with menu link at bottom
  let lines = [`🔥 DRINK MENU UPDATES — ${dateStr} ${timeStr}`, ''];
  diff.forEach(s => {
    lines.push(`${s.icon} ${s.label.toUpperCase()}`);
    s.added.forEach(n       => lines.push(`  ✅ + ${n}`));
    s.removed.forEach(n     => lines.push(`  ❌ - ${n}`));
    s.eightySixed.forEach(n => lines.push(`  🚫 86'd: ${n}`));
    s.restored.forEach(n    => lines.push(`  ✅ ${restoreLabel(s.id)}: ${n}`));
    lines.push('');
  });
  if (MENU_URL) lines.push(`📋 Full menu: ${MENU_URL}`);
  const patchMessage = lines.join('\n').trim();

  const confirmBtn = document.getElementById('confirm-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'SENDING...';

  try {
    const r1 = await fetch('https://api.groupme.com/v3/bots/post', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ bot_id: BOT_ID, text: patchMessage })
    });

    if (r1.ok || r1.status===202) {
      // Commit lastSent in memory + cloud
      const ts = Date.now();
      CATEGORY_DEFS.forEach(cat => {
        menuState[cat.id].lastSent = menuState[cat.id].items.map(i => ({...i}));
      });
      menuState._meta = { lastUpdatedTs: ts.toString() };
      localStorage.setItem('hf_last_updated_ts', ts.toString());
      await persistState();
      updateLastUpdatedLabel();
      renderManagerCategories();
      updateDraftIndicator();
      closeModal();
      showToast('✅ Drink menu update sent!', 'success');
    } else {
      showToast('❌ GroupMe error. Check your Bot ID.', 'error');
    }
  } catch(e) {
    showToast('❌ Network error. Check connection.', 'error');
  }

  confirmBtn.disabled = false;
  confirmBtn.textContent = 'SEND TO GROUP';
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

document.getElementById('modal-bg').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-bg')) closeModal();
});

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
function switchTab(name) {
  ['manager','admin','database'].forEach(t => {
    document.getElementById('tab-btn-' + t).classList.toggle('active', t === name);
    document.getElementById('tab-panel-' + t).classList.toggle('active', t === name);
  });
  if (name === 'database') renderDatabaseTab();
}

function renderDatabaseTab() {
  const wrap = document.getElementById('db-table-wrap');
  try {
    const query = (document.getElementById('db-search').value || '').toLowerCase().trim();
    const rows = [];
    let totalItems = 0;

    CATEGORY_DEFS.forEach(cat => {
      const all = [
        ...(menuState[cat.id]?.items   || []).map(i => ({...i, onMenu: true})),
        ...(menuState[cat.id]?.removed || []).map(i => ({...i, onMenu: false}))
      ];
      totalItems += all.length;
      all.forEach(item => {
        const recipe = recipeArray(item.recipe);
        if (!recipe.length) return;
        rows.push({ name: item.name, category: cat.title, recipe, onMenu: item.onMenu, eightySixed: !!item.eightySixed });
      });
    });

    const filtered = query
      ? rows.filter(r =>
          r.name.toLowerCase().includes(query) ||
          r.category.toLowerCase().includes(query) ||
          r.recipe.some(ing => ing.toLowerCase().includes(query))
        )
      : rows;
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (!filtered.length) {
      wrap.innerHTML = totalItems === 0
        ? '<p class="db-empty">No menu items loaded. Check your Firebase connection in the Admin tab.</p>'
        : `<p class="db-empty">${totalItems} item${totalItems !== 1 ? 's' : ''} found — none have recipes yet. Add ingredients via the 🧪 button in the Manager tab, then save.</p>`;
      return;
    }

    wrap.innerHTML = `
      <table class="db-table">
        <thead><tr><th>Drink</th><th>Category</th><th>Recipe</th><th>Status</th></tr></thead>
        <tbody>${filtered.map(r => `
          <tr>
            <td class="db-name">${escHtml(r.name)}</td>
            <td class="db-cat">${escHtml(r.category)}</td>
            <td class="db-recipe">${r.recipe.map(ing => `<span class="db-ing">${escHtml(ing)}</span>`).join('')}</td>
            <td class="db-status">${r.eightySixed ? '<span class="db-badge db-badge--86">86\'d</span>' : r.onMenu ? '<span class="db-badge db-badge--on">On Menu</span>' : '<span class="db-badge db-badge--off">Off Menu</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    wrap.innerHTML = `<p class="db-empty db-error">Error rendering database: ${escHtml(String(e))}</p>`;
  }
}

function filterDatabase() { renderDatabaseTab(); }

// ─── NATIVE MOBILE KEYPAD SUPPORT ────────────────────────────────────────────
(function() {
  const hi = document.getElementById('pin-hidden-input');
  hi.addEventListener('input', function() {
    const digits = this.value.replace(/\D/g, '');
    this.value = '';
    for (const d of digits) pinPress(d);
  });
  hi.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace') { e.preventDefault(); pinBack(); }
  });
  // Re-focus hidden input when tapping the dots area (in case focus was lost)
  document.getElementById('pin-overlay').addEventListener('click', function(e) {
    if (!e.target.closest('.key') && !e.target.closest('.pin-cancel')) {
      hi.focus();
    }
  });
})();

init();
