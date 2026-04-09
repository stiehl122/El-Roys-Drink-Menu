// ─── CONFIG ───────────────────────────────────────────────────────────────────
const APP_VERSION = 'v0.8.5';
const RESTAURANTS = {
  LEROYS: { id: '00000000-0000-0000-0000-000000000010', name: "Leroy's Lounge", slug: 'leroys-lounge' },
  ELROYS: { id: '00000000-0000-0000-0000-000000000001', name: "El Roy's Cantina", slug: 'el-roys-cantina' },
};
const MENUS = {
  LEROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000020', restaurantId: RESTAURANTS.LEROYS.id, type: 'drinks', slug: 'leroys-lounge-drinks', name: "Leroy's Lounge Drinks" },
  LEROYS_FOOD: { id: '00000000-0000-0000-0000-000000000021', restaurantId: RESTAURANTS.LEROYS.id, type: 'food', slug: 'leroys-lounge-food', name: "Leroy's Lounge Food" },
  ELROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000002', restaurantId: RESTAURANTS.ELROYS.id, type: 'drinks', slug: 'el-roys-cantina-drinks', name: "El Roy's Cantina Drinks" },
  ELROYS_FOOD: { id: '00000000-0000-0000-0000-000000000003', restaurantId: RESTAURANTS.ELROYS.id, type: 'food', slug: 'el-roys-cantina-food', name: "El Roy's Cantina Food" },
};
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
  lsSchemaVersion: 'hf_ls_schema_version',
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
let _adminSwitcherState = { notif: { restaurantId: '', menuId: '' } };
let syncInterval  = null;
let _tokenRefreshTimer = null;
let _authScreen        = 'signin'; // 'signin' | 'signup' | 'forgot' | 'reset'
let _recoverySessionData = null;   // set when app detects a Supabase recovery URL hash
let _activeMenuName    = '';        // display name of the currently loaded menu
let _activeRestaurantName = '';     // display name of the currently loaded restaurant
let RESTAURANT_ID      = '';        // restaurant_id for the active menu
let MENU_TYPE          = 'drinks';  // 'drinks' | 'food'
let _siteRestaurant    = null;      // restaurant implied by the current pathname
let _appPageMode       = 'public';  // 'picker' | 'public' | 'manager' | 'admin'
let _hasMultipleMenus  = false;     // true once we know multiple menus exist
let _restaurantCustomDesignEnabled = true; // cached restaurants.use_custom_design for the active restaurant
let _visibilityHandler = null;      // Page Visibility API handler for smart polling
let _managerMenuPicked = false;     // true after manager explicitly picks a menu this session
let _pickerFocusBefore = null;
let _pickerOnSelect    = null;     // callback invoked after selectMenu()
let _pickerOnClose     = null;
let _settingsRedirectTimer = null;
let _settingsRedirectCleanup = null;

let _featuredGroups = []; // [{id, name, displayOrder, slots: [{id, itemId, sellNote, displayOrder, confirmedAt, confirmedBy, item: {…}}]}]
let _lastSentFeaturedIds = new Set(); // item IDs that were featured at last Send Update
let _restaurantSpecialsSiblingCatalog = [];
let _restaurantSpecialsCatalogKey = '';
let _restaurantSpecialsCatalogPromise = null;

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

const KNOWN_RESTAURANT_ORDER = [RESTAURANTS.LEROYS.id, RESTAURANTS.ELROYS.id];
const KNOWN_MENU_ORDER = [
  MENUS.LEROYS_DRINKS.id,
  MENUS.LEROYS_FOOD.id,
  MENUS.ELROYS_DRINKS.id,
  MENUS.ELROYS_FOOD.id,
];
const RESTAURANT_SPECIALS = {
  [RESTAURANTS.LEROYS.id]: { name: "Leroy's Specials", menuIds: [MENUS.LEROYS_DRINKS.id, MENUS.LEROYS_FOOD.id] },
  [RESTAURANTS.ELROYS.id]: { name: "El Roy's Specials", menuIds: [MENUS.ELROYS_DRINKS.id, MENUS.ELROYS_FOOD.id] },
};
const LEGACY_MENU_SLUG_ALIASES = {
  'el-roys': MENUS.ELROYS_DRINKS.slug,
};
const SITE_PATHS = {
  [RESTAURANTS.LEROYS.id]: '/leroyslounge',
  [RESTAURANTS.ELROYS.id]: '/elroyscantina',
};
const SHARED_PAGE_PATHS = {
  manager: '/manager',
  admin: '/admin',
};
const REDIRECT_NOTICE_KEY = 'hf_redirect_notice';

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
function lsSet(key, val, options = {}) {
  const { silent = false } = options;
  try {
    localStorage.setItem(key, val);
    return true;
  } catch(e) {
    if (!silent) showToast('⚠️ Storage full — data not saved locally.', 'error');
    return false;
  }
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
let _managerDraggedItemId = '';
let _managerDraggedCatId = '';
function invalidateDiff() { _diffDirty = true; _dirty = true; updateSaveBtn(); }
function updateSaveBtn() {
  const btn = document.getElementById('save-btn');
  if (btn) btn.disabled = !_dirty;
  updateManagerActionBar();
}
function getCachedDiff() {
  if (_diffDirty) { _diffCache = computeDiff(); _diffDirty = false; }
  return _diffCache;
}

function sanitizeMenuName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function knownRestaurantList() {
  return [RESTAURANTS.LEROYS, RESTAURANTS.ELROYS];
}

function knownMenuList() {
  return [MENUS.LEROYS_DRINKS, MENUS.LEROYS_FOOD, MENUS.ELROYS_DRINKS, MENUS.ELROYS_FOOD];
}

function isValidRestaurant(restaurantId) {
  return restaurantId === RESTAURANTS.LEROYS.id || restaurantId === RESTAURANTS.ELROYS.id;
}

function sortKnownRestaurants(restaurants) {
  return [...restaurants].sort((a, b) => KNOWN_RESTAURANT_ORDER.indexOf(a.id) - KNOWN_RESTAURANT_ORDER.indexOf(b.id));
}

function sortKnownMenus(menus) {
  return [...menus].sort((a, b) => KNOWN_MENU_ORDER.indexOf(a.id) - KNOWN_MENU_ORDER.indexOf(b.id));
}

function normalizeKnownMenuSlug(slug) {
  return LEGACY_MENU_SLUG_ALIASES[slug] || slug;
}

function normalizeAccessibleMenuIds(menuIds) {
  return (Array.isArray(menuIds) ? menuIds : []).filter(menuId => KNOWN_MENU_ORDER.includes(menuId));
}

function getRestaurantById(id) {
  return knownRestaurantList().find(restaurant => restaurant.id === id) || null;
}

function getMenuById(menuId) {
  return knownMenuList().find(menu => menu.id === menuId) || null;
}

function getRestaurantMenuIds(restaurantId) {
  return knownMenuList()
    .filter(menu => menu.restaurantId === restaurantId)
    .map(menu => menu.id);
}

function getRestaurantSpecialConfig(restaurantId = RESTAURANT_ID) {
  return restaurantId ? RESTAURANT_SPECIALS[restaurantId] || null : null;
}

function getRestaurantSpecialLabel(restaurantId = RESTAURANT_ID) {
  return getRestaurantSpecialConfig(restaurantId)?.name || 'Specials';
}

function isLegacySpecialCategory(catOrId) {
  const id = typeof catOrId === 'string' ? catOrId : catOrId?.id;
  return id === 'special';
}

function getManagedCategoryDefs() {
  return CATEGORY_DEFS.map(cat => (
    isLegacySpecialCategory(cat)
      ? { ...cat, deprecated: true, readOnly: true }
      : cat
  ));
}

function getMenuBySlug(slug) {
  const normalizedSlug = normalizeKnownMenuSlug(slug || '');
  return knownMenuList().find(menu => menu.slug === normalizedSlug) || null;
}

function getRequestedMenuForSettingsPage() {
  const requestedSlug = new URLSearchParams(location.search).get('menu') || '';
  if (requestedSlug) return getMenuBySlug(requestedSlug);
  if (MENU_ID) return getMenuById(MENU_ID);
  return null;
}

function getFirstAccessibleManagerMenuId(user = currentUser) {
  if (user?.role === 'admin') return KNOWN_MENU_ORDER[0] || '';
  const allowedIds = new Set(normalizeAccessibleMenuIds(user?.accessibleMenuIds));
  return KNOWN_MENU_ORDER.find(menuId => allowedIds.has(menuId)) || '';
}

function currentUserCanManageMenu(menuId = MENU_ID, user = currentUser) {
  if (!menuId || !KNOWN_MENU_ORDER.includes(menuId) || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'manager') return false;
  return normalizeAccessibleMenuIds(user.accessibleMenuIds).includes(menuId);
}

function currentUserCanEditRestaurantSpecials(restaurantId = RESTAURANT_ID, user = currentUser) {
  if (!restaurantId || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'manager') return false;
  const requiredMenuIds = getRestaurantSpecialConfig(restaurantId)?.menuIds || getRestaurantMenuIds(restaurantId);
  if (!requiredMenuIds.length) return false;
  const accessibleMenuIds = new Set(normalizeAccessibleMenuIds(user.accessibleMenuIds));
  return requiredMenuIds.every(menuId => accessibleMenuIds.has(menuId));
}

function getFeaturedConfirmationKey(restaurantId = RESTAURANT_ID) {
  return `featured_confirmed:${restaurantId || 'unknown'}`;
}

function getMenuTypeLabel(menuType) {
  return (menuType || '').toLowerCase() === 'food' ? 'Food' : 'Drinks';
}

function formatMenuDisplayName(menuName, menuType, restaurantId) {
  const restaurantName = getRestaurantById(restaurantId)?.name || '';
  const typeLabel = getMenuTypeLabel(menuType);
  if (restaurantName) return `${restaurantName} ${typeLabel}`;
  return menuName || typeLabel;
}

function _clearActiveMenuContext({ clearCache = false } = {}) {
  MENU_ID = '';
  RESTAURANT_ID = '';
  _activeRestaurantName = '';
  _activeMenuName = '';
  _restaurantCustomDesignEnabled = true;
  lsSet(LS_KEYS.menuId, '');
  if (clearCache) localStorage.removeItem(LS_KEYS.menuCache);
}

function queueRedirectNotice(message) {
  if (!message) return;
  try { sessionStorage.setItem(REDIRECT_NOTICE_KEY, message); } catch (_) { /* ignore */ }
}

function consumeRedirectNotice() {
  try {
    const message = sessionStorage.getItem(REDIRECT_NOTICE_KEY) || '';
    if (message) sessionStorage.removeItem(REDIRECT_NOTICE_KEY);
    return message;
  } catch (_) {
    return '';
  }
}

function redirectToRestaurantPath(restaurantId, slug = '', message = '') {
  const safeRestaurantId = isValidRestaurant(restaurantId) ? restaurantId : RESTAURANTS.LEROYS.id;
  const path = SITE_PATHS[safeRestaurantId] || SITE_PATHS[RESTAURANTS.LEROYS.id];
  const url = new URL(path, window.location.origin);
  if (slug) url.searchParams.set('menu', slug);
  _clearActiveMenuContext({ clearCache: !isValidRestaurant(restaurantId) });
  queueRedirectNotice(message);
  navigateToPage(`${url.pathname}${url.search}`);
  return false;
}

function setActiveMenuContext(menuName, menuType, restaurantId) {
  if (!isValidRestaurant(restaurantId)) {
    console.warn(`Invalid restaurant: ${restaurantId}`);
    return redirectToRestaurantPath(RESTAURANTS.LEROYS.id, '', 'Unsupported restaurant menu requested. Redirected to Leroy\'s Lounge.');
  }
  MENU_TYPE = menuType || 'drinks';
  RESTAURANT_ID = restaurantId || '';
  _activeRestaurantName = getRestaurantById(RESTAURANT_ID)?.name || '';
  _activeMenuName = formatMenuDisplayName(menuName, MENU_TYPE, RESTAURANT_ID);
  return true;
}

function getSiteRestaurantFromPath(pathname = window.location.pathname) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (
    normalizedPath === SITE_PATHS[RESTAURANTS.LEROYS.id] ||
    normalizedPath === `${SITE_PATHS[RESTAURANTS.LEROYS.id]}.html` ||
    normalizedPath === `${SITE_PATHS[RESTAURANTS.LEROYS.id]}/index.html`
  ) return RESTAURANTS.LEROYS;
  if (
    normalizedPath === SITE_PATHS[RESTAURANTS.ELROYS.id] ||
    normalizedPath === `${SITE_PATHS[RESTAURANTS.ELROYS.id]}.html` ||
    normalizedPath === `${SITE_PATHS[RESTAURANTS.ELROYS.id]}/index.html`
  ) return RESTAURANTS.ELROYS;
  return null;
}

function getAppPageModeFromPath(pathname = window.location.pathname) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (
    normalizedPath === SHARED_PAGE_PATHS.manager ||
    normalizedPath === `${SHARED_PAGE_PATHS.manager}.html` ||
    normalizedPath === `${SHARED_PAGE_PATHS.manager}/index.html`
  ) return 'manager';
  if (
    normalizedPath === SHARED_PAGE_PATHS.admin ||
    normalizedPath === `${SHARED_PAGE_PATHS.admin}.html` ||
    normalizedPath === `${SHARED_PAGE_PATHS.admin}/index.html`
  ) return 'admin';
  return isRootSitePath(normalizedPath) ? 'picker' : 'public';
}

function isRootSitePath(pathname = window.location.pathname) {
  return (pathname.replace(/\/+$/, '') || '/') === '/';
}

function isSettingsPage() {
  return _appPageMode === 'manager' || _appPageMode === 'admin';
}

function getDefaultPublicPath() {
  if (RESTAURANT_ID && SITE_PATHS[RESTAURANT_ID]) return SITE_PATHS[RESTAURANT_ID];
  if (_siteRestaurant?.id && SITE_PATHS[_siteRestaurant.id]) return SITE_PATHS[_siteRestaurant.id];
  return '/';
}

function getPublicHrefForMenuId(menuId) {
  const menu = getMenuById(menuId);
  const basePath = menu?.restaurantId && SITE_PATHS[menu.restaurantId]
    ? SITE_PATHS[menu.restaurantId]
    : getDefaultPublicPath();
  if (!menu?.slug) return basePath;
  const url = new URL(basePath, window.location.origin);
  url.searchParams.set('menu', menu.slug);
  return `${url.pathname}${url.search}`;
}

function getPublicHrefForCurrentMenu() {
  return getPublicHrefForMenuId(MENU_ID);
}

function getManagerHrefForMenuId(menuId) {
  const menu = getMenuById(menuId);
  if (!menu?.slug) return SHARED_PAGE_PATHS.manager;
  const url = new URL(SHARED_PAGE_PATHS.manager, window.location.origin);
  url.searchParams.set('menu', menu.slug);
  return `${url.pathname}${url.search}`;
}

function navigateToPage(path) {
  window.location.assign(path);
}

function readCachedMenuState(expectedRestaurantId = '') {
  const cached = localStorage.getItem(LS_KEYS.menuCache);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    const cachedRestaurantId = parsed?.restaurant?.id || '';
    if (!isValidRestaurant(cachedRestaurantId)) {
      _clearActiveMenuContext({ clearCache: true });
      return null;
    }
    if (expectedRestaurantId && cachedRestaurantId !== expectedRestaurantId) {
      localStorage.removeItem(LS_KEYS.menuCache);
      return null;
    }
    return parsed;
  } catch (_) {
    localStorage.removeItem(LS_KEYS.menuCache);
    return null;
  }
}

function getDefaultMenuForRestaurant(restaurant) {
  if (!isValidRestaurant(restaurant?.id)) return MENUS.LEROYS_DRINKS;
  return knownMenuList().find(menu => (
    menu.restaurantId === restaurant.id && menu.type === 'drinks'
  )) || MENUS.LEROYS_DRINKS;
}

function primeSiteRestaurantMenu(restaurant) {
  const preferredMenu = getDefaultMenuForRestaurant(restaurant);
  MENU_ID = preferredMenu.id;
  lsSet(LS_KEYS.menuId, MENU_ID);
  setActiveMenuContext(preferredMenu.name, preferredMenu.type, preferredMenu.restaurantId);
  const url = new URL(location.href);
  url.searchParams.set('menu', preferredMenu.slug);
  history.replaceState({}, '', url.toString());
}

function showPickerPage() {
  document.body.classList.add('is-site-picker');
  document.getElementById('site-picker-view')?.removeAttribute('hidden');
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = 'none';
  document.getElementById('auth-overlay')?.classList.remove('open');
  closeMenuPicker({ skipOnClose: true });
  document.title = 'Choose a Restaurant | Current Menu';
}

function showAppShell() {
  document.body.classList.remove('is-site-picker');
  document.getElementById('site-picker-view')?.setAttribute('hidden', 'hidden');
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = '';
}

function isDedicatedRestaurantPage() {
  return !!_siteRestaurant;
}

function _setRestaurantPublicMode(active) {
  document.body.classList.toggle('restaurant-public-site', !!active);
}

function _togglePublicShellMode(mode) {
  const siteWrapper = document.getElementById('restaurant-site-wrapper');
  const defaultShell = document.getElementById('public-default-shell');
  const useSiteWrapper = mode === 'site' && !!siteWrapper;
  document.body.classList.remove('route-shell-pending');
  if (siteWrapper) {
    if (useSiteWrapper) siteWrapper.removeAttribute('hidden');
    else siteWrapper.setAttribute('hidden', 'hidden');
  }
  if (defaultShell) defaultShell.style.display = useSiteWrapper ? 'none' : '';
  _setRestaurantPublicMode(useSiteWrapper);
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

async function sbFetchOrThrow(url, options = {}) {
  const res = await fetch(url, options);
  if (res.ok) return res;
  let detail = '';
  try { detail = (await res.text()).trim(); } catch (_) { /* ignore */ }
  throw new Error(detail ? `${res.status} ${res.statusText}: ${detail}` : `${res.status} ${res.statusText}`);
}

async function sbReadJsonOrThrow(url, options = {}) {
  const res = await sbFetchOrThrow(url, options);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Resolve which menu to load based on ?menu={slug}, localStorage cache, or
// the hardcoded default order. Sets MENU_ID and normalizes legacy slugs.
async function sbResolveMenu() {
  const rawSlug = new URLSearchParams(location.search).get('menu');
  const slug = normalizeKnownMenuSlug(rawSlug);

  if (slug) {
    const [menuRes, allMenusRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/menus?slug=eq.${encodeURIComponent(slug)}&select=id,name,type,restaurant_id`,
        { headers: sbHeaders() }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/menus?id=in.(${KNOWN_MENU_ORDER.join(',')})&select=id,name,slug,type,restaurant_id,archived`,
        { headers: sbHeaders() }
      ),
    ]);
    if (allMenusRes.ok) {
      const siblings = await allMenusRes.json();
      _hasMultipleMenus = siblings.filter(menu => !menu.archived).length > 1;
    }
    if (menuRes.ok) {
      const [menu] = await menuRes.json();
      if (menu?.id) {
        if (!isValidRestaurant(menu.restaurant_id)) {
          redirectToRestaurantPath(RESTAURANTS.LEROYS.id, '', 'Unsupported restaurant menu requested. Redirected to Leroy\'s Lounge.');
          return;
        }
        if (_siteRestaurant?.id && menu.restaurant_id !== _siteRestaurant.id) {
          redirectToRestaurantPath(menu.restaurant_id, slug);
          return;
        }
        MENU_ID          = menu.id;
        if (setActiveMenuContext(menu.name || '', menu.type || 'drinks', menu.restaurant_id || '') === false) return;
        lsSet(LS_KEYS.menuId, MENU_ID);
        if (rawSlug && rawSlug !== slug) {
          const url = new URL(location.href);
          url.searchParams.set('menu', slug);
          history.replaceState({}, '', url.toString());
        }
        return;
      }
    }
    const invalidSlug = rawSlug || slug;
    _clearActiveMenuContext({ clearCache: true });
    if (_siteRestaurant?.id) {
      queueRedirectNotice(`Menu "${invalidSlug}" not found. Showing default menu for ${_siteRestaurant.name}.`);
      primeSiteRestaurantMenu(_siteRestaurant);
      return sbResolveMenu();
    }
    queueRedirectNotice(`Menu "${invalidSlug}" not found. Showing default menu.`);
  }

  if (MENU_ID) {
    const [nameRes, allMenusRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/menus?id=eq.${MENU_ID}&select=name,slug,type,restaurant_id,archived`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/menus?id=in.(${KNOWN_MENU_ORDER.join(',')})&select=id,archived`, { headers: sbHeaders() }),
    ]);
    if (nameRes.ok) {
      const [menu] = await nameRes.json();
      if (menu && !isValidRestaurant(menu.restaurant_id)) {
        redirectToRestaurantPath(RESTAURANTS.LEROYS.id, '', 'Unsupported restaurant menu requested. Redirected to Leroy\'s Lounge.');
        return;
      }
      if (menu?.archived === true) {
        _clearActiveMenuContext({ clearCache: true });
      } else if (menu) {
        if (_siteRestaurant?.id && menu.restaurant_id !== _siteRestaurant.id) {
          redirectToRestaurantPath(menu.restaurant_id, menu.slug || '');
          return;
        }
        if (setActiveMenuContext(menu.name || '', menu.type || MENU_TYPE, menu.restaurant_id || RESTAURANT_ID) === false) return;
        if (menu.slug) {
          const url = new URL(location.href);
          url.searchParams.set('menu', menu.slug);
          history.replaceState({}, '', url.toString());
        }
      } else {
        _clearActiveMenuContext({ clearCache: true });
      }
    }
    if (allMenusRes.ok) {
      const siblings = await allMenusRes.json();
      _hasMultipleMenus = siblings.filter(menu => !menu.archived).length > 1;
    }
    if (MENU_ID) return;
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/menus?id=in.(${KNOWN_MENU_ORDER.join(',')})&select=id,slug,name,type,restaurant_id,archived`,
    { headers: sbHeaders() }
  );
  if (!res.ok) return;
  const menus = sortKnownMenus((await res.json()).filter(menu => !menu.archived));
  _hasMultipleMenus = menus.length > 1;

  let defaultMenu = menus.find(menu => menu.id === MENUS.LEROYS_DRINKS.id);
  if (!defaultMenu && currentUser?.role === 'manager') {
    defaultMenu = menus.find(menu => normalizeAccessibleMenuIds(currentUser.accessibleMenuIds).includes(menu.id));
  }
  if (!defaultMenu) defaultMenu = menus[0];

  if (defaultMenu) {
    MENU_ID          = defaultMenu.id;
    if (setActiveMenuContext(defaultMenu.name || '', defaultMenu.type || 'drinks', defaultMenu.restaurant_id || '') === false) return;
    lsSet(LS_KEYS.menuId, MENU_ID);
    if (_siteRestaurant?.id && defaultMenu.restaurant_id !== _siteRestaurant.id) {
      redirectToRestaurantPath(defaultMenu.restaurant_id, defaultMenu.slug || '');
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('menu', defaultMenu.slug);
    history.replaceState({}, '', url.toString());
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
    ? fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${RESTAURANT_ID}&select=id,name,design,use_custom_design`, { headers: sbHeaders() })
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
  let restaurant = null;
  if (restRes?.ok) {
    const [rest] = await restRes.json();
    if (rest) restaurant = rest;
  }
  return { cats, meta: meta || null, restaurant };
}

