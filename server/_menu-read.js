import '../core/domain/constants.js';
import '../core/domain/featured-specials.js';

import {
  getRestaurantSpecialConfig,
  readProfile,
} from './_auth.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';
import { buildCategoryQueueState } from './_menu-queue.js';
import { normalizeLegacyFeaturedBaseline } from './_menu-queue.js';

const domainConstants = (globalThis.__HF_DOMAIN_CONSTANTS__ && typeof globalThis.__HF_DOMAIN_CONSTANTS__ === 'object')
  ? globalThis.__HF_DOMAIN_CONSTANTS__
  : {};
const RESTAURANTS = domainConstants.RESTAURANTS || {};
const MENUS = domainConstants.MENUS || {};
const KNOWN_MENU_ORDER = Array.isArray(domainConstants.KNOWN_MENU_ORDER) ? domainConstants.KNOWN_MENU_ORDER.slice() : [];
const KNOWN_RESTAURANT_ORDER = Array.isArray(domainConstants.KNOWN_RESTAURANT_ORDER) ? domainConstants.KNOWN_RESTAURANT_ORDER.slice() : [];
const APP_VERSION = domainConstants.APP_VERSION || 'unknown';
const featuredSpecials = (globalThis.__HF_FEATURED_SPECIALS__ && typeof globalThis.__HF_FEATURED_SPECIALS__ === 'object')
  ? globalThis.__HF_FEATURED_SPECIALS__
  : {};
const ensureFeaturedSpecialsCategory = typeof featuredSpecials.ensureFeaturedSpecialsCategory === 'function'
  ? featuredSpecials.ensureFeaturedSpecialsCategory
  : (cats => cats);
const deriveFeaturedItems = typeof featuredSpecials.deriveFeaturedItems === 'function'
  ? featuredSpecials.deriveFeaturedItems
  : (() => []);

function sortByKnownOrder(values = [], knownOrder = [], key = 'id') {
  return values.slice().sort((a, b) => knownOrder.indexOf(a[key]) - knownOrder.indexOf(b[key]));
}

function numericDisplayOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function compareText(left = '', right = '') {
  return String(left || '').localeCompare(String(right || ''));
}

function compareCategoryOrder(left = {}, right = {}) {
  const leftIsUncategorized = left?.key === '__uncategorized__';
  const rightIsUncategorized = right?.key === '__uncategorized__';
  if (leftIsUncategorized !== rightIsUncategorized) {
    return leftIsUncategorized ? 1 : -1;
  }

  const displayDelta = numericDisplayOrder(left?.display_order) - numericDisplayOrder(right?.display_order);
  if (displayDelta !== 0) return displayDelta;

  const keyDelta = compareText(left?.key, right?.key);
  if (keyDelta !== 0) return keyDelta;

  return compareText(left?.id, right?.id);
}

function compareItemOrder(left = {}, right = {}) {
  const displayDelta = numericDisplayOrder(left?.display_order) - numericDisplayOrder(right?.display_order);
  if (displayDelta !== 0) return displayDelta;

  const idDelta = compareText(left?.id, right?.id);
  if (idDelta !== 0) return idDelta;

  return compareText(left?.name, right?.name);
}

function sortCategories(categories = []) {
  return (Array.isArray(categories) ? categories : []).slice().sort(compareCategoryOrder);
}

function sortCategoryItems(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort(compareItemOrder);
}

export function getKnownMenus() {
  return sortByKnownOrder(Object.values(MENUS)
    .filter(menu => menu?.id)
    .map(menu => ({
      id: menu.id,
      slug: menu.slug || '',
      name: menu.name || '',
      type: menu.type || 'drinks',
      restaurantId: menu.restaurantId || '',
    })), KNOWN_MENU_ORDER);
}

export function getKnownRestaurants() {
  return sortByKnownOrder(Object.values(RESTAURANTS)
    .filter(restaurant => restaurant?.id)
    .map(restaurant => ({
      id: restaurant.id,
      slug: restaurant.slug || '',
      name: restaurant.name || '',
    })), KNOWN_RESTAURANT_ORDER);
}

export function getKnownMenuById(menuId = '') {
  return getKnownMenus().find(menu => menu.id === menuId) || null;
}

export function getDefaultMenuId(accessibleMenuIds = []) {
  const preferredMenuId = Array.isArray(accessibleMenuIds) ? accessibleMenuIds.find(Boolean) : '';
  return preferredMenuId || KNOWN_MENU_ORDER[0] || getKnownMenus()[0]?.id || '';
}

export function isSupportedMenuId(menuId = '') {
  return !!menuId && KNOWN_MENU_ORDER.includes(menuId);
}

export function parseMenuId(req) {
  if (req?.query?.menu_id) return String(req.query.menu_id);
  const requestUrl = req?.url || '';
  try {
    const url = new URL(requestUrl, 'http://localhost');
    return url.searchParams.get('menu_id') || '';
  } catch (_) {
    return '';
  }
}

