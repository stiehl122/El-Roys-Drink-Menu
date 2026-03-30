// ─── CONFIG ───────────────────────────────────────────────────────────────────
const APP_VERSION = 'v0.7.3';
const IS_PREVIEW = (window.location.hostname.endsWith('.vercel.app') &&
  window.location.hostname !== 'el-roys-drink-menu.vercel.app') ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const LS_KEYS = {
  menuId:       'hf_menu_id',
  menuUrl:      'hf_menu_url',
  menuCache:    'hf_menu_cache',
  lastUpdated:  'hf_last_updated_ts',
  accessToken:  'hf_sb_access_token',
  refreshToken: 'hf_sb_refresh_token',
  expiresAt:    'hf_sb_expires_at',
  uid:          'hf_sb_uid',
  email:        'hf_sb_email',
};

let BOT_ID        = '';
let NOTIFICATIONS = null; // per-menu notification channel config from menu_meta.notifications
let MENU_URL  = localStorage.getItem(LS_KEYS.menuUrl) || '';
let MENU_ID   = localStorage.getItem(LS_KEYS.menuId)  || '';

let SUPABASE_URL      = '';
let SUPABASE_ANON_KEY = '';
let currentUser = null; // { uid, email, name, accessToken, refreshToken, role, expiresAt }

let isManagerMode = false;
let isAdminMode   = false;
let _adminRestaurants   = [];
let _adminAllMenus      = [];
let _adminSwitcherState = { notif: { restaurantId: '', menuId: '' }, design: { restaurantId: '', menuId: '' } };
let syncInterval  = null;
let _tokenRefreshTimer = null;
let _authScreen        = 'signin'; // 'signin' | 'signup' | 'forgot' | 'reset'
let _recoverySessionData = null;   // set when app detects a Supabase recovery URL hash
let _menuPickerNeeded  = false;     // true when multiple menus exist and no slug was given
let _invalidMenuSlug   = null;      // set when ?menu= slug resolved to nothing
let _activeMenuName    = '';        // display name of the currently loaded menu
let RESTAURANT_ID      = '';        // restaurant_id for the active menu
let MENU_TYPE          = 'drinks';  // 'drinks' | 'food'
let _hasMultipleMenus  = false;     // true once we know multiple menus exist
let _managerMenuPicked = false;     // true after manager explicitly picks a menu this session
let _pickerFocusBefore = null;
let _pickerOnSelect    = null;     // callback invoked after selectMenu()

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

const DEFAULT_FOOD_CATEGORY_DEFS = [
  { key: 'starters', label: '🥗 Starters', icon: '🥗', color: ICON_COLOR_PALETTE[4], sub: '', placeholder: 'e.g. Chips & Salsa...' },
  { key: 'tacos',    label: '🌮 Tacos',     icon: '🌮', color: ICON_COLOR_PALETTE[0], sub: '', placeholder: 'e.g. Al Pastor...'    },
  { key: 'entrees',  label: '🍽 Entrees',   icon: '🍽', color: ICON_COLOR_PALETTE[1], sub: '', placeholder: 'e.g. Enchiladas...'   },
  { key: 'sides',    label: '🫘 Sides',     icon: '🫘', color: ICON_COLOR_PALETTE[2], sub: '', placeholder: 'e.g. Mexican Rice...' },
  { key: 'desserts', label: '🍮 Desserts',  icon: '🍮', color: ICON_COLOR_PALETTE[3], sub: '', placeholder: 'e.g. Flan...'         },
];

let CATEGORY_DEFS = DEFAULT_CATEGORY_DEFS.map(c => ({...c}));

// Reserved key for items orphaned by category deletion — never rendered in UI
const UNCATEGORIZED_ID = '__uncategorized__';

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

function uid() { return crypto.randomUUID(); }
function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// Escape a string for safe embedding inside an inline JS string within an HTML attribute.
// Uses JSON.stringify (which handles quotes/backslashes) then HTML-escapes the result.
function escAttrJs(s) { return escHtml(JSON.stringify(String(s))); }
function lsSet(key, val) {
  try { localStorage.setItem(key, val); }
  catch(e) { showToast('⚠️ Storage full — data not saved locally.', 'error'); }
}
function findItem(catId, itemId) {
  return menuState[catId]?.items.find(i => i.id === itemId) ?? null;
}
let _diffCache = null;
let _diffDirty = true;
let _dirty = false;
let _pollFailCount = 0;
let _deletedItemIds    = new Set();  // item UUIDs to DELETE on next persistState()
let _uncatCategoryUuid = '';         // DB UUID of the __uncategorized__ category row
function invalidateDiff() { _diffDirty = true; _dirty = true; updateSaveBtn(); }
function updateSaveBtn() { const btn = document.getElementById('save-btn'); if (btn) btn.disabled = !_dirty; }
function getCachedDiff() {
  if (_diffDirty) { _diffCache = computeDiff(); _diffDirty = false; }
  return _diffCache;
}

// ─── SUPABASE DATA LAYER ──────────────────────────────────────────────────────

function sbHeaders(extra = {}) {
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${currentUser?.accessToken || SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

// Resolve which menu to load based on ?menu={slug}, localStorage cache, or
// auto-selection. Sets MENU_ID, pushes slug to URL for single-menu sites,
// or sets _menuPickerNeeded / _invalidMenuSlug for multi-menu / bad-slug cases.
async function sbResolveMenu() {
  const slug = new URLSearchParams(location.search).get('menu');

  if (slug) {
    // Load menu by URL slug — also check for siblings in background
    const [menuRes, countRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/menus?slug=eq.${encodeURIComponent(slug)}&select=id,name,type,restaurant_id`,
        { headers: sbHeaders() }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/menus?select=id&archived=eq.false&limit=2`,
        { headers: sbHeaders() }
      ),
    ]);
    if (countRes.ok) {
      const siblings = await countRes.json();
      if (siblings.length > 1) _hasMultipleMenus = true;
    }
    if (menuRes.ok) {
      const [menu] = await menuRes.json();
      if (menu?.id) {
        MENU_ID       = menu.id;
        _activeMenuName = menu.name || '';
        MENU_TYPE     = menu.type          || 'drinks';
        RESTAURANT_ID = menu.restaurant_id || '';
        lsSet(LS_KEYS.menuId, MENU_ID);
        return;
      }
    }
    // Slug present but not found
    _invalidMenuSlug = slug;
    return;
  }

  // No URL slug — returning visitor (MENU_ID cached) or auto-resolve
  if (MENU_ID) {
    // Enrich cached MENU_ID: fetch name/slug/type (for active-menu-bar) + sibling count in parallel
    const [nameRes, countRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/menus?id=eq.${MENU_ID}&select=name,slug,type,restaurant_id,archived`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/menus?select=id&archived=eq.false&limit=2`, { headers: sbHeaders() }),
    ]);
    if (nameRes.ok) {
      const [menu] = await nameRes.json();
      if (menu?.archived === true) {
        // Cached menu was archived — clear it and fall through to picker
        MENU_ID = ''; RESTAURANT_ID = '';
        lsSet(LS_KEYS.menuId, '');
      } else if (menu) {
        if (menu.name)          _activeMenuName = menu.name;
        if (menu.type)          MENU_TYPE       = menu.type;
        if (menu.restaurant_id) RESTAURANT_ID   = menu.restaurant_id;
        if (menu.slug) {
          const url = new URL(location.href);
          url.searchParams.set('menu', menu.slug);
          history.replaceState({}, '', url.toString());
        }
      } else {
        // Cached MENU_ID is stale (menu deleted) — clear it and fall through to auto-resolve
        MENU_ID = ''; RESTAURANT_ID = '';
        lsSet(LS_KEYS.menuId, '');
      }
    }
    if (countRes.ok) {
      const siblings = await countRes.json();
      if (siblings.length > 1) _hasMultipleMenus = true;
    }
    if (MENU_ID) return;
  }

  // Fetch up to 2 non-archived menus to determine routing
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/menus?select=id,slug,name,type,restaurant_id&archived=eq.false&limit=2`,
    { headers: sbHeaders() }
  );
  if (!res.ok) return;
  const menus = await res.json();

  if (menus.length === 1) {
    // Single menu — auto-load and push slug to URL so it can be bookmarked
    MENU_ID       = menus[0].id;
    _activeMenuName = menus[0].name || '';
    MENU_TYPE     = menus[0].type          || 'drinks';
    RESTAURANT_ID = menus[0].restaurant_id || '';
    lsSet(LS_KEYS.menuId, MENU_ID);
    const url = new URL(location.href);
    url.searchParams.set('menu', menus[0].slug);
    history.replaceState({}, '', url.toString());
  } else if (menus.length > 1) {
    _menuPickerNeeded  = true;
    _hasMultipleMenus  = true;
  }
}

async function sbEnsureUncategorized() {
  if (_uncatCategoryUuid || !SUPABASE_URL || !MENU_ID) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/categories?menu_id=eq.${MENU_ID}&key=eq.__uncategorized__&select=id`,
    { headers: sbHeaders() }
  );
  if (!res.ok) return;
  const rows = await res.json();
  if (rows.length) { _uncatCategoryUuid = rows[0].id; return; }
  const create = await fetch(`${SUPABASE_URL}/rest/v1/categories`, {
    method:  'POST',
    headers: sbHeaders({ 'Prefer': 'return=representation' }),
    body:    JSON.stringify({
      menu_id: MENU_ID, key: UNCATEGORIZED_ID,
      label: 'Uncategorized', icon: '', color: '', sub: '', placeholder: '',
      display_order: 9999,
    }),
  });
  if (create.ok) { const [cat] = await create.json(); _uncatCategoryUuid = cat.id; }
}