function itemUpchargeArray(upcharges) {
  if (!Array.isArray(upcharges)) return [];
  return upcharges
    .map(entry => ({
      label: String(entry?.label || '').trim(),
      price: String(entry?.price || '').trim(),
    }))
    .filter(entry => entry.label || entry.price);
}

function hydrateMenuItem(record, overrides = {}) {
  return {
    id:          record.id,
    name:        record.name || '',
    desc:        record.desc || '',
    recipe:      recipeArray(record.recipe),
    price:       record.price || '',
    eightySixed: record.eightySixed ?? record.is_eighty_sixed ?? false,
    onMenu:      overrides.onMenu ?? record.onMenu ?? record.on_menu ?? true,
    visibility:  record.visibility || 'public',
    upcharges:   itemUpchargeArray(record.upcharges),
    showDescription: record.showDescription ?? record.show_description ?? true,
    showRecipe:  record.showRecipe ?? record.show_recipe ?? false,
  };
}

function cloneMenuItemState(item) {
  return {
    ...item,
    recipe: recipeArray(item.recipe),
    upcharges: itemUpchargeArray(item.upcharges).map(entry => ({ ...entry })),
  };
}

function isItemDescriptionPublic(item) {
  return item?.showDescription !== false;
}

function isItemRecipePublic(item) {
  return !!item?.showRecipe;
}

function hydrateState({ cats, meta, restaurant }) {
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

  const lastSentState = meta?.last_sent_state && typeof meta.last_sent_state === 'object'
    ? meta.last_sent_state
    : {};
  const hasLastSentTs = !!meta?.last_sent_ts;
  menuState = {};
  realCats.forEach(c => {
    const items = (c.items || [])
      .sort((a, b) => a.display_order - b.display_order)
      .map(i => hydrateMenuItem(i));
    const hasStoredLastSent = Object.prototype.hasOwnProperty.call(lastSentState, c.key);
    menuState[c.key] = {
      items,
      lastSent: hasStoredLastSent
        ? (Array.isArray(lastSentState[c.key]) ? lastSentState[c.key].map(i => hydrateMenuItem(i)) : [])
        : (hasLastSentTs ? items.map(cloneMenuItemState) : []),
    };
  });

  if (uncatCat) {
    menuState[UNCATEGORIZED_ID] = {
      items: (uncatCat.items || []).map(i => hydrateMenuItem(i, { onMenu: false })),
      lastSent: [],
    };
  }

  _activeRestaurantName = restaurant?.name || '';
  _restaurantCustomDesignEnabled = restaurant?.use_custom_design !== false;
  currentDesign = restaurant?.design && Object.keys(restaurant.design).length
    ? { ...DESIGN_DEFAULTS, ...restaurant.design }
    : { ...DESIGN_DEFAULTS };

  if (meta) {
    menuState._meta = {
      lastUpdatedTs:      meta.last_updated_ts?.toString()  || '',
      lastSentTs:         meta.last_sent_ts?.toString()     || '',
      lastSentCategories: meta.last_sent_categories         || [],
    };
    _menuMetaSupportsLastSentFeatured = Object.prototype.hasOwnProperty.call(meta, 'last_sent_featured');
    if (meta.bot_id) BOT_ID = meta.bot_id;
    if (meta.notifications) NOTIFICATIONS = meta.notifications;
    if (meta.last_updated_ts) lsSet(LS_KEYS.lastUpdated, meta.last_updated_ts.toString());
    if (meta.last_sent_featured) _lastSentFeaturedIds = new Set(meta.last_sent_featured);
  }
}

function getCategoryStateSnapshot() {
  return JSON.stringify(CATEGORY_DEFS.map(cat => ({
    id: cat.id,
    state: menuState[cat.id] || { items: [], lastSent: [] },
  })));
}

function getDesignSnapshot() {
  return JSON.stringify(currentDesign);
}

function getFeaturedSnapshot() {
  return JSON.stringify(_featuredGroups.map(group => ({
    id: group.id,
    slots: group.slots.map(slot => ({
      id: slot.id,
      itemId: slot.itemId,
      name: slot.item?.name || '',
      eightySixed: !!slot.item?.eightySixed,
      price: slot.item?.price || '',
      desc: slot.item?.desc || '',
      sellNote: slot.sellNote || '',
    })),
  })));
}

function resetRestaurantSpecialsCatalog() {
  _restaurantSpecialsSiblingCatalog = [];
  _restaurantSpecialsCatalogKey = '';
  _restaurantSpecialsCatalogPromise = null;
}

function buildCurrentMenuSpecialsCatalog() {
  const currentMenu = getMenuById(MENU_ID);
  return getManagedCategoryDefs().flatMap(cat =>
    (menuState[cat.id]?.items || []).map(item => ({
      id: item.id,
      name: item.name,
      cat: cat.title,
      menuId: MENU_ID,
      menuLabel: currentMenu ? getMenuTypeLabel(currentMenu.type) : 'Current Menu',
      onMenu: item.onMenu,
      visibility: item.visibility || 'public',
    }))
  );
}

function getRestaurantSpecialsCatalog() {
  return [...buildCurrentMenuSpecialsCatalog(), ..._restaurantSpecialsSiblingCatalog];
}

async function ensureRestaurantSpecialsGroup(restaurantId = RESTAURANT_ID) {
  if (!restaurantId || !currentUser?.accessToken) return;
  try {
    await fetch('/api/specials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.accessToken}`,
      },
      body: JSON.stringify({ action: 'ensure', restaurantId }),
    });
  } catch (_) {
    /* allow reads to continue with legacy fallback */
  }
}

async function refreshRestaurantSpecialsCatalog(restaurantId = RESTAURANT_ID) {
  const cacheKey = `${restaurantId || ''}:${MENU_ID || ''}`;
  if (!restaurantId || !currentUserCanEditRestaurantSpecials(restaurantId)) {
    resetRestaurantSpecialsCatalog();
    return [];
  }
  if (_restaurantSpecialsCatalogKey === cacheKey && _restaurantSpecialsCatalogPromise) {
    return _restaurantSpecialsCatalogPromise;
  }

  const siblingMenuIds = (getRestaurantSpecialConfig(restaurantId)?.menuIds || getRestaurantMenuIds(restaurantId))
    .filter(menuId => menuId && menuId !== MENU_ID);
  if (!siblingMenuIds.length) {
    _restaurantSpecialsSiblingCatalog = [];
    _restaurantSpecialsCatalogKey = cacheKey;
    _restaurantSpecialsCatalogPromise = Promise.resolve([]);
    return _restaurantSpecialsCatalogPromise;
  }

  _restaurantSpecialsCatalogKey = cacheKey;
  _restaurantSpecialsCatalogPromise = (async () => {
    const requestKey = cacheKey;
    try {
      const categories = await sbReadJsonOrThrow(
        `${SUPABASE_URL}/rest/v1/categories?menu_id=in.(${siblingMenuIds.join(',')})&select=menu_id,key,label,items(id,name,visibility,on_menu)&order=display_order.asc`,
        { headers: sbHeaders() }
      );
      const menusById = knownMenuList().reduce((acc, menu) => {
        acc[menu.id] = menu;
        return acc;
      }, {});
      const catalog = categories
        .filter(category => category.key !== UNCATEGORIZED_ID && !isLegacySpecialCategory(category.key))
        .flatMap(category =>
        (category.items || []).map(item => ({
          id: item.id,
          name: item.name,
          cat: category.label || '',
          menuId: category.menu_id,
          menuLabel: getMenuTypeLabel(menusById[category.menu_id]?.type || ''),
          onMenu: item.on_menu,
          visibility: item.visibility || 'public',
        }))
      );
      if (_restaurantSpecialsCatalogKey === requestKey) {
        _restaurantSpecialsSiblingCatalog = catalog;
      }
    } catch (_) {
      if (_restaurantSpecialsCatalogKey === requestKey) {
        _restaurantSpecialsSiblingCatalog = [];
      }
    }
    return _restaurantSpecialsSiblingCatalog;
  })();
  return _restaurantSpecialsCatalogPromise;
}

async function refreshFeaturedForActiveMenu() {
  if (!RESTAURANT_ID) {
    _featuredGroups = [];
    resetRestaurantSpecialsCatalog();
    return _featuredGroups;
  }
  if (currentUserCanEditRestaurantSpecials(RESTAURANT_ID) && currentUser?.accessToken) {
    await ensureRestaurantSpecialsGroup(RESTAURANT_ID);
    await refreshRestaurantSpecialsCatalog(RESTAURANT_ID);
  } else {
    resetRestaurantSpecialsCatalog();
  }
  _featuredGroups = await sbReadRestaurantSpecials(RESTAURANT_ID);
  return _featuredGroups;
}

async function loadActiveMenuState(options = {}) {
  const {
    fallbackToDefault = true,
    includeFeatured = true,
    persistCache = true,
  } = options;
  try {
    const data = await sbRead();
    if (data) {
      hydrateState(data);
      if (persistCache) lsSet(LS_KEYS.menuCache, JSON.stringify(data));
    } else if (fallbackToDefault) {
      menuState = defaultState();
      currentDesign = { ...DESIGN_DEFAULTS };
      _restaurantCustomDesignEnabled = true;
    }
  } catch (e) {
    if (fallbackToDefault) {
      menuState = defaultState();
      currentDesign = { ...DESIGN_DEFAULTS };
      _restaurantCustomDesignEnabled = true;
    } else {
      throw e;
    }
  }
  if (includeFeatured) await refreshFeaturedForActiveMenu();
}

async function sbPatchMenuMeta(update) {
  return sbPatchMenuMetaForMenu(MENU_ID, update);
}

async function sbPatchMenuMetaForMenu(menuId, update) {
  if (!SUPABASE_URL || !menuId || !currentUser?.accessToken) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/menu_meta?menu_id=eq.${menuId}`, {
    method:  'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body:    JSON.stringify(update),
  });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.text()).trim(); } catch (_) { /* ignore */ }
    throw new Error(detail ? `menu_meta patch: ${r.status} ${detail}` : `menu_meta patch: ${r.status}`);
  }
}

function snapshotCurrentItemsAsLastSent() {
  const lastSentState = {};
  CATEGORY_DEFS.forEach(cat => {
    lastSentState[cat.id] = (menuState[cat.id]?.items || []).map(item => ({ ...item }));
  });
  return lastSentState;
}

function buildMenuCacheSnapshot() {
  const cats = CATEGORY_DEFS.map((cat, index) => ({
    id: cat._uuid || `local-${cat.id}`,
    key: cat.id,
    label: cat.title,
    icon: cat.icon || '',
    color: cat.color || '',
    sub: cat.sub || '',
    placeholder: cat.placeholder || '',
    display_order: index,
    items: (menuState[cat.id]?.items || []).map((item, itemIndex) => ({
      id: item.id,
      name: item.name,
      desc: item.desc || '',
      recipe: Array.isArray(item.recipe) ? item.recipe : recipeArray(item.recipe),
      price: item.price || '',
      is_eighty_sixed: !!item.eightySixed,
      on_menu: item.onMenu !== false,
      visibility: item.visibility || 'public',
      upcharges: itemUpchargeArray(item.upcharges),
      show_description: isItemDescriptionPublic(item),
      show_recipe: isItemRecipePublic(item),
      display_order: itemIndex,
    })),
  }));
  const uncategorizedItems = menuState[UNCATEGORIZED_ID]?.items || [];
  if (uncategorizedItems.length || _uncatCategoryUuid) {
    cats.push({
      id: _uncatCategoryUuid || `local-${UNCATEGORIZED_ID}`,
      key: UNCATEGORIZED_ID,
      label: 'Uncategorized',
      icon: '',
      color: '',
      sub: '',
      placeholder: '',
      display_order: 9999,
      items: uncategorizedItems.map((item, itemIndex) => ({
        id: item.id,
        name: item.name,
        desc: item.desc || '',
        recipe: Array.isArray(item.recipe) ? item.recipe : recipeArray(item.recipe),
        price: item.price || '',
        is_eighty_sixed: !!item.eightySixed,
        on_menu: false,
        visibility: item.visibility || 'public',
        upcharges: itemUpchargeArray(item.upcharges),
        show_description: isItemDescriptionPublic(item),
        show_recipe: isItemRecipePublic(item),
        display_order: itemIndex,
      })),
    });
  }
  const meta = {
    bot_id: BOT_ID || '',
    notifications: NOTIFICATIONS || {},
    last_updated_ts: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
    last_sent_ts: menuState._meta?.lastSentTs ? Number(menuState._meta.lastSentTs) : null,
    last_sent_state: snapshotLastSentState(),
    last_sent_categories: menuState._meta?.lastSentCategories || [],
  };
  if (_menuMetaSupportsLastSentFeatured !== false) {
    meta.last_sent_featured = Array.from(_lastSentFeaturedIds);
  }
  const restaurant = isValidRestaurant(RESTAURANT_ID)
    ? {
        id: RESTAURANT_ID,
        name: _activeRestaurantName || getRestaurantById(RESTAURANT_ID)?.name || '',
        design: currentDesign,
        use_custom_design: _restaurantCustomDesignEnabled,
      }
    : null;
  return { cats, meta, restaurant };
}

function syncLocalMenuCache(options = {}) {
  return lsSet(LS_KEYS.menuCache, JSON.stringify(buildMenuCacheSnapshot()), options);
}

function isMissingColumnError(error, columnName) {
  const message = `${error?.message || error || ''}`.toLowerCase();
  return message.includes(columnName.toLowerCase()) &&
    (message.includes('column') || message.includes('schema cache'));
}

async function patchMenuMetaWithCompatibility(update) {
  const payload = { ...update };
  if (_menuMetaSupportsLastSentFeatured === false) {
    delete payload.last_sent_featured;
  }
  try {
    await sbPatchMenuMeta(payload);
    if (Object.prototype.hasOwnProperty.call(payload, 'last_sent_featured')) {
      _menuMetaSupportsLastSentFeatured = true;
    }
    return { downgradedFields: [] };
  } catch (error) {
    if (Object.prototype.hasOwnProperty.call(payload, 'last_sent_featured') && isMissingColumnError(error, 'last_sent_featured')) {
      const { last_sent_featured, ...fallbackPayload } = payload;
      await sbPatchMenuMeta(fallbackPayload);
      _menuMetaSupportsLastSentFeatured = false;
      return { downgradedFields: ['last_sent_featured'] };
    }
    throw error;
  }
}

async function sbPatchRestaurantDesign(design) {
  if (!SUPABASE_URL || !RESTAURANT_ID || !currentUser?.accessToken) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${RESTAURANT_ID}`, {
    method:  'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=minimal' }),
    body:    JSON.stringify({ design }),
  });
  if (!r.ok) throw new Error(`restaurant patch: ${r.status}`);
}

async function sbGetRestaurantSpecialGroup(restaurantId = RESTAURANT_ID, options = {}) {
  const { createIfMissing = false } = options;
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!SUPABASE_URL || !config?.name) return null;
  try {
    const groups = await sbReadJsonOrThrow(
      `${SUPABASE_URL}/rest/v1/featured_groups?name=eq.${encodeURIComponent(config.name)}&select=id,name&limit=1`,
      { headers: sbHeaders() }
    );
    if (groups?.[0]) return groups[0];
    if (!createIfMissing || !currentUser?.accessToken) return null;
    const created = await sbReadJsonOrThrow(`${SUPABASE_URL}/rest/v1/featured_groups`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify({ name: config.name }),
    });
    return created?.[0] || null;
  } catch (e) {
    if (!createIfMissing) return null;
    try {
      const groups = await sbReadJsonOrThrow(
        `${SUPABASE_URL}/rest/v1/featured_groups?name=eq.${encodeURIComponent(config.name)}&select=id,name&limit=1`,
        { headers: sbHeaders() }
      );
      return groups?.[0] || null;
    } catch (_) {
      return null;
    }
  }
}

async function sbReadLegacyFeatured(menuId = MENU_ID) {
  if (!SUPABASE_URL || !menuId) return [];
  try {
    const menuGroups = await sbReadJsonOrThrow(
      `${SUPABASE_URL}/rest/v1/menu_featured_groups?menu_id=eq.${menuId}&select=display_order,featured_groups(id,name)&order=display_order.asc`,
      { headers: sbHeaders() }
    );
    if (!menuGroups.length) return [];
    const groupIds = menuGroups.map(menuGroup => menuGroup.featured_groups.id);
    const allSlots = await sbReadJsonOrThrow(
      `${SUPABASE_URL}/rest/v1/featured_slots?featured_group_id=in.(${groupIds.join(',')})&select=*,items(id,name,price,visibility,is_eighty_sixed,desc,recipe,upcharges,show_description,show_recipe)&order=display_order.asc`,
      { headers: sbHeaders() }
    );
    return menuGroups.map(menuGroup => ({
      id: menuGroup.featured_groups.id,
      name: menuGroup.featured_groups.name,
      displayOrder: menuGroup.display_order,
      slots: allSlots
        .filter(slot => slot.featured_group_id === menuGroup.featured_groups.id)
        .map(slot => ({
          id: slot.id,
          itemId: slot.item_id,
          sellNote: slot.sell_note || '',
          displayOrder: slot.display_order,
          confirmedAt: slot.confirmed_at,
          confirmedBy: slot.confirmed_by,
          item: slot.items ? {
            id: slot.items.id,
            name: slot.items.name,
            price: slot.items.price || '',
            visibility: slot.items.visibility || 'public',
            eightySixed: slot.items.is_eighty_sixed,
            desc: slot.items.desc || '',
            recipe: recipeArray(slot.items.recipe),
            upcharges: itemUpchargeArray(slot.items.upcharges),
            showDescription: slot.items.show_description !== false,
            showRecipe: !!slot.items.show_recipe,
          } : null,
        }))
        .filter(slot => slot.item !== null),
    }));
  } catch (_) {
    return [];
  }
}