async function fetchJsonOrThrow(url, fallbackMessage) {
  const response = await fetch(url, { headers: serviceHeaders() });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

export async function readCurrentFeaturedIdsForRestaurant(restaurantId = '') {
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!config?.canonicalId) return [];

  const { sbUrl } = getSupabaseServerConfig();
  const groupResponse = await fetch(
    `${sbUrl}/rest/v1/featured_groups?canonical_id=eq.${encodeURIComponent(config.canonicalId)}&select=id&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!groupResponse.ok) return [];
  const groups = await groupResponse.json();
  const groupId = groups?.[0]?.id;
  if (!groupId) return [];

  const slotsResponse = await fetch(
    `${sbUrl}/rest/v1/featured_slots?featured_group_id=eq.${groupId}&select=item_id`,
    { headers: serviceHeaders() }
  );
  if (!slotsResponse.ok) return [];
  const slots = await slotsResponse.json();
  return Array.from(new Set((Array.isArray(slots) ? slots : []).map(slot => slot?.item_id).filter(Boolean)));
}

export async function readMenuStateBundle(menuId) {
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const { sbUrl } = getSupabaseServerConfig();
  const [menuRows, cats, metaRows] = await Promise.all([
    fetchJsonOrThrow(
      `${sbUrl}/rest/v1/menus?id=eq.${menuId}&select=id,name,slug,type,restaurant_id,archived&limit=1`,
      'Failed to load menu'
    ),
    fetchJsonOrThrow(
      `${sbUrl}/rest/v1/categories?menu_id=eq.${menuId}&select=*,items(*)&order=display_order.asc`,
      'Failed to load categories'
    ),
    fetchJsonOrThrow(
      `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}&select=*&limit=1`,
      'Failed to load menu metadata'
    ),
  ]);

  const menuRow = menuRows?.[0] || null;
  if (!menuRow || menuRow.archived) {
    throw { status: 404, message: 'Menu not found' };
  }

  const restaurantRows = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/restaurants?id=eq.${menuRow.restaurant_id}&select=id,name,slug,design,use_custom_design&limit=1`,
    'Failed to load restaurant'
  );
  return {
    menu: {
      id: menuRow.id,
      slug: menuRow.slug || '',
      name: menuRow.name || '',
      type: menuRow.type || 'drinks',
      restaurantId: menuRow.restaurant_id || '',
    },
    cats: sortCategories(cats).map(category => ({
      ...category,
      items: sortCategoryItems(category?.items),
    })),
    meta: metaRows?.[0] || {},
    restaurant: restaurantRows?.[0] || null,
  };
}

function buildRestaurantIdsFromMenuIds(menuIds = []) {
  const restaurantIds = new Set();
  menuIds.forEach(menuId => {
    const menu = getKnownMenuById(menuId);
    if (menu?.restaurantId) restaurantIds.add(menu.restaurantId);
  });
  return Array.from(restaurantIds);
}

function getActorAccessibleMenuIds(actor = {}) {
  if (actor?.role === 'admin') return KNOWN_MENU_ORDER.slice();
  return Array.isArray(actor?.accessibleMenuIds) ? actor.accessibleMenuIds.filter(Boolean) : [];
}

function normalizeActor(actor = null) {
  if (!actor) return null;
  return {
    id: actor.id || '',
    name: actor.name || '',
    role: actor.role || 'none',
  };
}

function isGuestVisibleItem(item = {}) {
  return item.on_menu !== false && item.visibility !== 'off_menu';
}

function normalizePublicRecipe(recipe) {
  if (!Array.isArray(recipe)) return [];
  return recipe
    .map(entry => String(entry || '').trim())
    .filter(Boolean);
}

function normalizePublicUpcharges(upcharges) {
  if (!Array.isArray(upcharges)) return [];
  return upcharges
    .map(entry => ({
      label: String(entry?.label || '').trim(),
      price: String(entry?.price || '').trim(),
    }))
    .filter(entry => entry.label || entry.price);
}

function sanitizePublicItem(item = {}) {
  return {
    id: item.id || '',
    name: item.name || '',
    desc: item.desc || '',
    recipe: normalizePublicRecipe(item.recipe),
    price: item.price || '',
    is_eighty_sixed: !!item.is_eighty_sixed,
    display_order: Number.isFinite(Number(item.display_order)) ? Number(item.display_order) : 0,
    on_menu: item.on_menu !== false,
    visibility: item.visibility || 'public',
    upcharges: normalizePublicUpcharges(item.upcharges),
    show_description: item.show_description !== false,
    show_recipe: !!item.show_recipe,
  };
}