async function sbRead() {
  if (!SUPABASE_URL || !MENU_ID) return null;
  const restaurantFetch = RESTAURANT_ID
    ? fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${RESTAURANT_ID}&select=design`, { headers: sbHeaders() })
    : Promise.resolve(null);
  const [catsRes, metaRes, restRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/categories?menu_id=eq.${MENU_ID}&select=*,items(*)&order=display_order.asc`,
      { headers: sbHeaders() }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/menu_meta?menu_id=eq.${MENU_ID}&select=*`,
      { headers: sbHeaders() }
    ),
    restaurantFetch,
  ]);
  if (!catsRes.ok || !metaRes.ok) throw new Error('Supabase read failed');
  const cats = await catsRes.json();
  const [meta] = await metaRes.json();
  let restaurantDesign = null;
  if (restRes?.ok) {
    const [rest] = await restRes.json();
    if (rest?.design && Object.keys(rest.design).length) restaurantDesign = rest.design;
  }
  return { cats, meta: meta || null, restaurantDesign };
}

function hydrateState({ cats, meta, restaurantDesign }) {
  const realCats = (cats || []).filter(c => c.key !== UNCATEGORIZED_ID);
  const uncatCat = (cats || []).find(c => c.key === UNCATEGORIZED_ID);

  if (uncatCat) _uncatCategoryUuid = uncatCat.id;

  if (realCats.length) {
    CATEGORY_DEFS = realCats.map(c => ({
      id:          c.key,
      _uuid:       c.id,
      icon:        c.icon        || '',
      color:       c.color       || '',
      title:       c.label,
      sub:         c.sub         || '',
      placeholder: c.placeholder || '',
    }));
  }

  const lastSentState = meta?.last_sent_state || {};
  menuState = {};
  realCats.forEach(c => {
    menuState[c.key] = {
      items: (c.items || [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(i => ({
          id:          i.id,
          name:        i.name,
          desc:        i.desc   || '',
          recipe:      i.recipe || [],
          price:       i.price  || '',
          eightySixed: i.is_eighty_sixed,
          onMenu:      i.on_menu,
        })),
      lastSent: lastSentState[c.key] || [],
    };
  });

  if (uncatCat) {
    menuState[UNCATEGORIZED_ID] = {
      items: (uncatCat.items || []).map(i => ({
        id: i.id, name: i.name, desc: i.desc || '',
        recipe: i.recipe || [], price: i.price || '', eightySixed: i.is_eighty_sixed, onMenu: false,
      })),
      lastSent: [],
    };
  }

  if (meta) {
    menuState._meta = {
      lastUpdatedTs:      meta.last_updated_ts?.toString()  || '',
      lastSentTs:         meta.last_sent_ts?.toString()     || '',
      lastSentCategories: meta.last_sent_categories         || [],
    };
    if (meta.bot_id) BOT_ID = meta.bot_id;
    if (meta.notifications) NOTIFICATIONS = meta.notifications;
    if (restaurantDesign) currentDesign = { ...DESIGN_DEFAULTS, ...restaurantDesign };
    if (meta.last_updated_ts) lsSet(LS_KEYS.lastUpdated, meta.last_updated_ts.toString());
  }
}

async function sbPatchMenuMeta(update) {
  if (!SUPABASE_URL || !MENU_ID || !currentUser?.accessToken) return;
  await fetch(`${SUPABASE_URL}/rest/v1/menu_meta?menu_id=eq.${MENU_ID}`, {
    method:  'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body:    JSON.stringify(update),
  });
}

async function sbPatchRestaurantDesign(design) {
  if (!SUPABASE_URL || !RESTAURANT_ID || !currentUser?.accessToken) return;
  await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${RESTAURANT_ID}`, {
    method:  'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body:    JSON.stringify({ design }),
  });
}

async function sbDeleteCategory(categoryUuid) {
  if (!SUPABASE_URL || !categoryUuid || !currentUser?.accessToken) return;
  await fetch(`${SUPABASE_URL}/rest/v1/categories?id=eq.${categoryUuid}`, {
    method: 'DELETE', headers: sbHeaders(),
  });
}

async function sbSeedCategories(menuId, defs) {
  if (!SUPABASE_URL || !menuId || !currentUser?.accessToken) return;
  // 1. Upsert __uncategorized__ sentinel
  await fetch(`${SUPABASE_URL}/rest/v1/categories`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ menu_id: menuId, key: UNCATEGORIZED_ID, label: 'Uncategorized',
      icon: '', color: '', placeholder: '', display_order: 9999 }),
  });
  // 2. Bulk insert category rows
  const rows = defs.map((c, i) => ({
    menu_id: menuId, key: c.key, label: c.label,
    icon: c.icon, color: c.color, placeholder: c.placeholder, display_order: i,
  }));
  await fetch(`${SUPABASE_URL}/rest/v1/categories`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  // 3. Create menu_meta row (ignore if already exists)
  await fetch(`${SUPABASE_URL}/rest/v1/menu_meta`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify({ menu_id: menuId }),
  });
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
  _populateAdminDesignPanel(currentDesign);
}