async function sbReadRestaurantSpecials(restaurantId = RESTAURANT_ID) {
  if (!SUPABASE_URL || !restaurantId) return [];
  try {
    const group = await sbGetRestaurantSpecialGroup(restaurantId);
    if (!group?.id) return sbReadLegacyFeatured(MENU_ID);
    const slotsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/featured_slots?featured_group_id=eq.${group.id}&select=*,items(id,name,price,visibility,is_eighty_sixed,desc,recipe,upcharges,show_description,show_recipe)&order=display_order.asc`,
      { headers: sbHeaders() }
    );
    if (!slotsRes.ok) return [];
    const allSlots = await slotsRes.json();
    return [{
      id: group.id,
      name: group.name,
      displayOrder: 0,
      slots: allSlots
        .map(s => ({
          id: s.id,
          itemId: s.item_id,
          sellNote: s.sell_note || '',
          displayOrder: s.display_order,
          confirmedAt: s.confirmed_at,
          confirmedBy: s.confirmed_by,
          item: s.items ? {
            id: s.items.id,
            name: s.items.name,
            price: s.items.price || '',
            visibility: s.items.visibility || 'public',
            eightySixed: s.items.is_eighty_sixed,
            desc: s.items.desc || '',
            recipe: recipeArray(s.items.recipe),
            upcharges: itemUpchargeArray(s.items.upcharges),
            showDescription: s.items.show_description !== false,
            showRecipe: !!s.items.show_recipe,
          } : null,
        }))
        .filter(s => s.item !== null),
    }];
  } catch(e) { return []; }
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
  const output = document.getElementById('config-json-output');
  const modal = document.getElementById('config-modal-bg');
  if (!output || !modal) return;
  const json = JSON.stringify({ groupme: { botId: BOT_ID } }, null, 2);
  output.value = json;
  modal.classList.add('open');
}
function closeConfigModal() {
  document.getElementById('config-modal-bg')?.classList.remove('open');
}
async function copyConfigJson() {
  const output = document.getElementById('config-json-output');
  if (!output) return;
  await navigator.clipboard.writeText(output.value);
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

async function renderPublicViews() {
  await renderPublicView();
  updateLastUpdatedLabel();
}

function updateManagerToolsContext() {
  const ctx = document.getElementById('categories-menu-context');
  if (ctx) ctx.textContent = _activeMenuName ? `Editing: ${_activeMenuName}` : '';
}

function renderManagerOverviewStats() {
  const activeItems = CATEGORY_DEFS.reduce((total, cat) => (
    total + (menuState[cat.id]?.items || []).filter(item => item.onMenu !== false).length
  ), 0);
  const eightySixed = CATEGORY_DEFS.reduce((total, cat) => (
    total + (menuState[cat.id]?.items || []).filter(item => item.onMenu !== false && item.eightySixed).length
  ), 0);
  const draftCount = getCachedDiff().reduce((count, section) => (
    count + section.added.length + section.removed.length + section.eightySixed.length + section.restored.length
  ), 0);
  const statusValue = document.getElementById('manager-overview-status-value');
  const statusMeta = document.getElementById('manager-overview-status-meta');
  const activeValue = document.getElementById('manager-overview-active-value');
  const activeMeta = document.getElementById('manager-overview-active-meta');
  const eightysixValue = document.getElementById('manager-overview-86-value');
  const eightysixMeta = document.getElementById('manager-overview-86-meta');

  if (statusValue) statusValue.textContent = draftCount > 0 ? 'Drafting' : 'Live';
  if (statusMeta) statusMeta.textContent = draftCount > 0
    ? `${draftCount} unsent change${draftCount === 1 ? '' : 's'}`
    : 'No unsent changes';
  if (activeValue) activeValue.textContent = String(activeItems);
  if (activeMeta) activeMeta.textContent = activeItems === 1 ? 'active item' : 'active items';
  if (eightysixValue) eightysixValue.textContent = String(eightySixed);
  if (eightysixMeta) eightysixMeta.textContent = eightySixed === 1 ? "item 86'd" : "items 86'd";
}

function updateManagerActionBar() {
  const bar = document.getElementById('manager-action-bar');
  if (!bar) return;
  const primaryGroup = document.getElementById('manager-primary-action-group');
  const featuredGroup = document.getElementById('manager-featured-action-group');
  const summary = document.getElementById('manager-action-bar-summary');
  const syncEl = document.getElementById('sync-status');
  const hasFeaturedPrompt = _needsFeaturedConfirmation();
  const hasDraftChanges = !!_dirty;
  const isCompactViewport = window.innerWidth <= 480;

  if (primaryGroup) primaryGroup.hidden = !hasDraftChanges;
  if (featuredGroup) featuredGroup.hidden = !hasFeaturedPrompt;
  bar.hidden = !(hasDraftChanges || hasFeaturedPrompt);
  syncManagerActionBarStatus(syncEl);

  if (summary) {
    if (hasDraftChanges && hasFeaturedPrompt) {
      summary.textContent = isCompactViewport
        ? 'Drafts are ready. Save keeps them private, Send Update publishes, and featured still needs confirmation.'
        : 'Unsent changes ready. Save Draft keeps them private. Send Update publishes to the live menu. Featured items also need confirmation.';
    } else if (hasDraftChanges) {
      summary.textContent = isCompactViewport
        ? 'Drafts are ready. Save keeps them private and Send Update publishes live.'
        : 'Unsent changes ready. Save Draft keeps them private. Send Update publishes to the live menu.';
    } else if (hasFeaturedPrompt) {
      summary.textContent = isCompactViewport
        ? 'Featured still needs confirmation.'
        : "Today's featured lineup needs confirmation.";
    } else {
      summary.textContent = '';
    }
  }
}

function syncManagerActionBarStatus(syncEl = document.getElementById('sync-status')) {
  const statusWrap = syncEl?.closest('.manager-shell-actionbar-status');
  if (!statusWrap) return;
  statusWrap.hidden = !((syncEl.textContent || '').trim());
}

function renderManagerWorkspace(options = {}) {
  renderManagerCategories();
  renderPricingSection();
  renderDescriptionSection();
  renderFeaturedTab();
  renderCategoriesTab();
  updateManagerToolsContext();
  renderDatabaseTab();
  renderPruneSection();
  updateActiveMenuBar();
  renderManagerOverviewStats();
  if (options.includeRecentChanges !== false) renderRecentChanges();
  updateManagerActionBar();
  renderFooter();
  initCollapsingHeader();
  initDrawerSwipe();
}

function renderAdminWorkspace() {
  renderMenusPanel();
  initAdminSwitcherTab('notif');
  loadUsers();
}

function refreshManagerViews() {
  renderManagerWorkspace({ includeRecentChanges: false });
}

function refreshCategoryAdminViews() {
  refreshManagerViews();
  renderPublicView();
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
  if (!isValidRestaurant(targetRestaurantId)) { showToast('Unsupported restaurant selected.', 'error'); return; }

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
  refreshCategoryAdminViews();
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
  const managedCategories = getManagedCategoryDefs();
  managedCategories.forEach((cat, idx) => {
    const card = document.createElement('div');
    card.className = 'catmgr-card';
    card.id = 'catmgr-' + cat.id;
    const isFirst = idx === 0;
    const isLast  = idx === managedCategories.length - 1;
    card.innerHTML = `
      <div class="catmgr-row">
        <div class="catmgr-icon" style="background:${escHtml(cat.color)}">${escHtml(cat.icon)}</div>
        <div class="catmgr-info">
          <div class="catmgr-title">${escHtml(cat.title)}</div>
          <div class="catmgr-sub">${escHtml(cat.sub || '')}</div>
        </div>
        <div class="catmgr-actions">
          <button class="btn-small" onclick="moveCategoryUp('${escHtml(cat.id)}')" ${isFirst ? 'disabled' : ''} title="Move up" aria-label="Move ${escHtml(cat.title)} up">↑</button>
          <button class="btn-small" onclick="moveCategoryDown('${escHtml(cat.id)}')" ${isLast ? 'disabled' : ''} title="Move down" aria-label="Move ${escHtml(cat.title)} down">↓</button>
          <button class="btn-small" onclick="toggleCategoryEdit('${escHtml(cat.id)}')" aria-label="Edit ${escHtml(cat.title)}">✏️</button>
          <button class="btn-small btn-danger" onclick="deleteCategory('${escHtml(cat.id)}')" aria-label="Delete ${escHtml(cat.title)}">×</button>
        </div>
      </div>
      <div class="catmgr-edit" id="catmgr-edit-${escHtml(cat.id)}" style="display:none">
        <div class="catmgr-field-row">
          <label for="ce-icon-${escHtml(cat.id)}">Icon</label>
          <input type="text" class="catmgr-input catmgr-icon-input" id="ce-icon-${escHtml(cat.id)}" name="category-icon-${escHtml(cat.id)}" value="${escHtml(cat.icon)}" maxlength="4" placeholder="Emoji…" autocomplete="off" spellcheck="false"/>
        </div>
        <div class="catmgr-field-row">
          <label for="ce-title-${escHtml(cat.id)}">Title</label>
          <input type="text" class="catmgr-input" id="ce-title-${escHtml(cat.id)}" name="category-title-${escHtml(cat.id)}" value="${escHtml(cat.title)}" placeholder="Category title…" autocomplete="off"/>
        </div>
        <div class="catmgr-field-row">
          <label for="ce-sub-${escHtml(cat.id)}">Subtitle</label>
          <input type="text" class="catmgr-input" id="ce-sub-${escHtml(cat.id)}" name="category-subtitle-${escHtml(cat.id)}" value="${escHtml(cat.sub || '')}" placeholder="Short description…" autocomplete="off"/>
        </div>
        <div class="catmgr-field-row">
          <label for="ce-ph-${escHtml(cat.id)}">Hint text</label>
          <input type="text" class="catmgr-input" id="ce-ph-${escHtml(cat.id)}" name="category-hint-${escHtml(cat.id)}" value="${escHtml(cat.placeholder || '')}" placeholder="Add item input hint…" autocomplete="off"/>
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
  if (isLegacySpecialCategory(catId)) return;
  const el = document.getElementById('catmgr-edit-' + catId);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function saveCategoryEdit(catId) {
  if (isLegacySpecialCategory(catId)) return;
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
  if (isLegacySpecialCategory(catId)) return;
  const idx = CATEGORY_DEFS.findIndex(c => c.id === catId);
  if (idx <= 0) return;
  [CATEGORY_DEFS[idx-1], CATEGORY_DEFS[idx]] = [CATEGORY_DEFS[idx], CATEGORY_DEFS[idx-1]];
  await persistState();
  refreshAllViews();
}

async function moveCategoryDown(catId) {
  if (isLegacySpecialCategory(catId)) return;
  const idx = CATEGORY_DEFS.findIndex(c => c.id === catId);
  if (idx < 0 || idx >= CATEGORY_DEFS.length - 1) return;
  [CATEGORY_DEFS[idx], CATEGORY_DEFS[idx+1]] = [CATEGORY_DEFS[idx+1], CATEGORY_DEFS[idx]];
  await persistState();
  refreshAllViews();
}

async function deleteCategory(catId) {
  if (isLegacySpecialCategory(catId)) return;
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
  const ph  = document.getElementById('new-cat-placeholder')?.value.trim() || `e.g. Add ${title} item…`;
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

function migrateLocalStorage() {
  try {
    if ((localStorage.getItem(LS_KEYS.lsSchemaVersion) || '0') >= '1') return;

    const OLD_CATS = {
      beer: 'Beer', canned: 'Canned', cocktails: 'Cocktails',
      tequila: 'Tequila', frozen: 'Frozen', special: 'Special'
    };
    const oldRaw = localStorage.getItem('menuItems') || localStorage.getItem('menuData');
    const hasFirebaseAuth = Object.keys(localStorage).some(k => k.startsWith('firebase:'));
    const oldBotId = localStorage.getItem('bot_id') || localStorage.getItem('groupme_config');

    if (!oldRaw && !hasFirebaseAuth && !oldBotId) {
      localStorage.setItem(LS_KEYS.lsSchemaVersion, '1');
      return;
    }

    if (oldRaw) {
      const oldData = JSON.parse(oldRaw);
      const cats = Object.entries(OLD_CATS).map(([key, label]) => ({
        id: crypto.randomUUID(), key, label,
        items: (Array.isArray(oldData[key]) ? oldData[key] : []).map(it => ({
          name: it.name || '', desc: it.desc || '', recipe: it.recipe || '',
          price: it.price || '', is86: !!it.is86
        }))
      }));
      const meta = { lastUpdated: localStorage.getItem('lastUpdated') || '' };
      if (oldBotId) meta.botId = oldBotId;
      localStorage.setItem(LS_KEYS.menuCache, JSON.stringify({ cats, meta }));
    }

    // Clean up old keys
    ['menuItems', 'menuData', 'bot_id', 'groupme_config', 'lastUpdated'].forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).filter(k => k.startsWith('firebase:')).forEach(k => localStorage.removeItem(k));
    localStorage.setItem(LS_KEYS.lsSchemaVersion, '1');
  } catch (_) {
    localStorage.clear();
    localStorage.setItem(LS_KEYS.lsSchemaVersion, '1');
  }
}

async function init() {
  _appPageMode = getAppPageModeFromPath();
  const detectedSiteRestaurant = getSiteRestaurantFromPath();
  _siteRestaurant = isValidRestaurant(detectedSiteRestaurant?.id) ? detectedSiteRestaurant : null;
  const isDedicatedRoute = isDedicatedRestaurantPage();
  const isSettingsRoute = isSettingsPage();
  if (_appPageMode === 'picker') {
    showPickerPage();
    return;
  }
  showAppShell();
  migrateLocalStorage();
  if (MENU_ID && !KNOWN_MENU_ORDER.includes(MENU_ID)) _clearActiveMenuContext({ clearCache: true });
  document.getElementById('loading-view').style.display = (isDedicatedRoute || isSettingsRoute) ? 'none' : 'block';
  document.getElementById('public-view').style.display = isDedicatedRoute ? 'block' : 'none';

  if (_siteRestaurant && !new URLSearchParams(location.search).get('menu')) {
    primeSiteRestaurantMenu(_siteRestaurant);
  }

  if (_siteRestaurant) {
    showRouteBootView();
  }

  loadLocalConfig();
  await loadSupabaseConfig();

  if (isSettingsRoute) {
    const handledRecovery = await _tryHandleRecoveryCallback();
    if (!handledRecovery) await _tryRestoreSession();
    await _syncRequestedPageMode();
    const redirectNotice = consumeRedirectNotice();
    if (redirectNotice) showToast(redirectNotice, 'error');
    return;
  }

  if (SUPABASE_URL) await sbResolveMenu();

  if (!SUPABASE_URL || !MENU_ID) {
    // Offline or unconfigured — serve from localStorage cache if available
    const cached = readCachedMenuState(_siteRestaurant?.id || RESTAURANT_ID || '');
    if (cached) {
      try { hydrateState(cached); } catch(e) { menuState = defaultState(); }
    } else {
      menuState = defaultState();
    }
    applyDesign(currentDesign);
    await showPublicView();
  } else {
    try {
      await loadActiveMenuState();
      applyDesign(currentDesign);
      await showPublicView();
    } catch(e) {
      // Fallback to localStorage cache
      const cached = readCachedMenuState(_siteRestaurant?.id || RESTAURANT_ID || '');
      if (cached) {
        try { hydrateState(cached); } catch(e2) { menuState = defaultState(); }
      } else {
        menuState = defaultState();
      }
      applyDesign(currentDesign);
      await showPublicViewWithError('⚠️ Could not load menu data. Check your connection.');
    }
  }

  // Restore Supabase session — recovery callback takes priority over stored tokens
  const handledRecovery = await _tryHandleRecoveryCallback();
  if (!handledRecovery) await _tryRestoreSession();
  await _syncRequestedPageMode();
  const redirectNotice = consumeRedirectNotice();
  if (redirectNotice) showToast(redirectNotice, 'error');
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
    await _syncRequestedPageMode();
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

async function showPublicView() {
  document.getElementById('loading-view').style.display = 'none';
  const switchBtn = document.getElementById('public-switch-menu-btn');
  if (switchBtn) switchBtn.style.display = _hasMultipleMenus ? '' : 'none';
  if (!isDedicatedRestaurantPage()) _togglePublicShellMode('default');
  document.getElementById('public-view').style.display = 'block';
  updateLastUpdatedLabel();
  await renderPublicView();
  startPolling();
}

async function showPublicViewWithError(msg) {
  document.getElementById('loading-view').style.display = 'none';
  document.getElementById('public-view').style.display = 'block';
  if (showRouteLoadError(msg)) return;
  _togglePublicShellMode('default');
  const el = document.getElementById('public-error');
  el.textContent = msg;
  el.classList.add('visible');
  await renderPublicView();
}

function showRouteBootView() {
  if (!isDedicatedRestaurantPage()) return;
  const publicView = document.getElementById('public-view');
  const loadingView = document.getElementById('loading-view');
  if (loadingView) loadingView.style.display = 'none';
  if (publicView) publicView.style.display = 'block';
  if (typeof window.renderRouteBootShell === 'function') {
    const didRender = window.renderRouteBootShell();
    if (didRender !== false) {
      _togglePublicShellMode('site');
      return;
    }
  }
  _togglePublicShellMode('site');
}

function showRouteLoadError(message) {
  if (!isDedicatedRestaurantPage()) return false;
  showRouteBootView();
  const siteWrapper = document.getElementById('restaurant-site-wrapper');
  if (!siteWrapper) return false;
  siteWrapper.querySelector('.route-load-error')?.remove();
  const banner = document.createElement('div');
  banner.className = 'error-banner visible route-load-error';
  banner.setAttribute('role', 'alert');
  banner.textContent = message;
  siteWrapper.prepend(banner);
  return true;
}

function _setSettingsShellPending(isPending) {
  if (!isSettingsPage()) return;
  document.body.classList.toggle('settings-shell-pending', !!isPending);
}

function _setLoadingMessage(message, opts = {}) {
  const loadingView = document.getElementById('loading-view');
  if (!loadingView) return;
  _setSettingsShellPending(false);
  const spinner = loadingView.querySelector('.spinner');
  const textEl = loadingView.querySelector('p');
  loadingView.style.display = 'block';
  if (spinner) spinner.style.display = opts.hideSpinner ? 'none' : '';
  if (textEl) textEl.textContent = message;
}

function getAccessibleManagerMenuIds() {
  if (currentUser?.role === 'admin') return [...KNOWN_MENU_ORDER];
  return normalizeAccessibleMenuIds(currentUser?.accessibleMenuIds);
}

async function _loadSettingsPageMenuContext(menuId) {
  if (!KNOWN_MENU_ORDER.includes(menuId)) return false;
  const fallbackMenu = knownMenuList().find(menu => menu.id === menuId) || null;
  MENU_ID = menuId;
  lsSet(LS_KEYS.menuId, MENU_ID);
  if (fallbackMenu) {
    if (setActiveMenuContext(fallbackMenu.name, fallbackMenu.type, fallbackMenu.restaurantId) === false) return false;
    const url = new URL(location.href);
    url.searchParams.set('menu', fallbackMenu.slug);
    history.replaceState({}, '', url.toString());
  }
  await sbResolveMenu();
  if (!MENU_ID) return false;
  await loadActiveMenuState();
  applyDesign(currentDesign);
  return true;
}

function _clearSettingsRedirectPrompt() {
  if (_settingsRedirectTimer) {
    clearTimeout(_settingsRedirectTimer);
    _settingsRedirectTimer = null;
  }
  if (typeof _settingsRedirectCleanup === 'function') {
    _settingsRedirectCleanup();
    _settingsRedirectCleanup = null;
  }
}

function _showSettingsRedirectMessage(message, opts = {}) {
  const targetPath = opts.targetPath || '/';
  const redirectLabel = opts.redirectLabel || 'the menu selector';
  const actionLabel = opts.actionLabel || 'Return to the restaurant selector';
  _clearSettingsRedirectPrompt();
  isManagerMode = false;
  isAdminMode = false;
  document.body.classList.remove('manager-mode');
  renderUserHeader();

  const publicView = document.getElementById('public-view');
  const managerView = document.getElementById('manager-view');
  if (publicView) publicView.style.display = 'none';
  if (managerView) managerView.style.display = 'none';

  closeMenuPicker({ skipOnClose: true });
  _setLoadingMessage(`${message} Redirecting to ${redirectLabel}…`, { hideSpinner: true });

  const loadingView = document.getElementById('loading-view');
  const redirectNow = () => {
    _clearSettingsRedirectPrompt();
    navigateToPage(targetPath);
  };

  if (loadingView) {
    const onClick = () => redirectNow();
    const onKeyDown = e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      redirectNow();
    };
    loadingView.classList.add('loading-view-actionable');
    loadingView.tabIndex = 0;
    loadingView.setAttribute('role', 'button');
    loadingView.setAttribute('aria-label', actionLabel);
    loadingView.addEventListener('click', onClick);
    loadingView.addEventListener('keydown', onKeyDown);
    _settingsRedirectCleanup = () => {
      loadingView.classList.remove('loading-view-actionable');
      loadingView.removeAttribute('tabindex');
      loadingView.removeAttribute('role');
      loadingView.removeAttribute('aria-label');
      loadingView.removeEventListener('click', onClick);
      loadingView.removeEventListener('keydown', onKeyDown);
    };
  }

  _settingsRedirectTimer = setTimeout(redirectNow, 3000);
}

function showAdminAccessDenied(message = 'Admin access required for this page.') {
  _showSettingsRedirectMessage(message);
}

function showManagerAccessDenied(message = 'Manager access required for this page.', opts = {}) {
  _showSettingsRedirectMessage(message, opts);
}

async function _syncRequestedPageMode() {
  if (!isSettingsPage()) return;

  const publicView = document.getElementById('public-view');
  const managerView = document.getElementById('manager-view');
  if (!publicView || !managerView) return;

  _clearSettingsRedirectPrompt();
  renderUserHeader();

  if (!currentUser) {
    isManagerMode = false;
    isAdminMode = false;
    document.body.classList.remove('manager-mode');
    publicView.style.display = 'none';
    managerView.style.display = 'none';
    _setLoadingMessage('Sign in to access settings.', { hideSpinner: true });
    openAuthOverlay('signin');
    return;
  }

  const isAdmin = currentUser.role === 'admin';
  if (_appPageMode === 'admin') {
    if (!isAdmin) {
      showAdminAccessDenied();
      return;
    }

    _setLoadingMessage('Loading settings…');
    const targetMenuId = KNOWN_MENU_ORDER.includes(MENU_ID) ? MENU_ID : (KNOWN_MENU_ORDER[0] || '');
    const hasMenuContext = await _loadSettingsPageMenuContext(targetMenuId);
    if (!hasMenuContext) {
      showAdminAccessDenied('No menu context available for this page.');
      return;
    }
    enterAdmin();
    return;
  }

  _setLoadingMessage('Checking manager access…');
  await refreshCurrentUserProfile();

  const requestedMenu = getRequestedMenuForSettingsPage();
  if (!requestedMenu) {
    showManagerAccessDenied('No menu context available for this page.');
    return;
  }

  if (!currentUserCanManageMenu(requestedMenu.id)) {
    const fallbackMenuId = getFirstAccessibleManagerMenuId();
    if (fallbackMenuId) {
      const targetPath = getManagerHrefForMenuId(fallbackMenuId);
      if (targetPath) {
        navigateToPage(targetPath);
        return;
      }
    }
    showManagerAccessDenied('You don\'t have manager access to this menu.', {
      targetPath: getPublicHrefForMenuId(requestedMenu.id),
      redirectLabel: 'the public menu',
      actionLabel: 'Return to the public menu',
    });
    return;
  }

  _managerMenuPicked = true;
  _setLoadingMessage('Loading settings…');
  const hasMenuContext = await _loadSettingsPageMenuContext(requestedMenu.id);
  if (!hasMenuContext) {
    showManagerAccessDenied('Selected menu is no longer available for this account.', {
      targetPath: getPublicHrefForMenuId(requestedMenu.id),
      redirectLabel: 'the public menu',
      actionLabel: 'Return to the public menu',
    });
    return;
  }
  enterManager();
}

// ─── AUTO-REFRESH POLLING ────────────────────────────────────────────────────
function startPolling() {
  stopPolling();
  if (!SUPABASE_URL || !MENU_ID) return;

  const pollCycle = async () => {
    if (isManagerMode) return;
    try {
      const oldTs = menuState._meta?.lastUpdatedTs;
      const oldCats = getCategoryStateSnapshot();
      const oldDesign = getDesignSnapshot();
      const oldFeatured = getFeaturedSnapshot();
      const data = await sbRead();
      if (!data) return;
      hydrateState(data);
      lsSet(LS_KEYS.menuCache, JSON.stringify(data));
      const newTs = menuState._meta?.lastUpdatedTs;
      if (newTs !== oldTs) await refreshFeaturedForActiveMenu();

      const afterCats = getCategoryStateSnapshot();
      const newDesign = getDesignSnapshot();
      const newFeatured = getFeaturedSnapshot();

      if (afterCats !== oldCats || newTs !== oldTs || newFeatured !== oldFeatured) {
        await renderPublicViews();
      }
      if (newDesign !== oldDesign) applyDesign(currentDesign);

      _pollFailCount = 0;
      const syncEl = document.getElementById('sync-status');
      if (syncEl?.classList.contains('sync-poll-error')) {
        syncEl.textContent = '';
        syncEl.className = '';
      }
      syncManagerActionBarStatus(syncEl);
    } catch(e) {
      _pollFailCount++;
      if (_pollFailCount >= 3) {
        const syncEl = document.getElementById('sync-status');
        if (syncEl) {
          syncEl.textContent = '⚠️ Sync paused — reconnecting…';
          syncEl.className = 'sync-poll-error';
        }
        syncManagerActionBarStatus(syncEl);
      }
    }
  };

  // Start the 10-second polling interval (only while tab is visible)
  const startInterval = () => { syncInterval = setInterval(pollCycle, 10000); };

  if (document.visibilityState === 'visible') startInterval();

  _visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      // Tab became visible — poll immediately and restart the interval
      pollCycle();
      if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
      startInterval();
    } else {
      // Tab hidden — stop polling to save bandwidth
      if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    }
  };
  document.addEventListener('visibilitychange', _visibilityHandler);
}

