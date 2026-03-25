// ─── CONFIG ───────────────────────────────────────────────────────────────────
const APP_VERSION = 'v0.6.1';
const IS_PREVIEW = window.location.hostname.endsWith('.vercel.app') &&
  window.location.hostname !== 'el-roys-drink-menu.vercel.app';

const LS_KEYS = {
  fbUrl:        'hf_fb_url',
  menuUrl:      'hf_menu_url',
  lastUpdated:  'hf_last_updated_ts',
  accessToken:  'hf_sb_access_token',
  refreshToken: 'hf_sb_refresh_token',
  expiresAt:    'hf_sb_expires_at',
};

let BOT_ID    = '';
let MENU_URL  = localStorage.getItem(LS_KEYS.menuUrl) || '';
let FB_URL    = localStorage.getItem(LS_KEYS.fbUrl) || 'https://el-roy-s-drink-menu-default-rtdb.firebaseio.com';

let SUPABASE_URL      = '';
let SUPABASE_ANON_KEY = '';
let currentUser = null; // { uid, email, name, accessToken, refreshToken, role, expiresAt }

let isFirstSetup  = !FB_URL;
let isManagerMode = false;
let syncInterval  = null;
let _tokenRefreshTimer = null;
let _authScreen        = 'signin'; // 'signin' | 'signup' | 'forgot' | 'reset'
let _recoverySessionData = null;   // set when app detects a Supabase recovery URL hash

// ─── CATEGORY DEFINITIONS ────────────────────────────────────────────────────
const ICON_COLOR_PALETTE = [
  'rgba(245,210,66,0.22)',
  'rgba(18,133,120,0.15)',
  'rgba(100,180,255,0.18)',
  'rgba(190,67,48,0.12)',
  'rgba(140,200,120,0.18)',
  'rgba(180,100,220,0.15)',
  'rgba(255,150,100,0.18)',
  'rgba(100,200,220,0.18)',
];

const DEFAULT_CATEGORY_DEFS = [
  { id:'beer',      icon:'🍺', color:ICON_COLOR_PALETTE[0], title:'Beers on Tap',    sub:'Current draft offerings',         placeholder:'e.g. Modelo Especial...' },
  { id:'canned',    icon:'🍻', color:ICON_COLOR_PALETTE[4], title:'Canned & Bottled', sub:'Canned & bottled offerings',     placeholder:'e.g. Modelo Especial (can), Topo Chico...' },
  { id:'cocktails', icon:'🍹', color:ICON_COLOR_PALETTE[5], title:'Cocktails',        sub:'Craft cocktail offerings',       placeholder:'e.g. Paloma, Spicy Margarita...' },
  { id:'tequila',   icon:'🌶️', color:ICON_COLOR_PALETTE[1], title:'Infused Tequila',  sub:'Rotating infused marg tequila',  placeholder:'e.g. Jalapeño-Pineapple Blanco...' },
  { id:'frozen',    icon:'🧊', color:ICON_COLOR_PALETTE[2], title:'Frozen Marg',      sub:'Current frozen margarita flavor',placeholder:'e.g. Strawberry Basil...' },
  { id:'special',   icon:'⭐', color:ICON_COLOR_PALETTE[3], title:'Monthly Specials', sub:'Featured cocktails & promos',   placeholder:'e.g. The Valentina — raspberry, grapefruit...' },
];

let CATEGORY_DEFS = DEFAULT_CATEGORY_DEFS.map(c => ({...c}));

// ─── DESIGN ──────────────────────────────────────────────────────────────────
const HEADING_FONTS = ['DM Sans','Bebas Neue','Oswald','Pacifico','Bangers','Fredoka One','Lilita One','Black Han Sans','Righteous','Boogaloo','Titan One'];
const BODY_FONTS    = ['DM Sans','Inter','Outfit','Nunito','Raleway','Poppins','Lato','Open Sans','Roboto','Source Sans 3'];
const ACCENT_FONTS  = ['DM Sans','Permanent Marker','Satisfy','Dancing Script','Caveat','Indie Flower','Kalam','Patrick Hand','Courgette','Handlee'];

const DESIGN_DEFAULTS = {
  brandName:    '',
  menuTitle:    'CURRENT MENU',
  logoDataUrl:  '',
  primaryColor: '#2d3748',
  accentColor:  '#4299e1',
  bgColor:      '#f0f4f8',
  headingFont:  'DM Sans',
  bodyFont:     'DM Sans',
  accentFont:   'DM Sans',
};

let currentDesign = { ...DESIGN_DEFAULTS };

// ─── MENU STATE ───────────────────────────────────────────────────────────────
let menuState = {};

function defaultState() {
  const s = {};
  CATEGORY_DEFS.forEach(c => { s[c.id] = s[c.id] || { items:[], lastSent:[] }; });
  return s;
}