function _populateAdminDesignPanel(d) {
  d = d || DESIGN_DEFAULTS;
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
  const targetRestaurantId = _adminSwitcherState.design.restaurantId;
  if (!targetRestaurantId) { showToast('No restaurant selected.', 'info'); return; }

  function getFontValue(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return '';
    if (sel.value === '__custom__') {
      return (document.getElementById(selectId + '-custom')?.value || '').trim();
    }
    return sel.value;
  }

  // Capture logo from preview element (works for current and other restaurants)
  const logoPreview = document.getElementById('design-logo-preview');
  const logoDataUrl = (logoPreview && logoPreview.style.display !== 'none' &&
    logoPreview.src && logoPreview.src.startsWith('data:')) ? logoPreview.src : '';

  const design = {
    logoDataUrl,
    brandName:    (document.getElementById('design-brand-name')?.value   || '').trim(),
    menuTitle:    (document.getElementById('design-menu-title')?.value   || '').trim(),
    primaryColor:  document.getElementById('design-primary-color')?.value || DESIGN_DEFAULTS.primaryColor,
    accentColor:   document.getElementById('design-accent-color')?.value  || DESIGN_DEFAULTS.accentColor,
    bgColor:       document.getElementById('design-bg-color')?.value      || DESIGN_DEFAULTS.bgColor,
    headingFont:  getFontValue('design-heading-font') || 'DM Sans',
    bodyFont:     getFontValue('design-body-font')    || 'DM Sans',
    accentFont:   getFontValue('design-accent-font')  || 'DM Sans',
  };

  // If saving for the currently active restaurant, update global state + live preview
  if (targetRestaurantId === RESTAURANT_ID) {
    currentDesign = { ...currentDesign, ...design };
    applyDesign(currentDesign);
  }

  try {
    if (SUPABASE_URL && currentUser?.accessToken) {
      await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(targetRestaurantId)}`, {
        method:  'PATCH',
        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
        body:    JSON.stringify({ design }),
      });
    }
    showToast('✅ Design saved!', 'success');
  } catch(e) {
    showToast(`Failed to save design: ${escHtml(e.message)}`, 'error');
  }
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
  const items = menuState[catId]?.items || [];
  const msg = items.length > 0
    ? `Delete "${cat.title}"? Its ${items.length} item(s) will be moved to the uncategorized pool and remain available as autocomplete suggestions.`
    : `Delete the "${cat.title}" category?`;
  if (!confirm(msg)) return;
  // Move all items to uncategorized pool in memory
  if (!menuState[UNCATEGORIZED_ID]) menuState[UNCATEGORIZED_ID] = { items: [] };
  const pool = menuState[UNCATEGORIZED_ID].items;
  items.forEach(item => {
    const exists = pool.some(u => u.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    if (!exists) pool.push({ ...item, onMenu: false });
  });
  if (items.length > 0 && SUPABASE_URL) {
    await sbEnsureUncategorized();
    if (_uncatCategoryUuid) {
      // Directly upsert the entire pool now — handles both DB-backed items
      // (ON CONFLICT updates their category_id) and memory-only items (inserts them).
      // This is explicit and doesn't rely on persistState() to handle orphaned items.
      const rows = pool.map((item, idx) => ({
        id:              item.id,
        category_id:     _uncatCategoryUuid,
        name:            item.name,
        desc:            item.desc            || '',
        recipe:          item.recipe          || [],
        is_eighty_sixed: false,
        on_menu:         false,
        display_order:   idx,
      }));
      await fetch(`${SUPABASE_URL}/rest/v1/items`, {
        method:  'POST',
        headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(rows),
      });
    }
  }
  // Delete the category — items were moved to __uncategorized__ above, so CASCADE won't fire.
  if (cat._uuid) await sbDeleteCategory(cat._uuid);
  CATEGORY_DEFS = CATEGORY_DEFS.filter(c => c.id !== catId);
  delete menuState[catId];
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
  // _uuid is left undefined; persistState() will INSERT and capture the generated UUID
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

  if (SUPABASE_URL) await sbResolveMenu();

  if (_invalidMenuSlug) {
    menuState = defaultState();
    applyDesign(currentDesign);
    showPublicViewWithError(`⚠️ Menu "${escHtml(_invalidMenuSlug)}" not found.`);
  } else if (_menuPickerNeeded) {
    // Multiple menus, no slug — show picker; load menu after selection
    applyDesign(currentDesign);
    showMenuPicker(async () => {
      try {
        const data = await sbRead();
        if (data) { hydrateState(data); lsSet(LS_KEYS.menuCache, JSON.stringify(data)); }
        else menuState = defaultState();
      } catch(e) { menuState = defaultState(); }
      applyDesign(currentDesign);
      showPublicView();
    });
  } else if (!SUPABASE_URL || !MENU_ID) {
    // Offline or unconfigured — serve from localStorage cache if available
    const cached = localStorage.getItem(LS_KEYS.menuCache);
    if (cached) {
      try { hydrateState(JSON.parse(cached)); } catch(e) { menuState = defaultState(); }
    } else {
      menuState = defaultState();
    }
    applyDesign(currentDesign);
    showPublicView();
  } else {
    try {
      const data = await sbRead();
      if (data) {
        hydrateState(data);
        lsSet(LS_KEYS.menuCache, JSON.stringify(data));
      } else {
        menuState = defaultState();
      }
      applyDesign(currentDesign);
      showPublicView();
    } catch(e) {
      // Fallback to localStorage cache
      const cached = localStorage.getItem(LS_KEYS.menuCache);
      if (cached) {
        try { hydrateState(JSON.parse(cached)); } catch(e2) { menuState = defaultState(); }
      } else {
        menuState = defaultState();
      }
      applyDesign(currentDesign);
      showPublicViewWithError('⚠️ Could not load menu data. Check your connection.');
    }
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
  const storedAccess    = localStorage.getItem(LS_KEYS.accessToken);
  const storedRefresh   = localStorage.getItem(LS_KEYS.refreshToken);
  const storedExpiresAt = Number(localStorage.getItem(LS_KEYS.expiresAt) || 0);
  const storedUid       = localStorage.getItem(LS_KEYS.uid)   || '';
  const storedEmail     = localStorage.getItem(LS_KEYS.email) || '';
  if (!storedRefresh) return;

  // If access token is still valid (2-min buffer), use it directly — skip refresh call.
  // This avoids unnecessary network round-trips and is resilient to Supabase cold starts.
  if (storedAccess && storedExpiresAt > Date.now() + 120_000) {
    try {
      const profile = await sbGetProfile(storedAccess);
      currentUser = {
        uid: storedUid, email: storedEmail,
        name: profile.name, role: profile.role,
        accessibleMenuIds: profile.accessibleMenuIds,
        accessToken: storedAccess, refreshToken: storedRefresh,
        expiresAt: storedExpiresAt,
      };
      _scheduleTokenRefresh(storedExpiresAt);
      applyRole(profile.role);
      return;
    } catch(e) { /* fall through to refresh */ }
  }

  // Access token expired or unusable — exchange refresh token for a new one.
  const _doRefresh = async () => {
    const refresh = localStorage.getItem(LS_KEYS.refreshToken);
    if (!refresh) throw new Error('no refresh token');
    const data = await sbRefreshToken(refresh);
    let role = 'none', name = '', accessibleMenuIds = [];
    if (data.access_token) {
      const profile = await sbGetProfile(data.access_token);
      role = profile.role; name = profile.name; accessibleMenuIds = profile.accessibleMenuIds;
    }
    _applySession(data, role, name, accessibleMenuIds);
    applyRole(role);
  };

  try {
    await _doRefresh();
  } catch(e) {
    // First attempt failed — Supabase may be cold-starting. Retry once after 2s
    // before giving up and clearing tokens.
    setTimeout(async () => {
      try {
        await _doRefresh();
      } catch(e2) {
        localStorage.removeItem(LS_KEYS.accessToken);
        localStorage.removeItem(LS_KEYS.refreshToken);
        localStorage.removeItem(LS_KEYS.expiresAt);
        localStorage.removeItem(LS_KEYS.uid);
        localStorage.removeItem(LS_KEYS.email);
      }
    }, 2000);
  }
}

function showPublicView() {
  document.getElementById('loading-view').style.display = 'none';
  document.getElementById('public-view').style.display = 'block';
  const switchBtn = document.getElementById('public-switch-menu-btn');
  if (switchBtn) switchBtn.style.display = _hasMultipleMenus ? '' : 'none';
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
  if (!SUPABASE_URL || !MENU_ID) return;
  syncInterval = setInterval(async () => {
    if (isManagerMode) return;
    try {
      const data = await sbRead();
      if (!data) return;

      const beforeCats = JSON.stringify(CATEGORY_DEFS.map(c => menuState[c.id]));
      const oldTs      = menuState._meta?.lastUpdatedTs;
      const oldDesign  = JSON.stringify(currentDesign);

      hydrateState(data);
      lsSet(LS_KEYS.menuCache, JSON.stringify(data));

      const afterCats = JSON.stringify(CATEGORY_DEFS.map(c => menuState[c.id]));
      const newTs     = menuState._meta?.lastUpdatedTs;
      const newDesign = JSON.stringify(currentDesign);

      if (afterCats !== beforeCats || newTs !== oldTs) {
        renderPublicView();
        updateLastUpdatedLabel();
      }
      if (newDesign !== oldDesign) applyDesign(currentDesign);

      _pollFailCount = 0;
      const syncEl = document.getElementById('sync-status');
      if (syncEl?.classList.contains('sync-poll-error')) { syncEl.textContent = ''; syncEl.className = ''; }
    } catch(e) {
      _pollFailCount++;
      if (_pollFailCount >= 3) {
        const syncEl = document.getElementById('sync-status');
        if (syncEl) { syncEl.textContent = '⚠️ Sync paused — reconnecting…'; syncEl.className = 'sync-poll-error'; }
      }
    }
  }, 60000);
}

function stopPolling() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

function getLastUpdatedTs() {
  return (menuState._meta && menuState._meta.lastUpdatedTs) ||
    localStorage.getItem(LS_KEYS.lastUpdated);
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
          const isFood    = MENU_TYPE === 'food';
          const hasDetail = isFood ? false : (hasDesc || hasRecipe);
          const classes   = ['menu-item', is86 ? 'is-eighty-sixed' : '', hasDetail ? 'has-detail' : ''].filter(Boolean).join(' ');
          const onClick   = hasDetail ? `onclick="togglePublicDesc(this)"` : '';
          const detailHtml = hasDetail ? `<div class="item-detail-panel">
              ${hasDesc && hasRecipe
                ? `<div class="detail-section"><div class="detail-label">Description</div><div class="item-desc-text">${escHtml(i.desc)}</div></div><div class="detail-section detail-section--bordered"><div class="detail-label">Recipe</div><div class="item-desc-text">${escHtml(recipeIngredients.join(', '))}</div></div>`
                : hasDesc
                  ? `<div class="detail-section"><div class="item-desc-text">${escHtml(i.desc)}</div></div>`
                  : `<div class="detail-section"><div class="item-desc-text">${escHtml(recipeIngredients.join(', '))}</div></div>`}
            </div>` : '';
          const priceHtml = i.price
            ? (isFood
                ? `<span class="item-price-tag">${escHtml(i.price)}</span>`
                : `<span class="item-price-badge">${escHtml(i.price)}</span>`)
            : '';
          return `<div class="${classes}" ${onClick}>
            <div class="item-main-row">
              <div class="dot" aria-hidden="true"></div>
              <span class="item-name-text">${escHtml(i.name)}${isFood ? '' : priceHtml}</span>
              ${is86 ? `<span class="eighty-sixed-tag">86'D</span>` : ''}
              ${hasDetail ? `<span class="item-expand-icon" role="button" tabindex="0" aria-label="Show description" aria-expanded="false" onclick="event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))}">›</span>` : ''}
            </div>
            ${isFood && priceHtml ? `<div class="item-price-row">${priceHtml}</div>` : ''}
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
  if (!r.ok) return { role: 'none', name: '', accessibleMenuIds: [] };
  const { role, name, accessibleMenuIds } = await r.json();
  return { role: role || 'none', name: name || '', accessibleMenuIds: accessibleMenuIds || [] };
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

function _applySession(data, role, name, accessibleMenuIds = []) {
  const expiresIn = (data.expires_in || 3600) * 1000;
  const userId = data.user?.id || data.user_id || '';
  const email = data.user?.email || data.email || '';
  currentUser = {
    uid: userId, email, name: name || '', role, accessibleMenuIds,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + expiresIn,
  };
  lsSet(LS_KEYS.accessToken,  currentUser.accessToken);
  lsSet(LS_KEYS.refreshToken, currentUser.refreshToken);
  lsSet(LS_KEYS.expiresAt,    String(currentUser.expiresAt));
  lsSet(LS_KEYS.uid,          userId);
  lsSet(LS_KEYS.email,        email);
  _scheduleTokenRefresh(currentUser.expiresAt);
}

function renderUserHeader() {
  const signedIn  = !!currentUser;
  const role      = currentUser?.role || 'none';
  const isAdmin   = role === 'admin';
  const name      = currentUser?.name || '';
  const parts     = name.trim().split(/\s+/).filter(Boolean);
  const initials  = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.[0] || '?').toUpperCase();
  const roleLabel = { none: 'User', manager: 'Manager', admin: 'Admin' }[role] || 'User';

  // Access to the manager panel requires either admin role or explicit menu access.
  // Show the button if the manager has access to ANY menu (MENU_ID may not be set yet).
  const accessibleIds = currentUser?.accessibleMenuIds || [];
  const hasMenuAccess = isAdmin || accessibleIds.length > 0;

  document.getElementById('signin-btn').style.display = signedIn ? 'none' : '';
  document.getElementById('user-chip').style.display  = signedIn ? '' : 'none';

  const actionBtn = document.getElementById('action-btn');
  const adminBtn  = document.getElementById('admin-btn');

  if (actionBtn) {
    actionBtn.style.display = (signedIn && hasMenuAccess) ? '' : 'none';
    actionBtn.textContent   = isManagerMode ? '✕ Exit' : '⚙ Manager';
    actionBtn.classList.toggle('active', isManagerMode);
  }
  if (adminBtn) {
    adminBtn.style.display = (signedIn && isAdmin) ? '' : 'none';
    adminBtn.classList.toggle('active', isAdminMode);
  }

  if (signedIn) {
    document.getElementById('user-initials').textContent      = initials;
    document.getElementById('user-dropdown-name').textContent = name || currentUser?.email || '';
    document.getElementById('user-dropdown-role').textContent = roleLabel;
  }
}

function applyRole(role) {
  const isAdmin = role === 'admin';
  const pruneSection = document.getElementById('prune-section');
  if (pruneSection) pruneSection.style.display = isAdmin ? '' : 'none';
  renderUserHeader();
}

// ─── AUTH OVERLAY ─────────────────────────────────────────────────────────────
function onActionBtnClick() {
  if (isManagerMode) exitView(); else enterManager();
}

function onAdminBtnClick() {
  if (isAdminMode) exitView(); else enterAdmin();
}

function enterAdmin() {
  if (isManagerMode) { isManagerMode = false; document.body.classList.remove('manager-mode'); }
  isAdminMode = true;
  stopPolling();
  document.body.classList.add('manager-mode');
  document.getElementById('public-view').style.display     = 'none';
  document.getElementById('loading-view').style.display    = 'none';
  document.getElementById('menu-picker-overlay').classList.remove('open');
  document.getElementById('manager-view').style.display    = 'block';
  document.getElementById('manager-panel').style.display   = 'none';
  document.getElementById('admin-panel').style.display     = 'block';
  renderUserHeader();
  checkAdminSupabaseStatus();
  switchAdminTab('admin-restaurants');
}

function exitAdmin() {
  isAdminMode = false;
  document.body.classList.remove('manager-mode');
  document.getElementById('manager-view').style.display = 'none';
  renderUserHeader();
  showPublicView();
}

function exitView() {
  if (isManagerMode) exitManager();
  else if (isAdminMode) exitAdmin();
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

// ─── MENU PICKER ─────────────────────────────────────────────────────────────

function _pickerFocusTrap(e) {
  if (e.key === 'Escape') { closeMenuPicker(); return; }
  if (e.key !== 'Tab') return;
  const box = document.querySelector('#menu-picker-overlay .picker-box');
  const focusable = Array.from(
    box.querySelectorAll('button, [tabindex]:not([tabindex="-1"])')
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

// afterSelect: optional callback fired after the user picks a menu.
// opts.managerOnly: when true, filter to accessible menus only (used by manager switch).
async function showMenuPicker(afterSelect, opts) {
  const managerOnly = opts?.managerOnly || false;
  _pickerFocusBefore = document.activeElement;
  _pickerOnSelect    = afterSelect || null;

  const list = document.getElementById('picker-menu-list');
  list.innerHTML = '<p class="picker-loading">Loading…</p>';
  document.getElementById('menu-picker-overlay').classList.add('open');
  document.addEventListener('keydown', _pickerFocusTrap);

  let menus = [];
  if (SUPABASE_URL) {
    const accessibleIds = currentUser?.accessibleMenuIds;
    let url = `${SUPABASE_URL}/rest/v1/menus?select=id,name,slug,type,restaurant_id&order=name.asc`;
    // Non-admins only see non-archived menus (admins can see archived in manager context)
    if (currentUser?.role !== 'admin') url += '&archived=eq.false';
    // Only restrict to accessible menus when in manager context
    if (managerOnly && currentUser?.role === 'manager' && accessibleIds?.length) {
      url += `&id=in.(${accessibleIds.join(',')})`;
    }
    try {
      const res = await fetch(url, { headers: sbHeaders() });
      if (res.ok) menus = await res.json();
    } catch(e) {}
  }

  list.innerHTML = '';
  if (!menus.length) {
    list.innerHTML = '<p class="picker-empty">No menus available.</p>';
  } else {
    menus.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'picker-menu-card';
      btn.setAttribute('aria-label', `Select ${m.name}`);
      btn.innerHTML = `<span class="picker-menu-name">${escHtml(m.name)}</span><span class="picker-menu-type">${escHtml(m.type)}</span>`;
      btn.onclick = () => selectMenu(m.id, m.slug, m.name, m.type, m.restaurant_id);
      list.appendChild(btn);
    });
    const first = list.querySelector('.picker-menu-card');
    if (first) setTimeout(() => first.focus(), 0);
  }
}

function closeMenuPicker() {
  document.getElementById('menu-picker-overlay').classList.remove('open');
  document.removeEventListener('keydown', _pickerFocusTrap);
  if (_pickerFocusBefore?.focus) _pickerFocusBefore.focus();
  _pickerFocusBefore = null;
}

function selectMenu(menuId, slug, menuName, menuType, restaurantId) {
  MENU_ID       = menuId;
  _activeMenuName = menuName || '';
  MENU_TYPE     = menuType     || 'drinks';
  RESTAURANT_ID = restaurantId || '';
  lsSet(LS_KEYS.menuId, MENU_ID);
  _menuPickerNeeded = false;
  const url = new URL(location.href);
  url.searchParams.set('menu', slug);
  history.replaceState({}, '', url.toString());
  closeMenuPicker();
  updateActiveMenuBar(menuName);
  renderUserHeader();
  const cb = _pickerOnSelect;
  _pickerOnSelect = null;
  if (cb) cb();
}

function updateActiveMenuBar(name) {
  const bar       = document.getElementById('active-menu-bar');
  const nameEl    = document.getElementById('active-menu-name');
  const switchBtn = document.getElementById('switch-menu-btn');
  if (!bar) return;
  if (name) nameEl.textContent = name;
  bar.style.display = name ? '' : 'none';
  // Show "Switch" only when the user has access to more than one menu
  const role          = currentUser?.role;
  const accessibleIds = currentUser?.accessibleMenuIds || [];
  const canSwitch     = role === 'admin' || accessibleIds.length > 1;
  if (switchBtn) switchBtn.style.display = canSwitch ? '' : 'none';
}

async function onSwitchMenuClick() {
  showMenuPicker(async () => {
    // Reload menu data into the manager view for the newly selected menu
    _uncatCategoryUuid = null;
    try {
      const data = await sbRead();
      if (data) { hydrateState(data); lsSet(LS_KEYS.menuCache, JSON.stringify(data)); }
      else { menuState = defaultState(); currentDesign = { ...DESIGN_DEFAULTS }; }
    } catch(e) { menuState = defaultState(); currentDesign = { ...DESIGN_DEFAULTS }; }
    applyDesign(currentDesign);
    await sbEnsureUncategorized();
    renderManagerCategories();
    if (typeof renderCatManager  === 'function') renderCatManager();
    if (typeof renderDatabase    === 'function') renderDatabase();
    if (typeof renderUsersList   === 'function') renderUsersList();
    updateDraftIndicator();
    updateSaveBtn();
  }, { managerOnly: true });
}

async function onPublicSwitchMenuClick() {
  showMenuPicker(async () => {
    // Reload public view for the newly selected menu
    try {
      const data = await sbRead();
      if (data) { hydrateState(data); lsSet(LS_KEYS.menuCache, JSON.stringify(data)); }
      else { menuState = defaultState(); currentDesign = { ...DESIGN_DEFAULTS }; }
    } catch(e) { menuState = defaultState(); currentDesign = { ...DESIGN_DEFAULTS }; }
    applyDesign(currentDesign);
    renderPublicView();
    updateLastUpdatedLabel();
  });
}

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
    const { role, name, accessibleMenuIds } = await sbGetProfile(data.access_token);
    _applySession(data, role, name, accessibleMenuIds);
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
    const { role, name, accessibleMenuIds } = await sbGetProfile(_recoverySessionData.access_token);
    _applySession(_recoverySessionData, role, name, accessibleMenuIds);
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
  _managerMenuPicked = false;
  if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
  localStorage.removeItem(LS_KEYS.accessToken);
  localStorage.removeItem(LS_KEYS.refreshToken);
  localStorage.removeItem(LS_KEYS.expiresAt);
  localStorage.removeItem(LS_KEYS.uid);
  localStorage.removeItem(LS_KEYS.email);
  if (isManagerMode || isAdminMode) exitView();
  renderUserHeader();
}

// ─── MANAGER MODE ─────────────────────────────────────────────────────────────
function enterManager() {
  if (!MENU_ID) {
    showToast('Select a menu from the public view first.', 'info');
    return;
  }
  // Check that the user actually has access to the loaded menu
  const isAdmin   = currentUser?.role === 'admin';
  const hasAccess = isAdmin || (currentUser?.accessibleMenuIds || []).includes(MENU_ID);
  if (!hasAccess) {
    showToast('You don\'t have manager access to this menu.', 'error');
    return;
  }
  if (isAdminMode) { isAdminMode = false; }
  isManagerMode = true;
  stopPolling();
  document.body.classList.add('manager-mode');
  document.getElementById('public-view').style.display    = 'none';
  document.getElementById('loading-view').style.display   = 'none';
  document.getElementById('menu-picker-overlay').classList.remove('open');
  document.getElementById('manager-view').style.display   = 'block';
  document.getElementById('manager-panel').style.display  = 'block';
  document.getElementById('admin-panel').style.display    = 'none';
  renderUserHeader();
  switchManagerTab('edit-menu');
  updateDraftIndicator();
  updateSaveBtn();
  renderManagerCategories();
  updateActiveMenuBar(_activeMenuName);
}

function exitManager() {
  isManagerMode = false;
  document.body.classList.remove('manager-mode');
  document.getElementById('manager-view').style.display = 'none';
  renderUserHeader();
  showPublicView();
}

// ─── CONFIG SAVES ─────────────────────────────────────────────────────────────
async function checkAdminSupabaseStatus() {
  const el = document.getElementById('admin-supabase-status');
  if (!el) return;
  if (!SUPABASE_URL) { el.textContent = '⚠️ Supabase URL not configured'; el.className = 'db-status db-status--error'; return; }
  if (!SUPABASE_ANON_KEY) { el.textContent = '⚠️ Supabase key not configured'; el.className = 'db-status db-status--error'; return; }
  el.textContent = 'Checking…'; el.className = 'db-status';
  try {
    // Ping the restaurants table (lightweight, always accessible via RLS SELECT)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?select=id&limit=1`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (res.ok || res.status === 200) {
      el.textContent = '✓ Connected'; el.className = 'db-status db-status--ok';
    } else {
      el.textContent = `✗ Unreachable (${res.status})`; el.className = 'db-status db-status--error';
    }
  } catch(e) {
    el.textContent = '✗ Unreachable'; el.className = 'db-status db-status--error';
  }
}