function stopPolling() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
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
  const ts = getLastUpdatedTs();
  const versionHtml = APP_VERSION +
    (IS_PREVIEW ? ' <span class="footer-preview-badge">PREVIEW</span>' : '');
  const displayName = formatMenuDisplayName(_activeMenuName, MENU_TYPE, RESTAURANT_ID);
  const publicVersionEl = document.getElementById('footer-version');
  const publicUpdatedEl = document.getElementById('footer-last-updated');
  const managerVersionEl = document.getElementById('manager-footer-version');
  const managerUpdatedEl = document.getElementById('manager-footer-last-updated');
  const managerMenuEl = document.getElementById('manager-footer-menu-name');

  [publicVersionEl, managerVersionEl].forEach(el => {
    if (el) el.innerHTML = versionHtml;
  });
  if (managerMenuEl) managerMenuEl.textContent = displayName || 'No menu selected';

  [publicUpdatedEl, managerUpdatedEl].forEach(el => {
    if (!el) return;
    if (ts) {
      el.textContent = `Updated ${formatRelativeTime(ts)}`;
      el.title = formatUpdatedAt(ts, 'Updated ');
    } else {
      el.textContent = el === managerUpdatedEl ? 'Updated —' : '';
      el.title = '';
    }
  });
}

function renderFeaturedPublicSection() {
  const featuredEl = document.getElementById('featured-public-section');
  if (!featuredEl) return;
  const hasSlots = _featuredGroups.some(g => g.slots.length > 0);
  if (!hasSlots) {
    featuredEl.style.display = 'none';
    featuredEl.innerHTML = '';
    return;
  }
  featuredEl.style.display = '';
  featuredEl.innerHTML = _featuredGroups
    .filter(g => g.slots.length)
    .map(group => {
      const slotsHtml = group.slots.map(slot => {
        const is86 = slot.item?.eightySixed;
        const showDescription = isItemDescriptionPublic(slot.item);
        const showRecipe = isItemRecipePublic(slot.item);
        const description = showDescription ? String(slot.item?.desc || '').trim() : '';
        const recipeText = showRecipe ? recipeArray(slot.item?.recipe).join(', ') : '';
        const upcharges = itemUpchargeArray(slot.item?.upcharges);
        const classes = ['featured-slot', is86 ? 'is-eighty-sixed' : ''].filter(Boolean).join(' ');
        const priceHtml = slot.item?.price ? `<span class="featured-price">${escHtml(slot.item.price)}</span>` : '';
        const descriptionHtml = description ? `<div class="featured-slot-desc">${escHtml(description)}</div>` : '';
        const recipeHtml = recipeText ? `<div class="featured-slot-desc featured-slot-desc--secondary">Recipe: ${escHtml(recipeText)}</div>` : '';
        const upchargesHtml = upcharges.length
          ? `<div class="featured-upcharges-row">${upcharges.map(upcharge => `<span class="featured-upcharge-chip">${escHtml(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${escHtml(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
          : '';
        const sellNoteHtml = (currentUser && slot.sellNote)
          ? `<div class="featured-sell-note">${escHtml(slot.sellNote)}</div>`
          : '';
        return `<div class="${classes}">
          <div class="featured-slot-main">
            <span class="featured-slot-name">${escHtml(slot.item?.name || '')}</span>
            ${priceHtml}
            ${is86 ? '<span class="eighty-sixed-tag">86\'D</span>' : ''}
          </div>
          ${descriptionHtml}
          ${recipeHtml}
          ${upchargesHtml}
          ${sellNoteHtml}
        </div>`;
      }).join('');
      return `<div class="featured-group">
        <div class="featured-group-name">${escHtml(group.name)}</div>
        ${slotsHtml}
      </div>`;
    }).join('');
}

function buildPublicItemHtml(item) {
  const is86 = !!item.eightySixed;
  const showDescription = isItemDescriptionPublic(item);
  const showRecipe = isItemRecipePublic(item);
  const hasDesc = showDescription && !!(item.desc && item.desc.trim());
  const recipeIngredients = recipeArray(item.recipe);
  const hasRecipe = showRecipe && recipeIngredients.length > 0;
  const upcharges = itemUpchargeArray(item.upcharges);
  const hasDetail = hasDesc || hasRecipe;
  const upchargesHtml = upcharges.length
    ? `<div class="item-upcharges-row">${upcharges.map(upcharge => `<span class="item-upcharge-chip">${escHtml(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${escHtml(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
    : '';
  const classes = ['menu-item', is86 ? 'is-eighty-sixed' : '', hasDetail ? 'has-detail' : ''].filter(Boolean).join(' ');
  const onClick = hasDetail ? `onclick="togglePublicDesc(this)"` : '';
  const detailHtml = hasDetail ? `<div class="item-detail-panel">
      ${hasDesc && hasRecipe
        ? `<div class="detail-section"><div class="detail-label">Description</div><div class="item-desc-text">${escHtml(item.desc)}</div></div><div class="detail-section detail-section--bordered"><div class="detail-label">Recipe</div><div class="item-desc-text">${escHtml(recipeIngredients.join(', '))}</div></div>`
        : hasDesc
          ? `<div class="detail-section"><div class="item-desc-text">${escHtml(item.desc)}</div></div>`
          : `<div class="detail-section"><div class="item-desc-text">${escHtml(recipeIngredients.join(', '))}</div></div>`}
    </div>` : '';
  const priceHtml = item.price
    ? (isFood
        ? `<span class="item-price-tag">${escHtml(item.price)}</span>`
        : `<span class="item-price-badge">${escHtml(item.price)}</span>`)
    : '';
  return `<div class="${classes}" ${onClick}>
    <div class="item-main-row">
      <div class="dot" aria-hidden="true"></div>
      <span class="item-name-text">${escHtml(item.name)}${isFood ? '' : priceHtml}</span>
      ${is86 ? `<span class="eighty-sixed-tag">86'D</span>` : ''}
      ${hasDetail ? `<span class="item-expand-icon" role="button" tabindex="0" aria-label="Show description" aria-expanded="false" onclick="event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))}">›</span>` : ''}
    </div>
    ${isFood && priceHtml ? `<div class="item-price-row">${priceHtml}</div>` : ''}
    ${upchargesHtml}
    ${detailHtml}
  </div>`;
}

function buildPublicCategorySection(cat, state, lastSentCats) {
  const section = document.createElement('div');
  section.id = 'pub-section-' + cat.id;
  const isCollapsed = lastSentCats ? !lastSentCats.includes(cat.id) : false;
  section.className = 'menu-section' + (isCollapsed ? ' collapsed' : '');
  const onMenuItems = state.items.filter(i => i.onMenu !== false && i.visibility !== 'off_menu');
  if (!onMenuItems.length && state.items.every(i => i.onMenu === false || i.visibility === 'off_menu')) return null;
  const itemsHtml = onMenuItems.length
    ? onMenuItems.map(buildPublicItemHtml).join('')
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
  return section;
}

// ─── PUBLIC VIEW ──────────────────────────────────────────────────────────────
async function renderPublicView() {
  await _renderCustomDesignView();
}

function _renderDefaultPublicView() {
  const container = document.getElementById('public-categories');
  container.innerHTML = '';
  renderFeaturedPublicSection();
  const lastSentCats = menuState._meta && menuState._meta.lastSentCategories;
  getManagedCategoryDefs().forEach(cat => {
    const state = menuState[cat.id] || { items: [], lastSent: [] };
    const section = buildPublicCategorySection(cat, state, lastSentCats);
    if (section) container.appendChild(section);
  });
  updateCollapseAllBtn();
}

async function _renderCustomDesignView() {
  const fallbackContainer = document.getElementById('public-categories');
  const siteWrapper = document.getElementById('restaurant-site-wrapper');
  const renderIntoSiteWrapper = isDedicatedRestaurantPage() && !!siteWrapper;
  const container = renderIntoSiteWrapper ? siteWrapper : fallbackContainer;
  const restaurantSpecials = _featuredGroups.length > 1
    ? {
        id: '__restaurant_specials__',
        name: getRestaurantSpecialLabel(RESTAURANT_ID),
        slots: _featuredGroups.flatMap(group => group.slots || []),
      }
    : (_featuredGroups[0] || null);
  if (!_restaurantCustomDesignEnabled || !container) {
    _togglePublicShellMode('default');
    _renderDefaultPublicView();
    return;
  }

  document.getElementById('custom-design-style')?.remove();

  if (renderIntoSiteWrapper && typeof window.initializeRoute === 'function') {
    const didRender = window.initializeRoute(menuState, {
      activeMenuName: _activeMenuName,
      appVersion: APP_VERSION,
      canEditRestaurantSpecials: currentUserCanEditRestaurantSpecials(RESTAURANT_ID, currentUser),
      categoryDefs: getManagedCategoryDefs(),
      currentUser,
      featuredGroups: _featuredGroups,
      isPreview: IS_PREVIEW,
      knownMenus: knownMenuList(),
      lastUpdatedTs: getLastUpdatedTs(),
      menuId: MENU_ID,
      menuType: MENU_TYPE,
      restaurantSpecials,
      restaurantId: RESTAURANT_ID,
      siteRestaurant: _siteRestaurant,
    });
    if (didRender !== false) {
      _togglePublicShellMode('site');
      return;
    }
  }

  _togglePublicShellMode('default');
  _renderDefaultPublicView();
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
  return { role: role || 'none', name: name || '', accessibleMenuIds: normalizeAccessibleMenuIds(accessibleMenuIds) };
}

function updateCurrentUserProfile(profile = {}) {
  if (!currentUser) return profile;
  currentUser.name = profile.name || '';
  currentUser.role = profile.role || 'none';
  currentUser.accessibleMenuIds = normalizeAccessibleMenuIds(profile.accessibleMenuIds);
  applyRole(currentUser.role);
  return profile;
}

async function refreshCurrentUserProfile() {
  if (!currentUser?.accessToken) return { role: 'none', name: '', accessibleMenuIds: [] };
  try {
    const profile = await sbGetProfile(currentUser.accessToken);
    return updateCurrentUserProfile(profile);
  } catch (_) {
    return updateCurrentUserProfile({ role: 'none', name: currentUser?.name || '', accessibleMenuIds: [] });
  }
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

function _setDisplayById(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

function _setDisplayBySelector(selector, display) {
  document.querySelectorAll(selector).forEach(el => {
    el.style.display = display;
  });
}

function _setDisplayBySelectorFiltered(selector, display, predicate) {
  document.querySelectorAll(selector).forEach(el => {
    if (typeof predicate === 'function' && !predicate(el)) return;
    el.style.display = display;
  });
}

function renderUserHeader() {
  const signedIn  = !!currentUser;
  const role      = currentUser?.role || 'none';
  const isAdmin   = role === 'admin';
  const isSettingsRoute = isSettingsPage();
  const name      = currentUser?.name || '';
  const parts     = name.trim().split(/\s+/).filter(Boolean);
  const initials  = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.[0] || '?').toUpperCase();
  const roleLabel = { none: 'User', manager: 'Manager', admin: 'Admin' }[role] || 'User';

  const canManageCurrentMenu = currentUserCanManageMenu();

  _setDisplayById('signin-btn', signedIn ? 'none' : '');
  _setDisplayById('user-chip', signedIn ? '' : 'none');
  _setDisplayBySelectorFiltered('[data-route-signin]', signedIn ? 'none' : '', el => !el.hasAttribute('data-route-signin-persistent'));
  _setDisplayBySelector('[data-route-signin-persistent]', '');
  _setDisplayBySelector('[data-route-user-chip]', signedIn ? '' : 'none');

  const actionBtn = document.getElementById('action-btn');
  const adminBtn  = document.getElementById('admin-btn');
  const adminDrawerBtn = document.getElementById('admin-btn-drawer');

  if (actionBtn) {
    actionBtn.style.display = (signedIn && canManageCurrentMenu) ? '' : 'none';
    actionBtn.textContent   = (isManagerMode && !isSettingsRoute) ? '✕ Exit' : '⚙ Manager';
    actionBtn.classList.toggle('active', isManagerMode);
  }
  if (adminBtn) {
    adminBtn.style.display = (signedIn && isAdmin) ? '' : 'none';
    adminBtn.classList.toggle('active', isAdminMode);
  }
  if (adminDrawerBtn) {
    adminDrawerBtn.style.display = (signedIn && isAdmin) ? '' : 'none';
    adminDrawerBtn.classList.toggle('active', isAdminMode);
  }

  _setDisplayBySelector('[data-route-manager]', (signedIn && canManageCurrentMenu) ? '' : 'none');
  _setDisplayBySelector('[data-route-admin]', (signedIn && isAdmin) ? '' : 'none');
  document.querySelectorAll('[data-route-manager]').forEach(el => {
    el.textContent = isManagerMode ? 'Exit' : 'Manager';
    el.classList.toggle('active', isManagerMode);
  });
  document.querySelectorAll('[data-route-admin]').forEach(el => {
    el.classList.toggle('active', isAdminMode);
  });

  if (signedIn) {
    const fullName = name || currentUser?.email || '';
    const standardInitials = document.getElementById('user-initials');
    const standardName = document.getElementById('user-dropdown-name');
    const standardRole = document.getElementById('user-dropdown-role');
    const routeInitials = document.getElementById('ll-user-initials');
    const routeName = document.getElementById('ll-user-dropdown-name');
    const routeRole = document.getElementById('ll-user-dropdown-role');
    const cantinaName = document.getElementById('erc-user-dropdown-name');
    const cantinaRole = document.getElementById('erc-user-dropdown-role');
    if (standardInitials) standardInitials.textContent = initials;
    if (standardName) standardName.textContent = fullName;
    if (standardRole) standardRole.textContent = roleLabel;
    if (routeInitials) routeInitials.textContent = initials;
    if (routeName) routeName.textContent = fullName;
    if (routeRole) routeRole.textContent = roleLabel;
    if (cantinaName) cantinaName.textContent = fullName;
    if (cantinaRole) cantinaRole.textContent = roleLabel;
  }

  const publicView = document.getElementById('public-view');
  if (isDedicatedRestaurantPage() && !isManagerMode && !isAdminMode && publicView?.style.display !== 'none') {
    renderPublicView();
  }
}

function applyRole(role) {
  const isAdmin = role === 'admin';
  const pruneSection = document.getElementById('prune-section');
  if (pruneSection) pruneSection.style.display = isAdmin ? '' : 'none';
  renderUserHeader();
}

function setActiveSettingsSection(sectionId) {
  document.querySelectorAll('.settings-rail-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === sectionId);
  });
}

function setSettingsDrawerOpen(isOpen) {
  const drawer = document.getElementById('manager-settings-rail');
  const backdrop = document.getElementById('settings-drawer-backdrop');
  const toggle = document.getElementById('settings-drawer-toggle');
  const isMobileDrawer = window.innerWidth <= 920;
  if (!drawer || !backdrop) return;
  drawer.classList.toggle('is-open', !!isOpen && isMobileDrawer);
  drawer.setAttribute('aria-hidden', isMobileDrawer && !isOpen ? 'true' : 'false');
  backdrop.hidden = !(isOpen && isMobileDrawer);
  document.body.classList.toggle('settings-drawer-open', !!isOpen && isMobileDrawer);
  if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen && isMobileDrawer) {
    requestAnimationFrame(() => {
      drawer.querySelector('.manager-shell-rail-close, .settings-rail-btn.active, .settings-rail-btn')?.focus();
    });
  } else if (!isOpen && isMobileDrawer && toggle) {
    toggle.focus();
  }
}

function toggleSettingsDrawer() {
  const drawer = document.getElementById('manager-settings-rail');
  if (!drawer) return;
  setSettingsDrawerOpen(!drawer.classList.contains('is-open'));
}

function closeSettingsDrawer() {
  setSettingsDrawerOpen(false);
}

function _getSettingsSectionHashId() {
  const hash = window.location.hash.replace(/^#/, '').trim();
  if (!hash || hash.includes('=')) return '';
  return document.getElementById(hash) ? hash : '';
}

function _syncSettingsSectionFromLocation(defaultSectionId) {
  const targetSectionId = defaultSectionId;
  if (!targetSectionId) return;
  const hash = _getSettingsSectionHashId();
  if (hash && isSettingsPage()) {
    const url = new URL(window.location.href);
    url.hash = '';
    history.replaceState({}, '', url.toString());
  }
  requestAnimationFrame(() => {
    focusSettingsSection(targetSectionId, null, { behavior: 'auto', scroll: false, updateUrl: false });
  });
}

function focusSettingsSection(sectionId, trigger, options = {}) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const behavior = options.behavior || 'smooth';
  const shouldScroll = options.scroll !== false;
  // Track active manager section and re-render if stale
  if (MANAGER_EDIT_SECTION_IDS.includes(sectionId)) {
    _activeManagerSection = sectionId;
    setManagerEditSectionVisibility(sectionId);
    if (_staleSections.has(sectionId)) {
      if (sectionId === 'manager-items-section') renderManagerCategories();
      else if (sectionId === 'manager-pricing-section') renderPricingSection();
      else if (sectionId === 'manager-description-section') renderDescriptionSection();
      _staleSections.delete(sectionId);
    }
  }
  if (trigger) setActiveSettingsSection(trigger.dataset.target || sectionId);
  else setActiveSettingsSection(sectionId);
  closeSettingsDrawer();
  if (shouldScroll) section.scrollIntoView({ behavior, block: 'start' });
}

// ─── AUTH OVERLAY ─────────────────────────────────────────────────────────────
function onActionBtnClick() {
  const targetPath = getManagerHrefForMenuId(MENU_ID);
  if (!MENU_ID || targetPath === SHARED_PAGE_PATHS.manager) {
    showToast('Select a menu from the public view first.', 'info');
    return;
  }
  if (_appPageMode !== 'manager' || `${window.location.pathname}${window.location.search}` !== targetPath) {
    navigateToPage(targetPath);
  }
}

function onAdminBtnClick() {
  if (_appPageMode !== 'admin') {
    navigateToPage(SHARED_PAGE_PATHS.admin);
  }
}

function enterAdmin() {
  const settingsView = document.getElementById('manager-view');
  const adminPanel = document.getElementById('admin-panel');
  if (!settingsView || !adminPanel) {
    navigateToPage(SHARED_PAGE_PATHS.admin);
    return;
  }
  document.getElementById('custom-design-style')?.remove();
  _setSettingsShellPending(false);
  _togglePublicShellMode('default');
  if (isManagerMode) { isManagerMode = false; document.body.classList.remove('manager-mode'); }
  isAdminMode = true;
  _clearSettingsRedirectPrompt();
  stopPolling();
  _setDisplayById('public-view', 'none');
  _setDisplayById('loading-view', 'none');
  closeMenuPicker({ skipOnClose: true });
  closeSettingsDrawer();
  settingsView.style.display = 'block';
  adminPanel.style.display = 'block';
  renderUserHeader();
  renderAdminWorkspace();
  _syncSettingsSectionFromLocation('admin-restaurants-section');
}

function exitAdmin() {
  isAdminMode = false;
  document.body.classList.remove('manager-mode');
  _setDisplayById('manager-view', 'none');
  _setRestaurantPublicMode(false);
  closeSettingsDrawer();
  renderUserHeader();
  if (isSettingsPage()) {
    navigateToPage(getPublicHrefForCurrentMenu());
    return;
  }
  showPublicView();
}

function exitView() {
  if (isManagerMode) exitManager();
  else if (isAdminMode) exitAdmin();
}

function toggleUserDropdown(chipId = 'user-chip') {
  const chip = document.getElementById(chipId);
  if (!chip) return;
  closeRouteDropdowns();
  closeUserChips(chipId);
  const isOpen = chip.classList.toggle('open');
  chip.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) {
    const firstFocusable = chip.querySelector('button, a');
    if (firstFocusable) firstFocusable.focus();
  }
}

function closeUserChips(exceptChipId = '', target = null) {
  document.querySelectorAll('.user-chip, .ll-site-userchip, .erc-userchip, [data-route-user-chip]').forEach(chip => {
    if (exceptChipId && chip.id === exceptChipId) return;
    if (target && chip.contains(target)) return;
    chip.classList.remove('open');
    chip.setAttribute('aria-expanded', 'false');
  });
}

function closeRouteDropdowns(exceptDropdownId = '') {
  document.querySelectorAll('[data-route-dropdown]').forEach(wrapper => {
    const trigger = wrapper.querySelector('[data-route-dropdown-trigger], [aria-controls]');
    const panel = wrapper.querySelector('[data-route-dropdown-panel]');
    if (!trigger || !panel) return;
    if (exceptDropdownId && panel.id === exceptDropdownId) return;
    wrapper.classList.remove('open');
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });
}

function toggleRouteDropdown(triggerId, dropdownId) {
  const trigger = document.getElementById(triggerId);
  const dropdown = document.getElementById(dropdownId);
  if (!trigger || !dropdown) return;
  const wrapper = trigger.closest('[data-route-dropdown]');
  const shouldOpen = dropdown.hidden;
  closeUserChips();
  closeRouteDropdowns(shouldOpen ? dropdownId : '');
  if (!wrapper) return;
  wrapper.classList.toggle('open', shouldOpen);
  dropdown.hidden = !shouldOpen;
  trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    const firstFocusable = dropdown.querySelector('button, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  closeUserChips('', e.target);
  document.querySelectorAll('[data-route-dropdown]').forEach(wrapper => {
    if (!wrapper.contains(e.target)) {
      wrapper.classList.remove('open');
      const trigger = wrapper.querySelector('[data-route-dropdown-trigger], [aria-controls]');
      const panel = wrapper.querySelector('[data-route-dropdown-panel]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (panel) panel.hidden = true;
    }
  });
});

// Close dropdown on Escape
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  const drawer = document.getElementById('manager-settings-rail');
  if (drawer?.classList.contains('is-open') || document.body.classList.contains('settings-drawer-open')) {
    closeSettingsDrawer();
  }
  document.querySelectorAll('.user-chip, .ll-site-userchip, .erc-userchip, [data-route-user-chip]').forEach(chip => {
    if (chip.classList.contains('open')) {
      chip.classList.remove('open');
      chip.setAttribute('aria-expanded', 'false');
      chip.focus();
    }
  });
  document.querySelectorAll('[data-route-dropdown].open').forEach(wrapper => {
    wrapper.classList.remove('open');
    const trigger = wrapper.querySelector('[data-route-dropdown-trigger], [aria-controls]');
    const panel = wrapper.querySelector('[data-route-dropdown-panel]');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
    if (panel) panel.hidden = true;
  });
});

window.addEventListener('hashchange', () => {
  if (!isSettingsPage()) return;
  const sectionId = _getSettingsSectionHashId();
  if (!sectionId) return;
  const url = new URL(window.location.href);
  url.hash = '';
  history.replaceState({}, '', url.toString());
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
  if (!box) return;
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

function _setMenuPickerContent(opts = {}) {
  const titleEl = document.getElementById('picker-title');
  const subtitleEl = document.getElementById('picker-subtitle');
  const closeBtn = document.getElementById('picker-close-btn');
  const box = document.querySelector('#menu-picker-overlay .picker-box');
  const title = opts.title || 'SELECT A MENU';
  const subtitle = opts.subtitle || 'Choose which menu to view';

  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (box) box.setAttribute('aria-label', title);

  if (closeBtn) {
    closeBtn.textContent = opts.closeLabel || 'Cancel';
    closeBtn.style.display = typeof _pickerOnClose === 'function' ? '' : 'none';
  }
}

// afterSelect: optional callback fired after the user picks a menu.
// opts.managerOnly: when true, filter to accessible menus only (used by manager switch).
async function showMenuPicker(afterSelect, opts) {
  const managerOnly = opts?.managerOnly || false;
  const menuIds = normalizeAccessibleMenuIds(opts?.menuIds);
  _pickerFocusBefore = document.activeElement;
  _pickerOnSelect    = afterSelect || null;
  _pickerOnClose     = typeof opts?.onClose === 'function' ? opts.onClose : null;

  _setMenuPickerContent(opts);

  const list = document.getElementById('picker-menu-list');
  if (!list) return;
  list.innerHTML = '<p class="picker-loading">Loading…</p>';
  document.getElementById('menu-picker-overlay').classList.add('open');
  document.removeEventListener('keydown', _pickerFocusTrap);
  document.addEventListener('keydown', _pickerFocusTrap);

  let menus = [];
  if (menuIds.length) {
    menus = sortKnownMenus(
      knownMenuList()
        .filter(menu => menuIds.includes(menu.id))
        .map(menu => ({
          id: menu.id,
          name: menu.name,
          slug: menu.slug,
          type: menu.type,
          restaurant_id: menu.restaurantId,
          archived: false,
        }))
    );
  } else if (SUPABASE_URL) {
    const url = `${SUPABASE_URL}/rest/v1/menus?id=in.(${KNOWN_MENU_ORDER.join(',')})&select=id,name,slug,type,restaurant_id,archived`;
    try {
      const res = await fetch(url, { headers: sbHeaders() });
      if (res.ok) menus = sortKnownMenus(await res.json());
    } catch(e) {}
  }

  if (currentUser?.role !== 'admin') {
    menus = menus.filter(menu => !menu.archived);
  }
  if (managerOnly && currentUser?.role === 'manager') {
    const allowed = new Set(currentUser?.accessibleMenuIds || []);
    menus = menus.filter(menu => allowed.has(menu.id));
  }
  if (menuIds.length) {
    const allowed = new Set(menuIds);
    menus = menus.filter(menu => allowed.has(menu.id));
  }

  list.innerHTML = '';
  if (!menus.length) {
    list.innerHTML = `<p class="picker-empty">${escHtml(opts?.emptyMessage || 'No menus available.')}</p>`;
  } else {
    knownRestaurantList().forEach(restaurant => {
      const sectionMenus = menus.filter(menu => menu.restaurant_id === restaurant.id);
      if (!sectionMenus.length) return;

      const group = document.createElement('section');
      group.className = 'picker-restaurant-group';
      group.innerHTML = `<div class="section-label" style="margin-bottom:10px;">${escHtml(restaurant.name)}</div>`;

      const cards = document.createElement('div');
      cards.className = 'picker-menu-group';
      sectionMenus.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'picker-menu-card';
        const menuLabel = formatMenuDisplayName(m.name, m.type, m.restaurant_id);
        btn.setAttribute('aria-label', `Select ${menuLabel}`);
        btn.innerHTML = `<span class="picker-menu-name">${escHtml(menuLabel)}</span><span class="picker-menu-type">${escHtml(getMenuTypeLabel(m.type))}</span>`;
        btn.onclick = () => selectMenu(m.id, m.slug, m.name, m.type, m.restaurant_id);
        cards.appendChild(btn);
      });

      group.appendChild(cards);
      list.appendChild(group);
    });
    const first = list.querySelector('.picker-menu-card');
    if (first) setTimeout(() => first.focus(), 0);
  }
}

function closeMenuPicker(opts = {}) {
  const overlay = document.getElementById('menu-picker-overlay');
  if (overlay) overlay.classList.remove('open');
  document.removeEventListener('keydown', _pickerFocusTrap);
  const onClose = opts.skipOnClose ? null : _pickerOnClose;
  _pickerOnClose = null;
  _setMenuPickerContent({});
  if (_pickerFocusBefore?.focus) _pickerFocusBefore.focus();
  _pickerFocusBefore = null;
  _pickerOnSelect = null;
  if (onClose) onClose();
}

function selectMenu(menuId, slug, menuName, menuType, restaurantId) {
  const cb = _pickerOnSelect;
  MENU_ID       = menuId;
  setActiveMenuContext(menuName || '', menuType || 'drinks', restaurantId || '');
  lsSet(LS_KEYS.menuId, MENU_ID);
  const url = new URL(location.href);
  url.searchParams.set('menu', slug);
  history.replaceState({}, '', url.toString());
  closeMenuPicker({ skipOnClose: true });
  updateActiveMenuBar();
  renderUserHeader();
  if (cb) cb();
}

function updateActiveMenuBar() {
  const bar       = document.getElementById('active-menu-bar');
  const nameEl    = document.getElementById('active-menu-name');
  const switchBtn = document.getElementById('switch-menu-btn');
  const drawerSwitchBtn = document.getElementById('drawer-switch-menu-btn');
  const headerBadge = document.getElementById('manager-header-menu-badge');
  const drawerBadge = document.getElementById('manager-drawer-menu-badge');
  const footerMenu = document.getElementById('manager-footer-menu-name');
  if (!bar) return;
  const displayName = formatMenuDisplayName(_activeMenuName, MENU_TYPE, RESTAURANT_ID);
  if (displayName) nameEl.textContent = displayName;
  if (headerBadge) headerBadge.textContent = displayName || 'No menu selected';
  if (drawerBadge) drawerBadge.textContent = displayName || 'No menu selected';
  if (footerMenu) footerMenu.textContent = displayName || 'No menu selected';
  bar.style.display = displayName ? '' : 'none';
  // Show "Switch" only when the user has access to more than one menu
  const role          = currentUser?.role;
  const accessibleIds = currentUser?.accessibleMenuIds || [];
  const canSwitch     = role === 'admin' || accessibleIds.length > 1;
  if (switchBtn) switchBtn.style.display = canSwitch ? '' : 'none';
  if (drawerSwitchBtn) drawerSwitchBtn.style.display = canSwitch ? '' : 'none';
}

async function onSwitchMenuClick() {
  showMenuPicker(async () => {
    // Reload menu data into the manager view for the newly selected menu
    _uncatCategoryUuid = null;
    await loadActiveMenuState();
    applyDesign(currentDesign);
    await sbEnsureUncategorized();
    renderManagerWorkspace();
    updateDraftIndicator();
    updateSaveBtn();
    checkFeaturedConfirmation();
  }, { managerOnly: true });
}

async function onPublicSwitchMenuClick() {
  showMenuPicker(async () => {
    // Public routes are restaurant-owned, so a cross-restaurant selection
    // must navigate to the target route instead of only swapping local state.
    const targetHref = getPublicHrefForCurrentMenu();
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (targetHref && targetHref !== currentHref) {
      navigateToPage(targetHref);
      return;
    }

    // Reload public view in place when the selection stays on the same route.
    await loadActiveMenuState();
    applyDesign(currentDesign);
    renderPublicViews();
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
  _setSettingsShellPending(false);
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
    await _syncRequestedPageMode();
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
    await _syncRequestedPageMode();
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
  _syncRequestedPageMode();
}

// ─── MANAGER MODE ─────────────────────────────────────────────────────────────
function enterManager() {
  const settingsView = document.getElementById('manager-view');
  const managerPanel = document.getElementById('manager-panel');
  if (!settingsView || !managerPanel) {
    navigateToPage(SHARED_PAGE_PATHS.manager);
    return;
  }
  document.getElementById('custom-design-style')?.remove();
  _setSettingsShellPending(false);
  _togglePublicShellMode('default');
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
  _clearSettingsRedirectPrompt();
  stopPolling();
  document.body.classList.add('manager-mode');
  _setDisplayById('public-view', 'none');
  _setDisplayById('loading-view', 'none');
  closeMenuPicker({ skipOnClose: true });
  closeSettingsDrawer();
  settingsView.style.display = 'block';
  managerPanel.style.display = 'block';
  renderUserHeader();
  renderManagerWorkspace();
  _syncSettingsSectionFromLocation('manager-overview-section');
  updateDraftIndicator();
  updateSaveBtn();
  checkFeaturedConfirmation();
}

function exitManager() {
  isManagerMode = false;
  document.body.classList.remove('manager-mode');
  _setDisplayById('manager-view', 'none');
  _setRestaurantPublicMode(false);
  closeSettingsDrawer();
  renderUserHeader();
  if (isSettingsPage()) {
    navigateToPage(getPublicHrefForCurrentMenu());
    return;
  }
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=in.(${KNOWN_RESTAURANT_ORDER.join(',')})&select=id&limit=1`, {
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
      const r = await fetch(`${SUPABASE_URL}/rest/v1/menu_meta?menu_id=eq.${encodeURIComponent(targetMenuId)}`, {
        method:  'PATCH',
        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
        body:    JSON.stringify({ notifications }),
      });
      if (!r.ok) throw new Error(`notifications patch: ${r.status}`);
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
  if (!isValidRestaurant(restaurantId)) { showToast('Unsupported restaurant selected.', 'error'); return; }
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
      const r = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
        method: 'PATCH',
        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ notifications_config }),
      });
      if (!r.ok) throw new Error(`credential keys patch: ${r.status}`);
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
      fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=in.(${KNOWN_RESTAURANT_ORDER.join(',')})&select=id,name,use_custom_design&order=name.asc`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/menus?id=in.(${KNOWN_MENU_ORDER.join(',')})&select=id,name,type,restaurant_id,archived&order=name.asc`, { headers: sbHeaders() }),
    ]);
    if (restRes.ok) _adminRestaurants = sortKnownRestaurants(await restRes.json());
    if (menuRes.ok) _adminAllMenus    = sortKnownMenus(await menuRes.json());
  } catch(e) { /* non-fatal */ }
}

function _refreshAdminMenuSelect(context) {
  const state = _adminSwitcherState[context];
  const menuSelect = document.getElementById(`${context}-menu-select`);
  if (!menuSelect) return;
  const menus = _adminAllMenus.filter(m => m.restaurant_id === state.restaurantId);
  menuSelect.innerHTML = menus.length
    ? menus.map(m => `<option value="${escHtml(m.id)}">${escHtml(formatMenuDisplayName(m.name, m.type, m.restaurant_id))}${m.archived ? ' (archived)' : ''}</option>`).join('')
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
    if (restaurantId && !isValidRestaurant(restaurantId)) {
      _populateAdminNotificationsPanel({});
      _populateNotifCredKeys({});
      return;
    }
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
  }
}