function sanitizePublicCategory(category = {}) {
  return {
    id: category.id || '',
    menu_id: category.menu_id || '',
    key: category.key || '',
    label: category.label || '',
    icon: category.icon || '',
    color: category.color || '',
    sub: category.sub || '',
    placeholder: category.placeholder || '',
    display_order: Number.isFinite(Number(category.display_order)) ? Number(category.display_order) : 0,
    items: sortCategoryItems(category.items)
      .filter(isGuestVisibleItem)
      .map(sanitizePublicItem),
  };
}

function normalizeWorkspaceCategory(category = {}) {
  return {
    ...category,
    untappd_enabled: category?.untappd_enabled === true || category?.untappdEnabled === true,
  };
}

function sanitizePublicRestaurant(restaurant = null) {
  if (!restaurant || typeof restaurant !== 'object') return null;
  const design = restaurant.design && typeof restaurant.design === 'object' ? restaurant.design : {};
  return {
    id: restaurant.id || '',
    name: restaurant.name || '',
    slug: restaurant.slug || '',
    design,
    use_custom_design: !!restaurant.use_custom_design,
  };
}

function sanitizePublicMeta(meta = {}) {
  const lastSentState = meta?.last_sent_state && typeof meta.last_sent_state === 'object'
    ? meta.last_sent_state
    : {};
  return {
    last_updated_ts: meta?.last_updated_ts || null,
    last_sent_ts: meta?.last_sent_ts || null,
    last_sent_categories: Array.isArray(meta?.last_sent_categories) ? meta.last_sent_categories : [],
    last_sent_state: lastSentState,
  };
}

export function createMenuWorkspacePayload(bundle, { actor = null, restaurantTools = null } = {}) {
  const normalizedCats = Array.isArray(bundle?.cats)
    ? bundle.cats.map(normalizeWorkspaceCategory)
    : [];
  const accessibleMenuIds = getActorAccessibleMenuIds(actor);
  const menuId = bundle?.menu?.id || '';
  const restaurantId = bundle?.menu?.restaurantId || '';
  const restaurantSpecials = getRestaurantSpecialConfig(restaurantId);
  const canManage = actor?.role === 'admin' || accessibleMenuIds.includes(menuId);
  const canEditRestaurantSpecials = actor?.role === 'admin'
    ? true
    : !!restaurantSpecials?.menuIds?.every(candidateId => accessibleMenuIds.includes(candidateId));
  const normalizedActor = normalizeActor(actor);
  const draftMeta = bundle?.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
  const hasSharedDraft = Object.keys(draftMeta?.draft_state || {}).length > 0;
  const includesDraftAuthorship = [
    'draft_saved_by_user_id',
    'draft_saved_by_name',
    'draft_saved_source',
  ].some(field => Object.prototype.hasOwnProperty.call(draftMeta, field));
  const sharedDraft = {
    exists: hasSharedDraft,
    savedAt: draftMeta?.draft_saved_ts || null,
    savedBy: (draftMeta?.draft_saved_by_user_id || draftMeta?.draft_saved_by_name)
      ? {
          id: String(draftMeta?.draft_saved_by_user_id || ''),
          name: String(draftMeta?.draft_saved_by_name || '').trim(),
        }
      : null,
    source: String(draftMeta?.draft_saved_source || '').trim(),
  };
  const lastSentState = normalizeLegacyFeaturedBaseline({
    snapshot: { cats: normalizedCats },
    lastSentState: draftMeta?.last_sent_state && typeof draftMeta.last_sent_state === 'object'
      ? draftMeta.last_sent_state
      : {},
    lastSentFeatured: Array.isArray(draftMeta?.last_sent_featured) ? draftMeta.last_sent_featured : [],
  });
  const queueState = buildCategoryQueueState({
    snapshot: { cats: normalizedCats },
    lastSentState,
  });
  const unsentItemIds = Array.from(new Set(queueState.unsentItemIds));
  const hasUnsentChanges = queueState.hasNotificationChanges;
  const publishStatus = hasUnsentChanges ? 'live_unsent' : 'live';
  const liveRevision = bundle?.meta?.last_updated_ts || null;
  const draftRevision = bundle?.meta?.draft_saved_ts || null;
  const lastSentRevision = bundle?.meta?.last_sent_ts || null;
  const workspaceCapabilities = {
    canSaveDraft: canManage,
    canSaveLiveMenu: canManage,
    canSaveQuietly: canManage,
    canPublishUpdates: canManage,
    canManageRestaurantSpecials: canEditRestaurantSpecials,
    canReadRestaurantTools: canEditRestaurantSpecials,
    canManageAdminSettings: normalizedActor?.role === 'admin',
    includesDraftAuthorship,
    includesRestaurantTools: !!restaurantTools,
  };

  return {
    cats: normalizedCats,
    meta: bundle?.meta || {},
    restaurant: bundle?.restaurant || null,
    restaurantTools: restaurantTools || null,
    context: {
      kind: 'menu-workspace',
      menu: bundle?.menu || null,
    },
    workspace: {
      actor: normalizedActor,
      accessibleMenuIds,
      hasSharedDraft,
      sharedDraft,
      publishState: {
        status: publishStatus,
        statusLabel: hasUnsentChanges ? 'Live | Unsent' : 'Live',
        hasUnsentChanges,
        revisions: {
          liveRevision,
          notificationRevision: lastSentRevision,
        },
        queue: {
          contract: 'menu-queue.v1',
          unsentItemIds,
          unsentFeaturedIds: [],
          sections: queueState.diff,
          selectableGroupIds: queueState.groups.map(group => group.id),
        },
      },
      permissions: {
        canManage,
        canAdmin: normalizedActor?.role === 'admin',
        canEditRestaurantSpecials,
        canReadRestaurantTools: canEditRestaurantSpecials,
      },
      capabilities: workspaceCapabilities,
      revisions: {
        liveRevision,
        draftRevision,
        lastSentRevision,
        notificationBaselineRevision: lastSentRevision,
      },
    },
    capabilities: workspaceCapabilities,
    compatibility: {
      contract: 'menu-workspace.v4',
      actorStamped: !!normalizedActor?.id,
      permissionShape: 'workspace.permissions.v1',
      capabilityShape: 'workspace.capabilities.v1',
      publishStateShape: 'workspace.publish-state.v1',
      sharedDraftDeprecated: true,
    },
  };
}