// ─── NOTIFICATIONS PANEL ─────────────────────────────────────────────────────

function onNotifToggle(channel) {
  const enabled = document.getElementById(`notif-${channel}-enabled`)?.checked;
  const body    = document.getElementById(`notif-${channel}-body`);
  if (body) body.style.display = enabled ? '' : 'none';
}

function _populateAdminNotificationsPanel(n) {
  n = n || {};
  for (const channel of ['groupme', 'sms', 'discord', 'webhook']) {
    const el = document.getElementById(`notif-${channel}-enabled`);
    if (el) {
      el.checked = !!(n[channel]?.enabled);
      onNotifToggle(channel);
    }
  }
}

async function saveNotifications() {
  const targetMenuId = _adminSwitcherState.notif.menuId;
  if (!targetMenuId) { showToast('No menu selected.', 'info'); return; }
  const notifications = {};
  for (const channel of ['groupme', 'sms', 'discord', 'webhook']) {
    notifications[channel] = {
      enabled: !!document.getElementById(`notif-${channel}-enabled`)?.checked,
    };
  }
  // Keep global NOTIFICATIONS in sync if saving for the currently active menu
  if (targetMenuId === MENU_ID) NOTIFICATIONS = notifications;
  try {
    if (SUPABASE_URL && currentUser?.accessToken) {
      await fetch(`${SUPABASE_URL}/rest/v1/menu_meta?menu_id=eq.${encodeURIComponent(targetMenuId)}`, {
        method:  'PATCH',
        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
        body:    JSON.stringify({ notifications }),
      });
    }
    showToast('✅ Notifications saved!', 'success');
  } catch(e) {
    showToast(`Failed to save notifications: ${escHtml(e.message)}`, 'error');
  }
}
function _populateNotifCredKeys(cfg) {
  cfg = cfg || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('notif-cred-groupme',        cfg.groupme?.env_key);
  set('notif-cred-discord',        cfg.discord?.env_key);
  set('notif-cred-sms-sid',        cfg.sms?.env_key_sid);
  set('notif-cred-sms-token',      cfg.sms?.env_key_token);
  set('notif-cred-sms-from',       cfg.sms?.env_key_from);
  set('notif-cred-sms-to',         cfg.sms?.env_key_to);
  set('notif-cred-webhook-url',    cfg.webhook?.env_key_url);
  set('notif-cred-webhook-secret', cfg.webhook?.env_key_secret);
}