// ─── MANAGER SECTION TRACKING ────────────────────────────────────────────────
let _activeManagerSection = 'manager-overview-section';
let _staleSections = new Set();
const MANAGER_EDIT_SECTION_IDS = ['manager-items-section', 'manager-pricing-section', 'manager-description-section'];

function markSectionsStale(except) {
  MANAGER_EDIT_SECTION_IDS
    .filter(s => s !== except)
    .forEach(sectionId => {
      _staleSections.add(sectionId);
      const section = document.getElementById(sectionId);
      if (!section || section.style.display === 'none') return;
      if (sectionId === 'manager-items-section') renderManagerCategories();
      else if (sectionId === 'manager-pricing-section') renderPricingSection();
      else if (sectionId === 'manager-description-section') renderDescriptionSection();
      _staleSections.delete(sectionId);
    });
}

function setManagerEditSectionVisibility(activeSectionId) {
  MANAGER_EDIT_SECTION_IDS.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) section.style.display = '';
  });
}

function renderActiveManagerSection() {
  renderManagerCategories();
  renderPricingSection();
  renderDescriptionSection();
}

// ─── MANAGER CATEGORY EDIT (EDIT ITEMS) ─────────────────────────────────────
function renderManagerCategories() {
  const container = document.getElementById('manager-items-categories') || document.getElementById('manager-categories');
  if (!container) return;
  container.innerHTML = '';
  // Preserve uncategorized expansion state across re-renders
  const _uncatWasExpanded = !document.getElementById('mgr-card-' + UNCATEGORIZED_ID)?.classList.contains('collapsed');

  getManagedCategoryDefs().forEach(cat => {
    const isReadOnlyCategory = cat.readOnly || cat.deprecated;
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
            <input class="add-item-input" id="new-input-${escHtml(cat.id)}" type="text" placeholder="${escHtml(isReadOnlyCategory ? 'Legacy category is read-only' : (cat.placeholder || 'Add item…'))}" aria-label="${escHtml(isReadOnlyCategory ? `${cat.title} is read-only` : `Add item to ${cat.title}`)}" autocomplete="off" ${isReadOnlyCategory ? 'disabled' : `
              oninput="showAutocomplete('${escHtml(cat.id)}')"
              onblur="setTimeout(()=>hideAutocomplete('${escHtml(cat.id)}'),150)"
              onkeydown="handleAddItemKeydown(event,'${escHtml(cat.id)}')"`}/>
            <button class="add-item-btn" ${isReadOnlyCategory ? 'disabled aria-disabled="true"' : `onclick="addItem('${escHtml(cat.id)}')" aria-label="Add item to ${escHtml(cat.label)}"`}>+</button>
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
          <input class="add-item-input" id="new-input-${UNCATEGORIZED_ID}" type="text" placeholder="Add to pool…" aria-label="Add item to uncategorized pool" autocomplete="off"
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
    const wrapper = document.createElement('div');
    wrapper.className = 'item-wrapper';
    wrapper.id = 'wrapper-' + item.id;
    wrapper.innerHTML = buildUncategorizedItemHtml(item);
    listEl.appendChild(wrapper);
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
  pool.push({
    id: uid(),
    name,
    desc: '',
    recipe: [],
    price: '',
    eightySixed: false,
    onMenu: false,
    upcharges: [],
    showDescription: true,
    showRecipe: false,
  });
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

function buildRecipeListHtml(catId, itemId, ingredients) {
  return ingredients.map((ing, idx) =>
    `<div class="ingredient-row">
      <span class="ingredient-text">${escHtml(ing)}</span>
      <button class="del-ingredient" onclick="removeIngredient('${catId}','${itemId}',${idx})" aria-label="Remove ingredient">×</button>
    </div>`
  ).join('');
}

function buildManagerItemEditorHtml(item, catId, itemId, ingredients) {
  return `<div class="desc-row" id="desc-row-${itemId}">
      <textarea class="desc-input" aria-label="Item description" placeholder="Ingredients, description, how to sell it…"
        onblur="saveDesc('${catId}','${itemId}',this.value)">${escHtml(item.desc || '')}</textarea>
    </div>
    <div class="recipe-row" id="recipe-row-${itemId}">
      <div class="recipe-ingredient-list" id="recipe-list-${itemId}">${buildRecipeListHtml(catId, itemId, ingredients)}</div>
      <div class="add-ingredient-area">
        <input class="add-ingredient-input" id="ingredient-input-${itemId}" type="text"
          placeholder="Add ingredient…"
          onkeydown="handleIngredientKeydown(event,'${catId}','${itemId}')"/>
        <button class="add-ingredient-btn" onclick="addIngredient('${catId}','${itemId}')">+</button>
      </div>
    </div>`;
}

function buildUncategorizedItemHtml(item) {
  const ingredients = recipeArray(item.recipe);
  const hasDesc = !!(item.desc && item.desc.trim());
  const hasRecipe = ingredients.length > 0;
  return `<div class="current-item">
      <div class="item-name"><span class="item-name-static">${escHtml(item.name)}</span></div>
      <button class="desc-btn${hasDesc ? ' has-desc' : ''}" title="Edit description" aria-label="Edit description for ${escHtml(item.name)}" onclick="toggleItemDesc('${item.id}')">📝</button>
      <button class="recipe-btn${hasRecipe ? ' has-recipe' : ''}" title="Add recipe" aria-label="Edit recipe for ${escHtml(item.name)}" onclick="toggleItemRecipe('${item.id}')">🧪</button>
    </div>
    ${buildManagerItemEditorHtml(item, UNCATEGORIZED_ID, item.id, ingredients)}`;
}

function buildItemsRowHtml(item, catId, lastSentNames) {
  const isNew = !lastSentNames.has(item.name.trim().toLowerCase());
  const is86 = !!item.eightySixed;
  const stateClass = is86 ? 'is-eighty-sixed' : (item.visibility === 'off_menu' ? 'is-off-menu' : '');
  const badgeClass = is86 ? 'item-state-badge--86' : isNew ? 'item-state-badge--new' : 'item-state-badge--active';
  const badgeText = is86 ? '86' : isNew ? 'NEW' : '';
  const stateLabel = is86 ? "86'd" : isNew ? 'New' : 'Active';
  return `<div class="current-item items-row ${stateClass}">
      <button class="item-drag-handle" type="button" draggable="true"
        ondragstart="startManagerItemDrag(event,'${catId}','${item.id}')"
        ondragend="endManagerItemDrag(event)"
        title="Drag to reorder"
        aria-label="Drag to reorder ${escHtml(item.name)}">⋮⋮</button>
      ${badgeText ? `<div class="item-state-badge ${badgeClass}" role="img" aria-label="${stateLabel}" title="${stateLabel}">${badgeText}</div>` : ''}
      <div class="item-name"><input type="text" value="${escHtml(item.name)}"
        aria-label="Item name for ${escHtml(item.name)}"
        onblur="renameItem('${catId}','${item.id}',this.value)"
        onkeydown="if(event.key==='Enter')this.blur()"/></div>
      <span class="item-actions-compact">
        <button class="eighty-six-btn${is86 ? ' restore' : ''}" title="${is86 ? 'Restore' : '86'}" aria-label="${is86 ? `Restore ${escHtml(item.name)}` : `Mark ${escHtml(item.name)} 86'd`}" onclick="toggle86('${catId}','${item.id}')">${is86 ? '↩' : '86'}</button>
        <button class="del-item" onclick="removeItem('${catId}','${item.id}')" aria-label="Remove ${escHtml(item.name)}">×</button>
      </span>
    </div>`;
}

function buildPricingRowHtml(item, catId) {
  const is86 = !!item.eightySixed;
  const stateClass = is86 ? 'is-eighty-sixed' : '';
  const badgeClass = is86 ? 'item-state-badge--86' : '';
  const badgeText = is86 ? '86' : '';
  const upcharges = item.upcharges || [];
  const upchargeCount = upcharges.length;
  let summaryHtml = '';
  if (upchargeCount > 0) {
    summaryHtml = `<div class="upcharges-summary" id="upcharges-summary-${item.id}">${upcharges.map(u => `<span class="upcharge-chip">${escHtml(u.label)} <strong>${escHtml(u.price)}</strong></span>`).join('')}</div>`;
  }
  let panelHtml = `<div class="upcharges-panel" id="upcharges-${item.id}" style="display:none">
    <div class="upcharges-list" id="upcharges-list-${item.id}">${upcharges.map((u, idx) => `<div class="upcharge-row" data-upcharge-index="${idx}">
        <input class="upcharge-label-input" type="text" value="${escHtml(u.label)}" aria-label="Upcharge label" onblur="updateUpcharge('${catId}','${item.id}',${idx},'label',this.value)"/>
        <input class="upcharge-price-input" type="text" value="${escHtml(u.price)}" aria-label="Upcharge price" onblur="updateUpcharge('${catId}','${item.id}',${idx},'price',this.value)"/>
        <button class="upcharge-del-btn" onclick="removeUpcharge('${catId}','${item.id}',${idx})" aria-label="Remove upcharge">×</button>
      </div>`).join('')}</div>
    <div class="upcharge-add-row">
      <input class="upcharge-label-input" type="text" placeholder="e.g. Add bacon" aria-label="Upcharge label" id="upcharge-label-${item.id}"/>
      <input class="upcharge-price-input" type="text" placeholder="+$0.00" aria-label="Upcharge price" id="upcharge-price-${item.id}" onkeydown="if(event.key==='Enter')addUpcharge('${catId}','${item.id}')"/>
      <button class="upcharge-add-btn" onclick="addUpcharge('${catId}','${item.id}')" aria-label="Add upcharge">+</button>
    </div>
  </div>`;
  return `<div class="current-item pricing-row ${stateClass}">
      <div class="item-name">
        <span class="item-name-static">${escHtml(item.name)}</span>
        ${badgeText ? `<span class="item-state-badge ${badgeClass}" style="margin-left:8px">${badgeText}</span>` : ''}
      </div>
      <input class="price-input" type="text" placeholder="Price…" aria-label="Price for ${escHtml(item.name)}"
        onblur="savePrice('${catId}','${item.id}',this.value)"
        onkeydown="if(event.key==='Enter')this.blur()"
        value="${escHtml(item.price||'')}"/>
      <button class="upcharge-toggle-btn" title="Manage upcharges" aria-label="Manage upcharges for ${escHtml(item.name)}" aria-expanded="false" onclick="toggleUpcharges('${catId}','${item.id}')">
        <span class="upcharge-toggle-icon">+$</span>
        ${upchargeCount > 0 ? `<span class="upcharge-count">${upchargeCount}</span>` : ''}
      </button>
    </div>
    ${summaryHtml}
    ${panelHtml}`;
}

function buildDescriptionRowHtml(item, catId) {
  const ingredients = recipeArray(item.recipe);
  const is86 = !!item.eightySixed;
  const hasDesc = !!(item.desc && item.desc.trim());
  const hasRecipe = ingredients.length > 0;
  const showDescription = isItemDescriptionPublic(item);
  const showRecipe = isItemRecipePublic(item);
  const stateClass = is86 ? 'is-eighty-sixed' : '';
  const badgeClass = is86 ? 'item-state-badge--86' : '';
  const badgeText = is86 ? '86' : '';
  const summaryParts = [
    hasDesc ? 'Description added' : 'No description',
    hasRecipe ? `${ingredients.length} recipe entr${ingredients.length === 1 ? 'y' : 'ies'}` : 'No recipe',
  ];
  return `<article class="description-editor-card ${stateClass}" id="description-editor-${item.id}">
      <button class="desc-row-header" type="button" aria-expanded="false" aria-controls="desc-edit-body-${item.id}" onclick="toggleDescriptionEditor(${escAttrJs(item.id)})">
        <div class="desc-row-main">
          <div class="desc-row-title">
            <span class="item-name-static">${escHtml(item.name)}</span>
            ${badgeText ? `<span class="item-state-badge ${badgeClass}">${badgeText}</span>` : ''}
          </div>
          <p class="desc-row-meta">${escHtml(summaryParts.join(' · '))}</p>
        </div>
        <div class="desc-status-indicators">
          <span class="desc-indicator ${hasDesc ? 'has-content' : ''}${showDescription ? '' : ' is-hidden'}" id="desc-indicator-copy-${item.id}" data-label="Description">Description</span>
          <span class="desc-indicator ${hasRecipe ? 'has-content' : ''}${showRecipe ? '' : ' is-hidden'}" id="recipe-indicator-copy-${item.id}" data-label="Recipe">Recipe</span>
        </div>
        <span class="desc-chevron" aria-hidden="true">›</span>
      </button>
      <div class="desc-edit-body" id="desc-edit-body-${item.id}" hidden>
        <div class="desc-edit-grid">
          <div class="desc-field-block">
            <div class="desc-field-heading">
              <label class="desc-field-label" for="desc-input-${item.id}">Description</label>
              <label class="desc-visibility-toggle">
                <input id="desc-toggle-${item.id}" type="checkbox" ${showDescription ? 'checked' : ''} onchange="saveItemVisibilityFlag(${escAttrJs(catId)},${escAttrJs(item.id)},'showDescription',this.checked,this)"/>
                <span>Show on menu</span>
              </label>
            </div>
            <textarea class="desc-input" id="desc-input-${item.id}" placeholder="Describe this item for customers…" aria-label="Description for ${escHtml(item.name)}" onblur="saveDesc(${escAttrJs(catId)},${escAttrJs(item.id)},this.value)" rows="3">${escHtml(item.desc || '')}</textarea>
          </div>
          <div class="recipe-field-block">
            <div class="desc-field-heading">
              <label class="desc-field-label" for="ingredient-input-${item.id}">Recipe</label>
              <label class="desc-visibility-toggle">
                <input id="recipe-toggle-${item.id}" type="checkbox" ${showRecipe ? 'checked' : ''} onchange="saveItemVisibilityFlag(${escAttrJs(catId)},${escAttrJs(item.id)},'showRecipe',this.checked,this)"/>
                <span>Show on menu</span>
              </label>
            </div>
            <div class="recipe-ingredient-list" id="recipe-list-${item.id}">${buildRecipeListHtml(catId, item.id, ingredients)}</div>
            <div class="add-ingredient-area">
              <input class="add-ingredient-input" id="ingredient-input-${item.id}" type="text" placeholder="Add ingredient…" onkeydown="handleIngredientKeydown(event,${escAttrJs(catId)},${escAttrJs(item.id)})"/>
              <button class="add-ingredient-btn" onclick="addIngredient(${escAttrJs(catId)},${escAttrJs(item.id)})">+ Add Ingredient</button>
            </div>
          </div>
        </div>
      </div>
    </article>`;
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
    const wrapper  = document.createElement('div');
    wrapper.className = 'item-wrapper item-swipeable';
    wrapper.id = 'wrapper-' + item.id;
    wrapper.dataset.catId = catId;
    wrapper.dataset.itemId = item.id;
    wrapper.innerHTML = `<div class="swipe-action swipe-action--86" aria-hidden="true"><span class="swipe-action-label">86</span></div>
      <div class="swipe-action swipe-action--restore" aria-hidden="true"><span class="swipe-action-label">Restore</span></div>
      ${buildItemsRowHtml(item, catId, lastSentNames)}`;
    const row = wrapper.querySelector('.current-item');
    if (row) {
      row.addEventListener('dragover', event => allowManagerItemDrop(event, catId, item.id));
      row.addEventListener('drop', event => handleManagerItemDrop(event, catId, item.id));
    }
    listEl.appendChild(wrapper);
  });
  // Init swipe gestures for this category
  const catCard = listEl.closest('.cat-card');
  if (catCard) initSwipeGestures(catCard);
}

// ─── PRICING SECTION RENDERER ────────────────────────────────────────────────
function renderPricingSection() {
  const container = document.getElementById('manager-pricing-categories');
  if (!container) return;
  container.innerHTML = '';
  getManagedCategoryDefs().forEach(cat => {
    const state = menuState[cat.id] || { items: [] };
    const visibleItems = state.items.filter(i => i.onMenu !== false);
    if (!visibleItems.length) return;
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-header collapsible-header" role="button" tabindex="0" aria-expanded="true"
           onclick="toggleManagerCategory('pricing-${escHtml(cat.id)}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleManagerCategory('pricing-${escHtml(cat.id)}')}">
        <div class="cat-icon" style="background:${escHtml(cat.color)}">${escHtml(cat.icon)}</div>
        <div><div class="cat-title">${escHtml(cat.title)}</div></div>
        <span class="category-chevron">›</span>
      </div>
      <div class="current-section" id="pricing-body-${escHtml(cat.id)}">
        <div class="current-items" id="pricing-items-${escHtml(cat.id)}"></div>
      </div>`;
    card.id = 'mgr-card-pricing-' + cat.id;
    container.appendChild(card);
    const listEl = document.getElementById('pricing-items-' + cat.id);
    if (!listEl) return;
    visibleItems.forEach(item => {
      const wrapper = document.createElement('div');
      wrapper.className = 'item-wrapper';
      wrapper.id = 'pricing-wrapper-' + item.id;
      wrapper.innerHTML = buildPricingRowHtml(item, cat.id);
      listEl.appendChild(wrapper);
    });
  });
}

// ─── DESCRIPTION SECTION RENDERER ────────────────────────────────────────────
function renderDescriptionSection() {
  const container = document.getElementById('manager-description-categories');
  if (!container) return;
  container.innerHTML = '';
  getManagedCategoryDefs().forEach(cat => {
    const state = menuState[cat.id] || { items: [] };
    const visibleItems = state.items.filter(i => i.onMenu !== false);
    if (!visibleItems.length) return;
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-header collapsible-header" role="button" tabindex="0" aria-expanded="true"
           onclick="toggleManagerCategory('desc-${escHtml(cat.id)}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleManagerCategory('desc-${escHtml(cat.id)}')}">
        <div class="cat-icon" style="background:${escHtml(cat.color)}">${escHtml(cat.icon)}</div>
        <div><div class="cat-title">${escHtml(cat.title)}</div></div>
        <span class="category-chevron">›</span>
      </div>
      <div class="current-section" id="desc-body-${escHtml(cat.id)}">
        <div class="current-items" id="desc-items-${escHtml(cat.id)}"></div>
      </div>`;
    card.id = 'mgr-card-desc-' + cat.id;
    container.appendChild(card);
    const listEl = document.getElementById('desc-items-' + cat.id);
    if (!listEl) return;
    visibleItems.forEach(item => {
      const wrapper = document.createElement('div');
      wrapper.className = 'item-wrapper';
      wrapper.id = 'desc-wrapper-' + item.id;
      wrapper.innerHTML = buildDescriptionRowHtml(item, cat.id);
      listEl.appendChild(wrapper);
    });
  });
}

function startManagerItemDrag(event, catId, itemId) {
  _managerDraggedCatId = catId;
  _managerDraggedItemId = itemId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemId);
  }
  document.getElementById(`wrapper-${itemId}`)?.classList.add('is-dragging');
}

function endManagerItemDrag(event) {
  const wrapper = event?.target?.closest('.item-wrapper');
  if (wrapper) wrapper.classList.remove('is-dragging');
  document.querySelectorAll('.item-wrapper.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
  _managerDraggedCatId = '';
  _managerDraggedItemId = '';
}

function allowManagerItemDrop(event, catId, itemId) {
  if (!_managerDraggedItemId || _managerDraggedCatId !== catId || _managerDraggedItemId === itemId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.item-wrapper.is-drop-target').forEach(el => {
    if (el.dataset.itemId !== itemId) el.classList.remove('is-drop-target');
  });
  document.getElementById(`wrapper-${itemId}`)?.classList.add('is-drop-target');
}

function handleManagerItemDrop(event, catId, targetItemId) {
  if (!_managerDraggedItemId || _managerDraggedCatId !== catId || _managerDraggedItemId === targetItemId) return;
  event.preventDefault();
  const items = menuState[catId]?.items || [];
  const visibleItems = items.filter(item => item.onMenu !== false);
  const fromIndex = visibleItems.findIndex(item => item.id === _managerDraggedItemId);
  const toIndex = visibleItems.findIndex(item => item.id === targetItemId);
  if (fromIndex < 0 || toIndex < 0) return;

  const reorderedVisible = [...visibleItems];
  const [movedItem] = reorderedVisible.splice(fromIndex, 1);
  reorderedVisible.splice(toIndex, 0, movedItem);
  menuState[catId].items = [
    ...reorderedVisible,
    ...items.filter(item => item.onMenu === false),
  ];

  invalidateDiff();
  renderManagerItems(catId);
  markSectionsStale(_activeManagerSection);
  updateDraftIndicator();
  renderManagerOverviewStats();
  showToast('Item order updated.', 'success');
}

function buildCategoryUpsertRows() {
  return CATEGORY_DEFS
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => c._uuid)
    .map(({ c, idx }) => ({
      id:            c._uuid,
      menu_id:       MENU_ID,
      key:           c.id,
      label:         c.title,
      icon:          c.icon        || '',
      color:         c.color       || '',
      sub:           c.sub         || '',
      placeholder:   c.placeholder || '',
      display_order: idx,
    }));
}

async function insertNewCategories() {
  for (const [idx, c] of CATEGORY_DEFS.entries()) {
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
        display_order: idx,
      }),
    });
    if (r.ok) { const [row] = await r.json(); c._uuid = row.id; }
  }
}

function buildItemUpsertRows() {
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
        visibility:      item.visibility     || 'public',
        upcharges:       item.upcharges      || [],
        show_description:isItemDescriptionPublic(item),
        show_recipe:     isItemRecipePublic(item),
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
        visibility:      item.visibility || 'public',
        upcharges:       item.upcharges || [],
        show_description:isItemDescriptionPublic(item),
        show_recipe:     isItemRecipePublic(item),
        display_order:   idx,
      });
    });
  }
  return itemRows;
}

async function flushDeletedItems() {
  if (!_deletedItemIds.size) return;
  const ids = [..._deletedItemIds].map(id => `"${id}"`).join(',');
  await fetch(`${SUPABASE_URL}/rest/v1/items?id=in.(${ids})`, {
    method: 'DELETE', headers: sbHeaders(),
  });
  _deletedItemIds.clear();
}

function finalizePersistStatus(ok) {
  const syncEl = document.getElementById('sync-status');
  if (!syncEl) return;
  if (ok) {
    syncEl.textContent = '';
    syncEl.className = '';
  } else {
    syncEl.textContent = '⚠️ Cloud sync failed';
    syncEl.className = 'sync-error';
  }
  syncManagerActionBarStatus(syncEl);
}

async function persistState() {
  if (!SUPABASE_URL || !MENU_ID || !currentUser?.accessToken) return;
  try {
    const catRows = buildCategoryUpsertRows();
    if (catRows.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/categories`, {
        method:  'POST',
        headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(catRows),
      });
      if (!r.ok) throw new Error(`category upsert: ${r.status}`);
    }

    await insertNewCategories();

    const itemRows = buildItemUpsertRows();
    if (itemRows.length) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/items`, {
        method:  'POST',
        headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body:    JSON.stringify(itemRows),
      });
      if (!r.ok) throw new Error(`items upsert: ${r.status}`);
    }

    await flushDeletedItems();

    await Promise.all([
      sbPatchMenuMeta({ bot_id: BOT_ID }),
      sbPatchRestaurantDesign(currentDesign),
    ]);

    finalizePersistStatus(true);
    return true;
  } catch(e) {
    finalizePersistStatus(false);
    showToast('⚠️ Cloud save failed.', 'error');
    return false;
  }
}

async function saveMenu() {
  const ts = Date.now();
  try {
    const persisted = await persistState();
    if (!persisted) return;
    await patchMenuMetaWithCompatibility({ last_updated_ts: ts });
    menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: ts.toString() };
    lsSet(LS_KEYS.lastUpdated, ts.toString());
    _dirty = false;
    updateSaveBtn();
    updateLastUpdatedLabel();
    syncLocalMenuCache({ silent: true });
    showToast('✅ Menu saved!', 'success');
  } catch(e) {
    finalizePersistStatus(false);
    showToast('⚠️ Cloud save failed.', 'error');
  }
}

function addItem(catId) {
  const input = document.getElementById('new-input-' + catId);
  const name = input.value.trim();
  if (!name) return;
  const nameLower = name.toLowerCase();
  let movedFromUncategorized = false;
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
        movedFromUncategorized = true;
      } else {
        menuState[catId].items.push({
          id: uid(),
          name,
          desc: '',
          recipe: [],
          price: '',
          eightySixed: false,
          onMenu: true,
          upcharges: [],
          showDescription: true,
          showRecipe: false,
        });
      }
    }
  }
  input.value = '';
  hideAutocomplete(catId);
  invalidateDiff();
  renderManagerItems(catId);
  markSectionsStale(_activeManagerSection);
  if (movedFromUncategorized) renderUncategorizedItems();
  input.focus();
  updateDraftIndicator();
}

// ─── AUTOCOMPLETE ─────────────────────────────────────────────────────────────
let _acIdx = -1;

function getAutocompleteIndex(catId) {
  const categoryItems = menuState[catId]?.items || [];
  const uncategorizedItems = menuState[UNCATEGORIZED_ID]?.items || [];
  return {
    categoryItems,
    uncategorizedItems,
    categoryNames: new Set(categoryItems.map(i => i.name.trim().toLowerCase())),
  };
}

function showAutocomplete(catId) {
  const val = document.getElementById('new-input-' + catId).value.trim();
  const list = document.getElementById('ac-' + catId);
  _acIdx = -1;
  if (!val) { hideAutocomplete(catId); return; }
  const valLower = val.toLowerCase();
  const { categoryItems, uncategorizedItems, categoryNames } = getAutocompleteIndex(catId);
  const catMatches = categoryItems.filter(
    i => i.onMenu === false && i.name.toLowerCase().startsWith(valLower)
  );
  const uncatMatches = uncategorizedItems.filter(
    i => i.name.toLowerCase().startsWith(valLower) && !categoryNames.has(i.name.trim().toLowerCase())
  );
  const matches = [...catMatches, ...uncatMatches];
  if (!matches.length) { hideAutocomplete(catId); return; }
  list.innerHTML = matches.map(r =>
    `<div class="autocomplete-item" onmousedown="selectAutocomplete(event,'${catId}',${escAttrJs(r.name)})">${escHtml(r.name)}</div>`
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
  markSectionsStale(_activeManagerSection);
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

// ─── UPCHARGE CRUD ───────────────────────────────────────────────────────────
function toggleUpcharges(catId, itemId) {
  const panel = document.getElementById('upcharges-' + itemId);
  const btn = document.querySelector(`#pricing-wrapper-${itemId} .upcharge-toggle-btn`);
  const summary = document.getElementById('upcharges-summary-' + itemId);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : '';
  if (summary) summary.style.display = isOpen ? '' : 'none';
  if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
}

function addUpcharge(catId, itemId) {
  const labelInput = document.getElementById('upcharge-label-' + itemId);
  const priceInput = document.getElementById('upcharge-price-' + itemId);
  if (!labelInput || !priceInput) return;
  const label = labelInput.value.trim();
  const price = priceInput.value.trim();
  if (!label) return;
  const item = findItem(catId, itemId);
  if (!item) return;
  if (!item.upcharges) item.upcharges = [];
  item.upcharges.push({ label, price: price || '+$0' });
  labelInput.value = '';
  priceInput.value = '';
  invalidateDiff();
  updateDraftIndicator();
  renderPricingSection();
  markSectionsStale('manager-pricing-section');
}

function updateUpcharge(catId, itemId, index, field, value) {
  const item = findItem(catId, itemId);
  if (!item || !item.upcharges || !item.upcharges[index]) return;
  item.upcharges[index][field] = value.trim();
  invalidateDiff();
  updateDraftIndicator();
  markSectionsStale('manager-pricing-section');
}

function removeUpcharge(catId, itemId, index) {
  const item = findItem(catId, itemId);
  if (!item || !item.upcharges) return;
  item.upcharges.splice(index, 1);
  invalidateDiff();
  updateDraftIndicator();
  renderPricingSection();
  markSectionsStale('manager-pricing-section');
}

// ─── SWIPE GESTURES ──────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 80;
const SWIPE_MAX = 200;
const SWIPE_VERTICAL_LOCK_ANGLE = 30;

function initSwipeGestures(containerEl) {
  containerEl.querySelectorAll('.item-swipeable').forEach(wrapper => {
    const row = wrapper.querySelector('.items-row');
    if (!row || wrapper._swipeInit) return;
    wrapper._swipeInit = true;
    let startX = 0, startY = 0, currentX = 0;
    let isSwiping = false, isLocked = false;

    row.addEventListener('touchstart', e => {
      if (e.touches.length > 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      isSwiping = false;
      isLocked = false;
      row.classList.remove('swipe-animating');
      wrapper.classList.remove('swipe-triggered');
    }, { passive: true });

    row.addEventListener('touchmove', e => {
      if (isLocked || e.touches.length > 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!isSwiping && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (!isSwiping) {
        const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
        if (angle > (90 - SWIPE_VERTICAL_LOCK_ANGLE) && angle < (90 + SWIPE_VERTICAL_LOCK_ANGLE)) {
          isLocked = true;
          return;
        }
        isSwiping = true;
        wrapper.classList.add('swiping');
      }
      e.preventDefault();
      currentX = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx));
      const catId = wrapper.dataset.catId;
      const itemId = wrapper.dataset.itemId;
      const item = findItem(catId, itemId);
      const is86 = item?.eightySixed;
      if (currentX < 0 && is86) currentX = 0;
      if (currentX > 0 && !is86) currentX = 0;
      row.style.transform = `translateX(${currentX}px)`;
      if (Math.abs(currentX) >= SWIPE_THRESHOLD) wrapper.classList.add('swipe-triggered');
      else wrapper.classList.remove('swipe-triggered');
    }, { passive: false });

    row.addEventListener('touchend', () => {
      if (!isSwiping) return;
      wrapper.classList.remove('swiping');
      const catId = wrapper.dataset.catId;
      const itemId = wrapper.dataset.itemId;
      if (Math.abs(currentX) >= SWIPE_THRESHOLD) {
        const direction = currentX < 0 ? 'left' : 'right';
        row.style.transform = `translateX(${direction === 'left' ? -SWIPE_MAX : SWIPE_MAX}px)`;
        setTimeout(() => {
          toggle86(catId, itemId);
          row.classList.add('swipe-animating');
          row.style.transform = 'translateX(0)';
          wrapper.classList.remove('swipe-triggered');
          setTimeout(() => { row.classList.remove('swipe-animating'); row.style.transform = ''; }, 300);
        }, 180);
      } else {
        row.classList.add('swipe-animating');
        row.style.transform = 'translateX(0)';
        wrapper.classList.remove('swipe-triggered');
        setTimeout(() => { row.classList.remove('swipe-animating'); row.style.transform = ''; }, 300);
      }
    });
  });
}

// ─── COLLAPSING HEADER ───────────────────────────────────────────────────────
let _lastScrollY = 0;
let _collapsingHeaderBound = false;

function initCollapsingHeader() {
  if (_collapsingHeaderBound) return;
  _collapsingHeaderBound = true;
  let ticking = false;
  const evaluate = () => {
    const body = document.body;
    const y = window.scrollY;
    if (window.innerWidth > 920) {
      if (body.classList.contains('settings-drawer-open')) closeSettingsDrawer();
      body.classList.remove('header-compact', 'header-hidden');
      _lastScrollY = y;
      return;
    }
    const delta = y - _lastScrollY;
    const scrollingDown = delta > 8;
    const scrollingUp = delta < -8;
    body.classList.toggle('header-compact', y > 32);
    if (y <= 16) {
      body.classList.remove('header-hidden');
    } else if (y > 132 && scrollingDown) {
      body.classList.add('header-hidden');
    } else if (scrollingUp || y < 88) {
      body.classList.remove('header-hidden');
    }
    _lastScrollY = y;
  };
  const requestEvaluate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      evaluate();
    });
  };
  window.addEventListener('scroll', requestEvaluate, { passive: true });
  window.addEventListener('resize', requestEvaluate);
  requestEvaluate();
}