function uid() { return Math.random().toString(36).slice(2,9); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function lsSet(key, val) {
  try { localStorage.setItem(key, val); }
  catch(e) { showToast('⚠️ Storage full — data not saved locally.', 'error'); }
}
function findItem(catId, itemId) {
  return menuState[catId]?.items.find(i => i.id === itemId) ?? null;
}
let _diffCache = null;
let _diffDirty = true;
function invalidateDiff() { _diffDirty = true; }
function getCachedDiff() {
  if (_diffDirty) { _diffCache = computeDiff(); _diffDirty = false; }
  return _diffCache;
}

// ─── FIREBASE REALTIME DATABASE API ───────────────────────────────────────────
async function fbRead() {
  if (!FB_URL) return null;
  const res = await fetch(`${FB_URL}/menu.json`);
  if (!res.ok) throw new Error(`Firebase read failed: ${res.status}`);
  return await res.json();
}

async function fbWrite(state) {
  if (!FB_URL || !currentUser?.accessToken) return;
  const res = await fetch('/api/firebase-write', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentUser.accessToken}`
    },
    body: JSON.stringify({ state })
  });
  if (!res.ok) throw new Error(`Firebase write failed: ${res.status}`);
}

// ─── LOCAL NOTIFICATIONS CONFIG ───────────────────────────────────────────────
async function loadLocalConfig() {
  try {
    const res = await fetch('lib/config/notifications.json');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.groupme && typeof cfg.groupme.botId === 'string' && cfg.groupme.botId.trim()) {
      BOT_ID = cfg.groupme.botId.trim();
    }
  } catch(e) {}
}

function showConfigModal() {
  const json = JSON.stringify({ groupme: { botId: BOT_ID } }, null, 2);
  document.getElementById('config-json-output').value = json;
  document.getElementById('config-modal-bg').classList.add('open');
}
function closeConfigModal() {
  document.getElementById('config-modal-bg').classList.remove('open');
}
async function copyConfigJson() {
  await navigator.clipboard.writeText(document.getElementById('config-json-output').value);
  showToast('Copied!', 'success');
}

// ─── DESIGN ──────────────────────────────────────────────────────────────────
function darkenHex(hex, amount) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return hex;
  const r = Math.max(0, parseInt(hex.substr(1,2),16) - Math.round(255*amount));
  const g = Math.max(0, parseInt(hex.substr(3,2),16) - Math.round(255*amount));
  const b = Math.max(0, parseInt(hex.substr(5,2),16) - Math.round(255*amount));
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function lightenHex(hex, amount) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return hex;
  const r = Math.min(255, parseInt(hex.substr(1,2),16) + Math.round(255*amount));
  const g = Math.min(255, parseInt(hex.substr(3,2),16) + Math.round(255*amount));
  const b = Math.min(255, parseInt(hex.substr(5,2),16) + Math.round(255*amount));
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function loadGoogleFont(fontName) {
  if (!fontName) return;
  // Default fonts are self-hosted in lib/fonts/ — no external request needed.
  if (['DM Sans','Lilita One','Permanent Marker'].includes(fontName)) return;
  const id = 'gfont-' + fontName.replace(/\s+/g,'-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  // NOTE (#148): Google Fonts CDN serves dynamically-generated CSS responses, so
  // Subresource Integrity (SRI) hashes cannot be applied — the response content
  // changes with each request. The default fonts (DM Sans, Lilita One, Permanent
  // Marker) are self-hosted in lib/fonts/ for full SRI compliance. Any additional
  // fonts selected via the Design panel are loaded from the CDN without SRI.
  // TODO: self-host additional fonts for SRI compliance.
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName).replace(/%20/g,'+')}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

function applyDesign(design) {
  const root = document.documentElement;
  if (design.primaryColor) {
    root.style.setProperty('--teal',    design.primaryColor);
    root.style.setProperty('--teal-dk', darkenHex(design.primaryColor, 0.08));
  }
  if (design.accentColor) {
    root.style.setProperty('--terra',    design.accentColor);
    root.style.setProperty('--terra-dk', darkenHex(design.accentColor, 0.08));
    root.style.setProperty('--fire',     design.accentColor);
    root.style.setProperty('--ember',    lightenHex(design.accentColor, 0.05));
  }
  if (design.bgColor) {
    root.style.setProperty('--bg',     design.bgColor);
    root.style.setProperty('--salmon', design.bgColor);
  }
  const logo = document.querySelector('.hf-logo');
  if (logo) {
    if (design.logoDataUrl) {
      logo.src = design.logoDataUrl;
      logo.style.display = '';
    } else {
      logo.style.display = 'none';
    }
  }
  const brandEl = document.querySelector('.logo-mark');
  if (brandEl) {
    brandEl.textContent = design.brandName || '';
    brandEl.style.display = design.brandName ? '' : 'none';
  }
  const titleEl = document.querySelector('header h1');
  if (titleEl && design.menuTitle) titleEl.textContent = design.menuTitle;

  // #149: Validate font names against the allowlist before applying as CSS values
  // to prevent CSS injection via unsanitized font names from the database.
  const FONT_ALLOWLIST = new Set([...HEADING_FONTS, ...BODY_FONTS, ...ACCENT_FONTS]);
  function _safeFont(name, fallback) {
    if (!name) return null;
    if (FONT_ALLOWLIST.has(name)) return name;
    console.warn(`[security] Rejected invalid font name: "${name}" — falling back to "${fallback}"`);
    return fallback;
  }

  const headingFont = _safeFont(design.headingFont, 'Lilita One');
  if (headingFont) {
    loadGoogleFont(headingFont);
    root.style.setProperty('--font-heading', `'${headingFont}', cursive`);
  }
  const bodyFont = _safeFont(design.bodyFont, 'DM Sans');
  if (bodyFont) {
    loadGoogleFont(bodyFont);
    root.style.setProperty('--font-body', `'${bodyFont}', sans-serif`);
  }
  const accentFont = _safeFont(design.accentFont, 'Permanent Marker');
  if (accentFont) {
    loadGoogleFont(accentFont);
    root.style.setProperty('--font-accent', `'${accentFont}', cursive`);
  }
  const brand = (design.brandName || '').trim();
  const title = (design.menuTitle || '').trim();
  document.title = [brand, title].filter(Boolean).join(' | ') || 'Current Menu';
}

function renderDesignSection() {
  const d = currentDesign;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('design-brand-name', d.brandName);
  set('design-menu-title', d.menuTitle);

  const pEl = document.getElementById('design-primary-color');
  const aEl = document.getElementById('design-accent-color');
  const bEl = document.getElementById('design-bg-color');
  if (pEl) { pEl.value = d.primaryColor || '#2d3748'; updateColorLabel('design-primary-color'); }
  if (aEl) { aEl.value = d.accentColor  || '#4299e1'; updateColorLabel('design-accent-color'); }
  if (bEl) { bEl.value = d.bgColor      || '#f0f4f8'; updateColorLabel('design-bg-color'); }

  _populateFontSelect('design-heading-font', HEADING_FONTS, d.headingFont || 'DM Sans');
  _populateFontSelect('design-body-font',    BODY_FONTS,    d.bodyFont    || 'DM Sans');
  _populateFontSelect('design-accent-font',  ACCENT_FONTS,  d.accentFont  || 'DM Sans');

  const preview = document.getElementById('design-logo-preview');
  const clearBtn = document.getElementById('design-logo-clear-btn');
  if (preview) {
    if (d.logoDataUrl) { preview.src = d.logoDataUrl; preview.style.display = ''; }
    else preview.style.display = 'none';
  }
  if (clearBtn) clearBtn.style.display = d.logoDataUrl ? '' : 'none';
}

function _populateFontSelect(selectId, fonts, currentFont) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  if (!sel.children.length) {
    fonts.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f; opt.textContent = f;
      sel.appendChild(opt);
    });
    const custom = document.createElement('option');
    custom.value = '__custom__'; custom.textContent = 'Custom…';
    sel.appendChild(custom);
  }
  const isPreset = fonts.includes(currentFont);
  sel.value = isPreset ? currentFont : '__custom__';
  const customInput = document.getElementById(selectId + '-custom');
  if (customInput) {
    customInput.style.display = isPreset ? 'none' : '';
    if (!isPreset) customInput.value = currentFont;
  }
}

function onFontSelectChange(selectId) {
  const sel = document.getElementById(selectId);
  const customInput = document.getElementById(selectId + '-custom');
  if (!sel || !customInput) return;
  customInput.style.display = sel.value === '__custom__' ? '' : 'none';
  if (sel.value === '__custom__') customInput.focus();
}

function updateColorLabel(inputId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(inputId + '-label');
  if (input && label) label.value = input.value;
}

function syncHexInput(colorInputId) {
  const hexInput = document.getElementById(colorInputId + '-label');
  const colorInput = document.getElementById(colorInputId);
  if (!hexInput || !colorInput) return;
  const val = hexInput.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    colorInput.value = val;
    // Live preview: apply immediately without saving
    const d = {
      ...currentDesign,
      primaryColor: document.getElementById('design-primary-color')?.value || currentDesign.primaryColor,
      accentColor:  document.getElementById('design-accent-color')?.value  || currentDesign.accentColor,
      bgColor:      document.getElementById('design-bg-color')?.value      || currentDesign.bgColor,
    };
    applyDesign(d);
  }
}

function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    currentDesign.logoDataUrl = e.target.result;
    const preview = document.getElementById('design-logo-preview');
    if (preview) { preview.src = e.target.result; preview.style.display = ''; }
    const clearBtn = document.getElementById('design-logo-clear-btn');
    if (clearBtn) clearBtn.style.display = '';
    const logo = document.querySelector('.hf-logo');
    if (logo) { logo.src = e.target.result; logo.style.display = ''; }
  };
  reader.readAsDataURL(file);
}

function clearLogo() {
  currentDesign.logoDataUrl = '';
  const preview = document.getElementById('design-logo-preview');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  const clearBtn = document.getElementById('design-logo-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  const logo = document.querySelector('.hf-logo');
  if (logo) logo.style.display = 'none';
}

async function saveDesign() {
  function getFontValue(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return '';
    if (sel.value === '__custom__') {
      return (document.getElementById(selectId + '-custom')?.value || '').trim();
    }
    return sel.value;
  }
  currentDesign = {
    ...currentDesign,
    brandName:    (document.getElementById('design-brand-name')?.value   || '').trim(),
    menuTitle:    (document.getElementById('design-menu-title')?.value   || '').trim(),
    primaryColor:  document.getElementById('design-primary-color')?.value || currentDesign.primaryColor,
    accentColor:   document.getElementById('design-accent-color')?.value  || currentDesign.accentColor,
    bgColor:       document.getElementById('design-bg-color')?.value      || currentDesign.bgColor,
    headingFont:  getFontValue('design-heading-font') || currentDesign.headingFont,
    bodyFont:     getFontValue('design-body-font')    || currentDesign.bodyFont,
    accentFont:   getFontValue('design-accent-font')  || currentDesign.accentFont,
  };
  applyDesign(currentDesign);
  await persistState();
  showToast('✅ Design saved!', 'success');
}

// ─── CATEGORY MANAGEMENT ─────────────────────────────────────────────────────
function refreshAllViews() {
  renderCategoriesTab(); renderManagerCategories(); renderPublicView();
}

function getNextCategoryColor() {
  const usedColors = new Set(CATEGORY_DEFS.map(c => c.color));
  for (const color of ICON_COLOR_PALETTE) {
    if (!usedColors.has(color)) return color;
  }
  return ICON_COLOR_PALETTE[CATEGORY_DEFS.length % ICON_COLOR_PALETTE.length];
}

function renderCategoriesTab() {
  const container = document.getElementById('catmgr-list');
  if (!container) return;
  container.innerHTML = '';
  CATEGORY_DEFS.forEach((cat, idx) => {
    const card = document.createElement('div');
    card.className = 'catmgr-card';
    card.id = 'catmgr-' + cat.id;
    const isFirst = idx === 0;
    const isLast  = idx === CATEGORY_DEFS.length - 1;
    card.innerHTML = `
      <div class="catmgr-row">
        <div class="catmgr-icon" style="background:${escHtml(cat.color)}">${escHtml(cat.icon)}</div>
        <div class="catmgr-info">
          <div class="catmgr-title">${escHtml(cat.title)}</div>
          <div class="catmgr-sub">${escHtml(cat.sub || '')}</div>
        </div>
        <div class="catmgr-actions">
          <button class="btn-small" onclick="moveCategoryUp('${escHtml(cat.id)}')" ${isFirst ? 'disabled' : ''} title="Move up">↑</button>
          <button class="btn-small" onclick="moveCategoryDown('${escHtml(cat.id)}')" ${isLast ? 'disabled' : ''} title="Move down">↓</button>
          <button class="btn-small" onclick="toggleCategoryEdit('${escHtml(cat.id)}')">✏️</button>
          <button class="btn-small btn-danger" onclick="deleteCategory('${escHtml(cat.id)}')">×</button>
        </div>
      </div>
      <div class="catmgr-edit" id="catmgr-edit-${escHtml(cat.id)}" style="display:none">
        <div class="catmgr-field-row">
          <label>Icon</label>
          <input type="text" class="catmgr-input catmgr-icon-input" id="ce-icon-${escHtml(cat.id)}" value="${escHtml(cat.icon)}" maxlength="4" placeholder="Emoji"/>
        </div>
        <div class="catmgr-field-row">
          <label>Title</label>
          <input type="text" class="catmgr-input" id="ce-title-${escHtml(cat.id)}" value="${escHtml(cat.title)}" placeholder="Category title"/>
        </div>
        <div class="catmgr-field-row">
          <label>Subtitle</label>
          <input type="text" class="catmgr-input" id="ce-sub-${escHtml(cat.id)}" value="${escHtml(cat.sub || '')}" placeholder="Short description"/>
        </div>
        <div class="catmgr-field-row">
          <label>Hint text</label>
          <input type="text" class="catmgr-input" id="ce-ph-${escHtml(cat.id)}" value="${escHtml(cat.placeholder || '')}" placeholder="Add item input hint"/>
        </div>
        <div class="catmgr-save-row">
          <button class="btn-small" onclick="toggleCategoryEdit('${escHtml(cat.id)}')">Cancel</button>
          <button class="btn-small" onclick="saveCategoryEdit('${escHtml(cat.id)}')">Save</button>
        </div>
      </div>`;
    container.appendChild(card);
  });
}

function toggleCategoryEdit(catId) {
  const el = document.getElementById('catmgr-edit-' + catId);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function saveCategoryEdit(catId) {
  const cat = CATEGORY_DEFS.find(c => c.id === catId);
  if (!cat) return;
  const icon  = document.getElementById('ce-icon-'  + catId)?.value.trim() || cat.icon;
  const title = document.getElementById('ce-title-' + catId)?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const sub   = document.getElementById('ce-sub-'   + catId)?.value.trim() || '';
  const ph    = document.getElementById('ce-ph-'    + catId)?.value.trim() || '';
  cat.icon = icon; cat.title = title; cat.sub = sub; cat.placeholder = ph;
  toggleCategoryEdit(catId);
  await persistState();
  refreshAllViews();
  showToast('✅ Category updated!', 'success');
}

async function moveCategoryUp(catId) {
  const idx = CATEGORY_DEFS.findIndex(c => c.id === catId);
  if (idx <= 0) return;
  [CATEGORY_DEFS[idx-1], CATEGORY_DEFS[idx]] = [CATEGORY_DEFS[idx], CATEGORY_DEFS[idx-1]];
  await persistState();
  refreshAllViews();
}

async function moveCategoryDown(catId) {
  const idx = CATEGORY_DEFS.findIndex(c => c.id === catId);
  if (idx < 0 || idx >= CATEGORY_DEFS.length - 1) return;
  [CATEGORY_DEFS[idx], CATEGORY_DEFS[idx+1]] = [CATEGORY_DEFS[idx+1], CATEGORY_DEFS[idx]];
  await persistState();
  refreshAllViews();
}

async function deleteCategory(catId) {
  const cat = CATEGORY_DEFS.find(c => c.id === catId);
  if (!cat) return;
  const hasItems = (menuState[catId]?.items || []).some(i => i.onMenu !== false);
  const msg = hasItems
    ? `"${cat.title}" has active menu items. Delete it anyway? (Items will be hidden but not permanently removed.)`
    : `Delete the "${cat.title}" category?`;
  if (!confirm(msg)) return;
  CATEGORY_DEFS = CATEGORY_DEFS.filter(c => c.id !== catId);
  invalidateDiff();
  await persistState();
  refreshAllViews();
  showToast('✅ Category deleted.', 'success');
}

function toggleAddCategoryForm() {
  const form = document.getElementById('catmgr-add-form');
  const btn  = document.getElementById('show-add-cat-btn');
  if (!form) return;
  const opening = form.style.display === 'none';
  form.style.display = opening ? '' : 'none';
  if (btn) btn.textContent = opening ? '− Cancel' : '+ Add Category';
  if (opening) document.getElementById('new-cat-title')?.focus();
}

async function confirmAddCategory() {
  const icon  = document.getElementById('new-cat-icon')?.value.trim() || '🍸';
  const title = document.getElementById('new-cat-title')?.value.trim();
  if (!title) { showToast('Category title is required.', 'error'); return; }
  const sub = document.getElementById('new-cat-sub')?.value.trim() || '';
  const ph  = document.getElementById('new-cat-placeholder')?.value.trim() || `e.g. Add ${title} item...`;
  const id  = 'cat_' + Date.now().toString(36);
  const color = getNextCategoryColor();
  CATEGORY_DEFS.push({ id, icon, color, title, sub, placeholder: ph });
  menuState[id] = { items: [], lastSent: [] };
  // Reset form
  ['new-cat-icon','new-cat-title','new-cat-sub','new-cat-placeholder'].forEach(fid => {
    const el = document.getElementById(fid); if (el) el.value = '';
  });
  const iconEl = document.getElementById('new-cat-icon');
  if (iconEl) iconEl.value = '🍸';
  document.getElementById('catmgr-add-form').style.display = 'none';
  const btn = document.getElementById('show-add-cat-btn');
  if (btn) btn.textContent = '+ Add Category';
  await persistState();
  refreshAllViews();
  showToast(`✅ Category "${title}" added!`, 'success');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function loadSupabaseConfig() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) return;
    const cfg = await r.json();
    if (cfg.supabaseUrl)     SUPABASE_URL      = cfg.supabaseUrl;
    if (cfg.supabaseAnonKey) SUPABASE_ANON_KEY = cfg.supabaseAnonKey;
  } catch(e) {}
}

async function init() {
  document.getElementById('loading-view').style.display = 'block';
  document.getElementById('public-view').style.display = 'none';

  await Promise.all([loadLocalConfig(), loadSupabaseConfig()]);

  if (!FB_URL) {
    applyDesign(currentDesign);
    menuState = defaultState();
    showPublicView();
    return;
  }

  try {
    const data = await fbRead();

    // Extract config (including categories + design) BEFORE building state
    if (data && data._config) {
      const cfg = data._config;
      if (cfg.menuUrl)  { MENU_URL  = cfg.menuUrl;  lsSet(LS_KEYS.menuUrl, MENU_URL); }
      if (cfg.fbUrl)    { FB_URL    = cfg.fbUrl;    lsSet(LS_KEYS.fbUrl, FB_URL); }
      if (cfg.categories && Array.isArray(cfg.categories) && cfg.categories.length) {
        CATEGORY_DEFS = cfg.categories;
      }
      if (cfg.design && typeof cfg.design === 'object') {
        currentDesign = { ...DESIGN_DEFAULTS, ...cfg.design };
      }
    }

    applyDesign(currentDesign);
    menuState = defaultState();

    if (data && typeof data === 'object') {
      CATEGORY_DEFS.forEach(c => {
        if (data[c.id]) menuState[c.id] = data[c.id];
        if (!menuState[c.id].items) menuState[c.id].items = [];
        menuState[c.id].items = menuState[c.id].items.map(i => ({ onMenu: true, ...i }));
        (menuState[c.id].removed || []).forEach(r => {
          const alreadyExists = menuState[c.id].items.some(
            i => i.name.trim().toLowerCase() === r.name.trim().toLowerCase()
          );
          if (!alreadyExists) {
            menuState[c.id].items.push({ id: uid(), name: r.name, desc: r.desc || '', recipe: r.recipe || [], eightySixed: false, onMenu: false });
          }
        });
        delete menuState[c.id].removed;
      });
      if (data._meta) {
        menuState._meta = data._meta;
        const savedTs = data._meta.lastUpdatedTs || data._meta.lastSentTs;
        if (savedTs) lsSet(LS_KEYS.lastUpdated, savedTs);
      }
    }
    showPublicView();
  } catch(e) {
    applyDesign(currentDesign);
    menuState = defaultState();
    showPublicViewWithError('⚠️ Could not load menu data. Check your Firebase configuration in Admin settings.');
  }

  // Restore Supabase session — recovery callback takes priority over stored tokens
  const handledRecovery = await _tryHandleRecoveryCallback();
  if (!handledRecovery) await _tryRestoreSession();
}

async function _tryHandleRecoveryCallback() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  if (params.get('type') !== 'recovery') return false;
  const accessToken = params.get('access_token');
  if (!accessToken) return false;
  history.replaceState({}, '', window.location.pathname);
  _recoverySessionData = {
    access_token:  accessToken,
    refresh_token: params.get('refresh_token') || '',
    expires_in:    Number(params.get('expires_in') || 3600),
  };
  openAuthOverlay('reset');
  return true;
}

async function _tryRestoreSession() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const storedRefresh  = localStorage.getItem(LS_KEYS.refreshToken);
  const storedExpiresAt = Number(localStorage.getItem(LS_KEYS.expiresAt) || 0);
  if (!storedRefresh) return;
  try {
    const data = await sbRefreshToken(storedRefresh);
    let role = 'none', name = '';
    if (data.access_token) {
      const profile = await sbGetProfile(data.access_token);
      role = profile.role;
      name = profile.name;
    }
    _applySession(data, role, name);
    applyRole(role);
  } catch(e) {
    // Stored session is invalid — clear it silently
    localStorage.removeItem(LS_KEYS.accessToken);
    localStorage.removeItem(LS_KEYS.refreshToken);
    localStorage.removeItem(LS_KEYS.expiresAt);
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
function startPolling() {
  stopPolling();
  if (!FB_URL) return;
  syncInterval = setInterval(async () => {
    if (isManagerMode) return;
    try {
      const data = await fbRead();
      if (!data || typeof data !== 'object') return;

      let needsRender = false;

      // Check for remote category/design changes
      if (data._config) {
        if (data._config.categories && Array.isArray(data._config.categories) && data._config.categories.length) {
          const remoteCats = JSON.stringify(data._config.categories);
          if (remoteCats !== JSON.stringify(CATEGORY_DEFS)) {
            CATEGORY_DEFS = data._config.categories;
            needsRender = true;
          }
        }
        if (data._config.design && JSON.stringify(data._config.design) !== JSON.stringify(currentDesign)) {
          currentDesign = { ...DESIGN_DEFAULTS, ...data._config.design };
          applyDesign(currentDesign);
        }
      }

      const before = JSON.stringify(CATEGORY_DEFS.map(c => menuState[c.id]));
      CATEGORY_DEFS.forEach(c => { if (data[c.id]) menuState[c.id] = data[c.id]; });
      const after = JSON.stringify(CATEGORY_DEFS.map(c => menuState[c.id]));

      const newTs = data._meta && (data._meta.lastUpdatedTs || data._meta.lastSentTs);
      const oldTs = menuState._meta && (menuState._meta.lastUpdatedTs || menuState._meta.lastSentTs);
      const metaChanged = newTs && newTs !== oldTs;

      if (after !== before || metaChanged || needsRender) {
        if (data._meta) { menuState._meta = data._meta; lsSet(LS_KEYS.lastUpdated, newTs || ''); }
        renderPublicView();
        updateLastUpdatedLabel();
      }
    } catch(e) {}
  }, 60000);
}

function stopPolling() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

function getLastUpdatedTs() {
  return (menuState._meta && menuState._meta.lastUpdatedTs) ||
    localStorage.getItem(LS_KEYS.lastUpdated) ||
    localStorage.getItem('hf_last_sent_ts');
}

function formatUpdatedAt(ts, prefix) {
  const d = new Date(parseInt(ts));
  return prefix +
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatRelativeTime(ts) {
  if (!ts) return null;
  const diffMs = Date.now() - parseInt(ts);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7)  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return formatUpdatedAt(ts, ''); // fall back to absolute for older timestamps
}

function updateLastUpdatedLabel() {
  const ts = getLastUpdatedTs();
  const el = document.getElementById('last-updated-label');
  if (ts) {
    const rel = formatRelativeTime(ts);
    const abs = formatUpdatedAt(ts, 'Last Updated: ');
    el.textContent = `Updated ${rel}`;
    el.title = abs;
  } else {
    el.textContent = 'Last Updated: —';
    el.title = '';
  }
  renderFooter();
}

function renderFooter() {
  const vEl = document.getElementById('footer-version');
  const tsEl = document.getElementById('footer-last-updated');
  if (!vEl || !tsEl) return;
  vEl.innerHTML = APP_VERSION +
    (IS_PREVIEW ? ' <span class="footer-preview-badge">PREVIEW</span>' : '');
  const ts = getLastUpdatedTs();
  if (ts) {
    tsEl.textContent = `Updated ${formatRelativeTime(ts)}`;
    tsEl.title = formatUpdatedAt(ts, 'Updated ');
  } else {
    tsEl.textContent = '';
    tsEl.title = '';
  }
}

// ─── PUBLIC VIEW ──────────────────────────────────────────────────────────────
function renderPublicView() {
  const container = document.getElementById('public-categories');
  container.innerHTML = '';
  const lastSentCats = menuState._meta && menuState._meta.lastSentCategories;
  CATEGORY_DEFS.forEach(cat => {
    const state = menuState[cat.id] || { items: [], lastSent: [] };
    const section = document.createElement('div');
    section.id = 'pub-section-' + cat.id;
    const isCollapsed = lastSentCats ? !lastSentCats.includes(cat.id) : false;
    section.className = 'menu-section' + (isCollapsed ? ' collapsed' : '');
    const onMenuItems = state.items.filter(i => i.onMenu !== false);
    const itemsHtml = onMenuItems.length
      ? onMenuItems.map(i => {
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
              <div class="dot" aria-hidden="true"></div>
              <span class="item-name-text">${escHtml(i.name)}</span>
              ${is86 ? `<span class="eighty-sixed-tag">86'D</span>` : ''}
              ${hasDetail ? `<span class="item-expand-icon" role="button" tabindex="0" aria-label="Show description" aria-expanded="false" onclick="event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))}">›</span>` : ''}
            </div>
            ${detailHtml}
          </div>`;
        }).join('')
      : `<div class="empty-menu">Nothing here yet — check back soon.</div>`;
    section.innerHTML = `
      <div class="menu-section-header collapsible-header" role="button" tabindex="0"
           aria-expanded="${isCollapsed ? 'false' : 'true'}"
           onclick="togglePublicCategory('${escHtml(cat.id)}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();togglePublicCategory('${escHtml(cat.id)}')}">
        <div class="menu-icon" style="background:${escHtml(cat.color)}">${escHtml(cat.icon)}</div>
        <div><div class="menu-section-title">${escHtml(cat.title)}</div><div class="menu-section-sub">${escHtml(cat.sub || '')}</div></div>
        <span class="category-chevron">›</span>
      </div>
      <div class="menu-items">${itemsHtml}</div>`;
    container.appendChild(section);
  });
  updateCollapseAllBtn();
}

function togglePublicDesc(el) {
  el.classList.toggle('expanded');
  const icon = el.querySelector('.item-expand-icon');
  if (icon) icon.setAttribute('aria-expanded', el.classList.contains('expanded') ? 'true' : 'false');
}

function togglePublicCategory(catId) {
  const section = document.getElementById('pub-section-' + catId);
  if (section) {
    section.classList.toggle('collapsed');
    const hdr = section.querySelector('.collapsible-header');
    if (hdr) hdr.setAttribute('aria-expanded', section.classList.contains('collapsed') ? 'false' : 'true');
  }
  updateCollapseAllBtn();
}

function toggleAllCategories() {
  const sections = document.querySelectorAll('#public-categories .menu-section');
  const anyExpanded = Array.from(sections).some(s => !s.classList.contains('collapsed'));
  sections.forEach(s => {
    s.classList.toggle('collapsed', anyExpanded);
    const hdr = s.querySelector('.collapsible-header');
    if (hdr) hdr.setAttribute('aria-expanded', anyExpanded ? 'false' : 'true');
  });
  updateCollapseAllBtn();
}

function updateCollapseAllBtn() {
  const btn = document.getElementById('collapse-all-btn');
  if (!btn) return;
  const sections = document.querySelectorAll('#public-categories .menu-section');
  const allCollapsed = Array.from(sections).every(s => s.classList.contains('collapsed'));
  btn.textContent = allCollapsed ? 'Expand All' : 'Collapse All';
}

// ─── SUPABASE AUTH (REST — no SDK) ───────────────────────────────────────────

async function sbSignUp(email, password, name) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password, data: { name } })
  });
  if (!r.ok) throw await r.json();
  return await r.json();
}

async function sbSignIn(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password })
  });
  if (!r.ok) throw await r.json();
  return await r.json();
}

async function sbRefreshToken(refreshToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  if (!r.ok) throw await r.json();
  return await r.json();
}

async function sbGetProfile(accessToken) {
  const r = await fetch('/api/role', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!r.ok) return { role: 'none', name: '' };
  const { role, name } = await r.json();
  return { role: role || 'none', name: name || '' };
}

async function sbResetPasswordForEmail(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, redirect_to: redirectTo })
  });
  if (!r.ok) throw await r.json();
}

async function sbUpdatePassword(newPassword, accessToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ password: newPassword })
  });
  if (!r.ok) throw await r.json();
  return await r.json();
}

function _scheduleTokenRefresh(expiresAt) {
  if (_tokenRefreshTimer) clearTimeout(_tokenRefreshTimer);
  const msUntilRefresh = Math.max(0, expiresAt - Date.now() - 5 * 60 * 1000);
  _tokenRefreshTimer = setTimeout(async () => {
    if (!currentUser) return;
    try {
      const data = await sbRefreshToken(currentUser.refreshToken);
      const expiresIn = (data.expires_in || 3600) * 1000;
      currentUser.accessToken  = data.access_token;
      currentUser.refreshToken = data.refresh_token;
      currentUser.expiresAt    = Date.now() + expiresIn;
      lsSet(LS_KEYS.accessToken,  currentUser.accessToken);
      lsSet(LS_KEYS.refreshToken, currentUser.refreshToken);
      lsSet(LS_KEYS.expiresAt,    String(currentUser.expiresAt));
      _scheduleTokenRefresh(currentUser.expiresAt);
    } catch(e) {
      // Refresh failed — sign out silently
      signOut();
    }
  }, msUntilRefresh);
}

function _applySession(data, role, name) {
  const expiresIn = (data.expires_in || 3600) * 1000;
  const userId = data.user?.id || data.user_id || '';
  const email = data.user?.email || data.email || '';
  currentUser = {
    uid: userId, email, name: name || '', role,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + expiresIn,
  };
  lsSet(LS_KEYS.accessToken,  currentUser.accessToken);
  lsSet(LS_KEYS.refreshToken, currentUser.refreshToken);
  lsSet(LS_KEYS.expiresAt,    String(currentUser.expiresAt));
  _scheduleTokenRefresh(currentUser.expiresAt);
}

function renderUserHeader() {
  const signedIn  = !!currentUser;
  const role      = currentUser?.role || 'none';
  const isManager = role === 'manager' || role === 'admin';
  const name      = currentUser?.name || '';
  const parts     = name.trim().split(/\s+/).filter(Boolean);
  const initials  = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.[0] || '?').toUpperCase();
  const roleLabel = { none: 'User', manager: 'Manager', admin: 'Admin' }[role] || 'User';

  document.getElementById('signin-btn').style.display = signedIn ? 'none' : '';
  document.getElementById('user-chip').style.display  = signedIn ? '' : 'none';
  document.getElementById('action-btn').style.display = signedIn ? '' : 'none';

  if (signedIn) {
    document.getElementById('user-initials').textContent      = initials;
    document.getElementById('user-dropdown-name').textContent = name || currentUser?.email || '';
    document.getElementById('user-dropdown-role').textContent = roleLabel;
    document.getElementById('action-btn').textContent = isManager ? '⚙ Manager' : '⚙ Settings';
  }
}

function applyRole(role) {
  const isManager = role === 'manager' || role === 'admin';
  const isAdmin   = role === 'admin';
  document.getElementById('tab-btn-admin').style.display    = isAdmin ? '' : 'none';
  document.getElementById('tab-btn-database').style.display = isAdmin ? '' : 'none';
  const pruneSection = document.getElementById('prune-section');
  if (pruneSection) pruneSection.style.display = isAdmin ? '' : 'none';
  renderUserHeader();
}

// ─── AUTH OVERLAY ─────────────────────────────────────────────────────────────
function onActionBtnClick() {
  const role = currentUser?.role || 'none';
  const isManager = role === 'manager' || role === 'admin';
  if (isManager) {
    if (isManagerMode) exitManager(); else enterManager();
  } else {
    showToast('Settings coming soon.', 'info');
  }
}

function toggleUserDropdown() {
  const chip = document.getElementById('user-chip');
  const isOpen = chip.classList.toggle('open');
  chip.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) {
    const firstFocusable = document.querySelector('#user-dropdown button, #user-dropdown a');
    if (firstFocusable) firstFocusable.focus();
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const chip = document.getElementById('user-chip');
  if (chip && !chip.contains(e.target)) {
    chip.classList.remove('open');
    chip.setAttribute('aria-expanded', 'false');
  }
});

// Close dropdown on Escape
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  const chip = document.getElementById('user-chip');
  if (chip && chip.classList.contains('open')) {
    chip.classList.remove('open');
    chip.setAttribute('aria-expanded', 'false');
    chip.focus();
  }
});

// ─── KEYBOARD SHORTCUTS ──────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (!isManagerMode) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    saveMenu();
  }
});

let _authFocusBefore = null;

function _authFocusTrap(e) {
  if (e.key === 'Escape') { closeAuthOverlay(); return; }
  if (e.key !== 'Tab') return;
  const box = document.querySelector('#auth-overlay .auth-box');
  const focusable = Array.from(
    box.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])')
  ).filter(el => !el.disabled && el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
  }
}

function openAuthOverlay(screen) {
  _authFocusBefore = document.activeElement;
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.add('open');
  const noConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;
  document.getElementById('auth-no-config').style.display = noConfig ? '' : 'none';
  document.getElementById('auth-form-wrap').style.display = noConfig ? 'none' : '';
  if (!noConfig) renderAuthScreen(screen || 'signin');
  document.addEventListener('keydown', _authFocusTrap);
}

function closeAuthOverlay() {
  document.getElementById('auth-overlay').classList.remove('open');
  document.removeEventListener('keydown', _authFocusTrap);
  if (_authFocusBefore && typeof _authFocusBefore.focus === 'function') _authFocusBefore.focus();
  _authFocusBefore = null;
  _recoverySessionData = null;
}

function renderAuthScreen(screen) {
  _authScreen = screen;
  ['signin', 'signup', 'forgot', 'reset'].forEach(s => {
    const el = document.getElementById(`auth-screen-${s}`);
    if (el) el.style.display = s === screen ? '' : 'none';
  });
  const errEl = document.getElementById(`${screen}-error`);
  if (errEl) errEl.textContent = '';
  const box = document.getElementById('auth-box');
  const titles = { signin: 'Sign In', signup: 'Create Account', forgot: 'Reset Password', reset: 'Set New Password' };
  if (box) box.setAttribute('aria-label', titles[screen] || 'Sign In');
  const firstInput = document.querySelector(`#auth-screen-${screen} input`);
  if (firstInput) setTimeout(() => firstInput.focus(), 0);
}

async function handleSignIn() {
  const email    = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const errEl    = document.getElementById('signin-error');
  const btn      = document.getElementById('signin-submit-btn');
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
  btn.disabled = true;
  btn.textContent = 'Signing in\u2026';
  errEl.textContent = '';
  try {
    const data = await sbSignIn(email, password);
    const { role, name } = await sbGetProfile(data.access_token);
    _applySession(data, role, name);
    closeAuthOverlay();
    applyRole(role);
    if (role === 'none') showToast('Signed in. Contact admin to get manager access.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Authentication failed.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleSignUp() {
  const firstName = document.getElementById('signup-firstname').value.trim();
  const lastName  = document.getElementById('signup-lastname').value.trim();
  const email     = document.getElementById('signup-email').value.trim();
  const password  = document.getElementById('signup-password').value;
  const errEl     = document.getElementById('signup-error');
  const btn       = document.getElementById('signup-submit-btn');
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
  btn.disabled = true;
  btn.textContent = 'Creating account\u2026';
  errEl.textContent = '';
  try {
    const name = [firstName, lastName].filter(Boolean).join(' ');
    await sbSignUp(email, password, name);
    closeAuthOverlay();
    showToast('Account created. Contact admin to activate manager access.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Sign-up failed.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const btn   = document.getElementById('forgot-submit-btn');
  if (!email) { errEl.textContent = 'Enter your email address.'; return; }
  btn.disabled = true;
  btn.textContent = 'Sending\u2026';
  errEl.textContent = '';
  try {
    await sbResetPasswordForEmail(email);
    closeAuthOverlay();
    showToast('Check your email for a password reset link.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Failed to send reset email.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Reset Link';
  }
}

async function handleResetPassword() {
  const password = document.getElementById('reset-password').value;
  const confirm  = document.getElementById('reset-confirm').value;
  const errEl    = document.getElementById('reset-error');
  const btn      = document.getElementById('reset-submit-btn');
  if (!password) { errEl.textContent = 'Enter a new password.'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (!_recoverySessionData) { errEl.textContent = 'Reset session expired. Please request a new link.'; return; }
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';
  errEl.textContent = '';
  try {
    await sbUpdatePassword(password, _recoverySessionData.access_token);
    const { role, name } = await sbGetProfile(_recoverySessionData.access_token);
    _applySession(_recoverySessionData, role, name);
    _recoverySessionData = null;
    closeAuthOverlay();
    applyRole(role);
    showToast('Password updated. You are now signed in.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Failed to update password.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set Password';
  }
}

function signOut() {
  currentUser = null;
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  localStorage.removeItem(LS_KEYS.accessToken);
  localStorage.removeItem(LS_KEYS.refreshToken);
  localStorage.removeItem(LS_KEYS.expiresAt);
  if (isManagerMode) exitManager();
  renderUserHeader();
}

// ─── MANAGER MODE ─────────────────────────────────────────────────────────────
function enterManager() {
  isManagerMode = true;
  stopPolling();
  document.body.classList.add('manager-mode');
  document.getElementById('public-view').style.display = 'none';
  document.getElementById('loading-view').style.display = 'none';
  document.getElementById('manager-view').style.display = 'block';
  document.getElementById('action-btn').textContent = '✕ Exit';
  document.getElementById('action-btn').classList.add('active');
  if (isFirstSetup) document.getElementById('setup-banner').style.display = 'block';
  document.getElementById('fb-url-input').value    = FB_URL    || '';
  document.getElementById('bot-id-input').value    = BOT_ID    ? '••••••••••••••••' : '';
  document.getElementById('menu-url-input').value  = MENU_URL  || '';
  switchTab('manager');
  updateDraftIndicator();
  renderManagerCategories();
}

function exitManager() {
  isManagerMode = false;
  document.body.classList.remove('manager-mode');
  document.getElementById('manager-view').style.display = 'none';
  const role = currentUser?.role || 'none';
  const isManager = role === 'manager' || role === 'admin';
  document.getElementById('action-btn').textContent = isManager ? '⚙ Manager' : '⚙ Settings';
  document.getElementById('action-btn').classList.remove('active');
  showPublicView();
}

// ─── CONFIG SAVES ─────────────────────────────────────────────────────────────
async function saveFirebaseConfig() {
  const urlVal = document.getElementById('fb-url-input').value.trim().replace(/\/+$/, '');
  if (!urlVal) { showToast('No changes made.', 'info'); return; }
  FB_URL = urlVal; lsSet(LS_KEYS.fbUrl, FB_URL);
  document.getElementById('setup-banner').style.display = 'none';
  isFirstSetup = false;
  await persistState();
  showToast('✅ Firebase config saved!', 'success');
}
function saveBotId() {
  const val = document.getElementById('bot-id-input').value.trim();
  if (!val || val.startsWith('•')) { showToast('No changes made.', 'info'); return; }
  BOT_ID = val;
  document.getElementById('bot-id-input').value = '••••••••••••••••';
  showConfigModal();
}
async function saveMenuUrl() {
  const val = document.getElementById('menu-url-input').value.trim();
  if (!val) { showToast('Enter a URL first.', 'info'); return; }
  MENU_URL = val; lsSet(LS_KEYS.menuUrl, MENU_URL);
  await persistState();
  showToast('✅ Menu URL saved!', 'success');
}
// ─── MANAGER CATEGORY EDIT ───────────────────────────────────────────────────
function renderManagerCategories() {
  const container = document.getElementById('manager-categories');
  container.innerHTML = '';
  CATEGORY_DEFS.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.id = 'mgr-card-' + cat.id;
    card.innerHTML = `
      <div class="cat-header collapsible-header" role="button" tabindex="0"
           aria-expanded="true"
           onclick="toggleManagerCategory('${escHtml(cat.id)}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleManagerCategory('${escHtml(cat.id)}')}">
        <div class="cat-icon" style="background:${escHtml(cat.color)}">${escHtml(cat.icon)}</div>
        <div><div class="cat-title">${escHtml(cat.title)}</div><div class="cat-sub">${escHtml(cat.sub || '')}</div></div>
        <span class="category-chevron">›</span>
      </div>
      <div class="current-section">
        <div class="current-label">On Menu Now</div>
        <div class="current-items" id="mgr-items-${escHtml(cat.id)}"></div>
        <div class="add-item-wrap">
          <div class="add-item-area">
            <input class="add-item-input" id="new-input-${escHtml(cat.id)}" type="text" placeholder="${escHtml(cat.placeholder || 'Add item...')}"
              oninput="showAutocomplete('${escHtml(cat.id)}')"
              onblur="setTimeout(()=>hideAutocomplete('${escHtml(cat.id)}'),150)"
              onkeydown="handleAddItemKeydown(event,'${escHtml(cat.id)}')"/>
            <button class="add-item-btn" onclick="addItem('${escHtml(cat.id)}')" aria-label="Add item to ${escHtml(cat.label)}">+</button>
          </div>
          <div class="autocomplete-list" id="ac-${escHtml(cat.id)}"></div>
        </div>
      </div>`;
    container.appendChild(card);
    renderManagerItems(cat.id);
  });
}

function toggleManagerCategory(catId) {
  const card = document.getElementById('mgr-card-' + catId);
  if (card) {
    card.classList.toggle('collapsed');
    const hdr = card.querySelector('.collapsible-header');
    if (hdr) hdr.setAttribute('aria-expanded', card.classList.contains('collapsed') ? 'false' : 'true');
  }
}

function renderManagerItems(catId) {
  const state = menuState[catId] || { items: [], lastSent: [] };
  const lastSentNames = new Set(state.lastSent.filter(i => i.onMenu !== false).map(i => i.name.trim().toLowerCase()));
  const visibleItems = state.items.filter(i => i.onMenu !== false);
  const listEl = document.getElementById('mgr-items-' + catId);
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!visibleItems.length) {
    const cat = CATEGORY_DEFS.find(c => c.id === catId);
    const ph = cat?.placeholder ? ` Try: "${escHtml(cat.placeholder)}"` : '';
    listEl.innerHTML = `<div class="empty-state"><span class="empty-state-icon">+</span><span>Nothing here yet.${ph}</span></div>`;
    return;
  }
  visibleItems.forEach(item => {
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
        <div class="item-status-dot" role="img" aria-label="${statusTitle}" title="${statusTitle}"></div>
        <div class="item-name"><input type="text" value="${escHtml(item.name)}"
          aria-label="Item name"
          onblur="renameItem('${catId}','${item.id}',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()"/></div>
        <button class="desc-btn${hasDesc ? ' has-desc' : ''}" title="Add description" onclick="toggleItemDesc('${item.id}')">📝</button>
        <button class="recipe-btn${hasRecipe ? ' has-recipe' : ''}" title="Add recipe" onclick="toggleItemRecipe('${item.id}')">🧪</button>
        <button class="eighty-six-btn${is86 ? ' restore' : ''}" title="${is86 ? 'Restore to menu' : "86 this item"}" onclick="toggle86('${catId}','${item.id}')">${is86 ? '↩' : '86'}</button>
        <button class="del-item" onclick="removeItem('${catId}','${item.id}')" aria-label="Remove ${escHtml(item.name)}">×</button>
      </div>
      <div class="desc-row" id="desc-row-${item.id}">
        <textarea class="desc-input" aria-label="Item description" placeholder="Ingredients, description, how to sell it..."
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
  if (!FB_URL || !currentUser?.accessToken) return;
  try {
    menuState._config = {
      menuUrl: MENU_URL, fbUrl: FB_URL,
      categories: CATEGORY_DEFS,
      design: currentDesign,
    };
    await fbWrite(menuState);
    const syncEl = document.getElementById('sync-status');
    if (syncEl) { syncEl.textContent = ''; syncEl.className = ''; }
  } catch(e) {
    const syncEl = document.getElementById('sync-status');
    if (syncEl) { syncEl.textContent = '⚠️ Cloud sync failed'; syncEl.className = 'sync-error'; }
    showToast('⚠️ Cloud save failed — check Firebase config in Admin settings.', 'error');
  }
}

async function saveMenu() {
  const ts = Date.now();
  menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: ts.toString() };
  lsSet(LS_KEYS.lastUpdated, ts.toString());
  await persistState();
  updateLastUpdatedLabel();
  showToast('✅ Menu saved!', 'success');
}

function addItem(catId) {
  const input = document.getElementById('new-input-' + catId);
  const name = input.value.trim();
  if (!name) return;
  const nameLower = name.toLowerCase();
  if (!menuState[catId]) menuState[catId] = { items: [], lastSent: [] };
  const alreadyOnMenu = menuState[catId].items.find(
    i => i.onMenu !== false && i.name.toLowerCase() === nameLower
  );
  if (!alreadyOnMenu) {
    const offMenu = menuState[catId].items.find(
      i => i.onMenu === false && i.name.toLowerCase() === nameLower
    );
    if (offMenu) { offMenu.onMenu = true; }
    else { menuState[catId].items.push({ id: uid(), name, desc: '', recipe: [], eightySixed: false, onMenu: true }); }
  }
  input.value = '';
  hideAutocomplete(catId);
  invalidateDiff();
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
  const matches = (menuState[catId]?.items || []).filter(i => i.onMenu === false && i.name.toLowerCase().startsWith(val.toLowerCase()));
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
  const item = findItem(catId, itemId);
  if (!item) return;
  item.eightySixed = !item.eightySixed;
  invalidateDiff();
  renderManagerItems(catId);
  updateDraftIndicator();
  const wrapper = document.getElementById('wrapper-' + itemId);
  if (wrapper) {
    const cls = item.eightySixed ? 'flash-86' : 'flash-restore';
    wrapper.classList.add(cls);
    setTimeout(() => wrapper.classList.remove(cls), 400);
  }
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
  const item = findItem(catId, itemId);
  if (!item) return;
  const list = document.getElementById('recipe-list-' + itemId);
  if (!list) return;
  const ingredients = recipeArray(item.recipe);
  list.innerHTML = ingredients.map((ing, idx) =>
    `<div class="ingredient-row">
      <span class="ingredient-text">${escHtml(ing)}</span>
      <button class="del-ingredient" onclick="removeIngredient('${catId}','${itemId}',${idx})" aria-label="Remove ingredient">×</button>
    </div>`
  ).join('');
}

async function addIngredient(catId, itemId) {
  const input = document.getElementById('ingredient-input-' + itemId);
  const val = input.value.trim();
  if (!val) return;
  const item = findItem(catId, itemId);
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
  const item = findItem(catId, itemId);
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
  const item = findItem(catId, itemId);
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
  const item = findItem(catId, itemId);
  if (!item) return false;
  item.onMenu = false;
  invalidateDiff();
  renderManagerItems(catId);
  updateDraftIndicator();
  const removedName = item.name;
  showToast(`"${removedName}" removed`, 'info', () => {
    item.onMenu = true;
    invalidateDiff();
    renderManagerItems(catId);
    updateDraftIndicator();
    showToast(`"${removedName}" restored`, 'success');
  });
  return true;
}

function renderPruneSection() {
  const isAdmin = currentUser?.role === 'admin';
  const section = document.getElementById('prune-section');
  section.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) return;
  const wrap = document.getElementById('prune-items-wrap');
  const allOffMenu = [];
  CATEGORY_DEFS.forEach(cat => {
    (menuState[cat.id]?.items || []).filter(i => i.onMenu === false).forEach(item => {
      allOffMenu.push({ catId: cat.id, catTitle: cat.title, name: item.name });
    });
  });
  allOffMenu.sort((a, b) => a.name.localeCompare(b.name));
  if (!allOffMenu.length) {
    wrap.innerHTML = '<p class="prune-empty">No off-menu items to remove.</p>';
    return;
  }
  wrap.innerHTML = allOffMenu.map(({ catId, catTitle, name }) => `
    <div class="prune-item">
      <span class="prune-item-name">${escHtml(name)}</span>
      <span class="prune-item-cat">${escHtml(catTitle)}</span>
      <button class="btn-small btn-danger prune-del-btn" data-catid="${escHtml(catId)}" data-name="${escHtml(name)}">×</button>
    </div>`).join('');
}

async function pruneSingleItem(catId, itemName) {
  if (currentUser?.role !== 'admin') return;
  if (!menuState[catId]) return;
  menuState[catId].items = menuState[catId].items.filter(
    i => !(i.onMenu === false && i.name === itemName)
  );
  await persistState();
  renderPruneSection();
  showToast(`✅ "${itemName}" permanently deleted.`, 'success');
}

async function pruneRemoved(catId) {
  if (currentUser?.role !== 'admin') return;
  const cats = catId === 'all' ? CATEGORY_DEFS.map(c => c.id) : [catId];
  cats.forEach(id => { if (menuState[id]) menuState[id].items = menuState[id].items.filter(i => i.onMenu !== false); });
  await persistState();
  renderPruneSection();
  showToast('✅ Off-menu items permanently deleted.', 'success');
}

function renameItem(catId, itemId, newName) {
  const name = newName.trim();
  if (!name) {
    const item = findItem(catId, itemId);
    const removed = removeItem(catId, itemId);
    if (!removed && item) {
      const input = document.querySelector(`#wrapper-${itemId} .item-name input`);
      if (input) input.value = item.name;
    }
    return;
  }
  const item = findItem(catId, itemId);
  if (item && item.name !== name) { item.name = name; invalidateDiff(); renderManagerItems(catId); updateDraftIndicator(); }
}

// ─── DRAFT INDICATOR ─────────────────────────────────────────────────────────
function updateDraftIndicator() {
  const btn = document.getElementById('send-btn');
  if (!btn) return;
  const diff = getCachedDiff();
  const total = diff.reduce((n, s) => n + s.added.length + s.removed.length + s.eightySixed.length + s.restored.length, 0);
  if (total > 0) {
    btn.innerHTML = `🔥 SEND UPDATE <span class="send-update-count">(${total} CHANGE${total > 1 ? 'S' : ''})</span>`;
    btn.style.boxShadow = '0 4px 22px rgba(255,77,0,0.55)';
  } else {
    btn.innerHTML = '🔥 SEND UPDATE';
    btn.style.boxShadow = '';
  }
}

// ─── DIFF ─────────────────────────────────────────────────────────────────────
function restoreLabel(catId) {
  const cat = CATEGORY_DEFS.find(c => c.id === catId);
  if (cat && cat.title.toLowerCase().includes('tap')) return 'Back on Tap';
  return 'Back in Stock';
}

function computeDiff() {
  const results = [];
  CATEGORY_DEFS.forEach(cat => {
    const state = menuState[cat.id] || { items: [], lastSent: [] };
    const lastByName = new Map(state.lastSent.map(i => [i.name.trim().toLowerCase(), i]));
    const eightySixed = [], restored = [];
    const eightySixedNames = new Set(), restoredNames = new Set();
    state.items.filter(i => i.onMenu !== false).forEach(item => {
      const nameLow = item.name.trim().toLowerCase();
      const prev = lastByName.get(nameLow);
      if (prev && prev.onMenu !== false) {
        if (!prev.eightySixed &&  item.eightySixed) { eightySixed.push(item.name.trim()); eightySixedNames.add(nameLow); }
        if ( prev.eightySixed && !item.eightySixed) { restored.push(item.name.trim());    restoredNames.add(nameLow); }
      }
    });
    const currentNames = state.items.filter(i => i.onMenu !== false && !i.eightySixed).map(i => i.name.trim()).filter(Boolean);
    const lastNames    = state.lastSent.filter(i => i.onMenu !== false && !i.eightySixed).map(i => i.name.trim()).filter(Boolean);
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
  const diff = getCachedDiff();
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
      let html = `<div class="preview-cat">${escHtml(s.icon)} ${escHtml(s.label)}</div>`;
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
  const diff = getCachedDiff();
  if (!diff.length) { closeModal(); return; }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });

  const cleanName = n => n.replace(/[\r\n]+/g, ' ').trim();
  let lines = [`🔥 DRINK MENU UPDATES — ${dateStr} ${timeStr}`, ''];
  diff.forEach(s => {
    lines.push(`${s.icon} ${s.label.toUpperCase()}`);
    s.added.forEach(n       => lines.push(`  ✅ + ${cleanName(n)}`));
    s.removed.forEach(n     => lines.push(`  ❌ - ${cleanName(n)}`));
    s.eightySixed.forEach(n => lines.push(`  🚫 86'd: ${cleanName(n)}`));
    s.restored.forEach(n    => lines.push(`  ✅ ${restoreLabel(s.id)}: ${cleanName(n)}`));
    lines.push('');
  });
  if (MENU_URL) lines.push(`📋 Full menu: ${MENU_URL}`);
  const patchMessage = lines.join('\n').trim();

  if (patchMessage.length > 1000) {
    showToast('Update is long and will be truncated in GroupMe.', 'info');
  }

  const confirmBtn = document.getElementById('confirm-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'SENDING...';

  try {
    const authHeaders = currentUser?.accessToken
      ? { 'Authorization': `Bearer ${currentUser.accessToken}` }
      : {};
    const r1 = await fetch('/api/send-groupme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ text: patchMessage })
    });

    if (r1.status === 202) {
      const ts = Date.now();
      CATEGORY_DEFS.forEach(cat => {
        if (menuState[cat.id]) menuState[cat.id].lastSent = (menuState[cat.id].items || []).map(i => ({...i}));
      });
      menuState._meta = { lastUpdatedTs: ts.toString(), lastSentCategories: diff.map(d => d.id) };
      lsSet(LS_KEYS.lastUpdated, ts.toString());
      invalidateDiff();
      await persistState();
      updateLastUpdatedLabel();
      renderManagerCategories();
      updateDraftIndicator();
      closeModal();
      showToast('✅ Drink menu update sent!', 'success');
    } else if (r1.status === 401) {
      showToast('❌ Not authorized. Please sign in.', 'error');
    } else if (r1.status === 403) {
      showToast('❌ Access denied. Your account role does not allow sending updates.', 'error');
    } else {
      showToast('❌ GroupMe error. Check GROUPME_BOT_ID env var.', 'error');
    }
  } catch(e) {
    showToast('❌ Network error. Check connection.', 'error');
  }

  confirmBtn.disabled = false;
  confirmBtn.textContent = 'SEND TO GROUP';
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let _toastUndoTimer = null;
function showToast(msg, type='info', undoCallback=null) {
  if (_toastUndoTimer) { clearTimeout(_toastUndoTimer); _toastUndoTimer = null; }
  const t = document.getElementById('toast');
  t.className = `toast ${type} show`;
  if (undoCallback) {
    t.innerHTML = `<span>${escHtml(msg)}</span><button class="toast-undo-btn" onclick="_toastUndo()">Undo</button>`;
    window._toastUndoCallback = undoCallback;
    _toastUndoTimer = setTimeout(() => { t.classList.remove('show'); window._toastUndoCallback = null; }, 5000);
  } else {
    t.textContent = msg;
    window._toastUndoCallback = null;
    _toastUndoTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
}
function _toastUndo() {
  if (typeof window._toastUndoCallback === 'function') {
    window._toastUndoCallback();
    window._toastUndoCallback = null;
  }
  const t = document.getElementById('toast');
  t.classList.remove('show');
  if (_toastUndoTimer) { clearTimeout(_toastUndoTimer); _toastUndoTimer = null; }
}

document.getElementById('modal-bg').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-bg')) closeModal();
});

document.getElementById('prune-all-btn').addEventListener('click', () => {
  if (!confirm('Permanently delete ALL off-menu items? This cannot be undone.')) return;
  pruneRemoved('all');
});

document.getElementById('prune-items-wrap').addEventListener('click', e => {
  const btn = e.target.closest('.prune-del-btn');
  if (!btn) return;
  pruneSingleItem(btn.dataset.catid, btn.dataset.name);
});

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
function switchTab(name) {
  ['manager','categories','admin','database'].forEach(t => {
    const btn   = document.getElementById('tab-btn-'   + t);
    const panel = document.getElementById('tab-panel-' + t);
    if (btn)   { btn.classList.toggle('active', t === name); btn.setAttribute('aria-selected', t === name ? 'true' : 'false'); }
    if (panel) panel.classList.toggle('active', t === name);
  });
  if (name === 'database')   { renderDatabaseTab(); renderPruneSection(); }
  if (name === 'categories') { renderCategoriesTab(); }
  if (name === 'admin')      { renderDesignSection(); }
}

const dbFilters = { recipe: 'all', status: 'all' };

function setDbFilter(key, value) {
  dbFilters[key] = value;
  document.querySelectorAll(`#db-filter-${key} .db-filter-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
  renderDatabaseTab();
}

function renderDatabaseTab() {
  const wrap = document.getElementById('db-table-wrap');
  try {
    const query = (document.getElementById('db-search').value || '').toLowerCase().trim();
    const rows = [];
    let totalItems = 0;

    CATEGORY_DEFS.forEach(cat => {
      const all = (menuState[cat.id]?.items || []);
      totalItems += all.length;
      all.forEach(item => {
        const recipe = recipeArray(item.recipe);
        rows.push({ name: item.name, category: cat.title, recipe, onMenu: item.onMenu, eightySixed: !!item.eightySixed });
      });
    });

    let filtered = rows;
    if (dbFilters.recipe === 'yes') filtered = filtered.filter(r => r.recipe.length > 0);
    if (dbFilters.recipe === 'no')  filtered = filtered.filter(r => r.recipe.length === 0);
    if (dbFilters.status === 'on')  filtered = filtered.filter(r => r.onMenu);
    if (dbFilters.status === 'off') filtered = filtered.filter(r => !r.onMenu);
    if (query) {
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.category.toLowerCase().includes(query) ||
        r.recipe.some(ing => ing.toLowerCase().includes(query))
      );
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (!filtered.length) {
      wrap.innerHTML = totalItems === 0
        ? '<p class="db-empty">No menu items loaded. Check your Firebase connection in the Admin tab.</p>'
        : '<p class="db-empty">No items match the current filters.</p>';
      return;
    }

    wrap.innerHTML = `
      <table class="db-table">
        <thead><tr><th>Drink</th><th>Category</th><th>Recipe</th><th>Status</th></tr></thead>
        <tbody>${filtered.map(r => `
          <tr>
            <td class="db-name">${escHtml(r.name)}</td>
            <td class="db-cat">${escHtml(r.category)}</td>
            <td class="db-recipe">${r.recipe.length ? r.recipe.map(ing => `<span class="db-ing">${escHtml(ing)}</span>`).join('') : '<span class="db-no-recipe">—</span>'}</td>
            <td>${r.eightySixed ? '<span class="db-badge db-badge--86">86\'d</span>' : r.onMenu ? '<span class="db-badge db-badge--on">On Menu</span>' : '<span class="db-badge db-badge--off">Off Menu</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    wrap.innerHTML = `<p class="db-empty db-error">Error rendering database: ${escHtml(String(e))}</p>`;
  }
}

function filterDatabase() { renderDatabaseTab(); }

// ─── RELATIVE TIMESTAMP REFRESH ──────────────────────────────────────────────
setInterval(() => {
  updateLastUpdatedLabel();
}, 60000);

// ─── AUTH OVERLAY KEYBOARD SUPPORT ───────────────────────────────────────────
(function() {
  // Sign In: email Enter → focus password; password Enter → submit
  document.getElementById('signin-email').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('signin-password').focus();
  });
  document.getElementById('signin-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleSignIn();
  });
  // Sign Up: password Enter → submit
  document.getElementById('signup-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleSignUp();
  });
  // Forgot: email Enter → submit
  document.getElementById('forgot-email').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleForgotPassword();
  });
  // Reset: confirm Enter → submit
  document.getElementById('reset-confirm').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleResetPassword();
  });
})();

init();