async function saveNotifCredKeys() {
  const restaurantId = _adminSwitcherState.notif.restaurantId;
  if (!restaurantId) { showToast('No restaurant selected.', 'info'); return; }
  const val = id => (document.getElementById(id)?.value || '').trim();
  const notifications_config = {};
  if (val('notif-cred-groupme'))        notifications_config.groupme = { env_key: val('notif-cred-groupme') };
  if (val('notif-cred-discord'))        notifications_config.discord = { env_key: val('notif-cred-discord') };
  const sms = {};
  if (val('notif-cred-sms-sid'))   sms.env_key_sid   = val('notif-cred-sms-sid');
  if (val('notif-cred-sms-token')) sms.env_key_token  = val('notif-cred-sms-token');
  if (val('notif-cred-sms-from'))  sms.env_key_from   = val('notif-cred-sms-from');
  if (val('notif-cred-sms-to'))    sms.env_key_to     = val('notif-cred-sms-to');
  if (Object.keys(sms).length) notifications_config.sms = sms;
  const wh = {};
  if (val('notif-cred-webhook-url'))    wh.env_key_url    = val('notif-cred-webhook-url');
  if (val('notif-cred-webhook-secret')) wh.env_key_secret = val('notif-cred-webhook-secret');
  if (Object.keys(wh).length) notifications_config.webhook = wh;
  try {
    if (SUPABASE_URL && currentUser?.accessToken) {
      await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
        method: 'PATCH',
        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ notifications_config }),
      });
    }
    showToast('Credential keys saved!', 'success');
  } catch(e) {
    showToast(`Failed to save credential keys: ${escHtml(e.message)}`, 'error');
  }
}

async function saveMenuUrl() {
  const val = document.getElementById('menu-url-input').value.trim();
  if (!val) { showToast('Enter a URL first.', 'info'); return; }
  MENU_URL = val; lsSet(LS_KEYS.menuUrl, MENU_URL);
  showToast('✅ Menu URL saved!', 'success');
}

// ─── ADMIN SWITCHER ───────────────────────────────────────────────────────────

async function loadAdminSwitcherData() {
  if (_adminRestaurants.length && _adminAllMenus.length) return; // already cached
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  try {
    const [restRes, menuRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/restaurants?select=id,name&order=name.asc`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/menus?select=id,name,type,restaurant_id,archived&order=name.asc`, { headers: sbHeaders() }),
    ]);
    if (restRes.ok) _adminRestaurants = await restRes.json();
    if (menuRes.ok) _adminAllMenus    = await menuRes.json();
  } catch(e) { /* non-fatal */ }
}

function _refreshAdminMenuSelect(context) {
  const state = _adminSwitcherState[context];
  const menuSelect = document.getElementById(`${context}-menu-select`);
  if (!menuSelect) return;
  const menus = _adminAllMenus.filter(m => m.restaurant_id === state.restaurantId);
  menuSelect.innerHTML = menus.length
    ? menus.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.name)}${m.archived ? ' (archived)' : ''}</option>`).join('')
    : '<option value="">No menus</option>';
  const match = menus.find(m => m.id === state.menuId);
  state.menuId = match ? state.menuId : (menus[0]?.id || '');
  menuSelect.value = state.menuId;
}

async function initAdminSwitcherTab(context) {
  await loadAdminSwitcherData();
  const restSelect = document.getElementById(`${context}-restaurant-select`);
  if (!restSelect) return;
  restSelect.innerHTML = _adminRestaurants.map(r =>
    `<option value="${escHtml(r.id)}">${escHtml(r.name)}</option>`
  ).join('') || '<option value="">No restaurants</option>';
  // Default to current active restaurant/menu on first open
  if (!_adminSwitcherState[context].restaurantId) {
    _adminSwitcherState[context].restaurantId = RESTAURANT_ID || (_adminRestaurants[0]?.id || '');
    _adminSwitcherState[context].menuId       = MENU_ID || '';
  }
  restSelect.value = _adminSwitcherState[context].restaurantId;
  _refreshAdminMenuSelect(context);
  await _loadAdminTabData(context);
}

async function onAdminSwitcherRestaurantChange(context) {
  const restSelect = document.getElementById(`${context}-restaurant-select`);
  if (!restSelect) return;
  _adminSwitcherState[context].restaurantId = restSelect.value;
  _adminSwitcherState[context].menuId = ''; // reset so _refreshAdminMenuSelect picks first menu
  _refreshAdminMenuSelect(context);
  await _loadAdminTabData(context);
}

async function onAdminSwitcherMenuChange(context) {
  const menuSelect = document.getElementById(`${context}-menu-select`);
  if (!menuSelect) return;
  _adminSwitcherState[context].menuId = menuSelect.value;
  await _loadAdminTabData(context);
}

async function _loadAdminTabData(context) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  if (context === 'notif') {
    const menuId       = _adminSwitcherState.notif.menuId;
    const restaurantId = _adminSwitcherState.notif.restaurantId;
    const urlInput = document.getElementById('menu-url-input');
    if (urlInput) urlInput.value = MENU_URL || '';
    if (!menuId) { _populateAdminNotificationsPanel({}); }
    else {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/menu_meta?menu_id=eq.${encodeURIComponent(menuId)}&select=notifications`,
          { headers: sbHeaders() }
        );
        const [meta] = r.ok ? await r.json() : [{}];
        _populateAdminNotificationsPanel(meta?.notifications || {});
      } catch { _populateAdminNotificationsPanel({}); }
    }
    // Load per-restaurant credential keys
    if (restaurantId) {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}&select=notifications_config`,
          { headers: sbHeaders() }
        );
        const [rest] = r.ok ? await r.json() : [{}];
        _populateNotifCredKeys(rest?.notifications_config || {});
      } catch { _populateNotifCredKeys({}); }
    } else { _populateNotifCredKeys({}); }
  } else if (context === 'design') {
    const restaurantId = _adminSwitcherState.design.restaurantId;
    if (!restaurantId) { _populateAdminDesignPanel(DESIGN_DEFAULTS); return; }
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}&select=design`,
        { headers: sbHeaders() }
      );
      const [row] = r.ok ? await r.json() : [{}];
      _populateAdminDesignPanel({ ...DESIGN_DEFAULTS, ...(row?.design || {}) });
    } catch { _populateAdminDesignPanel(DESIGN_DEFAULTS); }
  }
}

// ─── MANAGER CATEGORY EDIT ───────────────────────────────────────────────────
function renderManagerCategories() {
  const container = document.getElementById('manager-categories');
  container.innerHTML = '';
  // Preserve uncategorized expansion state across re-renders
  const _uncatWasExpanded = !document.getElementById('mgr-card-' + UNCATEGORIZED_ID)?.classList.contains('collapsed');

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

  // Permanent uncategorized card — always last, collapsed by default
  const uncatCard = document.createElement('div');
  uncatCard.className = 'cat-card' + (_uncatWasExpanded ? '' : ' collapsed');
  uncatCard.id = 'mgr-card-' + UNCATEGORIZED_ID;
  uncatCard.innerHTML = `
    <div class="cat-header collapsible-header" role="button" tabindex="0"
         aria-expanded="${_uncatWasExpanded ? 'true' : 'false'}"
         onclick="toggleManagerCategory('${UNCATEGORIZED_ID}')"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleManagerCategory('${UNCATEGORIZED_ID}')}">
      <div class="cat-icon" style="background:rgba(120,120,120,0.12)">📦</div>
      <div><div class="cat-title">Uncategorized</div><div class="cat-sub">Autocomplete pool — not shown on public menu</div></div>
      <span class="category-chevron">›</span>
    </div>
    <div class="current-section">
      <div class="current-label">Item Pool</div>
      <div class="current-items" id="mgr-items-${UNCATEGORIZED_ID}"></div>
      <div class="add-item-wrap">
        <div class="add-item-area">
          <input class="add-item-input" id="new-input-${UNCATEGORIZED_ID}" type="text" placeholder="Add to pool…"
            onkeydown="if(event.key==='Enter'){event.preventDefault();addUncategorizedItem()}"/>
          <button class="add-item-btn" onclick="addUncategorizedItem()" aria-label="Add item to uncategorized pool">+</button>
        </div>
      </div>
    </div>`;
  container.appendChild(uncatCard);
  renderUncategorizedItems();
}

function renderUncategorizedItems() {
  const listEl = document.getElementById('mgr-items-' + UNCATEGORIZED_ID);
  if (!listEl) return;
  const items = menuState[UNCATEGORIZED_ID]?.items || [];
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = `<div class="empty-state"><span class="empty-state-icon">+</span><span>Pool is empty — add items or delete a category to populate it.</span></div>`;
    return;
  }
  items.forEach(item => {
    const hasDesc   = !!(item.desc && item.desc.trim());
    const hasRecipe = recipeArray(item.recipe).length > 0;
    const wrapper = document.createElement('div');
    wrapper.className = 'item-wrapper';
    wrapper.id = 'wrapper-' + item.id;
    wrapper.innerHTML = `
      <div class="current-item">
        <div class="item-name"><span class="item-name-static">${escHtml(item.name)}</span></div>
        <button class="desc-btn${hasDesc ? ' has-desc' : ''}" title="Edit description" onclick="toggleItemDesc('${item.id}')">📝</button>
        <button class="recipe-btn${hasRecipe ? ' has-recipe' : ''}" title="Add recipe" onclick="toggleItemRecipe('${item.id}')">🧪</button>
      </div>
      <div class="desc-row" id="desc-row-${item.id}">
        <textarea class="desc-input" aria-label="Item description" placeholder="Ingredients, description, how to sell it…"
          onblur="saveDesc('${UNCATEGORIZED_ID}','${item.id}',this.value)">${escHtml(item.desc || '')}</textarea>
      </div>
      <div class="recipe-row" id="recipe-row-${item.id}">
        <div class="recipe-ingredient-list" id="recipe-list-${item.id}"></div>
        <div class="add-ingredient-area">
          <input class="add-ingredient-input" id="ingredient-input-${item.id}" type="text"
            placeholder="Add ingredient..."
            onkeydown="handleIngredientKeydown(event,'${UNCATEGORIZED_ID}','${item.id}')"/>
          <button class="add-ingredient-btn" onclick="addIngredient('${UNCATEGORIZED_ID}','${item.id}')">+</button>
        </div>
      </div>`;
    listEl.appendChild(wrapper);
    renderRecipeIngredients(UNCATEGORIZED_ID, item.id);
  });
}