// ─── DRAWER SWIPE TO CLOSE ───────────────────────────────────────────────────
function initDrawerSwipe() {
  const rail = document.getElementById('manager-settings-rail');
  if (!rail || rail.dataset.swipeBound === 'true') return;
  rail.dataset.swipeBound = 'true';
  let startX = 0;
  rail.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  rail.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -60) closeSettingsDrawer();
  }, { passive: true });
}

// ─── DESCRIPTION ──────────────────────────────────────────────────────────────
function toggleItemDesc(itemId) {
  const row = document.getElementById('desc-row-' + itemId);
  if (!row) return;
  const opening = !row.classList.contains('open');
  row.classList.toggle('open', opening);
  if (opening) row.querySelector('textarea').focus();
}

function toggleDescriptionEditor(itemId) {
  const card = document.getElementById('description-editor-' + itemId);
  const body = document.getElementById('desc-edit-body-' + itemId);
  const trigger = card?.querySelector('.desc-row-header');
  if (!card || !body || !trigger) return;
  const opening = !card.classList.contains('is-open');
  card.classList.toggle('is-open', opening);
  body.hidden = !opening;
  trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (opening) body.querySelector('textarea, input, button')?.focus();
}

function syncDescriptionIndicator(indicator, hasContent, isVisible) {
  if (!indicator) return;
  const label = indicator.dataset.label || indicator.textContent || '';
  indicator.classList.toggle('has-content', !!hasContent);
  indicator.classList.toggle('is-hidden', !isVisible);
  indicator.title = `${label}: ${hasContent ? 'added' : 'empty'}${isVisible ? ', visible on menu' : ', hidden on menu'}`;
}

function syncDescriptionSummary(itemId, item) {
  if (!item) return;
  const descIndicator = document.getElementById('desc-indicator-copy-' + itemId);
  const recipeIndicator = document.getElementById('recipe-indicator-copy-' + itemId);
  const summary = document.querySelector(`#description-editor-${itemId} .desc-row-meta`);
  const hasDesc = !!String(item.desc || '').trim();
  const ingredients = recipeArray(item.recipe);
  const hasRecipe = ingredients.length > 0;

  syncDescriptionIndicator(descIndicator, hasDesc, isItemDescriptionPublic(item));
  syncDescriptionIndicator(recipeIndicator, hasRecipe, isItemRecipePublic(item));

  if (summary) {
    summary.textContent = [
      hasDesc ? 'Description added' : 'No description',
      hasRecipe ? `${ingredients.length} recipe entr${ingredients.length === 1 ? 'y' : 'ies'}` : 'No recipe',
    ].join(' · ');
  }
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
  list.innerHTML = buildRecipeListHtml(catId, itemId, ingredients);
  syncDescriptionSummary(itemId, item);
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
    syncDescriptionSummary(itemId, item);
    markSectionsStale(_activeManagerSection);
    const btn = document.querySelector('#wrapper-' + itemId + ' .desc-btn');
    if (btn) btn.classList.toggle('has-desc', !!desc);
    await persistState();
    _flashSaved(document.querySelector(`#desc-input-${itemId}`));
  }
}

