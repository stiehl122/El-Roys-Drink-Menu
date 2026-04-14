import { getRestaurantSpecialConfig } from './_auth.js';
import { getKnownMenus } from './_menu-read.js';
import { fetchRestaurantSpecialGroup } from './_specials-command.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';

function normalizeRecipe(recipe = []) {
  if (Array.isArray(recipe)) return recipe.map(entry => String(entry || '').trim()).filter(Boolean);
  if (typeof recipe === 'string' && recipe.trim()) return [recipe.trim()];
  return [];
}

function normalizeUpcharges(upcharges = []) {
  if (!Array.isArray(upcharges)) return [];
  return upcharges
    .map(entry => ({
      label: String(entry?.label || '').trim(),
      price: String(entry?.price || '').trim(),
    }))
    .filter(entry => entry.label || entry.price);
}

function createEmptyRestaurantToolsPayload(restaurantId = '') {
  return {
    restaurantId: String(restaurantId || ''),
    featuredGroups: [],
    siblingCatalog: [],
    compatibility: {
      contract: 'restaurant-tools.v1',
      featuredSource: 'none',
    },
  };
}

function getRestaurantMenuIds(restaurantId = '') {
  const configuredIds = getRestaurantSpecialConfig(restaurantId)?.menuIds;
  if (Array.isArray(configuredIds) && configuredIds.length) return configuredIds.filter(Boolean);
  return getKnownMenus()
    .filter(menu => menu.restaurantId === restaurantId)
    .map(menu => menu.id)
    .filter(Boolean);
}

function getMenusById() {
  return getKnownMenus().reduce((acc, menu) => {
    acc[menu.id] = menu;
    return acc;
  }, {});
}

async function fetchJsonOrThrow(url, fallbackMessage) {
  const response = await fetch(url, { headers: serviceHeaders() });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

function normalizeFeaturedItem(item = {}) {
  return item && typeof item === 'object'
    ? {
        id: String(item.id || ''),
        name: String(item.name || ''),
        price: String(item.price || ''),
        visibility: String(item.visibility || 'public'),
        eightySixed: !!item.is_eighty_sixed,
        desc: String(item.desc || ''),
        recipe: normalizeRecipe(item.recipe),
        upcharges: normalizeUpcharges(item.upcharges),
        showDescription: item.show_description !== false,
        showRecipe: !!item.show_recipe,
      }
    : null;
}

function normalizeFeaturedGroups(group = null, slots = []) {
  if (!group?.id) return [];
  return [{
    id: String(group.id || ''),
    name: String(group.name || ''),
    displayOrder: 0,
    slots: (Array.isArray(slots) ? slots : [])
      .map(slot => ({
        id: String(slot.id || ''),
        itemId: String(slot.item_id || ''),
        sellNote: String(slot.sell_note || ''),
        displayOrder: Number.isFinite(Number(slot.display_order)) ? Number(slot.display_order) : 0,
        confirmedAt: slot.confirmed_at || null,
        confirmedBy: String(slot.confirmed_by || ''),
        item: normalizeFeaturedItem(slot.items),
      }))
      .filter(slot => slot.item && slot.itemId),
  }];
}

async function readLegacyFeaturedGroupsForMenu(menuId = '') {
  if (!menuId) return [];
  const { sbUrl } = getSupabaseServerConfig();
  const menuGroups = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_featured_groups?menu_id=eq.${menuId}&select=display_order,featured_groups(id,name)&order=display_order.asc`,
    'Failed to load legacy featured groups'
  );
  if (!Array.isArray(menuGroups) || !menuGroups.length) return [];
  const groupIds = menuGroups
    .map(entry => entry?.featured_groups?.id)
    .filter(Boolean);
  if (!groupIds.length) return [];
  const allSlots = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/featured_slots?featured_group_id=in.(${groupIds.join(',')})&select=*,items(id,name,price,visibility,is_eighty_sixed,desc,recipe,upcharges,show_description,show_recipe)&order=display_order.asc`,
    'Failed to load legacy featured slots'
  );
  return menuGroups.map(menuGroup => ({
    id: String(menuGroup?.featured_groups?.id || ''),
    name: String(menuGroup?.featured_groups?.name || ''),
    displayOrder: Number.isFinite(Number(menuGroup?.display_order)) ? Number(menuGroup.display_order) : 0,
    slots: (Array.isArray(allSlots) ? allSlots : [])
      .filter(slot => slot.featured_group_id === menuGroup?.featured_groups?.id)
      .map(slot => ({
        id: String(slot.id || ''),
        itemId: String(slot.item_id || ''),
        sellNote: String(slot.sell_note || ''),
        displayOrder: Number.isFinite(Number(slot.display_order)) ? Number(slot.display_order) : 0,
        confirmedAt: slot.confirmed_at || null,
        confirmedBy: String(slot.confirmed_by || ''),
        item: normalizeFeaturedItem(slot.items),
      }))
      .filter(slot => slot.item && slot.itemId),
  })).filter(group => group.id);
}