async function addUncategorizedItem() {
  const input = document.getElementById('new-input-' + UNCATEGORIZED_ID);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  if (!menuState[UNCATEGORIZED_ID]) menuState[UNCATEGORIZED_ID] = { items: [], lastSent: [] };
  const pool = menuState[UNCATEGORIZED_ID].items;
  if (pool.some(i => i.name.trim().toLowerCase() === name.toLowerCase())) {
    showToast('Already in pool.', 'info'); return;
  }
  pool.push({ id: uid(), name, desc: '', recipe: [], price: '', eightySixed: false, onMenu: false });
  input.value = '';
  renderUncategorizedItems();
  await persistState();
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
        <input class="price-input" type="text" placeholder="Price…" aria-label="Price"
          onblur="savePrice('${catId}','${item.id}',this.value)"
          value="${escHtml(item.price||'')}"/>
        <button class="desc-btn${hasDesc ? ' has-desc' : ''}" title="Add description" onclick="toggleItemDesc('${item.id}')">📝</button>
        <button class="recipe-btn${hasRecipe ? ' has-recipe' : ''}" title="Add recipe" onclick="toggleItemRecipe('${item.id}')"
          style="${MENU_TYPE === 'food' ? 'display:none' : ''}">🧪</button>
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
  if (!SUPABASE_URL || !MENU_ID || !currentUser?.accessToken) return;
  try {
    // 1. Upsert existing categories (those with a DB UUID)
    const catRows = CATEGORY_DEFS
      .filter(c => c._uuid)
      .map((c, idx) => ({
        id:            c._uuid,
        menu_id:       MENU_ID,
        key:           c.id,
        label:         c.title,
        icon:          c.icon        || '',
        color:         c.color       || '',
        sub:           c.sub         || '',
        placeholder:   c.placeholder || '',
        display_order: CATEGORY_DEFS.indexOf(c),
      }));
    if (catRows.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/categories`, {
        method:  'POST',
        headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(catRows),
      });
      if (!r.ok) throw new Error(`category upsert: ${r.status}`);
    }

    // 2. Insert new categories (no UUID yet) and capture their generated IDs
    for (const c of CATEGORY_DEFS) {
      if (c._uuid) continue;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/categories`, {
        method:  'POST',
        headers: sbHeaders({ 'Prefer': 'return=representation' }),
        body:    JSON.stringify({
          menu_id:       MENU_ID,
          key:           c.id,
          label:         c.title,
          icon:          c.icon        || '',
          color:         c.color       || '',
          sub:           c.sub         || '',
          placeholder:   c.placeholder || '',
          display_order: CATEGORY_DEFS.indexOf(c),
        }),
      });
      if (r.ok) { const [row] = await r.json(); c._uuid = row.id; }
    }

    // 3. Upsert all items
    const itemRows = [];
    CATEGORY_DEFS.forEach(cat => {
      if (!cat._uuid) return;
      (menuState[cat.id]?.items || []).forEach((item, idx) => {
        itemRows.push({
          id:              item.id,
          category_id:     cat._uuid,
          name:            item.name,
          desc:            item.desc           || '',
          recipe:          item.recipe         || [],
          price:           item.price          || null,
          is_eighty_sixed: item.eightySixed    || false,
          on_menu:         item.onMenu         !== false,
          display_order:   idx,
        });
      });
    });
    if (_uncatCategoryUuid) {
      (menuState[UNCATEGORIZED_ID]?.items || []).forEach((item, idx) => {
        itemRows.push({
          id:              item.id,
          category_id:     _uncatCategoryUuid,
          name:            item.name,
          desc:            item.desc   || '',
          recipe:          item.recipe || [],
          price:           item.price  || null,
          is_eighty_sixed: false,
          on_menu:         false,
          display_order:   idx,
        });
      });
    }
    if (itemRows.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/items`, {
        method:  'POST',
        headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(itemRows),
      });
      if (!r.ok) throw new Error(`items upsert: ${r.status}`);
    }

    // 4. Delete pruned items
    if (_deletedItemIds.size) {
      const ids = [..._deletedItemIds].map(id => `"${id}"`).join(',');
      await fetch(`${SUPABASE_URL}/rest/v1/items?id=in.(${ids})`, {
        method: 'DELETE', headers: sbHeaders(),
      });
      _deletedItemIds.clear();
    }

    // 5. Sync bot_id to menu_meta; design to restaurant
    await Promise.all([
      sbPatchMenuMeta({ bot_id: BOT_ID }),
      sbPatchRestaurantDesign(currentDesign),
    ]);

    const syncEl = document.getElementById('sync-status');
    if (syncEl) { syncEl.textContent = ''; syncEl.className = ''; }
  } catch(e) {
    const syncEl = document.getElementById('sync-status');
    if (syncEl) { syncEl.textContent = '⚠️ Cloud sync failed'; syncEl.className = 'sync-error'; }
    showToast('⚠️ Cloud save failed.', 'error');
  }
}

async function saveMenu() {
  const ts = Date.now();
  menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: ts.toString() };
  lsSet(LS_KEYS.lastUpdated, ts.toString());
  await persistState();
  await sbPatchMenuMeta({ last_updated_ts: ts });
  _dirty = false;
  updateSaveBtn();
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
    else {
      // Check uncategorized pool — if found, move it into this category
      const uncatIdx = (menuState[UNCATEGORIZED_ID]?.items || []).findIndex(
        i => i.name.toLowerCase() === nameLower
      );
      if (uncatIdx !== -1) {
        const [uncatItem] = menuState[UNCATEGORIZED_ID].items.splice(uncatIdx, 1);
        menuState[catId].items.push({ ...uncatItem, onMenu: true });
      } else {
        menuState[catId].items.push({ id: uid(), name, desc: '', recipe: [], price: '', eightySixed: false, onMenu: true });
      }
    }
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
  const valLower = val.toLowerCase();
  const catMatches = (menuState[catId]?.items || []).filter(
    i => i.onMenu === false && i.name.toLowerCase().startsWith(valLower)
  );
  const catNames = new Set((menuState[catId]?.items || []).map(i => i.name.trim().toLowerCase()));
  const uncatMatches = (menuState[UNCATEGORIZED_ID]?.items || []).filter(
    i => i.name.toLowerCase().startsWith(valLower) && !catNames.has(i.name.trim().toLowerCase())
  );
  const matches = [...catMatches, ...uncatMatches];
  if (!matches.length) { hideAutocomplete(catId); return; }
  list.innerHTML = matches.map(r =>
    `<div class="autocomplete-item" onmousedown="selectAutocomplete(event,'${catId}','${escHtml(r.name)}')">${escHtml(r.name)}</div>`
  ).join('');
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
  // Trigger animation on the newly-rendered wrapper
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

async function savePrice(catId, itemId, val) {
  const item = findItem(catId, itemId);
  if (!item) return;
  const price = val.trim();
  if (item.price !== price) { item.price = price; await persistState(); }
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
  menuState[catId].items
    .filter(i => i.onMenu === false && i.name === itemName)
    .forEach(i => _deletedItemIds.add(i.id));
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
  cats.forEach(id => {
    if (!menuState[id]) return;
    menuState[id].items.filter(i => i.onMenu === false).forEach(i => _deletedItemIds.add(i.id));
    menuState[id].items = menuState[id].items.filter(i => i.onMenu !== false);
  });
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
  const menuLabel = _activeMenuName ? _activeMenuName.toUpperCase() : 'MENU';
  let lines = [`🔥 ${menuLabel} UPDATES — ${dateStr} ${timeStr}`, ''];
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
    showToast('Update is long and will be truncated.', 'info');
  }

  const confirmBtn = document.getElementById('confirm-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'SENDING...';

  try {
    const authHeaders = currentUser?.accessToken
      ? { 'Authorization': `Bearer ${currentUser.accessToken}` }
      : {};
    const r1 = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ menu_id: MENU_ID, text: patchMessage })
    });

    if (r1.status === 202 || r1.status === 207) {
      const ts = Date.now();
      CATEGORY_DEFS.forEach(cat => {
        if (menuState[cat.id]) menuState[cat.id].lastSent = (menuState[cat.id].items || []).map(i => ({...i}));
      });
      menuState._meta = {
        ...(menuState._meta || {}),
        lastUpdatedTs:      ts.toString(),
        lastSentTs:         ts.toString(),
        lastSentCategories: diff.map(d => d.id),
      };
      lsSet(LS_KEYS.lastUpdated, ts.toString());
      invalidateDiff();
      await persistState();
      // Build last_sent_state snapshot for diff computation on next load
      const lastSentState = {};
      CATEGORY_DEFS.forEach(cat => { lastSentState[cat.id] = menuState[cat.id]?.lastSent || []; });
      await sbPatchMenuMeta({
        last_updated_ts:      ts,
        last_sent_ts:         ts,
        last_sent_state:      lastSentState,
        last_sent_categories: diff.map(d => d.id),
      });
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
      showToast('❌ Notification error. Check channel config in Admin settings.', 'error');
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

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
async function loadUsers() {
  const wrap = document.getElementById('users-list');
  wrap.innerHTML = '<div class="db-empty">Loading...</div>';
  try {
    // Fetch menus list for menu access checkboxes
    if (SUPABASE_URL) {
      const menusRes = await fetch(
        `${SUPABASE_URL}/rest/v1/menus?select=id,name&archived=eq.false&order=created_at.asc`,
        { headers: sbHeaders() }
      );
      if (menusRes.ok) window._adminMenuList = await menusRes.json();
    }
    const r = await fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${currentUser?.accessToken}` }
    });
    if (!r.ok) throw new Error(await r.text());
    const users = await r.json();
    window._adminUserList = users;
    renderUsersTab(users);
  } catch (e) {
    wrap.innerHTML = '<div class="db-empty db-error">Failed to load users.</div>';
  }
}