async function saveItemVisibilityFlag(catId, itemId, field, checked, sourceEl = null) {
  const item = findItem(catId, itemId);
  if (!item) return;
  const normalizedField = field === 'showRecipe' ? 'showRecipe' : 'showDescription';
  const nextValue = !!checked;
  if (!!item[normalizedField] === nextValue) return;
  item[normalizedField] = nextValue;
  syncDescriptionSummary(itemId, item);
  await persistState();
  if (sourceEl?.closest) _flashSaved(sourceEl.closest('.desc-visibility-toggle'));
}

async function savePrice(catId, itemId, val) {
  const item = findItem(catId, itemId);
  if (!item) return;
  const price = val.trim();
  if (item.price !== price) {
    item.price = price;
    markSectionsStale(_activeManagerSection);
    await persistState();
    _flashSaved(document.querySelector(`#pricing-wrapper-${itemId} .price-input`) || document.querySelector(`#wrapper-${itemId} .price-input`));
  }
}

function removeItem(catId, itemId) {
  const item = findItem(catId, itemId);
  if (!item) return false;
  item.onMenu = false;
  invalidateDiff();
  renderManagerItems(catId);
  markSectionsStale(_activeManagerSection);
  updateDraftIndicator();
  const removedName = item.name;
  showToast(`"${removedName}" removed`, 'info', () => {
    item.onMenu = true;
    invalidateDiff();
    renderManagerItems(catId);
    markSectionsStale(_activeManagerSection);
    updateDraftIndicator();
    showToast(`"${removedName}" restored`, 'success');
  });
  return true;
}

function renderPruneSection() {
  const isAdmin = currentUser?.role === 'admin';
  const section = document.getElementById('prune-section');
  if (!section) return;
  section.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) return;
  const wrap = document.getElementById('prune-items-wrap');
  if (!wrap) return;
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

function renderOffMenuSection() {
  // Off-menu UI removed — kept as no-op for backward compatibility
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
  renderOffMenuSection();
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
  renderOffMenuSection();
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
  if (item && item.name !== name) { item.name = name; invalidateDiff(); renderManagerItems(catId); markSectionsStale(_activeManagerSection); updateDraftIndicator(); }
}

// ─── DRAFT INDICATOR ─────────────────────────────────────────────────────────
function updateDraftIndicator() {
  const btn = document.getElementById('send-btn');
  if (!btn) return;
  const diff = getCachedDiff();
  const total = diff.reduce((n, s) => n + s.added.length + s.removed.length + s.eightySixed.length + s.restored.length, 0);
  if (total > 0) {
    btn.innerHTML = `Send Update <span class="send-update-count">(${total} Change${total > 1 ? 's' : ''})</span>`;
    btn.style.boxShadow = '0 4px 22px rgba(255,77,0,0.55)';
  } else {
    btn.innerHTML = 'Send Update';
    btn.style.boxShadow = '';
  }
  renderManagerOverviewStats();
  updateManagerActionBar();
}

// ─── DIFF ─────────────────────────────────────────────────────────────────────
function restoreLabel(catId) {
  const cat = CATEGORY_DEFS.find(c => c.id === catId);
  if (cat && cat.title.toLowerCase().includes('tap')) return 'Back on Tap';
  return 'Back in Stock';
}

function computeCategoryDiff(cat) {
  const state = menuState[cat.id] || { items: [], lastSent: [] };
  const lastByName = new Map();
  const currentNames = [];
  const lastNames = [];
  const currentSet = new Set();
  const lastSet = new Set();
  const eightySixed = [];
  const restored = [];
  const eightySixedNames = new Set();
  const restoredNames = new Set();

  state.lastSent.forEach(item => {
    const trimmed = item.name.trim();
    const key = trimmed.toLowerCase();
    lastByName.set(key, item);
    if (item.onMenu !== false && !item.eightySixed && trimmed) {
      lastNames.push(trimmed);
      lastSet.add(key);
    }
  });

  state.items.forEach(item => {
    const trimmed = item.name.trim();
    const key = trimmed.toLowerCase();
    const isVisible = item.onMenu !== false && item.visibility !== 'off_menu';
    const prev = lastByName.get(key);
    if (isVisible && prev && prev.onMenu !== false) {
      if (!prev.eightySixed && item.eightySixed) { eightySixed.push(trimmed); eightySixedNames.add(key); }
      if (prev.eightySixed && !item.eightySixed) { restored.push(trimmed); restoredNames.add(key); }
    }
    if (isVisible && !item.eightySixed && trimmed) {
      currentNames.push(trimmed);
      currentSet.add(key);
    }
  });

  const added = currentNames.filter(n => !lastSet.has(n.toLowerCase()) && !restoredNames.has(n.toLowerCase()));
  const removed = lastNames.filter(n => !currentSet.has(n.toLowerCase()) && !eightySixedNames.has(n.toLowerCase()));
  if (!added.length && !removed.length && !eightySixed.length && !restored.length) return null;
  return { id: cat.id, icon: cat.icon, label: cat.title, added, removed, eightySixed, restored };
}

function computeFeaturedDiff() {
  const featuredByItemId = new Map();
  const currentFeaturedIds = new Set();
  _featuredGroups.forEach(group => {
    group.slots.forEach(slot => {
      if (!slot.item) return;
      currentFeaturedIds.add(slot.itemId);
      featuredByItemId.set(slot.itemId, slot);
    });
  });
  const featuredAdded = [];
  const featuredRemoved = [];
  currentFeaturedIds.forEach(id => {
    if (!_lastSentFeaturedIds.has(id)) {
      const slot = featuredByItemId.get(id);
      if (slot?.item) featuredAdded.push(slot.item.name);
    }
  });
  _lastSentFeaturedIds.forEach(id => {
    if (!currentFeaturedIds.has(id)) {
      const slot = featuredByItemId.get(id);
      featuredRemoved.push(slot?.item?.name || '(removed item)');
    }
  });
  if (!featuredAdded.length && !featuredRemoved.length) return null;
  return {
    id: '__featured__',
    icon: '⭐',
    label: getRestaurantSpecialLabel(RESTAURANT_ID),
    added: featuredAdded,
    removed: featuredRemoved,
    eightySixed: [],
    restored: [],
  };
}

function computeDiff() {
  const results = [];
  getManagedCategoryDefs().forEach(cat => {
    const diff = computeCategoryDiff(cat);
    if (diff) results.push(diff);
  });
  const featuredDiff = computeFeaturedDiff();
  if (featuredDiff) results.push(featuredDiff);
  return results;
}

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────
function buildPreviewBlockHtml(section) {
  let html = `<div class="preview-cat">${escHtml(section.icon)} ${escHtml(section.label)}</div>`;
  section.added.forEach(n       => { html += `<div class="preview-line add"><span>✅</span> + ${escHtml(n)}</div>`; });
  section.removed.forEach(n     => { html += `<div class="preview-line remove"><span>❌</span> − ${escHtml(n)}</div>`; });
  section.eightySixed.forEach(n => { html += `<div class="preview-line remove"><span>🚫</span> 86'd: ${escHtml(n)}</div>`; });
  section.restored.forEach(n    => { html += `<div class="preview-line add"><span>↩</span> ${restoreLabel(section.id)}: ${escHtml(n)}</div>`; });
  return html;
}

function openPreview() {
  const diff = getCachedDiff();
  const content = document.getElementById('preview-content');
  const confirmBtn = document.getElementById('confirm-btn');
  const modal = document.getElementById('modal-bg');
  if (!content || !confirmBtn || !modal) return;
  content.innerHTML = '';
  if (!diff.length) {
    content.innerHTML = `<div class="no-changes">🎉 No changes since the last update.<br><span style="font-size:11px;color:#444;">Add, remove, or 86 items to generate an update.</span></div>`;
    confirmBtn.disabled = true;
  } else {
    confirmBtn.disabled = false;
    diff.forEach(s => {
      const block = document.createElement('div');
      block.className = 'preview-block';
      block.innerHTML = buildPreviewBlockHtml(s);
      content.appendChild(block);
    });
  }
  modal.classList.add('open');
}
function closeModal() { document.getElementById('modal-bg')?.classList.remove('open'); }

// ─── SEND UPDATE ──────────────────────────────────────────────────────────────
function buildPatchMessage(diff) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  const cleanName = n => n.replace(/[\r\n]+/g, ' ').trim();
  const menuLabel = _activeMenuName ? _activeMenuName.toUpperCase() : 'MENU';
  const lines = [`🔥 ${menuLabel} UPDATES — ${dateStr} ${timeStr}`, ''];
  diff.forEach(section => {
    lines.push(`${section.icon} ${section.label.toUpperCase()}`);
    section.added.forEach(n       => lines.push(`  ✅ + ${cleanName(n)}`));
    section.removed.forEach(n     => lines.push(`  ❌ - ${cleanName(n)}`));
    section.eightySixed.forEach(n => lines.push(`  🚫 86'd: ${cleanName(n)}`));
    section.restored.forEach(n    => lines.push(`  ✅ ${restoreLabel(section.id)}: ${cleanName(n)}`));
    lines.push('');
  });
  if (MENU_URL) lines.push(`📋 Full menu: ${MENU_URL}`);
  return lines.join('\n').trim();
}

function snapshotLastSentState() {
  const lastSentState = {};
  CATEGORY_DEFS.forEach(cat => { lastSentState[cat.id] = menuState[cat.id]?.lastSent || []; });
  return lastSentState;
}

function getCurrentFeaturedIds() {
  const ids = [];
  _featuredGroups.forEach(g => g.slots.forEach(s => { if (s.item) ids.push(s.itemId); }));
  return ids;
}

function applySentState(diff, ts) {
  CATEGORY_DEFS.forEach(cat => {
    if (menuState[cat.id]) menuState[cat.id].lastSent = (menuState[cat.id].items || []).map(i => ({ ...i }));
  });
  menuState._meta = {
    ...(menuState._meta || {}),
    lastUpdatedTs: ts.toString(),
    lastSentTs: ts.toString(),
    lastSentCategories: diff.map(d => d.id),
  };
  lsSet(LS_KEYS.lastUpdated, ts.toString());
  invalidateDiff();
}

async function logUpdate(diff, patchMessage) {
  if (!SUPABASE_URL || !currentUser?.accessToken) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/update_log`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        menu_id:   MENU_ID,
        user_id:   currentUser.uid,
        user_name: currentUser.name || currentUser.email || '',
        diff:      diff,
        message:   patchMessage,
      }),
    });
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function sendUpdate() {
  const diff = getCachedDiff();
  if (!diff.length) { closeModal(); return; }
  const patchMessage = buildPatchMessage(diff);

  if (patchMessage.length > 1000) {
    showToast('Update is long and will be truncated.', 'info');
  }

  const confirmBtn = document.getElementById('confirm-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'SENDING…';

  try {
    const authHeaders = currentUser?.accessToken
      ? { 'Authorization': `Bearer ${currentUser.accessToken}` }
      : {};
    const r1 = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ menu_id: MENU_ID, text: patchMessage })
    });

    if (r1.status >= 200 && r1.status < 300) {
      showToast(`✅ ${_activeMenuName || 'Menu'} update sent!`, 'success');
      const ts = Date.now();
      closeModal();
      try {
        const persisted = await persistState();
        if (!persisted) throw new Error('persist failed');
        const lastSentState = snapshotCurrentItemsAsLastSent();
        const currentFeaturedIds = getCurrentFeaturedIds();
        const restaurantMenuIds = currentUserCanEditRestaurantSpecials(RESTAURANT_ID)
          ? (getRestaurantSpecialConfig(RESTAURANT_ID)?.menuIds || [])
          : [];
        _lastSentFeaturedIds = new Set(currentFeaturedIds);
        await Promise.all([
          sbPatchMenuMeta({
            last_updated_ts:      ts,
            last_sent_ts:         ts,
            last_sent_state:      lastSentState,
            last_sent_categories: diff.map(d => d.id),
            last_sent_featured:   currentFeaturedIds,
          }),
          ...restaurantMenuIds
            .filter(menuId => menuId && menuId !== MENU_ID)
            .map(menuId => sbPatchMenuMetaForMenu(menuId, { last_sent_featured: currentFeaturedIds })),
        ]);
        applySentState(diff, ts);
        _dirty = false;
        updateSaveBtn();
        updateLastUpdatedLabel();
        renderManagerWorkspace({ includeRecentChanges: false });
        updateDraftIndicator();
        const cacheSynced = syncLocalMenuCache({ silent: true });
        if (!cacheSynced) {
          showToast('⚠️ Update sent, but this device could not refresh its local cache.', 'warning');
        }
        const logged = await logUpdate(diff, patchMessage);
        if (!logged) console.warn('sendUpdate audit log insert failed');
        renderRecentChanges();
      } catch (syncError) {
        console.warn('sendUpdate post-send sync failed:', syncError);
        showToast('⚠️ Update sent, but database sync needs attention. Refresh before sending again.', 'warning');
      }
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
  confirmBtn.textContent = 'SEND UPDATE';
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let _toastUndoTimer = null;
function _flashSaved(el) {
  if (!el) return;
  el.classList.add('field-saved');
  setTimeout(() => el.classList.remove('field-saved'), 1200);
}

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

document.getElementById('modal-bg')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal-bg')) closeModal();
});

document.getElementById('prune-all-btn')?.addEventListener('click', () => {
  if (!confirm('Permanently delete ALL off-menu items? This cannot be undone.')) return;
  pruneRemoved('all');
});

document.getElementById('prune-items-wrap')?.addEventListener('click', e => {
  const btn = e.target.closest('.prune-del-btn');
  if (!btn) return;
  pruneSingleItem(btn.dataset.catid, btn.dataset.name);
});

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
async function loadUsers() {
  const wrap = document.getElementById('users-list');
  if (!wrap) return;
  wrap.innerHTML = '<div class="db-empty">Loading…</div>';
  window._adminUserList = null;
  try {
    // Fetch menus list for menu access checkboxes
    if (SUPABASE_URL) {
      const menusRes = await fetch(
        `${SUPABASE_URL}/rest/v1/menus?id=in.(${KNOWN_MENU_ORDER.join(',')})&select=id,name,type,restaurant_id&archived=eq.false&order=created_at.asc`,
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

function summarizeHistoryDiff(diff) {
  const summaryParts = [];
  const totalAdded = diff.reduce((n, s) => n + (s.added?.length || 0), 0);
  const totalRemoved = diff.reduce((n, s) => n + (s.removed?.length || 0), 0);
  const total86 = diff.reduce((n, s) => n + (s.eightySixed?.length || 0), 0);
  const totalRestored = diff.reduce((n, s) => n + (s.restored?.length || 0), 0);
  if (totalAdded) summaryParts.push(`+${totalAdded} added`);
  if (totalRemoved) summaryParts.push(`-${totalRemoved} removed`);
  if (total86) summaryParts.push(`${total86} 86'd`);
  if (totalRestored) summaryParts.push(`${totalRestored} restored`);
  return summaryParts.join(', ') || 'No item changes';
}

function buildHistoryDetailHtml(diff) {
  return diff.map(s =>
    `<div class="history-cat"><strong>${escHtml(s.icon || '')} ${escHtml(s.label || '')}</strong></div>` +
    (s.added || []).map(n => `<div class="history-line history-add">+ ${escHtml(n)}</div>`).join('') +
    (s.removed || []).map(n => `<div class="history-line history-remove">- ${escHtml(n)}</div>`).join('') +
    (s.eightySixed || []).map(n => `<div class="history-line history-remove">86'd: ${escHtml(n)}</div>`).join('') +
    (s.restored || []).map(n => `<div class="history-line history-add">Back: ${escHtml(n)}</div>`).join('')
  ).join('');
}

function buildChangeFeedHtml(logs) {
  const locale = navigator.languages?.[0] || navigator.language || undefined;
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const buildEntryHtml = log => {
    const d = new Date(log.created_at);
    const dateStr = dateFormatter.format(d);
    const timeStr = timeFormatter.format(d);
    const diff = log.diff || [];
    const summary = summarizeHistoryDiff(diff);
    const detailHtml = buildHistoryDetailHtml(diff);

    return `<div class="history-entry">
      <button class="history-header" type="button" aria-expanded="false" onclick="this.parentElement.classList.toggle('expanded'); this.setAttribute('aria-expanded', this.parentElement.classList.contains('expanded') ? 'true' : 'false');">
        <span class="history-date">${escHtml(dateStr)} ${escHtml(timeStr)}</span>
        <span class="history-user">${escHtml(log.user_name || 'Unknown')}</span>
        <span class="history-summary">${escHtml(summary)}</span>
        <span class="history-chevron">\u203A</span>
      </button>
      <div class="history-detail">${detailHtml}</div>
    </div>`;
  };
  const primaryLogs = logs.slice(0, 2).map(buildEntryHtml).join('');
  if (logs.length <= 2) return primaryLogs;
  const olderCount = logs.length - 2;
  const olderLogs = logs.slice(2).map(buildEntryHtml).join('');
  return `${primaryLogs}
    <details class="history-archive">
      <summary class="history-archive-summary">
        <span class="history-archive-copy">Older changes</span>
        <span class="history-archive-count">${olderCount} more update${olderCount === 1 ? '' : 's'}</span>
      </summary>
      <div class="history-archive-body">${olderLogs}</div>
    </details>`;
}