async function readRestaurantFeaturedGroups({ restaurantId = '', currentMenuId = '' } = {}) {
  if (!restaurantId) return createEmptyRestaurantToolsPayload(restaurantId);
  const { sbUrl } = getSupabaseServerConfig();
  const group = await fetchRestaurantSpecialGroup(sbUrl, restaurantId);
  if (group?.id) {
    const slots = await fetchJsonOrThrow(
      `${sbUrl}/rest/v1/featured_slots?featured_group_id=eq.${group.id}&select=*,items(id,name,price,visibility,is_eighty_sixed,desc,recipe,upcharges,show_description,show_recipe)&order=display_order.asc`,
      'Failed to load restaurant specials'
    );
    return {
      ...createEmptyRestaurantToolsPayload(restaurantId),
      featuredGroups: normalizeFeaturedGroups(group, slots),
      compatibility: {
        contract: 'restaurant-tools.v1',
        featuredSource: 'restaurant-specials',
      },
    };
  }
  return {
    ...createEmptyRestaurantToolsPayload(restaurantId),
    featuredGroups: await readLegacyFeaturedGroupsForMenu(currentMenuId),
    compatibility: {
      contract: 'restaurant-tools.v1',
      featuredSource: 'legacy-menu-featured',
    },
  };
}

async function readSiblingCatalog({ restaurantId = '', currentMenuId = '' } = {}) {
  const siblingMenuIds = getRestaurantMenuIds(restaurantId)
    .filter(menuId => menuId && menuId !== currentMenuId);
  if (!siblingMenuIds.length) return [];
  const { sbUrl } = getSupabaseServerConfig();
  const categories = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/categories?menu_id=in.(${siblingMenuIds.join(',')})&select=menu_id,key,label,items(id,name,visibility,on_menu)&order=display_order.asc`,
    'Failed to load restaurant tools catalog'
  );
  const menusById = getMenusById();
  return (Array.isArray(categories) ? categories : [])
    .flatMap(category => (Array.isArray(category?.items) ? category.items : []).map(item => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      cat: String(category?.label || ''),
      menuId: String(category?.menu_id || ''),
      menuLabel: String((menusById[category?.menu_id]?.type || '').toLowerCase() === 'food' ? 'Food' : 'Drinks'),
      onMenu: category?.key === '__uncategorized__' ? true : item?.on_menu !== false,
      visibility: category?.key === '__uncategorized__'
        ? String(item?.visibility || 'off_menu')
        : String(item?.visibility || 'public'),
    })))
    .filter(item => item.id && item.name);
}

export async function readRestaurantToolsPayload({
  restaurantId = '',
  currentMenuId = '',
} = {}) {
  if (!restaurantId) return createEmptyRestaurantToolsPayload(restaurantId);
  const [featuredResult, siblingCatalog] = await Promise.all([
    readRestaurantFeaturedGroups({ restaurantId, currentMenuId }),
    readSiblingCatalog({ restaurantId, currentMenuId }),
  ]);
  return {
    restaurantId: String(restaurantId || ''),
    featuredGroups: Array.isArray(featuredResult.featuredGroups) ? featuredResult.featuredGroups : [],
    siblingCatalog,
    compatibility: featuredResult.compatibility || {
      contract: 'restaurant-tools.v1',
      featuredSource: 'none',
    },
  };
}