function renderUsersTab(users) {
  const wrap = document.getElementById('users-list');
  if (!users.length) {
    wrap.innerHTML = '<div class="db-empty">No accounts found.</div>';
    return;
  }
  const roleLabel = { none: 'No Access', manager: 'Manager', admin: 'Admin' };
  wrap.innerHTML = users.map(u => {
    const isSelf = u.id === currentUser?.uid;

    // Role controls
    const roleControls = isSelf
      ? `<span class="user-mgmt-self-note">(your account — role locked)</span>`
      : `<select id="user-role-${escHtml(u.id)}" class="user-mgmt-role-select"
                 onchange="renderMenuAccessForUser('${escHtml(u.id)}')">
           <option value="none"    ${u.role === 'none'    ? 'selected' : ''}>No Access</option>
           <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option>
           <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>Admin</option>
         </select>
         <button class="btn-small" onclick="saveUserRole('${escHtml(u.id)}')">Save</button>`;

    // Menu access section (only for non-self users)
    const menuAccessSection = isSelf ? '' : `
      <div class="user-menu-access" id="user-menu-access-${escHtml(u.id)}">
        ${buildMenuAccessHTML(u)}
      </div>`;

    return `
      <div class="config-card">
        <div class="user-mgmt-top">
          <div class="user-mgmt-identity">
            <div class="input-row">
              <input type="text" id="user-name-${escHtml(u.id)}" value="${escHtml(u.name)}" placeholder="Display name" />
              <button class="btn-small" onclick="saveUserName('${escHtml(u.id)}')">Save</button>
            </div>
            <div class="user-mgmt-email">${escHtml(u.email)}</div>
          </div>
          <span class="user-role-badge user-role-badge--${escHtml(u.role)}">${escHtml(roleLabel[u.role] || u.role)}</span>
        </div>
        <div class="input-row user-mgmt-role-row">${roleControls}</div>
        ${menuAccessSection}
      </div>`;
  }).join('');
}

function buildMenuAccessHTML(u) {
  const role = document.getElementById(`user-role-${u.id}`)?.value ?? u.role;
  if (role === 'admin') {
    return `<p class="hint" style="margin:6px 0 0">Admin — access to all menus.</p>`;
  }
  if (role === 'none') return '';
  // role === 'manager': show checkboxes for each menu
  const menus = window._adminMenuList || [];
  if (!menus.length) return `<p class="hint" style="margin:6px 0 0">No menus found.</p>`;
  const checkboxes = menus.map(m => {
    const checked = (u.menuAccess || []).includes(m.id) ? 'checked' : '';
    return `<label class="user-menu-access-label">
      <input type="checkbox" class="user-menu-access-cb"
             data-user="${escHtml(u.id)}" data-menu="${escHtml(m.id)}" ${checked}/>
      ${escHtml(m.name)}
    </label>`;
  }).join('');
  return `<div class="user-menu-access-row">
    <span class="config-input-label" style="margin-bottom:4px">Menu Access</span>
    ${checkboxes}
    <button class="btn-small" onclick="saveMenuAccess('${escHtml(u.id)}')">Save Access</button>
  </div>`;
}

function renderMenuAccessForUser(userId) {
  const u = window._adminUserList?.find(u => u.id === userId);
  if (!u) return;
  const el = document.getElementById(`user-menu-access-${userId}`);
  if (el) el.innerHTML = buildMenuAccessHTML(u);
}

async function saveUserRole(userId) {
  const select = document.getElementById(`user-role-${userId}`);
  if (!select) return;
  const role = select.value;
  try {
    const r = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${currentUser?.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    if (!r.ok) { showToast((await r.json()).error || 'Failed to update role.', 'error'); return; }
    showToast('Role updated.', 'success');
    const badge = select.closest('.config-card')?.querySelector('.user-role-badge');
    if (badge) {
      const label = { none: 'No Access', manager: 'Manager', admin: 'Admin' };
      badge.className = `user-role-badge user-role-badge--${role}`;
      badge.textContent = label[role] || role;
    }
    renderMenuAccessForUser(userId);
  } catch (e) {
    showToast('Network error.', 'error');
  }
}

async function saveMenuAccess(userId) {
  const checkboxes = document.querySelectorAll(`.user-menu-access-cb[data-user="${userId}"]`);
  const menuAccess = [...checkboxes].filter(cb => cb.checked).map(cb => cb.dataset.menu);
  try {
    const r = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${currentUser?.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, menuAccess }),
    });
    if (!r.ok) { showToast((await r.json()).error || 'Failed to update access.', 'error'); return; }
    // Update local cache
    if (window._adminUserList) {
      const u = window._adminUserList.find(u => u.id === userId);
      if (u) u.menuAccess = menuAccess;
    }
    showToast('Menu access updated.', 'success');
  } catch (e) {
    showToast('Network error.', 'error');
  }
}

async function saveUserName(userId) {
  const input = document.getElementById(`user-name-${userId}`);
  if (!input) return;
  try {
    const r = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${currentUser?.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name: input.value }),
    });
    if (!r.ok) { showToast((await r.json()).error || 'Failed to update name.', 'error'); return; }
    showToast('Name updated.', 'success');
  } catch (e) {
    showToast('Network error.', 'error');
  }
}

function openInviteModal() {
  const url = MENU_URL || window.location.origin;
  const brand = document.getElementById('design-brand-name')?.value?.trim() || 'the menu';
  document.getElementById('invite-text-output').value =
    `You've been invited to manage ${brand}!\n\nVisit ${url} and tap "Sign In" to create your account. Once you've signed up, ask an admin to approve your access.`;
  document.getElementById('invite-modal-bg').classList.add('open');
}

function closeInviteModal() {
  document.getElementById('invite-modal-bg').classList.remove('open');
}

async function copyInviteText() {
  await navigator.clipboard.writeText(document.getElementById('invite-text-output').value);
  showToast('Copied!', 'success');
}

document.getElementById('invite-modal-bg').addEventListener('click', e => {
  if (e.target === document.getElementById('invite-modal-bg')) closeInviteModal();
});

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
function switchManagerTab(name) {
  ['edit-menu', 'categories', 'database'].forEach(t => {
    const btn   = document.getElementById('tab-btn-' + t);
    const panel = document.getElementById('tab-panel-' + t);
    if (btn)   { btn.classList.toggle('active', t === name); btn.setAttribute('aria-selected', t === name ? 'true' : 'false'); }
    if (panel) panel.classList.toggle('active', t === name);
  });
  if (name === 'database')   { renderDatabaseTab(); renderPruneSection(); }
  if (name === 'categories') {
    renderCategoriesTab();
    const ctx = document.getElementById('categories-menu-context');
    if (ctx) ctx.textContent = _activeMenuName ? `Editing: ${_activeMenuName}` : '';
  }
}