async function renderRecentChanges() {
  const wrap = document.getElementById('recent-changes-wrap');
  if (!wrap) return;
  if (!SUPABASE_URL || !currentUser?.accessToken) {
    wrap.innerHTML = '<p class="db-empty">Recent changes are unavailable until you are signed in.</p>';
    return;
  }
  if (!MENU_ID) {
    wrap.innerHTML = '<p class="db-empty">Select a menu to view recent changes.</p>';
    return;
  }

  wrap.innerHTML = '<p class="db-empty">Loading\u2026</p>';
  try {
    const sinceIso = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/update_log?menu_id=eq.${MENU_ID}&created_at=gte.${encodeURIComponent(sinceIso)}&select=*&order=created_at.desc&limit=25`,
      { headers: sbHeaders() }
    );
    if (!r.ok) throw new Error('fetch failed');
    const logs = await r.json();
    if (!logs.length) {
      wrap.innerHTML = '<p class="db-empty">No sent updates for this menu in the last 7 days.</p>';
      return;
    }
    wrap.innerHTML = buildChangeFeedHtml(logs);
  } catch(e) {
    wrap.innerHTML = '<p class="db-empty db-error">Failed to load recent changes.</p>';
  }
}

function renderUsersTab(users) {
  const wrap = document.getElementById('users-list');
  if (!users.length) {
    wrap.innerHTML = '<div class="db-empty">No accounts found.</div>';
    return;
  }
  const roleLabel = { none: 'No Access', manager: 'Manager', admin: 'Admin' };
  wrap.innerHTML = `
    <div class="admin-users-list">
      ${users.map(u => {
    const isSelf = u.id === currentUser?.uid;
    const parts = (u.name || u.email || '?').trim().split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (parts[0]?.slice(0, 2) || '?').toUpperCase();
    const statusLabel = isSelf ? 'Current Session' : (u.role === 'none' ? 'Pending Approval' : 'Active');
    const statusClass = isSelf ? 'admin-user-status-pill--current' : (u.role === 'none' ? 'admin-user-status-pill--pending' : 'admin-user-status-pill--active');

    // Role controls
    const roleControls = isSelf
      ? `<span class="user-mgmt-self-note">Your account — role locked</span>`
      : `<div class="admin-user-role-editor"><select id="user-role-${escHtml(u.id)}" class="user-mgmt-role-select" aria-label="Role for ${escHtml(u.name || u.email)}"
                 onchange="renderMenuAccessForUser('${escHtml(u.id)}')">
           <option value="none"    ${u.role === 'none'    ? 'selected' : ''}>No Access</option>
           <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option>
           <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>Admin</option>
         </select>
         <button class="btn-small" onclick="saveUserRole('${escHtml(u.id)}')">Save Role</button></div>`;

    // Menu access section (only for non-self users)
    const menuAccessSection = isSelf ? '' : `
      <div class="user-menu-access" id="user-menu-access-${escHtml(u.id)}">
        ${buildMenuAccessHTML(u)}
      </div>`;

    return `
      <details class="admin-user-card" ${u.role === 'none' && !isSelf ? 'open' : ''}>
        <summary class="admin-user-summary">
          <div class="admin-user-avatar">${escHtml(initials)}</div>
          <div class="admin-user-summary-info">
            <span class="admin-user-summary-name">${escHtml(u.name || u.email)}</span>
            <span class="admin-user-summary-meta">${escHtml(u.name ? u.email : '')}</span>
          </div>
          <span class="user-role-badge user-role-badge--${escHtml(u.role)}">${escHtml(roleLabel[u.role] || u.role)}</span>
          <span class="admin-user-status-pill ${statusClass}">${escHtml(statusLabel)}</span>
        </summary>
        <div class="admin-user-details">
          <div class="admin-user-detail-group">
            <label class="admin-user-detail-label" for="user-name-${escHtml(u.id)}">Display name</label>
            <div class="input-row admin-user-name-row">
              <input type="text" id="user-name-${escHtml(u.id)}" value="${escHtml(u.name)}" placeholder="Display name" aria-label="Display name for ${escHtml(u.email)}" />
              <button class="btn-small" onclick="saveUserName('${escHtml(u.id)}')">Save Name</button>
            </div>
          </div>
          <div class="admin-user-detail-group">
            <span class="admin-user-detail-label">Role</span>
            ${roleControls}
          </div>
          <div class="admin-user-detail-group">
            <span class="admin-user-detail-label">Menu access</span>
            ${menuAccessSection || '<p class="admin-user-access-note">This account always has access to the current session.</p>'}
          </div>
        </div>
      </details>`;
  }).join('')}
    </div>`;
}

function buildMenuAccessHTML(u) {
  const role = document.getElementById(`user-role-${u.id}`)?.value ?? u.role;
  if (role === 'admin') {
    return '<p class="admin-user-access-note">Admin access automatically spans all four menus.</p>';
  }
  if (role === 'none') return '<p class="admin-user-access-note">Approve this account and assign menus to activate manager access.</p>';
  // role === 'manager': show checkboxes for each menu
  const menus = window._adminMenuList || [];
  if (!menus.length) return '<p class="admin-user-access-note">No menus found.</p>';
  const checkboxes = menus.map(m => {
    const checked = (u.menuAccess || []).includes(m.id) ? 'checked' : '';
    return `<label class="user-menu-access-label">
      <input type="checkbox" class="user-menu-access-cb"
             data-user="${escHtml(u.id)}" data-menu="${escHtml(m.id)}" ${checked}/>
      ${escHtml(formatMenuDisplayName(m.name, m.type, m.restaurant_id))}
    </label>`;
  }).join('');
  return `<div class="user-menu-access-row">
    <div class="user-menu-access-grid">${checkboxes}</div>
    <button class="btn-small" onclick="saveMenuAccess('${escHtml(u.id)}')">Save Access</button>
  </div>`;
}

function renderMenuAccessForUser(userId) {
  const u = window._adminUserList?.find(u => u.id === userId);
  if (!u) return;
  const el = document.getElementById(`user-menu-access-${userId}`);
  if (el) el.innerHTML = buildMenuAccessHTML(u);
}

async function patchUser(payload) {
  const r = await fetch('/api/users', {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${currentUser?.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Request failed.');
  return r;
}

function updateUserRoleBadge(select, role) {
  const badge = select.closest('.config-card, .admin-user-row')?.querySelector('.user-role-badge');
  if (!badge) return;
  const label = { none: 'No Access', manager: 'Manager', admin: 'Admin' };
  badge.className = `user-role-badge user-role-badge--${role}`;
  badge.textContent = label[role] || role;
}

function updateAdminUserCache(userId, update) {
  const user = window._adminUserList?.find(u => u.id === userId);
  if (user) Object.assign(user, update);
}

async function saveUserRole(userId) {
  const select = document.getElementById(`user-role-${userId}`);
  if (!select) return;
  const role = select.value;
  try {
    await patchUser({ userId, role });
    showToast('Role updated.', 'success');
    updateAdminUserCache(userId, { role });
    updateUserRoleBadge(select, role);
    renderMenuAccessForUser(userId);
  } catch (e) {
    showToast(e.message || 'Network error.', 'error');
  }
}

async function saveMenuAccess(userId) {
  const checkboxes = document.querySelectorAll(`.user-menu-access-cb[data-user="${userId}"]`);
  const menuAccess = [...checkboxes].filter(cb => cb.checked).map(cb => cb.dataset.menu);
  try {
    await patchUser({ userId, menuAccess });
    updateAdminUserCache(userId, { menuAccess });
    showToast('Menu access updated.', 'success');
  } catch (e) {
    showToast(e.message || 'Network error.', 'error');
  }
}

async function saveUserName(userId) {
  const input = document.getElementById(`user-name-${userId}`);
  if (!input) return;
  try {
    await patchUser({ userId, name: input.value });
    updateAdminUserCache(userId, { name: input.value });
    showToast('Name updated.', 'success');
  } catch (e) {
    showToast(e.message || 'Network error.', 'error');
  }
}

function openInviteModal() {
  const url = MENU_URL || window.location.origin;
  const brand = formatMenuDisplayName(_activeMenuName, MENU_TYPE, RESTAURANT_ID) || _activeMenuName || 'the menu';
  const output = document.getElementById('invite-text-output');
  const modal = document.getElementById('invite-modal-bg');
  if (!output || !modal) return;
  output.value =
    `You've been invited to manage ${brand}!\n\nVisit ${url} and tap "Sign In" to create your account. Once you've signed up, ask an admin to approve your access.`;
  modal.classList.add('open');
}

function closeInviteModal() {
  document.getElementById('invite-modal-bg')?.classList.remove('open');
}

async function copyInviteText() {
  const output = document.getElementById('invite-text-output');
  if (!output) return;
  await navigator.clipboard.writeText(output.value);
  showToast('Copied!', 'success');
}

document.getElementById('invite-modal-bg')?.addEventListener('click', e => {
  if (e.target === document.getElementById('invite-modal-bg')) closeInviteModal();
});

// ─── FEATURED ITEMS ──────────────────────────────────────────────────────────

function getActiveRestaurantSpecialGroup() {
  return _featuredGroups[0] || null;
}

async function callRestaurantSpecialsApi(action, payload = {}) {
  const response = await fetch('/api/specials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentUser?.accessToken || ''}`,
    },
    body: JSON.stringify({
      action,
      restaurantId: RESTAURANT_ID,
      ...payload,
    }),
  });
  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function renderFeaturedTab() {
  const wrap = document.getElementById('featured-mgr-wrap');
  if (!wrap) return;
  if (!currentUserCanEditRestaurantSpecials()) {
    wrap.innerHTML = '';
    return;
  }
  const group = getActiveRestaurantSpecialGroup();
  const groupId = group?.id || '';
  const slotCount = group?.slots?.length || 0;
  const restaurantName = getRestaurantById(RESTAURANT_ID)?.name || 'this restaurant';
  const slotsHtml = slotCount
    ? group.slots.map((slot, idx) => {
        const description = isItemDescriptionPublic(slot.item) ? String(slot.item?.desc || '').trim() : '';
        const recipeText = isItemRecipePublic(slot.item) ? recipeArray(slot.item?.recipe).join(', ') : '';
        const upcharges = itemUpchargeArray(slot.item?.upcharges);
        const badges = [
          slot.item?.visibility === 'off_menu' ? '<span class="featured-special-tag">Off Menu</span>' : '',
          slot.item?.eightySixed ? '<span class="featured-special-tag featured-special-tag--danger">86\'D</span>' : '',
        ].filter(Boolean).join('');
        const priceHtml = slot.item?.price ? `<span class="featured-special-price">${escHtml(slot.item.price)}</span>` : '';
        const copyHtml = [
          description ? `<p class="featured-special-copy">${escHtml(description)}</p>` : '',
          recipeText ? `<p class="featured-special-copy featured-special-copy--muted">Recipe: ${escHtml(recipeText)}</p>` : '',
        ].join('');
        const upchargesHtml = upcharges.length
          ? `<div class="featured-special-upcharges">${upcharges.map(upcharge => `<span class="featured-special-upcharge">${escHtml(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${escHtml(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
          : '';
        return `<article class="featured-special-row" data-slot-id="${escHtml(slot.id)}">
          <div class="featured-special-row-head">
            <div class="featured-special-order">Slot ${idx + 1}</div>
            <div class="featured-special-actions">
              <button class="btn-small" onclick="moveFeaturedSlot(${escAttrJs(groupId)},${escAttrJs(slot.id)},-1)" ${idx === 0 ? 'disabled' : ''} aria-label="Move ${escHtml(slot.item?.name || 'special')} up">&#8593;</button>
              <button class="btn-small" onclick="moveFeaturedSlot(${escAttrJs(groupId)},${escAttrJs(slot.id)},1)" ${idx === slotCount - 1 ? 'disabled' : ''} aria-label="Move ${escHtml(slot.item?.name || 'special')} down">&#8595;</button>
              <button class="btn-small btn-danger" onclick="removeFeaturedSlot(${escAttrJs(slot.id)},${escAttrJs(groupId)})" aria-label="Remove ${escHtml(slot.item?.name || 'special')} from specials">&#215;</button>
            </div>
          </div>
          <div class="featured-special-name">
            <span class="item-name-static">${escHtml(slot.item?.name || '(deleted)')}</span>
            ${priceHtml}
            ${badges}
          </div>
          ${copyHtml}
          ${upchargesHtml}
          <label class="featured-sell-note-field">
            <span class="desc-field-label">Sell note</span>
            <input class="featured-sell-note-input" type="text" placeholder="Sell note for staff…"
              aria-label="Sell note for ${escHtml(slot.item?.name || 'special')}"
              value="${escHtml(slot.sellNote)}"
              onblur="saveFeaturedSellNote(${escAttrJs(slot.id)},this.value)"/>
          </label>
        </article>`;
      }).join('')
    : `<div class="empty-state"><span class="empty-state-icon">+</span><span>No specials yet. Add up to five items for ${escHtml(restaurantName)}.</span></div>`;

  const inputKey = groupId || 'pending';
  wrap.innerHTML = `<div class="featured-specials-editor">
    <div class="featured-specials-head">
      <div>
        <p class="settings-section-kicker">Shared across both menus</p>
        <h4>${escHtml(getRestaurantSpecialLabel(RESTAURANT_ID))}</h4>
        <p class="featured-specials-copy">Build a clean featured lineup for ${escHtml(restaurantName)} and keep the order guests should see first.</p>
      </div>
      <span class="featured-count">${slotCount} / 5 live</span>
    </div>
    ${slotCount < 5 ? `
      <div class="featured-specials-composer">
        <div class="add-item-wrap featured-special-add">
          <div class="add-item-area">
            <input type="text" class="add-item-input featured-add-input" id="featured-add-${escHtml(inputKey)}"
              placeholder="Search items to add to featured…"
              oninput="filterFeaturedPicker(${escAttrJs(groupId)},this.value)"
              onblur="setTimeout(()=>filterFeaturedPicker(${escAttrJs(groupId)},''),150)"
              onkeydown="handleFeaturedAddKeydown(event,${escAttrJs(groupId)})"/>
            <button class="add-item-btn" onclick="addFeaturedSlotFromInput(${escAttrJs(groupId)})" aria-label="Add item to ${escHtml(getRestaurantSpecialLabel(RESTAURANT_ID))}">+</button>
          </div>
          <div class="featured-picker-list" id="featured-picker-${escHtml(inputKey)}"></div>
        </div>
      </div>` : ''}
    <div class="featured-specials-list">${slotsHtml}</div>
  </div>`;
}

function getFeatureableMatches(groupId, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const group = _featuredGroups.find(g => g.id === groupId) || getActiveRestaurantSpecialGroup();
  const existingItemIds = new Set((group?.slots || []).map(s => s.itemId));
  return getRestaurantSpecialsCatalog()
    .filter(item =>
      item.onMenu !== false &&
      !existingItemIds.has(item.id) &&
      String(item.name || '').toLowerCase().includes(q)
    )
    .slice(0, 8);
}

function filterFeaturedPicker(groupId, query) {
  const listId = 'featured-picker-' + (groupId || 'pending');
  const list = document.getElementById(listId);
  if (!list) return;
  if (!currentUserCanEditRestaurantSpecials()) {
    list.innerHTML = '';
    return;
  }
  const matches = getFeatureableMatches(groupId, query);
  if (!query.trim()) { list.innerHTML = ''; return; }
  list.innerHTML = matches.map(m =>
    `<div class="featured-picker-item" onmousedown="addFeaturedSlot(${escAttrJs(groupId)},${escAttrJs(m.id)})">
      ${escHtml(m.name)} <span class="featured-picker-cat">${escHtml(`${m.menuLabel} · ${m.cat}`)}</span>
      ${m.visibility === 'off_menu' ? '<span class="featured-picker-offmenu">off-menu</span>' : ''}
    </div>`
  ).join('') || '<div class="featured-picker-empty">No matches</div>';
}

function handleFeaturedAddKeydown(event, groupId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addFeaturedSlotFromInput(groupId);
    return;
  }
  if (event.key === 'Escape') filterFeaturedPicker(groupId, '');
}

async function addFeaturedSlotFromInput(groupId) {
  const inputId = 'featured-add-' + (groupId || 'pending');
  const input = document.getElementById(inputId);
  if (!input) return;
  const query = input.value.trim();
  if (!query) return;
  const matches = getFeatureableMatches(groupId, query);
  if (!matches.length) {
    showToast('No matching items found for specials.', 'info');
    return;
  }
  const exactMatch = matches.find(match => match.name.trim().toLowerCase() === query.toLowerCase());
  await addFeaturedSlot(groupId, (exactMatch || matches[0]).id);
}

async function addFeaturedSlot(groupId, itemId) {
  if (!currentUserCanEditRestaurantSpecials()) {
    showToast('Specials require access to both menus for this restaurant.', 'error');
    return;
  }
  try {
    const existingGroup = _featuredGroups.find(g => g.id === groupId) || getActiveRestaurantSpecialGroup();
    const slotCount = existingGroup?.slots?.length || 0;
    if (slotCount >= 5) { showToast('Max 5 specials per restaurant.', 'info'); return; }
    if ((existingGroup?.slots || []).some(slot => slot.itemId === itemId)) {
      showToast('That item is already in specials.', 'info');
      return;
    }
    await callRestaurantSpecialsApi('add', { itemId });
    await refreshFeaturedForActiveMenu();
    renderFeaturedTab();
    renderPublicView();
    invalidateDiff();
    updateDraftIndicator();
    const input = document.getElementById('featured-add-' + (groupId || 'pending'));
    if (input) input.value = '';
    filterFeaturedPicker(groupId, '');
    showToast('Special added!', 'success');
  } catch(e) { showToast('Failed to add special.', 'error'); }
}

async function removeFeaturedSlot(slotId, groupId) {
  if (!currentUserCanEditRestaurantSpecials()) {
    showToast('Specials require access to both menus for this restaurant.', 'error');
    return;
  }
  try {
    await callRestaurantSpecialsApi('remove', { slotId });
    await refreshFeaturedForActiveMenu();
    renderFeaturedTab();
    renderPublicView();
    invalidateDiff();
    updateDraftIndicator();
    showToast('Special removed.', 'success');
  } catch(e) { showToast('Failed to remove.', 'error'); }
}

async function saveFeaturedSellNote(slotId, note) {
  if (!currentUserCanEditRestaurantSpecials()) return;
  try {
    await callRestaurantSpecialsApi('note', { slotId, note });
  } catch(e) {}
}

async function moveFeaturedSlot(groupId, slotId, direction) {
  if (!currentUserCanEditRestaurantSpecials()) {
    showToast('Specials require access to both menus for this restaurant.', 'error');
    return;
  }
  const group = _featuredGroups.find(g => g.id === groupId) || getActiveRestaurantSpecialGroup();
  if (!group) return;
  const idx = group.slots.findIndex(s => s.id === slotId);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= group.slots.length) return;
  try {
    await callRestaurantSpecialsApi('move', { slotId, direction });
    await refreshFeaturedForActiveMenu();
    renderFeaturedTab();
    renderPublicView();
  } catch(e) { showToast('Failed to reorder.', 'error'); }
}

// ─── FEATURED DAILY CONFIRMATION ─────────────────────────────────────────────

function _needsFeaturedConfirmation() {
  if (!currentUserCanEditRestaurantSpecials()) return false;
  if (sessionStorage.getItem(getFeaturedConfirmationKey())) return false;
  if (!_featuredGroups.some(g => g.slots.length)) return false;
  return _featuredGroups.some(g => g.slots.some(s => {
    if (!s.confirmedAt) return true;
    const confirmed = new Date(s.confirmedAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return confirmed < today;
  }));
}

function checkFeaturedConfirmation() {
  updateManagerActionBar();
}

async function confirmFeaturedToday() {
  if (!currentUserCanEditRestaurantSpecials()) {
    showToast('Specials require access to both menus for this restaurant.', 'error');
    return;
  }
  try {
    await callRestaurantSpecialsApi('confirm');
    sessionStorage.setItem(getFeaturedConfirmationKey(), '1');
    updateManagerActionBar();
    showToast('Specials confirmed for today!', 'success');
  } catch(e) { showToast('Failed to confirm.', 'error'); }
}

function editFeaturedFromBanner() {
  if (!currentUserCanEditRestaurantSpecials()) return;
  sessionStorage.setItem(getFeaturedConfirmationKey(), '1');
  updateManagerActionBar();
  const overviewTrigger = document.querySelector('.settings-rail-btn[data-target="manager-overview-section"]');
  focusSettingsSection('manager-overview-section', overviewTrigger || null);
  requestAnimationFrame(() => {
    const featuredCard = document.getElementById('manager-featured-overview-card');
    if (!featuredCard) return;
    featuredCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      document.querySelector('#featured-mgr-wrap .featured-add-input')?.focus();
    }, 180);
  });
}

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
function switchManagerTab(name) {
  if (name === 'edit-menu' || name === 'edit-items') {
    renderManagerCategories();
    _activeManagerSection = 'manager-items-section';
    focusSettingsSection('manager-items-section');
  }
  if (name === 'edit-pricing') {
    renderPricingSection();
    _activeManagerSection = 'manager-pricing-section';
    focusSettingsSection('manager-pricing-section');
  }
  if (name === 'edit-description') {
    renderDescriptionSection();
    _activeManagerSection = 'manager-description-section';
    focusSettingsSection('manager-description-section');
  }
  if (name === 'categories') {
    renderCategoriesTab();
    updateManagerToolsContext();
    focusSettingsSection('manager-categories-section');
  }
  if (name === 'database') {
    renderDatabaseTab();
    renderPruneSection();
    focusSettingsSection('manager-database-section');
  }
}

function switchAdminTab(name) {
  if (name === 'admin-restaurants') {
    renderMenusPanel();
    focusSettingsSection('admin-restaurants-section');
  }
  if (name === 'admin-notifications') {
    initAdminSwitcherTab('notif');
    focusSettingsSection('admin-notifications-section');
  }
  if (name === 'admin-users') {
    loadUsers();
    focusSettingsSection('admin-users-section');
  }
}

const dbFilters = { recipe: 'all', status: 'all' };

function setDbFilter(key, value) {
  dbFilters[key] = value;
  document.querySelectorAll(`#db-filter-${key} .db-filter-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
  renderDatabaseTab();
}

function buildDatabaseRows() {
  const rows = [];
  let totalItems = 0;

  CATEGORY_DEFS.forEach(cat => {
    const all = (menuState[cat.id]?.items || []);
    totalItems += all.length;
    all.forEach(item => {
      rows.push({
        name: item.name,
        category: cat.title,
        recipe: recipeArray(item.recipe),
        onMenu: item.onMenu,
        eightySixed: !!item.eightySixed,
      });
    });
  });
  (menuState[UNCATEGORIZED_ID]?.items || []).forEach(item => {
    rows.push({
      name: item.name,
      category: 'Uncategorized',
      recipe: recipeArray(item.recipe),
      onMenu: false,
      eightySixed: false,
    });
    totalItems++;
  });
  return { rows, totalItems };
}

function filterDatabaseRows(rows, query) {
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
  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

function buildDatabaseTableHtml(rows) {
  return `
    <table class="db-table">
      <thead><tr><th>Item</th><th>Category</th><th>Recipe</th><th>Status</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td class="db-name" data-label="Item">${escHtml(r.name)}</td>
          <td class="db-cat" data-label="Category">${escHtml(r.category)}</td>
          <td class="db-recipe" data-label="Recipe">${r.recipe.length ? r.recipe.map(ing => `<span class="db-ing">${escHtml(ing)}</span>`).join('') : '<span class="db-no-recipe">—</span>'}</td>
          <td data-label="Status">${r.eightySixed ? '<span class="db-badge db-badge--86">86\'d</span>' : r.onMenu ? '<span class="db-badge db-badge--on">On Menu</span>' : '<span class="db-badge db-badge--off">Off Menu</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderDatabaseTab() {
  const wrap = document.getElementById('db-table-wrap');
  try {
    const query = (document.getElementById('db-search').value || '').toLowerCase().trim();
    const { rows, totalItems } = buildDatabaseRows();
    const filtered = filterDatabaseRows(rows, query);

    if (!filtered.length) {
      wrap.innerHTML = totalItems === 0
        ? '<p class="db-empty">No menu items loaded.</p>'
        : '<p class="db-empty">No items match the current filters.</p>';
      return;
    }

    wrap.innerHTML = buildDatabaseTableHtml(filtered);
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

async function fetchRestaurantMenuIndex() {
  const [restRes, menuRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/restaurants?id=in.(${KNOWN_RESTAURANT_ORDER.join(',')})&select=id,name,slug,use_custom_design&order=name.asc`, { headers: sbHeaders() }),
    fetch(`${SUPABASE_URL}/rest/v1/menus?id=in.(${KNOWN_MENU_ORDER.join(',')})&select=id,name,slug,type,archived,restaurant_id&order=name.asc`, { headers: sbHeaders() }),
  ]);
  if (!restRes.ok || !menuRes.ok) throw new Error('fetch failed');
  const restaurants = sortKnownRestaurants(await restRes.json());
  const allMenus = sortKnownMenus(await menuRes.json());
  _adminRestaurants = restaurants;
  _adminAllMenus = allMenus;
  return { restaurants, allMenus };
}

function groupMenusByRestaurant(allMenus) {
  return allMenus.reduce((acc, menu) => {
    if (!acc[menu.restaurant_id]) acc[menu.restaurant_id] = [];
    acc[menu.restaurant_id].push(menu);
    return acc;
  }, {});
}

function buildMenuChipHtml(menu) {
  return `<div class="menu-chip${menu.archived ? ' is-archived' : ''}" id="menu-chip-${escHtml(menu.id)}">
    <span>${escHtml(formatMenuDisplayName(menu.name, menu.type, menu.restaurant_id))}</span>
    <span class="menu-type-badge">${escHtml(getMenuTypeLabel(menu.type))}</span>
    ${menu.archived ? '<span class="menu-type-badge">archived</span>' : ''}
  </div>`;
}

function buildRestaurantRowHtml(restaurant, menus) {
  const chipsHtml = menus.map(buildMenuChipHtml).join('');
  return `
    <div class="restaurant-header">
      <div>
        <p class="restaurant-kicker">Restaurant</p>
        <span class="restaurant-name" id="restaurant-name-${escHtml(restaurant.id)}">${escHtml(restaurant.name)}</span>
      </div>
      <span class="restaurant-summary-pill">${escHtml(String(menus.length).padStart(2, '0'))} Menu${menus.length === 1 ? '' : 's'}</span>
    </div>
    <p class="restaurant-copy">Drinks and Food menus for this location.</p>
    <div class="restaurant-menus" id="restaurant-menus-${escHtml(restaurant.id)}">
      ${chipsHtml || '<span style="font-size:12px;color:var(--muted)">Expected menus are missing from the database.</span>'}
    </div>`;
}

async function renderMenusPanel() {
  const listEl = document.getElementById('menus-mgmt-list');
  if (!listEl) return;
  listEl.innerHTML = '<p class="db-empty">Loading…</p>';
  try {
    const { restaurants, allMenus } = await fetchRestaurantMenuIndex();
    const byRestaurant = groupMenusByRestaurant(allMenus);
    if (!restaurants.length) {
      listEl.innerHTML = '<p class="db-empty">The hardcoded restaurants are missing from the database.</p>';
      return;
    }
    listEl.innerHTML = '';
    knownRestaurantList().forEach(knownRestaurant => {
      const restaurant = restaurants.find(r => r.id === knownRestaurant.id) || knownRestaurant;
      const menus = sortKnownMenus(byRestaurant[knownRestaurant.id] || []);
      const row = document.createElement('div');
      row.className = 'restaurant-row';
      row.id = 'restaurant-row-' + escHtml(knownRestaurant.id);
      row.innerHTML = buildRestaurantRowHtml(restaurant, menus);
      listEl.appendChild(row);
    });
  } catch(e) {
    listEl.innerHTML = `<p class="db-empty db-error">Failed to load restaurants: ${escHtml(String(e))}</p>`;
  }
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