export function createPublicMenuPayload(bundle) {
  const normalizedCats = ensureFeaturedSpecialsCategory(bundle?.cats || [], {
    menuId: bundle?.menu?.id || '',
    menuType: bundle?.menu?.type || 'drinks',
  });
  return {
    cats: sortCategories(normalizedCats)
      .map(sanitizePublicCategory)
      .filter(category => category.key !== '__uncategorized__' && category.key !== 'featured_specials')
      .filter(category => Array.isArray(category.items) ? category.items.length > 0 : true),
    featuredItems: deriveFeaturedItems(normalizedCats).map(sanitizePublicItem),
    meta: sanitizePublicMeta(bundle?.meta || {}),
    restaurant: sanitizePublicRestaurant(bundle?.restaurant || null),
    context: {
      kind: 'menu-public',
      menu: bundle?.menu || null,
    },
    capabilities: {
      guestReadable: true,
      requiresAuth: false,
      includesDraftState: false,
      includesNotificationConfig: false,
    },
    compatibility: {
      contract: 'menu-public.v3',
      projection: 'guest-safe',
      categoryShape: 'public-category.v1',
      itemShape: 'public-item.v1',
      featuredSource: 'menu-category',
    },
  };
}

export function createSessionBootstrapPayload({ actor = null, accessibleMenuIds = [] } = {}) {
  const normalizedActor = normalizeActor(actor);
  const managedMenuIds = normalizedActor?.role === 'admin'
    ? KNOWN_MENU_ORDER.slice()
    : Array.isArray(accessibleMenuIds)
      ? accessibleMenuIds.filter(Boolean)
      : [];

  return {
    actor: normalizedActor,
    appVersion: APP_VERSION,
    defaultMenuId: getDefaultMenuId(managedMenuIds),
    capabilities: {
      canAccessManager: normalizedActor?.role === 'manager' || normalizedActor?.role === 'admin',
      canAccessAdmin: normalizedActor?.role === 'admin',
      canManageAnyMenu: normalizedActor?.role === 'admin' || managedMenuIds.length > 0,
    },
    menus: getKnownMenus().map(menu => ({
      ...menu,
      canManage: normalizedActor?.role === 'admin' || managedMenuIds.includes(menu.id),
    })),
    restaurants: getKnownRestaurants().map(restaurant => ({
      ...restaurant,
      canAccess: normalizedActor?.role === 'admin' || buildRestaurantIdsFromMenuIds(managedMenuIds).includes(restaurant.id),
    })),
    access: {
      accessibleMenuIds: managedMenuIds,
      accessibleRestaurantIds: normalizedActor?.role === 'admin'
        ? KNOWN_RESTAURANT_ORDER.slice()
        : buildRestaurantIdsFromMenuIds(managedMenuIds),
    },
    compatibility: {
      contract: 'session-bootstrap.v1',
      capabilityShape: 'bootstrap.capabilities.v1',
      fixedMenuRegistry: true,
    },
  };
}

export async function readActorForBootstrap(uid, accessibleMenuIds = []) {
  if (!uid) return createSessionBootstrapPayload();
  const profile = await readProfile(uid, { select: 'role,name' });
  return createSessionBootstrapPayload({
    actor: {
      id: uid,
      name: profile?.name || '',
      role: profile?.role || 'none',
    },
    accessibleMenuIds,
  });
}