function switchAdminTab(name) {
  ['admin-restaurants', 'admin-notifications', 'admin-design', 'admin-users'].forEach(t => {
    const btn   = document.getElementById('tab-btn-' + t);
    const panel = document.getElementById('tab-panel-' + t);
    if (btn)   { btn.classList.toggle('active', t === name); btn.setAttribute('aria-selected', t === name ? 'true' : 'false'); }
    if (panel) panel.classList.toggle('active', t === name);
  });
  if (name === 'admin-restaurants')   { renderMenusPanel(); }
  if (name === 'admin-notifications') { initAdminSwitcherTab('notif'); }
  if (name === 'admin-design')        { initAdminSwitcherTab('design'); }
  if (name === 'admin-users')         { loadUsers(); }
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
    (menuState[UNCATEGORIZED_ID]?.items || []).forEach(item => {
      const recipe = recipeArray(item.recipe);
      rows.push({ name: item.name, category: 'Uncategorized', recipe, onMenu: false, eightySixed: false });
      totalItems++;
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
        ? '<p class="db-empty">No menu items loaded.</p>'
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

// ─── PREVIEW ROLE-SWITCHER TOOLBAR ───────────────────────────────────────────
let _previewRole = null; // tracks active mock role; null = using real session

// ─── RESTAURANT & MENU MANAGEMENT ─────────────────────────────────────────────

async function renderMenusPanel() {
  const listEl = document.getElementById('menus-mgmt-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="db-empty">Loading…</p>';
  try {
    const [restRes, menuRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/restaurants?select=id,name,slug&order=name.asc`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/menus?select=id,name,slug,type,archived,restaurant_id&order=name.asc`, { headers: sbHeaders() }),
    ]);
    if (!restRes.ok || !menuRes.ok) throw new Error('fetch failed');
    const restaurants = await restRes.json();
    const allMenus    = await menuRes.json();
    const byRestaurant = {};
    allMenus.forEach(m => {
      if (!byRestaurant[m.restaurant_id]) byRestaurant[m.restaurant_id] = [];
      byRestaurant[m.restaurant_id].push(m);
    });
    if (!restaurants.length) {
      listEl.innerHTML = '<p class="db-empty">No restaurants yet.</p>';
      return;
    }
    listEl.innerHTML = '';
    restaurants.forEach(r => {
      const menus = byRestaurant[r.id] || [];
      const row = document.createElement('div');
      row.className = 'restaurant-row';
      row.id = 'restaurant-row-' + escHtml(r.id);
      const chipsHtml = menus.map(m => `
        <div class="menu-chip${m.archived ? ' is-archived' : ''}" id="menu-chip-${escHtml(m.id)}">
          <span>${escHtml(m.name)}</span>
          <span class="menu-type-badge">${escHtml(m.type || 'drinks')}</span>
          <button class="btn-small" onclick="openRenameMenuForm(${escAttrJs(m.id)},${escAttrJs(m.name)})">Rename</button>
          <button class="btn-small" onclick="archiveMenu(${escAttrJs(m.id)},${!m.archived})">${m.archived ? 'Unarchive' : 'Archive'}</button>
          <button class="btn-small btn-danger" onclick="confirmDeleteMenu(${escAttrJs(m.id)},${escAttrJs(m.name)})">Delete</button>
        </div>`).join('');
      row.innerHTML = `
        <div class="restaurant-header">
          <span class="restaurant-name" id="restaurant-name-${escHtml(r.id)}">${escHtml(r.name)}</span>
          <button class="btn-small" onclick="openRenameRestaurantForm(${escAttrJs(r.id)},${escAttrJs(r.name)})">Rename</button>
          <button class="btn-small btn-danger" onclick="confirmDeleteRestaurant(${escAttrJs(r.id)},${escAttrJs(r.name)})">Delete</button>
        </div>
        <div class="restaurant-menus" id="restaurant-menus-${escHtml(r.id)}">
          ${chipsHtml || '<span style="font-size:12px;color:var(--muted)">No menus yet.</span>'}
        </div>
        <div class="add-menu-form" id="add-menu-form-${escHtml(r.id)}" style="display:none">
          <div class="input-row">
            <input type="text" class="new-menu-name" placeholder="Menu name"
              oninput="syncMenuSlug(this)" id="new-menu-name-${escHtml(r.id)}"/>
            <input type="text" class="new-menu-slug" placeholder="slug" id="new-menu-slug-${escHtml(r.id)}"
              oninput="this.dataset.manuallyEdited='1'"/>
            <select id="new-menu-type-${escHtml(r.id)}">
              <option value="drinks">Drinks</option>
              <option value="food">Food</option>
            </select>
            <button class="btn-small" onclick="confirmCreateMenu('${escHtml(r.id)}')">Add</button>
            <button class="btn-small" onclick="document.getElementById('add-menu-form-${escHtml(r.id)}').style.display='none'">Cancel</button>
          </div>
        </div>
        <div style="padding:6px 14px 10px">
          <button class="btn-small" onclick="document.getElementById('add-menu-form-${escHtml(r.id)}').style.display='';document.getElementById('new-menu-name-${escHtml(r.id)}').focus()">+ Add Menu</button>
        </div>`;
      listEl.appendChild(row);
    });
  } catch(e) {
    listEl.innerHTML = `<p class="db-empty db-error">Failed to load restaurants: ${escHtml(String(e))}</p>`;
  }
}

function openAddRestaurantForm() {
  const form = document.getElementById('add-restaurant-form');
  if (form) { form.style.display = ''; document.getElementById('new-restaurant-name').focus(); }
}

async function confirmAddRestaurant() {
  const input = document.getElementById('new-restaurant-name');
  const name  = (input?.value || '').trim();
  if (!name) return;
  _adminRestaurants = []; _adminAllMenus = []; // invalidate switcher cache
  await createRestaurant(name);
  if (input) input.value = '';
  document.getElementById('add-restaurant-form').style.display = 'none';
}

async function createRestaurant(name) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/restaurants`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify({ name, slug: slugify(name) }),
    });
    if (!r.ok) throw new Error(await r.text());
    await renderMenusPanel();
  } catch(e) {
    showToast(`Failed to create restaurant: ${escHtml(e.message)}`, 'error');
  }
}

function openRenameRestaurantForm(id, currentName) {
  const nameEl = document.getElementById('restaurant-name-' + id);
  if (!nameEl) return;
  const parent = nameEl.closest('.restaurant-header');
  nameEl.style.display = 'none';
  const existing = parent.querySelector('.rename-restaurant-input');
  if (existing) return;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = currentName; inp.className = 'rename-restaurant-input catmgr-input';
  inp.style.flex = '1';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-small'; saveBtn.textContent = 'Save';
  saveBtn.onclick = async () => {
    const newName = inp.value.trim();
    if (newName && newName !== currentName) await renameRestaurant(id, newName);
    else await renderMenusPanel();
  };
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-small'; cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => renderMenusPanel();
  parent.insertBefore(inp, nameEl.nextSibling);
  parent.insertBefore(saveBtn, inp.nextSibling);
  parent.insertBefore(cancelBtn, saveBtn.nextSibling);
  inp.focus();
}

async function renameRestaurant(id, name) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ name, slug: slugify(name) }),
    });
    if (!r.ok) throw new Error(await r.text());
    _adminRestaurants = []; _adminAllMenus = []; // invalidate switcher cache
    await renderMenusPanel();
  } catch(e) {
    showToast(`Failed to rename restaurant: ${escHtml(e.message)}`, 'error');
  }
}

function openRenameMenuForm(id, currentName) {
  const chip = document.getElementById('menu-chip-' + id);
  if (!chip) return;
  const nameSpan = chip.querySelector('span');
  nameSpan.style.display = 'none';
  const existing = chip.querySelector('.rename-menu-input');
  if (existing) return;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = currentName; inp.className = 'rename-menu-input catmgr-input';
  inp.style.width = '100px';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-small'; saveBtn.textContent = 'Save';
  saveBtn.onclick = async () => {
    const newName = inp.value.trim();
    if (newName && newName !== currentName) await renameMenu(id, newName);
    else await renderMenusPanel();
  };
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-small'; cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => renderMenusPanel();
  chip.insertBefore(inp, nameSpan.nextSibling);
  chip.insertBefore(saveBtn, inp.nextSibling);
  chip.insertBefore(cancelBtn, saveBtn.nextSibling);
  inp.focus();
}

async function renameMenu(id, name) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/menus?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ name, slug: slugify(name) }),
    });
    if (!r.ok) throw new Error(await r.text());
    _adminRestaurants = []; _adminAllMenus = []; // invalidate switcher cache
    await renderMenusPanel();
  } catch(e) {
    showToast(`Failed to rename menu: ${escHtml(e.message)}`, 'error');
  }
}

async function confirmCreateMenu(restaurantId) {
  const nameInput = document.getElementById('new-menu-name-' + restaurantId);
  const slugInput = document.getElementById('new-menu-slug-' + restaurantId);
  const typeInput = document.getElementById('new-menu-type-' + restaurantId);
  const name = (nameInput?.value || '').trim();
  const slug = (slugInput?.value || '').trim() || slugify(name);
  const type = typeInput?.value || 'drinks';
  if (!name) return;
  _adminRestaurants = []; _adminAllMenus = []; // invalidate switcher cache
  await createMenu(restaurantId, name, slug, type);
}

async function createMenu(restaurantId, name, slug, type) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/menus`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify({ restaurant_id: restaurantId, name, slug, type }),
    });
    if (r.status === 409) {
      showToast('Slug already taken for this restaurant — edit the slug and try again.', 'error');
      return;
    }
    if (!r.ok) throw new Error(await r.text());
    const [menu] = await r.json();
    const defs = type === 'food' ? DEFAULT_FOOD_CATEGORY_DEFS : DEFAULT_CATEGORY_DEFS.map(c => ({ key: c.id, label: c.title || c.label, icon: c.icon, color: c.color, placeholder: c.placeholder || '' }));
    await sbSeedCategories(menu.id, defs);
    await renderMenusPanel();
    showToast(`✅ Menu "${name}" created.`, 'success');
  } catch(e) {
    showToast(`Failed to create menu: ${escHtml(e.message)}`, 'error');
  }
}

async function archiveMenu(id, archived) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/menus?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ archived }),
    });
    if (!r.ok) throw new Error(await r.text());
    _adminRestaurants = []; _adminAllMenus = []; // invalidate switcher cache
    await renderMenusPanel();
  } catch(e) {
    showToast(`Failed to ${archived ? 'archive' : 'unarchive'} menu: ${escHtml(e.message)}`, 'error');
  }
}

async function confirmDeleteMenu(id, name) {
  if (!confirm(`Permanently delete menu "${name}"?\n\nThis will remove all its categories, items, and metadata. This cannot be undone.`)) return;
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/menus?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: sbHeaders(),
    });
    if (!r.ok) throw new Error(await r.text());
    _adminRestaurants = []; _adminAllMenus = [];
    // If the deleted menu was the active one, clear it
    if (id === MENU_ID) { MENU_ID = ''; RESTAURANT_ID = ''; lsSet(LS_KEYS.menuId, ''); }
    await renderMenusPanel();
    showToast(`Menu "${name}" deleted.`, 'success');
  } catch(e) {
    showToast(`Failed to delete menu: ${escHtml(e.message)}`, 'error');
  }
}

async function confirmDeleteRestaurant(id, name) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return;
  // Check if restaurant has any non-archived menus
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/menus?restaurant_id=eq.${encodeURIComponent(id)}&select=id,name,archived`,
      { headers: sbHeaders() }
    );
    if (r.ok) {
      const menus = await r.json();
      if (menus.length > 0) {
        const menuNames = menus.map(m => m.name).join(', ');
        showToast(`Delete all menus first (${menuNames}).`, 'error');
        return;
      }
    }
  } catch(e) {}
  if (!confirm(`Permanently delete restaurant "${name}"?\n\nThis cannot be undone.`)) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: sbHeaders(),
    });
    if (!r.ok) throw new Error(await r.text());
    _adminRestaurants = []; _adminAllMenus = [];
    if (id === RESTAURANT_ID) { RESTAURANT_ID = ''; }
    await renderMenusPanel();
    showToast(`Restaurant "${name}" deleted.`, 'success');
  } catch(e) {
    showToast(`Failed to delete restaurant: ${escHtml(e.message)}`, 'error');
  }
}

function syncMenuSlug(nameInput) {
  const form = nameInput.closest('.add-menu-form');
  const slugInput = form?.querySelector('.new-menu-slug');
  if (slugInput && !slugInput.dataset.manuallyEdited) slugInput.value = slugify(nameInput.value);
}

function _initPreviewToolbar() {
  if (!IS_PREVIEW) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'preview-toolbar';
  toolbar.setAttribute('aria-label', 'Preview role switcher');
  toolbar.innerHTML = `
    <div class="preview-toolbar-label">PREVIEW</div>
    <button class="preview-toolbar-btn" data-role="public"  onclick="_setPreviewRole('public')">Public</button>
    <button class="preview-toolbar-btn" data-role="manager" onclick="_setPreviewRole('manager')">Manager</button>
    <button class="preview-toolbar-btn" data-role="admin"   onclick="_setPreviewRole('admin')">Admin</button>
    <div class="preview-toolbar-divider"></div>
    <button class="preview-toolbar-btn preview-toolbar-login" onclick="openAuthOverlay()">Login</button>
  `;
  document.body.appendChild(toolbar);
  _updatePreviewToolbar();
}

function _setPreviewRole(role) {
  _previewRole = role;
  if (role === 'public') {
    if (isManagerMode || isAdminMode) exitView();
    currentUser = null;
    applyRole('none');
    renderUserHeader();
  } else {
    // Mock session — no real tokens; writes will fail gracefully
    currentUser = {
      uid: 'preview-user', email: 'preview@preview.test',
      name: 'Preview User', role, accessibleMenuIds: MENU_ID ? [MENU_ID] : [],
      accessToken: null, refreshToken: null, expiresAt: 0,
    };
    applyRole(role);
    renderUserHeader();
    if (role === 'admin') { if (!isAdminMode) enterAdmin(); }
    else { if (!isManagerMode) enterManager(); }
  }
  _updatePreviewToolbar();
}

function _updatePreviewToolbar() {
  const active = _previewRole ?? (currentUser?.role || 'public');
  document.querySelectorAll('#preview-toolbar .preview-toolbar-btn[data-role]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.role === active);
  });
}

init();
if (IS_PREVIEW) _initPreviewToolbar();
