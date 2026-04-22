// ─── CONFIG ───────────────────────────────────────────────────────────────────
const FALLBACK_DOMAIN_CONSTANTS = buildFallbackDomainConstants();
const DOMAIN_CONSTANTS = (globalThis.__HF_DOMAIN_CONSTANTS__ && typeof globalThis.__HF_DOMAIN_CONSTANTS__ === 'object')
  ? globalThis.__HF_DOMAIN_CONSTANTS__
  : FALLBACK_DOMAIN_CONSTANTS;
const APP_VERSION = DOMAIN_CONSTANTS.APP_VERSION || FALLBACK_DOMAIN_CONSTANTS.APP_VERSION;
const RESTAURANTS = DOMAIN_CONSTANTS.RESTAURANTS || FALLBACK_DOMAIN_CONSTANTS.RESTAURANTS;
const MENUS = DOMAIN_CONSTANTS.MENUS || FALLBACK_DOMAIN_CONSTANTS.MENUS;
const IS_PREVIEW = (window.location.hostname.endsWith('.vercel.app') &&
  window.location.hostname !== 'el-roys-drink-menu.vercel.app') ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';
const PREVIEW_AUDIT_SESSION_ENDPOINT = '/api/auth';

const LS_KEYS = {
  menuId:       'hf_menu_id',
  menuUrl:      'hf_menu_url',
  menuCache:    'hf_menu_cache',
  menuDraftClientId: 'hf_menu_draft_client_id',
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
let _accessSessionService = null;
let _restaurantSpecialsService = null;
let _publicRenderCoordinator = null;
let _menuPollScheduler = null;
let _menuFallbackStore = null;
let _menuLinkResolver = null;
let _featuredViewPolicy = null;
const _sessionModuleDelegationStack = new Set();
const _authModuleDelegationStack = new Set();
let _authOverlayController = null;
let _authTriggerDelegated = false;
const _uiModuleDelegationStack = new Set();
let _managerWorkspaceService = null;
let _managerSectionService = null;
let _managerEditorsService = null;
let _adminWorkspaceService = null;
let _adminSwitcherService = null;
let _publicFooterActionsService = null;
let _publicRendererService = null;
let _managerEditorsBase = null;
let _adminSwitcherBase = null;
let _publicRendererBase = null;
let _landingPageState = null;
let _landingPageDirty = false;
let _landingPageLoadPromise = null;
let _landingPageLoadError = '';
let _activeLandingAdminPanel = 'landing-admin-panel-overview';
let _landingAdminFilters = null;
let _landingReviewCarouselIndex = 0;
let _previewAuditAvailability = { manager: null, admin: null };
let _previewAuditAvailabilityPromise = { manager: null, admin: null };

let _featuredGroups = []; // [{id, name, displayOrder, slots: [{id, itemId, sellNote, displayOrder, confirmedAt, confirmedBy, item: {…}}]}]
let _lastSentFeaturedIds = new Set(); // item IDs that were featured at the last live publish
let _restaurantSpecialsSiblingCatalog = [];
let _workspaceRestaurantToolsReadable = false;

// ─── CATEGORY DEFINITIONS ────────────────────────────────────────────────────
const FALLBACK_ICON_COLOR_PALETTE = [
  'rgba(245,210,66,0.22)',
  'rgba(18,133,120,0.15)',
  'rgba(100,180,255,0.18)',
  'rgba(190,67,48,0.12)',
  'rgba(140,200,120,0.18)',
  'rgba(180,100,220,0.15)',
  'rgba(255,150,100,0.18)',
  'rgba(100,200,220,0.18)',
];
const CATEGORY_DEFAULTS = (globalThis.__HF_CATEGORY_DEFAULTS__ && typeof globalThis.__HF_CATEGORY_DEFAULTS__ === 'object')
  ? globalThis.__HF_CATEGORY_DEFAULTS__
  : {};
const ICON_COLOR_PALETTE = Array.isArray(CATEGORY_DEFAULTS.ICON_COLOR_PALETTE) && CATEGORY_DEFAULTS.ICON_COLOR_PALETTE.length
  ? CATEGORY_DEFAULTS.ICON_COLOR_PALETTE.map(String)
  : FALLBACK_ICON_COLOR_PALETTE.slice();
const DEFAULT_CATEGORY_DEFS = Array.isArray(CATEGORY_DEFAULTS.DEFAULT_CATEGORY_DEFS) && CATEGORY_DEFAULTS.DEFAULT_CATEGORY_DEFS.length
  ? CATEGORY_DEFAULTS.DEFAULT_CATEGORY_DEFS.map(def => ({ ...def }))
  : buildDefaultCategoryDefs(ICON_COLOR_PALETTE);
const DEFAULT_FOOD_CATEGORY_DEFS = Array.isArray(CATEGORY_DEFAULTS.DEFAULT_FOOD_CATEGORY_DEFS) && CATEGORY_DEFAULTS.DEFAULT_FOOD_CATEGORY_DEFS.length
  ? CATEGORY_DEFAULTS.DEFAULT_FOOD_CATEGORY_DEFS.map(def => ({ ...def }))
  : buildDefaultFoodCategoryDefs(ICON_COLOR_PALETTE);

let CATEGORY_DEFS = DEFAULT_CATEGORY_DEFS.map(c => ({...c}));

const KNOWN_RESTAURANT_ORDER = Array.isArray(DOMAIN_CONSTANTS.KNOWN_RESTAURANT_ORDER) && DOMAIN_CONSTANTS.KNOWN_RESTAURANT_ORDER.length
  ? DOMAIN_CONSTANTS.KNOWN_RESTAURANT_ORDER.slice()
  : FALLBACK_DOMAIN_CONSTANTS.KNOWN_RESTAURANT_ORDER.slice();
const KNOWN_MENU_ORDER = Array.isArray(DOMAIN_CONSTANTS.KNOWN_MENU_ORDER) && DOMAIN_CONSTANTS.KNOWN_MENU_ORDER.length
  ? DOMAIN_CONSTANTS.KNOWN_MENU_ORDER.slice()
  : FALLBACK_DOMAIN_CONSTANTS.KNOWN_MENU_ORDER.slice();
const RESTAURANT_SPECIALS = DOMAIN_CONSTANTS.RESTAURANT_SPECIALS || FALLBACK_DOMAIN_CONSTANTS.RESTAURANT_SPECIALS;
const LEGACY_MENU_SLUG_ALIASES = DOMAIN_CONSTANTS.LEGACY_MENU_SLUG_ALIASES || FALLBACK_DOMAIN_CONSTANTS.LEGACY_MENU_SLUG_ALIASES;
const SITE_PATHS = DOMAIN_CONSTANTS.SITE_PATHS || FALLBACK_DOMAIN_CONSTANTS.SITE_PATHS;
const SHARED_PAGE_PATHS = DOMAIN_CONSTANTS.SHARED_PAGE_PATHS || FALLBACK_DOMAIN_CONSTANTS.SHARED_PAGE_PATHS;
const RESTAURANT_TIME_ZONE = DOMAIN_CONSTANTS.RESTAURANT_TIME_ZONE || FALLBACK_DOMAIN_CONSTANTS.RESTAURANT_TIME_ZONE || 'America/Detroit';
const REDIRECT_NOTICE_KEY = 'hf_redirect_notice';
const LANDING_PAGE_STATE_ID = 'root';
const LANDING_PAGE_SECTION_ORDER = ['overview', 'hours', 'events', 'news', 'reviews'];
const LANDING_PAGE_SECTION_LABELS = {
  overview: 'Overview',
  hours: 'Hours',
  events: 'Events',
  news: 'News',
  reviews: 'Reviews',
};
const LANDING_DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LANDING_DAY_LABELS = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
const LANDING_TARGET_BOTH = 'both';
const LANDING_IMPORT_STATUS_IDLE = 'idle';
const LANDING_IMPORT_STATUS_IMPORTED = 'imported';
const LANDING_IMPORT_STATUS_PARTIAL = 'partial';
const LANDING_IMPORT_STATUS_FAILED = 'failed';
const LANDING_ITEM_STATUS_LIVE = 'Live';
const LANDING_ITEM_STATUS_DRAFT = 'Draft';
const LANDING_ITEM_STATUS_MISSING = 'Missing Fields';
const LANDING_ITEM_STATUS_ARCHIVED = 'ARCHIVED';
const LANDING_FILTER_STORAGE_KEY = 'hf_landing_admin_filters';

function buildFallbackDomainConstants() {
  const restaurants = {
    LEROYS: { id: '00000000-0000-0000-0000-000000000010', name: "Leroy's Lounge", slug: 'leroys-lounge' },
    ELROYS: { id: '00000000-0000-0000-0000-000000000001', name: "El Roy's Cantina", slug: 'el-roys-cantina' },
  };
  const menus = {
    LEROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000020', restaurantId: restaurants.LEROYS.id, type: 'drinks', slug: 'leroys-lounge-drinks', name: "Leroy's Lounge Drinks" },
    LEROYS_FOOD: { id: '00000000-0000-0000-0000-000000000021', restaurantId: restaurants.LEROYS.id, type: 'food', slug: 'leroys-lounge-food', name: "Leroy's Lounge Food" },
    ELROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000002', restaurantId: restaurants.ELROYS.id, type: 'drinks', slug: 'el-roys-cantina-drinks', name: "El Roy's Cantina Drinks" },
    ELROYS_FOOD: { id: '00000000-0000-0000-0000-000000000003', restaurantId: restaurants.ELROYS.id, type: 'food', slug: 'el-roys-cantina-food', name: "El Roy's Cantina Food" },
  };
  return {
    APP_VERSION: 'v0.8.9',
    RESTAURANT_TIME_ZONE: 'America/Detroit',
    RESTAURANTS: restaurants,
    MENUS: menus,
    KNOWN_RESTAURANT_ORDER: [restaurants.LEROYS.id, restaurants.ELROYS.id],
    KNOWN_MENU_ORDER: [menus.LEROYS_DRINKS.id, menus.LEROYS_FOOD.id, menus.ELROYS_DRINKS.id, menus.ELROYS_FOOD.id],
    RESTAURANT_SPECIALS: {
      [restaurants.LEROYS.id]: {
        canonicalId: 'leroyslounge-specials',
        name: "Leroy's Specials",
        menuIds: [menus.LEROYS_DRINKS.id, menus.LEROYS_FOOD.id],
      },
      [restaurants.ELROYS.id]: {
        canonicalId: 'elroyscantina-specials',
        name: "El Roy's Specials",
        menuIds: [menus.ELROYS_DRINKS.id, menus.ELROYS_FOOD.id],
      },
    },
    LEGACY_MENU_SLUG_ALIASES: {
      'el-roys': menus.ELROYS_DRINKS.slug,
    },
    SITE_PATHS: {
      [restaurants.LEROYS.id]: '/leroyslounge',
      [restaurants.ELROYS.id]: '/elroyscantina',
    },
    SHARED_PAGE_PATHS: {
      manager: '/manager',
      admin: '/admin',
    },
  };
}

function colorAt(palette, index) {
  return palette[index] || FALLBACK_ICON_COLOR_PALETTE[index] || FALLBACK_ICON_COLOR_PALETTE[0];
}

function buildDefaultCategoryDefs(palette) {
  return [
    { id: 'featured_specials', icon: '⭐', color: colorAt(palette, 3), title: 'Featured Specials', sub: 'Limited pours, specials, and deal items', placeholder: 'e.g. Happy Hour Margarita...', untappdEnabled: false },
    { id: 'beer', icon: '🍺', color: colorAt(palette, 0), title: 'Beers on Tap', sub: 'Current draft offerings', placeholder: 'e.g. Modelo Especial...', untappdEnabled: false },
    { id: 'canned', icon: '🍻', color: colorAt(palette, 4), title: 'Canned & Bottled', sub: 'Canned & bottled offerings', placeholder: 'e.g. Modelo Especial (can), Topo Chico...', untappdEnabled: false },
    { id: 'cocktails', icon: '🍹', color: colorAt(palette, 5), title: 'Cocktails', sub: 'Craft cocktail offerings', placeholder: 'e.g. Paloma, Spicy Margarita...', untappdEnabled: false },
    { id: 'tequila', icon: '🌶️', color: colorAt(palette, 1), title: 'Infused Tequila', sub: 'Rotating infused marg tequila', placeholder: 'e.g. Jalapeño-Pineapple Blanco...', untappdEnabled: false },
    { id: 'frozen', icon: '🧊', color: colorAt(palette, 2), title: 'Frozen Marg', sub: 'Current frozen margarita flavor', placeholder: 'e.g. Strawberry Basil...', untappdEnabled: false },
  ];
}

function buildDefaultFoodCategoryDefs(palette) {
  return [
    { key: 'featured_specials', label: '⭐ Featured Specials', icon: '⭐', color: colorAt(palette, 3), sub: 'Limited dishes and deal items', placeholder: 'e.g. Taco Tuesday Plate...', untappdEnabled: false },
    { key: 'starters', label: '🥗 Starters', icon: '🥗', color: colorAt(palette, 4), sub: '', placeholder: 'e.g. Chips & Salsa...', untappdEnabled: false },
    { key: 'tacos', label: '🌮 Tacos', icon: '🌮', color: colorAt(palette, 0), sub: '', placeholder: 'e.g. Al Pastor...', untappdEnabled: false },
    { key: 'entrees', label: '🍽 Entrees', icon: '🍽', color: colorAt(palette, 1), sub: '', placeholder: 'e.g. Enchiladas...', untappdEnabled: false },
    { key: 'sides', label: '🫘 Sides', icon: '🫘', color: colorAt(palette, 2), sub: '', placeholder: 'e.g. Mexican Rice...', untappdEnabled: false },
    { key: 'desserts', label: '🍮 Desserts', icon: '🍮', color: colorAt(palette, 3), sub: '', placeholder: 'e.g. Flan...', untappdEnabled: false },
  ];
}

const FEATURED_SPECIALS_CATEGORY_ID = (globalThis.__HF_FEATURED_SPECIALS__ || {}).FEATURED_SPECIALS_CATEGORY_ID || 'featured_specials';

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

function resetMenuStateToDefaults() {
  menuState = defaultState();
  currentDesign = { ...DESIGN_DEFAULTS };
  _restaurantCustomDesignEnabled = true;
}

function setMenuDirtyFlag(value) {
  _dirty = !!value;
}

function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// Escape a string for safe embedding inside an inline JS string within an HTML attribute.
// Uses JSON.stringify (which handles quotes/backslashes) then HTML-escapes the result.
function escAttrJs(s) { return escHtml(JSON.stringify(String(s))); }
function cloneJsonCompatible(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch (_) {
    return JSON.parse(JSON.stringify(fallback));
  }
}
function knownLandingRestaurants() {
  return Object.values(RESTAURANTS).sort((a, b) => KNOWN_RESTAURANT_ORDER.indexOf(a.id) - KNOWN_RESTAURANT_ORDER.indexOf(b.id));
}
function createDefaultLandingDay() {
  return { closed: true, open: '', close: '' };
}
function createDefaultLandingHoursRestaurant() {
  const days = {};
  LANDING_DAY_ORDER.forEach(dayKey => {
    days[dayKey] = createDefaultLandingDay();
  });
  return { days };
}
function createDefaultLandingImportMeta(sourceUrl = '') {
  return {
    sourceUrl: sourceUrl ? String(sourceUrl) : '',
    lastAttemptTs: '',
    lastSuccessTs: '',
    status: LANDING_IMPORT_STATUS_IDLE,
    messages: [],
  };
}
function createDefaultLandingEventItem() {
  return {
    id: uid(),
    target: LANDING_TARGET_BOTH,
    title: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    timingNote: '',
    body: '',
    archived: false,
    archivedAt: '',
    updatedAt: '',
  };
}
function createDefaultLandingNewsItem() {
  return {
    id: uid(),
    target: LANDING_TARGET_BOTH,
    title: '',
    body: '',
    href: '',
    source: '',
    publishedDate: '',
    imageUrl: '',
    archived: false,
    archivedAt: '',
    updatedAt: '',
    importMeta: createDefaultLandingImportMeta(),
  };
}
function createDefaultLandingReviewItem() {
  return {
    id: uid(),
    href: '',
    author: '',
    quote: '',
    source: 'Google Review',
    rating: '',
    archived: false,
    archivedAt: '',
    updatedAt: '',
    importMeta: createDefaultLandingImportMeta(),
  };
}
function createDefaultLandingContent() {
  const restaurants = {};
  const reviewRestaurants = {};
  knownLandingRestaurants().forEach(restaurant => {
    restaurants[restaurant.id] = createDefaultLandingHoursRestaurant();
    reviewRestaurants[restaurant.id] = [];
  });
  return {
    overview: {},
    hours: { restaurants },
    events: { items: [] },
    news: { items: [] },
    reviews: { restaurants: reviewRestaurants },
  };
}
function createDefaultLandingPageRecord() {
  const content = createDefaultLandingContent();
  return {
    id: LANDING_PAGE_STATE_ID,
    draftContent: cloneJsonCompatible(content, content),
    liveContent: cloneJsonCompatible(content, content),
    draftSavedTs: '',
    livePublishedTs: '',
  };
}
function normalizeLandingTimestamp(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? String(num) : '';
}
function normalizeLandingDay(rawDay = {}) {
  const closed = !!rawDay?.closed;
  const open = normalizeLandingTimeValue(rawDay?.open);
  const close = normalizeLandingTimeValue(rawDay?.close);
  return {
    closed,
    open: closed ? '' : open,
    close: closed ? '' : close,
  };
}
function normalizeLandingHoursRestaurant(rawRestaurant = {}) {
  const days = {};
  LANDING_DAY_ORDER.forEach(dayKey => {
    days[dayKey] = normalizeLandingDay(rawRestaurant?.days?.[dayKey]);
  });
  return { days };
}
function normalizeLandingTarget(value = '', options = {}) {
  const { allowBoth = true, fallback = allowBoth ? LANDING_TARGET_BOTH : knownLandingRestaurants()[0]?.id || '' } = options;
  const candidate = value ? String(value) : '';
  if (allowBoth && candidate === LANDING_TARGET_BOTH) return LANDING_TARGET_BOTH;
  if (candidate && knownLandingRestaurants().some(restaurant => restaurant.id === candidate)) return candidate;
  return fallback;
}
function normalizeLandingImportMeta(rawMeta = {}) {
  const status = [
    LANDING_IMPORT_STATUS_IDLE,
    LANDING_IMPORT_STATUS_IMPORTED,
    LANDING_IMPORT_STATUS_PARTIAL,
    LANDING_IMPORT_STATUS_FAILED,
  ].includes(rawMeta?.status)
    ? rawMeta.status
    : LANDING_IMPORT_STATUS_IDLE;
  const rawMessages = Array.isArray(rawMeta?.messages)
    ? rawMeta.messages
    : (rawMeta?.message ? [rawMeta.message] : []);
  return {
    sourceUrl: rawMeta?.sourceUrl ? String(rawMeta.sourceUrl) : '',
    lastAttemptTs: normalizeLandingTimestamp(rawMeta?.lastAttemptTs),
    lastSuccessTs: normalizeLandingTimestamp(rawMeta?.lastSuccessTs),
    status,
    messages: rawMessages.map(message => String(message || '')).filter(Boolean),
  };
}
function normalizeLandingEventItem(rawItem = {}) {
  return {
    id: rawItem?.id ? String(rawItem.id) : uid(),
    target: normalizeLandingTarget(rawItem?.target, { allowBoth: true }),
    title: rawItem?.title ? String(rawItem.title) : '',
    eventDate: rawItem?.eventDate ? String(rawItem.eventDate) : '',
    startTime: normalizeLandingTimeValue(rawItem?.startTime),
    endTime: normalizeLandingTimeValue(rawItem?.endTime),
    timingNote: rawItem?.timingNote ? String(rawItem.timingNote) : '',
    body: rawItem?.body ? String(rawItem.body) : '',
    archived: !!rawItem?.archived,
    archivedAt: normalizeLandingTimestamp(rawItem?.archivedAt),
    updatedAt: normalizeLandingTimestamp(rawItem?.updatedAt),
  };
}
function normalizeLandingNewsItem(rawItem = {}) {
  return {
    id: rawItem?.id ? String(rawItem.id) : uid(),
    target: normalizeLandingTarget(rawItem?.target, { allowBoth: true }),
    title: rawItem?.title ? String(rawItem.title) : '',
    body: rawItem?.body ? String(rawItem.body) : '',
    href: rawItem?.href ? String(rawItem.href) : '',
    source: rawItem?.source ? String(rawItem.source) : '',
    publishedDate: rawItem?.publishedDate ? String(rawItem.publishedDate) : (rawItem?.publishedAt ? String(rawItem.publishedAt) : ''),
    imageUrl: rawItem?.imageUrl ? String(rawItem.imageUrl) : '',
    archived: !!rawItem?.archived,
    archivedAt: normalizeLandingTimestamp(rawItem?.archivedAt),
    updatedAt: normalizeLandingTimestamp(rawItem?.updatedAt),
    importMeta: normalizeLandingImportMeta(rawItem?.importMeta || {}),
  };
}
function normalizeLandingReviewItem(rawItem = {}) {
  const rating = Number(rawItem?.rating);
  const normalizedRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : '';
  return {
    id: rawItem?.id ? String(rawItem.id) : uid(),
    href: rawItem?.href ? String(rawItem.href) : '',
    author: rawItem?.author ? String(rawItem.author) : '',
    quote: rawItem?.quote ? String(rawItem.quote) : '',
    source: rawItem?.source ? String(rawItem.source) : 'Google Review',
    rating: normalizedRating,
    archived: !!rawItem?.archived,
    archivedAt: normalizeLandingTimestamp(rawItem?.archivedAt),
    updatedAt: normalizeLandingTimestamp(rawItem?.updatedAt),
    importMeta: normalizeLandingImportMeta(rawItem?.importMeta || {}),
  };
}
function normalizeLandingContent(rawContent = {}) {
  const defaults = createDefaultLandingContent();
  const hoursRestaurants = {};
  const reviewRestaurants = {};
  knownLandingRestaurants().forEach(restaurant => {
    hoursRestaurants[restaurant.id] = normalizeLandingHoursRestaurant(rawContent?.hours?.restaurants?.[restaurant.id] || defaults.hours.restaurants[restaurant.id]);
    reviewRestaurants[restaurant.id] = Array.isArray(rawContent?.reviews?.restaurants?.[restaurant.id])
      ? rawContent.reviews.restaurants[restaurant.id].map(normalizeLandingReviewItem)
      : defaults.reviews.restaurants[restaurant.id];
  });
  return {
    overview: rawContent?.overview && typeof rawContent.overview === 'object' ? cloneJsonCompatible(rawContent.overview, {}) : {},
    hours: { restaurants: hoursRestaurants },
    events: {
      items: Array.isArray(rawContent?.events?.items) ? rawContent.events.items.map(normalizeLandingEventItem) : [],
    },
    news: {
      items: Array.isArray(rawContent?.news?.items) ? rawContent.news.items.map(normalizeLandingNewsItem) : [],
    },
    reviews: {
      restaurants: reviewRestaurants,
    },
  };
}
function normalizeLandingPageRecord(rawRecord = {}) {
  const defaults = createDefaultLandingPageRecord();
  return {
    id: rawRecord?.id ? String(rawRecord.id) : defaults.id,
    draftContent: normalizeLandingContent(rawRecord?.draft_content || rawRecord?.draftContent || defaults.draftContent),
    liveContent: normalizeLandingContent(rawRecord?.live_content || rawRecord?.liveContent || defaults.liveContent),
    draftSavedTs: normalizeLandingTimestamp(rawRecord?.draft_saved_ts || rawRecord?.draftSavedTs),
    livePublishedTs: normalizeLandingTimestamp(rawRecord?.live_published_ts || rawRecord?.livePublishedTs),
  };
}
function getLandingSectionContent(record = createDefaultLandingPageRecord(), source = 'draft') {
  return source === 'live' ? record.liveContent : record.draftContent;
}
function normalizeLandingTimeValue(value = '') {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '';
  return `${match[1]}:${match[2]}`;
}
function parseLandingTimeToMinutes(value = '') {
  const normalized = normalizeLandingTimeValue(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}
function formatLandingMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return mins === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}
function getLandingTimeSelectOptions() {
  const options = [];
  for (let minutes = 0; minutes < 1440; minutes += 15) {
    const hours24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    options.push({
      value: `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
      label: formatLandingMinutes(minutes),
    });
  }
  return options;
}
const LANDING_TIME_SELECT_OPTIONS = getLandingTimeSelectOptions();
function renderLandingTimeSelectOptions(selectedValue = '', placeholder = 'Select time') {
  const normalized = normalizeLandingTimeValue(selectedValue);
  const optionMarkup = [`<option value="">${escHtml(placeholder)}</option>`];
  const hasSelectedValue = normalized && LANDING_TIME_SELECT_OPTIONS.some(option => option.value === normalized);
  if (normalized && !hasSelectedValue) {
    const fallbackMinutes = parseLandingTimeToMinutes(normalized);
    optionMarkup.push(
      `<option value="${escHtml(normalized)}" selected>${escHtml(fallbackMinutes === null ? normalized : formatLandingMinutes(fallbackMinutes))}</option>`
    );
  }
  LANDING_TIME_SELECT_OPTIONS.forEach(option => {
    optionMarkup.push(
      `<option value="${escHtml(option.value)}" ${option.value === normalized ? 'selected' : ''}>${escHtml(option.label)}</option>`
    );
  });
  return optionMarkup.join('');
}
function isLandingIsoDate(value = '') {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function formatLandingDateLabel(value = '', options = {}) {
  if (!isLandingIsoDate(value)) return value ? String(value) : '';
  const [year, month, day] = value.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: options.short ? 'short' : 'long',
    day: 'numeric',
    year: options.year === false ? undefined : 'numeric',
    timeZone: 'UTC',
  });
  return formatter.format(utcDate).replace(', ', options.short && options.year === false ? ' ' : ', ');
}
function getLandingTargetLabel(target = '') {
  if (target === LANDING_TARGET_BOTH) return 'Both';
  const restaurant = knownLandingRestaurants().find(entry => entry.id === target);
  return restaurant ? restaurant.name : 'Both';
}
function getLandingTargetAccentClass(target = '') {
  if (target === RESTAURANTS.LEROYS.id) return 'landing-tag--leroys';
  if (target === RESTAURANTS.ELROYS.id) return 'landing-tag--elroys';
  return 'landing-tag--both';
}
function formatLandingImportStatusLabel(status = '') {
  if (status === LANDING_IMPORT_STATUS_IMPORTED) return 'Imported';
  if (status === LANDING_IMPORT_STATUS_PARTIAL) return 'Partial';
  if (status === LANDING_IMPORT_STATUS_FAILED) return 'Needs Repair';
  return 'Waiting';
}
function formatLandingImportTimestamp(meta = {}) {
  return meta?.lastSuccessTs
    ? `Imported ${formatLandingTimestampLabel(meta.lastSuccessTs)}`
    : (meta?.lastAttemptTs ? `Tried ${formatLandingTimestampLabel(meta.lastAttemptTs)}` : 'Not imported yet');
}
function isLandingAbsoluteUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}
function getLandingEventDateRank(value = '') {
  if (!isLandingIsoDate(value)) return Number.MAX_SAFE_INTEGER;
  return Date.parse(`${value}T00:00:00Z`);
}
function sortLandingEvents(items = []) {
  return items.slice().sort((a, b) => {
    const rankDelta = getLandingEventDateRank(a.eventDate) - getLandingEventDateRank(b.eventDate);
    if (rankDelta !== 0) return rankDelta;
    const startDelta = (parseLandingTimeToMinutes(a.startTime) ?? Number.MAX_SAFE_INTEGER) - (parseLandingTimeToMinutes(b.startTime) ?? Number.MAX_SAFE_INTEGER);
    if (startDelta !== 0) return startDelta;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}
function sortLandingNews(items = []) {
  return items.slice().sort((a, b) => {
    const aRank = isLandingIsoDate(a.publishedDate) ? Date.parse(`${a.publishedDate}T00:00:00Z`) : 0;
    const bRank = isLandingIsoDate(b.publishedDate) ? Date.parse(`${b.publishedDate}T00:00:00Z`) : 0;
    if (aRank !== bRank) return bRank - aRank;
    return (Number(b.updatedAt || 0) || 0) - (Number(a.updatedAt || 0) || 0);
  });
}
function sortLandingReviews(items = []) {
  return items.slice().sort((a, b) => {
    const successDelta = (Number(b.importMeta?.lastSuccessTs || 0) || 0) - (Number(a.importMeta?.lastSuccessTs || 0) || 0);
    if (successDelta !== 0) return successDelta;
    return (Number(b.updatedAt || 0) || 0) - (Number(a.updatedAt || 0) || 0);
  });
}
function getLandingActiveItems(items = []) {
  return Array.isArray(items) ? items.filter(item => !item?.archived) : [];
}
function getLandingVisibleItems(items = [], showArchived = false) {
  if (showArchived) return Array.isArray(items) ? items.slice() : [];
  return getLandingActiveItems(items);
}
function getLandingDefaultFilters() {
  return {
    events: { showArchived: false },
    news: { showArchived: false },
    reviews: { showArchived: false },
  };
}
function normalizeLandingFilters(raw = {}) {
  const defaults = getLandingDefaultFilters();
  return {
    events: { ...defaults.events, showArchived: !!raw?.events?.showArchived },
    news: { ...defaults.news, showArchived: !!raw?.news?.showArchived },
    reviews: { ...defaults.reviews, showArchived: !!raw?.reviews?.showArchived },
  };
}
function formatLandingHoursRange(day = {}) {
  if (day?.closed) return 'Closed';
  const openMinutes = parseLandingTimeToMinutes(day.open);
  const closeMinutes = parseLandingTimeToMinutes(day.close);
  if (openMinutes === null || closeMinutes === null) return 'Hours unavailable';
  return `${formatLandingMinutes(openMinutes)} - ${formatLandingMinutes(closeMinutes)}`;
}
function getLandingDayOffsetKey(dayKey, offset = 0) {
  const index = LANDING_DAY_ORDER.indexOf(dayKey);
  if (index < 0) return LANDING_DAY_ORDER[0];
  return LANDING_DAY_ORDER[(index + offset + LANDING_DAY_ORDER.length) % LANDING_DAY_ORDER.length];
}
function getRestaurantLocalParts(now = Date.now(), timeZone = RESTAURANT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(now));
  const lookup = Object.create(null);
  parts.forEach(part => {
    lookup[part.type] = part.value;
  });
  const weekday = String(lookup.weekday || '').slice(0, 3).toLowerCase();
  const dayKeyMap = { mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };
  const dayKey = dayKeyMap[weekday] || 'mon';
  const hour = Number(lookup.hour || 0);
  const minute = Number(lookup.minute || 0);
  return {
    dayKey,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}
function getLandingHoursForRestaurant(section = {}, restaurantId = '') {
  return normalizeLandingHoursRestaurant(section?.restaurants?.[restaurantId] || {});
}
function buildLandingWeekRows(section = {}, restaurantId = '', todayKey = 'mon') {
  const restaurantHours = getLandingHoursForRestaurant(section, restaurantId);
  return LANDING_DAY_ORDER.map(dayKey => ({
    dayKey,
    label: LANDING_DAY_LABELS[dayKey] || dayKey,
    isToday: dayKey === todayKey,
    rangeLabel: formatLandingHoursRange(restaurantHours.days[dayKey]),
  }));
}
function loadLandingFilters() {
  if (_landingAdminFilters) return _landingAdminFilters;
  try {
    _landingAdminFilters = normalizeLandingFilters(JSON.parse(sessionStorage.getItem(LANDING_FILTER_STORAGE_KEY) || '{}'));
  } catch (_) {
    _landingAdminFilters = getLandingDefaultFilters();
  }
  return _landingAdminFilters;
}
function getLandingSectionFilter(sectionId = '') {
  const filters = loadLandingFilters();
  return filters?.[sectionId] || getLandingDefaultFilters()[sectionId] || { showArchived: false };
}
function saveLandingFilters() {
  try {
    sessionStorage.setItem(LANDING_FILTER_STORAGE_KEY, JSON.stringify(loadLandingFilters()));
  } catch (_) {}
}
function setLandingSectionFilter(sectionId = '', key = '', value = false) {
  const filters = loadLandingFilters();
  if (!filters[sectionId]) filters[sectionId] = { showArchived: false };
  filters[sectionId][key] = !!value;
  saveLandingFilters();
}
function validateLandingEventItem(item = {}) {
  const issues = [];
  if (!item.target) issues.push('target');
  if (!item.title?.trim()) issues.push('title');
  if (!isLandingIsoDate(item.eventDate)) issues.push('date');
  if (parseLandingTimeToMinutes(item.startTime) === null) issues.push('start time');
  if (parseLandingTimeToMinutes(item.endTime) === null && !item.timingNote?.trim()) issues.push('end time or note');
  if (!item.body?.trim()) issues.push('description');
  return {
    valid: issues.length === 0,
    missingFields: issues,
  };
}
function validateLandingNewsItem(item = {}) {
  const issues = [];
  if (!item.target) issues.push('target');
  if (!item.title?.trim()) issues.push('headline');
  if (!isLandingAbsoluteUrl(item.href)) issues.push('article URL');
  if (!item.source?.trim()) issues.push('source');
  if (!isLandingIsoDate(item.publishedDate)) issues.push('publish date');
  if (!item.importMeta?.lastAttemptTs) issues.push('import record');
  return {
    valid: issues.length === 0,
    missingFields: issues,
  };
}
function validateLandingReviewItem(item = {}) {
  const issues = [];
  if (!isLandingAbsoluteUrl(item.href)) issues.push('review URL');
  if (!item.author?.trim()) issues.push('author');
  if (!item.quote?.trim()) issues.push('quote');
  if (!Number.isFinite(Number(item.rating)) || Number(item.rating) < 1 || Number(item.rating) > 5) issues.push('rating');
  if (!item.importMeta?.lastAttemptTs) issues.push('import record');
  return {
    valid: issues.length === 0,
    missingFields: issues,
  };
}
function validateLandingEventsSection(section = {}) {
  const issues = [];
  const items = sortLandingEvents(getLandingActiveItems(Array.isArray(section?.items) ? section.items.map(normalizeLandingEventItem) : []));
  items.forEach(item => {
    const validation = validateLandingEventItem(item);
    if (validation.valid) return;
    issues.push(`${item.title?.trim() || 'Untitled event'}: missing ${validation.missingFields.join(', ')}.`);
  });
  return { valid: issues.length === 0, issues };
}
function validateLandingNewsSection(section = {}) {
  const issues = [];
  const items = sortLandingNews(getLandingActiveItems(Array.isArray(section?.items) ? section.items.map(normalizeLandingNewsItem) : []));
  items.forEach(item => {
    const validation = validateLandingNewsItem(item);
    if (validation.valid) return;
    issues.push(`${item.title?.trim() || item.href?.trim() || 'Imported story'}: missing ${validation.missingFields.join(', ')}.`);
  });
  return { valid: issues.length === 0, issues };
}
function validateLandingReviewsSection(section = {}) {
  const issues = [];
  knownLandingRestaurants().forEach(restaurant => {
    const items = sortLandingReviews(
      getLandingActiveItems(Array.isArray(section?.restaurants?.[restaurant.id]) ? section.restaurants[restaurant.id].map(normalizeLandingReviewItem) : [])
    );
    items.forEach(item => {
      const validation = validateLandingReviewItem(item);
      if (validation.valid) return;
      issues.push(`${restaurant.name}: ${item.author?.trim() || item.href?.trim() || 'Imported review'} is missing ${validation.missingFields.join(', ')}.`);
    });
  });
  return { valid: issues.length === 0, issues };
}
function getLandingSectionValidation(sectionId = '', record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  if (sectionId === 'hours') return validateLandingHoursSection(normalized.draftContent.hours);
  if (sectionId === 'events') return validateLandingEventsSection(normalized.draftContent.events);
  if (sectionId === 'news') return validateLandingNewsSection(normalized.draftContent.news);
  if (sectionId === 'reviews') return validateLandingReviewsSection(normalized.draftContent.reviews);
  return { valid: true, issues: [] };
}
function findLandingItemById(items = [], itemId = '') {
  return Array.isArray(items) ? items.find(item => item?.id === itemId) || null : null;
}
function getLandingItemStatusLabel(sectionId = '', item = {}, liveSection = null) {
  if (item?.archived) return LANDING_ITEM_STATUS_ARCHIVED;
  const validation = sectionId === 'events'
    ? validateLandingEventItem(item)
    : sectionId === 'news'
      ? validateLandingNewsItem(item)
      : validateLandingReviewItem(item);
  if (!validation.valid) return LANDING_ITEM_STATUS_MISSING;
  let liveItem = null;
  if (sectionId === 'reviews') {
    liveItem = findLandingItemById(liveSection || [], item.id);
  } else {
    liveItem = findLandingItemById(liveSection?.items || [], item.id);
  }
  if (liveItem && JSON.stringify(item) === JSON.stringify(liveItem)) return LANDING_ITEM_STATUS_LIVE;
  return LANDING_ITEM_STATUS_DRAFT;
}
function validateLandingHoursSection(section = {}) {
  const issues = [];
  knownLandingRestaurants().forEach(restaurant => {
    const restaurantHours = getLandingHoursForRestaurant(section, restaurant.id);
    LANDING_DAY_ORDER.forEach(dayKey => {
      const day = restaurantHours.days[dayKey];
      if (day.closed) return;
      const openMinutes = parseLandingTimeToMinutes(day.open);
      const closeMinutes = parseLandingTimeToMinutes(day.close);
      if (openMinutes === null || closeMinutes === null) {
        issues.push(`${restaurant.name}: ${LANDING_DAY_LABELS[dayKey]} needs both an open and close time.`);
        return;
      }
      if (openMinutes === closeMinutes) {
        issues.push(`${restaurant.name}: ${LANDING_DAY_LABELS[dayKey]} cannot open and close at the same time.`);
      }
    });
  });
  return {
    valid: issues.length === 0,
    issues,
  };
}
function getLandingHoursSectionForValidation(record = _landingPageState) {
  const source = syncLandingHoursDraftFromDom() || record || createDefaultLandingPageRecord();
  return normalizeLandingPageRecord(source).draftContent.hours;
}
function computeLandingStatusForRestaurant(section = {}, restaurantId = '', now = Date.now(), timeZone = RESTAURANT_TIME_ZONE) {
  const restaurantHours = getLandingHoursForRestaurant(section, restaurantId);
  const local = getRestaurantLocalParts(now, timeZone);
  const previousDayKey = getLandingDayOffsetKey(local.dayKey, -1);
  const today = restaurantHours.days[local.dayKey];
  const previous = restaurantHours.days[previousDayKey];
  const todayOpen = parseLandingTimeToMinutes(today.open);
  const todayClose = parseLandingTimeToMinutes(today.close);
  const previousOpen = parseLandingTimeToMinutes(previous.open);
  const previousClose = parseLandingTimeToMinutes(previous.close);
  const previousOvernight = !previous.closed && previousOpen !== null && previousClose !== null && previousClose <= previousOpen;
  const todayOvernight = !today.closed && todayOpen !== null && todayClose !== null && todayClose <= todayOpen;

  if (previousOvernight && local.minutes < previousClose) {
    return {
      isOpen: true,
      currentDayKey: local.dayKey,
      label: `Open until ${formatLandingMinutes(previousClose)}`,
      todayRangeLabel: formatLandingHoursRange(today),
      weekRows: buildLandingWeekRows(section, restaurantId, local.dayKey),
    };
  }

  if (!today.closed && todayOpen !== null && todayClose !== null) {
    const isOpen = todayOvernight
      ? local.minutes >= todayOpen
      : (local.minutes >= todayOpen && local.minutes < todayClose);
    if (isOpen) {
      return {
        isOpen: true,
        currentDayKey: local.dayKey,
        label: `Open until ${formatLandingMinutes(todayClose)}`,
        todayRangeLabel: formatLandingHoursRange(today),
        weekRows: buildLandingWeekRows(section, restaurantId, local.dayKey),
      };
    }
  }

  if (!today.closed && todayOpen !== null && local.minutes < todayOpen) {
    return {
      isOpen: false,
      currentDayKey: local.dayKey,
      label: `Closed until ${formatLandingMinutes(todayOpen)}`,
      todayRangeLabel: formatLandingHoursRange(today),
      weekRows: buildLandingWeekRows(section, restaurantId, local.dayKey),
    };
  }

  for (let offset = 1; offset <= LANDING_DAY_ORDER.length; offset += 1) {
    const nextDayKey = getLandingDayOffsetKey(local.dayKey, offset);
    const nextDay = restaurantHours.days[nextDayKey];
    if (nextDay.closed) continue;
    const nextOpen = parseLandingTimeToMinutes(nextDay.open);
    if (nextOpen === null) continue;
    const prefix = offset === 1 ? 'tomorrow' : (LANDING_DAY_LABELS[nextDayKey] || nextDayKey);
    return {
      isOpen: false,
      currentDayKey: local.dayKey,
      label: `Closed until ${prefix} ${formatLandingMinutes(nextOpen)}`,
      todayRangeLabel: formatLandingHoursRange(today),
      weekRows: buildLandingWeekRows(section, restaurantId, local.dayKey),
    };
  }

  return {
    isOpen: false,
    currentDayKey: local.dayKey,
    label: 'Closed for now',
    todayRangeLabel: formatLandingHoursRange(today),
    weekRows: buildLandingWeekRows(section, restaurantId, local.dayKey),
  };
}
function applyLandingSectionPublish(record = createDefaultLandingPageRecord(), sectionIds = []) {
  const nextRecord = normalizeLandingPageRecord(record);
  const draftContent = cloneJsonCompatible(nextRecord.draftContent, createDefaultLandingContent());
  const liveContent = cloneJsonCompatible(nextRecord.liveContent, createDefaultLandingContent());
  const appliedSectionIds = sectionIds.filter(sectionId => LANDING_PAGE_SECTION_ORDER.includes(sectionId));
  appliedSectionIds.forEach(sectionId => {
    liveContent[sectionId] = cloneJsonCompatible(draftContent[sectionId], {});
  });
  nextRecord.liveContent = normalizeLandingContent(liveContent);
  return nextRecord;
}
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
let _currentMenuSession = null;
let _menuMetaSupportsLastSentFeatured = true;
let _menuMetaSupportsDraftState = true;
let _draftSaveOnlyChanges = new Map();
let _hasSharedDraft = false;
let _sharedDraftSavedTs = '';
let _sharedDraftSavedBy = null;
let _sharedDraftSource = '';
let _serverLiveSnapshot = null;
let _localDraftBaseSnapshot = null;
let _localDraftPersistTimer = null;
let _previewModalState = null;
let _previewSelectionState = {};
let _lastAddItemCategoryId = '';
const ADD_ITEM_MODAL_MANUAL_MODE = 'manual';
const ADD_ITEM_MODAL_SCAN_MODE = 'scan';
function createAddItemModalUntappdState(overrides = {}) {
  return {
    pending: false,
    query: '',
    results: [],
    selectedBid: '',
    preview: null,
    includeBrewery: false,
    error: '',
    requestId: 0,
    ...overrides,
  };
}

function createAddItemModalState(overrides = {}) {
  return {
    isOpen: false,
    mode: ADD_ITEM_MODAL_MANUAL_MODE,
    fields: null,
    duplicateWarning: '',
    entryMode: ADD_ITEM_MODAL_MANUAL_MODE,
    lookupPending: false,
    lookupBarcode: '',
    lookupRequestId: 0,
    manualBarcode: '',
    scanState: 'idle',
    scannerService: null,
    untappd: createAddItemModalUntappdState(),
    ...overrides,
  };
}
let _addItemModalState = createAddItemModalState();
function invalidateDiff() {
  _diffDirty = true;
  _dirty = true;
  scheduleCurrentLocalDraftPersistence();
  updateSaveBtn();
}
function countDiffLines(diff = getCachedDiff()) {
  return (diff || []).reduce((count, section) => (
    count + (section.added?.length || 0) +
    (section.removed?.length || 0) +
    (section.eightySixed?.length || 0) +
    (section.restored?.length || 0)
  ), 0);
}
function getDraftSaveOnlyChanges() {
  return Array.from(_draftSaveOnlyChanges.values());
}
function clearDraftSaveOnlyChanges() {
  _draftSaveOnlyChanges = new Map();
}
function hasSharedDraftState() {
  return !!_hasSharedDraft;
}
function getDraftSavedTs() {
  return _sharedDraftSavedTs || '';
}
function getSharedDraftInfo() {
  return {
    exists: !!_hasSharedDraft,
    savedAt: _sharedDraftSavedTs || '',
    savedBy: _sharedDraftSavedBy,
    source: _sharedDraftSource || '',
  };
}
function normalizeSharedDraftActor(actor = null) {
  if (!actor || typeof actor !== 'object') return null;
  const id = String(actor.id || '').trim();
  const name = String(actor.name || '').trim();
  if (!id && !name) return null;
  return { id, name };
}
function clearSharedDraftState() {
  _hasSharedDraft = false;
  _sharedDraftSavedTs = '';
  _sharedDraftSavedBy = null;
  _sharedDraftSource = '';
}
function setSharedDraftState(savedTs = '', details = {}) {
  let nextSavedTs = savedTs;
  let nextDetails = details;
  if (savedTs && typeof savedTs === 'object') {
    nextDetails = savedTs;
    nextSavedTs = savedTs.savedAt || savedTs.saved_at || '';
  }
  _hasSharedDraft = nextDetails?.exists != null ? !!nextDetails.exists : true;
  _sharedDraftSavedTs = nextSavedTs ? String(nextSavedTs) : '';
  if (Object.prototype.hasOwnProperty.call(nextDetails || {}, 'savedBy')) {
    _sharedDraftSavedBy = normalizeSharedDraftActor(nextDetails.savedBy);
  }
  if (Object.prototype.hasOwnProperty.call(nextDetails || {}, 'source')) {
    _sharedDraftSource = String(nextDetails.source || '').trim();
  }
}
function isMenuWorkspacePage() {
  return _appPageMode === 'manager' || _appPageMode === 'admin';
}
function getMenuDraftClientId() {
  let clientId = localStorage.getItem(LS_KEYS.menuDraftClientId) || '';
  if (!clientId) {
    clientId = uid();
    try {
      localStorage.setItem(LS_KEYS.menuDraftClientId, clientId);
    } catch (_) {
      return clientId;
    }
  }
  return clientId;
}
function getLocalDraftStorageKey({ userId = currentUser?.uid || '', menuId = MENU_ID, clientId = getMenuDraftClientId() } = {}) {
  const normalizedUserId = String(userId || '').trim();
  const normalizedMenuId = String(menuId || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedUserId || !normalizedMenuId || !normalizedClientId) return '';
  return `hf_menu_local_draft::${normalizedUserId}::${normalizedMenuId}::${normalizedClientId}`;
}
function clearLocalDraftPersistTimer() {
  if (_localDraftPersistTimer) {
    clearTimeout(_localDraftPersistTimer);
    _localDraftPersistTimer = null;
  }
}
function normalizeLocalDraftEnvelope(candidate = null) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const userId = String(candidate.userId || '').trim();
  const menuId = String(candidate.menuId || '').trim();
  const clientId = String(candidate.clientId || '').trim();
  const draftSnapshot = candidate.draftSnapshot && typeof candidate.draftSnapshot === 'object'
    ? cloneJsonCompatible(candidate.draftSnapshot, null)
    : (Array.isArray(candidate.cats)
        ? {
            cats: cloneJsonCompatible(candidate.cats, []),
            save_only_changes: cloneJsonCompatible(candidate.saveOnlyChanges || candidate.save_only_changes || [], []),
            featured_groups: cloneJsonCompatible(candidate.featured_groups || [], []),
          }
        : null);
  if (!userId || !menuId || !clientId || !draftSnapshot) return null;
  const baseSnapshot = candidate.baseSnapshot && typeof candidate.baseSnapshot === 'object'
    ? cloneJsonCompatible(candidate.baseSnapshot, null)
    : null;
  return {
    version: Number(candidate.version || 2) || 2,
    userId,
    menuId,
    clientId,
    savedAt: Number(candidate.savedAt || Date.now()),
    baseLiveRevision: candidate.baseLiveRevision == null ? null : Number(candidate.baseLiveRevision),
    baseLastSentRevision: candidate.baseLastSentRevision == null ? null : Number(candidate.baseLastSentRevision),
    baseSnapshot,
    draftSnapshot,
  };
}
function readStoredLocalDraftEnvelope(options = {}) {
  const storageKey = getLocalDraftStorageKey(options);
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return normalizeLocalDraftEnvelope(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}
function writeStoredLocalDraftEnvelope(envelope = null, options = {}) {
  const storageKey = getLocalDraftStorageKey(options);
  if (!storageKey) return null;
  try {
    if (!envelope) {
      localStorage.removeItem(storageKey);
      return null;
    }
    const normalized = normalizeLocalDraftEnvelope(envelope);
    if (!normalized) {
      localStorage.removeItem(storageKey);
      return null;
    }
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  } catch (_) {
    return null;
  }
}
function clearStoredLocalDraftEnvelope(options = {}) {
  return writeStoredLocalDraftEnvelope(null, options);
}
function setServerLiveSnapshot(snapshot = null) {
  _serverLiveSnapshot = snapshot && typeof snapshot === 'object'
    ? cloneJsonCompatible(snapshot, null)
    : null;
}
function getServerLiveSnapshot() {
  return cloneJsonCompatible(_serverLiveSnapshot, null);
}
function syncServerLiveSnapshot() {
  setServerLiveSnapshot(buildMenuCacheSnapshot());
}
function alignDraftDocumentSnapshotWithLiveSnapshot(snapshot = null, liveSnapshot = getServerLiveSnapshot()) {
  const nextSnapshot = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? cloneJsonCompatible(snapshot, null)
    : null;
  if (!nextSnapshot) return null;

  const normalizedLiveSnapshot = normalizeDraftDocumentSnapshot(liveSnapshot);
  const liveSaveOnlyChanges = Array.isArray(normalizedLiveSnapshot.save_only_changes)
    ? cloneJsonCompatible(normalizedLiveSnapshot.save_only_changes, [])
    : [];
  const hasSaveOnlyChanges = Array.isArray(nextSnapshot.save_only_changes) || Array.isArray(nextSnapshot.saveOnlyChanges);

  if (!hasSaveOnlyChanges) {
    nextSnapshot.save_only_changes = liveSaveOnlyChanges;
  }

  return nextSnapshot;
}
function alignLocalDraftEnvelopeWithLiveSnapshot(envelope = null, liveSnapshot = getServerLiveSnapshot()) {
  const normalizedEnvelope = normalizeLocalDraftEnvelope(envelope);
  if (!normalizedEnvelope) return null;
  return {
    ...normalizedEnvelope,
    baseSnapshot: alignDraftDocumentSnapshotWithLiveSnapshot(normalizedEnvelope.baseSnapshot, liveSnapshot),
    draftSnapshot: alignDraftDocumentSnapshotWithLiveSnapshot(normalizedEnvelope.draftSnapshot, liveSnapshot),
  };
}
function setLocalDraftBaseSnapshot(snapshot = null) {
  _localDraftBaseSnapshot = snapshot && typeof snapshot === 'object'
    ? cloneJsonCompatible(snapshot, null)
    : null;
}
function getLocalDraftBaseSnapshot() {
  return cloneJsonCompatible(_localDraftBaseSnapshot || _serverLiveSnapshot, null);
}
function clearLocalDraftBaseSnapshot() {
  _localDraftBaseSnapshot = null;
}
function upsertDraftSaveOnlyChange(change) {
  if (!change?.key) return null;
  const nextChange = {
    id: change.id || change.key,
    key: change.key,
    label: change.label || 'Saved change',
    message: change.message || change.label || 'Saved change',
    sectionId: change.sectionId || '',
    itemId: change.itemId || '',
    kind: change.kind || 'save-only',
  };
  _draftSaveOnlyChanges.set(nextChange.key, nextChange);
  return nextChange;
}
function markSaveOnlyDraftChange(change) {
  upsertDraftSaveOnlyChange(change);
  _dirty = true;
  scheduleCurrentLocalDraftPersistence();
  updateSaveBtn();
}
function getDraftChangeCount() {
  return countDiffLines() + getDraftSaveOnlyChanges().length;
}
function isSharedDraftClearable({ hasLocalDraft = !!_dirty, hasSharedDraft = hasSharedDraftState(), changeCount = getDraftChangeCount() } = {}) {
  return !!hasSharedDraft && !hasLocalDraft && Number(changeCount || 0) === 0;
}
function getMenuActionState({ isCompactViewport = false } = {}) {
  const hasLocalDraft = syncLocalDraftDirtyState();
  const notificationCount = countDiffLines();
  const saveOnlyCount = getDraftSaveOnlyChanges().length;
  const hasNotificationChanges = notificationCount > 0;
  const hasSaveOnlyChanges = saveOnlyCount > 0;
  const hasChanges = hasNotificationChanges || hasSaveOnlyChanges;
  const hasPendingServerQueue = !hasLocalDraft && hasNotificationChanges;

  if (hasLocalDraft) {
    const summaryText = hasNotificationChanges
      ? (isCompactViewport
          ? `${getDraftChangeCount()} pending change${getDraftChangeCount() === 1 ? '' : 's'}. Save quietly or review the send queue.`
          : `${getDraftChangeCount()} pending change${getDraftChangeCount() === 1 ? '' : 's'}. Save Quietly writes live without sending. Save & Send reviews the queue before notifying.`)
      : `${saveOnlyCount || getDraftChangeCount()} quiet change${(saveOnlyCount || getDraftChangeCount()) === 1 ? '' : 's'} ready to save.`;
    return {
      hasLocalDraft,
      hasPendingServerQueue,
      hasNotificationChanges,
      hasSaveOnlyChanges,
      hasChanges,
      summaryText,
      saveLabel: hasNotificationChanges ? 'Save Quietly' : 'Save',
      saveDisabled: !hasChanges,
      publishLabel: 'Save & Send',
      publishDisabled: !hasNotificationChanges,
      showDiscard: true,
    };
  }

  if (hasPendingServerQueue) {
    return {
      hasLocalDraft,
      hasPendingServerQueue,
      hasNotificationChanges,
      hasSaveOnlyChanges,
      hasChanges,
      summaryText: `${notificationCount} update line${notificationCount === 1 ? ' is' : 's are'} live and ready to send.`,
      saveLabel: '',
      saveDisabled: true,
      publishLabel: 'Send',
      publishDisabled: false,
      showDiscard: false,
    };
  }

  return {
    hasLocalDraft,
    hasPendingServerQueue,
    hasNotificationChanges,
    hasSaveOnlyChanges,
    hasChanges,
    summaryText: 'No pending changes',
    saveLabel: 'Save',
    saveDisabled: true,
    publishLabel: 'Send',
    publishDisabled: true,
    showDiscard: false,
  };
}
function updateSaveBtn() {
  const saveBtn = document.getElementById('save-btn');
  const publishBtn = document.getElementById('send-btn');
  const discardBtn = document.getElementById('discard-draft-btn');
  const actionState = getMenuActionState();
  if (saveBtn) {
    saveBtn.disabled = !!actionState.saveDisabled;
    saveBtn.textContent = actionState.saveLabel || 'Save';
    saveBtn.hidden = !actionState.saveLabel;
    saveBtn.title = actionState.hasLocalDraft
      ? 'Save the live menu without notifying anyone yet'
      : '';
  }
  if (publishBtn) {
    publishBtn.disabled = !!actionState.publishDisabled;
    publishBtn.textContent = actionState.publishLabel;
  }
  if (discardBtn) {
    discardBtn.hidden = !actionState.showDiscard;
    discardBtn.disabled = !actionState.showDiscard;
  }
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

function getMenuSlugForRestaurantType(restaurantId, menuType = 'drinks') {
  if (!isValidRestaurant(restaurantId)) return '';
  const normalizedType = (menuType || 'drinks').toLowerCase();
  return knownMenuList().find(menu => (
    menu.restaurantId === restaurantId &&
    (menu.type || '').toLowerCase() === normalizedType
  ))?.slug || '';
}

function normalizeKnownMenuSlug(slug, options = {}) {
  const normalized = LEGACY_MENU_SLUG_ALIASES[slug] || slug;
  const restaurantId = typeof options === 'string'
    ? options
    : options.restaurantId;
  if (!isValidRestaurant(restaurantId)) return normalized;
  if (normalized === 'drinks' || normalized === 'food') {
    return getMenuSlugForRestaurantType(restaurantId, normalized) || normalized;
  }
  return normalized;
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

function actorCanViewFeaturedSellNotes(actor = currentUser) {
  return actor?.role === 'manager' || actor?.role === 'admin';
}

function createFeaturedViewPolicy({ actorResolver }) {
  return {
    buildSnapshot({ actor, restaurantId, featuredGroups }) {
      const resolvedActor = Object.prototype.hasOwnProperty.call(arguments[0] || {}, 'actor')
        ? actor
        : actorResolver?.();
      const groups = Array.isArray(featuredGroups) ? featuredGroups : [];
      const canViewSellNotes = actorCanViewFeaturedSellNotes(resolvedActor);
      const filteredGroups = groups.map(group => ({
        ...group,
        slots: (group.slots || []).map(slot => ({
          ...slot,
          sellNote: canViewSellNotes ? (slot.sellNote || '') : '',
        })),
      }));
      const restaurantSpecials = filteredGroups.length > 1
        ? {
            id: '__restaurant_specials__',
            name: getRestaurantSpecialLabel(restaurantId),
            slots: filteredGroups.flatMap(group => group.slots || []),
          }
        : (filteredGroups[0] || null);
      return {
        canViewSellNotes,
        featuredGroups: filteredGroups,
        restaurantSpecials,
      };
    },
  };
}

function getFeaturedViewPolicy() {
  if (_featuredViewPolicy) return _featuredViewPolicy;
  _featuredViewPolicy = createFeaturedViewPolicy({
    actorResolver: () => currentUser,
  });
  return _featuredViewPolicy;
}

function isLegacySpecialCategory(catOrId) {
  const id = typeof catOrId === 'string' ? catOrId : catOrId?.id;
  return id === 'special';
}

function isProtectedSystemCategory(catId = '') {
  return catId === FEATURED_SPECIALS_CATEGORY_ID || catId === UNCATEGORIZED_ID;
}

function isHiddenPublicCategory(catOrId) {
  const id = typeof catOrId === 'string' ? catOrId : catOrId?.id;
  return isProtectedSystemCategory(id) || isLegacySpecialCategory(id);
}

function getManagedCategoryDefs() {
  return CATEGORY_DEFS.map(cat => (
    isLegacySpecialCategory(cat)
      ? { ...cat, deprecated: true, readOnly: true }
      : cat
  ));
}

function normalizeCategoryUntappdEnabled(category = null) {
  if (!category || typeof category !== 'object') return false;
  return category.untappdEnabled === true || category.untappd_enabled === true;
}

function shouldShowCategoryUntappdControl(category = null) {
  const categoryId = typeof category === 'string' ? category : category?.id;
  return currentUserCanEditCategories() &&
    MENU_TYPE !== 'food' &&
    !isProtectedSystemCategory(categoryId) &&
    !isLegacySpecialCategory(categoryId);
}

function categorySupportsUntappdImport(category = null) {
  const categoryId = typeof category === 'string' ? category : category?.id;
  if (!categoryId || isProtectedSystemCategory(categoryId) || MENU_TYPE === 'food') return false;
  const categoryDef = typeof category === 'string'
    ? CATEGORY_DEFS.find(candidate => candidate.id === category)
    : category;
  if (!categoryDef || isLegacySpecialCategory(categoryDef)) return false;
  return normalizeCategoryUntappdEnabled(categoryDef);
}

function getUncategorizedCategoryDef() {
  return {
    id: UNCATEGORIZED_ID,
    label: 'Uncategorized',
    title: 'Uncategorized',
    icon: '📦',
    color: 'rgba(120,120,120,0.12)',
    sub: 'Items for specials & autocomplete — not shown on public menu',
    placeholder: 'Add to pool…',
    untappdEnabled: false,
  };
}

function canOpenAddItemModal() {
  return !!MENU_ID && currentUserCanManageMenu(MENU_ID);
}

function getAddItemModalCategoryDefs() {
  return [
    ...getManagedCategoryDefs().filter(cat => !cat.readOnly && !cat.deprecated),
    getUncategorizedCategoryDef(),
  ];
}

function getPublicCategoryDefs() {
  return getManagedCategoryDefs().filter(cat => !isHiddenPublicCategory(cat.id));
}

function getCurrentMenuFeaturedItems() {
  const featuredSpecials = globalThis.__HF_FEATURED_SPECIALS__ || {};
  const deriveFeaturedItems = typeof featuredSpecials.deriveFeaturedItems === 'function'
    ? featuredSpecials.deriveFeaturedItems
    : null;
  const categoryDefs = getManagedCategoryDefs();
  const hasFeaturedCategory = categoryDefs.some(cat => cat.id === FEATURED_SPECIALS_CATEGORY_ID || isLegacySpecialCategory(cat.id));
  if (deriveFeaturedItems && hasFeaturedCategory) {
    return deriveFeaturedItems(categoryDefs.map(category => ({
      key: category.id,
      items: menuState[category.id]?.items || [],
    })));
  }
  return _featuredGroups
    .flatMap(group => (group?.slots || []).map(slot => slot?.item))
    .filter(Boolean);
}

function getAddItemModalDefaultCategoryId() {
  const categoryDefs = getAddItemModalCategoryDefs();
  const validCategoryIds = new Set(categoryDefs.map(cat => cat.id));
  if (_lastAddItemCategoryId && validCategoryIds.has(_lastAddItemCategoryId)) return _lastAddItemCategoryId;
  const preferredCategory = categoryDefs.find(cat => !isHiddenPublicCategory(cat.id) && cat.id !== UNCATEGORIZED_ID);
  if (preferredCategory?.id) return preferredCategory.id;
  const fallbackCategory = categoryDefs.find(cat => cat.id !== UNCATEGORIZED_ID);
  return fallbackCategory?.id || UNCATEGORIZED_ID;
}

function createAddItemModalFields(overrides = {}) {
  return {
    name: '',
    categoryId: getAddItemModalDefaultCategoryId(),
    desc: '',
    price: '',
    recipe: [],
    upcharges: [],
    ...overrides,
  };
}

function getSelectedAddItemModalCategoryDef(categoryId = _addItemModalState.fields?.categoryId) {
  return getAddItemModalCategoryDefs().find(cat => cat.id === categoryId) || getUncategorizedCategoryDef();
}

function getAddItemModalNamePlaceholder(categoryId = _addItemModalState.fields?.categoryId) {
  return categorySupportsUntappdImport(categoryId) ? 'Brewery + Beer' : 'Item name…';
}

function getAddItemModalUntappdAttribution() {
  return 'Data provided by Untappd';
}

function formatUntappdResultMeta(entry = {}) {
  const parts = [];
  if (entry?.breweryName) parts.push(String(entry.breweryName));
  if (entry?.style) parts.push(String(entry.style));
  const abv = Number(entry?.abv);
  if (Number.isFinite(abv)) parts.push(`${abv}% ABV`);
  return parts.join(' • ');
}

function getSelectedAddItemUntappdResult() {
  const bid = String(_addItemModalState?.untappd?.selectedBid || '').trim();
  if (!bid) return null;
  return (_addItemModalState?.untappd?.results || []).find(result => String(result?.bid || '').trim() === bid) || null;
}

function buildAddItemUntappdImportedName(preview = null, selectedResult = null, includeBrewery = false) {
  const previewName = String(preview?.name || '').trim();
  if (!previewName) return '';
  if (!includeBrewery) return previewName;
  const breweryName = String(selectedResult?.breweryName || preview?.breweryName || '').trim();
  return breweryName ? `${breweryName} ${previewName}` : previewName;
}

function getAddItemCategoryLabel(catId) {
  return getAddItemModalCategoryDefs().find(cat => cat.id === catId)?.title || 'this category';
}

function getAddItemDuplicateWarning(fields = _addItemModalState.fields) {
  const name = String(fields?.name || '').trim();
  const categoryId = String(fields?.categoryId || '').trim();
  if (!name || !categoryId) return '';
  const targetItems = menuState[categoryId]?.items || [];
  const nameLower = name.toLowerCase();
  const duplicate = targetItems.find(item => {
    const itemName = String(item?.name || '').trim().toLowerCase();
    if (!itemName || itemName !== nameLower) return false;
    if (categoryId === UNCATEGORIZED_ID) return true;
    return item?.onMenu !== false;
  });
  if (!duplicate) return '';
  return `"${duplicate.name}" already exists in ${getAddItemCategoryLabel(categoryId)}.`;
}

function syncAddItemModalWarnings() {
  _addItemModalState.duplicateWarning = getAddItemDuplicateWarning();
}

function getAddItemModalViewState() {
  const fields = _addItemModalState.fields || createAddItemModalFields();
  const untappd = _addItemModalState.untappd || createAddItemModalUntappdState();
  return {
    isOpen: !!_addItemModalState.isOpen,
    mode: _addItemModalState.mode || ADD_ITEM_MODAL_MANUAL_MODE,
    duplicateWarning: _addItemModalState.duplicateWarning || '',
    entryMode: _addItemModalState.entryMode || ADD_ITEM_MODAL_MANUAL_MODE,
    lookupPending: !!_addItemModalState.lookupPending,
    lookupBarcode: _addItemModalState.lookupBarcode || '',
    manualBarcode: _addItemModalState.manualBarcode || '',
    scanState: _addItemModalState.scanState || 'idle',
    scanUnsupported: _addItemModalState.scanState === 'unsupported',
    untappd: {
      pending: !!untappd.pending,
      query: untappd.query || '',
      results: Array.isArray(untappd.results) ? untappd.results.map(result => ({ ...result })) : [],
      selectedBid: untappd.selectedBid || '',
      preview: untappd.preview ? { ...untappd.preview } : null,
      includeBrewery: !!untappd.includeBrewery,
      error: untappd.error || '',
    },
    fields: {
      name: fields.name || '',
      categoryId: fields.categoryId || '',
      desc: fields.desc || '',
      price: fields.price || '',
      recipe: recipeArray(fields.recipe),
      upcharges: itemUpchargeArray(fields.upcharges),
    },
  };
}

function renderManagerAddItemLauncher() {
  const button = document.getElementById('manager-add-item-btn');
  if (!button) return;
  const canOpen = canOpenAddItemModal();
  button.textContent = 'Add Item(s)';
  button.setAttribute('aria-label', 'Add item or items');
  button.style.display = canOpen ? '' : 'none';
  button.disabled = !canOpen;
  button.onclick = canOpen ? () => openAddItemModal({ mode: ADD_ITEM_MODAL_MANUAL_MODE }) : null;
  if (!canOpen && _addItemModalState.isOpen) {
    closeAddItemModal();
  }
}

function updateDrawerAddItemButton() {
  const addItemBtn = document.getElementById('drawer-add-item-btn');
  const drawerSwitchBtn = document.getElementById('drawer-switch-menu-btn');
  const adminDrawerBtn = document.getElementById('admin-btn-drawer');
  const returnBtn = document.getElementById('drawer-return-btn');
  if (!addItemBtn) return;

  const signedIn = !!currentUser;
  const isAdmin = currentUser?.role === 'admin';
  const canOpen = signedIn && canOpenAddItemModal();

  addItemBtn.style.display = canOpen ? '' : 'none';
  addItemBtn.disabled = !canOpen;
  addItemBtn.style.order = isAdmin ? '4' : '3';
  if (drawerSwitchBtn) drawerSwitchBtn.style.order = '2';
  if (adminDrawerBtn) adminDrawerBtn.style.order = '3';
  if (returnBtn) returnBtn.style.order = '5';
}

function captureAddItemModalFocusState() {
  const activeEl = document.activeElement;
  const activeId = activeEl?.id || '';
  if (!activeId || !/^add-item-/.test(activeId)) return null;
  const state = { id: activeId };
  if (typeof activeEl.selectionStart === 'number') state.selectionStart = activeEl.selectionStart;
  if (typeof activeEl.selectionEnd === 'number') state.selectionEnd = activeEl.selectionEnd;
  return state;
}

function restoreAddItemModalFocusState(focusState) {
  if (!focusState?.id) return;
  const target = document.getElementById(focusState.id);
  if (!target || typeof target.focus !== 'function') return;
  target.focus();
  if (typeof focusState.selectionStart === 'number' && typeof focusState.selectionEnd === 'number') {
    if (typeof target.setSelectionRange === 'function') {
      target.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
    } else {
      try {
        target.selectionStart = focusState.selectionStart;
        target.selectionEnd = focusState.selectionEnd;
      } catch (_) {
        // Ignore selection restore failures on non-text inputs.
      }
    }
  }
}

function focusAddItemModalField(fieldId) {
  const target = document.getElementById(fieldId);
  if (!target || typeof target.focus !== 'function') return;
  target.focus();
  if (typeof target.select === 'function' && (
    fieldId === 'add-item-name-input' ||
    fieldId === 'add-item-price-input' ||
    fieldId === 'add-item-barcode-input'
  )) {
    target.select();
  }
}

function handleAddItemModalKeydown(event) {
  if (event?.key !== 'Escape') return;
  event.preventDefault();
  closeAddItemModal();
}

async function stopAddItemModalScanner() {
  const scannerService = _addItemModalState.scannerService;
  _addItemModalState.scannerService = null;
  if (!scannerService || typeof scannerService.stop !== 'function') return { ok: true };
  try {
    return await scannerService.stop();
  } catch (_) {
    return { ok: false, reason: 'stop-failed' };
  }
}

function handleAddItemModalScannerStartFailure(error) {
  if (!_addItemModalState.isOpen) return { ok: false, reason: 'closed' };
  _addItemModalState.scanState = 'unsupported';
  _addItemModalState.lookupPending = false;
  _addItemModalState.lookupBarcode = '';
  void stopAddItemModalScanner();
  renderAddItemModal({ focusFieldId: 'add-item-barcode-input' });
  const message = error?.name === 'NotAllowedError'
    ? 'Camera permission was denied. Enter a UPC manually instead.'
    : 'Camera unavailable. Enter a UPC manually instead.';
  showToast(message, 'info');
  return { ok: false, reason: 'unsupported', error };
}

function queueAddItemModalScannerStart() {
  startAddItemModalScanner().catch(error => {
    handleAddItemModalScannerStartFailure(error);
  });
}

function setAddItemModalMode(mode, options = {}) {
  if (!_addItemModalState.isOpen) return { ok: false, reason: 'closed' };

  const nextMode = mode === ADD_ITEM_MODAL_SCAN_MODE ? ADD_ITEM_MODAL_SCAN_MODE : ADD_ITEM_MODAL_MANUAL_MODE;
  if (nextMode === ADD_ITEM_MODAL_SCAN_MODE) {
    _addItemModalState.mode = ADD_ITEM_MODAL_SCAN_MODE;
    _addItemModalState.entryMode = ADD_ITEM_MODAL_SCAN_MODE;
    _addItemModalState.lookupPending = false;
    _addItemModalState.lookupBarcode = '';
    _addItemModalState.manualBarcode = '';
    _addItemModalState.scanState = 'starting';
    void stopAddItemModalScanner();
    renderAddItemModal();
    requestAnimationFrame(() => {
      queueAddItemModalScannerStart();
    });
    return { ok: true, mode: ADD_ITEM_MODAL_SCAN_MODE };
  }

  _addItemModalState.mode = ADD_ITEM_MODAL_MANUAL_MODE;
  if (!options.preserveEntryMode) _addItemModalState.entryMode = ADD_ITEM_MODAL_MANUAL_MODE;
  _addItemModalState.scanState = 'idle';
  void stopAddItemModalScanner();
  renderAddItemModal({ focusFieldId: options.focusFieldId || 'add-item-name-input' });
  return { ok: true, mode: ADD_ITEM_MODAL_MANUAL_MODE };
}

async function startAddItemModalScanner() {
  if (!_addItemModalState.isOpen || _addItemModalState.mode !== ADD_ITEM_MODAL_SCAN_MODE) {
    return { ok: false, reason: 'inactive' };
  }

  await stopAddItemModalScanner();
  const scannerService = createBarcodeScannerService();
  if (!scannerService || typeof scannerService.start !== 'function') {
    _addItemModalState.scanState = 'unsupported';
    renderAddItemModal({ focusFieldId: 'add-item-barcode-input' });
    return { ok: false, reason: 'unsupported' };
  }

  _addItemModalState.scannerService = scannerService;
  const videoEl = document.getElementById('add-item-scanner-video');
  const result = await scannerService.start(videoEl, {
    onDetect: barcode => beginAddItemBarcodeLookup(barcode).catch(() => {}),
  });

  if (_addItemModalState.scannerService !== scannerService) {
    await scannerService.stop?.();
    return { ok: false, reason: 'replaced' };
  }

  if (!result?.ok) {
    _addItemModalState.scannerService = null;
    _addItemModalState.scanState = 'unsupported';
    renderAddItemModal({ focusFieldId: 'add-item-barcode-input' });
    return result || { ok: false, reason: 'unsupported' };
  }

  _addItemModalState.scanState = 'live';
  return result;
}

async function beginAddItemBarcodeLookup(rawBarcode) {
  const barcode = String(rawBarcode || '').trim();
  if (!_addItemModalState.isOpen || !barcode) return { ok: false, reason: 'required' };

  const requestId = (_addItemModalState.lookupRequestId || 0) + 1;
  _addItemModalState.lookupRequestId = requestId;
  _addItemModalState.lookupPending = true;
  _addItemModalState.lookupBarcode = barcode;
  _addItemModalState.manualBarcode = barcode;
  _addItemModalState.mode = ADD_ITEM_MODAL_MANUAL_MODE;
  _addItemModalState.entryMode = ADD_ITEM_MODAL_SCAN_MODE;
  _addItemModalState.scanState = 'idle';
  _addItemModalState.untappd = createAddItemModalUntappdState();
  const categoryId = String(_addItemModalState.fields?.categoryId || getAddItemModalDefaultCategoryId());
  _addItemModalState.fields = createAddItemModalFields({ categoryId });
  syncAddItemModalWarnings();
  await stopAddItemModalScanner();
  renderAddItemModal({ focusFieldId: 'add-item-name-input' });

  const product = await lookupOpenFoodFactsProduct(barcode, {
    headers: getAuthorizedApiHeaders(),
  });
  if (!_addItemModalState.isOpen || _addItemModalState.lookupRequestId !== requestId) {
    return { ok: false, reason: 'stale' };
  }

  _addItemModalState.lookupPending = false;
  if (product) {
    _addItemModalState.fields.name = product.name || '';
    _addItemModalState.fields.desc = product.description || '';
  } else {
    _addItemModalState.fields.name = '';
    _addItemModalState.fields.desc = '';
    showToast('Product not found', 'info');
  }
  syncAddItemModalWarnings();
  renderAddItemModal({ focusFieldId: 'add-item-name-input' });
  return { ok: true, product };
}

function updateAddItemModalManualBarcode(value) {
  if (!_addItemModalState.isOpen) return;
  _addItemModalState.manualBarcode = String(value || '');
}

function submitAddItemModalBarcodeLookup() {
  const barcode = String(_addItemModalState.manualBarcode || '').trim();
  if (!barcode) {
    renderAddItemModal({ focusFieldId: 'add-item-barcode-input' });
    return { ok: false, reason: 'required' };
  }
  return beginAddItemBarcodeLookup(barcode);
}

async function runAddItemUntappdSearch(rawQuery = '') {
  if (!_addItemModalState.isOpen || _addItemModalState.mode !== ADD_ITEM_MODAL_MANUAL_MODE) {
    return { ok: false, reason: 'inactive' };
  }
  const categoryId = String(_addItemModalState.fields?.categoryId || '');
  if (!categorySupportsUntappdImport(categoryId)) {
    return { ok: false, reason: 'unsupported' };
  }

  const query = String(rawQuery || _addItemModalState.fields?.name || '').trim();
  if (!query) {
    _addItemModalState.untappd = createAddItemModalUntappdState({
      error: 'Enter a beer name to search Untappd.',
    });
    renderAddItemModal({ focusFieldId: 'add-item-name-input' });
    return { ok: false, reason: 'required' };
  }

  const requestId = Number(_addItemModalState.untappd?.requestId || 0) + 1;
  _addItemModalState.untappd = createAddItemModalUntappdState({
    pending: true,
    query,
    requestId,
  });
  renderAddItemModal();

  const results = await searchUntappdBeers(query, {
    headers: getAuthorizedApiHeaders(),
  });
  if (!_addItemModalState.isOpen || Number(_addItemModalState.untappd?.requestId || 0) !== requestId) {
    return { ok: false, reason: 'stale' };
  }

  if (!Array.isArray(results)) {
    _addItemModalState.untappd = createAddItemModalUntappdState({
      query,
      error: 'Untappd is unavailable right now.',
      requestId,
    });
    renderAddItemModal({ focusFieldId: 'add-item-name-input' });
    return { ok: false, reason: 'unavailable' };
  }

  if (!results.length) {
    _addItemModalState.untappd = createAddItemModalUntappdState({
      query,
      error: 'No Untappd matches found.',
      requestId,
    });
    renderAddItemModal({ focusFieldId: 'add-item-name-input' });
    return { ok: false, reason: 'not-found' };
  }

  _addItemModalState.untappd = createAddItemModalUntappdState({
    query,
    results,
    requestId,
  });

  if (results.length === 1) {
    return previewAddItemUntappdSelection(results[0].bid);
  }

  renderAddItemModal();
  return { ok: true, results };
}

async function previewAddItemUntappdSelection(bid) {
  if (!_addItemModalState.isOpen) return { ok: false, reason: 'closed' };
  const query = String(_addItemModalState.untappd?.query || '').trim();
  const results = Array.isArray(_addItemModalState.untappd?.results) ? _addItemModalState.untappd.results.slice() : [];
  const requestId = Number(_addItemModalState.untappd?.requestId || 0) + 1;
  _addItemModalState.untappd = createAddItemModalUntappdState({
    pending: true,
    query,
    results,
    selectedBid: String(bid || ''),
    includeBrewery: !!_addItemModalState.untappd?.includeBrewery,
    requestId,
  });
  renderAddItemModal();

  const preview = await previewUntappdBeerImport(bid, {
    includeBrewery: true,
    headers: getAuthorizedApiHeaders(),
  });
  if (!_addItemModalState.isOpen || Number(_addItemModalState.untappd?.requestId || 0) !== requestId) {
    return { ok: false, reason: 'stale' };
  }

  if (!preview) {
    _addItemModalState.untappd = createAddItemModalUntappdState({
      query,
      results,
      selectedBid: String(bid || ''),
      error: 'Untappd preview is unavailable right now.',
      requestId,
    });
    renderAddItemModal({ focusFieldId: 'add-item-name-input' });
    return { ok: false, reason: 'preview-unavailable' };
  }

  _addItemModalState.untappd = createAddItemModalUntappdState({
    query,
    results,
    selectedBid: String(bid || ''),
    preview,
    includeBrewery: !!_addItemModalState.untappd?.includeBrewery,
    requestId,
  });
  renderAddItemModal();
  return { ok: true, preview };
}

function setAddItemUntappdIncludeBrewery(enabled) {
  if (!_addItemModalState.isOpen) return;
  if (!_addItemModalState.untappd) _addItemModalState.untappd = createAddItemModalUntappdState();
  _addItemModalState.untappd.includeBrewery = !!enabled;
  renderAddItemModal();
}

function cancelAddItemUntappdFlow() {
  if (!_addItemModalState.isOpen) return;
  _addItemModalState.untappd = createAddItemModalUntappdState();
  renderAddItemModal({ focusFieldId: 'add-item-name-input' });
}

function applyAddItemUntappdImport() {
  if (!_addItemModalState.isOpen || !_addItemModalState.fields) return { ok: false, reason: 'closed' };
  const preview = _addItemModalState.untappd?.preview;
  if (!preview) return { ok: false, reason: 'missing-preview' };
  const selectedResult = getSelectedAddItemUntappdResult();
  _addItemModalState.fields.name = buildAddItemUntappdImportedName(
    preview,
    selectedResult,
    !!_addItemModalState.untappd?.includeBrewery
  );
  _addItemModalState.fields.desc = String(preview.description || '').trim();
  _addItemModalState.untappd = createAddItemModalUntappdState();
  syncAddItemModalWarnings();
  renderAddItemModal({ focusFieldId: 'add-item-name-input' });
  return {
    ok: true,
    imported: {
      name: _addItemModalState.fields.name,
      desc: _addItemModalState.fields.desc,
    },
  };
}

function syncAddItemModalUiState() {
  const body = document.body;
  if (!body?.classList || typeof body.classList.toggle !== 'function') return;
  body.classList.toggle('add-item-modal-open', !!_addItemModalState.isOpen && canOpenAddItemModal());
}

function renderAddItemModal(options = {}) {
  const host = document.getElementById('manager-add-item-modal-host');
  syncAddItemModalUiState();
  if (!host) return;
  if (!_addItemModalState.isOpen || !canOpenAddItemModal()) {
    host.innerHTML = '';
    return;
  }

  const view = getAddItemModalViewState();
  const { fields } = view;
  const isScanMode = view.mode === ADD_ITEM_MODAL_SCAN_MODE;
  const untappd = view.untappd || createAddItemModalUntappdState();
  const untappdEnabled = categorySupportsUntappdImport(fields.categoryId);
  const selectedUntappdResult = untappd.results.find(result => String(result?.bid || '') === String(untappd.selectedBid || '')) || null;
  const importedUntappdName = buildAddItemUntappdImportedName(
    untappd.preview,
    selectedUntappdResult,
    untappd.includeBrewery
  );
  const canConfirm = !!fields.name.trim() && !!fields.categoryId && !view.duplicateWarning;
  const modalSubtitle = isScanMode
    ? 'Scan a barcode to prefill item details, or use manual UPC lookup when camera scanning is unavailable.'
    : (MENU_TYPE === 'food'
      ? 'Add a menu item with pricing, description, and upcharges in one place.'
      : 'Add a menu item with pricing, description, and drinks recipe details in one place.');
  const categoryOptions = getAddItemModalCategoryDefs().map(cat => (
    `<option value="${escHtml(cat.id)}"${cat.id === fields.categoryId ? ' selected' : ''}>${escHtml(cat.title)}</option>`
  )).join('');
  const modeToggleHtml = `
    <div class="add-item-mode-toggle" role="tablist" aria-label="Add item mode">
      <button type="button" class="add-item-mode-chip${isScanMode ? ' is-active' : ''}" role="tab" aria-selected="${isScanMode ? 'true' : 'false'}" onclick="setAddItemModalMode('${ADD_ITEM_MODAL_SCAN_MODE}')">Scan</button>
      <button type="button" class="add-item-mode-chip${!isScanMode ? ' is-active' : ''}" role="tab" aria-selected="${!isScanMode ? 'true' : 'false'}" onclick="setAddItemModalMode('${ADD_ITEM_MODAL_MANUAL_MODE}')">Manual</button>
    </div>`;
  const lookupStatusHtml = view.lookupPending
    ? `<div class="add-item-modal-note" role="status">Looking up ${escHtml(view.lookupBarcode || 'barcode')}…</div>`
    : '';
  const scanBodyHtml = view.scanUnsupported
    ? `
      <div class="add-item-scan-panel add-item-scan-panel--unsupported">
        <div class="add-item-scan-copy">
          <p class="add-item-scan-heading">Camera scanning isn’t available here.</p>
          <p class="add-item-inline-note">Enter a UPC manually and we’ll still try Open Food Facts before you finish the item.</p>
        </div>
        <div class="add-item-inline-row add-item-inline-row--barcode">
          <input id="add-item-barcode-input" class="catmgr-input" type="text" inputmode="numeric" autocomplete="off" value="${escHtml(view.manualBarcode)}" placeholder="Enter barcode / UPC…" oninput="updateAddItemModalManualBarcode(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();submitAddItemModalBarcodeLookup();}"/>
          <button type="button" class="btn-small" ${view.lookupPending ? 'disabled' : ''} onclick="submitAddItemModalBarcodeLookup()">Lookup UPC</button>
        </div>
      </div>`
    : `
      <div class="add-item-scan-panel">
        <div class="add-item-scanner-frame">
          <video id="add-item-scanner-video" class="add-item-scanner-video" autoplay playsinline muted></video>
          <div class="add-item-scanner-overlay">
            <span class="add-item-scanner-overlay-copy">Align a barcode inside the frame</span>
          </div>
        </div>
        <p class="add-item-inline-note">The camera will prefill name and description, then hand off to the normal form.</p>
      </div>`;
  const upchargesHtml = fields.upcharges.length
    ? `<div class="add-item-pill-list">${fields.upcharges.map((entry, index) => `
        <div class="add-item-pill">
          <span>${escHtml(entry.label)}${entry.price ? ` <strong>${escHtml(entry.price)}</strong>` : ''}</span>
          <button type="button" class="add-item-pill-remove" aria-label="Remove upcharge" onclick="removeAddItemModalUpcharge(${index})">×</button>
        </div>
      `).join('')}</div>`
    : '<p class="add-item-inline-note">No upcharges yet.</p>';
  const recipeHtml = MENU_TYPE === 'food'
    ? ''
    : `
      <div class="add-item-field-block">
        <label class="add-item-field-label" for="add-item-recipe-input">Recipe</label>
        ${fields.recipe.length
          ? `<div class="add-item-pill-list">${fields.recipe.map((entry, index) => `
              <div class="add-item-pill">
                <span>${escHtml(entry)}</span>
                <button type="button" class="add-item-pill-remove" aria-label="Remove ingredient" onclick="removeAddItemModalRecipeIngredient(${index})">×</button>
              </div>
            `).join('')}</div>`
          : '<p class="add-item-inline-note">No ingredients yet.</p>'}
        <div class="add-item-inline-row">
          <input id="add-item-recipe-input" class="catmgr-input" type="text" placeholder="Add ingredient…" onkeydown="if(event.key===\'Enter\'){event.preventDefault();addAddItemModalRecipeIngredient();}"/>
          <button type="button" class="btn-small" onclick="addAddItemModalRecipeIngredient()">Add Ingredient</button>
        </div>
      </div>`;
  const untappdPanelHtml = !untappdEnabled
    ? ''
    : (() => {
        const attributionHtml = `<p class="add-item-inline-note add-item-untappd-attribution">${escHtml(getAddItemModalUntappdAttribution())}</p>`;
        if (untappd.pending) {
          return `<div class="add-item-modal-note" role="status">Searching Untappd…</div>`;
        }
        if (untappd.preview) {
          return `
            <div class="add-item-untappd-panel add-item-untappd-panel--preview">
              <div class="add-item-untappd-header">
                <strong>Untappd preview</strong>
                <button type="button" class="btn-small" onclick="runAddItemUntappdSearch()">Rerun</button>
              </div>
              <div class="add-item-untappd-preview">
                <div class="add-item-untappd-preview-label">Imported name</div>
                <div class="add-item-untappd-preview-value">${escHtml(importedUntappdName || untappd.preview.name || '')}</div>
                <div class="add-item-untappd-preview-label">Imported description</div>
                <div class="add-item-untappd-preview-value">${escHtml(untappd.preview.description || '') || '<span class="add-item-inline-note">No description available.</span>'}</div>
              </div>
              <label class="catmgr-checkbox-row" for="add-item-untappd-brewery-toggle">
                <input id="add-item-untappd-brewery-toggle" type="checkbox"${untappd.includeBrewery ? ' checked' : ''} onchange="setAddItemUntappdIncludeBrewery(this.checked)"/>
                <span>Include brewery in name</span>
              </label>
              <div class="add-item-untappd-actions">
                <button type="button" class="btn-small" onclick="cancelAddItemUntappdFlow()">Cancel</button>
                <button type="button" class="btn-small" onclick="applyAddItemUntappdImport()">Apply</button>
              </div>
              ${attributionHtml}
            </div>`;
        }
        if (untappd.results.length > 1) {
          return `
            <div class="add-item-untappd-panel add-item-untappd-panel--results">
              <div class="add-item-untappd-header">
                <strong>Choose an Untappd match</strong>
                <button type="button" class="btn-small" onclick="runAddItemUntappdSearch()">Rerun</button>
              </div>
              <div class="add-item-untappd-result-list">
                ${untappd.results.map(result => `
                  <button type="button" class="add-item-untappd-result" onclick="previewAddItemUntappdSelection('${escHtml(result.bid)}')">
                    <span class="add-item-untappd-result-name">${escHtml(result.name || '')}</span>
                    <span class="add-item-untappd-result-meta">${escHtml(formatUntappdResultMeta(result) || result.breweryName || '')}</span>
                  </button>
                `).join('')}
              </div>
              <div class="add-item-untappd-actions">
                <button type="button" class="btn-small" onclick="cancelAddItemUntappdFlow()">Cancel</button>
              </div>
              ${attributionHtml}
            </div>`;
        }
        if (untappd.error) {
          return `
            <div class="add-item-untappd-panel add-item-untappd-panel--status">
              <p class="add-item-modal-warning">${escHtml(untappd.error)}</p>
              <div class="add-item-untappd-actions">
                <button type="button" class="btn-small" onclick="cancelAddItemUntappdFlow()">Cancel</button>
                <button type="button" class="btn-small" onclick="runAddItemUntappdSearch()">Rerun</button>
              </div>
              ${attributionHtml}
            </div>`;
        }
        return '';
      })();
  const nameFieldHtml = untappdEnabled
    ? `
      <div class="add-item-field-block">
        <span class="add-item-field-label">Name</span>
        <div class="add-item-inline-row add-item-inline-row--untappd">
          <input id="add-item-name-input" class="catmgr-input" type="text" value="${escHtml(fields.name)}" placeholder="${escHtml(getAddItemModalNamePlaceholder(fields.categoryId))}" oninput="updateAddItemModalField('name', this.value)"/>
          <button type="button" class="btn-small" ${untappd.pending ? 'disabled' : ''} onclick="runAddItemUntappdSearch()">${untappd.pending ? 'Searching…' : 'Untappd'}</button>
        </div>
      </div>`
    : `
      <label class="add-item-field-block">
        <span class="add-item-field-label">Name</span>
        <input id="add-item-name-input" class="catmgr-input" type="text" value="${escHtml(fields.name)}" placeholder="${escHtml(getAddItemModalNamePlaceholder(fields.categoryId))}" oninput="updateAddItemModalField('name', this.value)"/>
      </label>`;
  const manualBodyHtml = `
    ${lookupStatusHtml}
    <div class="add-item-modal-grid">
      ${nameFieldHtml}
      <label class="add-item-field-block">
        <span class="add-item-field-label">Category</span>
        <select id="add-item-category-input" class="catmgr-input" onchange="updateAddItemModalField('categoryId', this.value)">${categoryOptions}</select>
      </label>
      ${untappdEnabled && untappdPanelHtml ? `<div class="add-item-field-block add-item-field-block--full">${untappdPanelHtml}</div>` : ''}
      <label class="add-item-field-block add-item-field-block--full">
        <span class="add-item-field-label">Description</span>
        <textarea id="add-item-desc-input" class="desc-input" rows="3" placeholder="Describe this item…" oninput="updateAddItemModalField('desc', this.value)">${escHtml(fields.desc)}</textarea>
      </label>
      <label class="add-item-field-block">
        <span class="add-item-field-label">Price</span>
        <input id="add-item-price-input" class="catmgr-input" type="text" value="${escHtml(fields.price)}" placeholder="$0.00" oninput="updateAddItemModalField('price', this.value)"/>
      </label>
      <div class="add-item-field-block">
        <span class="add-item-field-label">Upcharges</span>
        ${upchargesHtml}
        <div class="add-item-inline-row">
          <input id="add-item-upcharge-label" class="catmgr-input" type="text" placeholder="Label"/>
          <input id="add-item-upcharge-price" class="catmgr-input" type="text" placeholder="+$0.00" onkeydown="if(event.key==='Enter'){event.preventDefault();addAddItemModalUpcharge();}"/>
          <button type="button" class="btn-small" onclick="addAddItemModalUpcharge()">Add</button>
        </div>
      </div>
      ${recipeHtml}
    </div>`;
  const modalActionsHtml = isScanMode
    ? `
      <div class="modal-actions">
        <button type="button" class="btn-cancel" onclick="closeAddItemModal()">Cancel</button>
      </div>`
    : `
      <div class="modal-actions">
        <button type="button" class="btn-cancel" onclick="closeAddItemModal()">Cancel</button>
        <button type="button" class="btn-secondary" ${canConfirm ? '' : 'disabled'} onclick="confirmAddItemModal({ addMore: true })">Confirm &amp; Add More</button>
        <button type="button" class="btn-confirm" ${canConfirm ? '' : 'disabled'} onclick="confirmAddItemModal()">Confirm</button>
      </div>`;

  host.innerHTML = `
    <div class="modal-bg open" id="manager-add-item-overlay" onclick="if(event.target===this)closeAddItemModal()">
      <div class="modal add-item-modal" role="dialog" aria-modal="true" aria-labelledby="add-item-modal-title" onkeydown="handleAddItemModalKeydown(event)">
        <h2 id="add-item-modal-title">Add Item(s)</h2>
        <div class="modal-sub">${escHtml(modalSubtitle)}</div>
        ${modeToggleHtml}
        ${view.duplicateWarning ? `<div class="add-item-modal-warning" role="alert">${escHtml(view.duplicateWarning)}</div>` : ''}
        ${isScanMode ? scanBodyHtml : manualBodyHtml}
        ${modalActionsHtml}
      </div>
    </div>`;

  if (options.focusState) {
    requestAnimationFrame(() => restoreAddItemModalFocusState(options.focusState));
  } else if (options.focusFieldId) {
    requestAnimationFrame(() => focusAddItemModalField(options.focusFieldId));
  }
}

function openAddItemModal(options = {}) {
  if (!canOpenAddItemModal()) return { ok: false, reason: 'forbidden' };
  const requestedMode = options.mode === ADD_ITEM_MODAL_SCAN_MODE ? ADD_ITEM_MODAL_SCAN_MODE : ADD_ITEM_MODAL_MANUAL_MODE;
  _addItemModalState = createAddItemModalState({
    isOpen: true,
    mode: requestedMode,
    entryMode: requestedMode,
    fields: createAddItemModalFields(),
    scanState: requestedMode === ADD_ITEM_MODAL_SCAN_MODE ? 'starting' : 'idle',
  });
  syncAddItemModalWarnings();
  if (requestedMode === ADD_ITEM_MODAL_SCAN_MODE) {
    renderAddItemModal();
    requestAnimationFrame(() => {
      queueAddItemModalScannerStart();
    });
    return { ok: true, mode: ADD_ITEM_MODAL_SCAN_MODE };
  }
  renderAddItemModal({ focusFieldId: 'add-item-name-input' });
  return { ok: true, mode: ADD_ITEM_MODAL_MANUAL_MODE };
}

function closeAddItemModal() {
  _addItemModalState.lookupRequestId = (_addItemModalState.lookupRequestId || 0) + 1;
  void stopAddItemModalScanner();
  _addItemModalState = createAddItemModalState();
  renderAddItemModal();
}

function updateAddItemModalField(field, value) {
  if (!_addItemModalState.isOpen) return;
  if (!_addItemModalState.fields) _addItemModalState.fields = createAddItemModalFields();
  if (!Object.prototype.hasOwnProperty.call(_addItemModalState.fields, field)) return;
  const focusState = captureAddItemModalFocusState();
  _addItemModalState.fields[field] = field === 'categoryId' ? String(value || '') : String(value || '');
  if (field === 'categoryId' && !categorySupportsUntappdImport(_addItemModalState.fields.categoryId)) {
    _addItemModalState.untappd = createAddItemModalUntappdState();
  }
  syncAddItemModalWarnings();
  renderAddItemModal({ focusState });
}

function addAddItemModalRecipeIngredient(rawValue) {
  if (!_addItemModalState.isOpen || MENU_TYPE === 'food') return false;
  if (!_addItemModalState.fields) _addItemModalState.fields = createAddItemModalFields();
  const input = document.getElementById('add-item-recipe-input');
  const value = String(typeof rawValue === 'string' ? rawValue : input?.value || '').trim();
  if (!value) return false;
  _addItemModalState.fields.recipe = recipeArray(_addItemModalState.fields.recipe);
  _addItemModalState.fields.recipe.push(value);
  if (input) input.value = '';
  renderAddItemModal({ focusFieldId: 'add-item-recipe-input' });
  return true;
}

function removeAddItemModalRecipeIngredient(index) {
  if (!_addItemModalState.fields || !Array.isArray(_addItemModalState.fields.recipe)) return;
  _addItemModalState.fields.recipe.splice(index, 1);
  renderAddItemModal({ focusFieldId: 'add-item-recipe-input' });
}

function addAddItemModalUpcharge(rawLabel, rawPrice) {
  if (!_addItemModalState.isOpen) return false;
  if (!_addItemModalState.fields) _addItemModalState.fields = createAddItemModalFields();
  const labelInput = document.getElementById('add-item-upcharge-label');
  const priceInput = document.getElementById('add-item-upcharge-price');
  const label = String(typeof rawLabel === 'string' ? rawLabel : labelInput?.value || '').trim();
  const price = String(typeof rawPrice === 'string' ? rawPrice : priceInput?.value || '').trim();
  if (!label) return false;
  _addItemModalState.fields.upcharges = itemUpchargeArray(_addItemModalState.fields.upcharges);
  _addItemModalState.fields.upcharges.push({ label, price: price || '+$0' });
  if (labelInput) labelInput.value = '';
  if (priceInput) priceInput.value = '';
  renderAddItemModal({ focusFieldId: 'add-item-upcharge-label' });
  return true;
}

function removeAddItemModalUpcharge(index) {
  if (!_addItemModalState.fields || !Array.isArray(_addItemModalState.fields.upcharges)) return;
  _addItemModalState.fields.upcharges.splice(index, 1);
  renderAddItemModal({ focusFieldId: 'add-item-upcharge-label' });
}

function buildNewMenuItemFromAddModal(fields) {
  const categoryId = fields.categoryId || '';
  return {
    id: uid(),
    name: String(fields.name || '').trim(),
    desc: String(fields.desc || '').trim(),
    recipe: MENU_TYPE === 'food' ? [] : recipeArray(fields.recipe),
    price: String(fields.price || '').trim(),
    eightySixed: false,
    onMenu: categoryId === UNCATEGORIZED_ID ? false : true,
    upcharges: itemUpchargeArray(fields.upcharges),
    showDescription: true,
    showRecipe: false,
  };
}

function confirmAddItemModal(options = {}) {
  if (!_addItemModalState.isOpen || !_addItemModalState.fields) return { ok: false, reason: 'closed' };
  syncAddItemModalWarnings();
  const fields = _addItemModalState.fields;
  if (!String(fields.name || '').trim() || !String(fields.categoryId || '').trim()) {
    renderAddItemModal({ focusFieldId: !String(fields.name || '').trim() ? 'add-item-name-input' : 'add-item-category-input' });
    return { ok: false, reason: 'required' };
  }
  if (_addItemModalState.duplicateWarning) {
    renderAddItemModal({ focusFieldId: 'add-item-name-input' });
    return { ok: false, reason: 'duplicate' };
  }

  const categoryId = fields.categoryId;
  if (!menuState[categoryId]) menuState[categoryId] = { items: [], lastSent: [] };
  const item = buildNewMenuItemFromAddModal(fields);
  menuState[categoryId].items.push(item);
  _lastAddItemCategoryId = categoryId;
  invalidateDiff();
  renderManagerItems(categoryId);
  renderPricingSection();
  renderDescriptionSection();
  markSectionsStale('manager-items-section');
  markSectionsStale('manager-pricing-section');
  markSectionsStale('manager-description-section');
  updateDraftIndicator();
  renderManagerOverviewStats();

  if (options && options.addMore) {
    const reopenMode = _addItemModalState.entryMode === ADD_ITEM_MODAL_SCAN_MODE
      ? ADD_ITEM_MODAL_SCAN_MODE
      : ADD_ITEM_MODAL_MANUAL_MODE;
    _addItemModalState = createAddItemModalState({
      isOpen: true,
      mode: reopenMode,
      entryMode: reopenMode,
      fields: createAddItemModalFields({ categoryId: _lastAddItemCategoryId }),
      scanState: reopenMode === ADD_ITEM_MODAL_SCAN_MODE ? 'starting' : 'idle',
    });
    renderAddItemModal(reopenMode === ADD_ITEM_MODAL_SCAN_MODE ? {} : { focusFieldId: 'add-item-name-input' });
    if (reopenMode === ADD_ITEM_MODAL_SCAN_MODE) {
      requestAnimationFrame(() => {
        queueAddItemModalScannerStart();
      });
    }
    return { ok: true, keptOpen: true, item, mode: reopenMode };
  }

  closeAddItemModal();
  return { ok: true, item };
}

function getRenderableCategoryItems(catId) {
  const items = menuState[catId]?.items || [];
  return catId === UNCATEGORIZED_ID ? items : items.filter(item => item.onMenu !== false);
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

function currentUserCanEditCategories(user = currentUser) {
  return !!user && user.role === 'admin';
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

function formatNaturalLabelList(labels = []) {
  const cleaned = (Array.isArray(labels) ? labels : []).filter(Boolean);
  if (!cleaned.length) return '';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

function getRestaurantSpecialAccessNote(restaurantId = RESTAURANT_ID, user = currentUser) {
  const restaurantName = getRestaurantById(restaurantId)?.name || 'this restaurant';
  const requiredMenuIds = getRestaurantSpecialConfig(restaurantId)?.menuIds || getRestaurantMenuIds(restaurantId);
  const accessibleMenuIds = new Set(normalizeAccessibleMenuIds(user?.accessibleMenuIds));
  const requiredLabels = requiredMenuIds
    .map(menuId => getMenuById(menuId))
    .filter(Boolean)
    .map(menu => formatMenuDisplayName(menu.name, menu.type, menu.restaurantId));
  const missingLabels = requiredMenuIds
    .filter(menuId => !accessibleMenuIds.has(menuId))
    .map(menuId => getMenuById(menuId))
    .filter(Boolean)
    .map(menu => formatMenuDisplayName(menu.name, menu.type, menu.restaurantId));
  const requiredLabelText = formatNaturalLabelList(requiredLabels) || `both ${restaurantName} menus`;
  const missingLabelText = formatNaturalLabelList(missingLabels);
  const detail = missingLabelText
    ? `This account is missing ${missingLabelText}. Ask an admin to grant both menus for ${restaurantName}.`
    : `Ask an admin to grant access to both menus for ${restaurantName}.`;
  return {
    title: 'Featured specials need both menus.',
    summary: `This panel stays read-only until the same account can manage ${requiredLabelText}.`,
    detail,
  };
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
  const menu = getMenuBySlug(slug);
  const publicHref = menu?.id ? getPublicHrefForMenuId(menu.id) : '';
  if (publicHref) {
    _clearActiveMenuContext({ clearCache: !isValidRestaurant(restaurantId) });
    queueRedirectNotice(message);
    navigateToPage(publicHref);
    return false;
  }
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
  if ((menu.type || '').toLowerCase() === 'food') return basePath;
  const url = new URL(basePath, window.location.origin);
  url.searchParams.set('menu', 'drinks');
  return `${url.pathname}${url.search}`;
}

function getPublicHrefForCurrentMenu() {
  return getPublicHrefForMenuId(MENU_ID);
}

function normalizeMenuUrl(value = '') {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed, window.location.origin).toString();
  } catch (_) {
    return '';
  }
}

function createMenuLinkResolver({ routeBuilder, settingsStore }) {
  return {
    resolveForNotification({ menuId = MENU_ID, restaurantId = RESTAURANT_ID } = {}) {
      const configured = normalizeMenuUrl(settingsStore?.getMenuUrl?.(menuId));
      if (configured) return configured;
      const href = routeBuilder?.(menuId, restaurantId) || '';
      if (!href) return '';
      try {
        return new URL(href, window.location.origin).toString();
      } catch (_) {
        return '';
      }
    },
  };
}

function getMenuLinkResolver() {
  if (_menuLinkResolver) return _menuLinkResolver;
  _menuLinkResolver = createMenuLinkResolver({
    routeBuilder: (menuId, restaurantId) => {
      const href = getPublicHrefForMenuId(menuId);
      if (href) return href;
      const fallbackPath = SITE_PATHS[restaurantId] || getDefaultPublicPath();
      return fallbackPath;
    },
    settingsStore: {
      getMenuUrl(menuId) {
        if (!menuId || menuId !== MENU_ID) return '';
        return NOTIFICATIONS?.menu_url || '';
      },
    },
  });
  return _menuLinkResolver;
}

function getNotificationMenuLink(menuId = MENU_ID, restaurantId = RESTAURANT_ID) {
  return getMenuLinkResolver().resolveForNotification({ menuId, restaurantId });
}

function getManagerHrefForMenuId(menuId) {
  const menu = getMenuById(menuId);
  if (!menu?.slug) return SHARED_PAGE_PATHS.manager;
  const url = new URL(SHARED_PAGE_PATHS.manager, window.location.origin);
  url.searchParams.set('menu', menu.slug);
  return `${url.pathname}${url.search}`;
}

function getAdminHrefForMenuId(menuId) {
  const menu = getMenuById(menuId);
  if (!menu?.slug) return SHARED_PAGE_PATHS.admin;
  const url = new URL(SHARED_PAGE_PATHS.admin, window.location.origin);
  url.searchParams.set('menu', menu.slug);
  return `${url.pathname}${url.search}`;
}

function navigateToPage(path) {
  window.location.assign(path);
}

function getDefaultCategoryDefsForMenuType(menuType = 'drinks') {
  if ((menuType || '').toLowerCase() === 'food') {
    return DEFAULT_FOOD_CATEGORY_DEFS.map(cat => ({
      id: cat.key,
      icon: cat.icon || '',
      color: cat.color || '',
      title: cat.label || '',
      sub: cat.sub || '',
      placeholder: cat.placeholder || '',
      untappdEnabled: cat.untappdEnabled === true || cat.untappd_enabled === true,
    }));
  }
  return DEFAULT_CATEGORY_DEFS.map(cat => ({ ...cat }));
}

function applyDefaultCategoryDefsForMenuType(menuType = 'drinks') {
  CATEGORY_DEFS = getDefaultCategoryDefsForMenuType(menuType);
}

function restoreMenuStateFromFallback(context = {}) {
  const menu = getMenuById(context.menuId) || getMenuBySlug(context.menuSlug || '');
  const resolved = {
    menuId: context.menuId || menu?.id || MENU_ID,
    restaurantId: context.restaurantId || menu?.restaurantId || RESTAURANT_ID,
    menuType: context.menuType || menu?.type || MENU_TYPE || 'drinks',
  };
  MENU_TYPE = (resolved.menuType || 'drinks').toLowerCase() === 'food' ? 'food' : 'drinks';
  const cached = readCachedMenuState(resolved);
  if (cached) {
    try {
      hydrateState(cached);
      return { source: 'cache', usedFallback: true };
    } catch (_) {
      /* fall through to defaults */
    }
  }
  applyDefaultCategoryDefsForMenuType(MENU_TYPE);
  menuState = defaultState();
  currentDesign = { ...DESIGN_DEFAULTS };
  _restaurantCustomDesignEnabled = true;
  return { source: 'default', usedFallback: true };
}

function buildCurrentMenuPageRequest(overrides = {}) {
  const pathname = overrides.pathname ?? window.location.pathname;
  const search = overrides.search ?? window.location.search;
  const derivedSiteRestaurant = getSiteRestaurantFromPath(pathname);
  const siteRestaurantId = overrides.siteRestaurantId ??
    (_siteRestaurant?.id || (isValidRestaurant(derivedSiteRestaurant?.id) ? derivedSiteRestaurant.id : ''));
  return {
    pathname,
    search,
    pageMode: overrides.pageMode ?? _appPageMode,
    actor: overrides.actor ?? currentUser,
    siteRestaurantId: isValidRestaurant(siteRestaurantId) ? siteRestaurantId : '',
    requestedMenuId: overrides.requestedMenuId ?? MENU_ID,
    requestedMenuSlug: overrides.requestedMenuSlug ??
      normalizeKnownMenuSlug(new URLSearchParams(search).get('menu') || '', { restaurantId: siteRestaurantId }),
  };
}

function buildMenuSessionSnapshot(source = 'live', request = buildCurrentMenuPageRequest()) {
  const notifyDiff = getCachedDiff();
  const saveOnlyChanges = getDraftSaveOnlyChanges();
  const hasLocalDraft = syncLocalDraftDirtyState();
  const hasPendingUpdate = !hasLocalDraft && countDiffLines(notifyDiff) > 0;
  return {
    request,
    source,
    menuId: MENU_ID,
    menuType: MENU_TYPE,
    menuName: _activeMenuName,
    restaurantId: RESTAURANT_ID,
    restaurantName: _activeRestaurantName,
    menuState,
    currentDesign,
    featuredGroups: _featuredGroups,
    dirty: hasLocalDraft,
    hasSharedDraft: false,
    draftSavedTs: getDraftSavedTs(),
    saveOnlyChanges,
    notifyDiff,
    status: hasLocalDraft ? 'DRAFTING' : (hasPendingUpdate ? 'LIVE | UNSENT' : 'LIVE'),
    hasMultipleMenus: _hasMultipleMenus,
  };
}

function buildMenuSessionPreview(snapshot = buildMenuSessionSnapshot('preview')) {
  const diff = snapshot.notifyDiff || getCachedDiff();
  const sections = buildNotificationPreviewSections(diff);
  const notificationChanges = sections.flatMap(section => section.changes);
  const saveOnlyChanges = snapshot.saveOnlyChanges || getDraftSaveOnlyChanges();
  const hasLocalDraft = !!snapshot.dirty;
  const mode = hasLocalDraft ? 'save-and-send' : (notificationChanges.length ? 'send' : 'save');
  return {
    hasChanges: notificationChanges.length > 0 || saveOnlyChanges.length > 0,
    hasLocalDraft,
    hasSharedDraft: false,
    hasNotificationChanges: notificationChanges.length > 0,
    hasSaveOnlyChanges: saveOnlyChanges.length > 0,
    diff,
    sections,
    notificationChanges,
    saveOnlyChanges,
    patchMessage: '',
    truncated: false,
    snapshot,
    mode,
  };
}

function createPreviewChangeId(sectionId, kind, name) {
  return `${sectionId}::${kind}::${encodeURIComponent(String(name || '').trim().toLowerCase())}`;
}

function buildNotificationPreviewSections(diff = []) {
  return (diff || []).map(section => {
    const changes = [];
    (section.added || []).forEach(name => {
      changes.push({ id: createPreviewChangeId(section.id, 'added', name), kind: 'added', text: `+ ${name}`, name, sectionId: section.id, sectionLabel: section.label, icon: section.icon });
    });
    (section.removed || []).forEach(name => {
      changes.push({ id: createPreviewChangeId(section.id, 'removed', name), kind: 'removed', text: `− ${name}`, name, sectionId: section.id, sectionLabel: section.label, icon: section.icon });
    });
    (section.eightySixed || []).forEach(name => {
      changes.push({ id: createPreviewChangeId(section.id, 'eightySixed', name), kind: 'eightySixed', text: `86'd: ${name}`, name, sectionId: section.id, sectionLabel: section.label, icon: section.icon });
    });
    (section.restored || []).forEach(name => {
      changes.push({ id: createPreviewChangeId(section.id, 'restored', name), kind: 'restored', text: `${restoreLabel(section.id)}: ${name}`, name, sectionId: section.id, sectionLabel: section.label, icon: section.icon });
    });
    return { ...section, changes };
  }).filter(section => section.changes.length > 0);
}

function groupNotificationChangesBySection(changes = []) {
  const sections = new Map();
  (changes || []).forEach(change => {
    if (!sections.has(change.sectionId)) {
      sections.set(change.sectionId, {
        id: change.sectionId,
        icon: change.icon,
        label: change.sectionLabel,
        changes: [],
      });
    }
    sections.get(change.sectionId).changes.push(change);
  });
  return Array.from(sections.values());
}

function getMenuSessionPorts() {
  return {
    buildRequest(overrides = {}) {
      return buildCurrentMenuPageRequest(overrides);
    },
    buildSnapshot(source = 'live', request = buildCurrentMenuPageRequest()) {
      return buildMenuSessionSnapshot(source, request);
    },
    async resolveMenu() {
      return sbResolveMenu();
    },
    canLoadFromNetwork() {
      return !!MENU_ID;
    },
    restoreFallback({ expectedRestaurantId = '', request = {} } = {}) {
      const requestedMenu = getMenuById(request.requestedMenuId) || getMenuBySlug(request.requestedMenuSlug || '');
      const fallback = restoreMenuStateFromFallback({
        menuId: request.requestedMenuId || requestedMenu?.id || MENU_ID,
        menuSlug: request.requestedMenuSlug || requestedMenu?.slug || '',
        restaurantId: expectedRestaurantId || requestedMenu?.restaurantId || request.siteRestaurantId || RESTAURANT_ID,
        menuType: requestedMenu?.type || MENU_TYPE,
      });
      return {
        source: fallback.source,
        usedFallback: fallback.usedFallback,
      };
    },
    async loadState(options = {}) {
      return _loadActiveMenuStateInternal(options);
    },
    async pollState(options = {}) {
      return _pollActiveMenuStateInternal(options);
    },
    now() {
      return Date.now();
    },
    async persistState(options = {}) {
      return persistState(options);
    },
    async patchMenuMeta(update) {
      return patchMenuMetaWithCompatibility(update);
    },
    async patchMenuMetaForMenu(menuId, update) {
      return patchMenuMetaForMenuWithCompatibility(menuId, update);
    },
    async patchMenuDraftState(snapshot, savedAt) {
      return patchMenuDraftState(snapshot, savedAt);
    },
    async requestPublishPreview() {
      return requestPublishPreviewThroughApi();
    },
    async publishMenuUpdate(options = {}) {
      const providedPreview = options.preview?.sections ? options.preview : null;
      const selectedChangeIds = Array.isArray(options.selectedChangeIds)
        ? options.selectedChangeIds
        : (providedPreview?.notificationChanges || []).map(change => change.id);
      const mode = options.mode || (((providedPreview?.mode === 'send') || (providedPreview?.mode === 'update-only'))
        ? (options.notify === false ? 'save' : 'send')
        : (options.notify === false ? 'save' : 'save-and-send'));
      const apiResult = await publishMenuThroughApi({ mode, selectedChangeIds });
      if (!apiResult.ok) {
        if (apiResult.status === 409 && apiResult.payload?.code === 'revision_conflict' && syncLocalDraftDirtyState()) {
          const reloadResult = await reloadLatestWorkspaceIntoLocalDraft();
          if (reloadResult.reloaded) {
            return {
              ok: false,
              preview: providedPreview,
              userHandled: true,
              userMessage: reloadResult.requiresReview
                ? 'The live menu changed while you were drafting. Your draft was reloaded on top of the latest live data so you can review the overlap before saving again.'
                : 'The live menu changed while you were drafting. Your non-overlapping local draft was automatically reapplied on top of the latest live data.',
              snapshot: buildMenuSessionSnapshot('publish-conflict-reloaded'),
            };
          }
        }
        return {
          ok: false,
          preview: providedPreview,
          userHandled: false,
          userMessage: apiResult.payload?.error || 'Publish failed.',
          snapshot: buildMenuSessionSnapshot('publish-failed'),
        };
      }
      const result = apiResult.payload || {};
      const canonicalPreview = result.preview && typeof result.preview === 'object' ? result.preview : providedPreview;
      const ts = Number(result.ts || Date.now());
      if (mode === 'save') {
        menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: String(ts) };
        lsSet(LS_KEYS.lastUpdated, String(ts));
        clearDraftSaveOnlyChanges();
        clearSharedDraftState();
        clearCurrentLocalDraft();
        setServerLiveSnapshot(buildMenuCacheSnapshot());
        updateSaveBtn();
        updateLastUpdatedLabel();
      } else if (result.notificationStatus?.partial || (mode === 'save-and-send' && result.notificationStatus && result.notificationStatus.ok === false)) {
        menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: String(ts) };
        lsSet(LS_KEYS.lastUpdated, String(ts));
        clearDraftSaveOnlyChanges();
        clearSharedDraftState();
        clearCurrentLocalDraft();
        setServerLiveSnapshot(buildMenuCacheSnapshot());
        updateSaveBtn();
        updateLastUpdatedLabel();
      } else if (mode === 'save-and-send' || mode === 'send') {
        _lastSentFeaturedIds = new Set(getCurrentFeaturedIds());
        applySentState(Array.isArray(canonicalPreview?.diff) ? canonicalPreview.diff : [], ts);
        clearDraftSaveOnlyChanges();
        clearSharedDraftState();
        clearCurrentLocalDraft();
        setServerLiveSnapshot(buildMenuCacheSnapshot());
        updateSaveBtn();
        updateLastUpdatedLabel();
      }
      return {
        ...result,
        ok: result.ok !== false,
        preview: canonicalPreview,
        snapshot: buildMenuSessionSnapshot((mode === 'save') ? 'saved-live' : 'publish-complete'),
      };
    },
    finalizePersistStatus(ok) {
      finalizePersistStatus(ok);
    },
    commitDraft(ts) {
      _dirty = false;
      setSharedDraftState(ts);
      updateSaveBtn();
    },
    clearDraft() {
      clearDraftSaveOnlyChanges();
      clearSharedDraftState();
      clearCurrentLocalDraft();
      updateSaveBtn();
    },
    commitLiveSave(ts) {
      menuState._meta = { ...(menuState._meta || {}), lastUpdatedTs: String(ts) };
      lsSet(LS_KEYS.lastUpdated, String(ts));
      clearDraftSaveOnlyChanges();
      clearSharedDraftState();
      clearCurrentLocalDraft();
      updateSaveBtn();
      updateLastUpdatedLabel();
    },
    buildPreview(snapshot) {
      return buildMenuSessionPreview(snapshot);
    },
    getMenuId() {
      return MENU_ID;
    },
    getRestaurantId() {
      return RESTAURANT_ID;
    },
    getMenuName() {
      return _activeMenuName;
    },
    snapshotCurrentItemsAsLastSent() {
      return snapshotCurrentItemsAsLastSent();
    },
    getCurrentFeaturedIds() {
      return getCurrentFeaturedIds();
    },
    canEditRestaurantSpecials(restaurantId) {
      return currentUserCanEditRestaurantSpecials(restaurantId);
    },
    getRestaurantMenuIds(restaurantId) {
      return getRestaurantSpecialConfig(restaurantId)?.menuIds || [];
    },
    async dispatchNotification(payload) {
      return sendMenuNotificationThroughApi(payload);
    },
    collectNotificationWarnings(summary) {
      return summarizeNotificationWarnings(summary);
    },
    syncLocalCache(options = {}) {
      return syncLocalMenuCache(options);
    },
    commitPublished({ diff, ts, featuredIds }) {
      _lastSentFeaturedIds = new Set(featuredIds);
      applySentState(diff, ts);
      clearDraftSaveOnlyChanges();
      clearSharedDraftState();
      clearCurrentLocalDraft();
      updateSaveBtn();
      updateLastUpdatedLabel();
    },
    dedupeWarnings(warnings = []) {
      return dedupeWarningMessages(warnings);
    },
  };
}

function getSessionModuleBoundary() {
  if (globalThis.__HF_SESSION_MODULES__ && typeof globalThis.__HF_SESSION_MODULES__ === 'object') {
    return globalThis.__HF_SESSION_MODULES__;
  }
  return null;
}

function buildEmptyNotificationSummary() {
  return {
    anyOk: false,
    anyError: false,
    failedChannels: [],
    allSkipped: false,
  };
}

function summarizeNotificationWarnings(summary = {}) {
  if (summary.allSkipped) return ['No notification channels were enabled for this menu.'];
  if (summary.anyOk && summary.anyError) {
    const failedChannels = Array.isArray(summary.failedChannels) ? summary.failedChannels : [];
    return [`Some notification channels failed: ${failedChannels.map(channel => String(channel || '').toUpperCase()).join(', ')}.`];
  }
  return [];
}

function dedupeWarningMessages(warnings = []) {
  return Array.from(new Set((warnings || []).filter(Boolean)));
}

function serializeSectionsForUpdateLog(sections = []) {
  return (Array.isArray(sections) ? sections : []).map(section => ({
    id: section.id,
    icon: section.icon,
    label: section.label,
    displayOrder: Number.isFinite(Number(section.displayOrder)) ? Number(section.displayOrder) : 0,
    added: (section.changes || []).filter(change => change.kind === 'added').map(change => change.name),
    removed: (section.changes || []).filter(change => change.kind === 'removed').map(change => change.name),
    eightySixed: (section.changes || []).filter(change => change.kind === 'eightySixed').map(change => change.name),
    restored: (section.changes || []).filter(change => change.kind === 'restored').map(change => change.name),
  }));
}

async function sendMenuNotificationThroughApi(payload = {}) {
  if (!MENU_ID || !getAuthorizedApiHeaders().Authorization) {
    return {
      ok: false,
      skipped: true,
      statusCode: 0,
      summary: buildEmptyNotificationSummary(),
    };
  }
  const result = await postApiJson('/api/manager', {
    action: 'send_notification',
    menu_id: payload.menuId || MENU_ID,
    text: String(payload.patchMessage || '').trim(),
  }, {
    headers: getAuthorizedApiHeaders(),
  });
  if (!result.ok) {
    return {
      ok: false,
      skipped: false,
      statusCode: Number(result.status || 0),
      userMessage: result.payload?.error || 'Update could not be sent.',
      summary: buildEmptyNotificationSummary(),
    };
  }
  const rows = Array.isArray(result.payload?.results) ? result.payload.results : [];
  const summary = {
    anyOk: rows.some(row => row?.ok),
    anyError: rows.some(row => row?.ok === false),
    failedChannels: rows.filter(row => row?.ok === false).map(row => row?.channel).filter(Boolean),
    allSkipped: rows.length > 0 && rows.every(row => row?.skipped),
  };
  return {
    ok: !summary.anyError,
    skipped: summary.allSkipped,
    partial: summary.anyOk && summary.anyError,
    statusCode: Number(result.status || 200),
    summary,
  };
}

function createLegacyMenuPublishService(sessionPorts, runtime = {}) {
  const buildSnapshot = typeof runtime.buildSnapshot === 'function'
    ? runtime.buildSnapshot
    : (() => ({ source: 'unknown' }));
  const buildPreview = typeof runtime.buildPreview === 'function'
    ? runtime.buildPreview
    : (() => sessionPorts.buildPreview(buildSnapshot('preview')));
  const buildSaveDraftNoop = (preview, source = 'draft-noop') => ({
    ok: false,
    noop: true,
    preview,
    snapshot: buildSnapshot(source),
  });

  const service = {
    async saveDraft(options = {}) {
      const snapshot = buildSnapshot('draft');
      const preview = options.preview?.sections ? options.preview : buildPreview();
      const hasLocalDraft = !!snapshot.dirty || !!preview?.hasLocalDraft;
      const hasChanges = !!preview?.hasChanges;

      if (!hasLocalDraft || !hasChanges) {
        return buildSaveDraftNoop(preview);
      }

      if (typeof sessionPorts.publishMenuUpdate === 'function') {
        return sessionPorts.publishMenuUpdate({
          ...options,
          preview,
          mode: 'save',
          notify: false,
        });
      }

      return service.publishUpdate({
        ...options,
        preview,
        mode: 'save',
        notify: false,
      });
    },

    async publishUpdate(options = {}) {
      if (typeof sessionPorts.publishMenuUpdate === 'function') {
        return sessionPorts.publishMenuUpdate(options);
      }
      const preview = options.preview?.sections ? options.preview : buildPreview();
      const selectedChangeIds = options.selectedChangeIds || preview.notificationChanges.map(change => change.id);
      const selectedChanges = preview.notificationChanges.filter(change => selectedChangeIds.includes(change.id));
      const selectedSections = groupNotificationChangesBySection(selectedChanges);
      const patchMessage = String(preview.patchMessage || '').trim();
      const mode = options.mode || ((preview.mode === 'send' || preview.mode === 'update-only')
        ? (options.notify === false ? 'save' : 'send')
        : (options.notify === false ? 'save' : 'save-and-send'));
      if (!preview.hasChanges) {
        return {
          ok: false,
          noop: true,
          preview,
          snapshot: buildSnapshot('publish-noop'),
        };
      }

      const warnings = [];
      let liveSaveTs = null;
      if (preview.hasLocalDraft || preview.hasSharedDraft) {
        const persisted = await sessionPorts.persistState({ silentFailure: true });
        if (!persisted) {
          return {
            ok: false,
            preview,
            userHandled: true,
            snapshot: buildSnapshot('publish-live-save-failed'),
          };
        }
        liveSaveTs = sessionPorts.now();
        try {
          await sessionPorts.patchMenuMeta({ last_updated_ts: liveSaveTs });
          await sessionPorts.patchMenuDraftState(null, liveSaveTs);
        } catch (_) {
          warnings.push('Live menu saved, but the draft metadata could not be fully synced.');
        }
        sessionPorts.commitLiveSave?.(liveSaveTs);
        const cacheSynced = sessionPorts.syncLocalCache({ silent: true });
        if (!cacheSynced) warnings.push('This device could not refresh its local cache after the live save.');
      }

      const shouldNotify = (mode === 'save-and-send' || mode === 'send') && selectedSections.length > 0;
      let delivery = {
        ok: true,
        skipped: !shouldNotify,
        statusCode: null,
        summary: buildEmptyNotificationSummary(),
      };
      if (shouldNotify) {
        delivery = await sessionPorts.dispatchNotification({
          menuId: sessionPorts.getMenuId(),
          patchMessage,
        });
      }

      if (shouldNotify && delivery.partial) {
        warnings.push(...sessionPorts.collectNotificationWarnings(delivery.summary));
        warnings.push('Some channels did not receive the update. The lines remain ready to send again.');
        return {
          ok: true,
          preview,
          notificationStatus: delivery,
          warnings: sessionPorts.dedupeWarnings(warnings),
          warningMessage: sessionPorts.dedupeWarnings(warnings)[0] || '',
          successMessage: `✅ ${sessionPorts.getMenuName() || 'Menu'} saved live. Update still needs attention.`,
          snapshot: buildSnapshot('send-partial'),
        };
      }

      if (shouldNotify && !delivery.ok) {
        warnings.push(delivery.userMessage || 'Update could not be sent.');
        return {
          ok: true,
          preview,
          notificationStatus: delivery,
          warnings: sessionPorts.dedupeWarnings(warnings),
          warningMessage: sessionPorts.dedupeWarnings(warnings)[0] || '',
          successMessage: `✅ ${sessionPorts.getMenuName() || 'Menu'} saved live. Update still needs to be sent.`,
          snapshot: buildSnapshot('send-failed-live-saved'),
        };
      }

      if (shouldNotify) warnings.push(...sessionPorts.collectNotificationWarnings(delivery.summary));

      if (mode === 'save-and-send' || mode === 'send') {
        const ts = liveSaveTs || sessionPorts.now();
        const lastSentState = sessionPorts.snapshotCurrentItemsAsLastSent();
        await sessionPorts.patchMenuMeta({
          last_updated_ts: ts,
          last_sent_ts: ts,
          last_sent_state: lastSentState,
          last_sent_categories: preview.diff.map(section => section.id),
        });

        sessionPorts.commitPublished({
          diff: preview.diff,
          ts,
        });

        const cacheSynced = sessionPorts.syncLocalCache({ silent: true });
        if (!cacheSynced) {
          warnings.push('This device could not refresh its local cache after the send.');
        }

        const logged = patchMessage ? await sessionPorts.logUpdate(serializeSectionsForUpdateLog(selectedSections), patchMessage) : true;
        if (!logged) {
          warnings.push('The recent-changes audit log could not be written for this send.');
        }

        const finalWarnings = sessionPorts.dedupeWarnings(warnings);
        return {
          ok: true,
          preview,
          ts,
          truncated: preview.truncated,
          notificationStatus: shouldNotify ? delivery : null,
          warnings: finalWarnings,
          warningMessage: finalWarnings[0] || '',
          successMessage: shouldNotify
            ? `✅ ${sessionPorts.getMenuName() || 'Menu'} saved and sent!`
            : `✅ ${sessionPorts.getMenuName() || 'Menu'} update list cleared without notifying channels.`,
          snapshot: buildSnapshot(finalWarnings.length ? 'publish-warning' : 'publish-complete'),
        };
      }

      const finalWarnings = sessionPorts.dedupeWarnings(warnings);
      return {
        ok: true,
        preview,
        ts: liveSaveTs || sessionPorts.now(),
        truncated: preview.truncated,
        notificationStatus: shouldNotify ? delivery : null,
        warnings: finalWarnings,
        warningMessage: finalWarnings[0] || '',
        successMessage: `✅ ${sessionPorts.getMenuName() || 'Menu'} saved to the live menu.`,
        snapshot: buildSnapshot(finalWarnings.length ? 'publish-warning' : 'saved-live'),
      };
    },
  };

  return service;
}

function createMenuPublishService(sessionPorts, runtime = {}) {
  if (!_sessionModuleDelegationStack.has('createMenuPublishService')) {
    const boundary = getSessionModuleBoundary();
    if (typeof boundary?.createMenuPublishService === 'function') {
      _sessionModuleDelegationStack.add('createMenuPublishService');
      try {
        return boundary.createMenuPublishService(sessionPorts, runtime, {
          fallback: () => createLegacyMenuPublishService(sessionPorts, runtime),
        });
      } finally {
        _sessionModuleDelegationStack.delete('createMenuPublishService');
      }
    }
  }

  return createLegacyMenuPublishService(sessionPorts, runtime);
}

function createMenuSessionLifecycle(ports) {
  const sessionPorts = ports || getMenuSessionPorts();
  const buildPublishService = (nextSessionPorts, runtime = {}) => {
    const boundary = getSessionModuleBoundary();
    if (typeof boundary?.createMenuPublishService === 'function') {
      return boundary.createMenuPublishService(nextSessionPorts, runtime, {
        fallback: () => createLegacyMenuPublishService(nextSessionPorts, runtime),
      });
    }
    return createLegacyMenuPublishService(nextSessionPorts, runtime);
  };

  if (!_sessionModuleDelegationStack.has('createMenuSessionLifecycle')) {
    const boundary = getSessionModuleBoundary();
    if (typeof boundary?.createMenuSessionLifecycle === 'function') {
      _sessionModuleDelegationStack.add('createMenuSessionLifecycle');
      try {
        return boundary.createMenuSessionLifecycle(sessionPorts, {
          getMenuSessionPorts: () => getMenuSessionPorts(),
          createPublishService: buildPublishService,
        });
      } finally {
        _sessionModuleDelegationStack.delete('createMenuSessionLifecycle');
      }
    }
  }

  let request = sessionPorts.buildRequest();

  function syncRequest(overrides = {}) {
    request = { ...request, ...sessionPorts.buildRequest(overrides) };
    return request;
  }

  function buildSnapshot(source = 'live') {
    return sessionPorts.buildSnapshot(source, request);
  }

  const publishService = buildPublishService(sessionPorts, {
    buildSnapshot,
    buildPreview: () => sessionPorts.buildPreview(buildSnapshot('preview')),
  });

  const session = {
    syncRequest,
    snapshot(source = 'live') {
      syncRequest();
      return buildSnapshot(source);
    },
    async open(options = {}) {
      const nextRequest = syncRequest(options);
      const expectedRestaurantId = options.expectedRestaurantId || nextRequest.siteRestaurantId || '';

      if (options.resolveMenu !== false) {
        const resolution = await sessionPorts.resolveMenu({ request: nextRequest, ...options });
        if (resolution?.redirect) return resolution;
      }

      if (!sessionPorts.canLoadFromNetwork({ request: nextRequest, ...options })) {
        const fallback = sessionPorts.restoreFallback({ expectedRestaurantId, request: nextRequest, ...options });
        return {
          ok: true,
          source: fallback.source,
          usedFallback: fallback.usedFallback,
          showLoadError: false,
          snapshot: fallback.snapshot || buildSnapshot(fallback.source),
        };
      }

      try {
        const snapshot = await sessionPorts.loadState({
          request: nextRequest,
          fallbackToDefault: options.fallbackToDefault,
          includeFeatured: options.includeFeatured,
          persistCache: options.persistCache,
          source: options.source || 'network',
        });
        return {
          ok: true,
          source: snapshot.source || 'network',
          usedFallback: false,
          showLoadError: false,
          snapshot,
        };
      } catch (error) {
        const fallback = sessionPorts.restoreFallback({ expectedRestaurantId, request: nextRequest, error, ...options });
        return {
          ok: false,
          error,
          source: fallback.source,
          usedFallback: fallback.usedFallback,
          showLoadError: true,
          snapshot: fallback.snapshot || buildSnapshot(fallback.source),
        };
      }
    },
    async refresh(options = {}) {
      const nextRequest = syncRequest(options);
      if (options.reason === 'poll') {
        return sessionPorts.pollState({ request: nextRequest, ...options });
      }
      return {
        ok: true,
        snapshot: await sessionPorts.loadState({ request: nextRequest, ...options }),
      };
    },
    preview() {
      syncRequest();
      return sessionPorts.buildPreview(buildSnapshot('preview'));
    },
    async saveDraft(options = {}) {
      syncRequest(options);
      return publishService.saveDraft(options);
    },
    async publishUpdate(options = {}) {
      syncRequest(options);
      return publishService.publishUpdate(options);
    },
    async save(options = {}) {
      return session.saveDraft(options);
    },
    async sendUpdate(options = {}) {
      return session.publishUpdate(options);
    },
    getSnapshot(source = 'live') {
      return session.snapshot(source);
    },
    _syncRequest(nextRequest = {}) {
      return syncRequest(nextRequest);
    },
  };

  return session;
}

function ensureCurrentMenuSession(overrides = {}) {
  if (!_currentMenuSession) {
    _currentMenuSession = createMenuSessionLifecycle();
    _currentMenuSession.syncRequest(overrides);
  } else {
    _currentMenuSession.syncRequest(overrides);
  }
  return _currentMenuSession;
}

function createSettingsRoutePolicyService(deps = {}) {
  const getPageMode = typeof deps.getPageMode === 'function' ? deps.getPageMode : (() => _appPageMode);
  const getMenuId = typeof deps.getMenuId === 'function' ? deps.getMenuId : (() => MENU_ID);
  const getKnownMenuOrder = typeof deps.getKnownMenuOrder === 'function' ? deps.getKnownMenuOrder : (() => KNOWN_MENU_ORDER);
  const getRequestedMenu = typeof deps.getRequestedMenu === 'function' ? deps.getRequestedMenu : (() => getRequestedMenuForSettingsPage());
  const canManageMenu = typeof deps.canManageMenu === 'function' ? deps.canManageMenu : ((menuId, user) => currentUserCanManageMenu(menuId, user));
  const getFallbackMenuId = typeof deps.getFallbackMenuId === 'function' ? deps.getFallbackMenuId : (user => getFirstAccessibleManagerMenuId(user));
  const getManagerHref = typeof deps.getManagerHrefForMenuId === 'function' ? deps.getManagerHrefForMenuId : (menuId => getManagerHrefForMenuId(menuId));
  const getPublicHref = typeof deps.getPublicHrefForMenuId === 'function' ? deps.getPublicHrefForMenuId : (menuId => getPublicHrefForMenuId(menuId));

  return {
    decide(user = currentUser) {
      const pageMode = getPageMode();
      if (!user) {
        return {
          kind: 'auth-required',
          pageMode,
        };
      }

      if (pageMode === 'admin') {
        if (user.role !== 'admin') {
          return {
            kind: 'admin-denied',
            pageMode: 'admin',
            message: 'Admin access required for this page.',
          };
        }

        const knownMenuOrder = getKnownMenuOrder();
        const currentMenuId = getMenuId();
        return {
          kind: 'admin',
          pageMode: 'admin',
          targetMenuId: knownMenuOrder.includes(currentMenuId) ? currentMenuId : (knownMenuOrder[0] || ''),
        };
      }

      const requestedMenu = getRequestedMenu();
      if (!requestedMenu) {
        const fallbackMenuId = getFallbackMenuId(user);
        if (fallbackMenuId) {
          const targetPath = getManagerHref(fallbackMenuId);
          if (targetPath) {
            return {
              kind: 'manager-redirect',
              pageMode: 'manager',
              targetPath,
              menuId: fallbackMenuId,
            };
          }
        }
        return {
          kind: 'manager-denied',
          pageMode: 'manager',
          message: 'No menu context available for this page.',
        };
      }

      if (!canManageMenu(requestedMenu.id, user)) {
        const fallbackMenuId = getFallbackMenuId(user);
        if (fallbackMenuId) {
          const targetPath = getManagerHref(fallbackMenuId);
          if (targetPath) {
            return {
              kind: 'manager-redirect',
              pageMode: 'manager',
              targetPath,
              menuId: fallbackMenuId,
            };
          }
        }

        return {
          kind: 'manager-denied',
          pageMode: 'manager',
          message: 'You don\'t have manager access to this menu.',
          targetPath: getPublicHref(requestedMenu.id),
          redirectLabel: 'the public menu',
          actionLabel: 'Return to the public menu',
        };
      }

      return {
        kind: 'manager',
        pageMode: 'manager',
        targetMenuId: requestedMenu.id,
        requestedMenu,
      };
    },
  };
}

function resolveRequestedSettingsRoute(user = currentUser) {
  return createSettingsRoutePolicyService().decide(user);
}

function getAuthModuleBoundary() {
  if (globalThis.__HF_AUTH_MODULES__ && typeof globalThis.__HF_AUTH_MODULES__ === 'object') {
    return globalThis.__HF_AUTH_MODULES__;
  }
  return null;
}

function getUiModuleBoundary() {
  if (globalThis.__HF_UI_MODULES__ && typeof globalThis.__HF_UI_MODULES__ === 'object') {
    return globalThis.__HF_UI_MODULES__;
  }
  return null;
}

function lookupOpenFoodFactsProduct(barcode, deps = {}) {
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.lookupOpenFoodFactsProduct !== 'function') return Promise.resolve(null);
  return boundary.lookupOpenFoodFactsProduct(barcode, deps);
}

function searchUntappdBeers(query, deps = {}) {
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.searchUntappdBeers !== 'function') return Promise.resolve(null);
  return boundary.searchUntappdBeers(query, deps);
}

function previewUntappdBeerImport(bid, deps = {}) {
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.previewUntappdBeerImport !== 'function') return Promise.resolve(null);
  return boundary.previewUntappdBeerImport(bid, deps);
}

function createBarcodeScannerService(deps = {}) {
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createBarcodeScannerService !== 'function') return null;
  return boundary.createBarcodeScannerService(deps);
}

function buildManagerWorkspaceModuleDeps() {
  return {
    document,
    window,
    getCategoryDefs: () => CATEGORY_DEFS,
    getMenuState: () => menuState,
    getDraftChangeCount: () => getDraftChangeCount(),
    isDirty: () => syncLocalDraftDirtyState(),
    hasSharedDraft: () => hasSharedDraftState(),
    countDiffLines: () => countDiffLines(),
    createDraftLedgerService: () => createDraftLedgerService(),
    renderManagerCategories: () => renderManagerCategories(),
    renderPricingSection: () => renderPricingSection(),
    renderDescriptionSection: () => renderDescriptionSection(),
    renderFeaturedTab: () => renderFeaturedTab(),
    renderCategoriesTab: () => renderCategoriesTab(),
    updateManagerToolsContext: () => updateManagerToolsContext(),
    renderDatabaseTab: () => renderDatabaseTab(),
    renderPruneSection: () => renderPruneSection(),
    updateActiveMenuBar: () => updateActiveMenuBar(),
    renderRecentChanges: () => renderRecentChanges(),
    renderFooter: () => renderFooter(),
    initManagerMobileDrawerTrigger: () => initManagerMobileDrawerTrigger(),
    initDrawerSwipe: () => initDrawerSwipe(),
  };
}

function buildManagerSectionModuleDeps() {
  return {
    document,
    editSectionIds: MANAGER_EDIT_SECTION_IDS.slice(),
    renderManagerCategories: () => renderManagerCategories(),
    renderPricingSection: () => renderPricingSection(),
    renderDescriptionSection: () => renderDescriptionSection(),
  };
}

function buildManagerEditorsModuleDeps() {
  const base = _managerEditorsBase || {};
  return {
    renderManagerCategories: (...args) => (base.renderManagerCategories || renderManagerCategories)(...args),
    renderManagerItems: (...args) => (base.renderManagerItems || renderManagerItems)(...args),
    renderPricingSection: (...args) => (base.renderPricingSection || renderPricingSection)(...args),
    renderDescriptionSection: (...args) => (base.renderDescriptionSection || renderDescriptionSection)(...args),
  };
}

function buildAdminWorkspaceModuleDeps() {
  return {
    renderMenusPanel: () => renderMenusPanel(),
    initAdminSwitcherTab: tab => initAdminSwitcherTab(tab),
    loadUsers: () => loadUsers(),
    renderLandingWorkspace: () => renderLandingAdminWorkspace(),
  };
}

function buildAdminSwitcherModuleDeps() {
  const base = _adminSwitcherBase || {};
  return {
    loadAdminSwitcherData: (...args) => (base.loadAdminSwitcherData || loadAdminSwitcherData)(...args),
    initAdminSwitcherTab: (...args) => (base.initAdminSwitcherTab || initAdminSwitcherTab)(...args),
    onAdminSwitcherRestaurantChange: (...args) => (base.onAdminSwitcherRestaurantChange || onAdminSwitcherRestaurantChange)(...args),
    onAdminSwitcherMenuChange: (...args) => (base.onAdminSwitcherMenuChange || onAdminSwitcherMenuChange)(...args),
  };
}

function buildPublicFooterActionsModuleDeps() {
  return {
    document,
    getCurrentUser: () => currentUser,
    getMenuId: () => MENU_ID,
    getRestaurantId: () => RESTAURANT_ID,
    currentUserCanManageMenu: (menuId, user) => currentUserCanManageMenu(menuId, user),
    getManagerHrefForMenuId: menuId => getManagerHrefForMenuId(menuId),
    getAdminHrefForMenuId: menuId => getAdminHrefForMenuId(menuId),
    requestSignIn: options => requestSignIn(options),
    navigateToPage: href => navigateToPage(href),
    signOut: () => signOut(),
  };
}

function buildPublicRendererModuleDeps() {
  const base = _publicRendererBase || {};
  return {
    renderPublicView: (...args) => (base.renderPublicView || renderPublicView)(...args),
    renderPublicViews: (...args) => (base.renderPublicViews || renderPublicViews)(...args),
  };
}

function getManagerWorkspaceService() {
  if (_managerWorkspaceService) return _managerWorkspaceService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createManagerWorkspaceService !== 'function') return null;
  _managerWorkspaceService = boundary.createManagerWorkspaceService(buildManagerWorkspaceModuleDeps());
  return _managerWorkspaceService;
}

function getManagerSectionService() {
  if (_managerSectionService) return _managerSectionService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createManagerSectionService !== 'function') return null;
  _managerSectionService = boundary.createManagerSectionService(buildManagerSectionModuleDeps());
  return _managerSectionService;
}

function getManagerEditorsService() {
  if (_managerEditorsService) return _managerEditorsService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createManagerEditorsService !== 'function') return null;
  _managerEditorsService = boundary.createManagerEditorsService(buildManagerEditorsModuleDeps());
  return _managerEditorsService;
}

function getAdminWorkspaceService() {
  if (_adminWorkspaceService) return _adminWorkspaceService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createAdminWorkspaceService !== 'function') return null;
  _adminWorkspaceService = boundary.createAdminWorkspaceService(buildAdminWorkspaceModuleDeps());
  return _adminWorkspaceService;
}

function getAdminSwitcherService() {
  if (_adminSwitcherService) return _adminSwitcherService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createAdminSwitcherService !== 'function') return null;
  _adminSwitcherService = boundary.createAdminSwitcherService(buildAdminSwitcherModuleDeps());
  return _adminSwitcherService;
}

function getPublicFooterActionsService() {
  if (_publicFooterActionsService) return _publicFooterActionsService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createPublicFooterActionsService !== 'function') return null;
  _publicFooterActionsService = boundary.createPublicFooterActionsService(buildPublicFooterActionsModuleDeps());
  return _publicFooterActionsService;
}

function getPublicRendererService() {
  if (_publicRendererService) return _publicRendererService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createPublicRendererService !== 'function') return null;
  _publicRendererService = boundary.createPublicRendererService(buildPublicRendererModuleDeps());
  return _publicRendererService;
}

function buildAccessSessionModuleDeps() {
  return {
    getSupabaseConfig: () => ({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }),
    getStorageValue(key) {
      const map = {
        accessToken: LS_KEYS.accessToken,
        refreshToken: LS_KEYS.refreshToken,
        expiresAt: LS_KEYS.expiresAt,
        uid: LS_KEYS.uid,
        email: LS_KEYS.email,
      };
      return localStorage.getItem(map[key] || key);
    },
    clearStorageValue(key) {
      const map = {
        accessToken: LS_KEYS.accessToken,
        refreshToken: LS_KEYS.refreshToken,
        expiresAt: LS_KEYS.expiresAt,
        uid: LS_KEYS.uid,
        email: LS_KEYS.email,
      };
      localStorage.removeItem(map[key] || key);
    },
    now: () => Date.now(),
    fetchProfile: token => sbGetProfile(token),
    refreshToken: refresh => sbRefreshToken(refresh),
    applySession: (data, role, name, accessibleMenuIds) => _applySession(data, role, name, accessibleMenuIds),
    applyRole: role => applyRole(role),
    closeAuthOverlay: () => closeAuthOverlay(),
    getLocationHash: () => window.location.hash || '',
    clearLocationHash: () => history.replaceState({}, '', window.location.pathname),
    setRecoverySessionData: value => { _recoverySessionData = value; },
    setCurrentUser: value => { currentUser = value; },
    scheduleTokenRefresh: expiresAt => _scheduleTokenRefresh(expiresAt),
    syncRequestedPageModeImpl: () => syncRequestedPageModeLegacy(),
    scheduleRetry: (callback, delayMs) => setTimeout(callback, delayMs),
    retryDelayMs: 2000,
  };
}

function buildAuthOverlayControllerDeps() {
  return {
    getDocument: () => document,
    getWindow: () => window,
    getSupabaseConfig: () => ({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }),
    setSettingsShellPending: value => _setSettingsShellPending(value),
    getRecoverySessionData: () => _recoverySessionData,
    setRecoverySessionData: value => { _recoverySessionData = value; },
    setAuthScreen: value => { _authScreen = value; },
    mountAuthOverlayTemplate: targetDocument => getAuthModuleBoundary()?.mountAuthOverlayTemplate?.(targetDocument),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    handleSignIn: () => handleSignIn(),
    handleSignUp: () => handleSignUp(),
    handleForgotPassword: () => handleForgotPassword(),
    handleResetPassword: () => handleResetPassword(),
  };
}

function getAuthOverlayController() {
  if (_authOverlayController) return _authOverlayController;
  const boundary = getAuthModuleBoundary();
  if (typeof boundary?.createAuthOverlayController !== 'function') return null;
  _authOverlayController = boundary.createAuthOverlayController(buildAuthOverlayControllerDeps());
  return _authOverlayController;
}

function createAccessSessionService() {
  if (!_authModuleDelegationStack.has('createAccessSessionService')) {
    const boundary = getAuthModuleBoundary();
    if (typeof boundary?.createAccessSessionService === 'function') {
      _authModuleDelegationStack.add('createAccessSessionService');
      try {
        return boundary.createAccessSessionService(buildAccessSessionModuleDeps());
      } finally {
        _authModuleDelegationStack.delete('createAccessSessionService');
      }
    }
  }

  return {
    async applyAuthenticatedSession(data, options = {}) {
      const { closeOverlay = false } = options;
      const sessionProfile = await resolveAuthenticatedSessionProfile(data?.access_token);
      _applySession(data, sessionProfile.role, sessionProfile.name, sessionProfile.accessibleMenuIds);
      applyRole(sessionProfile.role);
      if (closeOverlay) closeAuthOverlay();
      return sessionProfile;
    },

    async handleRecoveryCallback() {
      const hash = window.location.hash.slice(1);
      if (!hash) return { handled: false };
      const params = new URLSearchParams(hash);
      if (params.get('type') !== 'recovery') return { handled: false };
      const accessToken = params.get('access_token');
      if (!accessToken) return { handled: false };
      history.replaceState({}, '', window.location.pathname);
      _recoverySessionData = {
        access_token: accessToken,
        refresh_token: params.get('refresh_token') || '',
        expires_in: Number(params.get('expires_in') || 3600),
      };
      return {
        handled: true,
        screen: 'reset',
      };
    },

    async restoreStoredSession() {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { restored: false, reason: 'not-configured' };
      const storedAccess = localStorage.getItem(LS_KEYS.accessToken);
      const storedRefresh = localStorage.getItem(LS_KEYS.refreshToken);
      const storedExpiresAt = Number(localStorage.getItem(LS_KEYS.expiresAt) || 0);
      const storedUid = localStorage.getItem(LS_KEYS.uid) || '';
      const storedEmail = localStorage.getItem(LS_KEYS.email) || '';
      if (!storedRefresh) return { restored: false, reason: 'no-refresh-token' };

      if (storedAccess && storedExpiresAt > Date.now() + 120_000) {
        try {
          const profile = await resolveAuthenticatedSessionProfile(storedAccess);
          currentUser = {
            uid: storedUid,
            email: storedEmail,
            name: profile.name,
            role: profile.role,
            accessibleMenuIds: profile.accessibleMenuIds,
            accessToken: storedAccess,
            refreshToken: storedRefresh,
            expiresAt: storedExpiresAt,
          };
          _scheduleTokenRefresh(storedExpiresAt);
          applyRole(profile.role);
          return { restored: true, source: 'stored-access', profile };
        } catch (_) {
          // fall through to refresh flow
        }
      }

      const refreshStoredSession = async () => {
        const refresh = localStorage.getItem(LS_KEYS.refreshToken);
        if (!refresh) throw new Error('no refresh token');
        const data = await sbRefreshToken(refresh);
        const session = await this.applyAuthenticatedSession(data);
        return { data, session };
      };

      try {
        const refreshed = await refreshStoredSession();
        return { restored: true, source: 'refresh-token', ...refreshed };
      } catch (error) {
        if (isTerminalAuthSessionError(error)) {
          clearStoredAuthSessionKeys();
          return { restored: false, reason: 'expired' };
        }
        setTimeout(async () => {
          try {
            await refreshStoredSession();
            await this.syncRequestedPageMode();
          } catch (retryError) {
            if (!isTerminalAuthSessionError(retryError)) return;
            clearStoredAuthSessionKeys();
          }
        }, 2000);
        return { restored: false, reason: 'retry-scheduled' };
      }
    },

    async syncRequestedPageMode() {
      return syncRequestedPageModeLegacy();
    },
  };
}

async function syncRequestedPageModeLegacy() {
  if (!isSettingsPage()) return { handled: false };

  const publicView = document.getElementById('public-view');
  const managerView = document.getElementById('manager-view');
  if (!publicView || !managerView) return { handled: false };

  _clearSettingsRedirectPrompt();
  renderUserHeader();

  const requireAuth = () => {
    isManagerMode = false;
    isAdminMode = false;
    document.body.classList.remove('manager-mode');
    publicView.style.display = 'none';
    managerView.style.display = 'none';
    _setLoadingMessage('Sign in to access settings.', { hideSpinner: true, showLockedState: true });
    requestSignIn({ screen: 'signin', origin: 'settings-gate', reason: 'settings-auth-required' });
    return {
      handled: true,
      status: 'auth-required',
      pageMode: _appPageMode,
    };
  };

  if (!currentUser) return requireAuth();
  const authOverlay = document.getElementById('auth-overlay');
  if (authOverlay?.classList.contains('open')) closeAuthOverlay();

  if (_appPageMode === 'manager') {
    _setLoadingMessage('Checking manager access…');
    const profile = await refreshCurrentUserProfile();
    if (profile?.authExpired) return requireAuth();
  }

  const routeDecision = resolveRequestedSettingsRoute();

  if (routeDecision.kind === 'auth-required') {
    return requireAuth();
  }

  if (routeDecision.kind === 'admin-denied') {
    showAdminAccessDenied(routeDecision.message);
    return {
      handled: true,
      status: 'access-denied',
      pageMode: 'admin',
    };
  }

  if (routeDecision.kind === 'admin') {
    _setLoadingMessage('Loading settings…');
    if (!routeDecision.targetMenuId) {
      showAdminAccessDenied('No menu context available for this page.');
      return {
        handled: true,
        status: 'context-missing',
        pageMode: 'admin',
      };
    }
    const hasMenuContext = await _loadSettingsPageMenuContext(routeDecision.targetMenuId);
    if (!hasMenuContext) {
      showAdminAccessDenied('No menu context available for this page.');
      return {
        handled: true,
        status: 'context-missing',
        pageMode: 'admin',
      };
    }
    enterAdmin();
    return {
      handled: true,
      status: 'entered',
      pageMode: 'admin',
      menuId: routeDecision.targetMenuId,
    };
  }

  if (routeDecision.kind === 'manager-redirect') {
    navigateToPage(routeDecision.targetPath);
    return {
      handled: true,
      status: 'redirected',
      pageMode: 'manager',
      menuId: routeDecision.menuId,
      targetPath: routeDecision.targetPath,
    };
  }

  if (routeDecision.kind === 'manager-denied') {
    showManagerAccessDenied(routeDecision.message, {
      targetPath: routeDecision.targetPath,
      redirectLabel: routeDecision.redirectLabel,
      actionLabel: routeDecision.actionLabel,
    });
    return {
      handled: true,
      status: 'access-denied',
      pageMode: 'manager',
    };
  }

  _managerMenuPicked = true;
  _setLoadingMessage('Loading settings…');
  const hasMenuContext = await _loadSettingsPageMenuContext(routeDecision.targetMenuId);
  if (!hasMenuContext) {
    showManagerAccessDenied('Selected menu is no longer available for this account.', {
      targetPath: getPublicHrefForMenuId(routeDecision.targetMenuId),
      redirectLabel: 'the public menu',
      actionLabel: 'Return to the public menu',
    });
    return {
      handled: true,
      status: 'context-missing',
      pageMode: 'manager',
      menuId: routeDecision.targetMenuId,
    };
  }
  enterManager();
  return {
    handled: true,
    status: 'entered',
    pageMode: 'manager',
    menuId: routeDecision.targetMenuId,
  };
}

function getAccessSessionService() {
  if (_accessSessionService) return _accessSessionService;
  _accessSessionService = createAccessSessionService();
  return _accessSessionService;
}

function buildFallbackMenuContext(context = {}) {
  const resolvedMenu = getMenuById(context.menuId) || getMenuBySlug(context.menuSlug || '');
  const restaurantId = context.restaurantId || resolvedMenu?.restaurantId || '';
  const menuId = context.menuId || resolvedMenu?.id || '';
  const menuType = context.menuType || resolvedMenu?.type || MENU_TYPE || 'drinks';
  return {
    menuId,
    restaurantId,
    menuType: (menuType || 'drinks').toLowerCase() === 'food' ? 'food' : 'drinks',
  };
}

function buildFallbackContextKey(context = {}) {
  const resolved = buildFallbackMenuContext(context);
  return `${resolved.restaurantId || ''}:${resolved.menuId || ''}:${resolved.menuType || ''}`;
}

function createMenuFallbackStore({ storage = localStorage, storageKey = LS_KEYS.menuCache }) {
  function parseStore() {
    const raw = storage.getItem(storageKey);
    if (!raw) return { version: 2, entries: {} };
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 2 && parsed?.entries && typeof parsed.entries === 'object') {
        return parsed;
      }
      const context = buildFallbackMenuContext(parsed?.context || {});
      if (context.menuId && context.restaurantId && parsed?.cats) {
        return {
          version: 2,
          entries: {
            [buildFallbackContextKey(context)]: {
              context,
              snapshot: parsed,
            },
          },
        };
      }
      return { version: 2, entries: {} };
    } catch (_) {
      return { version: 2, entries: {} };
    }
  }

  function persist(context = {}, snapshot = null, options = {}) {
    const resolved = buildFallbackMenuContext(context);
    if (!resolved.menuId || !isValidRestaurant(resolved.restaurantId) || !snapshot) return false;
    const store = parseStore();
    store.entries[buildFallbackContextKey(resolved)] = {
      context: resolved,
      snapshot: {
        ...snapshot,
        context: resolved,
      },
    };
    return lsSet(storageKey, JSON.stringify(store), options);
  }

  function restore(context = {}) {
    const resolved = buildFallbackMenuContext(context);
    const store = parseStore();
    if (!resolved.menuId && !resolved.restaurantId) return null;
    const directMatch = resolved.menuId
      ? store.entries[buildFallbackContextKey(resolved)] || null
      : null;
    const fallbackMatch = directMatch || Object.values(store.entries).find(entry => {
      const entryContext = buildFallbackMenuContext(entry?.context || {});
      if (!entryContext.menuId || !entryContext.restaurantId) return false;
      if (resolved.menuId && entryContext.menuId !== resolved.menuId) return false;
      if (resolved.restaurantId && entryContext.restaurantId !== resolved.restaurantId) return false;
      if (resolved.menuType && entryContext.menuType !== resolved.menuType) return false;
      return true;
    });
    return fallbackMatch?.snapshot || null;
  }

  return {
    persist,
    restore,
  };
}

function getMenuFallbackStore() {
  if (_menuFallbackStore) return _menuFallbackStore;
  _menuFallbackStore = createMenuFallbackStore({});
  return _menuFallbackStore;
}

function readCachedMenuState(expectedContext = '') {
  const context = typeof expectedContext === 'string'
    ? { restaurantId: expectedContext, menuId: MENU_ID, menuType: MENU_TYPE }
    : (expectedContext || {});
  return getMenuFallbackStore().restore(context);
}

function getDefaultMenuForRestaurant(restaurant) {
  if (!isValidRestaurant(restaurant?.id)) return MENUS.LEROYS_FOOD;
  return knownMenuList().find(menu => (
    menu.restaurantId === restaurant.id && menu.type === 'food'
  )) || MENUS.LEROYS_FOOD;
}

function primeSiteRestaurantMenu(restaurant) {
  const preferredMenu = getDefaultMenuForRestaurant(restaurant);
  MENU_ID = preferredMenu.id;
  lsSet(LS_KEYS.menuId, MENU_ID);
  setActiveMenuContext(preferredMenu.name, preferredMenu.type, preferredMenu.restaurantId);
  const href = getPublicHrefForMenuId(preferredMenu.id);
  if (href) history.replaceState({}, '', new URL(href, window.location.origin).toString());
}

function showPickerPage() {
  document.body.classList.add('is-site-picker');
  document.getElementById('site-picker-view')?.removeAttribute('hidden');
  const appShell = document.getElementById('app-shell');
  if (appShell) appShell.style.display = 'none';
  document.getElementById('auth-overlay')?.classList.remove('open');
  closeMenuPicker({ skipOnClose: true });
  document.title = 'Leroy\'s Lounge & El Roy\'s Cantina';
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

function getLandingPageEndpoint(includeDraft = false) {
  return includeDraft ? '/api/admin?action=landing_page_state' : '/api/public?action=landing';
}

function hasLandingRootShell() {
  return !!document.getElementById('landing-root-shell');
}

function hasLandingAdminShell() {
  return !!document.getElementById('admin-landing-page-section');
}

function setLandingPageState(record, options = {}) {
  _landingPageState = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  if (typeof options.dirty === 'boolean') _landingPageDirty = options.dirty;
  return _landingPageState;
}

function landingSectionHasDiff(sectionId, record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  return JSON.stringify(normalized.draftContent[sectionId] || {}) !== JSON.stringify(normalized.liveContent[sectionId] || {});
}

function getLandingDraftDiffSectionIds(record = _landingPageState) {
  return LANDING_PAGE_SECTION_ORDER.filter(sectionId => landingSectionHasDiff(sectionId, record));
}

function syncLandingDirtyFlag(value = false) {
  _landingPageDirty = !!value;
  return _landingPageDirty;
}

async function fetchLandingPageRecordFromSupabase(options = {}) {
  const includeDraft = options.includeDraft === true;
  const payload = await readApiJsonOrNull(getLandingPageEndpoint(includeDraft), {
    headers: includeDraft ? getAuthorizedApiHeaders() : {},
  });
  if (!payload) throw new Error('Landing page state is missing.');
  return normalizeLandingPageRecord(payload);
}

async function ensureLandingPageStateLoaded(options = {}) {
  const { force = false, includeDraft = hasLandingAdminShell() } = options;
  if (_landingPageState && !force) return _landingPageState;
  if (_landingPageLoadPromise && !force) return _landingPageLoadPromise;
  _landingPageLoadPromise = (async () => {
    try {
      const record = await fetchLandingPageRecordFromSupabase({ includeDraft });
      _landingPageLoadError = '';
      setLandingPageState(record, { dirty: false });
      syncLandingDirtyFlag(false);
      return _landingPageState;
    } catch (error) {
      _landingPageLoadError = error?.message || 'Landing page state could not be loaded.';
      throw error;
    } finally {
      _landingPageLoadPromise = null;
    }
  })();
  return _landingPageLoadPromise;
}

async function upsertLandingPageRecord(payload = {}, action = 'save_landing_page_draft') {
  if (!currentUser?.accessToken) throw new Error('Sign in as an admin to edit the landing page.');
  const result = await postApiJson('/api/admin', {
    action,
    ...payload,
  }, {
    headers: getAuthorizedApiHeaders(),
  });
  if (!result.ok) throw new Error(result.payload?.error || 'Landing page save failed.');
  const row = result.payload?.record || result.payload;
  return normalizeLandingPageRecord(row);
}

function formatLandingTimestampLabel(value) {
  const ts = Number(value || 0);
  if (!ts) return 'Not yet';
  return formatUpdatedAt(ts);
}

function getLandingSectionStatus(sectionId, record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const hasDraftDiff = landingSectionHasDiff(sectionId, normalized);
  const validation = sectionId === 'hours'
    ? validateLandingHoursSection(getLandingHoursSectionForValidation(normalized))
    : getLandingSectionValidation(sectionId, normalized);
  return {
    sectionId,
    label: LANDING_PAGE_SECTION_LABELS[sectionId] || sectionId,
    hasDraftDiff,
    isValid: validation.valid,
    issues: validation.issues,
  };
}

function renderLandingHoursRowsHtml(section = {}, restaurantId = '', restaurantLabel = '') {
  const restaurantHours = getLandingHoursForRestaurant(section, restaurantId);
  return `
    <article class="landing-admin-hours-card">
      <div class="landing-admin-hours-card-header">
        <div>
          <p class="settings-section-kicker">${escHtml(restaurantLabel)}</p>
          <h5>${escHtml(restaurantLabel)}</h5>
        </div>
        <span class="landing-hours-summary">Published hero line follows this recurring schedule.</span>
      </div>
      <div class="landing-hours-day-grid">
        ${LANDING_DAY_ORDER.map(dayKey => {
          const day = restaurantHours.days[dayKey];
          const safeRestaurantId = escAttrJs(restaurantId);
          const safeDayKey = escAttrJs(dayKey);
          return `
            <div class="landing-hours-day-row">
              <div class="landing-hours-day-header">
                <label for="landing-hours-${escHtml(restaurantId)}-${escHtml(dayKey)}-open">${escHtml(LANDING_DAY_LABELS[dayKey])}</label>
              </div>
              <div class="landing-hours-day-controls">
                <select
                  id="landing-hours-${escHtml(restaurantId)}-${escHtml(dayKey)}-open"
                  data-landing-hours-field="open"
                  data-landing-hours-restaurant="${escHtml(restaurantId)}"
                  data-landing-hours-day="${escHtml(dayKey)}"
                  aria-label="${escHtml(`${restaurantLabel} ${LANDING_DAY_LABELS[dayKey]} open time`)}"
                  ${day.closed ? 'disabled' : ''}
                  onchange="setLandingHoursField(${safeRestaurantId}, ${safeDayKey}, 'open', this.value)"
                >
                  ${renderLandingTimeSelectOptions(day.open, 'Open time')}
                </select>
                <select
                  id="landing-hours-${escHtml(restaurantId)}-${escHtml(dayKey)}-close"
                  data-landing-hours-field="close"
                  data-landing-hours-restaurant="${escHtml(restaurantId)}"
                  data-landing-hours-day="${escHtml(dayKey)}"
                  aria-label="${escHtml(`${restaurantLabel} ${LANDING_DAY_LABELS[dayKey]} close time`)}"
                  ${day.closed ? 'disabled' : ''}
                  onchange="setLandingHoursField(${safeRestaurantId}, ${safeDayKey}, 'close', this.value)"
                >
                  ${renderLandingTimeSelectOptions(day.close, 'Close time')}
                </select>
              </div>
              <div class="landing-hours-day-footer">
                <label class="landing-hours-toggle" for="landing-hours-${escHtml(restaurantId)}-${escHtml(dayKey)}-closed">
                  <input
                    id="landing-hours-${escHtml(restaurantId)}-${escHtml(dayKey)}-closed"
                    type="checkbox"
                    data-landing-hours-field="closed"
                    data-landing-hours-restaurant="${escHtml(restaurantId)}"
                    data-landing-hours-day="${escHtml(dayKey)}"
                    ${day.closed ? 'checked' : ''}
                    onchange="setLandingHoursField(${safeRestaurantId}, ${safeDayKey}, 'closed', this.checked)"
                  >
                  Closed
                </label>
              </div>
            </div>`;
        }).join('')}
      </div>
    </article>`;
}
function renderLandingTargetOptionsHtml(selectedTarget = '', options = {}) {
  const { includeBoth = true } = options;
  const values = [];
  if (includeBoth) values.push({ value: LANDING_TARGET_BOTH, label: 'Both' });
  knownLandingRestaurants().forEach(restaurant => {
    values.push({ value: restaurant.id, label: restaurant.name });
  });
  return values.map(option => (
    `<option value="${escHtml(option.value)}" ${option.value === selectedTarget ? 'selected' : ''}>${escHtml(option.label)}</option>`
  )).join('');
}
function renderLandingRatingOptionsHtml(selectedValue = '') {
  const rating = Number(selectedValue);
  const normalized = Number.isFinite(rating) ? String(rating) : '';
  const options = ['<option value="">Rating</option>'];
  for (let value = 5; value >= 1; value -= 1) {
    options.push(`<option value="${value}" ${normalized === String(value) ? 'selected' : ''}>${value} Stars</option>`);
  }
  return options.join('');
}
function getLandingItemStatusClass(status = '') {
  if (status === LANDING_ITEM_STATUS_LIVE) return 'is-live';
  if (status === LANDING_ITEM_STATUS_ARCHIVED) return 'is-archived';
  if (status === LANDING_ITEM_STATUS_MISSING) return 'is-blocked';
  return 'is-draft';
}
function renderLandingStatusBadgeHtml(status = '') {
  return `<span class="landing-admin-item-status ${getLandingItemStatusClass(status)}">${escHtml(status)}</span>`;
}
function renderLandingImportMetaHtml(meta = {}) {
  const normalized = normalizeLandingImportMeta(meta);
  const messages = normalized.messages.length
    ? `<ul class="landing-import-message-list">${normalized.messages.map(message => `<li>${escHtml(message)}</li>`).join('')}</ul>`
    : '';
  return `
    <div class="landing-import-meta">
      <p><strong>${escHtml(formatLandingImportStatusLabel(normalized.status))}</strong> · ${escHtml(formatLandingImportTimestamp(normalized))}</p>
      ${normalized.sourceUrl ? `<p><a href="${escHtml(normalized.sourceUrl)}" target="_blank" rel="noreferrer">${escHtml(normalized.sourceUrl)}</a></p>` : ''}
      ${messages}
    </div>`;
}
function formatLandingEventScheduleLine(item = {}) {
  const parts = [];
  if (item.eventDate) parts.push(formatLandingDateLabel(item.eventDate));
  const startLabel = parseLandingTimeToMinutes(item.startTime);
  if (startLabel !== null) {
    let timeLabel = formatLandingMinutes(startLabel);
    const endMinutes = parseLandingTimeToMinutes(item.endTime);
    if (endMinutes !== null) {
      timeLabel += ` - ${formatLandingMinutes(endMinutes)}`;
    } else if (item.timingNote?.trim()) {
      timeLabel += ` · ${item.timingNote.trim()}`;
    }
    parts.push(timeLabel);
  } else if (item.timingNote?.trim()) {
    parts.push(item.timingNote.trim());
  }
  return parts.filter(Boolean).join(' · ');
}
function setLandingPanelBadge(sectionId = '', validation = { valid: true }, options = {}) {
  const badgeEl = document.getElementById(`landing-${sectionId}-panel-badge`);
  if (!badgeEl) return;
  const label = validation.valid ? (options.readyLabel || 'Ready') : 'Blocked';
  badgeEl.textContent = label;
  badgeEl.className = `landing-admin-section-badge ${validation.valid ? 'is-ready' : 'is-blocked'}`;
}
function renderLandingEventCardHtml(item = {}, liveSection = { items: [] }) {
  const safeId = escAttrJs(item.id);
  const status = getLandingItemStatusLabel('events', item, liveSection);
  const validation = validateLandingEventItem(item);
  return `
    <article class="landing-admin-editor-card">
      <div class="landing-admin-editor-head">
        <div class="landing-admin-editor-head-copy">
          <span class="landing-tag ${getLandingTargetAccentClass(item.target)}">${escHtml(getLandingTargetLabel(item.target))}</span>
          ${renderLandingStatusBadgeHtml(status)}
        </div>
        <button type="button" class="btn-small" onclick="toggleLandingEventArchived(${safeId}, ${item.archived ? 'false' : 'true'})">${item.archived ? 'Restore' : 'Archive'}</button>
      </div>
      <div class="landing-admin-field-grid landing-admin-field-grid--events">
        <label class="landing-admin-field">
          <span>Target</span>
          <select class="landing-admin-input" onchange="updateLandingEventField(${safeId}, 'target', this.value)">
            ${renderLandingTargetOptionsHtml(item.target, { includeBoth: true })}
          </select>
        </label>
        <label class="landing-admin-field">
          <span>Title</span>
          <input class="landing-admin-input" type="text" value="${escHtml(item.title)}" placeholder="Jazz trio downstairs" onchange="updateLandingEventField(${safeId}, 'title', this.value)">
        </label>
        <label class="landing-admin-field">
          <span>Date</span>
          <input class="landing-admin-input" type="date" value="${escHtml(item.eventDate)}" onchange="updateLandingEventField(${safeId}, 'eventDate', this.value)">
        </label>
        <label class="landing-admin-field">
          <span>Starts</span>
          <select class="landing-admin-input" onchange="updateLandingEventField(${safeId}, 'startTime', this.value)">
            ${renderLandingTimeSelectOptions(item.startTime, 'Start time')}
          </select>
        </label>
        <label class="landing-admin-field">
          <span>Ends</span>
          <select class="landing-admin-input" onchange="updateLandingEventField(${safeId}, 'endTime', this.value)">
            ${renderLandingTimeSelectOptions(item.endTime, 'End time')}
          </select>
        </label>
        <label class="landing-admin-field">
          <span>Timing note</span>
          <input class="landing-admin-input" type="text" value="${escHtml(item.timingNote)}" placeholder="Until late" onchange="updateLandingEventField(${safeId}, 'timingNote', this.value)">
        </label>
      </div>
      <label class="landing-admin-field">
        <span>Description</span>
        <textarea class="landing-admin-textarea" rows="3" placeholder="Short event description" onchange="updateLandingEventField(${safeId}, 'body', this.value)">${escHtml(item.body)}</textarea>
      </label>
      <div class="landing-admin-editor-foot">
        <p class="landing-admin-editor-meta">${escHtml(formatLandingEventScheduleLine(item) || 'Date and time will show here.')}</p>
        ${!validation.valid ? `<p class="landing-admin-editor-warning">Missing ${escHtml(validation.missingFields.join(', '))}.</p>` : ''}
      </div>
    </article>`;
}
function renderLandingNewsCardHtml(item = {}, liveSection = { items: [] }) {
  const safeId = escAttrJs(item.id);
  const status = getLandingItemStatusLabel('news', item, liveSection);
  const validation = validateLandingNewsItem(item);
  return `
    <article class="landing-admin-editor-card">
      <div class="landing-admin-editor-head">
        <div class="landing-admin-editor-head-copy">
          <span class="landing-tag ${getLandingTargetAccentClass(item.target)}">${escHtml(getLandingTargetLabel(item.target))}</span>
          ${renderLandingStatusBadgeHtml(status)}
        </div>
        <div class="landing-admin-inline-actions">
          <button type="button" class="btn-small" onclick="refreshLandingNewsItem(${safeId})">Refresh</button>
          <button type="button" class="btn-small" onclick="toggleLandingNewsArchived(${safeId}, ${item.archived ? 'false' : 'true'})">${item.archived ? 'Restore' : 'Archive'}</button>
        </div>
      </div>
      <div class="landing-admin-field-grid">
        <label class="landing-admin-field">
          <span>Target</span>
          <select class="landing-admin-input" onchange="updateLandingNewsField(${safeId}, 'target', this.value)">
            ${renderLandingTargetOptionsHtml(item.target, { includeBoth: true })}
          </select>
        </label>
        <label class="landing-admin-field">
          <span>Source</span>
          <input class="landing-admin-input" type="text" value="${escHtml(item.source)}" placeholder="Detroit Free Press" onchange="updateLandingNewsField(${safeId}, 'source', this.value)">
        </label>
        <label class="landing-admin-field landing-admin-field--wide">
          <span>Headline</span>
          <input class="landing-admin-input" type="text" value="${escHtml(item.title)}" placeholder="Imported headline" onchange="updateLandingNewsField(${safeId}, 'title', this.value)">
        </label>
        <label class="landing-admin-field landing-admin-field--wide">
          <span>Article URL</span>
          <input class="landing-admin-input" type="url" value="${escHtml(item.href)}" placeholder="https://..." onchange="updateLandingNewsField(${safeId}, 'href', this.value)">
        </label>
        <label class="landing-admin-field">
          <span>Publish date</span>
          <input class="landing-admin-input" type="date" value="${escHtml(item.publishedDate)}" onchange="updateLandingNewsField(${safeId}, 'publishedDate', this.value)">
        </label>
        <label class="landing-admin-field landing-admin-field--wide">
          <span>Image URL</span>
          <input class="landing-admin-input" type="url" value="${escHtml(item.imageUrl)}" placeholder="Optional image" onchange="updateLandingNewsField(${safeId}, 'imageUrl', this.value)">
        </label>
      </div>
      <label class="landing-admin-field">
        <span>Excerpt</span>
        <textarea class="landing-admin-textarea" rows="3" placeholder="Optional summary for text-forward cards" onchange="updateLandingNewsField(${safeId}, 'body', this.value)">${escHtml(item.body)}</textarea>
      </label>
      <div class="landing-admin-editor-foot">
        ${renderLandingImportMetaHtml(item.importMeta)}
        ${!validation.valid ? `<p class="landing-admin-editor-warning">Missing ${escHtml(validation.missingFields.join(', '))}.</p>` : ''}
      </div>
    </article>`;
}
function renderLandingReviewCardHtml(item = {}, restaurantId = '', liveItems = []) {
  const safeId = escAttrJs(item.id);
  const status = getLandingItemStatusLabel('reviews', item, liveItems);
  const validation = validateLandingReviewItem(item);
  return `
    <article class="landing-admin-editor-card">
      <div class="landing-admin-editor-head">
        <div class="landing-admin-editor-head-copy">
          ${renderLandingStatusBadgeHtml(status)}
        </div>
        <div class="landing-admin-inline-actions">
          <button type="button" class="btn-small" onclick="refreshLandingReviewItem(${escAttrJs(restaurantId)}, ${safeId})">Refresh</button>
          <button type="button" class="btn-small" onclick="toggleLandingReviewArchived(${escAttrJs(restaurantId)}, ${safeId}, ${item.archived ? 'false' : 'true'})">${item.archived ? 'Restore' : 'Archive'}</button>
        </div>
      </div>
      <div class="landing-admin-field-grid">
        <label class="landing-admin-field landing-admin-field--wide">
          <span>Review URL</span>
          <input class="landing-admin-input" type="url" value="${escHtml(item.href)}" placeholder="https://maps.google.com/..." onchange="updateLandingReviewField(${escAttrJs(restaurantId)}, ${safeId}, 'href', this.value)">
        </label>
        <label class="landing-admin-field">
          <span>Author</span>
          <input class="landing-admin-input" type="text" value="${escHtml(item.author)}" placeholder="Reviewer name" onchange="updateLandingReviewField(${escAttrJs(restaurantId)}, ${safeId}, 'author', this.value)">
        </label>
        <label class="landing-admin-field">
          <span>Rating</span>
          <select class="landing-admin-input" onchange="updateLandingReviewField(${escAttrJs(restaurantId)}, ${safeId}, 'rating', this.value)">
            ${renderLandingRatingOptionsHtml(item.rating)}
          </select>
        </label>
      </div>
      <label class="landing-admin-field">
        <span>Quote</span>
        <textarea class="landing-admin-textarea" rows="4" placeholder="Quoted review copy" onchange="updateLandingReviewField(${escAttrJs(restaurantId)}, ${safeId}, 'quote', this.value)">${escHtml(item.quote)}</textarea>
      </label>
      <div class="landing-admin-editor-foot">
        ${renderLandingImportMetaHtml(item.importMeta)}
        ${!validation.valid ? `<p class="landing-admin-editor-warning">Missing ${escHtml(validation.missingFields.join(', '))}.</p>` : ''}
      </div>
    </article>`;
}
function renderLandingEventsPanel(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const bodyEl = document.getElementById('landing-events-panel-body');
  const issuesEl = document.getElementById('landing-events-issues');
  const validation = validateLandingEventsSection(normalized.draftContent.events);
  const filter = getLandingSectionFilter('events');
  const visibleItems = getLandingVisibleItems(sortLandingEvents(normalized.draftContent.events.items), filter.showArchived);
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="landing-admin-toolbar-row">
        <button type="button" class="btn-small admin-console-primary-btn" onclick="addLandingEventDraft()">Add Event</button>
        <label class="landing-admin-toggle">
          <input type="checkbox" ${filter.showArchived ? 'checked' : ''} onchange="toggleLandingSectionArchivedFilter('events', this.checked)">
          Show archived
        </label>
      </div>
      ${visibleItems.length ? `<div class="landing-admin-editor-list">${visibleItems.map(item => renderLandingEventCardHtml(item, normalized.liveContent.events)).join('')}</div>` : `
        <article class="landing-admin-note">
          <strong>No ${filter.showArchived ? '' : 'active '}events yet.</strong>
          <p>Manual event cards live here. Add a night, tag the room, and publish the full section when it is ready.</p>
        </article>`}
    `;
  }
  if (issuesEl) issuesEl.innerHTML = validation.valid ? '' : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
  setLandingPanelBadge('events', validation);
}
function renderLandingNewsPanel(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const bodyEl = document.getElementById('landing-news-panel-body');
  const issuesEl = document.getElementById('landing-news-issues');
  const validation = validateLandingNewsSection(normalized.draftContent.news);
  const filter = getLandingSectionFilter('news');
  const visibleItems = getLandingVisibleItems(sortLandingNews(normalized.draftContent.news.items), filter.showArchived);
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="landing-admin-toolbar-row landing-admin-toolbar-row--stack">
        <div class="landing-admin-import-row">
          <select id="landing-news-import-target" class="landing-admin-input">
            ${renderLandingTargetOptionsHtml(LANDING_TARGET_BOTH, { includeBoth: true })}
          </select>
          <input id="landing-news-import-url" class="landing-admin-input landing-admin-input--grow" type="url" placeholder="Paste article URL to import" onpaste="handleLandingNewsImportPaste()">
          <button type="button" class="btn-small admin-console-primary-btn" onclick="importLandingNewsDraft()">Import Story</button>
        </div>
        <label class="landing-admin-toggle">
          <input type="checkbox" ${filter.showArchived ? 'checked' : ''} onchange="toggleLandingSectionArchivedFilter('news', this.checked)">
          Show archived
        </label>
      </div>
      ${visibleItems.length ? `<div class="landing-admin-editor-list">${visibleItems.map(item => renderLandingNewsCardHtml(item, normalized.liveContent.news)).join('')}</div>` : `
        <article class="landing-admin-note">
          <strong>No ${filter.showArchived ? '' : 'active '}stories yet.</strong>
          <p>Paste an article URL to create or refresh a draft news card. Missing fields stay editable in draft until the section is ready.</p>
        </article>`}
    `;
  }
  if (issuesEl) issuesEl.innerHTML = validation.valid ? '' : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
  setLandingPanelBadge('news', validation);
}
function renderLandingReviewsPanel(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const bodyEl = document.getElementById('landing-reviews-panel-body');
  const issuesEl = document.getElementById('landing-reviews-issues');
  const validation = validateLandingReviewsSection(normalized.draftContent.reviews);
  const filter = getLandingSectionFilter('reviews');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="landing-admin-toolbar-row">
        <label class="landing-admin-toggle">
          <input type="checkbox" ${filter.showArchived ? 'checked' : ''} onchange="toggleLandingSectionArchivedFilter('reviews', this.checked)">
          Show archived
        </label>
      </div>
      <div class="landing-admin-review-lanes">
        ${knownLandingRestaurants().map(restaurant => {
          const items = getLandingVisibleItems(sortLandingReviews(normalized.draftContent.reviews.restaurants[restaurant.id]), filter.showArchived);
          return `
            <section class="landing-admin-review-lane">
              <div class="landing-admin-review-lane-head">
                <div>
                  <p class="settings-section-kicker">${escHtml(restaurant.name)}</p>
                  <h5>${escHtml(restaurant.name)}</h5>
                </div>
                <span class="landing-tag ${getLandingTargetAccentClass(restaurant.id)}">${escHtml(items.length)} draft</span>
              </div>
              <div class="landing-admin-import-row">
                <input id="landing-review-import-url-${escHtml(restaurant.id)}" class="landing-admin-input landing-admin-input--grow" type="url" placeholder="Paste Google review URL" onpaste="handleLandingReviewImportPaste(${escAttrJs(restaurant.id)})">
                <button type="button" class="btn-small admin-console-primary-btn" onclick="importLandingReviewDraft(${escAttrJs(restaurant.id)})">Import Review</button>
              </div>
              ${items.length ? `<div class="landing-admin-editor-list">${items.map(item => renderLandingReviewCardHtml(item, restaurant.id, normalized.liveContent.reviews.restaurants[restaurant.id])).join('')}</div>` : `
                <article class="landing-admin-note">
                  <strong>No ${filter.showArchived ? '' : 'active '}reviews yet.</strong>
                  <p>Imported Google reviews stay frozen as draft snapshots until you explicitly refresh and republish them.</p>
                </article>`}
            </section>`;
        }).join('')}
      </div>
    `;
  }
  if (issuesEl) issuesEl.innerHTML = validation.valid ? '' : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
  setLandingPanelBadge('reviews', validation);
}

function renderLandingOverview(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const diffSectionIds = getLandingDraftDiffSectionIds(normalized);
  const sectionValidations = ['hours', 'events', 'news', 'reviews'].map(sectionId => ({
    sectionId,
    validation: getLandingSectionValidation(sectionId, normalized),
  }));
  const blockingIssues = sectionValidations.flatMap(entry => entry.validation.issues);
  const allValid = sectionValidations.every(entry => entry.validation.valid);
  const rootStatusEl = document.getElementById('landing-overview-root-status');
  const rootCopyEl = document.getElementById('landing-overview-root-copy');
  const draftSavedEl = document.getElementById('landing-overview-draft-saved');
  const draftCopyEl = document.getElementById('landing-overview-draft-copy');
  const livePublishedEl = document.getElementById('landing-overview-live-published');
  const liveCopyEl = document.getElementById('landing-overview-live-copy');
  const heroLinesEl = document.getElementById('landing-overview-hero-lines');
  const heroCopyEl = document.getElementById('landing-overview-hero-copy');
  const listEl = document.getElementById('landing-overview-section-list');
  const issuesEl = document.getElementById('landing-overview-issues');
  const healthBadgeEl = document.getElementById('landing-overview-health-badge');
  const leroysStatus = computeLandingStatusForRestaurant(normalized.liveContent.hours, RESTAURANTS.LEROYS.id);
  const elroysStatus = computeLandingStatusForRestaurant(normalized.liveContent.hours, RESTAURANTS.ELROYS.id);

  if (rootStatusEl) rootStatusEl.textContent = _landingPageLoadError ? 'Fallback ready' : 'Live shell ready';
  if (rootCopyEl) rootCopyEl.textContent = _landingPageLoadError
    ? 'The public root can fall back to the simple chooser if landing data fails.'
    : 'The richer root shell can render from the published landing-page snapshot.';
  if (draftSavedEl) draftSavedEl.textContent = formatLandingTimestampLabel(normalized.draftSavedTs);
  if (draftCopyEl) draftCopyEl.textContent = diffSectionIds.length
    ? `${diffSectionIds.length} subsection draft${diffSectionIds.length === 1 ? '' : 's'} differ from live.`
    : 'Draft and live are currently aligned.';
  if (livePublishedEl) livePublishedEl.textContent = formatLandingTimestampLabel(normalized.livePublishedTs);
  if (liveCopyEl) liveCopyEl.textContent = normalized.livePublishedTs
    ? 'Publish promotes only the sections you select.'
    : 'No landing-page sections have been published live yet.';
  if (heroLinesEl) heroLinesEl.textContent = `${leroysStatus.label} / ${elroysStatus.label}`;
  if (heroCopyEl) heroCopyEl.textContent = 'These public hero lines are generated from the live recurring-hours schedules.';
  if (healthBadgeEl) {
    healthBadgeEl.textContent = allValid ? 'Healthy' : 'Needs attention';
    healthBadgeEl.className = `landing-admin-section-badge ${allValid ? 'is-ready' : 'is-blocked'}`;
  }
  if (listEl) {
    listEl.innerHTML = LANDING_PAGE_SECTION_ORDER.map(sectionId => {
      const status = getLandingSectionStatus(sectionId, normalized);
      const badgeClass = status.isValid ? 'is-ready' : 'is-blocked';
      const badgeText = !status.isValid ? 'Blocked' : (status.hasDraftDiff ? 'Drafting' : 'Live');
      const description = status.hasDraftDiff
        ? 'Draft differs from the currently published snapshot.'
        : 'Draft and live match right now.';
      return `
        <article class="landing-overview-section-item">
          <div>
            <strong>${escHtml(status.label)}</strong>
            <span>${escHtml(description)}</span>
          </div>
          <span class="landing-admin-section-badge ${badgeClass}">${escHtml(badgeText)}</span>
        </article>`;
    }).join('');
  }
  if (issuesEl) {
    issuesEl.innerHTML = allValid
      ? ''
      : blockingIssues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
  }
}

function syncLandingHoursDraftFromDom() {
  if (!hasLandingAdminShell()) return _landingPageState || createDefaultLandingPageRecord();
  const fields = Array.from(document.querySelectorAll('[data-landing-hours-field]'));
  if (!fields.length) return _landingPageState || createDefaultLandingPageRecord();

  const record = setLandingPageState(_landingPageState || createDefaultLandingPageRecord(), { dirty: _landingPageDirty });
  const groupedDays = new Map();

  fields.forEach(fieldEl => {
    const restaurantId = fieldEl.getAttribute('data-landing-hours-restaurant') || '';
    const dayKey = fieldEl.getAttribute('data-landing-hours-day') || '';
    const field = fieldEl.getAttribute('data-landing-hours-field') || '';
    if (!restaurantId || !dayKey || !field) return;
    const key = `${restaurantId}:${dayKey}`;
    const entry = groupedDays.get(key) || { restaurantId, dayKey };
    if (field === 'closed') {
      entry.closed = !!fieldEl.checked;
    } else if (field === 'open' || field === 'close') {
      entry[field] = normalizeLandingTimeValue(fieldEl.value);
    }
    groupedDays.set(key, entry);
  });

  groupedDays.forEach(({ restaurantId, dayKey, open, close, closed }) => {
    if (!record.draftContent.hours.restaurants[restaurantId]) {
      record.draftContent.hours.restaurants[restaurantId] = createDefaultLandingHoursRestaurant();
    }
    const currentDay = record.draftContent.hours.restaurants[restaurantId].days[dayKey] || createDefaultLandingDay();
    record.draftContent.hours.restaurants[restaurantId].days[dayKey] = normalizeLandingDay({
      ...currentDay,
      closed: !!closed,
      open: closed ? '' : (typeof open === 'string' ? open : currentDay.open),
      close: closed ? '' : (typeof close === 'string' ? close : currentDay.close),
    });
  });

  return record;
}

function renderLandingHoursValidationState(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const issuesEl = document.getElementById('landing-hours-issues');
  const badgeEl = document.getElementById('landing-hours-panel-badge');
  const validation = validateLandingHoursSection(getLandingHoursSectionForValidation(normalized));

  if (issuesEl) {
    issuesEl.innerHTML = validation.valid
      ? ''
      : validation.issues.map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`).join('');
  }
  if (badgeEl) {
    badgeEl.textContent = validation.valid ? 'Ready' : 'Blocked';
    badgeEl.className = `landing-admin-section-badge ${validation.valid ? 'is-ready' : 'is-blocked'}`;
  }
}

function refreshLandingHoursAdminState(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  setLandingPageState(normalized, { dirty: _landingPageDirty });
  renderLandingOverview(normalized);
  renderLandingHoursValidationState(normalized);
  updateLandingAdminToolbar(normalized);
}

function updateLandingAdminToolbar(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const diffSectionIds = getLandingDraftDiffSectionIds(normalized);
  const draftButton = document.getElementById('landing-save-draft-btn');
  const publishButton = document.getElementById('landing-publish-btn');
  const livePill = document.getElementById('landing-admin-live-pill');
  const draftPill = document.getElementById('landing-admin-draft-pill');
  const noteEl = document.getElementById('landing-admin-toolbar-note');

  if (draftButton) draftButton.disabled = !_landingPageDirty;
  if (publishButton) publishButton.disabled = diffSectionIds.length === 0;

  if (livePill) {
    livePill.textContent = normalized.livePublishedTs
      ? `Live ${formatLandingTimestampLabel(normalized.livePublishedTs)}`
      : 'Live shell pending';
    livePill.className = `landing-admin-status-pill ${normalized.livePublishedTs ? 'is-live' : ''}`;
  }
  if (draftPill) {
    const draftText = _landingPageDirty
      ? 'Unsaved draft changes'
      : (diffSectionIds.length ? `${diffSectionIds.length} draft sections ready` : 'No draft changes');
    draftPill.textContent = draftText;
    draftPill.className = `landing-admin-status-pill ${_landingPageDirty || diffSectionIds.length ? 'is-draft' : ''}`;
  }
  if (noteEl) {
    noteEl.textContent = _landingPageLoadError
      ? _landingPageLoadError
      : (_landingPageDirty
          ? 'Save Draft stores the shared landing snapshot without changing the public root.'
          : (diffSectionIds.length
              ? 'Publish Live promotes only the subsections you select.'
              : 'Landing-page draft and live snapshots are currently aligned.'));
  }
}

function renderLandingHoursPanel(record = _landingPageState) {
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  const gridEl = document.getElementById('landing-admin-hours-grid');
  if (gridEl) {
    gridEl.innerHTML = knownLandingRestaurants().map(restaurant => (
      renderLandingHoursRowsHtml(normalized.draftContent.hours, restaurant.id, restaurant.name)
    )).join('');
  }
  renderLandingHoursValidationState(normalized);
}

function renderLandingAdminWorkspace(options = {}) {
  if (!hasLandingAdminShell()) return;
  const { forceReload = false } = options;
  const render = (record) => {
    const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
    setLandingPageState(normalized, { dirty: _landingPageDirty });
    renderLandingOverview(normalized);
    renderLandingHoursPanel(normalized);
    renderLandingEventsPanel(normalized);
    renderLandingNewsPanel(normalized);
    renderLandingReviewsPanel(normalized);
    updateLandingAdminToolbar(normalized);
    focusLandingAdminPanel(_activeLandingAdminPanel);
  };

  if (_landingPageState && !forceReload) {
    render(_landingPageState);
    return;
  }

  updateLandingAdminToolbar(createDefaultLandingPageRecord());
  ensureLandingPageStateLoaded({ force: forceReload })
    .then(render)
    .catch(() => {
      const fallbackRecord = _landingPageState || createDefaultLandingPageRecord();
      setLandingPageState(fallbackRecord, { dirty: false });
      render(fallbackRecord);
    });
}

function setLandingRootSectionVisible(sectionId = '', visible = true) {
  const sectionEl = document.getElementById(sectionId);
  if (sectionEl) sectionEl.hidden = !visible;
  const dotEl = document.querySelector(`[data-landing-dot="${sectionId}"]`);
  if (dotEl) dotEl.hidden = !visible;
}
function getLandingRenderableEvents(section = {}) {
  return sortLandingEvents(
    getLandingActiveItems(Array.isArray(section?.items) ? section.items.map(normalizeLandingEventItem) : [])
  ).filter(item => validateLandingEventItem(item).valid);
}
function getLandingRenderableNews(section = {}) {
  return sortLandingNews(
    getLandingActiveItems(Array.isArray(section?.items) ? section.items.map(normalizeLandingNewsItem) : [])
  ).filter(item => validateLandingNewsItem(item).valid);
}
function getLandingRenderableReviews(section = {}, restaurantId = '') {
  return sortLandingReviews(
    getLandingActiveItems(Array.isArray(section?.restaurants?.[restaurantId]) ? section.restaurants[restaurantId].map(normalizeLandingReviewItem) : [])
  ).filter(item => validateLandingReviewItem(item).valid);
}
function buildLandingReviewPairs(section = {}) {
  const leroysReviews = getLandingRenderableReviews(section, RESTAURANTS.LEROYS.id);
  const elroysReviews = getLandingRenderableReviews(section, RESTAURANTS.ELROYS.id);
  if (leroysReviews.length < 3 || elroysReviews.length < 3) return [];
  const pairCount = Math.min(leroysReviews.length, elroysReviews.length);
  return Array.from({ length: pairCount }, (_, index) => ({
    id: `pair-${index}`,
    leroys: leroysReviews[index],
    elroys: elroysReviews[index],
  }));
}
function renderLandingRootEvents(section = {}) {
  const listEl = document.getElementById('landing-events-list');
  const emptyEl = document.getElementById('landing-events-empty');
  if (!listEl || !emptyEl) return;
  const items = getLandingRenderableEvents(section);
  setLandingRootSectionVisible('events', true);
  if (!items.length) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = items.map(item => `
    <article class="landing-story-card landing-story-card--event">
      <p class="landing-card-kicker"><span class="landing-tag ${getLandingTargetAccentClass(item.target)}">${escHtml(getLandingTargetLabel(item.target))}</span></p>
      <h3>${escHtml(item.title || 'Upcoming event')}</h3>
      <p>${escHtml(item.body || '')}</p>
      <p class="landing-card-kicker">${escHtml(formatLandingEventScheduleLine(item))}</p>
    </article>
  `).join('');
}
function renderLandingRootNews(section = {}) {
  const listEl = document.getElementById('landing-news-list');
  const emptyEl = document.getElementById('landing-news-empty');
  const items = getLandingRenderableNews(section);
  if (!listEl || !emptyEl) return;
  setLandingRootSectionVisible('news', items.length > 0);
  if (!items.length) {
    listEl.innerHTML = '';
    emptyEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = items.map(item => `
    <a class="landing-story-card landing-story-card--news ${item.imageUrl ? 'has-image' : 'is-text-only'}" href="${escHtml(item.href)}" target="_blank" rel="noreferrer">
      ${item.imageUrl ? `<img class="landing-story-image" src="${escHtml(item.imageUrl)}" alt="${escHtml(item.title || item.source || 'News image')}">` : ''}
      <div class="landing-story-copy">
        <p class="landing-card-kicker">
          <span class="landing-tag ${getLandingTargetAccentClass(item.target)}">${escHtml(getLandingTargetLabel(item.target))}</span>
          <span>${escHtml([item.source, formatLandingDateLabel(item.publishedDate, { short: true, year: false })].filter(Boolean).join(' · '))}</span>
        </p>
        <h3>${escHtml(item.title || 'Imported story')}</h3>
        ${item.body ? `<p>${escHtml(item.body)}</p>` : ''}
        <span class="landing-story-link">Read Story ↗</span>
      </div>
    </a>
  `).join('');
}
function renderLandingRootReviews(section = {}) {
  const sectionEl = document.getElementById('reviews');
  const listEl = document.getElementById('landing-reviews-list');
  const emptyEl = document.getElementById('landing-reviews-empty');
  const controlsEl = document.getElementById('landing-reviews-controls');
  const dotsEl = document.getElementById('landing-reviews-dots');
  if (!sectionEl || !listEl || !emptyEl || !controlsEl || !dotsEl) return;
  const pairs = buildLandingReviewPairs(section);
  const visible = pairs.length > 0;
  setLandingRootSectionVisible('reviews', visible);
  if (!visible) {
    listEl.innerHTML = '';
    emptyEl.hidden = true;
    controlsEl.hidden = true;
    _landingReviewCarouselIndex = 0;
    return;
  }
  emptyEl.hidden = true;
  controlsEl.hidden = pairs.length <= 1;
  _landingReviewCarouselIndex = Math.max(0, Math.min(_landingReviewCarouselIndex, pairs.length - 1));
  listEl.innerHTML = pairs.map((pair, index) => `
    <article class="landing-review-pair ${index === _landingReviewCarouselIndex ? 'is-active' : ''}" data-landing-review-pair="${index}">
      <article class="landing-review-card landing-review-card--leroys">
        <p class="landing-card-kicker">${escHtml(RESTAURANTS.LEROYS.name)}</p>
        <h3>${'★'.repeat(Math.max(1, Math.min(5, Number(pair.leroys.rating) || 5)))}</h3>
        <p>${escHtml(pair.leroys.quote || '')}</p>
        <p class="landing-card-kicker">${escHtml(pair.leroys.author || '')}${pair.leroys.source ? ` · ${escHtml(pair.leroys.source)}` : ''}</p>
      </article>
      <article class="landing-review-card landing-review-card--elroys">
        <p class="landing-card-kicker">${escHtml(RESTAURANTS.ELROYS.name)}</p>
        <h3>${'★'.repeat(Math.max(1, Math.min(5, Number(pair.elroys.rating) || 5)))}</h3>
        <p>${escHtml(pair.elroys.quote || '')}</p>
        <p class="landing-card-kicker">${escHtml(pair.elroys.author || '')}${pair.elroys.source ? ` · ${escHtml(pair.elroys.source)}` : ''}</p>
      </article>
    </article>
  `).join('');
  dotsEl.innerHTML = pairs.map((pair, index) => (
    `<button type="button" class="landing-review-dot ${index === _landingReviewCarouselIndex ? 'is-active' : ''}" aria-label="Review pair ${index + 1}" onclick="setLandingReviewCarouselIndex(${index})"></button>`
  )).join('');
}
function setLandingReviewCarouselIndex(nextIndex = 0) {
  const pairEls = Array.from(document.querySelectorAll('[data-landing-review-pair]'));
  if (!pairEls.length) return;
  _landingReviewCarouselIndex = Math.max(0, Math.min(Number(nextIndex) || 0, pairEls.length - 1));
  pairEls.forEach((pairEl, index) => {
    pairEl.classList.toggle('is-active', index === _landingReviewCarouselIndex);
  });
  document.querySelectorAll('.landing-review-dot').forEach((dotEl, index) => {
    dotEl.classList.toggle('is-active', index === _landingReviewCarouselIndex);
  });
}
function stepLandingReviewCarousel(direction = 1) {
  const pairCount = document.querySelectorAll('[data-landing-review-pair]').length;
  if (!pairCount) return;
  const nextIndex = (_landingReviewCarouselIndex + direction + pairCount) % pairCount;
  setLandingReviewCarouselIndex(nextIndex);
}

function renderLandingRootHours(section = {}) {
  const restaurantPairs = [
    { restaurant: RESTAURANTS.LEROYS, heroId: 'landing-hero-status-leroys', todayId: 'landing-hours-today-leroys', listId: 'landing-hours-list-leroys' },
    { restaurant: RESTAURANTS.ELROYS, heroId: 'landing-hero-status-elroys', todayId: 'landing-hours-today-elroys', listId: 'landing-hours-list-elroys' },
  ];
  restaurantPairs.forEach(({ restaurant, heroId, todayId, listId }) => {
    const status = computeLandingStatusForRestaurant(section, restaurant.id);
    const heroEl = document.getElementById(heroId);
    const todayEl = document.getElementById(todayId);
    const listEl = document.getElementById(listId);
    if (heroEl) {
      heroEl.textContent = status.label;
      heroEl.classList.toggle('is-open', !!status.isOpen);
      heroEl.classList.toggle('is-closed', !status.isOpen);
    }
    if (todayEl) {
      todayEl.innerHTML = `<span>Today</span><strong>${escHtml(status.todayRangeLabel)}</strong>`;
    }
    if (listEl) {
      listEl.innerHTML = status.weekRows.map(row => (
        `<div class="landing-hours-row">
          <dt>${escHtml(row.label)}${row.isToday ? ' · Today' : ''}</dt>
          <dd>${escHtml(row.rangeLabel)}</dd>
        </div>`
      )).join('');
    }
  });
}

function setLandingRootFallbackVisible(visible) {
  const shellEl = document.getElementById('landing-root-shell');
  const fallbackEl = document.getElementById('landing-root-fallback');
  const dotNavEl = document.querySelector('.landing-dot-nav');
  if (shellEl) shellEl.hidden = !!visible;
  if (fallbackEl) fallbackEl.hidden = !visible;
  if (dotNavEl) dotNavEl.hidden = !!visible;
}

function renderLandingRootPage(record = _landingPageState) {
  if (!hasLandingRootShell()) return;
  const normalized = normalizeLandingPageRecord(record || createDefaultLandingPageRecord());
  renderLandingRootHours(normalized.liveContent.hours);
  renderLandingRootEvents(normalized.liveContent.events);
  renderLandingRootNews(normalized.liveContent.news);
  renderLandingRootReviews(normalized.liveContent.reviews);
  setLandingRootFallbackVisible(false);
}

async function initLandingRootPage() {
  if (!hasLandingRootShell()) return;
  const prevButton = document.getElementById('landing-reviews-prev');
  const nextButton = document.getElementById('landing-reviews-next');
  if (prevButton) prevButton.onclick = () => stepLandingReviewCarousel(-1);
  if (nextButton) nextButton.onclick = () => stepLandingReviewCarousel(1);
  try {
    const record = await ensureLandingPageStateLoaded();
    renderLandingRootPage(record);
  } catch (_) {
    setLandingRootFallbackVisible(true);
  }
}

function focusLandingAdminPanel(panelId = 'landing-admin-panel-overview', trigger = null) {
  _activeLandingAdminPanel = panelId || _activeLandingAdminPanel;
  document.querySelectorAll('.landing-admin-panel').forEach(panel => {
    panel.classList.toggle('is-active', panel.id === _activeLandingAdminPanel);
  });
  document.querySelectorAll('.landing-admin-nav-button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.landingPanelTrigger === _activeLandingAdminPanel);
  });
  if (trigger) trigger.classList.add('is-active');
}

function setLandingHoursField(restaurantId, dayKey, field, value) {
  const record = setLandingPageState(_landingPageState || createDefaultLandingPageRecord(), { dirty: true });
  if (!record.draftContent.hours.restaurants[restaurantId]) {
    record.draftContent.hours.restaurants[restaurantId] = createDefaultLandingHoursRestaurant();
  }
  const targetDay = record.draftContent.hours.restaurants[restaurantId].days[dayKey] || createDefaultLandingDay();
  if (field === 'closed') {
    targetDay.closed = !!value;
    if (targetDay.closed) {
      targetDay.open = '';
      targetDay.close = '';
    }
  } else if (field === 'open' || field === 'close') {
    targetDay[field] = normalizeLandingTimeValue(value);
    if (targetDay[field]) targetDay.closed = false;
  }
  record.draftContent.hours.restaurants[restaurantId].days[dayKey] = normalizeLandingDay(targetDay);
  _landingPageDirty = true;
  if (field === 'closed') {
    renderLandingAdminWorkspace();
    return;
  }
  refreshLandingHoursAdminState(record);
}

function updateLandingDraftRecord(mutator = () => {}, options = {}) {
  const { rerender = true } = options;
  const record = setLandingPageState(_landingPageState || createDefaultLandingPageRecord(), { dirty: true });
  mutator(record);
  _landingPageDirty = true;
  if (rerender) renderLandingAdminWorkspace();
  return record;
}
function markLandingItemUpdated(item = {}) {
  item.updatedAt = String(Date.now());
  return item;
}
function findLandingNewsItemByUrl(items = [], url = '') {
  const candidate = String(url || '').trim();
  if (!candidate) return null;
  return items.find(item => (
    item?.href === candidate || item?.importMeta?.sourceUrl === candidate
  )) || null;
}
function findLandingReviewItemByUrl(items = [], url = '') {
  const candidate = String(url || '').trim();
  if (!candidate) return null;
  return items.find(item => (
    item?.href === candidate || item?.importMeta?.sourceUrl === candidate
  )) || null;
}
async function requestLandingImport(kind = 'import_news', payload = {}) {
  if (!currentUser?.accessToken) throw new Error('Sign in as an admin to import landing-page content.');
  const result = await postApiJson('/api/admin', {
    action: kind,
    ...payload,
  }, {
    headers: getAuthorizedApiHeaders(),
  });
  if (!result.ok) throw new Error(result.payload?.error || result.payload?.message || 'Import failed.');
  return result.payload || {};
}
function applyLandingImportMeta(currentMeta = {}, result = {}) {
  const attemptedAt = result?.attemptedAt ? String(result.attemptedAt) : String(Date.now());
  const nextStatus = result?.status || LANDING_IMPORT_STATUS_FAILED;
  const wasSuccessful = nextStatus === LANDING_IMPORT_STATUS_IMPORTED || nextStatus === LANDING_IMPORT_STATUS_PARTIAL;
  return normalizeLandingImportMeta({
    ...currentMeta,
    sourceUrl: result?.sourceUrl || result?.href || currentMeta?.sourceUrl || '',
    lastAttemptTs: attemptedAt,
    lastSuccessTs: wasSuccessful ? attemptedAt : currentMeta?.lastSuccessTs,
    status: nextStatus,
    messages: Array.isArray(result?.messages) ? result.messages : currentMeta?.messages,
  });
}
function upsertLandingNewsDraftFromImport(target = LANDING_TARGET_BOTH, result = {}) {
  const sourceUrl = String(result?.sourceUrl || result?.href || '').trim();
  updateLandingDraftRecord(record => {
    const items = record.draftContent.news.items;
    const existing = findLandingNewsItemByUrl(items, sourceUrl);
    const base = existing || createDefaultLandingNewsItem();
    const nextItem = normalizeLandingNewsItem({
      ...base,
      target: existing?.target || normalizeLandingTarget(target, { allowBoth: true }),
      title: result?.title || base.title,
      body: result?.body || base.body,
      href: result?.href || sourceUrl || base.href,
      source: result?.source || base.source,
      publishedDate: result?.publishedDate || base.publishedDate,
      imageUrl: result?.imageUrl || base.imageUrl,
      importMeta: applyLandingImportMeta(base.importMeta, result),
      updatedAt: String(Date.now()),
    });
    if (existing) {
      const index = items.findIndex(item => item.id === existing.id);
      if (index >= 0) items[index] = nextItem;
    } else {
      items.unshift(nextItem);
    }
  });
}
function upsertLandingReviewDraftFromImport(restaurantId = '', result = {}) {
  updateLandingDraftRecord(record => {
    if (!record.draftContent.reviews.restaurants[restaurantId]) {
      record.draftContent.reviews.restaurants[restaurantId] = [];
    }
    const items = record.draftContent.reviews.restaurants[restaurantId];
    const sourceUrl = String(result?.sourceUrl || result?.href || '').trim();
    const existing = findLandingReviewItemByUrl(items, sourceUrl);
    const base = existing || createDefaultLandingReviewItem();
    const nextItem = normalizeLandingReviewItem({
      ...base,
      href: result?.href || sourceUrl || base.href,
      author: result?.author || base.author,
      quote: result?.quote || base.quote,
      source: result?.source || base.source || 'Google Review',
      rating: result?.rating || base.rating,
      importMeta: applyLandingImportMeta(base.importMeta, result),
      updatedAt: String(Date.now()),
    });
    if (existing) {
      const index = items.findIndex(item => item.id === existing.id);
      if (index >= 0) items[index] = nextItem;
    } else {
      items.unshift(nextItem);
    }
  });
}
function addLandingEventDraft() {
  updateLandingDraftRecord(record => {
    record.draftContent.events.items.unshift(normalizeLandingEventItem({
      ...createDefaultLandingEventItem(),
      updatedAt: String(Date.now()),
    }));
  });
}
function updateLandingEventField(itemId = '', field = '', value = '') {
  updateLandingDraftRecord(record => {
    const item = findLandingItemById(record.draftContent.events.items, itemId);
    if (!item) return;
    if (field === 'target') item.target = normalizeLandingTarget(value, { allowBoth: true });
    else if (field === 'eventDate') item.eventDate = String(value || '');
    else if (field === 'startTime' || field === 'endTime') item[field] = normalizeLandingTimeValue(value);
    else item[field] = typeof value === 'string' ? value : '';
    if (field === 'endTime' && item.endTime) item.timingNote = '';
    markLandingItemUpdated(item);
  });
}
function toggleLandingEventArchived(itemId = '', archived = false) {
  updateLandingDraftRecord(record => {
    const item = findLandingItemById(record.draftContent.events.items, itemId);
    if (!item) return;
    item.archived = !!archived;
    item.archivedAt = archived ? String(Date.now()) : '';
    markLandingItemUpdated(item);
  });
}
function updateLandingNewsField(itemId = '', field = '', value = '') {
  updateLandingDraftRecord(record => {
    const item = findLandingItemById(record.draftContent.news.items, itemId);
    if (!item) return;
    if (field === 'target') item.target = normalizeLandingTarget(value, { allowBoth: true });
    else item[field] = typeof value === 'string' ? value : '';
    if (field === 'href' && !item.importMeta?.sourceUrl) {
      item.importMeta = normalizeLandingImportMeta({ ...item.importMeta, sourceUrl: item.href });
    }
    markLandingItemUpdated(item);
  });
}
function toggleLandingNewsArchived(itemId = '', archived = false) {
  updateLandingDraftRecord(record => {
    const item = findLandingItemById(record.draftContent.news.items, itemId);
    if (!item) return;
    item.archived = !!archived;
    item.archivedAt = archived ? String(Date.now()) : '';
    markLandingItemUpdated(item);
  });
}
function updateLandingReviewField(restaurantId = '', itemId = '', field = '', value = '') {
  updateLandingDraftRecord(record => {
    const items = record.draftContent.reviews.restaurants[restaurantId] || [];
    const item = findLandingItemById(items, itemId);
    if (!item) return;
    if (field === 'rating') item.rating = value ? String(Number(value)) : '';
    else item[field] = typeof value === 'string' ? value : '';
    if (field === 'href' && !item.importMeta?.sourceUrl) {
      item.importMeta = normalizeLandingImportMeta({ ...item.importMeta, sourceUrl: item.href });
    }
    markLandingItemUpdated(item);
  });
}
function toggleLandingReviewArchived(restaurantId = '', itemId = '', archived = false) {
  updateLandingDraftRecord(record => {
    const items = record.draftContent.reviews.restaurants[restaurantId] || [];
    const item = findLandingItemById(items, itemId);
    if (!item) return;
    item.archived = !!archived;
    item.archivedAt = archived ? String(Date.now()) : '';
    markLandingItemUpdated(item);
  });
}
function toggleLandingSectionArchivedFilter(sectionId = '', checked = false) {
  setLandingSectionFilter(sectionId, 'showArchived', checked);
  renderLandingAdminWorkspace();
}
function handleLandingNewsImportPaste() {
  setTimeout(() => {
    importLandingNewsDraft();
  }, 0);
}
function handleLandingReviewImportPaste(restaurantId = '') {
  setTimeout(() => {
    importLandingReviewDraft(restaurantId);
  }, 0);
}
async function importLandingNewsDraft() {
  const targetSelect = document.getElementById('landing-news-import-target');
  const urlInput = document.getElementById('landing-news-import-url');
  const target = targetSelect?.value || LANDING_TARGET_BOTH;
  const url = String(urlInput?.value || '').trim();
  if (!url) return;
  try {
    const result = await requestLandingImport('import_news', { url, target });
    upsertLandingNewsDraftFromImport(target, result);
    if (urlInput) urlInput.value = '';
    showToast(`✅ ${result?.status === LANDING_IMPORT_STATUS_IMPORTED ? 'Imported' : 'Imported with repairs needed'} news draft.`, 'success');
  } catch (error) {
    showToast(`⚠️ ${error?.message || 'News import failed.'}`, 'error');
  }
}
async function refreshLandingNewsItem(itemId = '') {
  const record = normalizeLandingPageRecord(_landingPageState || createDefaultLandingPageRecord());
  const item = findLandingItemById(record.draftContent.news.items, itemId);
  const sourceUrl = String(item?.importMeta?.sourceUrl || item?.href || '').trim();
  if (!item || !sourceUrl) {
    showToast('⚠️ Add an article URL before refreshing this story.', 'error');
    return;
  }
  try {
    const result = await requestLandingImport('import_news', { url: sourceUrl, target: item.target });
    upsertLandingNewsDraftFromImport(item.target, result);
    showToast('✅ News draft refreshed.', 'success');
  } catch (error) {
    showToast(`⚠️ ${error?.message || 'News refresh failed.'}`, 'error');
  }
}
async function importLandingReviewDraft(restaurantId = '') {
  const urlInput = document.getElementById(`landing-review-import-url-${restaurantId}`);
  const url = String(urlInput?.value || '').trim();
  if (!url) return;
  try {
    const result = await requestLandingImport('import_review', { url, restaurantId });
    upsertLandingReviewDraftFromImport(restaurantId, result);
    if (urlInput) urlInput.value = '';
    showToast(`✅ ${result?.status === LANDING_IMPORT_STATUS_IMPORTED ? 'Imported' : 'Imported with repairs needed'} review draft.`, 'success');
  } catch (error) {
    showToast(`⚠️ ${error?.message || 'Review import failed.'}`, 'error');
  }
}
async function refreshLandingReviewItem(restaurantId = '', itemId = '') {
  const record = normalizeLandingPageRecord(_landingPageState || createDefaultLandingPageRecord());
  const item = findLandingItemById(record.draftContent.reviews.restaurants[restaurantId] || [], itemId);
  const sourceUrl = String(item?.importMeta?.sourceUrl || item?.href || '').trim();
  if (!item || !sourceUrl) {
    showToast('⚠️ Add a review URL before refreshing this review.', 'error');
    return;
  }
  try {
    const result = await requestLandingImport('import_review', { url: sourceUrl, restaurantId });
    upsertLandingReviewDraftFromImport(restaurantId, result);
    showToast('✅ Review draft refreshed.', 'success');
  } catch (error) {
    showToast(`⚠️ ${error?.message || 'Review refresh failed.'}`, 'error');
  }
}

async function saveLandingPageDraft() {
  try {
    const record = normalizeLandingPageRecord(syncLandingHoursDraftFromDom() || await ensureLandingPageStateLoaded());
    const timestamp = Date.now();
    const nextRecord = await upsertLandingPageRecord({
      draft_content: record.draftContent,
      live_content: record.liveContent,
      draft_saved_ts: timestamp,
      live_published_ts: record.livePublishedTs ? Number(record.livePublishedTs) : null,
    }, 'save_landing_page_draft');
    setLandingPageState(nextRecord, { dirty: false });
    syncLandingDirtyFlag(false);
    renderLandingAdminWorkspace();
    showToast('✅ Landing page draft saved.', 'success');
  } catch (error) {
    showToast(`⚠️ ${error?.message || 'Landing page draft save failed.'}`, 'error');
  }
}

function renderLandingPublishModal() {
  const modalEl = document.getElementById('landing-publish-modal');
  const listEl = document.getElementById('landing-publish-list');
  const issuesEl = document.getElementById('landing-publish-issues');
  const confirmButton = document.getElementById('landing-publish-confirm-btn');
  if (!modalEl || !listEl || !issuesEl || !confirmButton) return;
  const record = normalizeLandingPageRecord(syncLandingHoursDraftFromDom() || _landingPageState || createDefaultLandingPageRecord());
  const statuses = LANDING_PAGE_SECTION_ORDER.map(sectionId => getLandingSectionStatus(sectionId, record));
  const publishableCount = statuses.filter(status => status.hasDraftDiff && status.isValid).length;
  listEl.innerHTML = statuses.map(status => {
    const disabled = !status.hasDraftDiff || !status.isValid;
    const badgeClass = status.isValid ? 'is-ready' : 'is-blocked';
    const badgeText = !status.isValid ? 'Blocked' : (status.hasDraftDiff ? 'Ready' : 'Live');
    const helpText = !status.hasDraftDiff
      ? 'Draft and live match right now.'
      : (status.isValid ? 'Draft is ready to promote.' : 'Fix the validation issue before publishing.');
    return `
      <label class="landing-publish-option">
        <input type="checkbox" data-landing-publish-section="${escHtml(status.sectionId)}" ${disabled ? 'disabled' : 'checked'}>
        <div>
          <strong>${escHtml(status.label)}</strong>
          <p>${escHtml(helpText)}</p>
        </div>
        <span class="landing-admin-section-badge ${badgeClass}">${escHtml(badgeText)}</span>
      </label>`;
  }).join('');
  issuesEl.innerHTML = statuses
    .filter(status => !status.isValid)
    .flatMap(status => status.issues)
    .map(issue => `<div class="landing-admin-issue">${escHtml(issue)}</div>`)
    .join('');
  confirmButton.disabled = publishableCount === 0;
}

function openLandingPublishModal() {
  if (!hasLandingAdminShell()) return;
  renderLandingPublishModal();
  const modalEl = document.getElementById('landing-publish-modal');
  if (!modalEl) return;
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
}

function closeLandingPublishModal() {
  const modalEl = document.getElementById('landing-publish-modal');
  if (!modalEl) return;
  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
}

async function publishLandingPageSections() {
  const selectedSectionIds = Array.from(document.querySelectorAll('[data-landing-publish-section]:checked'))
    .map(input => input.getAttribute('data-landing-publish-section'))
    .filter(Boolean);
  if (!selectedSectionIds.length) {
    showToast('Select at least one landing-page subsection to publish.', 'info');
    return;
  }
  try {
    const currentRecord = normalizeLandingPageRecord(syncLandingHoursDraftFromDom() || await ensureLandingPageStateLoaded());
    const blockedSection = selectedSectionIds
      .map(sectionId => getLandingSectionStatus(sectionId, currentRecord))
      .find(status => !status.isValid);
    if (blockedSection) {
      renderLandingPublishModal();
      showToast(`⚠️ Fix ${blockedSection.label.toLowerCase()} before publishing it live.`, 'error');
      return;
    }
    const nextLiveRecord = applyLandingSectionPublish(currentRecord, selectedSectionIds);
    const timestamp = Date.now();
    const persistedRecord = await upsertLandingPageRecord({
      draft_content: currentRecord.draftContent,
      live_content: nextLiveRecord.liveContent,
      draft_saved_ts: currentRecord.draftSavedTs ? Number(currentRecord.draftSavedTs) : null,
      live_published_ts: timestamp,
    }, 'publish_landing_sections');
    setLandingPageState({
      ...persistedRecord,
      liveContent: nextLiveRecord.liveContent,
      livePublishedTs: String(timestamp),
    }, { dirty: false });
    syncLandingDirtyFlag(false);
    renderLandingAdminWorkspace();
    if (hasLandingRootShell()) renderLandingRootPage(_landingPageState);
    closeLandingPublishModal();
    showToast(`✅ Published ${selectedSectionIds.length} landing-page section${selectedSectionIds.length === 1 ? '' : 's'} live.`, 'success');
  } catch (error) {
    showToast(`⚠️ ${error?.message || 'Landing page publish failed.'}`, 'error');
  }
}

// Resolve which menu to load based on ?menu={slug}, localStorage cache, or
// the hardcoded default order. Sets MENU_ID and normalizes legacy slugs.
async function sbResolveMenu() {
  const menuIndex = await readPublicMenuIndexThroughApi();
  const menus = sortKnownMenus(Array.isArray(menuIndex?.allMenus) ? menuIndex.allMenus : []);
  if (!menus.length) return;

  _hasMultipleMenus = menus.filter(menu => !menu.archived).length > 1;
  const rawSlug = new URLSearchParams(location.search).get('menu');
  const slug = normalizeKnownMenuSlug(rawSlug, { restaurantId: _siteRestaurant?.id || '' });

  if (slug) {
    const menu = menus.find(candidate => candidate.slug === slug) || null;
    if (menu?.id) {
      if (!isValidRestaurant(menu.restaurant_id)) {
        redirectToRestaurantPath(RESTAURANTS.LEROYS.id, '', 'Unsupported restaurant menu requested. Redirected to Leroy\'s Lounge.');
        return;
      }
      if (_siteRestaurant?.id && menu.restaurant_id !== _siteRestaurant.id) {
        redirectToRestaurantPath(menu.restaurant_id, slug);
        return;
      }
      MENU_ID = menu.id;
      if (setActiveMenuContext(menu.name || '', menu.type || 'drinks', menu.restaurant_id || '') === false) return;
      lsSet(LS_KEYS.menuId, MENU_ID);
      const publicHref = getPublicHrefForMenuId(menu.id);
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (publicHref && publicHref !== currentHref) {
        history.replaceState({}, '', new URL(publicHref, window.location.origin).toString());
      }
      return;
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
    const menu = menus.find(candidate => candidate.id === MENU_ID) || null;
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
      const publicHref = getPublicHrefForMenuId(MENU_ID);
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (publicHref && publicHref !== currentHref) {
        history.replaceState({}, '', new URL(publicHref, window.location.origin).toString());
      }
    } else {
      _clearActiveMenuContext({ clearCache: true });
    }
    if (MENU_ID) return;
  }

  const activeMenus = menus.filter(menu => !menu.archived);
  _hasMultipleMenus = activeMenus.length > 1;

  let defaultMenu = null;
  if (_siteRestaurant?.id) {
    defaultMenu = activeMenus.find(menu => (
      menu.restaurant_id === _siteRestaurant.id &&
      (menu.type || '').toLowerCase() === 'food'
    ));
  }
  if (!defaultMenu && currentUser?.role === 'manager') {
    defaultMenu = activeMenus.find(menu => normalizeAccessibleMenuIds(currentUser.accessibleMenuIds).includes(menu.id));
  }
  if (!defaultMenu) defaultMenu = activeMenus.find(menu => menu.id === MENUS.LEROYS_FOOD.id);
  if (!defaultMenu) defaultMenu = activeMenus[0];

  if (defaultMenu) {
    MENU_ID          = defaultMenu.id;
    if (setActiveMenuContext(defaultMenu.name || '', defaultMenu.type || 'drinks', defaultMenu.restaurant_id || '') === false) return;
    lsSet(LS_KEYS.menuId, MENU_ID);
    if (_siteRestaurant?.id && defaultMenu.restaurant_id !== _siteRestaurant.id) {
      redirectToRestaurantPath(defaultMenu.restaurant_id, defaultMenu.slug || '');
      return;
    }
    const href = getPublicHrefForMenuId(defaultMenu.id);
    if (href) history.replaceState({}, '', new URL(href, window.location.origin).toString());
  }
}

async function readApiJsonOrNull(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return null;
  }
}

async function postApiJson(url, body, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    const payload = text ? JSON.parse(text) : {};
    return {
      ok: res.ok,
      status: res.status,
      payload,
      fallbackable: res.status === 404 || res.status === 405,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: { error: error?.message || 'Network error' },
      fallbackable: true,
    };
  }
}

function getAuthorizedApiHeaders() {
  const accessToken = String(currentUser?.accessToken || '').trim();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function getClientAuditSource() {
  return currentUser?.role === 'admin' ? 'web_admin' : 'web_manager';
}

async function readSessionBootstrapThroughApi({ accessToken = '' } = {}) {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  return readApiJsonOrNull('/api/auth?mode=bootstrap', { headers });
}

function extractSupabaseConfigFromBootstrap(payload = {}) {
  const config = payload?.config && typeof payload.config === 'object' ? payload.config : payload;
  return {
    supabaseUrl: String(config?.supabaseUrl || 'server-managed'),
    supabaseAnonKey: String(config?.supabaseAnonKey || 'server-managed'),
  };
}

function extractProfileFromBootstrap(payload = {}) {
  const actor = payload?.actor && typeof payload.actor === 'object' ? payload.actor : payload;
  const access = payload?.access && typeof payload.access === 'object' ? payload.access : payload;
  return {
    role: String(actor?.role || payload?.role || 'none'),
    name: String(actor?.name || payload?.name || ''),
    accessibleMenuIds: normalizeAccessibleMenuIds(access?.accessibleMenuIds || payload?.accessibleMenuIds || []),
  };
}

function buildAuthApiError(response, payload, fallbackMessage = 'Authentication failed.') {
  const details = payload && typeof payload === 'object' ? { ...payload } : {};
  const status = Number(response?.status || details?.status || 0);
  if (status > 0) details.status = status;
  details.message = (
    typeof payload === 'string' && payload.trim()
      ? payload.trim()
      : details.message || details.msg || details.error_description || details.error || fallbackMessage
  );
  return details;
}

function buildMalformedAuthApiSuccessError(response, fallbackMessage = 'Authentication failed.') {
  return {
    status: 502,
    message: 'Authentication response was not valid JSON.',
    fallbackMessage,
  };
}

async function readAuthApiPayload(response, fallbackMessage = 'Authentication failed.') {
  let payload = {};
  const raw = typeof response?.text === 'function'
    ? await response.text().catch(() => '')
    : '';
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      if (response?.ok) throw buildMalformedAuthApiSuccessError(response, fallbackMessage);
      payload = { message: raw };
    }
  }
  if (!response.ok) throw buildAuthApiError(response, payload, fallbackMessage);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw buildMalformedAuthApiSuccessError(response, fallbackMessage);
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function getAuthErrorStatus(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  return Number.isFinite(status) && status > 0 ? status : 0;
}

function isTerminalAuthSessionError(error) {
  const status = getAuthErrorStatus(error);
  return status === 400 || status === 401 || status === 403;
}

function listStorageKeys(storage = localStorage) {
  const keys = [];
  const length = Number(storage?.length || 0);
  for (let index = 0; index < length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function clearStoredAuthSessionKeys(storage = localStorage) {
  [
    LS_KEYS.accessToken,
    LS_KEYS.refreshToken,
    LS_KEYS.expiresAt,
    LS_KEYS.uid,
    LS_KEYS.email,
  ].forEach(key => storage.removeItem(key));
}

function clearLegacyLocalStorageKeys(storage = localStorage) {
  ['menuItems', 'menuData', 'bot_id', 'groupme_config', 'lastUpdated'].forEach(key => storage.removeItem(key));
  listStorageKeys(storage)
    .filter(key => key.startsWith('firebase:'))
    .forEach(key => storage.removeItem(key));
}

function scheduleSessionRefreshRetry(delayMs = 60_000) {
  _scheduleTokenRefresh(Date.now() + (5 * 60 * 1000) + delayMs);
}

function canReadRestaurantToolsFromWorkspace(workspace = {}) {
  const permissions = workspace?.permissions && typeof workspace.permissions === 'object' ? workspace.permissions : {};
  const capabilities = workspace?.capabilities && typeof workspace.capabilities === 'object' ? workspace.capabilities : {};
  return !!(permissions.canReadRestaurantTools || capabilities.canReadRestaurantTools || capabilities.includesRestaurantTools);
}

function normalizeWorkspaceSiblingCatalog(catalog = []) {
  return (Array.isArray(catalog) ? catalog : []).map(item => ({
    id: item?.id || '',
    name: item?.name || '',
    cat: item?.cat || item?.category || '',
    menuId: item?.menuId || item?.menu_id || '',
    menuLabel: item?.menuLabel || item?.menu_label || '',
    onMenu: item?.onMenu !== false && item?.on_menu !== false,
    visibility: item?.visibility || 'public',
  })).filter(item => item.id && item.name);
}

function normalizeWorkspaceFeaturedGroups(groups = []) {
  return (Array.isArray(groups) ? groups : []).map(group => ({
    id: group?.id || '',
    name: group?.name || '',
    displayOrder: Number.isFinite(Number(group?.displayOrder ?? group?.display_order))
      ? Number(group?.displayOrder ?? group?.display_order)
      : 0,
    slots: (Array.isArray(group?.slots) ? group.slots : []).map(slot => {
      const rawItem = slot?.item && typeof slot.item === 'object' ? slot.item : null;
      const hydratedItem = rawItem && rawItem.id ? hydrateMenuItem(rawItem) : null;
      return {
        id: slot?.id || '',
        itemId: slot?.itemId || slot?.item_id || '',
        sellNote: slot?.sellNote || slot?.sell_note || '',
        displayOrder: Number.isFinite(Number(slot?.displayOrder ?? slot?.display_order))
          ? Number(slot?.displayOrder ?? slot?.display_order)
          : 0,
        confirmedAt: slot?.confirmedAt || slot?.confirmed_at || null,
        confirmedBy: slot?.confirmedBy || slot?.confirmed_by || null,
        item: hydratedItem,
      };
    }).filter(slot => slot.item && slot.itemId),
  })).filter(group => group.id);
}

function normalizePublicFeaturedItems(items = []) {
  return (Array.isArray(items) ? items : []).map(item => {
    const hydratedItem = item && typeof item === 'object' ? hydrateMenuItem(item) : null;
    return hydratedItem && hydratedItem.id ? hydratedItem : null;
  }).filter(Boolean);
}

function adaptPublicFeaturedItemsToGroups(items = []) {
  const featuredItems = normalizePublicFeaturedItems(items);
  if (!featuredItems.length) return [];
  return [{
    id: 'public-featured-specials',
    name: 'Featured Specials',
    displayOrder: 0,
    slots: featuredItems.map((item, index) => ({
      id: `public-featured-slot-${item.id || index + 1}`,
      itemId: item.id || `public-featured-item-${index + 1}`,
      sellNote: '',
      displayOrder: index,
      confirmedAt: null,
      confirmedBy: null,
      item,
    })),
  }];
}

async function readPublicMenuIndexThroughApi() {
  const payload = await readApiJsonOrNull('/api/public?action=menu_index');
  if (!payload) return null;
  return {
    restaurants: sortKnownRestaurants(Array.isArray(payload.restaurants) ? payload.restaurants : []),
    allMenus: sortKnownMenus(Array.isArray(payload.allMenus) ? payload.allMenus : payload.menus || []),
  };
}

async function readAdminCatalogThroughApi() {
  const authorizedHeaders = getAuthorizedApiHeaders();
  if (!authorizedHeaders.Authorization) return null;
  const payload = await readApiJsonOrNull('/api/admin?action=catalog', {
    headers: authorizedHeaders,
  });
  if (!payload) return null;
  return {
    restaurants: sortKnownRestaurants(Array.isArray(payload.restaurants) ? payload.restaurants : []),
    allMenus: sortKnownMenus(Array.isArray(payload.allMenus) ? payload.allMenus : payload.menus || []),
  };
}

async function readAdminSettingsContextThroughApi({ menuId = '', restaurantId = '' } = {}) {
  const authorizedHeaders = getAuthorizedApiHeaders();
  if (!authorizedHeaders.Authorization) return null;
  const params = new URLSearchParams({ action: 'settings_context' });
  if (menuId) params.set('menu_id', menuId);
  if (restaurantId) params.set('restaurant_id', restaurantId);
  return readApiJsonOrNull(`/api/admin?${params.toString()}`, {
    headers: authorizedHeaders,
  });
}

async function readMenuWorkspaceThroughApi({ menuId = MENU_ID, includeRestaurantTools = false } = {}) {
  const authorizedHeaders = getAuthorizedApiHeaders();
  if (!menuId || !authorizedHeaders.Authorization) return null;
  const params = new URLSearchParams({ action: 'workspace', menu_id: menuId });
  if (includeRestaurantTools) params.set('include', 'restaurant-tools');
  return readApiJsonOrNull(`/api/manager?${params.toString()}`, {
    headers: authorizedHeaders,
  });
}

function applyWorkspaceRestaurantTools(workspacePayload = {}) {
  const workspace = workspacePayload?.workspace && typeof workspacePayload.workspace === 'object'
    ? workspacePayload.workspace
    : {};
  const tools = workspacePayload?.restaurantTools && typeof workspacePayload.restaurantTools === 'object'
    ? workspacePayload.restaurantTools
    : null;
  const featuredGroups = tools && Array.isArray(tools.featuredGroups)
    ? tools.featuredGroups
    : (Array.isArray(workspacePayload?.featuredGroups) ? workspacePayload.featuredGroups : null);
  const featuredItems = Array.isArray(workspacePayload?.featuredItems)
    ? workspacePayload.featuredItems
    : null;

  _workspaceRestaurantToolsReadable = canReadRestaurantToolsFromWorkspace(workspace);
  if (!featuredGroups && !featuredItems && !tools) return false;

  if (Array.isArray(featuredGroups)) {
    _featuredGroups = normalizeWorkspaceFeaturedGroups(featuredGroups);
  } else if (Array.isArray(featuredItems)) {
    _featuredGroups = adaptPublicFeaturedItemsToGroups(featuredItems);
  }
  if (Array.isArray(tools?.siblingCatalog)) {
    _restaurantSpecialsSiblingCatalog = normalizeWorkspaceSiblingCatalog(tools.siblingCatalog);
  } else if (!tools) {
    _restaurantSpecialsSiblingCatalog = [];
  }
  return true;
}

async function readMenuStateThroughApi(request = buildCurrentMenuPageRequest()) {
  const menuId = request.requestedMenuId || MENU_ID;
  if (!menuId) return null;

  const pageMode = request.pageMode || _appPageMode;
  const isStaffMode = pageMode === 'manager' || pageMode === 'admin';

  if (isStaffMode) {
    const workspace = await readMenuWorkspaceThroughApi({ menuId, includeRestaurantTools: true });
    if (workspace) return workspace;
  }

  if (pageMode === 'public' || pageMode === 'picker') {
    const params = new URLSearchParams({ action: 'menu', menu_id: menuId });
    const projection = await readApiJsonOrNull(`/api/public?${params.toString()}`);
    if (projection) return projection;
  }

  return null;
}

async function readMenuHistoryThroughApi({ menuId = MENU_ID, days = 7, limit = 25 } = {}) {
  const authorizedHeaders = getAuthorizedApiHeaders();
  if (!menuId || !authorizedHeaders.Authorization) return null;
  const canReadRestaurantTools = _workspaceRestaurantToolsReadable || currentUserCanEditRestaurantSpecials(RESTAURANT_ID);
  const params = new URLSearchParams({
    action: 'history',
    menu_id: menuId,
    days: String(days),
    limit: String(limit),
    scope: canReadRestaurantTools ? 'restaurant' : 'menu',
  });
  return readApiJsonOrNull(`/api/manager?${params.toString()}`, {
    headers: authorizedHeaders,
  });
}

async function saveDraftThroughApi(snapshot, savedAt) {
  if (!MENU_ID || !getAuthorizedApiHeaders().Authorization) return { ok: false, fallbackable: true };
  const result = await postApiJson('/api/manager', {
    action: 'save_draft',
    menu_id: MENU_ID,
    snapshot: snapshot || {},
    saved_at: savedAt || Date.now(),
    expected_draft_revision: getDraftSavedTs() || null,
    source: getClientAuditSource(),
  }, {
    headers: getAuthorizedApiHeaders(),
  });
  return result;
}

async function saveLiveMenuThroughApi(snapshot) {
  if (!MENU_ID || !getAuthorizedApiHeaders().Authorization) return { ok: false, fallbackable: true };
  const result = await postApiJson('/api/manager', {
    action: 'save_live',
    menu_id: MENU_ID,
    snapshot,
    expected_live_revision: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
  }, {
    headers: getAuthorizedApiHeaders(),
  });
  return result;
}

function buildPublishSnapshotPayload() {
  const draftEnvelope = buildCurrentLocalDraftEnvelope();
  return {
    ...buildMenuCacheSnapshot(),
    preview_context: {
      dirty: !!_dirty,
      has_shared_draft: false,
      base_live_revision: draftEnvelope?.baseLiveRevision ?? null,
      base_last_sent_revision: draftEnvelope?.baseLastSentRevision ?? null,
      save_only_changes: getDraftSaveOnlyChanges(),
    },
  };
}

async function requestPublishPreviewThroughApi() {
  if (!MENU_ID || !getAuthorizedApiHeaders().Authorization) return { ok: false, fallbackable: false };
  const draftEnvelope = buildCurrentLocalDraftEnvelope();
  return postApiJson('/api/manager', {
    action: 'preview_publish',
    menu_id: MENU_ID,
    snapshot: buildPublishSnapshotPayload(),
    expected_live_revision: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
    expected_notification_revision: draftEnvelope?.baseLastSentRevision ?? null,
  }, {
    headers: getAuthorizedApiHeaders(),
  });
}

async function publishMenuThroughApi({ mode, selectedChangeIds = [] }) {
  if (!MENU_ID || !getAuthorizedApiHeaders().Authorization) return { ok: false, fallbackable: true };
  const draftEnvelope = buildCurrentLocalDraftEnvelope();
  return postApiJson('/api/manager', {
    action: 'publish',
    menu_id: MENU_ID,
    mode,
    source: getClientAuditSource(),
    snapshot: buildPublishSnapshotPayload(),
    selected_change_ids: Array.isArray(selectedChangeIds) ? selectedChangeIds : [],
    expected_live_revision: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
    expected_notification_revision: draftEnvelope?.baseLastSentRevision ?? null,
  }, {
    headers: getAuthorizedApiHeaders(),
  });
}

async function saveAdminSettingsThroughApi(action, payload = {}) {
  if (!getAuthorizedApiHeaders().Authorization) return { ok: false, fallbackable: true };
  return postApiJson('/api/admin', {
    action,
    ...payload,
  }, {
    headers: getAuthorizedApiHeaders(),
  });
}

async function persistStateDirect(options = {}) {
  return false;
}

async function sbRead() {
  return null;
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
    featuredEnabled: record.featuredEnabled === true || record.featured_enabled === true,
  };
}

function normalizeDraftCategoryUuid(rawId = '', key = '') {
  if (!rawId) return key === UNCATEGORIZED_ID ? _uncatCategoryUuid : '';
  if (String(rawId).startsWith('local-')) return key === UNCATEGORIZED_ID ? _uncatCategoryUuid : '';
  return rawId;
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

function canonicalNumericDisplayOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function canonicalCompareText(left = '', right = '') {
  return String(left || '').localeCompare(String(right || ''));
}

function compareCanonicalCategoryOrder(left = {}, right = {}) {
  const leftIsUncategorized = left?.key === UNCATEGORIZED_ID;
  const rightIsUncategorized = right?.key === UNCATEGORIZED_ID;
  if (leftIsUncategorized !== rightIsUncategorized) {
    return leftIsUncategorized ? 1 : -1;
  }

  const displayDelta = canonicalNumericDisplayOrder(left?.display_order) - canonicalNumericDisplayOrder(right?.display_order);
  if (displayDelta !== 0) return displayDelta;

  const keyDelta = canonicalCompareText(left?.key, right?.key);
  if (keyDelta !== 0) return keyDelta;

  return canonicalCompareText(left?.id, right?.id);
}

function compareCanonicalItemOrder(left = {}, right = {}) {
  const displayDelta = canonicalNumericDisplayOrder(left?.display_order) - canonicalNumericDisplayOrder(right?.display_order);
  if (displayDelta !== 0) return displayDelta;

  const idDelta = canonicalCompareText(left?.id, right?.id);
  if (idDelta !== 0) return idDelta;

  return canonicalCompareText(left?.name, right?.name);
}

function sortCanonicalCategories(categories = []) {
  return (Array.isArray(categories) ? categories : []).slice().sort(compareCanonicalCategoryOrder);
}

function sortCanonicalItems(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort(compareCanonicalItemOrder);
}

function hydrateState({ cats, meta, restaurant }) {
  const orderedCats = sortCanonicalCategories(cats);
  const realCats = orderedCats.filter(c => c.key !== UNCATEGORIZED_ID);
  const uncatCat = orderedCats.find(c => c.key === UNCATEGORIZED_ID);

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
      untappdEnabled: normalizeCategoryUntappdEnabled(c),
    }));
  }

  const lastSentState = meta?.last_sent_state && typeof meta.last_sent_state === 'object'
    ? meta.last_sent_state
    : {};
  const hasLastSentTs = !!meta?.last_sent_ts;
  menuState = {};
  realCats.forEach(c => {
    const items = sortCanonicalItems(c.items)
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
      items: sortCanonicalItems(uncatCat.items).map(i => hydrateMenuItem(i, { onMenu: false })),
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
  clearSharedDraftState();
  setServerLiveSnapshot(buildMenuCacheSnapshot());
}

function applyPersistedDraftState(draftState = {}) {
  const cats = Array.isArray(draftState?.cats) ? draftState.cats : [];
  if (!cats.length) {
    return false;
  }

  const liveMeta = menuState._meta ? { ...menuState._meta } : {};
  const liveLastSentState = {};
  CATEGORY_DEFS.forEach(cat => {
    liveLastSentState[cat.id] = (menuState[cat.id]?.lastSent || []).map(cloneMenuItemState);
  });

  const orderedCats = sortCanonicalCategories(cats);
  const realCats = orderedCats.filter(cat => cat.key !== UNCATEGORIZED_ID);
  const uncatCat = orderedCats.find(cat => cat.key === UNCATEGORIZED_ID) || null;

  CATEGORY_DEFS = realCats.map(cat => ({
    id: cat.key,
    _uuid: normalizeDraftCategoryUuid(cat.id, cat.key),
    icon: cat.icon || '',
    color: cat.color || '',
    title: cat.label,
    sub: cat.sub || '',
    placeholder: cat.placeholder || '',
    untappdEnabled: normalizeCategoryUntappdEnabled(cat),
  }));

  menuState = {};
  realCats.forEach(cat => {
    menuState[cat.key] = {
      items: sortCanonicalItems(cat.items)
        .map(item => hydrateMenuItem(item)),
      lastSent: liveLastSentState[cat.key] || [],
    };
  });

  _uncatCategoryUuid = normalizeDraftCategoryUuid(uncatCat?.id || '', UNCATEGORIZED_ID);
  if (uncatCat) {
    menuState[UNCATEGORIZED_ID] = {
      items: sortCanonicalItems(uncatCat.items)
        .map(item => hydrateMenuItem(item, { onMenu: false })),
      lastSent: [],
    };
  }

  menuState._meta = liveMeta;
  const saveOnlyChanges = Array.isArray(draftState?.saveOnlyChanges)
    ? draftState.saveOnlyChanges
    : (Array.isArray(draftState?.save_only_changes) ? draftState.save_only_changes : []);
  _draftSaveOnlyChanges = new Map(saveOnlyChanges
    .filter(change => change?.key)
    .map(change => [change.key, change]));
  if (Array.isArray(draftState?.featured_groups)) {
    _featuredGroups = normalizeWorkspaceFeaturedGroups(draftState.featured_groups);
  }
  return true;
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

function buildFeaturedGroupsSnapshotValue() {
  return _featuredGroups.map(group => ({
    id: group.id,
    name: group.name || '',
    display_order: Number.isFinite(Number(group.displayOrder)) ? Number(group.displayOrder) : 0,
    slots: group.slots.map(slot => ({
      id: slot.id,
      itemId: slot.itemId,
      item_id: slot.itemId,
      display_order: Number.isFinite(Number(slot.displayOrder)) ? Number(slot.displayOrder) : 0,
      sell_note: slot.sellNote || '',
      item: slot.item ? {
        id: slot.item.id || '',
        name: slot.item.name || '',
      } : null,
    })),
  }));
}

function getFeaturedSnapshot() {
  return JSON.stringify(buildFeaturedGroupsSnapshotValue());
}

function createRestaurantSpecialsService() {
  return {
    resetCatalog() {
      _restaurantSpecialsSiblingCatalog = [];
      return [];
    },

    buildCurrentMenuCatalog() {
      const currentMenu = getMenuById(MENU_ID);
      const fromCategories = getManagedCategoryDefs().flatMap(cat =>
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
      const uncatItems = (menuState[UNCATEGORIZED_ID]?.items || []).map(item => ({
        id: item.id,
        name: item.name,
        cat: 'Uncategorized',
        menuId: MENU_ID,
        menuLabel: currentMenu ? getMenuTypeLabel(currentMenu.type) : 'Current Menu',
        onMenu: true,
        visibility: item.visibility || 'off_menu',
      }));
      return [...fromCategories, ...uncatItems];
    },

    getCatalog() {
      return [...this.buildCurrentMenuCatalog(), ..._restaurantSpecialsSiblingCatalog];
    },

    async refreshForActiveMenu(restaurantId = RESTAURANT_ID) {
      if (!restaurantId) {
        _featuredGroups = [];
        this.resetCatalog();
        _workspaceRestaurantToolsReadable = false;
        return _featuredGroups;
      }

      if (currentUser?.accessToken) {
        const workspace = await readMenuWorkspaceThroughApi({ menuId: MENU_ID });
        if (workspace && applyWorkspaceRestaurantTools(workspace)) return _featuredGroups;
      } else {
        this.resetCatalog();
      }

      const publicParams = new URLSearchParams({ action: 'menu', menu_id: MENU_ID });
      const projection = await readApiJsonOrNull(`/api/public?${publicParams.toString()}`);
      if (projection && applyWorkspaceRestaurantTools(projection)) {
        return _featuredGroups;
      }

      _featuredGroups = [];
      return _featuredGroups;
    },

    getActiveGroup(groupId = '') {
      if (groupId) return _featuredGroups.find(group => group.id === groupId) || null;
      return _featuredGroups[0] || null;
    },
  };
}

function getRestaurantSpecialsService() {
  if (_restaurantSpecialsService) return _restaurantSpecialsService;
  _restaurantSpecialsService = createRestaurantSpecialsService();
  return _restaurantSpecialsService;
}

async function refreshFeaturedForActiveMenu() {
  return getRestaurantSpecialsService().refreshForActiveMenu(RESTAURANT_ID);
}

function withMenuStateLoaderDefaults(deps = {}) {
  return {
    readState: typeof deps.readState === 'function'
      ? deps.readState
      : async ({ request } = {}) => {
          return readMenuStateThroughApi(request || buildCurrentMenuPageRequest());
        },
    hydrateFromState: typeof deps.hydrateFromState === 'function' ? deps.hydrateFromState : (data => hydrateState(data)),
    applyPersistedDraftState: typeof deps.applyPersistedDraftState === 'function'
      ? deps.applyPersistedDraftState
      : (draftState => applyPersistedDraftState(draftState)),
    setDefaultState: typeof deps.setDefaultState === 'function'
      ? deps.setDefaultState
      : (() => {
          menuState = defaultState();
          currentDesign = { ...DESIGN_DEFAULTS };
          _restaurantCustomDesignEnabled = true;
        }),
    setDirty: typeof deps.setDirty === 'function' ? deps.setDirty : (value => { _dirty = !!value; }),
    clearDraftChanges: typeof deps.clearDraftChanges === 'function'
      ? deps.clearDraftChanges
      : (() => {
          clearDraftSaveOnlyChanges();
          clearSharedDraftState();
          clearCurrentLocalDraft({ clearStorage: false });
        }),
    writeMenuCache: typeof deps.writeMenuCache === 'function'
      ? deps.writeMenuCache
      : (data => lsSet(LS_KEYS.menuCache, JSON.stringify(data))),
    refreshFeatured: typeof deps.refreshFeatured === 'function'
      ? deps.refreshFeatured
      : (() => refreshFeaturedForActiveMenu()),
    buildSnapshot: typeof deps.buildSnapshot === 'function'
      ? deps.buildSnapshot
      : (source => buildMenuSessionSnapshot(source)),
    getLastUpdatedTs: typeof deps.getLastUpdatedTs === 'function'
      ? deps.getLastUpdatedTs
      : (() => menuState._meta?.lastUpdatedTs),
    getCategorySnapshot: typeof deps.getCategorySnapshot === 'function'
      ? deps.getCategorySnapshot
      : (() => getCategoryStateSnapshot()),
    getDesignSnapshot: typeof deps.getDesignSnapshot === 'function'
      ? deps.getDesignSnapshot
      : (() => getDesignSnapshot()),
    getFeaturedSnapshot: typeof deps.getFeaturedSnapshot === 'function'
      ? deps.getFeaturedSnapshot
      : (() => getFeaturedSnapshot()),
    syncLocalDraftDirtyState: typeof deps.syncLocalDraftDirtyState === 'function'
      ? deps.syncLocalDraftDirtyState
      : (() => syncLocalDraftDirtyState()),
    isDirty: typeof deps.isDirty === 'function'
      ? deps.isDirty
      : (() => !!_dirty),
    readStoredLocalDraftEnvelope: typeof deps.readStoredLocalDraftEnvelope === 'function'
      ? deps.readStoredLocalDraftEnvelope
      : (() => readStoredLocalDraftEnvelope()),
    alignLocalDraftEnvelope: typeof deps.alignLocalDraftEnvelope === 'function'
      ? deps.alignLocalDraftEnvelope
      : ((envelope, liveSnapshot = getServerLiveSnapshot()) => alignLocalDraftEnvelopeWithLiveSnapshot(envelope, liveSnapshot)),
    buildCurrentLocalDraftEnvelope: typeof deps.buildCurrentLocalDraftEnvelope === 'function'
      ? deps.buildCurrentLocalDraftEnvelope
      : (() => buildCurrentLocalDraftEnvelope()),
    applyLocalDraftEnvelope: typeof deps.applyLocalDraftEnvelope === 'function'
      ? deps.applyLocalDraftEnvelope
      : ((envelope, options = {}) => applyLocalDraftEnvelope(envelope, options)),
    clearCurrentLocalDraft: typeof deps.clearCurrentLocalDraft === 'function'
      ? deps.clearCurrentLocalDraft
      : ((options = {}) => clearCurrentLocalDraft(options)),
    applyWorkspaceRestaurantTools: typeof deps.applyWorkspaceRestaurantTools === 'function'
      ? deps.applyWorkspaceRestaurantTools
      : (data => applyWorkspaceRestaurantTools(data)),
    syncServerLiveSnapshot: typeof deps.syncServerLiveSnapshot === 'function'
      ? deps.syncServerLiveSnapshot
      : (() => syncServerLiveSnapshot()),
  };
}

function createMenuStateLoaderService(deps = {}) {
  const resolvedDeps = withMenuStateLoaderDefaults(deps);
  if (!_sessionModuleDelegationStack.has('createMenuStateLoaderService')) {
    const boundary = getSessionModuleBoundary();
    if (typeof boundary?.createMenuStateLoaderService === 'function') {
      _sessionModuleDelegationStack.add('createMenuStateLoaderService');
      try {
        return boundary.createMenuStateLoaderService(resolvedDeps, {
          fallback: () => createMenuStateLoaderService(deps),
        });
      } finally {
        _sessionModuleDelegationStack.delete('createMenuStateLoaderService');
      }
    }
  }

  const readState = resolvedDeps.readState;
  const hydrateFromState = resolvedDeps.hydrateFromState;
  const applyDraftState = resolvedDeps.applyPersistedDraftState;
  const setDefaultState = resolvedDeps.setDefaultState;
  const setDirty = resolvedDeps.setDirty;
  const clearDraftChanges = resolvedDeps.clearDraftChanges;
  const writeMenuCache = resolvedDeps.writeMenuCache;
  const refreshFeatured = resolvedDeps.refreshFeatured;
  const buildSnapshot = resolvedDeps.buildSnapshot;
  const getLastUpdatedTs = resolvedDeps.getLastUpdatedTs;
  const getCategorySnapshot = resolvedDeps.getCategorySnapshot;
  const getDesignSnapshotValue = resolvedDeps.getDesignSnapshot;
  const getFeaturedSnapshotValue = resolvedDeps.getFeaturedSnapshot;
  const syncDraftDirtyState = resolvedDeps.syncLocalDraftDirtyState;
  const readStoredLocalDraft = resolvedDeps.readStoredLocalDraftEnvelope;
  const alignLocalDraftEnvelope = resolvedDeps.alignLocalDraftEnvelope;
  const buildCurrentDraftEnvelope = resolvedDeps.buildCurrentLocalDraftEnvelope;
  const applyLocalDraft = resolvedDeps.applyLocalDraftEnvelope;
  const clearCurrentDraft = resolvedDeps.clearCurrentLocalDraft;
  const applyWorkspaceRestaurantTools = resolvedDeps.applyWorkspaceRestaurantTools;
  const syncServerLiveSnapshot = resolvedDeps.syncServerLiveSnapshot;
  const isDraftDirty = resolvedDeps.isDirty;

  return {
    async load(options = {}) {
      const {
        fallbackToDefault = true,
        includeFeatured = true,
        persistCache = true,
        request = buildCurrentMenuPageRequest(),
      } = options;
      const includePersistedDraft = options.includePersistedDraft ?? (request.pageMode === 'manager' || request.pageMode === 'admin');
      try {
        const data = await readState({ request, source: options.source || 'network', options });
        if (data) {
          hydrateFromState(data);
          const usedWorkspaceRestaurantTools = applyWorkspaceRestaurantTools(data);
          syncServerLiveSnapshot();
          const localDraftEnvelope = includePersistedDraft
            ? alignLocalDraftEnvelope(readStoredLocalDraft(), getServerLiveSnapshot())
            : null;
          let hasActiveLocalDraft = false;
          const loadedDraft = includePersistedDraft
            ? (localDraftEnvelope
                ? !!applyLocalDraft(localDraftEnvelope, { markDirty: false })
                : !!applyDraftState(null))
            : false;
          if (loadedDraft) {
            setLocalDraftBaseSnapshot(localDraftEnvelope?.baseSnapshot || getServerLiveSnapshot());
            if (syncDraftDirtyState()) {
              setDirty(true);
              hasActiveLocalDraft = true;
            } else {
              clearCurrentDraft();
              setDirty(false);
              clearDraftChanges();
              syncServerLiveSnapshot();
            }
          } else {
            clearCurrentDraft(localDraftEnvelope ? {} : { clearStorage: false });
            setDirty(false);
            clearDraftChanges();
            syncServerLiveSnapshot();
          }
          if (persistCache) writeMenuCache(data);
          if (includeFeatured && !usedWorkspaceRestaurantTools) {
            await refreshFeatured();
            if (!hasActiveLocalDraft) syncServerLiveSnapshot();
          }
        } else if (fallbackToDefault) {
          setDefaultState();
          setDirty(false);
          clearDraftChanges();
          _workspaceRestaurantToolsReadable = false;
          syncServerLiveSnapshot();
          if (includeFeatured) {
            await refreshFeatured();
            syncServerLiveSnapshot();
          }
        }
      } catch (error) {
        if (fallbackToDefault) {
          setDefaultState();
          setDirty(false);
          clearDraftChanges();
          _workspaceRestaurantToolsReadable = false;
          syncServerLiveSnapshot();
          if (includeFeatured) {
            await refreshFeatured();
            syncServerLiveSnapshot();
          }
        } else {
          throw error;
        }
      }
      return buildSnapshot(options.source || 'network');
    },

    async poll(options = {}) {
      void options;
      const oldTs = getLastUpdatedTs();
      const oldCats = getCategorySnapshot();
      const oldDesign = getDesignSnapshotValue();
      const oldFeatured = getFeaturedSnapshotValue();
      const request = options.request || buildCurrentMenuPageRequest();
      const data = await readState({ request, source: 'poll', options });
      if (!data) {
        return {
          changed: false,
          designChanged: false,
          snapshot: buildSnapshot('poll'),
        };
      }

      const activeDraftEnvelope = isDraftDirty() ? buildCurrentDraftEnvelope() : readStoredLocalDraft();
      hydrateFromState(data);
      const usedWorkspaceRestaurantTools = applyWorkspaceRestaurantTools(data);
      syncServerLiveSnapshot();
      let hasActiveLocalDraft = false;
      const alignedDraftEnvelope = activeDraftEnvelope?.draftSnapshot
        ? alignLocalDraftEnvelope(activeDraftEnvelope, getServerLiveSnapshot())
        : activeDraftEnvelope;
      if (alignedDraftEnvelope?.draftSnapshot) {
        const reappliedDraft = applyLocalDraft(alignedDraftEnvelope, { markDirty: false });
        if (reappliedDraft && syncDraftDirtyState()) {
          setDirty(true);
          hasActiveLocalDraft = true;
        } else {
          clearCurrentDraft();
          setDirty(false);
          clearDraftChanges();
          syncServerLiveSnapshot();
        }
      } else {
        clearCurrentDraft({ clearStorage: false });
        setDirty(false);
        clearDraftChanges();
        syncServerLiveSnapshot();
      }
      writeMenuCache(data);
      const newTs = getLastUpdatedTs();
      if (newTs !== oldTs && !usedWorkspaceRestaurantTools) {
        await refreshFeatured();
        if (!hasActiveLocalDraft) syncServerLiveSnapshot();
      }

      const afterCats = getCategorySnapshot();
      const newDesign = getDesignSnapshotValue();
      const newFeatured = getFeaturedSnapshotValue();
      return {
        changed: afterCats !== oldCats || newTs !== oldTs || newFeatured !== oldFeatured,
        designChanged: newDesign !== oldDesign,
        snapshot: buildSnapshot('poll'),
      };
    },
  };
}

async function _loadActiveMenuStateInternal(options = {}) {
  return createMenuStateLoaderService().load(options);
}

async function _pollActiveMenuStateInternal() {
  return createMenuStateLoaderService().poll();
}

async function loadActiveMenuState(options = {}) {
  const result = await ensureCurrentMenuSession().refresh(options);
  return result?.snapshot || result;
}

async function sbPatchMenuMetaForMenu(menuId, update) {
  void menuId;
  void update;
  return { downgradedFields: [] };
}

function snapshotCurrentItemsAsLastSent() {
  const lastSentState = {};
  CATEGORY_DEFS.forEach(cat => {
    lastSentState[cat.id] = (menuState[cat.id]?.items || []).map(item => ({ ...item }));
  });
  return lastSentState;
}

function buildMenuCacheSnapshot() {
  const context = buildFallbackMenuContext({
    menuId: MENU_ID,
    restaurantId: RESTAURANT_ID,
    menuType: MENU_TYPE,
  });
  const cats = CATEGORY_DEFS.map((cat, index) => ({
    id: cat._uuid || `local-${cat.id}`,
    key: cat.id,
    label: cat.title,
    icon: cat.icon || '',
    color: cat.color || '',
    sub: cat.sub || '',
    placeholder: cat.placeholder || '',
    untappd_enabled: normalizeCategoryUntappdEnabled(cat),
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
      featured_enabled: item.featuredEnabled === true,
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
      untappd_enabled: false,
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
        featured_enabled: item.featuredEnabled === true,
        display_order: itemIndex,
      })),
    });
  }
  const meta = {
    bot_id: BOT_ID || '',
    notifications: NOTIFICATIONS || {},
    notification_menu_link: getNotificationMenuLink(),
    last_updated_ts: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
    last_sent_ts: menuState._meta?.lastSentTs ? Number(menuState._meta.lastSentTs) : null,
    last_sent_state: snapshotLastSentState(),
    last_sent_categories: menuState._meta?.lastSentCategories || [],
  };
  const restaurant = isValidRestaurant(RESTAURANT_ID)
    ? {
        id: RESTAURANT_ID,
        name: _activeRestaurantName || getRestaurantById(RESTAURANT_ID)?.name || '',
        design: currentDesign,
        use_custom_design: _restaurantCustomDesignEnabled,
      }
    : null;
  return {
    context,
    cats,
    meta,
    restaurant,
    save_only_changes: getDraftSaveOnlyChanges(),
  };
}

function buildPersistedDraftStateSnapshot(savedAt = Date.now()) {
  const snapshot = buildMenuCacheSnapshot();
  return {
    ...snapshot,
    savedAt,
    saveOnlyChanges: getDraftSaveOnlyChanges(),
  };
}

function normalizeDraftDocumentSnapshot(snapshot = {}) {
  const normalized = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? cloneJsonCompatible(snapshot, {})
    : {};
  return sortDraftDocumentInPlace({
    context: normalized.context && typeof normalized.context === 'object' ? normalized.context : null,
    cats: Array.isArray(normalized.cats) ? normalized.cats : [],
    meta: normalized.meta && typeof normalized.meta === 'object' ? normalized.meta : {},
    restaurant: normalized.restaurant && typeof normalized.restaurant === 'object' ? normalized.restaurant : null,
    save_only_changes: Array.isArray(normalized.save_only_changes)
      ? normalized.save_only_changes
      : (Array.isArray(normalized.saveOnlyChanges) ? normalized.saveOnlyChanges : []),
  });
}

function stripDraftDocumentForComparison(snapshot = {}) {
  const normalized = normalizeDraftDocumentSnapshot(snapshot);
  return {
    cats: normalized.cats,
    save_only_changes: normalized.save_only_changes,
  };
}

function areDraftDocumentsEqual(left, right) {
  return JSON.stringify(stripDraftDocumentForComparison(left)) === JSON.stringify(stripDraftDocumentForComparison(right));
}

function buildSnapshotItemStateMap(snapshot = {}) {
  const map = new Map();
  normalizeDraftDocumentSnapshot(snapshot).cats.forEach(category => {
    const categoryKey = String(category?.key || '').trim();
    (Array.isArray(category?.items) ? category.items : []).forEach(item => {
      const itemId = String(item?.id || '').trim();
      if (!itemId) return;
      map.set(itemId, {
        item: cloneJsonCompatible(item, {}),
        categoryKey,
      });
    });
  });
  return map;
}

function buildSnapshotCategoryStateMap(snapshot = {}) {
  const map = new Map();
  normalizeDraftDocumentSnapshot(snapshot).cats.forEach(category => {
    const key = String(category?.key || '').trim();
    if (!key || key === UNCATEGORIZED_ID) return;
    const nextCategory = cloneJsonCompatible(category, {});
    nextCategory.items = [];
    nextCategory.untappd_enabled = normalizeCategoryUntappdEnabled(nextCategory);
    delete nextCategory.untappdEnabled;
    map.set(key, nextCategory);
  });
  return map;
}

function buildSnapshotDelta(baseSnapshot = null, updatedSnapshot = null) {
  const baseItems = buildSnapshotItemStateMap(baseSnapshot);
  const updatedItems = buildSnapshotItemStateMap(updatedSnapshot);
  const baseCategories = buildSnapshotCategoryStateMap(baseSnapshot);
  const updatedCategories = buildSnapshotCategoryStateMap(updatedSnapshot);
  const itemIds = new Set([...baseItems.keys(), ...updatedItems.keys()]);
  const categoryKeys = new Set([...baseCategories.keys(), ...updatedCategories.keys()]);
  const itemChanges = new Map();
  const categoryChanges = new Map();

  itemIds.forEach(itemId => {
    const baseState = baseItems.get(itemId) || null;
    const updatedState = updatedItems.get(itemId) || null;
    if (JSON.stringify(baseState) === JSON.stringify(updatedState)) return;
    const relatedCategoryKeys = new Set();
    if (baseState?.categoryKey) relatedCategoryKeys.add(baseState.categoryKey);
    if (updatedState?.categoryKey) relatedCategoryKeys.add(updatedState.categoryKey);
    itemChanges.set(itemId, {
      state: updatedState,
      relatedCategoryKeys,
    });
  });

  categoryKeys.forEach(key => {
    const baseCategory = baseCategories.get(key) || null;
    const updatedCategory = updatedCategories.get(key) || null;
    if (JSON.stringify(baseCategory) === JSON.stringify(updatedCategory)) return;
    categoryChanges.set(key, updatedCategory);
  });

  return {
    itemChanges,
    categoryChanges,
  };
}

function buildLocalDraftOverlapSummary(baseSnapshot = null, localSnapshot = null, remoteSnapshot = null) {
  if (!localSnapshot) return { labels: [], usedFallback: false };
  if (!baseSnapshot) return { labels: [], usedFallback: true };

  const localDelta = buildSnapshotDelta(baseSnapshot, localSnapshot);
  const remoteDelta = buildSnapshotDelta(baseSnapshot, remoteSnapshot);
  const localDocument = normalizeDraftDocumentSnapshot(localSnapshot);
  const remoteDocument = normalizeDraftDocumentSnapshot(remoteSnapshot);
  const baseDocument = normalizeDraftDocumentSnapshot(baseSnapshot);
  const labels = new Set();

  [...localDelta.itemChanges.keys()].filter(itemId => remoteDelta.itemChanges.has(itemId)).forEach(itemId => {
    const itemName = localDocument.cats.flatMap(category => category.items || []).find(item => item.id === itemId)?.name
      || remoteDocument.cats.flatMap(category => category.items || []).find(item => item.id === itemId)?.name
      || baseDocument.cats.flatMap(category => category.items || []).find(item => item.id === itemId)?.name
      || itemId;
    labels.add(itemName);
  });

  [...localDelta.categoryChanges.keys()].filter(key => remoteDelta.categoryChanges.has(key)).forEach(key => {
    const categoryLabel = (localDelta.categoryChanges.get(key)?.label || '')
      || (remoteDelta.categoryChanges.get(key)?.label || '')
      || (baseDocument.cats.find(category => category.key === key)?.label || key);
    labels.add(`Category: ${categoryLabel}`);
  });

  return {
    labels: Array.from(labels).sort(),
    usedFallback: false,
  };
}

function sortDraftDocumentInPlace(snapshot = {}) {
  snapshot.cats = sortCanonicalCategories(snapshot.cats).map((category, categoryIndex) => ({
    ...category,
    display_order: category.key === UNCATEGORIZED_ID ? 9999 : categoryIndex,
    items: sortCanonicalItems(category.items).map((item, itemIndex) => ({
      ...item,
      display_order: itemIndex,
    })),
  }));
  return snapshot;
}

function applyCategoryChangeToDraftDocument(snapshot = {}, key = '', categoryState = null) {
  if (!key || key === UNCATEGORIZED_ID) return snapshot;
  const existingCategory = (Array.isArray(snapshot.cats) ? snapshot.cats : []).find(category => category.key === key) || null;
  snapshot.cats = (Array.isArray(snapshot.cats) ? snapshot.cats : []).filter(category => category.key !== key);
  if (!categoryState) return snapshot;
  snapshot.cats.push({
    ...cloneJsonCompatible(categoryState, {}),
    items: Array.isArray(existingCategory?.items) ? existingCategory.items : [],
  });
  return snapshot;
}

function applyItemChangeToDraftDocument(snapshot = {}, itemId = '', change = {}) {
  if (!itemId) return snapshot;
  snapshot.cats = (Array.isArray(snapshot.cats) ? snapshot.cats : []).map(category => ({
    ...category,
    items: (Array.isArray(category.items) ? category.items : []).filter(item => item.id !== itemId),
  }));
  if (!change?.state) return snapshot;

  const nextCategoryKey = change.state.categoryKey;
  const nextCategory = snapshot.cats.find(category => category.key === nextCategoryKey);
  if (!nextCategory) return snapshot;
  nextCategory.items.push(cloneJsonCompatible(change.state.item, {}));
  return snapshot;
}

function mergeLocalDraftSnapshots({
  baseSnapshot = null,
  localSnapshot = null,
  remoteSnapshot = null,
  strategy = 'keep-local',
} = {}) {
  const baseDocument = normalizeDraftDocumentSnapshot(baseSnapshot);
  const localDocument = normalizeDraftDocumentSnapshot(localSnapshot);
  const remoteDocument = normalizeDraftDocumentSnapshot(remoteSnapshot);
  const localDelta = buildSnapshotDelta(baseDocument, localDocument);
  const remoteDelta = buildSnapshotDelta(baseDocument, remoteDocument);
  const merged = normalizeDraftDocumentSnapshot(remoteDocument);
  const remoteItemIds = new Set(remoteDelta.itemChanges.keys());
  const remoteCategoryKeys = new Set(remoteDelta.categoryChanges.keys());

  Array.from(localDelta.categoryChanges.entries())
    .sort((left, right) => compareCanonicalCategoryOrder(
      left[1] || { key: left[0] },
      right[1] || { key: right[0] },
    ))
    .forEach(([key, categoryState]) => {
      if (strategy === 'update-local' && remoteCategoryKeys.has(key)) return;
      applyCategoryChangeToDraftDocument(merged, key, categoryState);
    });

  Array.from(localDelta.itemChanges.entries())
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .forEach(([itemId, change]) => {
      const hasRemoteItemConflict = remoteItemIds.has(itemId);
      const hasRemoteCategoryConflict = Array.from(change.relatedCategoryKeys || []).some(key => remoteCategoryKeys.has(key));
      if (strategy === 'update-local' && (hasRemoteItemConflict || hasRemoteCategoryConflict)) return;
      applyItemChangeToDraftDocument(merged, itemId, change);
    });

  merged.context = remoteDocument.context;
  merged.meta = remoteDocument.meta;
  merged.restaurant = remoteDocument.restaurant;
  merged.save_only_changes = cloneJsonCompatible(localDocument.save_only_changes, []);
  return sortDraftDocumentInPlace(merged);
}

function buildCurrentLocalDraftEnvelope(savedAt = Date.now()) {
  const userId = String(currentUser?.uid || '').trim();
  const menuId = String(MENU_ID || '').trim();
  if (!userId || !menuId) return null;
  const baseSnapshot = getLocalDraftBaseSnapshot() || getServerLiveSnapshot() || buildPersistedDraftStateSnapshot(savedAt);
  return normalizeLocalDraftEnvelope({
    version: 2,
    userId,
    menuId,
    clientId: getMenuDraftClientId(),
    savedAt,
    baseLiveRevision: baseSnapshot?.meta?.last_updated_ts ?? menuState._meta?.lastUpdatedTs ?? null,
    baseLastSentRevision: baseSnapshot?.meta?.last_sent_ts ?? menuState._meta?.lastSentTs ?? null,
    baseSnapshot,
    draftSnapshot: buildPersistedDraftStateSnapshot(savedAt),
  });
}

function hasActualLocalDraftChanges() {
  const baseSnapshot = getLocalDraftBaseSnapshot();
  if (!baseSnapshot) return !!_dirty;
  return !areDraftDocumentsEqual(baseSnapshot, buildPersistedDraftStateSnapshot());
}

function syncLocalDraftDirtyState() {
  _dirty = hasActualLocalDraftChanges();
  return _dirty;
}

function applyLocalDraftEnvelope(envelope = null, options = {}) {
  const normalized = normalizeLocalDraftEnvelope(envelope);
  if (!normalized?.draftSnapshot) return false;
  const applied = applyPersistedDraftState(normalized.draftSnapshot);
  if (!applied) return false;
  setLocalDraftBaseSnapshot(normalized.baseSnapshot || getServerLiveSnapshot());
  if (options.markDirty === false) {
    _dirty = false;
  } else {
    _dirty = hasActualLocalDraftChanges();
  }
  return true;
}

function persistCurrentLocalDraft(options = {}) {
  if (!isMenuWorkspacePage()) return null;
  clearLocalDraftPersistTimer();
  syncLocalDraftDirtyState();
  if (!_dirty) {
    clearStoredLocalDraftEnvelope();
    clearLocalDraftBaseSnapshot();
    return null;
  }
  if (!_localDraftBaseSnapshot) {
    setLocalDraftBaseSnapshot(getServerLiveSnapshot() || buildPersistedDraftStateSnapshot());
  }
  return writeStoredLocalDraftEnvelope(buildCurrentLocalDraftEnvelope(options.savedAt || Date.now()));
}

function scheduleCurrentLocalDraftPersistence(options = {}) {
  if (!isMenuWorkspacePage()) return null;
  if (options.immediate) return persistCurrentLocalDraft(options);
  clearLocalDraftPersistTimer();
  _localDraftPersistTimer = setTimeout(() => {
    _localDraftPersistTimer = null;
    persistCurrentLocalDraft();
  }, 250);
  return null;
}

function clearCurrentLocalDraft(options = {}) {
  clearLocalDraftPersistTimer();
  if (options.clearStorage !== false) clearStoredLocalDraftEnvelope();
  clearLocalDraftBaseSnapshot();
  if (options.resetDirty !== false) _dirty = false;
}

async function reloadLatestWorkspaceIntoLocalDraft() {
  const currentEnvelope = buildCurrentLocalDraftEnvelope();
  if (!currentEnvelope?.draftSnapshot) return { ok: false, reloaded: false };

  const workspace = await readMenuWorkspaceThroughApi({ menuId: MENU_ID, includeRestaurantTools: true });
  if (!workspace) return { ok: false, reloaded: false };

  hydrateState(workspace);
  applyWorkspaceRestaurantTools(workspace);
  const remoteSnapshot = getServerLiveSnapshot() || buildPersistedDraftStateSnapshot();
  const overlap = buildLocalDraftOverlapSummary(currentEnvelope.baseSnapshot, currentEnvelope.draftSnapshot, remoteSnapshot);
  let strategy = 'keep-local';
  let requiresReview = false;

  if (overlap.labels.length) {
    requiresReview = true;
    const keepLocal = confirm([
      'Another client updated this menu while you were drafting.',
      '',
      `Overlapping changes: ${overlap.labels.join(', ')}`,
      '',
      'Press OK to keep your local versions for those overlaps, or Cancel to adopt the latest live versions for them before reviewing again.'
    ].join('\n'));
    strategy = keepLocal ? 'keep-local' : 'update-local';
  }

  const mergedDraftSnapshot = mergeLocalDraftSnapshots({
    baseSnapshot: currentEnvelope.baseSnapshot,
    localSnapshot: currentEnvelope.draftSnapshot,
    remoteSnapshot,
    strategy,
  });
  const nextEnvelope = {
    ...currentEnvelope,
    baseSnapshot: remoteSnapshot,
    baseLiveRevision: remoteSnapshot?.meta?.last_updated_ts ?? null,
    baseLastSentRevision: remoteSnapshot?.meta?.last_sent_ts ?? null,
    draftSnapshot: mergedDraftSnapshot,
    savedAt: Date.now(),
  };
  applyLocalDraftEnvelope(nextEnvelope, { markDirty: true });
  writeStoredLocalDraftEnvelope(nextEnvelope);
  renderManagerWorkspace({ includeRecentChanges: false });
  updateDraftIndicator();

  return {
    ok: true,
    reloaded: true,
    requiresReview,
    overlapLabels: overlap.labels,
  };
}

function syncLocalMenuCache(options = {}) {
  return getMenuFallbackStore().persist({
    menuId: MENU_ID,
    restaurantId: RESTAURANT_ID,
    menuType: MENU_TYPE,
  }, buildMenuCacheSnapshot(), options);
}

function isMissingColumnError(error, columnName) {
  const message = `${error?.message || error || ''}`.toLowerCase();
  return message.includes(columnName.toLowerCase()) &&
    (message.includes('column') || message.includes('schema cache'));
}

function isMissingDraftStateColumnError(error) {
  return isMissingColumnError(error, 'draft_state') || isMissingColumnError(error, 'draft_saved_ts');
}

async function patchMenuMetaForMenuWithCompatibility(menuId, update) {
  const payload = { ...update };
  if (_menuMetaSupportsLastSentFeatured === false) {
    delete payload.last_sent_featured;
  }
  try {
    await sbPatchMenuMetaForMenu(menuId, payload);
    if (Object.prototype.hasOwnProperty.call(payload, 'last_sent_featured')) {
      _menuMetaSupportsLastSentFeatured = true;
    }
    return { downgradedFields: [] };
  } catch (error) {
    if (Object.prototype.hasOwnProperty.call(payload, 'last_sent_featured') && isMissingColumnError(error, 'last_sent_featured')) {
      const { last_sent_featured, ...fallbackPayload } = payload;
      await sbPatchMenuMetaForMenu(menuId, fallbackPayload);
      _menuMetaSupportsLastSentFeatured = false;
      return { downgradedFields: ['last_sent_featured'] };
    }
    throw error;
  }
}

async function patchMenuMetaWithCompatibility(update) {
  return patchMenuMetaForMenuWithCompatibility(MENU_ID, update);
}

async function patchMenuDraftState(snapshot, savedAt = Date.now()) {
  const apiResult = await saveDraftThroughApi(snapshot, savedAt);
  if (apiResult.ok) {
    if (apiResult.payload?.sharedDraft) {
      setSharedDraftState(apiResult.payload.sharedDraft);
    }
    _menuMetaSupportsDraftState = true;
    return { downgradedFields: Array.isArray(apiResult.payload?.downgradedFields) ? apiResult.payload.downgradedFields : [] };
  }
  throw new Error(apiResult.payload?.error || 'Draft save failed.');
}

async function sbPatchRestaurantDesign(restaurantId, design = {}) {
  const apiResult = await saveAdminSettingsThroughApi('save_restaurant_design', {
    restaurant_id: restaurantId,
    design,
  });
  if (!apiResult?.ok) {
    throw new Error(apiResult?.payload?.error || 'Design patch failed.');
  }
  return apiResult.payload || {};
}

async function sbGetRestaurantSpecialGroup(restaurantId = RESTAURANT_ID, options = {}) {
  void restaurantId;
  void options;
  return null;
}

async function sbReadLegacyFeatured(menuId = MENU_ID) {
  void menuId;
  return [];
}

async function sbReadRestaurantSpecials(restaurantId = RESTAURANT_ID) {
  void restaurantId;
  return [];
}

// ─── LOCAL NOTIFICATIONS CONFIG ───────────────────────────────────────────────
function shouldLoadLocalConfig() {
  const hostname = window.location.hostname;
  return window.location.protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1';
}

async function loadLocalConfig() {
  if (!shouldLoadLocalConfig()) return;
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
  const id = 'gfont-' + fontName.replace(/\s+/g,'-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `/api/public?action=font_css&font=${encodeURIComponent(fontName)}`;
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
  const currentTitle = (document.title || '').trim();
  if (currentTitle.toUpperCase() === 'CURRENT MENU') {
    document.title = [brand, title].filter(Boolean).join(' | ') || 'Current Menu';
  }
}

async function renderPublicViews() {
  await renderPublicView();
  updateLastUpdatedLabel();
}

function updateManagerToolsContext() {
  const ctx = document.getElementById('categories-menu-context');
  if (!ctx) return;
  const baseLabel = _activeMenuName ? `Editing: ${_activeMenuName}` : '';
  ctx.textContent = currentUserCanEditCategories()
    ? baseLabel
    : [baseLabel, 'Categories are admin-managed.'].filter(Boolean).join(' • ');
}

function renderManagerOverviewStats() {
  if (!_uiModuleDelegationStack.has('renderManagerOverviewStats')) {
    const service = getManagerWorkspaceService();
    if (typeof service?.renderManagerOverviewStats === 'function') {
      _uiModuleDelegationStack.add('renderManagerOverviewStats');
      try {
        return service.renderManagerOverviewStats();
      } finally {
        _uiModuleDelegationStack.delete('renderManagerOverviewStats');
      }
    }
  }

  const activeItems = CATEGORY_DEFS.reduce((total, cat) => (
    total + (menuState[cat.id]?.items || []).filter(item => item.onMenu !== false).length
  ), 0);
  const eightySixed = CATEGORY_DEFS.reduce((total, cat) => (
    total + (menuState[cat.id]?.items || []).filter(item => item.onMenu !== false && item.eightySixed).length
  ), 0);
  const draftCount = getDraftChangeCount();
  const hasLocalDraft = syncLocalDraftDirtyState();
  const notifyCount = !hasLocalDraft ? countDiffLines() : 0;
  const statusValue = document.getElementById('manager-overview-status-value');
  const statusMeta = document.getElementById('manager-overview-status-meta');
  const activeValue = document.getElementById('manager-overview-active-value');
  const activeMeta = document.getElementById('manager-overview-active-meta');
  const eightysixValue = document.getElementById('manager-overview-86-value');
  const eightysixMeta = document.getElementById('manager-overview-86-meta');

  if (statusValue) statusValue.textContent = hasLocalDraft ? 'Drafting' : (notifyCount > 0 ? 'Live | Unsent' : 'Live');
  if (statusMeta) {
    if (hasLocalDraft) {
      statusMeta.textContent = `${draftCount} pending change${draftCount === 1 ? '' : 's'} on this device.`;
    } else if (notifyCount > 0) {
      statusMeta.textContent = `${notifyCount} update line${notifyCount === 1 ? '' : 's'} ready to send`;
    } else {
      statusMeta.textContent = 'No unsent changes';
    }
  }
  if (activeValue) activeValue.textContent = String(activeItems);
  if (activeMeta) activeMeta.textContent = activeItems === 1 ? 'active item' : 'active items';
  if (eightysixValue) eightysixValue.textContent = String(eightySixed);
  if (eightysixMeta) eightysixMeta.textContent = eightySixed === 1 ? "item 86'd" : "items 86'd";
}

function createDraftLedgerService(deps = {}) {
  const isDirty = typeof deps.isDirty === 'function' ? deps.isDirty : (() => syncLocalDraftDirtyState());
  const getDraftCount = typeof deps.getDraftChangeCount === 'function' ? deps.getDraftChangeCount : (() => getDraftChangeCount());
  const getDiffLineCount = typeof deps.getDiffLinesCount === 'function' ? deps.getDiffLinesCount : (() => countDiffLines());
  const getDiffSections = typeof deps.getDiffSections === 'function' ? deps.getDiffSections : (() => getCachedDiff());
  const getSaveOnlyChanges = typeof deps.getSaveOnlyChanges === 'function' ? deps.getSaveOnlyChanges : (() => getDraftSaveOnlyChanges());

  function buildLookup() {
    return {
      byItemId: new Set(getSaveOnlyChanges().map(change => change.itemId).filter(Boolean)),
      byCategoryName: new Map(getDiffSections().map(section => [
        section.id,
        new Set([
          ...(section.added || []),
          ...(section.eightySixed || []),
          ...(section.restored || []),
        ].map(name => name.trim().toLowerCase())),
      ])),
    };
  }

  return {
    buildLookup,
    getActionBarState({ isCompactViewport = false } = {}) {
      const draftCount = getDraftCount();
      const notificationCount = getDiffLineCount();
      const saveOnlyCount = getSaveOnlyChanges().length;
      const hasLocalDraft = !!isDirty();
      const hasNotificationChanges = notificationCount > 0;
      const hasSaveOnlyChanges = saveOnlyCount > 0;
      const hasChanges = hasNotificationChanges || hasSaveOnlyChanges;
      const actionState = hasLocalDraft
        ? {
            hasLocalDraft,
            hasPendingServerQueue: false,
            hasNotificationChanges,
            hasSaveOnlyChanges,
            hasChanges,
            summaryText: hasNotificationChanges
              ? (isCompactViewport
                  ? `${draftCount} pending change${draftCount === 1 ? '' : 's'}. Save quietly or review the send queue.`
                  : `${draftCount} pending change${draftCount === 1 ? '' : 's'}. Save Quietly writes live without sending. Save & Send reviews the queue before notifying.`)
              : `${saveOnlyCount || draftCount} quiet change${(saveOnlyCount || draftCount) === 1 ? '' : 's'} ready to save.`,
            saveLabel: hasNotificationChanges ? 'Save Quietly' : 'Save',
            saveDisabled: !hasChanges,
            publishLabel: 'Save & Send',
            publishDisabled: !hasNotificationChanges,
            showDiscard: true,
          }
        : (hasNotificationChanges
            ? {
                hasLocalDraft,
                hasPendingServerQueue: true,
                hasNotificationChanges,
                hasSaveOnlyChanges,
                hasChanges,
                summaryText: `${notificationCount} update line${notificationCount === 1 ? ' is' : 's are'} live and ready to send.`,
                saveLabel: '',
                saveDisabled: true,
                publishLabel: 'Send',
                publishDisabled: false,
                showDiscard: false,
              }
            : {
                hasLocalDraft,
                hasPendingServerQueue: false,
                hasNotificationChanges,
                hasSaveOnlyChanges,
                hasChanges,
                summaryText: 'No pending changes',
                saveLabel: 'Save',
                saveDisabled: true,
                publishLabel: 'Send',
                publishDisabled: true,
                showDiscard: false,
              });
      return {
        hasDraftChanges: actionState.hasLocalDraft,
        hasSharedDraft: false,
        hasClearableSharedDraft: false,
        hasDraftWork: actionState.hasLocalDraft,
        hasPublishableDraftWork: actionState.hasLocalDraft && actionState.hasNotificationChanges,
        hasPendingUpdate: actionState.hasPendingServerQueue,
        changeCount: getDraftCount(),
        summaryText: actionState.summaryText,
        saveLabel: actionState.saveLabel,
        publishLabel: actionState.publishLabel,
        showDiscard: actionState.showDiscard,
        saveDisabled: actionState.saveDisabled,
        publishDisabled: actionState.publishDisabled,
      };
    },
    getItemBadge({ item, catId, lastSentNames = null }) {
      const is86 = !!item?.eightySixed;
      const nameKey = String(item?.name || '').trim().toLowerCase();
      const changeLookup = buildLookup();
      const sectionNames = changeLookup.byCategoryName.get(catId) || new Set();
      const hasDraftTag = isDirty() && (changeLookup.byItemId.has(item?.id) || sectionNames.has(nameKey));
      const hasUnsentTag = sectionNames.has(nameKey);
      const isNew = lastSentNames ? !lastSentNames.has(nameKey) : false;

      if (hasDraftTag) {
        return { className: 'item-state-badge--draft', text: 'DRAFT', label: 'Draft change' };
      }
      if (hasUnsentTag) {
        return { className: 'item-state-badge--unsent', text: 'UNSENT', label: 'Unsent update' };
      }
      if (is86) {
        return { className: 'item-state-badge--86', text: '86', label: "86'd" };
      }
      if (isNew) {
        return { className: 'item-state-badge--new', text: 'NEW', label: 'New' };
      }
      return { className: 'item-state-badge--active', text: '', label: 'Active' };
    },
  };
}

function updateManagerActionBar() {
  if (!_uiModuleDelegationStack.has('updateManagerActionBar')) {
    const service = getManagerWorkspaceService();
    if (typeof service?.updateManagerActionBar === 'function') {
      _uiModuleDelegationStack.add('updateManagerActionBar');
      try {
        return service.updateManagerActionBar();
      } finally {
        _uiModuleDelegationStack.delete('updateManagerActionBar');
      }
    }
  }

  const bar = document.getElementById('manager-action-bar');
  if (!bar) return;
  const primaryGroup = document.getElementById('manager-primary-action-group');
  const summary = document.getElementById('manager-action-bar-summary');
  const syncEl = document.getElementById('sync-status');
  const isCompactViewport = window.innerWidth <= 480;
  const ledgerState = createDraftLedgerService().getActionBarState({ isCompactViewport });
  const saveBtn = document.getElementById('save-btn');
  const publishBtn = document.getElementById('send-btn');
  const discardBtn = document.getElementById('discard-draft-btn');

  if (primaryGroup) primaryGroup.hidden = false;
  if (saveBtn) {
    saveBtn.disabled = !!ledgerState.saveDisabled;
    saveBtn.textContent = ledgerState.saveLabel || 'Save';
    saveBtn.hidden = !ledgerState.saveLabel;
    saveBtn.title = ledgerState.hasDraftChanges ? 'Save the live menu without notifying anyone yet' : '';
  }
  if (publishBtn) {
    publishBtn.disabled = !!ledgerState.publishDisabled;
    publishBtn.textContent = ledgerState.publishLabel;
  }
  if (discardBtn) {
    discardBtn.hidden = !ledgerState.showDiscard;
    discardBtn.disabled = !ledgerState.showDiscard;
  }
  bar.hidden = false;
  bar.classList.toggle('is-idle', ledgerState.saveDisabled && ledgerState.publishDisabled && !ledgerState.showDiscard);
  syncManagerActionBarStatus(syncEl);

  if (summary) summary.textContent = ledgerState.summaryText;
}

function syncManagerActionBarStatus(syncEl = document.getElementById('sync-status')) {
  if (!_uiModuleDelegationStack.has('syncManagerActionBarStatus')) {
    const service = getManagerWorkspaceService();
    if (typeof service?.syncManagerActionBarStatus === 'function') {
      _uiModuleDelegationStack.add('syncManagerActionBarStatus');
      try {
        return service.syncManagerActionBarStatus(syncEl);
      } finally {
        _uiModuleDelegationStack.delete('syncManagerActionBarStatus');
      }
    }
  }

  const statusWrap = syncEl?.closest('.manager-shell-actionbar-status');
  if (!statusWrap) return;
  statusWrap.hidden = !((syncEl.textContent || '').trim());
}

function renderManagerWorkspace(options = {}) {
  if (!_uiModuleDelegationStack.has('renderManagerWorkspace')) {
    const service = getManagerWorkspaceService();
    if (typeof service?.renderManagerWorkspace === 'function') {
      _uiModuleDelegationStack.add('renderManagerWorkspace');
      try {
        return service.renderManagerWorkspace(options);
      } finally {
        _uiModuleDelegationStack.delete('renderManagerWorkspace');
      }
    }
  }

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
  initManagerMobileDrawerTrigger();
  initDrawerSwipe();
}

function renderAdminWorkspace() {
  if (!_uiModuleDelegationStack.has('renderAdminWorkspace')) {
    const service = getAdminWorkspaceService();
    if (typeof service?.renderAdminWorkspace === 'function') {
      _uiModuleDelegationStack.add('renderAdminWorkspace');
      try {
        return service.renderAdminWorkspace();
      } finally {
        _uiModuleDelegationStack.delete('renderAdminWorkspace');
      }
    }
  }

  renderMenusPanel();
  initAdminSwitcherTab('notif');
  loadUsers();
  renderLandingAdminWorkspace();
}

function refreshManagerViews() {
  if (!_uiModuleDelegationStack.has('refreshManagerViews')) {
    const service = getManagerWorkspaceService();
    if (typeof service?.refreshManagerViews === 'function') {
      _uiModuleDelegationStack.add('refreshManagerViews');
      try {
        return service.refreshManagerViews();
      } finally {
        _uiModuleDelegationStack.delete('refreshManagerViews');
      }
    }
  }

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
    const apiResult = await saveAdminSettingsThroughApi('save_restaurant_design', {
      restaurant_id: targetRestaurantId,
      design,
    });
    if (!apiResult.ok) {
      throw new Error(apiResult.payload?.error || 'design patch failed');
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
  const context = document.getElementById('categories-menu-context');
  const addForm = document.getElementById('catmgr-add-form');
  const addButton = document.getElementById('show-add-cat-btn');
  const addUntappdRow = document.getElementById('new-cat-untappd-row');
  if (!container) return;
  const canEdit = currentUserCanEditCategories();
  container.innerHTML = '';
  if (context) {
    const baseLabel = _activeMenuName ? `Editing: ${_activeMenuName}` : '';
    context.textContent = canEdit
      ? baseLabel
      : [baseLabel, 'Categories are admin-managed.'].filter(Boolean).join(' • ');
  }
  if (addButton) {
    addButton.style.display = canEdit ? '' : 'none';
    addButton.hidden = !canEdit;
    addButton.textContent = '+ Add Category';
  }
  if (addForm && !canEdit) addForm.style.display = 'none';
  if (addUntappdRow) addUntappdRow.style.display = canEdit && MENU_TYPE !== 'food' ? '' : 'none';
  const managedCategories = getManagedCategoryDefs();
  if (!canEdit) {
    const note = document.createElement('div');
    note.className = 'catmgr-readonly-note';
    note.innerHTML = `
      <strong>Admin-managed.</strong>
      Managers can add and edit items here, but category changes are handled by admins.`;
    container.appendChild(note);
  }
  managedCategories.forEach((cat, idx) => {
    const card = document.createElement('div');
    card.className = 'catmgr-card';
    card.id = 'catmgr-' + cat.id;
    const isFirst = idx === 0;
    const isLast  = idx === managedCategories.length - 1;
    const canManageCategory = canEdit && !isProtectedSystemCategory(cat.id);
    const untappdRowHtml = shouldShowCategoryUntappdControl(cat)
      ? `
        <label class="catmgr-checkbox-row" for="ce-untappd-${escHtml(cat.id)}">
          <input type="checkbox" id="ce-untappd-${escHtml(cat.id)}" name="category-untappd-${escHtml(cat.id)}"${normalizeCategoryUntappdEnabled(cat) ? ' checked' : ''}/>
          <span>Enable Untappd import for this category</span>
        </label>`
      : '';
    card.innerHTML = `
      <div class="catmgr-row">
        <div class="catmgr-icon" style="background:${escHtml(cat.color)}">${escHtml(cat.icon)}</div>
        <div class="catmgr-info">
          <div class="catmgr-title">${escHtml(cat.title)}</div>
          <div class="catmgr-sub">${escHtml(cat.sub || '')}</div>
        </div>
        ${canManageCategory
          ? `<div class="catmgr-actions">
              <button class="btn-small" onclick="moveCategoryUp('${escHtml(cat.id)}')" ${isFirst ? 'disabled' : ''} title="Move up" aria-label="Move ${escHtml(cat.title)} up">↑</button>
              <button class="btn-small" onclick="moveCategoryDown('${escHtml(cat.id)}')" ${isLast ? 'disabled' : ''} title="Move down" aria-label="Move ${escHtml(cat.title)} down">↓</button>
              <button class="btn-small" onclick="toggleCategoryEdit('${escHtml(cat.id)}')" aria-label="Edit ${escHtml(cat.title)}">✏️</button>
              <button class="btn-small btn-danger" onclick="deleteCategory('${escHtml(cat.id)}')" aria-label="Delete ${escHtml(cat.title)}">×</button>
            </div>`
          : `<div class="catmgr-readonly-pill">${canEdit ? 'Fixed category' : 'Admin-managed'}</div>`}
      </div>
      ${canManageCategory
        ? `<div class="catmgr-edit" id="catmgr-edit-${escHtml(cat.id)}" style="display:none">
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
            ${untappdRowHtml}
            <div class="catmgr-save-row">
              <button class="btn-small" onclick="toggleCategoryEdit('${escHtml(cat.id)}')">Cancel</button>
              <button class="btn-small" onclick="saveCategoryEdit('${escHtml(cat.id)}')">Save</button>
            </div>
          </div>`
        : ''}`;
    container.appendChild(card);
  });
}

function toggleCategoryEdit(catId) {
  if (!currentUserCanEditCategories() || isLegacySpecialCategory(catId) || isProtectedSystemCategory(catId)) return;
  const el = document.getElementById('catmgr-edit-' + catId);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function saveCategoryEdit(catId) {
  if (!currentUserCanEditCategories() || isLegacySpecialCategory(catId) || isProtectedSystemCategory(catId)) return;
  const cat = CATEGORY_DEFS.find(c => c.id === catId);
  if (!cat) return;
  const icon  = document.getElementById('ce-icon-'  + catId)?.value.trim() || cat.icon;
  const title = document.getElementById('ce-title-' + catId)?.value.trim();
  if (!title) { showToast('Title is required.', 'error'); return; }
  const sub   = document.getElementById('ce-sub-'   + catId)?.value.trim() || '';
  const ph    = document.getElementById('ce-ph-'    + catId)?.value.trim() || '';
  const untappdEnabled = shouldShowCategoryUntappdControl(cat)
    ? document.getElementById('ce-untappd-' + catId)?.checked === true
    : false;
  cat.icon = icon;
  cat.title = title;
  cat.sub = sub;
  cat.placeholder = ph;
  cat.untappdEnabled = untappdEnabled;
  toggleCategoryEdit(catId);
  markSaveOnlyDraftChange({
    key: `category:${catId}:copy`,
    label: `Updated category details for ${title}`,
    message: `Updated category details for ${title}`,
    sectionId: catId,
    kind: 'category-copy',
  });
  invalidateDiff();
  updateDraftIndicator();
  refreshAllViews();
  showToast('✅ Category draft updated.', 'success');
}

async function moveCategoryUp(catId) {
  if (!currentUserCanEditCategories() || isLegacySpecialCategory(catId) || isProtectedSystemCategory(catId)) return;
  const idx = CATEGORY_DEFS.findIndex(c => c.id === catId);
  if (idx <= 0) return;
  [CATEGORY_DEFS[idx-1], CATEGORY_DEFS[idx]] = [CATEGORY_DEFS[idx], CATEGORY_DEFS[idx-1]];
  markSaveOnlyDraftChange({
    key: `category:${catId}:move`,
    label: `Reordered categories`,
    message: `Reordered categories`,
    sectionId: catId,
    kind: 'category-order',
  });
  invalidateDiff();
  updateDraftIndicator();
  refreshAllViews();
}

async function moveCategoryDown(catId) {
  if (!currentUserCanEditCategories() || isLegacySpecialCategory(catId) || isProtectedSystemCategory(catId)) return;
  const idx = CATEGORY_DEFS.findIndex(c => c.id === catId);
  if (idx < 0 || idx >= CATEGORY_DEFS.length - 1) return;
  [CATEGORY_DEFS[idx], CATEGORY_DEFS[idx+1]] = [CATEGORY_DEFS[idx+1], CATEGORY_DEFS[idx]];
  markSaveOnlyDraftChange({
    key: `category:${catId}:move`,
    label: `Reordered categories`,
    message: `Reordered categories`,
    sectionId: catId,
    kind: 'category-order',
  });
  invalidateDiff();
  updateDraftIndicator();
  refreshAllViews();
}

async function deleteCategory(catId) {
  if (!currentUserCanEditCategories() || isLegacySpecialCategory(catId) || isProtectedSystemCategory(catId)) return;
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
  CATEGORY_DEFS = CATEGORY_DEFS.filter(c => c.id !== catId);
  delete menuState[catId];
  invalidateDiff();
  updateDraftIndicator();
  refreshAllViews();
  showToast('✅ Category moved into draft changes.', 'success');
}

function toggleAddCategoryForm() {
  if (!currentUserCanEditCategories()) return;
  const form = document.getElementById('catmgr-add-form');
  const btn  = document.getElementById('show-add-cat-btn');
  if (!form) return;
  const opening = form.style.display === 'none';
  if (!opening) {
    cancelAddCategoryForm();
    return;
  }
  form.style.display = '';
  if (btn) btn.textContent = '− Cancel';
  document.getElementById('new-cat-title')?.focus();
}

function cancelAddCategoryForm() {
  const form = document.getElementById('catmgr-add-form');
  const btn  = document.getElementById('show-add-cat-btn');
  if (form) form.style.display = 'none';
  if (btn) btn.textContent = '+ Add Category';
  const untappdEl = document.getElementById('new-cat-untappd-enabled');
  if (untappdEl) untappdEl.checked = false;
}

async function confirmAddCategory() {
  if (!currentUserCanEditCategories()) return;
  const icon  = document.getElementById('new-cat-icon')?.value.trim() || '🍸';
  const title = document.getElementById('new-cat-title')?.value.trim();
  if (!title) { showToast('Category title is required.', 'error'); return; }
  const sub = document.getElementById('new-cat-sub')?.value.trim() || '';
  const ph  = document.getElementById('new-cat-placeholder')?.value.trim() || `e.g. Add ${title} item…`;
  const untappdEnabled = MENU_TYPE !== 'food' && document.getElementById('new-cat-untappd-enabled')?.checked === true;
  const id  = 'cat_' + Date.now().toString(36);
  const color = getNextCategoryColor();
  // _uuid is left undefined; persistState() will INSERT and capture the generated UUID
  CATEGORY_DEFS.push({ id, icon, color, title, sub, placeholder: ph, untappdEnabled });
  menuState[id] = { items: [], lastSent: [] };
  // Reset form
  ['new-cat-icon','new-cat-title','new-cat-sub','new-cat-placeholder'].forEach(fid => {
    const el = document.getElementById(fid); if (el) el.value = '';
  });
  const iconEl = document.getElementById('new-cat-icon');
  if (iconEl) iconEl.value = '🍸';
  cancelAddCategoryForm();
  markSaveOnlyDraftChange({
    key: `category:${id}:add`,
    label: `Added category ${title}`,
    message: `Added category ${title}`,
    sectionId: id,
    kind: 'category-add',
  });
  invalidateDiff();
  updateDraftIndicator();
  refreshAllViews();
  showToast(`✅ Category "${title}" added to the draft.`, 'success');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function loadSupabaseConfig() {
  try {
    const bootstrap = await readSessionBootstrapThroughApi();
    const cfg = extractSupabaseConfigFromBootstrap(bootstrap || {});
    SUPABASE_URL = cfg.supabaseUrl || 'server-managed';
    SUPABASE_ANON_KEY = cfg.supabaseAnonKey || 'server-managed';
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
    const hasFirebaseAuth = listStorageKeys(localStorage).some(key => key.startsWith('firebase:'));
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
      const seededMenu = getMenuById(localStorage.getItem(LS_KEYS.menuId) || '') || MENUS.LEROYS_DRINKS;
      const context = buildFallbackMenuContext({
        menuId: seededMenu.id,
        restaurantId: seededMenu.restaurantId,
        menuType: seededMenu.type,
      });
      localStorage.setItem(LS_KEYS.menuCache, JSON.stringify({
        version: 2,
        entries: {
          [buildFallbackContextKey(context)]: {
            context,
            snapshot: { context, cats, meta },
          },
        },
      }));
    }

    clearLegacyLocalStorageKeys(localStorage);
    localStorage.setItem(LS_KEYS.lsSchemaVersion, '1');
  } catch (error) {
    clearLegacyLocalStorageKeys(localStorage);
    localStorage.setItem(LS_KEYS.lsSchemaVersion, '1');
    console.warn('Failed to migrate legacy local storage.', error);
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
    migrateLocalStorage();
    loadLocalConfig();
    await loadSupabaseConfig();
    const handledRecovery = await _tryHandleRecoveryCallback();
    if (!handledRecovery) await _tryRestoreSession();
    renderUserHeader({ skipPublicRender: true });
    syncPublicStaffFooterActions();
    await initLandingRootPage();
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

  const pageSession = ensureCurrentMenuSession();
  const openResult = await pageSession.open({
    resolveMenu: true,
    expectedRestaurantId: _siteRestaurant?.id || RESTAURANT_ID || '',
  });
  applyDesign(currentDesign);
  if (openResult?.showLoadError) {
    await showPublicViewWithError('⚠️ Could not load menu data. Check your connection.');
  } else {
    await showPublicView();
  }

  // Restore Supabase session — recovery callback takes priority over stored tokens
  const handledRecovery = await _tryHandleRecoveryCallback();
  if (!handledRecovery) await _tryRestoreSession();
  await _syncRequestedPageMode();
  const redirectNotice = consumeRedirectNotice();
  if (redirectNotice) showToast(redirectNotice, 'error');
}

async function _tryHandleRecoveryCallback() {
  const result = await getAccessSessionService().handleRecoveryCallback();
  if (result?.handled) {
    requestSignIn({ screen: result.screen || 'reset', origin: 'recovery-callback', reason: 'password-recovery' });
  }
  return !!result?.handled;
}

async function _tryRestoreSession() {
  const result = await getAccessSessionService().restoreStoredSession();
  if (result?.reason === 'expired') {
    showToast('Your saved session expired. Sign in again.', 'info');
  } else if (result?.reason === 'retry-scheduled') {
    showToast('Unable to verify your saved session right now. Retrying...', 'info');
  }
  return result;
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

function buildPublicRouteRenderSnapshot(options = {}) {
  const actor = Object.prototype.hasOwnProperty.call(options, 'actor')
    ? options.actor
    : currentUser;
  const siteRestaurant = options.siteRestaurantId
    ? (getRestaurantById(options.siteRestaurantId) || _siteRestaurant)
    : _siteRestaurant;
  return {
    activeMenuName: _activeMenuName,
    appVersion: APP_VERSION,
    canEditRestaurantSpecials: currentUserCanEditRestaurantSpecials(RESTAURANT_ID, actor),
    categoryDefs: getPublicCategoryDefs(),
    currentUser: actor,
    featuredItems: getCurrentMenuFeaturedItems(),
    isPreview: IS_PREVIEW,
    knownMenus: knownMenuList(),
    lastUpdatedTs: getLastUpdatedTs(),
    menuId: MENU_ID,
    menuState,
    menuType: MENU_TYPE,
    publicFooter: buildPublicStaffFooterState(actor, {
      menuId: MENU_ID,
      restaurantId: RESTAURANT_ID,
    }),
    restaurantId: RESTAURANT_ID,
    siteRestaurant,
  };
}

async function switchPublicRouteMenu(menuRef) {
  const menu = typeof menuRef === 'string'
    ? (getMenuById(menuRef) || getMenuBySlug(menuRef))
    : menuRef;
  if (!menu?.id) return { ok: false, userHandled: true };

  selectMenu(menu.id, menu.slug, menu.name, menu.type, menu.restaurantId);
  const targetHref = getPublicHrefForCurrentMenu();
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (targetHref && targetHref !== currentHref) {
    navigateToPage(targetHref);
    return { ok: true, navigated: true, targetHref };
  }

  await loadActiveMenuState();
  applyDesign(currentDesign);
  await renderPublicViews();
  return {
    ok: true,
    navigated: false,
    snapshot: buildPublicRouteRenderSnapshot(),
  };
}

function createPublicRouteAdapter(contractOrMenuState, legacyState = {}, options = {}) {
  if (contractOrMenuState?.snapshot && contractOrMenuState?.actions) return contractOrMenuState;

  const snapshot = {
    menuState: contractOrMenuState,
    ...(legacyState || {}),
  };
  const helpers = {
    escHtml,
    formatUpdatedAt,
    getMenuTypeLabel,
    ...(options.helpers || {}),
  };
  const actionOverrides = options.actions || {};

  return {
    version: 0,
    snapshot,
    helpers,
    actions: {
      closeDropdowns: actionOverrides.closeDropdowns || (() => closeRouteDropdowns()),
      openManager: actionOverrides.openManager || (() => onActionBtnClick()),
      openAdmin: actionOverrides.openAdmin || (() => onAdminBtnClick()),
      canManageMenu: actionOverrides.canManageMenu || ((menuId, user = snapshot.currentUser) => currentUserCanManageMenu(menuId, user)),
      switchMenu: actionOverrides.switchMenu || (menu => switchPublicRouteMenu(menu)),
    },
  };
}

function createPublicRouteContract() {
  const actor = currentUser;
  const siteRestaurantId = _siteRestaurant?.id || '';
  return {
    version: 1,
    snapshot: buildPublicRouteRenderSnapshot({ actor, siteRestaurantId }),
    helpers: {
      escHtml,
      formatUpdatedAt,
      getMenuTypeLabel,
    },
    actions: {
      closeDropdowns: () => closeRouteDropdowns(),
      openManager: () => onActionBtnClick(),
      openAdmin: () => onAdminBtnClick(),
      openAuthOverlay: () => requestSignIn({ screen: 'signin', origin: 'public-route-contract' }),
      signOut: () => signOut(),
      canManageMenu: (menuId, user = actor) => currentUserCanManageMenu(menuId, user),
      switchMenu: menu => switchPublicRouteMenu(menu),
    },
  };
}

function getRegisteredPublicRouteRenderer() {
  const renderer = window.__publicRouteRenderer || window.__pendingPublicRouteRenderer || null;
  if (!renderer || typeof renderer.render !== 'function') return null;
  if (window.__pendingPublicRouteRenderer && !window.__publicRouteRenderer) {
    window.__publicRouteRenderer = window.__pendingPublicRouteRenderer;
    delete window.__pendingPublicRouteRenderer;
  }
  if (renderer.restaurantId && _siteRestaurant?.id && renderer.restaurantId !== _siteRestaurant.id) {
    return null;
  }
  return renderer;
}

window.registerPublicRouteRenderer = function registerPublicRouteRenderer(renderer) {
  window.__publicRouteRenderer = renderer || null;
  if (window.__pendingPublicRouteRenderer) delete window.__pendingPublicRouteRenderer;
  return window.__publicRouteRenderer;
};

function showRouteBootView() {
  if (!isDedicatedRestaurantPage()) return;
  const publicView = document.getElementById('public-view');
  const loadingView = document.getElementById('loading-view');
  if (loadingView) loadingView.style.display = 'none';
  if (publicView) publicView.style.display = 'block';
  const renderer = getRegisteredPublicRouteRenderer();
  if (renderer?.boot) {
    const didRender = renderer.boot(createPublicRouteContract());
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
  const lockedCard = document.getElementById('manager-locked-card');
  loadingView.style.display = 'block';
  loadingView.classList.toggle('loading-view-locked', !!opts.showLockedState);
  if (spinner) spinner.style.display = opts.hideSpinner ? 'none' : '';
  if (textEl) textEl.textContent = message;
  if (lockedCard) lockedCard.hidden = !opts.showLockedState;
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
  const session = ensureCurrentMenuSession({
    requestedMenuId: menuId,
    requestedMenuSlug: fallbackMenu?.slug || '',
    siteRestaurantId: fallbackMenu?.restaurantId || '',
  });
  const openResult = await session.open({
    resolveMenu: true,
    expectedRestaurantId: fallbackMenu?.restaurantId || '',
    requestedMenuId: menuId,
    requestedMenuSlug: fallbackMenu?.slug || '',
    siteRestaurantId: fallbackMenu?.restaurantId || '',
  });
  if (!MENU_ID || !openResult?.snapshot?.menuId) return false;
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
  return getAccessSessionService().syncRequestedPageMode();
}

// ─── AUTO-REFRESH POLLING ────────────────────────────────────────────────────
function handlePollSuccess(result = {}) {
  _pollFailCount = 0;
  const syncEl = document.getElementById('sync-status');
  if (syncEl?.classList.contains('sync-poll-error')) {
    syncEl.textContent = '';
    syncEl.className = '';
  }
  syncManagerActionBarStatus(syncEl);
  return result;
}

function handlePollError() {
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

function createMenuPollScheduler({ loader, onResult, onError, getContextKey }) {
  if (!_sessionModuleDelegationStack.has('createMenuPollScheduler')) {
    const boundary = getSessionModuleBoundary();
    if (typeof boundary?.createMenuPollScheduler === 'function') {
      _sessionModuleDelegationStack.add('createMenuPollScheduler');
      try {
        return boundary.createMenuPollScheduler({ loader, onResult, onError, getContextKey }, {
          fallback: () => createMenuPollScheduler({ loader, onResult, onError, getContextKey }),
        });
      } finally {
        _sessionModuleDelegationStack.delete('createMenuPollScheduler');
      }
    }
  }

  let activeToken = 0;
  let inFlight = null;
  let queuedReason = '';
  let queuedToken = 0;

  async function run(reason = 'interval') {
    const token = ++activeToken;
    if (inFlight) {
      queuedReason = reason;
      queuedToken = token;
      return inFlight;
    }

    inFlight = (async () => {
      let currentReason = reason;
      let currentToken = token;
      let finalResult = { skipped: true };
      while (true) {
        const requestContext = getContextKey();
        if (!requestContext) {
          finalResult = { skipped: true, reason: 'missing-context' };
        } else {
          try {
            const result = await loader({ reason: currentReason, requestContext });
            const isLatest = currentToken === activeToken;
            const contextUnchanged = requestContext === getContextKey();
            if (isLatest && contextUnchanged) {
              finalResult = await onResult(result, { reason: currentReason, requestContext });
            } else {
              finalResult = { ignored: true, reason: 'stale-result' };
            }
          } catch (error) {
            const isLatest = currentToken === activeToken;
            const contextUnchanged = requestContext === getContextKey();
            if (isLatest && contextUnchanged) onError(error, { reason: currentReason, requestContext });
            finalResult = { error };
          }
        }

        if (!queuedReason) break;
        currentReason = queuedReason;
        currentToken = queuedToken || ++activeToken;
        queuedReason = '';
        queuedToken = 0;
      }
      return finalResult;
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  return {
    tick() {
      return run('interval');
    },
    resume() {
      return run('resume');
    },
    reset() {
      activeToken = 0;
      inFlight = null;
      queuedReason = '';
      queuedToken = 0;
    },
  };
}

function getMenuPollScheduler() {
  if (_menuPollScheduler) return _menuPollScheduler;
  _menuPollScheduler = createMenuPollScheduler({
    loader: async ({ requestContext }) => {
      const [menuId, menuType, restaurantId] = requestContext.split('|');
      return ensureCurrentMenuSession({
        requestedMenuId: menuId,
        requestedMenuSlug: getMenuById(menuId)?.slug || '',
        siteRestaurantId: restaurantId || '',
      }).refresh({
        reason: 'poll',
        requestedMenuId: menuId,
        source: 'poll',
        expectedMenuType: menuType,
      });
    },
    onResult: async result => {
      if (result?.changed) {
        await renderPublicViews();
      }
      if (result?.designChanged) applyDesign(currentDesign);
      return handlePollSuccess(result);
    },
    onError: () => {
      handlePollError();
    },
    getContextKey: () => (MENU_ID ? `${MENU_ID}|${MENU_TYPE}|${RESTAURANT_ID || ''}` : ''),
  });
  return _menuPollScheduler;
}

function startPolling() {
  stopPolling();
  if (!SUPABASE_URL || !MENU_ID) return;
  const scheduler = getMenuPollScheduler();

  const pollCycle = () => {
    if (isManagerMode || isAdminMode) return;
    scheduler.tick();
  };

  // Start the 10-second polling interval (only while tab is visible)
  const startInterval = () => { syncInterval = setInterval(pollCycle, 10000); };

  if (document.visibilityState === 'visible') startInterval();

  _visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      // Tab became visible — poll immediately and restart the interval
      scheduler.resume();
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
  _menuPollScheduler?.reset?.();
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
  if (!el) {
    renderFooter();
    return;
  }
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
  const showManagerMeta = !!currentUser && (isManagerMode || isAdminMode);
  const staffFooterState = buildPublicStaffFooterState();
  const publicVersionEl = document.getElementById('footer-version');
  const publicUpdatedEl = document.getElementById('footer-last-updated');
  const managerVersionEl = document.getElementById('manager-footer-version');
  const managerUpdatedEl = document.getElementById('manager-footer-last-updated');
  const managerMenuEl = document.getElementById('manager-footer-menu-name');

  [publicVersionEl, managerVersionEl].forEach(el => {
    if (el) el.innerHTML = versionHtml;
  });
  if (managerMenuEl) managerMenuEl.textContent = showManagerMeta ? (displayName || 'No menu selected') : '';

  [publicUpdatedEl, managerUpdatedEl].forEach(el => {
    if (!el) return;
    if (ts) {
      el.textContent = (el === managerUpdatedEl && !showManagerMeta) ? '' : `Updated ${formatRelativeTime(ts)}`;
      el.title = (el === managerUpdatedEl && !showManagerMeta) ? '' : formatUpdatedAt(ts, 'Updated ');
    } else {
      el.textContent = el === managerUpdatedEl ? 'Updated —' : '';
      el.title = '';
    }
  });
  if (managerUpdatedEl && !showManagerMeta) {
    managerUpdatedEl.textContent = '';
    managerUpdatedEl.title = '';
  }
  syncPublicStaffFooterActions(staffFooterState);
}

function buildPublicStaffFooterState(user = currentUser, options = {}) {
  if (!_uiModuleDelegationStack.has('buildPublicStaffFooterState')) {
    const service = getPublicFooterActionsService();
    if (typeof service?.buildPublicStaffFooterState === 'function') {
      _uiModuleDelegationStack.add('buildPublicStaffFooterState');
      try {
        return service.buildPublicStaffFooterState(user, options);
      } finally {
        _uiModuleDelegationStack.delete('buildPublicStaffFooterState');
      }
    }
  }

  const menuId = options.menuId || MENU_ID;
  const restaurantId = options.restaurantId || RESTAURANT_ID;
  const signedIn = !!user;
  const canManageCurrentMenu = signedIn && (
    menuId
      ? currentUserCanManageMenu(menuId, user)
      : (user?.role === 'manager' || user?.role === 'admin')
  );
  const isAdmin = user?.role === 'admin';
  const links = [];

  if (canManageCurrentMenu) {
    links.push({
      key: 'manager',
      label: 'Manager',
      href: getManagerHrefForMenuId(menuId),
      action: 'navigate',
    });
  }
  if (isAdmin) {
    links.push({
      key: 'admin',
      label: 'Admin',
      href: getAdminHrefForMenuId(menuId),
      action: 'navigate',
    });
  }
  if (signedIn) {
    links.push({
      key: 'signout',
      label: 'Sign Out',
      href: '',
      action: 'signOut',
    });
  }

  return {
    signedIn,
    menuId,
    restaurantId,
    signIn: signedIn
      ? null
      : {
          key: 'signin',
          label: 'Staff Sign-In',
          href: '',
          action: 'openAuthOverlay',
        },
    links,
  };
}

function syncPublicStaffFooterActions(state = buildPublicStaffFooterState()) {
  if (!_uiModuleDelegationStack.has('syncPublicStaffFooterActions')) {
    const service = getPublicFooterActionsService();
    if (typeof service?.syncPublicStaffFooterActions === 'function') {
      _uiModuleDelegationStack.add('syncPublicStaffFooterActions');
      try {
        return service.syncPublicStaffFooterActions(state);
      } finally {
        _uiModuleDelegationStack.delete('syncPublicStaffFooterActions');
      }
    }
  }

  const footerWraps = document.querySelectorAll('[data-route-footer-actions], [data-route-staff-actions]');
  const signInEls = document.querySelectorAll('[data-route-footer-signin], [data-route-staff-signin]');
  const managerEls = document.querySelectorAll('[data-route-footer-manager], [data-route-staff-manager]');
  const adminEls = document.querySelectorAll('[data-route-footer-admin], [data-route-staff-admin]');
  const signOutEls = document.querySelectorAll('[data-route-footer-signout], [data-route-staff-signout]');
  const managerLink = state.links.find(link => link.key === 'manager') || null;
  const adminLink = state.links.find(link => link.key === 'admin') || null;
  const signOutLink = state.links.find(link => link.key === 'signout') || null;

  footerWraps.forEach(footerWrap => {
    footerWrap.style.display = state.signedIn || state.signIn ? '' : 'none';
  });
  signInEls.forEach(signInEl => {
    signInEl.style.display = state.signIn ? '' : 'none';
    signInEl.textContent = state.signIn?.label || '';
    signInEl.onclick = state.signIn ? () => requestSignIn({ screen: 'signin', origin: 'public-footer' }) : null;
  });
  managerEls.forEach(managerEl => {
    managerEl.style.display = managerLink ? '' : 'none';
    managerEl.textContent = managerLink?.label || '';
    managerEl.onclick = managerLink ? () => navigateToPage(managerLink.href) : null;
  });
  adminEls.forEach(adminEl => {
    adminEl.style.display = adminLink ? '' : 'none';
    adminEl.textContent = adminLink?.label || '';
    adminEl.onclick = adminLink ? () => navigateToPage(adminLink.href) : null;
  });
  signOutEls.forEach(signOutEl => {
    signOutEl.style.display = signOutLink ? '' : 'none';
    signOutEl.textContent = signOutLink?.label || '';
    signOutEl.onclick = signOutLink ? () => signOut() : null;
  });
}

function renderFeaturedPublicSection() {
  const featuredEl = document.getElementById('featured-public-section');
  if (!featuredEl) return;
  const featuredItems = getCurrentMenuFeaturedItems().slice(0, 5);
  if (!featuredItems.length) {
    featuredEl.style.display = 'none';
    featuredEl.innerHTML = '';
    return;
  }
  featuredEl.style.display = '';
  const featuredItemsHtml = featuredItems.map(item => {
    const is86 = item?.eightySixed;
    const showDescription = isItemDescriptionPublic(item);
    const showRecipe = isItemRecipePublic(item);
    const description = showDescription ? String(item?.desc || '').trim() : '';
    const recipeText = showRecipe ? recipeArray(item?.recipe).join(', ') : '';
    const upcharges = itemUpchargeArray(item?.upcharges);
    const classes = ['featured-slot', is86 ? 'is-eighty-sixed' : ''].filter(Boolean).join(' ');
    const priceHtml = item?.price ? `<span class="featured-price">${escHtml(item.price)}</span>` : '';
    const descriptionHtml = description ? `<div class="featured-slot-desc">${escHtml(description)}</div>` : '';
    const recipeHtml = recipeText ? `<div class="featured-slot-desc featured-slot-desc--secondary">Recipe: ${escHtml(recipeText)}</div>` : '';
    const upchargesHtml = upcharges.length
      ? `<div class="featured-upcharges-row">${upcharges.map(upcharge => `<span class="featured-upcharge-chip">${escHtml(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${escHtml(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
      : '';
    return `<div class="${classes}">
      <div class="featured-slot-main">
        <span class="featured-slot-name">${escHtml(item?.name || '')}</span>
        ${priceHtml}
        ${is86 ? '<span class="eighty-sixed-tag">86\'D</span>' : ''}
      </div>
      ${descriptionHtml}
      ${recipeHtml}
      ${upchargesHtml}
    </div>`;
  }).join('');
  featuredEl.innerHTML = `<div class="featured-group">
    <div class="featured-group-name">${escHtml(getRestaurantSpecialLabel(RESTAURANT_ID))}</div>
    ${featuredItemsHtml}
  </div>`;
}

function buildPublicItemHtml(item) {
  const isFood = MENU_TYPE === 'food';
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
  await getPublicRenderCoordinator().schedule({ cause: 'public-view' });
}

function shouldRenderPublicShell() {
  if (isManagerMode || isAdminMode) return false;
  const publicView = document.getElementById('public-view');
  if (publicView && publicView.style.display === 'none') return false;
  return true;
}

function createPublicRenderCoordinator({ renderer, isVisible }) {
  let scheduledPass = null;
  let renderInFlight = false;
  let rerenderRequested = false;

  async function runPass() {
    if (!isVisible()) return { rendered: false, skipped: 'hidden' };
    renderInFlight = true;
    try {
      do {
        rerenderRequested = false;
        await renderer();
      } while (rerenderRequested && isVisible());
      return { rendered: true };
    } finally {
      renderInFlight = false;
    }
  }

  return {
    async schedule() {
      if (!isVisible()) return { rendered: false, skipped: 'hidden' };
      if (renderInFlight) {
        rerenderRequested = true;
        return scheduledPass || { rendered: false, queued: true };
      }
      if (scheduledPass) return scheduledPass;
      scheduledPass = Promise.resolve()
        .then(() => runPass())
        .finally(() => {
          scheduledPass = null;
        });
      return scheduledPass;
    },
    reset() {
      scheduledPass = null;
      renderInFlight = false;
      rerenderRequested = false;
    },
  };
}

function getPublicRenderCoordinator() {
  if (_publicRenderCoordinator) return _publicRenderCoordinator;
  _publicRenderCoordinator = createPublicRenderCoordinator({
    renderer: async () => {
      await _renderCustomDesignView();
    },
    isVisible: () => shouldRenderPublicShell(),
  });
  return _publicRenderCoordinator;
}

function _renderDefaultPublicView() {
  const container = document.getElementById('public-categories');
  container.innerHTML = '';
  renderFeaturedPublicSection();
  const lastSentCats = menuState._meta && menuState._meta.lastSentCategories;
  getPublicCategoryDefs().forEach(cat => {
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
  if (!_restaurantCustomDesignEnabled || !container) {
    _togglePublicShellMode('default');
    _renderDefaultPublicView();
    return;
  }

  document.getElementById('custom-design-style')?.remove();

  const routeContract = createPublicRouteContract();
  const renderer = renderIntoSiteWrapper ? getRegisteredPublicRouteRenderer() : null;
  if (renderer?.render) {
    const didRender = renderer.render(routeContract);
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

function getAuthApiBoundary() {
  if (globalThis.__HF_AUTH_API__ && typeof globalThis.__HF_AUTH_API__ === 'object') {
    return globalThis.__HF_AUTH_API__;
  }
  return {
    signUp: ({ email = '', password = '', name = '' } = {}) => fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign_up', email, password, name }),
    }).then(response => readAuthApiPayload(response, 'Sign-up failed.')),
    signIn: ({ email = '', password = '' } = {}) => fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign_in', email, password }),
    }).then(response => readAuthApiPayload(response, 'Authentication failed.')),
    refreshToken: ({ refreshToken = '' } = {}) => fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', refresh_token: refreshToken }),
    }).then(response => readAuthApiPayload(response, 'Session refresh failed.')),
    getProfile: ({ accessToken = '' } = {}) => fetch('/api/auth?mode=profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(response => readAuthApiPayload(response, 'Failed to load profile.'))
      .then(payload => extractProfileFromBootstrap(payload || {})),
    resetPasswordForEmail: ({ email = '', redirectTo = '' } = {}) => fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', email, redirect_to: redirectTo }),
    }).then(response => readAuthApiPayload(response, 'Failed to send reset email.'))
      .then(() => null),
    updatePassword: ({ accessToken = '', newPassword = '' } = {}) => fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'update_password', new_password: newPassword }),
    }).then(response => readAuthApiPayload(response, 'Failed to update password.')),
  };
}

async function sbSignUp(email, password, name) {
  return getAuthApiBoundary().signUp({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    email,
    password,
    name,
  });
}

async function sbSignIn(email, password) {
  return getAuthApiBoundary().signIn({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    email,
    password,
  });
}

async function sbRefreshToken(refreshToken) {
  return getAuthApiBoundary().refreshToken({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    refreshToken,
  });
}

async function sbGetProfile(accessToken) {
  const profile = extractProfileFromBootstrap(await getAuthApiBoundary().getProfile({
    accessToken,
  }) || {});
  const { role, name, accessibleMenuIds } = profile;
  return { role: role || 'none', name: name || '', accessibleMenuIds: normalizeAccessibleMenuIds(accessibleMenuIds) };
}

function buildSessionProfile(profile = {}) {
  return {
    role: profile?.role || 'none',
    name: profile?.name || '',
    accessibleMenuIds: normalizeAccessibleMenuIds(profile?.accessibleMenuIds),
  };
}

async function resolveAuthenticatedSessionProfile(accessToken) {
  if (!accessToken) return { ...buildSessionProfile(), profileUnavailable: false };
  try {
    return {
      ...buildSessionProfile(await sbGetProfile(accessToken)),
      profileUnavailable: false,
    };
  } catch (error) {
    if (isTerminalAuthSessionError(error)) throw error;
    return {
      ...buildSessionProfile(),
      profileUnavailable: true,
    };
  }
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
  } catch (error) {
    if (isTerminalAuthSessionError(error)) {
      showToast('Your session expired. Sign in again.', 'info');
      clearCurrentSessionState({ syncRequestedPageMode: false, exitViewOnSettings: false });
      return { role: 'none', name: '', accessibleMenuIds: [], authExpired: true };
    }
    showToast('Unable to refresh your access right now. Keeping your current session.', 'error');
    return {
      role: currentUser?.role || 'none',
      name: currentUser?.name || '',
      accessibleMenuIds: normalizeAccessibleMenuIds(currentUser?.accessibleMenuIds),
      staleProfile: true,
    };
  }
}

async function sbResetPasswordForEmail(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  return getAuthApiBoundary().resetPasswordForEmail({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    email,
    redirectTo,
  });
}

async function sbUpdatePassword(newPassword, accessToken) {
  return getAuthApiBoundary().updatePassword({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    accessToken,
    newPassword,
  });
}

function _scheduleTokenRefresh(expiresAt) {
  if (!_authModuleDelegationStack.has('scheduleTokenRefresh')) {
    const boundary = getAuthModuleBoundary();
    if (typeof boundary?.scheduleTokenRefresh === 'function') {
      _authModuleDelegationStack.add('scheduleTokenRefresh');
      try {
        return boundary.scheduleTokenRefresh(expiresAt, {
          now: () => Date.now(),
          clearExistingTimer: () => {
            if (_tokenRefreshTimer) clearTimeout(_tokenRefreshTimer);
          },
          setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
          setTimerRef: timer => { _tokenRefreshTimer = timer; },
          getCurrentUser: () => currentUser,
          refreshToken: refreshToken => sbRefreshToken(refreshToken),
          writeRefreshedTokens: ({ accessToken, refreshToken, expiresAt: nextExpiresAt }) => {
            if (!currentUser) return;
            currentUser.accessToken = accessToken;
            currentUser.refreshToken = refreshToken;
            currentUser.expiresAt = nextExpiresAt;
            lsSet(LS_KEYS.accessToken, currentUser.accessToken);
            lsSet(LS_KEYS.refreshToken, currentUser.refreshToken);
            lsSet(LS_KEYS.expiresAt, String(currentUser.expiresAt));
          },
          onRefreshFailure: error => {
            if (isTerminalAuthSessionError(error)) {
              showToast('Your session expired. Sign in again.', 'info');
              signOut();
              return;
            }
            showToast('Unable to refresh your session right now. Retrying soon.', 'error');
            scheduleSessionRefreshRetry();
          },
        });
      } finally {
        _authModuleDelegationStack.delete('scheduleTokenRefresh');
      }
    }
  }

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
    } catch (error) {
      if (isTerminalAuthSessionError(error)) {
        showToast('Your session expired. Sign in again.', 'info');
        signOut();
        return;
      }
      showToast('Unable to refresh your session right now. Retrying soon.', 'error');
      scheduleSessionRefreshRetry();
    }
  }, msUntilRefresh);
}

function _applySession(data, role, name, accessibleMenuIds = []) {
  if (!_authModuleDelegationStack.has('applySession')) {
    const boundary = getAuthModuleBoundary();
    if (typeof boundary?.applySession === 'function') {
      _authModuleDelegationStack.add('applySession');
      try {
        return boundary.applySession(data, role, name, accessibleMenuIds, {
          now: () => Date.now(),
          setCurrentUser: user => { currentUser = user; },
          writeStorage: user => {
            lsSet(LS_KEYS.accessToken, user.accessToken);
            lsSet(LS_KEYS.refreshToken, user.refreshToken);
            lsSet(LS_KEYS.expiresAt, String(user.expiresAt));
            lsSet(LS_KEYS.uid, user.uid);
            lsSet(LS_KEYS.email, user.email);
          },
          scheduleTokenRefresh: expiresAt => _scheduleTokenRefresh(expiresAt),
        });
      } finally {
        _authModuleDelegationStack.delete('applySession');
      }
    }
  }

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

function getUserChipRoots() {
  return Array.from(new Set(
    Array.from(document.querySelectorAll('[data-user-chip], .user-chip, [data-route-user-chip]')),
  ));
}

function getLegacyUserChipFallbackRoot() {
  const activeRoot = document.activeElement?.closest?.('[data-user-chip], .user-chip, [data-route-user-chip]') || null;
  if (activeRoot) return activeRoot;

  const roots = getUserChipRoots();
  if (!roots.length) return null;

  const classicRoot = roots.find(root => root.id === 'user-chip');
  if (classicRoot) return classicRoot;

  const legacyRoot = roots.find(root => root.classList?.contains('user-chip'));
  if (legacyRoot) return legacyRoot;

  return roots[0];
}

function getUserChipRoot(targetOrId = null) {
  let resolvedTarget = targetOrId;
  if (!resolvedTarget) {
    return getLegacyUserChipFallbackRoot();
  }
  if (!resolvedTarget) return null;
  if (typeof resolvedTarget === 'string') {
    return document.getElementById(resolvedTarget) ||
      document.querySelector(`[data-user-chip-id="${resolvedTarget}"]`);
  }
  return resolvedTarget.closest?.('[data-user-chip], .user-chip, [data-route-user-chip]') || null;
}

function getUserChipParts(root) {
  if (!root) return null;
  return {
    root,
    trigger: root.querySelector('[data-user-chip-trigger]') || root,
    panel: root.querySelector('[data-user-chip-panel]') ||
      root.querySelector('.user-dropdown, .ll-site-userdropdown, .erc-userdropdown'),
    initials: root.querySelector('[data-user-chip-initials]') ||
      root.querySelector('[id$="user-initials"]'),
    name: root.querySelector('[data-user-chip-name]') ||
      root.querySelector('[id$="user-dropdown-name"]'),
    role: root.querySelector('[data-user-chip-role]') ||
      root.querySelector('[id$="user-dropdown-role"]'),
  };
}

function setUserChipVisibility(isSignedIn) {
  const isDedicatedRouteModeActive = isDedicatedRestaurantPage() && document.body.classList.contains('restaurant-public-site');
  getUserChipRoots().forEach(root => {
    const scope = root.getAttribute('data-user-chip-scope');
    const scopedHidden = (scope === 'route' && !isDedicatedRouteModeActive) ||
      (scope === 'fallback' && isDedicatedRouteModeActive);
    root.style.display = (isSignedIn && !scopedHidden) ? '' : 'none';
  });
}

function hydrateUserChip(root, { initials, fullName, roleLabel }) {
  const parts = getUserChipParts(root);
  if (!parts) return;
  if (parts.initials) parts.initials.textContent = initials;
  if (parts.name) parts.name.textContent = fullName;
  if (parts.role) parts.role.textContent = roleLabel;
  if (parts.trigger) {
    parts.trigger.setAttribute('aria-expanded', root.classList.contains('open') ? 'true' : 'false');
  }
}

function renderUserHeader(options = {}) {
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
  _setDisplayBySelectorFiltered('[data-route-signin]', signedIn ? 'none' : '', el => !el.hasAttribute('data-route-signin-persistent'));
  _setDisplayBySelector('[data-route-signin-persistent]', '');
  setUserChipVisibility(signedIn);

  const actionBtn = document.getElementById('action-btn');
  const adminBtn  = document.getElementById('admin-btn');
  const adminDrawerBtn = document.getElementById('admin-btn-drawer');
  const drawerToggle = document.getElementById('settings-drawer-toggle');
  const adminDrawerToggle = document.getElementById('admin-mobile-drawer-toggle');
  const mobileDrawerTrigger = document.getElementById('manager-mobile-drawer-trigger');
  const lockedSignInBtn = document.getElementById('manager-locked-signin-btn');

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
  [drawerToggle, adminDrawerToggle, mobileDrawerTrigger].forEach(toggle => {
    if (!toggle) return;
    toggle.style.display = (!signedIn && isSettingsRoute) ? 'none' : '';
  });
  if (lockedSignInBtn) {
    lockedSignInBtn.textContent = signedIn ? 'Resume Manager' : 'Sign In';
  }
  updateDrawerAddItemButton();
  syncManagerMobileDrawerTrigger();

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
    getUserChipRoots().forEach(root => {
      hydrateUserChip(root, { initials, fullName, roleLabel });
    });
  }

  const publicView = document.getElementById('public-view');
  if (!options.skipPublicRender &&
      isDedicatedRestaurantPage() &&
      !isManagerMode &&
      !isAdminMode &&
      publicView?.style.display !== 'none') {
    renderPublicView();
  }
  syncPublicStaffFooterActions();
}

function applyRole(role) {
  const isAdmin = role === 'admin';
  const pruneSection = document.getElementById('prune-section');
  if (pruneSection) pruneSection.style.display = isAdmin ? '' : 'none';
  renderUserHeader();
  syncPublicStaffFooterActions();
}

function setActiveSettingsSection(sectionId) {
  document.querySelectorAll('.settings-rail-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === sectionId);
  });
}

function getSettingsDrawerDom() {
  const adminDrawer = document.getElementById('admin-settings-rail');
  const adminBackdrop = document.getElementById('admin-settings-drawer-backdrop');
  const adminToggle = document.getElementById('admin-mobile-drawer-toggle');
  const managerDrawer = document.getElementById('manager-settings-rail');
  const managerBackdrop = document.getElementById('settings-drawer-backdrop');
  const managerToggle = document.getElementById('settings-drawer-toggle');
  const managerMobileTrigger = document.getElementById('manager-mobile-drawer-trigger');

  const useAdminDrawer = (
    _appPageMode === 'admin' ||
    (document.body?.classList?.contains('admin-console-page') && !!adminDrawer) ||
    (!managerDrawer && !!adminDrawer)
  );

  if (useAdminDrawer) {
    return {
      drawer: adminDrawer,
      backdrop: adminBackdrop,
      toggle: adminToggle,
      mobileTrigger: null,
      mobileWidth: 900,
      bodyOpenClass: 'admin-settings-drawer-open',
    };
  }

  return {
    drawer: managerDrawer,
    backdrop: managerBackdrop,
    toggle: managerToggle,
    mobileTrigger: managerMobileTrigger,
    mobileWidth: 920,
    bodyOpenClass: 'settings-drawer-open',
  };
}

function setSettingsDrawerOpen(isOpen, options = {}) {
  const drawerDom = getSettingsDrawerDom();
  const { drawer, backdrop, toggle, mobileTrigger, mobileWidth, bodyOpenClass } = drawerDom;
  const isMobileDrawer = window.innerWidth <= mobileWidth;
  const shouldRestoreToggleFocus = options.restoreFocus !== false;
  if (!drawer || !backdrop) return;
  drawer.classList.toggle('is-open', !!isOpen && isMobileDrawer);
  drawer.setAttribute('aria-hidden', isMobileDrawer && !isOpen ? 'true' : 'false');
  backdrop.hidden = !(isOpen && isMobileDrawer);
  document.body.classList.remove('settings-drawer-open', 'admin-settings-drawer-open');
  document.body.classList.toggle(bodyOpenClass, !!isOpen && isMobileDrawer);
  if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (mobileTrigger) mobileTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen && isMobileDrawer) {
    requestAnimationFrame(() => {
      drawer.querySelector('.manager-shell-rail-close, .admin-console-rail-close, .settings-rail-btn.active, .settings-rail-btn')?.focus();
    });
  } else if (!isOpen && isMobileDrawer && shouldRestoreToggleFocus) {
    const preferredFocusTarget = document.body.classList.contains('manager-mobile-drawer-trigger-visible')
      ? mobileTrigger
      : toggle;
    preferredFocusTarget?.focus();
  }
  syncManagerMobileDrawerTrigger();
}

function toggleSettingsDrawer() {
  const { drawer } = getSettingsDrawerDom();
  if (!drawer) return;
  setSettingsDrawerOpen(!drawer.classList.contains('is-open'));
}

function closeSettingsDrawer(options = {}) {
  setSettingsDrawerOpen(false, options);
}

function onDrawerAddItemClick() {
  if (!canOpenAddItemModal()) return { ok: false, reason: 'forbidden' };
  closeSettingsDrawer({ restoreFocus: false });
  return openAddItemModal({ mode: ADD_ITEM_MODAL_SCAN_MODE });
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
  if (isManagerEditSection(sectionId)) {
    _activeManagerSection = sectionId;
    setManagerEditSectionVisibility(sectionId);
    refreshStaleManagerSection(sectionId);
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

function toggleUserDropdown(targetOrId = null) {
  const chip = getUserChipRoot(targetOrId);
  if (!chip) return;
  closeRouteDropdowns();
  closeUserChips(chip);
  const isOpen = chip.classList.toggle('open');
  const parts = getUserChipParts(chip);
  if (parts?.trigger) parts.trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) chip.querySelector('[data-user-chip-panel] button, [data-user-chip-panel] a')?.focus();
  if (isOpen && parts?.panel) {
    parts.panel.querySelector('button, a')?.focus();
  }
}

function closeUserChips(exceptChip = null, target = null) {
  getUserChipRoots().forEach(chip => {
    if (exceptChip && chip === exceptChip) return;
    if (target && chip.contains(target)) return;
    chip.classList.remove('open');
    getUserChipParts(chip)?.trigger?.setAttribute('aria-expanded', 'false');
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
  closeUserChips(null, e.target);
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
  const { drawer } = getSettingsDrawerDom();
  if (
    drawer?.classList.contains('is-open') ||
    document.body.classList.contains('settings-drawer-open') ||
    document.body.classList.contains('admin-settings-drawer-open')
  ) {
    closeSettingsDrawer();
  }
  getUserChipRoots().forEach(chip => {
    if (chip.classList.contains('open')) {
      chip.classList.remove('open');
      const parts = getUserChipParts(chip);
      if (parts?.trigger) {
        parts.trigger.setAttribute('aria-expanded', 'false');
        parts.trigger.focus();
      } else {
        chip.focus();
      }
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
  } else {
    const payload = await readPublicMenuIndexThroughApi();
    menus = sortKnownMenus(Array.isArray(payload?.allMenus) ? payload.allMenus : []);
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
  const nextHref = _appPageMode === 'public'
    ? getPublicHrefForMenuId(menuId)
    : (() => {
      const url = new URL(location.href);
      url.searchParams.set('menu', slug);
      return url.toString();
    })();
  if (nextHref) history.replaceState({}, '', nextHref);
  ensureCurrentMenuSession({
    requestedMenuId: menuId,
    requestedMenuSlug: slug,
    siteRestaurantId: restaurantId || '',
  });
  closeMenuPicker({ skipOnClose: true });
  updateActiveMenuBar();
  renderUserHeader({ skipPublicRender: !!cb });
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
  updateDrawerAddItemButton();
}

async function onSwitchMenuClick() {
  showMenuPicker(async () => {
    // Reload menu data into the manager view for the newly selected menu
    _uncatCategoryUuid = null;
    await ensureCurrentMenuSession().refresh();
    applyDesign(currentDesign);
    renderManagerWorkspace();
    updateDraftIndicator();
    updateSaveBtn();
    updateManagerActionBar();
    if (window.innerWidth <= 920) closeSettingsDrawer();
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
    await ensureCurrentMenuSession().refresh();
    applyDesign(currentDesign);
    await renderPublicViews();
  });
}

let _authFocusBefore = null;

function initAuthTriggerDelegation() {
  if (_authTriggerDelegated) return;
  _authTriggerDelegated = true;
  document.addEventListener('click', event => {
    const trigger = event.target?.closest?.('[data-auth-trigger]');
    if (!trigger) return;
    const screen = trigger.getAttribute('data-auth-trigger') || 'signin';
    const origin = trigger.getAttribute('data-auth-origin') || 'ui-trigger';
    requestSignIn({ screen, origin });
  });
}

function requestSignIn(options = {}) {
  let result;
  const controller = getAuthOverlayController();
  if (controller?.requestSignIn && !_authModuleDelegationStack.has('requestSignIn')) {
    _authModuleDelegationStack.add('requestSignIn');
    try {
      result = controller.requestSignIn(options);
    } finally {
      _authModuleDelegationStack.delete('requestSignIn');
    }
  } else {
    const normalized = (typeof options === 'string')
      ? { screen: options }
      : (options || {});
    result = openAuthOverlay(normalized.screen || 'signin');
  }
  syncPreviewAuditButton();
  return result;
}

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
  const controller = getAuthOverlayController();
  if (controller?.openAuthOverlay && !_authModuleDelegationStack.has('openAuthOverlay')) {
    _authModuleDelegationStack.add('openAuthOverlay');
    try {
      return controller.openAuthOverlay(screen);
    } finally {
      _authModuleDelegationStack.delete('openAuthOverlay');
    }
  }

  _setSettingsShellPending(false);
  _authFocusBefore = document.activeElement;
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  const noConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;
  const noConfigEl = document.getElementById('auth-no-config');
  const formWrapEl = document.getElementById('auth-form-wrap');
  if (noConfigEl) noConfigEl.style.display = noConfig ? '' : 'none';
  if (formWrapEl) formWrapEl.style.display = noConfig ? 'none' : '';
  if (!noConfig) renderAuthScreen(screen || 'signin');
  document.addEventListener('keydown', _authFocusTrap);
}

function closeAuthOverlay() {
  const controller = getAuthOverlayController();
  if (controller?.closeAuthOverlay && !_authModuleDelegationStack.has('closeAuthOverlay')) {
    _authModuleDelegationStack.add('closeAuthOverlay');
    try {
      return controller.closeAuthOverlay();
    } finally {
      _authModuleDelegationStack.delete('closeAuthOverlay');
    }
  }

  document.getElementById('auth-overlay')?.classList.remove('open');
  document.removeEventListener('keydown', _authFocusTrap);
  if (_authFocusBefore && typeof _authFocusBefore.focus === 'function') _authFocusBefore.focus();
  _authFocusBefore = null;
  _recoverySessionData = null;
}

function renderAuthScreen(screen) {
  let result;
  const controller = getAuthOverlayController();
  if (controller?.renderAuthScreen && !_authModuleDelegationStack.has('renderAuthScreen')) {
    _authModuleDelegationStack.add('renderAuthScreen');
    try {
      result = controller.renderAuthScreen(screen);
    } finally {
      _authModuleDelegationStack.delete('renderAuthScreen');
    }
  } else {
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
    syncAuthUsernameAssistFields();
    const firstInput = document.querySelector(`#auth-screen-${screen} input`);
    if (firstInput) setTimeout(() => firstInput.focus(), 0);
  }
  syncPreviewAuditButton();
  return result;
}

function setPreviewAuditButtonState({ visible = false, label = 'Use Preview Audit Session', disabled = false, note = '' } = {}) {
  const button = document.getElementById('preview-audit-btn');
  const noteEl = document.getElementById('preview-audit-note');
  if (!button || !noteEl) return;

  const show = !!visible && _authScreen === 'signin';
  button.hidden = !show;
  noteEl.hidden = !show;
  button.disabled = !!disabled;
  button.textContent = label || 'Use Preview Audit Session';
  noteEl.textContent = note || 'Preview-only helper for design audits.';
}

function getPreviewAuditRequestedMode() {
  return _appPageMode === 'admin' ? 'admin' : 'manager';
}

async function fetchPreviewAuditAvailability(options = {}) {
  const force = !!options.force;
  const requestedMode = getPreviewAuditRequestedMode();
  if (!IS_PREVIEW || !isSettingsPage()) {
    _previewAuditAvailability[requestedMode] = { available: false };
    return _previewAuditAvailability[requestedMode];
  }
  if (!force && _previewAuditAvailability[requestedMode]) return _previewAuditAvailability[requestedMode];
  if (!force && _previewAuditAvailabilityPromise[requestedMode]) return _previewAuditAvailabilityPromise[requestedMode];

  _previewAuditAvailabilityPromise[requestedMode] = (async () => {
    try {
      const response = await fetch(`${PREVIEW_AUDIT_SESSION_ENDPOINT}?mode=${encodeURIComponent(requestedMode)}`);
      const payload = await response.json().catch(() => ({}));
      _previewAuditAvailability[requestedMode] = {
        available: !!payload?.loopAudit?.available,
        label: payload?.loopAudit?.label || 'Use Preview Audit Session',
        mode: payload?.loopAudit?.mode || requestedMode,
      };
    } catch (_) {
      _previewAuditAvailability[requestedMode] = { available: false };
    } finally {
      _previewAuditAvailabilityPromise[requestedMode] = null;
    }
    return _previewAuditAvailability[requestedMode];
  })();

  return _previewAuditAvailabilityPromise[requestedMode];
}

async function syncPreviewAuditButton(options = {}) {
  if (_authScreen !== 'signin' || !IS_PREVIEW || !isSettingsPage()) {
    setPreviewAuditButtonState({ visible: false });
    return;
  }

  setPreviewAuditButtonState({
    visible: true,
    disabled: true,
    label: 'Checking Preview Audit Session…',
    note: 'Preview-only helper for design audits.',
  });

  const status = await fetchPreviewAuditAvailability(options);
  if (!status?.available) {
    setPreviewAuditButtonState({ visible: false });
    return;
  }

  setPreviewAuditButtonState({
    visible: true,
    disabled: false,
    label: status.label || 'Use Preview Audit Session',
    note: 'Preview-only helper for design audits.',
  });
}

async function handlePreviewAuditSignIn() {
  const errEl = document.getElementById('signin-error');
  const submitBtn = document.getElementById('signin-submit-btn');
  const button = document.getElementById('preview-audit-btn');
  const requestedMode = getPreviewAuditRequestedMode();
  if (errEl) errEl.textContent = '';

  const status = await fetchPreviewAuditAvailability();
  if (!status?.available) {
    if (errEl) errEl.textContent = 'Preview audit session is not configured for this deployment.';
    setPreviewAuditButtonState({ visible: false });
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  if (button) {
    button.disabled = true;
    button.textContent = 'Opening Preview Audit Session…';
  }

  try {
    const response = await fetch(PREVIEW_AUDIT_SESSION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview_audit_sign_in', mode: requestedMode }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.session?.access_token) {
      throw new Error(payload?.error || 'Preview audit session failed.');
    }
    const { role, profileUnavailable } = await getAccessSessionService().applyAuthenticatedSession(payload.session, { closeOverlay: true });
    await _syncRequestedPageMode();
    if (profileUnavailable) {
      showToast('Preview audit session opened, but access could not be verified yet.', 'info');
    } else if (role === 'none') {
      showToast('Preview audit session opened, but no menu access is configured.', 'info');
    }
  } catch (error) {
    if (errEl) errEl.textContent = error?.message || 'Preview audit session failed.';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (_authScreen === 'signin') syncPreviewAuditButton({ force: true });
  }
}

function getAuthUsernameHint(preferredIds = []) {
  const candidates = Array.isArray(preferredIds) ? preferredIds.slice() : [preferredIds];
  if (_recoverySessionData?.email) candidates.unshift(_recoverySessionData.email);
  ['signin-email', 'signup-email', 'forgot-email'].forEach(id => {
    if (!candidates.includes(id)) candidates.push(id);
  });
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes && candidate.includes('@')) return candidate.trim();
    const field = document.getElementById(candidate);
    const value = field?.value?.trim();
    if (value) return value;
  }
  return '';
}

function ensureAuthUsernameAssistField(form, preferredIds = []) {
  if (!form || !form.querySelector('input[type="password"]')) return null;
  const visibleUsernameField = form.querySelector('input[autocomplete="username"]:not(.auth-username-assist), input[name="username"]:not(.auth-username-assist)');
  if (visibleUsernameField) return visibleUsernameField;
  let assistField = form.querySelector('.auth-username-assist');
  if (!assistField) {
    assistField = document.createElement('input');
    assistField.type = 'email';
    assistField.className = 'auth-username-assist';
    assistField.tabIndex = -1;
    assistField.autocomplete = 'username';
    assistField.name = 'username';
    assistField.setAttribute('aria-hidden', 'true');
    form.insertBefore(assistField, form.firstChild);
  }
  assistField.value = getAuthUsernameHint(preferredIds);
  return assistField;
}

function syncAuthUsernameAssistFields() {
  const controller = getAuthOverlayController();
  if (controller?.syncAuthUsernameAssistFields && !_authModuleDelegationStack.has('syncAuthUsernameAssistFields')) {
    _authModuleDelegationStack.add('syncAuthUsernameAssistFields');
    try {
      return controller.syncAuthUsernameAssistFields();
    } finally {
      _authModuleDelegationStack.delete('syncAuthUsernameAssistFields');
    }
  }

  const configs = [
    { screenName: 'signup', preferredIds: ['signup-email'] },
    { screenName: 'reset', preferredIds: ['forgot-email', 'signin-email', 'signup-email'] },
  ];
  configs.forEach(({ screenName, preferredIds }) => {
    const form = document.querySelector(`#auth-screen-${screenName} .auth-screen-form`);
    ensureAuthUsernameAssistField(form, preferredIds);
  });
}

function initAuthForms() {
  const controller = getAuthOverlayController();
  if (controller?.initAuthForms && !_authModuleDelegationStack.has('initAuthForms')) {
    _authModuleDelegationStack.add('initAuthForms');
    try {
      return controller.initAuthForms();
    } finally {
      _authModuleDelegationStack.delete('initAuthForms');
    }
  }

  ['signin', 'signup', 'forgot', 'reset'].forEach(screenName => {
    const screen = document.getElementById(`auth-screen-${screenName}`);
    if (!screen || screen.querySelector('.auth-screen-form')) return;
    const form = document.createElement('form');
    form.className = 'auth-screen-form';
    form.noValidate = true;
    while (screen.firstChild) form.appendChild(screen.firstChild);
    form.addEventListener('submit', event => event.preventDefault());
    screen.appendChild(form);
    form.querySelectorAll('button').forEach(button => {
      button.type = 'button';
    });
    if (screenName === 'signin') {
      const usernameField = form.querySelector('#signin-email');
      const passwordField = form.querySelector('#signin-password');
      if (usernameField) {
        usernameField.autocomplete = 'username';
        usernameField.name = 'username';
        usernameField.inputMode = 'email';
      }
      if (passwordField) {
        passwordField.name = 'current-password';
      }
    }
    if (screenName === 'signup') ensureAuthUsernameAssistField(form, ['signup-email']);
    if (screenName === 'reset') ensureAuthUsernameAssistField(form, ['forgot-email', 'signin-email', 'signup-email']);
  });
  syncAuthUsernameAssistFields();
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
    const { role, profileUnavailable } = await getAccessSessionService().applyAuthenticatedSession(data, { closeOverlay: true });
    await _syncRequestedPageMode();
    if (profileUnavailable) {
      showToast('Signed in, but your access could not be verified yet.', 'info');
    } else if (role === 'none') {
      showToast('Signed in. Contact admin to get manager access.', 'info');
    }
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
    const recoveryData = _recoverySessionData;
    await sbUpdatePassword(password, recoveryData.access_token);
    await getAccessSessionService().applyAuthenticatedSession(recoveryData, { closeOverlay: true });
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

function clearCurrentSessionState(options = {}) {
  const { syncRequestedPageMode = true, exitViewOnSettings = true } = options;
  const boundary = getAuthModuleBoundary();
  if (typeof boundary?.clearStoredSession === 'function') {
    boundary.clearStoredSession({
      clearExistingTimer: () => {
        if (_tokenRefreshTimer) clearTimeout(_tokenRefreshTimer);
      },
      setTimerRef: value => { _tokenRefreshTimer = value; },
      setCurrentUser: value => { currentUser = value; },
      clearStorage: () => clearStoredAuthSessionKeys(),
    });
  } else {
    currentUser = null;
    if (_tokenRefreshTimer) { clearTimeout(_tokenRefreshTimer); _tokenRefreshTimer = null; }
    clearStoredAuthSessionKeys();
  }
  _managerMenuPicked = false;
  if (exitViewOnSettings && (isManagerMode || isAdminMode)) exitView();
  renderUserHeader();
  if (syncRequestedPageMode) _syncRequestedPageMode();
}

function signOut() {
  clearCurrentSessionState({ syncRequestedPageMode: true });
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
  updateManagerActionBar();
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
  if (!currentUser?.accessToken) { el.textContent = '⚠️ Sign in as an admin'; el.className = 'db-status db-status--error'; return; }
  el.textContent = 'Checking…'; el.className = 'db-status';
  try {
    const payload = await readApiJsonOrNull('/api/admin?action=readiness', {
      headers: getAuthorizedApiHeaders(),
    });
    if (payload?.connected) {
      el.textContent = '✓ Connected'; el.className = 'db-status db-status--ok';
    } else {
      el.textContent = `✗ Unreachable (${payload?.statusCode || 0})`; el.className = 'db-status db-status--error';
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

async function fetchMenuNotificationsConfig(menuId) {
  if (!currentUser?.accessToken || !menuId) return {};
  const payload = await readAdminSettingsContextThroughApi({ menuId });
  return payload?.notifications || {};
}

async function saveNotifications() {
  const targetMenuId = _adminSwitcherState.notif.menuId;
  if (!targetMenuId) { showToast('No menu selected.', 'info'); return; }
  const existingNotifications = targetMenuId === MENU_ID
    ? (NOTIFICATIONS || {})
    : await fetchMenuNotificationsConfig(targetMenuId);
  const notifications = {
    ...existingNotifications,
  };
  for (const channel of ['groupme', 'sms', 'discord', 'webhook']) {
    notifications[channel] = {
      enabled: !!document.getElementById(`notif-${channel}-enabled`)?.checked,
    };
  }
  // Keep global NOTIFICATIONS in sync if saving for the currently active menu
  if (targetMenuId === MENU_ID) NOTIFICATIONS = notifications;
  try {
    const apiResult = await saveAdminSettingsThroughApi('save_notifications', {
      menu_id: targetMenuId,
      notifications,
    });
    if (apiResult.ok) {
      showToast('✅ Notifications saved!', 'success');
      return;
    }
    throw new Error(apiResult.payload?.error || 'notifications patch failed');
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
    const apiResult = await saveAdminSettingsThroughApi('save_notification_credential_keys', {
      restaurant_id: restaurantId,
      notifications_config,
    });
    if (apiResult.ok) {
      showToast('Credential keys saved!', 'success');
      return;
    }
    throw new Error(apiResult.payload?.error || 'credential keys patch failed');
  } catch(e) {
    showToast(`Failed to save credential keys: ${escHtml(e.message)}`, 'error');
  }
}

async function saveMenuUrl() {
  const targetMenuId = _adminSwitcherState.notif.menuId || MENU_ID;
  if (!targetMenuId) {
    showToast('No menu selected.', 'info');
    return;
  }

  const rawValue = document.getElementById('menu-url-input')?.value || '';
  const normalizedUrl = normalizeMenuUrl(rawValue);
  if (rawValue.trim() && !normalizedUrl) {
    showToast('Enter a valid URL.', 'error');
    return;
  }

  const baseNotifications = targetMenuId === MENU_ID
    ? (NOTIFICATIONS || {})
    : await fetchMenuNotificationsConfig(targetMenuId);
  const notifications = { ...baseNotifications };
  if (normalizedUrl) notifications.menu_url = normalizedUrl;
  else delete notifications.menu_url;

  try {
    const apiResult = await saveAdminSettingsThroughApi('save_menu_url', {
      menu_id: targetMenuId,
      menu_url: normalizedUrl,
    });
    if (apiResult.ok) {
      if (targetMenuId === MENU_ID) NOTIFICATIONS = notifications;
      localStorage.removeItem(LS_KEYS.menuUrl);
      showToast('✅ Menu URL saved!', 'success');
      return;
    }
    throw new Error(apiResult.payload?.error || 'menu URL patch failed');
  } catch (e) {
    showToast(`Failed to save menu URL: ${escHtml(e.message)}`, 'error');
  }
}

// ─── ADMIN SWITCHER ───────────────────────────────────────────────────────────

async function loadAdminSwitcherData() {
  if (_adminRestaurants.length && _adminAllMenus.length) return; // already cached
  if (!currentUser?.accessToken) return;
  try {
    const payload = await readAdminCatalogThroughApi();
    if (payload?.restaurants) _adminRestaurants = payload.restaurants;
    if (payload?.allMenus) _adminAllMenus = payload.allMenus;
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
  if (!currentUser?.accessToken) return;
  if (context === 'notif') {
    const menuId       = _adminSwitcherState.notif.menuId;
    const restaurantId = _adminSwitcherState.notif.restaurantId;
    if (restaurantId && !isValidRestaurant(restaurantId)) {
      _populateAdminNotificationsPanel({});
      _populateNotifCredKeys({});
      return;
    }
    const urlInput = document.getElementById('menu-url-input');
    if (!menuId) {
      _populateAdminNotificationsPanel({});
      if (urlInput) urlInput.value = getNotificationMenuLink() || '';
    }
    else {
      const notifications = await fetchMenuNotificationsConfig(menuId);
      if (menuId === MENU_ID) NOTIFICATIONS = notifications;
      _populateAdminNotificationsPanel(notifications);
      if (urlInput) {
        urlInput.value = normalizeMenuUrl(notifications?.menu_url || '') ||
          getNotificationMenuLink(menuId, restaurantId) ||
          '';
      }
    }
    // Load per-restaurant credential keys
    if (restaurantId) {
      const payload = await readAdminSettingsContextThroughApi({ restaurantId });
      _populateNotifCredKeys(payload?.notifications_config || {});
    } else { _populateNotifCredKeys({}); }
  }
}

// ─── MANAGER SECTION TRACKING ────────────────────────────────────────────────
let _activeManagerSection = 'manager-overview-section';
const MANAGER_EDIT_SECTION_IDS = ['manager-items-section', 'manager-pricing-section', 'manager-description-section'];
let _managerStaleSections = new Set();

function markSectionsStaleLegacy(except) {
  MANAGER_EDIT_SECTION_IDS
    .filter(s => s !== except)
    .forEach(sectionId => {
      _managerStaleSections.add(sectionId);
      const section = document.getElementById(sectionId);
      if (!section || section.style.display === 'none') return;
      if (sectionId === 'manager-items-section') renderManagerCategories();
      else if (sectionId === 'manager-pricing-section') renderPricingSection();
      else if (sectionId === 'manager-description-section') renderDescriptionSection();
      _managerStaleSections.delete(sectionId);
    });
}

function setManagerEditSectionVisibilityLegacy() {
  MANAGER_EDIT_SECTION_IDS.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) section.style.display = '';
  });
}

function renderActiveManagerSectionLegacy() {
  renderManagerCategories();
  renderPricingSection();
  renderDescriptionSection();
}

function refreshStaleManagerSectionLegacy(sectionId) {
  if (!_managerStaleSections.has(sectionId)) return false;
  if (sectionId === 'manager-items-section') renderManagerCategories();
  else if (sectionId === 'manager-pricing-section') renderPricingSection();
  else if (sectionId === 'manager-description-section') renderDescriptionSection();
  _managerStaleSections.delete(sectionId);
  return true;
}

function isManagerEditSection(sectionId) {
  if (!_uiModuleDelegationStack.has('isManagerEditSection')) {
    const service = getManagerSectionService();
    if (typeof service?.isManagerEditSection === 'function') {
      _uiModuleDelegationStack.add('isManagerEditSection');
      try {
        return service.isManagerEditSection(sectionId);
      } finally {
        _uiModuleDelegationStack.delete('isManagerEditSection');
      }
    }
  }
  return MANAGER_EDIT_SECTION_IDS.includes(sectionId);
}

function markSectionsStale(except) {
  if (!_uiModuleDelegationStack.has('markSectionsStale')) {
    const service = getManagerSectionService();
    if (typeof service?.markSectionsStale === 'function') {
      _uiModuleDelegationStack.add('markSectionsStale');
      try {
        return service.markSectionsStale(except);
      } finally {
        _uiModuleDelegationStack.delete('markSectionsStale');
      }
    }
  }
  return markSectionsStaleLegacy(except);
}

function refreshStaleManagerSection(sectionId) {
  if (!_uiModuleDelegationStack.has('refreshStaleManagerSection')) {
    const service = getManagerSectionService();
    if (typeof service?.refreshStaleSection === 'function') {
      _uiModuleDelegationStack.add('refreshStaleManagerSection');
      try {
        return service.refreshStaleSection(sectionId);
      } finally {
        _uiModuleDelegationStack.delete('refreshStaleManagerSection');
      }
    }
  }
  return refreshStaleManagerSectionLegacy(sectionId);
}

function setManagerEditSectionVisibility() {
  if (!_uiModuleDelegationStack.has('setManagerEditSectionVisibility')) {
    const service = getManagerSectionService();
    if (typeof service?.setManagerEditSectionVisibility === 'function') {
      _uiModuleDelegationStack.add('setManagerEditSectionVisibility');
      try {
        return service.setManagerEditSectionVisibility();
      } finally {
        _uiModuleDelegationStack.delete('setManagerEditSectionVisibility');
      }
    }
  }
  return setManagerEditSectionVisibilityLegacy();
}

function renderActiveManagerSection() {
  if (!_uiModuleDelegationStack.has('renderActiveManagerSection')) {
    const service = getManagerSectionService();
    if (typeof service?.renderActiveManagerSection === 'function') {
      _uiModuleDelegationStack.add('renderActiveManagerSection');
      try {
        return service.renderActiveManagerSection();
      } finally {
        _uiModuleDelegationStack.delete('renderActiveManagerSection');
      }
    }
  }
  return renderActiveManagerSectionLegacy();
}

// ─── MANAGER CATEGORY EDIT (EDIT ITEMS) ─────────────────────────────────────
function renderManagerCategories() {
  const container = document.getElementById('manager-items-categories') || document.getElementById('manager-categories');
  if (!container) return;
  container.innerHTML = '';
  renderManagerAddItemLauncher();
  // Preserve uncategorized expansion state across re-renders
  const _uncatWasExpanded = !document.getElementById('mgr-card-' + UNCATEGORIZED_ID)?.classList.contains('collapsed');
  const uncategorized = getUncategorizedCategoryDef();

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
        ${isReadOnlyCategory ? `<p class="manager-category-note">Legacy category is read-only.</p>` : ''}
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
      <div class="cat-icon" style="background:${escHtml(uncategorized.color)}">${escHtml(uncategorized.icon)}</div>
      <div><div class="cat-title">${escHtml(uncategorized.title)}</div><div class="cat-sub">${escHtml(uncategorized.sub)}</div></div>
      <span class="category-chevron">›</span>
    </div>
    <div class="current-section">
      <div class="current-label">Item Pool</div>
      <div class="current-items" id="mgr-items-${UNCATEGORIZED_ID}"></div>
      <p class="manager-category-note">Use Add Item(s) to place new off-menu items in the pool.</p>
    </div>`;
  container.appendChild(uncatCard);
  renderManagerItems(UNCATEGORIZED_ID);
  renderAddItemModal();
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

function buildItemsRowHtml(item, catId, lastSentNames) {
  const is86 = !!item.eightySixed;
  const stateClass = is86 ? 'is-eighty-sixed' : (item.visibility === 'off_menu' ? 'is-off-menu' : '');
  const badge = getItemStateBadge(item, catId, lastSentNames);
  const featuredToggle = catId === FEATURED_SPECIALS_CATEGORY_ID
    ? `<label class="item-featured-toggle">
        <input type="checkbox" ${item.featuredEnabled ? 'checked' : ''} onchange="toggleFeaturedSpecialEnabled(${escAttrJs(catId)},${escAttrJs(item.id)},this.checked)"/>
        <span>Show in featured strip</span>
      </label>`
    : '';
  return `<div class="current-item items-row ${stateClass}">
      <div class="item-row-main">
        <button class="item-drag-handle" type="button" draggable="true"
          ondragstart="startManagerItemDrag(event,'${catId}','${item.id}')"
          ondragend="endManagerItemDrag(event)"
          title="Drag to reorder"
          aria-label="Drag to reorder ${escHtml(item.name)}">⋮⋮</button>
        ${badge.text ? `<div class="item-state-badge ${badge.className}" role="img" aria-label="${badge.label}" title="${badge.label}">${badge.text}</div>` : ''}
        <div class="item-name"><input type="text" value="${escHtml(item.name)}"
          aria-label="Item name for ${escHtml(item.name)}"
          onblur="renameItem('${catId}','${item.id}',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()"/></div>
      </div>
      ${featuredToggle}
      <span class="item-actions-compact">
        <button class="eighty-six-btn${is86 ? ' restore' : ''}" title="${is86 ? 'Restore' : '86'}" aria-label="${is86 ? `Restore ${escHtml(item.name)}` : `Mark ${escHtml(item.name)} 86'd`}" onclick="toggle86('${catId}','${item.id}')">${is86 ? '↩' : '86'}</button>
        <button class="del-item" onclick="removeItem('${catId}','${item.id}')" aria-label="Remove ${escHtml(item.name)}">×</button>
      </span>
    </div>`;
}

function getItemStateBadge(item, catId, lastSentNames = null) {
  return createDraftLedgerService().getItemBadge({ item, catId, lastSentNames });
}

function buildPricingRowHtml(item, catId) {
  const is86 = !!item.eightySixed;
  const stateClass = is86 ? 'is-eighty-sixed' : '';
  const badge = getItemStateBadge(item, catId);
  const upcharges = item.upcharges || [];
  const upchargeCount = upcharges.length;
  const upchargeMeta = upchargeCount
    ? `${upchargeCount} upcharge${upchargeCount === 1 ? '' : 's'} ready`
    : 'Base price only';
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
      <div class="pricing-row-main">
        <div class="pricing-row-title">
          <span class="item-name-static">${escHtml(item.name)}</span>
          ${badge.text ? `<span class="item-state-badge ${badge.className}">${badge.text}</span>` : ''}
        </div>
        <p class="pricing-row-meta">${escHtml(upchargeMeta)}</p>
      </div>
      <div class="pricing-row-controls">
        <label class="pricing-inline-field">
          <span class="pricing-inline-label">Base price</span>
          <input class="price-input" type="text" placeholder="Price…" aria-label="Price for ${escHtml(item.name)}"
            onblur="savePrice('${catId}','${item.id}',this.value)"
            onkeydown="if(event.key==='Enter')this.blur()"
            value="${escHtml(item.price||'')}"/>
        </label>
        <button class="upcharge-toggle-btn" title="Manage upcharges" aria-label="Manage upcharges for ${escHtml(item.name)}" aria-expanded="false" onclick="toggleUpcharges('${catId}','${item.id}')">
          <span class="upcharge-toggle-icon">+$</span>
          <span class="upcharge-toggle-label">Upcharges</span>
          ${upchargeCount > 0 ? `<span class="upcharge-count">${upchargeCount}</span>` : ''}
        </button>
      </div>
    </div>
    ${summaryHtml}
    ${panelHtml}`;
}

function buildDescriptionRowHtml(item, catId) {
  const isFood = MENU_TYPE === 'food';
  const ingredients = recipeArray(item.recipe);
  const is86 = !!item.eightySixed;
  const hasDesc = !!(item.desc && item.desc.trim());
  const hasRecipe = !isFood && ingredients.length > 0;
  const showDescription = isItemDescriptionPublic(item);
  const showRecipe = !isFood && isItemRecipePublic(item);
  const stateClass = is86 ? 'is-eighty-sixed' : '';
  const badge = getItemStateBadge(item, catId);
  const summaryParts = [hasDesc ? 'Description added' : 'No description'];
  if (!isFood) {
    summaryParts.push(hasRecipe ? `${ingredients.length} recipe entr${ingredients.length === 1 ? 'y' : 'ies'}` : 'No recipe');
  }
  return `<article class="description-editor-card ${stateClass}" id="description-editor-${item.id}">
      <button class="desc-row-header" type="button" aria-expanded="false" aria-controls="desc-edit-body-${item.id}" onclick="toggleDescriptionEditor(${escAttrJs(item.id)})">
        <div class="desc-row-main">
          <div class="desc-row-title">
            <span class="item-name-static">${escHtml(item.name)}</span>
            ${badge.text ? `<span class="item-state-badge ${badge.className}">${badge.text}</span>` : ''}
          </div>
          <p class="desc-row-meta">${escHtml(summaryParts.join(' · '))}</p>
        </div>
        <div class="desc-status-indicators">
          <span class="desc-indicator ${hasDesc ? 'has-content' : ''}${showDescription ? '' : ' is-hidden'}" id="desc-indicator-copy-${item.id}" data-label="Description">Description</span>
          ${isFood ? '' : `<span class="desc-indicator ${hasRecipe ? 'has-content' : ''}${showRecipe ? '' : ' is-hidden'}" id="recipe-indicator-copy-${item.id}" data-label="Recipe">Recipe</span>`}
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
          ${isFood ? '' : `<div class="recipe-field-block">
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
          </div>`}
        </div>
      </div>
    </article>`;
}

function renderManagerItems(catId) {
  const state = menuState[catId] || { items: [], lastSent: [] };
  const lastSentNames = new Set(state.lastSent.filter(i => i.onMenu !== false).map(i => i.name.trim().toLowerCase()));
  const visibleItems = getRenderableCategoryItems(catId);
  const listEl = document.getElementById('mgr-items-' + catId);
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!visibleItems.length) {
    const cat = catId === UNCATEGORIZED_ID ? getUncategorizedCategoryDef() : CATEGORY_DEFS.find(c => c.id === catId);
    const ph = cat?.placeholder ? ` Try: "${escHtml(cat.placeholder)}"` : '';
    const emptyCopy = catId === UNCATEGORIZED_ID
      ? 'Pool is empty — add items or delete a category to populate it.'
      : `Nothing here yet.${ph}`;
    listEl.innerHTML = `<div class="empty-state"><span class="empty-state-icon">+</span><span>${emptyCopy}</span></div>`;
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
  const renderCategoryPricing = cat => {
    const visibleItems = getRenderableCategoryItems(cat.id);
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
  };
  getManagedCategoryDefs().forEach(renderCategoryPricing);
  renderCategoryPricing(getUncategorizedCategoryDef());
}

// ─── DESCRIPTION SECTION RENDERER ────────────────────────────────────────────
function renderDescriptionSection() {
  const container = document.getElementById('manager-description-categories');
  if (!container) return;
  container.innerHTML = '';
  const renderCategoryDescriptions = cat => {
    const visibleItems = getRenderableCategoryItems(cat.id);
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
  };
  getManagedCategoryDefs().forEach(renderCategoryDescriptions);
  renderCategoryDescriptions(getUncategorizedCategoryDef());
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
  const visibleItems = getRenderableCategoryItems(catId);
  const fromIndex = visibleItems.findIndex(item => item.id === _managerDraggedItemId);
  const toIndex = visibleItems.findIndex(item => item.id === targetItemId);
  if (fromIndex < 0 || toIndex < 0) return;

  const reorderedVisible = [...visibleItems];
  const [movedItem] = reorderedVisible.splice(fromIndex, 1);
  reorderedVisible.splice(toIndex, 0, movedItem);
  menuState[catId].items = catId === UNCATEGORIZED_ID
    ? reorderedVisible
    : [
      ...reorderedVisible,
      ...items.filter(item => item.onMenu === false),
    ];

  const category = catId === UNCATEGORIZED_ID
    ? getUncategorizedCategoryDef()
    : CATEGORY_DEFS.find(cat => cat.id === catId);
  const categoryLabel = category?.title || category?.label || 'items';
  markSaveOnlyDraftChange({
    key: `item-order:${catId}`,
    label: `Reordered ${categoryLabel}`,
    message: `Reordered ${categoryLabel}`,
    sectionId: catId,
    itemId: movedItem?.id || '',
    kind: 'item-order',
  });
  invalidateDiff();
  renderManagerItems(catId);
  markSectionsStale(_activeManagerSection);
  updateDraftIndicator();
  renderManagerOverviewStats();
  showToast('Item order updated.', 'success');
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

async function persistState(options = {}) {
  const { silentFailure = false } = options;
  if (!SUPABASE_URL || !MENU_ID || !currentUser?.accessToken) return;

  const apiSnapshot = {
    ...buildMenuCacheSnapshot(),
    deleted_item_ids: Array.from(_deletedItemIds),
  };
  const apiResult = await saveLiveMenuThroughApi(apiSnapshot);
  if (apiResult.ok) {
    _deletedItemIds.clear();
    finalizePersistStatus(true);
    return true;
  }
  finalizePersistStatus(false);
  if (!silentFailure) showToast(`⚠️ ${apiResult.payload?.error || 'Cloud save failed.'}`, 'error');
  return false;
}

async function saveMenu() {
  await flushFocusedManagerEditor();
  const actionState = getMenuActionState();
  if (!actionState.hasLocalDraft) {
    if (actionState.hasPendingServerQueue) {
      await openPreview();
    }
    return;
  }
  await sendUpdate({ notify: false });
}

async function discardLocalDraft() {
  if (!syncLocalDraftDirtyState()) return;
  if (!confirm('Discard this device-only draft and return to the current live menu?')) return;
  clearDraftSaveOnlyChanges();
  clearCurrentLocalDraft();
  closeModal();
  await loadActiveMenuState({ includePersistedDraft: false, source: 'discard' });
  renderManagerWorkspace({ includeRecentChanges: false });
  updateDraftIndicator();
  showToast(`✅ ${_activeMenuName || 'Menu'} draft discarded.`, 'success');
}

function addItem(catId) {
  const input = document.getElementById('new-input-' + catId);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const nameLower = name.toLowerCase();
  let movedFromUncategorized = false;
  if (!menuState[catId]) menuState[catId] = { items: [], lastSent: [] };
  if (catId === UNCATEGORIZED_ID) {
    const pool = menuState[catId].items;
    if (pool.some(item => item.name.trim().toLowerCase() === nameLower)) {
      showToast('Already in pool.', 'info');
      return;
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
    hideAutocomplete(catId);
    invalidateDiff();
    renderManagerItems(catId);
    markSectionsStale(_activeManagerSection);
    input.focus();
    updateDraftIndicator();
    return;
  }
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
  if (movedFromUncategorized) renderManagerItems(UNCATEGORIZED_ID);
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
  if (catId === UNCATEGORIZED_ID) { hideAutocomplete(catId); return; }
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
  showToast(item.eightySixed ? "🚫 Marked 86'd — use Save & Send to notify channels" : `↩ Marked ${restoreLabel(catId)} — use Save & Send to notify channels`, 'info');
}

function toggleFeaturedSpecialEnabled(catId, itemId, checked) {
  const item = (menuState[catId]?.items || []).find(candidate => candidate.id === itemId);
  if (!item) return;
  const nextValue = checked === true;
  if (item.featuredEnabled === nextValue) return;
  item.featuredEnabled = nextValue;
  invalidateDiff();
  renderManagerItems(catId);
  markSectionsStale(_activeManagerSection);
  updateDraftIndicator();
  renderManagerOverviewStats();
  renderFeaturedPublicSection();
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

// ─── MANAGER MOBILE DRAWER TRIGGER ───────────────────────────────────────────
let _managerMobileDrawerTriggerBound = false;

function syncManagerMobileDrawerTrigger() {
  const body = document.body;
  if (!body) return;
  const trigger = document.getElementById('manager-mobile-drawer-trigger');
  const header = document.querySelector('#app-shell > header.manager-shell-topbar');
  if (!trigger || !header) {
    body.classList.remove('manager-mobile-drawer-trigger-visible');
    return;
  }
  if (window.innerWidth > 920 || body.classList.contains('settings-drawer-open') || trigger.style.display === 'none') {
    body.classList.remove('manager-mobile-drawer-trigger-visible');
    trigger.hidden = true;
    return;
  }
  const rect = typeof header.getBoundingClientRect === 'function'
    ? header.getBoundingClientRect()
    : null;
  const shouldShow = !!rect && rect.bottom <= 10;
  body.classList.toggle('manager-mobile-drawer-trigger-visible', shouldShow);
  trigger.hidden = !shouldShow;
}

function initManagerMobileDrawerTrigger() {
  if (_managerMobileDrawerTriggerBound) return;
  _managerMobileDrawerTriggerBound = true;
  let ticking = false;
  const requestSync = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      syncManagerMobileDrawerTrigger();
    });
  };
  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync);
  requestSync();
}

// ─── DRAWER SWIPE TO CLOSE ───────────────────────────────────────────────────
function initDrawerSwipe() {
  const { drawer: rail } = getSettingsDrawerDom();
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
  const isFood = MENU_TYPE === 'food';
  const descIndicator = document.getElementById('desc-indicator-copy-' + itemId);
  const recipeIndicator = document.getElementById('recipe-indicator-copy-' + itemId);
  const summary = document.querySelector(`#description-editor-${itemId} .desc-row-meta`);
  const hasDesc = !!String(item.desc || '').trim();
  const ingredients = recipeArray(item.recipe);
  const hasRecipe = !isFood && ingredients.length > 0;

  syncDescriptionIndicator(descIndicator, hasDesc, isItemDescriptionPublic(item));
  syncDescriptionIndicator(recipeIndicator, hasRecipe, !isFood && isItemRecipePublic(item));

  if (summary) {
    const summaryParts = [hasDesc ? 'Description added' : 'No description'];
    if (!isFood) {
      summaryParts.push(hasRecipe ? `${ingredients.length} recipe entr${ingredients.length === 1 ? 'y' : 'ies'}` : 'No recipe');
    }
    summary.textContent = summaryParts.join(' · ');
  }
}

// ─── RECIPE ───────────────────────────────────────────────────────────────────
function recipeArray(recipe) {
  if (Array.isArray(recipe)) return recipe.filter(Boolean);
  if (typeof recipe === 'string' && recipe.trim()) return [recipe.trim()];
  return [];
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
  markSaveOnlyDraftChange({
    key: `recipe:${catId}:${itemId}`,
    label: `Updated recipe for ${item.name}`,
    message: `Updated recipe for ${item.name}`,
    sectionId: catId,
    itemId,
    kind: 'recipe',
  });
  invalidateDiff();
  updateDraftIndicator();
}

async function removeIngredient(catId, itemId, idx) {
  const item = findItem(catId, itemId);
  if (!item || !Array.isArray(item.recipe)) return;
  item.recipe.splice(idx, 1);
  renderRecipeIngredients(catId, itemId);
  const btn = document.querySelector('#wrapper-' + itemId + ' .recipe-btn');
  if (btn) btn.classList.toggle('has-recipe', item.recipe.length > 0);
  markSaveOnlyDraftChange({
    key: `recipe:${catId}:${itemId}`,
    label: `Updated recipe for ${item.name}`,
    message: `Updated recipe for ${item.name}`,
    sectionId: catId,
    itemId,
    kind: 'recipe',
  });
  invalidateDiff();
  updateDraftIndicator();
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
    markSaveOnlyDraftChange({
      key: `desc:${catId}:${itemId}`,
      label: `Updated description for ${item.name}`,
      message: `Updated description for ${item.name}`,
      sectionId: catId,
      itemId,
      kind: 'description',
    });
    invalidateDiff();
    updateDraftIndicator();
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
  markSaveOnlyDraftChange({
    key: `visibility:${normalizedField}:${catId}:${itemId}`,
    label: `Updated ${normalizedField === 'showRecipe' ? 'recipe' : 'description'} visibility for ${item.name}`,
    message: `Updated ${normalizedField === 'showRecipe' ? 'recipe' : 'description'} visibility for ${item.name}`,
    sectionId: catId,
    itemId,
    kind: normalizedField,
  });
  invalidateDiff();
  updateDraftIndicator();
  if (sourceEl?.closest) _flashSaved(sourceEl.closest('.desc-visibility-toggle'));
}

async function savePrice(catId, itemId, val) {
  const item = findItem(catId, itemId);
  if (!item) return;
  const price = val.trim();
  if (item.price !== price) {
    item.price = price;
    markSectionsStale(_activeManagerSection);
    markSaveOnlyDraftChange({
      key: `price:${catId}:${itemId}`,
      label: `Updated price for ${item.name}`,
      message: `Updated price for ${item.name}`,
      sectionId: catId,
      itemId,
      kind: 'price',
    });
    updateDraftIndicator();
    _flashSaved(document.querySelector(`#pricing-wrapper-${itemId} .price-input`) || document.querySelector(`#wrapper-${itemId} .price-input`));
  }
}

function removeItem(catId, itemId) {
  const state = menuState[catId];
  const itemIndex = state?.items.findIndex(i => i.id === itemId) ?? -1;
  const item = itemIndex === -1 ? null : state.items[itemIndex];
  if (!item) return false;
  if (catId === UNCATEGORIZED_ID) {
    const [removedItem] = state.items.splice(itemIndex, 1);
    _deletedItemIds.add(removedItem.id);
    invalidateDiff();
    renderManagerItems(catId);
    markSectionsStale(_activeManagerSection);
    updateDraftIndicator();
    const removedName = removedItem.name;
    showToast(`"${removedName}" removed`, 'info', () => {
      state.items.splice(Math.min(itemIndex, state.items.length), 0, removedItem);
      _deletedItemIds.delete(removedItem.id);
      invalidateDiff();
      renderManagerItems(catId);
      markSectionsStale(_activeManagerSection);
      updateDraftIndicator();
      showToast(`"${removedName}" restored`, 'success');
    });
    return true;
  }
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
  btn.textContent = 'Save';
  btn.style.boxShadow = getDraftChangeCount() > 0 ? '0 4px 22px rgba(255,77,0,0.55)' : '';
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
  getCurrentMenuFeaturedItems().forEach(item => {
    if (!item?.id) return;
    currentFeaturedIds.add(item.id);
    featuredByItemId.set(item.id, item);
  });
  const featuredAdded = [];
  const featuredRemoved = [];
  currentFeaturedIds.forEach(id => {
    if (!_lastSentFeaturedIds.has(id)) {
      const item = featuredByItemId.get(id);
      if (item?.name) featuredAdded.push(item.name);
    }
  });
  _lastSentFeaturedIds.forEach(id => {
    if (!currentFeaturedIds.has(id)) {
      const item = featuredByItemId.get(id);
      featuredRemoved.push(item?.name || '(removed item)');
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
    if (cat.id === FEATURED_SPECIALS_CATEGORY_ID || isLegacySpecialCategory(cat.id)) return;
    const diff = computeCategoryDiff(cat);
    if (diff) results.push(diff);
  });
  const featuredDiff = computeFeaturedDiff();
  if (featuredDiff) results.push(featuredDiff);
  return results;
}

function buildPreviewDecisionGroups(preview = {}) {
  const notificationChanges = Array.isArray(preview.notificationChanges) ? preview.notificationChanges : [];
  return {
    selectedSections: groupNotificationChangesBySection(notificationChanges.filter(change => _previewSelectionState[change.id] !== false)),
    clearSections: groupNotificationChangesBySection(notificationChanges.filter(change => _previewSelectionState[change.id] === false)),
    saveOnlyChanges: Array.isArray(preview.saveOnlyChanges) ? preview.saveOnlyChanges : [],
  };
}

function renderPreviewSectionGroup(title, sections, options = {}) {
  if (!Array.isArray(sections) || !sections.length) return '';
  return `<div class="preview-group-title">${escHtml(title)}</div>${sections.map(section => (
    `<div class="preview-block">${buildPreviewBlockHtml(section, options)}</div>`
  )).join('')}`;
}

function renderPreviewModal(preview, options = {}) {
  const content = document.getElementById('preview-content');
  const saveMenuBtn = document.getElementById('save-menu-btn');
  const saveSendBtn = document.getElementById('save-send-btn');
  const subtitle = document.getElementById('modal-subtitle');
  const modal = document.getElementById('modal-bg');
  if (!content || !saveMenuBtn || !saveSendBtn || !modal) return;
  _previewModalState = preview;
  if (!options.preserveSelection) {
    _previewSelectionState = Object.fromEntries((preview.notificationChanges || []).map(change => [change.id, true]));
  }
  content.innerHTML = '';
  const isSendOnly = preview.mode === 'send' || preview.mode === 'update-only';
  const decisionGroups = buildPreviewDecisionGroups(preview);
  if (subtitle) {
    subtitle.textContent = isSendOnly
      ? 'These changes are already live. Checked rows will send now, and unchecked rows will clear without sending.'
      : (preview.hasNotificationChanges
          ? 'Checked rows will send now, unchecked rows will clear without sending, and quiet changes will save live only.'
          : 'These changes will save live without sending notifications.');
  }
  saveMenuBtn.style.display = isSendOnly ? 'none' : '';
  saveMenuBtn.disabled = !preview.hasLocalDraft;
  saveMenuBtn.textContent = preview.hasNotificationChanges ? 'Save Quietly' : 'Save';
  saveSendBtn.style.display = preview.hasNotificationChanges ? '' : 'none';
  saveSendBtn.textContent = isSendOnly ? 'Send' : 'Save & Send';
  saveSendBtn.disabled = !preview.hasNotificationChanges;
  if (!preview.hasChanges) {
    content.innerHTML = `<div class="no-changes">🎉 No changes since the last update.<br><span style="font-size:11px;color:#444;">Add, remove, or 86 items to generate an update.</span></div>`;
    saveMenuBtn.disabled = true;
    saveSendBtn.disabled = true;
  } else {
    content.innerHTML = [
      renderPreviewSectionGroup('Will Send', decisionGroups.selectedSections, { selectable: true }),
      renderPreviewSectionGroup('Will Clear Without Sending', decisionGroups.clearSections, { selectable: true }),
      decisionGroups.saveOnlyChanges.length
        ? `<div class="preview-block">${buildSaveOnlyPreviewBlockHtml(decisionGroups.saveOnlyChanges).replace('Quiet Live Changes', 'Will Save Only')}</div>`
        : '',
    ].filter(Boolean).join('');
  }
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('open');
}

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────
async function openPreview() {
  await flushFocusedManagerEditor();
  const content = document.getElementById('preview-content');
  const saveMenuBtn = document.getElementById('save-menu-btn');
  const saveSendBtn = document.getElementById('save-send-btn');
  const modal = document.getElementById('modal-bg');
  if (!content || !saveMenuBtn || !saveSendBtn || !modal) return;

  const result = await ensureCurrentMenuSession().preparePublish({
    source: isAdminMode ? 'web_admin' : 'web_manager',
    expectedLiveRevision: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
    expectedDraftRevision: menuState._meta?.draftSavedTs ? Number(menuState._meta.draftSavedTs) : null,
    expectedNotificationRevision: buildCurrentLocalDraftEnvelope()?.baseLastSentRevision ?? null,
  });
  if (!result?.ok || !result.preview) {
    showToast(result?.userMessage || 'Preview is unavailable right now.', 'error');
    return;
  }
  const preview = result.preview;
  if (!preview || !Array.isArray(preview.sections) || !Array.isArray(preview.notificationChanges)) {
    showToast('Preview response was invalid. Please try again.', 'error');
    return;
  }
  renderPreviewModal(preview);
}

function closeModal() {
  const modal = document.getElementById('modal-bg');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
}

function setPreviewChangeSelected(changeId, checked) {
  _previewSelectionState[changeId] = !!checked;
  if (_previewModalState) renderPreviewModal(_previewModalState, { preserveSelection: true });
}

function getSelectedPreviewChangeIds() {
  return Object.entries(_previewSelectionState)
    .filter(([, checked]) => checked)
    .map(([changeId]) => changeId);
}

function buildPreviewBlockHtml(section, options = {}) {
  const { selectable = false } = options;
  let html = `<div class="preview-cat">${escHtml(section.icon)} ${escHtml(section.label)}</div>`;
  if (Array.isArray(section.changes)) {
    (section.changes || []).forEach(change => {
      const lineClass = change.kind === 'removed' || change.kind === 'eightySixed' ? 'remove' : 'add';
      if (selectable) {
        html += `<label class="preview-line ${lineClass}"><input type="checkbox" ${_previewSelectionState[change.id] !== false ? 'checked' : ''} onchange="setPreviewChangeSelected('${escHtml(change.id)}',this.checked)"/><span>${change.kind === 'eightySixed' ? '🚫' : change.kind === 'removed' ? '❌' : change.kind === 'restored' ? '↩' : '✅'}</span> ${escHtml(change.text)}</label>`;
      } else {
        html += `<div class="preview-line ${lineClass}"><span>${change.kind === 'eightySixed' ? '🚫' : change.kind === 'removed' ? '❌' : change.kind === 'restored' ? '↩' : '✅'}</span> ${escHtml(change.text)}</div>`;
      }
    });
    return html;
  }
  (section.added || []).forEach(n => { html += `<div class="preview-line add"><span>✅</span> + ${escHtml(n)}</div>`; });
  (section.removed || []).forEach(n => { html += `<div class="preview-line remove"><span>❌</span> − ${escHtml(n)}</div>`; });
  (section.eightySixed || []).forEach(n => { html += `<div class="preview-line remove"><span>🚫</span> 86'd: ${escHtml(n)}</div>`; });
  (section.restored || []).forEach(n => { html += `<div class="preview-line add"><span>↩</span> ${escHtml(restoreLabel(section.id))}: ${escHtml(n)}</div>`; });
  return html;
}

function buildSaveOnlyPreviewBlockHtml(changes = []) {
  if (!changes.length) return '';
  return `<div class="preview-cat">Quiet Live Changes</div>${changes.map(change => (
    `<div class="preview-line"><span>•</span> ${escHtml(change.message || change.label || 'Saved change')}</div>`
  )).join('')}`;
}
function snapshotLastSentState() {
  const lastSentState = {};
  CATEGORY_DEFS.forEach(cat => { lastSentState[cat.id] = menuState[cat.id]?.lastSent || []; });
  return lastSentState;
}

function getCurrentFeaturedIds() {
  return getCurrentMenuFeaturedItems()
    .map(item => item?.id)
    .filter(Boolean);
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

function setPreviewModalActionState(mode = '') {
  const cancelBtn = document.getElementById('cancel-preview-btn');
  const saveMenuBtn = document.getElementById('save-menu-btn');
  const saveSendBtn = document.getElementById('save-send-btn');
  const isBusy = !!mode;
  if (cancelBtn) cancelBtn.disabled = isBusy;
  if (saveMenuBtn) {
    saveMenuBtn.disabled = isBusy;
    saveMenuBtn.textContent = mode === 'save-menu'
      ? 'Saving…'
      : ((_previewModalState?.hasNotificationChanges ? 'Save Quietly' : 'Save'));
  }
  if (saveSendBtn) {
    saveSendBtn.disabled = isBusy;
    saveSendBtn.textContent = mode === 'send-update'
      ? 'Sending…'
      : (mode === 'save-send'
          ? 'Saving & Sending…'
          : (((_previewModalState?.mode === 'send') || (_previewModalState?.mode === 'update-only')) ? 'Send' : 'Save & Send'));
  }
}

async function flushFocusedManagerEditor() {
  const activeEl = document.activeElement;
  if (!activeEl || activeEl === document.body || typeof activeEl.blur !== 'function') return false;
  const tagName = String(activeEl.tagName || '').toUpperCase();
  const isEditableField = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || !!activeEl.isContentEditable;
  if (!isEditableField) return false;
  activeEl.blur();
  await Promise.resolve();
  return true;
}

async function sendUpdate(options = {}) {
  await flushFocusedManagerEditor();
  let preview = options.preview?.sections ? options.preview : _previewModalState;
  if (!preview) {
    const prepared = await ensureCurrentMenuSession().preparePublish({
      source: isAdminMode ? 'web_admin' : 'web_manager',
      expectedLiveRevision: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
      expectedDraftRevision: menuState._meta?.draftSavedTs ? Number(menuState._meta.draftSavedTs) : null,
      expectedNotificationRevision: buildCurrentLocalDraftEnvelope()?.baseLastSentRevision ?? null,
    });
    if (!prepared?.ok || !prepared.preview) {
      showToast(prepared?.userMessage || 'Preview is unavailable right now.', 'error');
      return;
    }
    preview = prepared.preview;
    if (!preview || !Array.isArray(preview.notificationChanges)) {
      showToast('Preview response was invalid. Please try again.', 'error');
      return;
    }
    _previewModalState = preview;
    _previewSelectionState = Object.fromEntries((preview.notificationChanges || []).map(change => [change.id, true]));
  }
  if (!preview.hasChanges) { closeModal(); return; }

  if (preview.truncated) {
    showToast('Update is long and will be truncated.', 'info');
  }

  const selectedChangeIds = getSelectedPreviewChangeIds();
  const intent = options.notify === false
    ? 'save'
    : ((preview.mode === 'send' || preview.mode === 'update-only') ? 'send' : 'save-and-send');
  setPreviewModalActionState(intent === 'save' ? 'save-menu' : (intent === 'send' ? 'send-update' : 'save-send'));

  try {
    const result = await ensureCurrentMenuSession().commitPublish({
      source: isAdminMode ? 'web_admin' : 'web_manager',
      intent,
      preview,
      selectedChangeIds,
      expectedLiveRevision: menuState._meta?.lastUpdatedTs ? Number(menuState._meta.lastUpdatedTs) : null,
      expectedDraftRevision: menuState._meta?.draftSavedTs ? Number(menuState._meta.draftSavedTs) : null,
      expectedNotificationRevision: buildCurrentLocalDraftEnvelope()?.baseLastSentRevision ?? null,
    });
    if (result?.noop) {
      closeModal();
      return;
    }
    if (result?.ok) {
      closeModal();
      const successMessage = result.userOutcome?.successMessage || result.successMessage || `✅ ${_activeMenuName || 'Menu'} updated.`;
      showToast(successMessage, 'success');
      renderManagerWorkspace({ includeRecentChanges: false });
      updateDraftIndicator();
      renderRecentChanges();
      const warnings = Array.isArray(result.userOutcome?.warnings)
        ? result.userOutcome.warnings
        : (Array.isArray(result.warnings) ? result.warnings : (result.warningMessage ? [result.warningMessage] : []));
      warnings.forEach(message => showToast(`⚠️ ${message}`, 'warning'));
      return;
    }
    if (result?.userOutcome?.warningMessage || result?.userMessage) {
      showToast(result.userOutcome?.warningMessage || result.userMessage, 'error');
    }
  } finally {
    setPreviewModalActionState();
  }
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let _toastUndoTimer = null;
let _toastResetTimer = null;
function _flashSaved(el) {
  if (!el) return;
  el.classList.add('field-saved');
  setTimeout(() => el.classList.remove('field-saved'), 1200);
}

function hideToast() {
  const t = document.getElementById('toast');
  if (!t) return;
  t.classList.remove('show');
  if (_toastResetTimer) clearTimeout(_toastResetTimer);
  _toastResetTimer = setTimeout(() => {
    if (t.classList.contains('show')) return;
    t.className = 'toast';
    t.textContent = '';
  }, 280);
}

function showToast(msg, type='info', undoCallback=null) {
  if (_toastUndoTimer) { clearTimeout(_toastUndoTimer); _toastUndoTimer = null; }
  if (_toastResetTimer) { clearTimeout(_toastResetTimer); _toastResetTimer = null; }
  const t = document.getElementById('toast');
  if (!t) return;
  const message = String(msg ?? '').trim();
  if (!message) {
    window._toastUndoCallback = null;
    hideToast();
    return;
  }
  t.className = `toast ${type} show`;
  if (undoCallback) {
    t.innerHTML = `<span>${escHtml(message)}</span><button class="toast-undo-btn" onclick="_toastUndo()">Undo</button>`;
    window._toastUndoCallback = undoCallback;
    _toastUndoTimer = setTimeout(() => {
      window._toastUndoCallback = null;
      hideToast();
    }, 5000);
  } else {
    t.textContent = message;
    window._toastUndoCallback = null;
    _toastUndoTimer = setTimeout(() => hideToast(), 3200);
  }
}
function _toastUndo() {
  if (typeof window._toastUndoCallback === 'function') {
    window._toastUndoCallback();
    window._toastUndoCallback = null;
  }
  if (_toastUndoTimer) { clearTimeout(_toastUndoTimer); _toastUndoTimer = null; }
  hideToast();
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
    const catalog = await readAdminCatalogThroughApi();
    window._adminMenuList = (catalog?.allMenus || []).filter(menu => !menu.archived);
    const r = await fetch('/api/admin?action=users', {
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

function buildHistoryMessageHtml(message = '') {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) return '';
  return `<div class="history-message"><strong>Sent message:</strong> ${escHtml(normalizedMessage)}</div>`;
}

function formatHistorySourceLabel(source = '') {
  const normalized = String(source || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'web_admin') return 'Web Admin';
  if (normalized === 'web_manager') return 'Web Manager';
  if (normalized === 'ios' || normalized === 'ios_app') return 'iOS App';
  if (normalized === 'server') return 'Server';
  if (normalized === 'web') return 'Web';
  return normalized.replace(/_/g, ' ');
}

function buildHistoryContextSummary(log = {}) {
  const parts = [];
  const menuName = log?.menu?.id
    ? formatMenuDisplayName(log.menu.name, log.menu.type, log.menu.restaurantId)
    : String(log?.menu?.name || '').trim();
  const sourceLabel = formatHistorySourceLabel(log?.source || '');
  if (menuName) parts.push(menuName);
  if (sourceLabel) parts.push(sourceLabel);
  return parts.join(' | ');
}

function buildChangeFeedHtml(logs) {
  const locale = navigator.languages?.[0] || navigator.language || undefined;
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const buildEntryHtml = log => {
    const d = new Date(log.created_at);
    const dateStr = dateFormatter.format(d);
    const timeStr = timeFormatter.format(d);
    const diff = Array.isArray(log.diff) ? log.diff : [];
    const summary = summarizeHistoryDiff(diff);
    const contextSummary = buildHistoryContextSummary(log);
    const summaryText = contextSummary ? `${summary} | ${contextSummary}` : summary;
    const detailHtml = `${buildHistoryMessageHtml(log.message)}${buildHistoryDetailHtml(diff)}`;

    return `<div class="history-entry">
      <button class="history-header" type="button" aria-expanded="false" onclick="this.parentElement.classList.toggle('expanded'); this.setAttribute('aria-expanded', this.parentElement.classList.contains('expanded') ? 'true' : 'false');">
        <span class="history-date">${escHtml(dateStr)} ${escHtml(timeStr)}</span>
        <span class="history-user">${escHtml(log.user_name || 'Unknown')}</span>
        <span class="history-summary">${escHtml(summaryText)}</span>
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
  if (!currentUser?.accessToken) {
    wrap.innerHTML = '<p class="db-empty">Recent changes are unavailable until you are signed in.</p>';
    return;
  }
  if (!MENU_ID) {
    wrap.innerHTML = '<p class="db-empty">Select a menu to view recent changes.</p>';
    return;
  }

  wrap.innerHTML = '<p class="db-empty">Loading\u2026</p>';
  try {
    const history = await readMenuHistoryThroughApi({ menuId: MENU_ID, days: 7, limit: 25 });
    if (!history) throw new Error('fetch failed');
    const scope = String(history?.history?.scope || 'menu');
    const logs = Array.isArray(history?.logs) ? history.logs : [];
    if (!logs.length) {
      wrap.innerHTML = scope === 'restaurant'
        ? '<p class="db-empty">No sent updates for this restaurant in the last 7 days.</p>'
        : '<p class="db-empty">No sent updates for this menu in the last 7 days.</p>';
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
  const result = await postApiJson('/api/admin', {
    action: 'update_user',
    ...payload,
  }, {
    headers: { 'Authorization': `Bearer ${currentUser?.accessToken}` },
  });
  if (!result.ok) throw new Error(result.payload?.error || 'Request failed.');
  return result;
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
  const url = getNotificationMenuLink() || window.location.origin;
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
  return getRestaurantSpecialsService().getActiveGroup();
}

function renderFeaturedTab() {
  const wrap = document.getElementById('featured-mgr-wrap');
  const action = document.getElementById('manager-featured-action');
  if (!wrap) return;
  const featuredItems = getCurrentMenuFeaturedItems();
  const previewItems = featuredItems.slice(0, 5);
  const totalCount = featuredItems.length;
  const currentMenu = getMenuById(MENU_ID);
  const menuLabel = formatMenuDisplayName(
    _activeMenuName || currentMenu?.name || 'Current Menu',
    MENU_TYPE,
    RESTAURANT_ID
  );
  if (action) {
    action.textContent = 'Open Category';
    action.disabled = !currentUserCanManageMenu();
    action.setAttribute('aria-disabled', action.disabled ? 'true' : 'false');
    action.title = currentUserCanManageMenu()
      ? 'Jump to the Featured Specials category in Edit Menu.'
      : 'Open the current menu to manage Featured Specials.';
    if (!action.disabled) action.removeAttribute('aria-disabled');
  }
  const itemsHtml = previewItems.length
    ? previewItems.map((item, idx) => {
        const description = isItemDescriptionPublic(item) ? String(item?.desc || '').trim() : '';
        const recipeText = isItemRecipePublic(item) ? recipeArray(item?.recipe).join(', ') : '';
        const upcharges = itemUpchargeArray(item?.upcharges);
        const badges = [
          item?.visibility === 'off_menu' ? '<span class="featured-special-tag">Off Menu</span>' : '',
          item?.eightySixed ? '<span class="featured-special-tag featured-special-tag--danger">86\'D</span>' : '',
        ].filter(Boolean).join('');
        const priceHtml = item?.price ? `<span class="featured-special-price">${escHtml(item.price)}</span>` : '';
        const copyHtml = [
          description ? `<p class="featured-special-copy">${escHtml(description)}</p>` : '',
          recipeText ? `<p class="featured-special-copy featured-special-copy--muted">Recipe: ${escHtml(recipeText)}</p>` : '',
        ].join('');
        const upchargesHtml = upcharges.length
          ? `<div class="featured-special-upcharges">${upcharges.map(upcharge => `<span class="featured-special-upcharge">${escHtml(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${escHtml(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
          : '';
        return `<article class="featured-special-row">
          <div class="featured-special-row-head">
            <div class="featured-special-order">Preview ${idx + 1}</div>
          </div>
          <div class="featured-special-name">
            <span class="item-name-static">${escHtml(item?.name || '(untitled item)')}</span>
            ${priceHtml}
            ${badges}
          </div>
          ${copyHtml}
          ${upchargesHtml}
        </article>`;
      }).join('')
    : `<div class="empty-state"><span class="empty-state-icon">⭐</span><span>No items are currently set to show in the featured strip for ${escHtml(menuLabel || 'this menu')}.</span></div>`;
  const capNote = totalCount > previewItems.length
    ? `<p class="featured-specials-access-detail">The public featured strip shows the first five featured items. ${escHtml(String(totalCount - previewItems.length))} more item${totalCount - previewItems.length === 1 ? '' : 's'} stay in the category.</p>`
    : '';
  wrap.innerHTML = `<div class="featured-specials-editor featured-specials-editor--readonly">
    <div class="featured-specials-access-note" role="note" aria-live="polite">
      <p class="featured-specials-access-kicker">Category-owned flow</p>
      <h4>Manage featured items from Edit Menu</h4>
      <p class="featured-specials-access-copy">Use the <strong>Featured Specials</strong> category and its <strong>Show in featured strip</strong> toggles to control this menu’s featured items.</p>
      <p class="featured-specials-access-detail">This overview is read-only now that featured specials are owned by the menu itself instead of a separate restaurant-wide transport.</p>
      ${capNote}
    </div>
    <div class="featured-specials-head">
      <div>
        <h4>Featured Strip Preview</h4>
        <p class="featured-specials-access-detail">${escHtml(menuLabel || 'Current Menu')}</p>
      </div>
      <span class="featured-count">${previewItems.length} / 5 previewed</span>
    </div>
    <div class="featured-specials-list">${itemsHtml}</div>
  </div>`;
}

function focusFeaturedCategoryCard() {
  const featuredCard = document.getElementById('mgr-card-' + FEATURED_SPECIALS_CATEGORY_ID);
  if (!featuredCard) return false;
  if (featuredCard.classList.contains('collapsed')) toggleManagerCategory(FEATURED_SPECIALS_CATEGORY_ID);
  featuredCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusTarget = featuredCard.querySelector('.collapsible-header') || featuredCard;
  if (typeof focusTarget?.focus === 'function') focusTarget.focus();
  return true;
}

function focusFeaturedManagerCard() {
  if (!currentUserCanManageMenu()) return;
  const overviewTrigger = document.querySelector('.settings-rail-btn[data-target="manager-items-section"]');
  renderManagerCategories();
  _activeManagerSection = 'manager-items-section';
  focusSettingsSection('manager-items-section', overviewTrigger || null);
  requestAnimationFrame(() => {
    if (focusFeaturedCategoryCard()) return;
    const itemsSection = document.getElementById('manager-items-section');
    if (itemsSection) itemsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (name === 'admin-landing') {
    renderLandingAdminWorkspace();
    focusSettingsSection('admin-landing-page-section');
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
      eightySixed: !!item.eightySixed,
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
function initAuthOverlayKeyboardSupport() {
  const controller = getAuthOverlayController();
  if (controller?.initKeyboardSupport && !_authModuleDelegationStack.has('initAuthOverlayKeyboardSupport')) {
    _authModuleDelegationStack.add('initAuthOverlayKeyboardSupport');
    try {
      controller.initKeyboardSupport();
      return;
    } finally {
      _authModuleDelegationStack.delete('initAuthOverlayKeyboardSupport');
    }
  }

  initAuthForms();
  ['signin-email', 'signup-email', 'forgot-email'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.addEventListener('input', syncAuthUsernameAssistFields);
  });
  // Sign In: email Enter → focus password; password Enter → submit
  const signinEmail = document.getElementById('signin-email');
  const signinPassword = document.getElementById('signin-password');
  const signupPassword = document.getElementById('signup-password');
  const forgotEmail = document.getElementById('forgot-email');
  const resetConfirm = document.getElementById('reset-confirm');
  if (signinEmail) {
    signinEmail.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') signinPassword?.focus();
    });
  }
  if (signinPassword) {
    signinPassword.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleSignIn();
    });
  }
  // Sign Up: password Enter → submit
  if (signupPassword) {
    signupPassword.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleSignUp();
    });
  }
  // Forgot: email Enter → submit
  if (forgotEmail) {
    forgotEmail.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleForgotPassword();
    });
  }
  // Reset: confirm Enter → submit
  if (resetConfirm) {
    resetConfirm.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleResetPassword();
    });
  }
}

initAuthTriggerDelegation();
initAuthOverlayKeyboardSupport();

// ─── RESTAURANT & MENU MANAGEMENT ─────────────────────────────────────────────

async function fetchRestaurantMenuIndex() {
  const payload = await readAdminCatalogThroughApi();
  if (!payload) throw new Error('fetch failed');
  const restaurants = sortKnownRestaurants(payload.restaurants || []);
  const allMenus = sortKnownMenus(payload.allMenus || []);
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

function installDeepUiDelegationShims() {
  _managerEditorsBase = {
    renderManagerCategories,
    renderManagerItems,
    renderPricingSection,
    renderDescriptionSection,
  };
  _adminSwitcherBase = {
    loadAdminSwitcherData,
    initAdminSwitcherTab,
    onAdminSwitcherRestaurantChange,
    onAdminSwitcherMenuChange,
  };
  _publicRendererBase = {
    renderPublicView,
    renderPublicViews,
  };

  renderManagerCategories = function delegatedRenderManagerCategories(...args) {
    if (!_uiModuleDelegationStack.has('renderManagerCategories')) {
      const service = getManagerEditorsService();
      if (typeof service?.renderManagerCategories === 'function') {
        _uiModuleDelegationStack.add('renderManagerCategories');
        try {
          return service.renderManagerCategories(...args);
        } finally {
          _uiModuleDelegationStack.delete('renderManagerCategories');
        }
      }
    }
    return _managerEditorsBase.renderManagerCategories(...args);
  };

  renderManagerItems = function delegatedRenderManagerItems(...args) {
    if (!_uiModuleDelegationStack.has('renderManagerItems')) {
      const service = getManagerEditorsService();
      if (typeof service?.renderManagerItems === 'function') {
        _uiModuleDelegationStack.add('renderManagerItems');
        try {
          return service.renderManagerItems(...args);
        } finally {
          _uiModuleDelegationStack.delete('renderManagerItems');
        }
      }
    }
    return _managerEditorsBase.renderManagerItems(...args);
  };

  renderPricingSection = function delegatedRenderPricingSection(...args) {
    if (!_uiModuleDelegationStack.has('renderPricingSection')) {
      const service = getManagerEditorsService();
      if (typeof service?.renderPricingSection === 'function') {
        _uiModuleDelegationStack.add('renderPricingSection');
        try {
          return service.renderPricingSection(...args);
        } finally {
          _uiModuleDelegationStack.delete('renderPricingSection');
        }
      }
    }
    return _managerEditorsBase.renderPricingSection(...args);
  };

  renderDescriptionSection = function delegatedRenderDescriptionSection(...args) {
    if (!_uiModuleDelegationStack.has('renderDescriptionSection')) {
      const service = getManagerEditorsService();
      if (typeof service?.renderDescriptionSection === 'function') {
        _uiModuleDelegationStack.add('renderDescriptionSection');
        try {
          return service.renderDescriptionSection(...args);
        } finally {
          _uiModuleDelegationStack.delete('renderDescriptionSection');
        }
      }
    }
    return _managerEditorsBase.renderDescriptionSection(...args);
  };

  loadAdminSwitcherData = async function delegatedLoadAdminSwitcherData(...args) {
    if (!_uiModuleDelegationStack.has('loadAdminSwitcherData')) {
      const service = getAdminSwitcherService();
      if (typeof service?.loadAdminSwitcherData === 'function') {
        _uiModuleDelegationStack.add('loadAdminSwitcherData');
        try {
          return await service.loadAdminSwitcherData(...args);
        } finally {
          _uiModuleDelegationStack.delete('loadAdminSwitcherData');
        }
      }
    }
    return await _adminSwitcherBase.loadAdminSwitcherData(...args);
  };

  initAdminSwitcherTab = async function delegatedInitAdminSwitcherTab(...args) {
    if (!_uiModuleDelegationStack.has('initAdminSwitcherTab')) {
      const service = getAdminSwitcherService();
      if (typeof service?.initAdminSwitcherTab === 'function') {
        _uiModuleDelegationStack.add('initAdminSwitcherTab');
        try {
          return await service.initAdminSwitcherTab(...args);
        } finally {
          _uiModuleDelegationStack.delete('initAdminSwitcherTab');
        }
      }
    }
    return await _adminSwitcherBase.initAdminSwitcherTab(...args);
  };

  onAdminSwitcherRestaurantChange = async function delegatedOnAdminSwitcherRestaurantChange(...args) {
    if (!_uiModuleDelegationStack.has('onAdminSwitcherRestaurantChange')) {
      const service = getAdminSwitcherService();
      if (typeof service?.onAdminSwitcherRestaurantChange === 'function') {
        _uiModuleDelegationStack.add('onAdminSwitcherRestaurantChange');
        try {
          return await service.onAdminSwitcherRestaurantChange(...args);
        } finally {
          _uiModuleDelegationStack.delete('onAdminSwitcherRestaurantChange');
        }
      }
    }
    return await _adminSwitcherBase.onAdminSwitcherRestaurantChange(...args);
  };

  onAdminSwitcherMenuChange = async function delegatedOnAdminSwitcherMenuChange(...args) {
    if (!_uiModuleDelegationStack.has('onAdminSwitcherMenuChange')) {
      const service = getAdminSwitcherService();
      if (typeof service?.onAdminSwitcherMenuChange === 'function') {
        _uiModuleDelegationStack.add('onAdminSwitcherMenuChange');
        try {
          return await service.onAdminSwitcherMenuChange(...args);
        } finally {
          _uiModuleDelegationStack.delete('onAdminSwitcherMenuChange');
        }
      }
    }
    return await _adminSwitcherBase.onAdminSwitcherMenuChange(...args);
  };

  renderPublicView = async function delegatedRenderPublicView(...args) {
    if (!_uiModuleDelegationStack.has('renderPublicView')) {
      const service = getPublicRendererService();
      if (typeof service?.renderPublicView === 'function') {
        _uiModuleDelegationStack.add('renderPublicView');
        try {
          return await service.renderPublicView(...args);
        } finally {
          _uiModuleDelegationStack.delete('renderPublicView');
        }
      }
    }
    return await _publicRendererBase.renderPublicView(...args);
  };

  renderPublicViews = async function delegatedRenderPublicViews(...args) {
    if (!_uiModuleDelegationStack.has('renderPublicViews')) {
      const service = getPublicRendererService();
      if (typeof service?.renderPublicViews === 'function') {
        _uiModuleDelegationStack.add('renderPublicViews');
        try {
          return await service.renderPublicViews(...args);
        } finally {
          _uiModuleDelegationStack.delete('renderPublicViews');
        }
      }
    }
    return await _publicRendererBase.renderPublicViews(...args);
  };
}

installDeepUiDelegationShims();

init();
