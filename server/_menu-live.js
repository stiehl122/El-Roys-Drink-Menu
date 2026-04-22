import {
  readProfile,
  requireAuthenticatedUser,
  requireMenuAccess,
} from './_auth.js';
import {
  isSupportedMenuId,
  parseMenuId,
} from './_menu-read.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';
import {
  assertExpectedRevision,
  normalizePersistentItemId,
  readMenuMeta,
  readRevisionState,
} from './_menu-write.js';
import { assertCategoryGovernanceAllowed } from './_category-governance.js';

const UNCATEGORIZED_ID = '__uncategorized__';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function parseRequestBody(req) {
  if (asObject(req?.body)) return req.body;
  if (typeof req?.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return asObject(parsed) || {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function firstDefined(...candidates) {
  for (const candidate of candidates) {
    if (candidate != null && candidate !== '') return candidate;
  }
  return null;
}

function resolveMenuId(req, payload) {
  const snapshot = asObject(payload?.snapshot) || payload;
  const candidates = [
    payload?.menu_id,
    payload?.menuId,
    snapshot?.menu_id,
    snapshot?.menuId,
    snapshot?.context?.menu?.id,
    parseMenuId(req),
  ];
  return candidates.map(asString).find(Boolean) || '';
}

function extractSnapshot(payload) {
  const snapshot = asObject(payload?.snapshot) || payload;
  const categories = asArray(snapshot?.cats);
  const meta = asObject(snapshot?.meta) || {};
  const restaurant = asObject(snapshot?.restaurant) || {};
  return { snapshot, categories, meta, restaurant };
}

function normalizeRecipe(value) {
  if (Array.isArray(value)) return value.filter(entry => asString(entry)).map(entry => asString(entry));
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function normalizeUpcharges(value) {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const row = asObject(entry) || {};
    return {
      label: asString(row.label),
      price: asString(row.price),
    };
  }).filter(entry => entry.label);
}

function toClientItemName(item = {}) {
  return asString(item.name);
}

function normalizeVisibility(item = {}) {
  const raw = asString(item.visibility).toLowerCase();
  if (raw === 'public') return 'public';
  return 'public';
}

function normalizeItemRow(item, categoryId, displayOrder, { forceOffMenu = false } = {}) {
  const row = asObject(item) || {};
  const name = toClientItemName(row);
  if (!name) return null;
  const rawId = asString(row.id);
  const itemId = normalizePersistentItemId(rawId);
  const showDescriptionRaw = Object.prototype.hasOwnProperty.call(row, 'showDescription')
    ? row.showDescription
    : row.show_description;
  const showRecipeRaw = Object.prototype.hasOwnProperty.call(row, 'showRecipe')
    ? row.showRecipe
    : row.show_recipe;
  const onMenuRaw = Object.prototype.hasOwnProperty.call(row, 'onMenu')
    ? row.onMenu
    : row.on_menu;
  const eightySixedRaw = Object.prototype.hasOwnProperty.call(row, 'eightySixed')
    ? row.eightySixed
    : row.is_eighty_sixed;
  const featuredEnabledRaw = Object.prototype.hasOwnProperty.call(row, 'featuredEnabled')
    ? row.featuredEnabled
    : row.featured_enabled;
  const rawPrice = asString(row.price);

  return {
    id: itemId,
    category_id: categoryId,
    name,
    desc: asString(row.desc),
    recipe: normalizeRecipe(row.recipe),
    price: rawPrice || null,
    is_eighty_sixed: parseBoolean(eightySixedRaw, false),
    is_draft: false,
    on_menu: forceOffMenu ? false : onMenuRaw !== false,
    visibility: normalizeVisibility(row),
    upcharges: normalizeUpcharges(row.upcharges),
    show_description: showDescriptionRaw !== false,
    show_recipe: !!showRecipeRaw,
    featured_enabled: featuredEnabledRaw === true,
    display_order: displayOrder,
  };
}

function normalizeCategoryRows(menuId, categories = []) {
  const observedKeys = new Set();
  const normalized = [];

  categories.forEach(category => {
    const row = asObject(category) || {};
    const key = asString(row.key);
    if (!key || observedKeys.has(key)) return;
    observedKeys.add(key);
    normalized.push({
      key,
      label: asString(row.label) || key,
      icon: asString(row.icon),
      color: asString(row.color),
      sub: asString(row.sub),
      placeholder: asString(row.placeholder),
      untappd_enabled: row?.untappd_enabled === true || row?.untappdEnabled === true,
      items: asArray(row.items),
    });
  });

  const regular = normalized.filter(category => category.key !== UNCATEGORIZED_ID);
  const uncategorized = normalized.find(category => category.key === UNCATEGORIZED_ID) || null;

  const categoryRows = regular.map((category, index) => ({
    menu_id: menuId,
    key: category.key,
    label: category.label,
    icon: category.icon,
    color: category.color,
    sub: category.sub,
    placeholder: category.placeholder,
    untappd_enabled: category.untappd_enabled === true,
    display_order: index,
  }));

  const uncategorizedRow = uncategorized
    ? {
        menu_id: menuId,
        key: UNCATEGORIZED_ID,
        label: uncategorized.label || 'Uncategorized',
        icon: uncategorized.icon,
        color: uncategorized.color,
        sub: uncategorized.sub,
        placeholder: uncategorized.placeholder,
        untappd_enabled: false,
        display_order: 9999,
      }
    : null;

  return {
    categoryRows,
    regularCategories: regular,
    uncategorizedCategory: uncategorized,
    uncategorizedRow,
  };
}

async function fetchJsonOrThrow(url, options = {}, fallbackMessage = 'Server error') {
  const response = await fetch(url, options);
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

async function readMenuAndCategories(menuId) {
  const { sbUrl } = getSupabaseServerConfig();
  const headers = serviceHeaders();
  const [menuRows, categoryRows] = await Promise.all([
    fetchJsonOrThrow(
      `${sbUrl}/rest/v1/menus?id=eq.${menuId}&select=id,restaurant_id,archived&limit=1`,
      { headers },
      'Failed to load menu'
    ),
    fetchJsonOrThrow(
      `${sbUrl}/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`,
      { headers },
      'Failed to load categories'
    ),
  ]);
  const menu = Array.isArray(menuRows) ? menuRows[0] : null;
  if (!menu || menu.archived) throw { status: 404, message: 'Menu not found' };
  return {
    menu,
    categoriesByKey: new Map((Array.isArray(categoryRows) ? categoryRows : []).map(row => [row.key, row])),
  };
}

async function upsertCategories(menuId, normalizedCategories, categoriesByKey) {
  const { sbUrl } = getSupabaseServerConfig();
  const rows = normalizedCategories.categoryRows.slice();

  const uncategorizedSeed = normalizedCategories.uncategorizedRow || {
    menu_id: menuId,
    key: UNCATEGORIZED_ID,
    label: 'Uncategorized',
    icon: '',
    color: '',
    sub: '',
    placeholder: '',
    untappd_enabled: false,
    display_order: 9999,
  };
  rows.push(uncategorizedSeed);

  const payload = rows.map(row => {
    const existing = categoriesByKey.get(row.key);
    const resolvedId = existing?.id;
    return resolvedId ? { ...row, id: resolvedId } : row;
  });

  const response = await fetch(`${sbUrl}/rest/v1/categories?on_conflict=menu_id,key`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await readJsonSafe(response);
    throw new Error(getApiErrorMessage(errorPayload, 'Failed to persist categories'));
  }

  const refreshed = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`,
    { headers: serviceHeaders() },
    'Failed to reload categories'
  );
  return new Map((Array.isArray(refreshed) ? refreshed : []).map(row => [row.key, row]));
}

function buildItemRows(normalizedCategories, categoriesByKey) {
  const rows = [];
  const missingKeys = [];

  normalizedCategories.regularCategories.forEach(category => {
    const mapped = categoriesByKey.get(category.key);
    if (!mapped?.id) {
      missingKeys.push(category.key);
      return;
    }
    category.items.forEach((item, index) => {
      const row = normalizeItemRow(item, mapped.id, index, { forceOffMenu: false });
      if (row) rows.push(row);
    });
  });

  const uncategorized = normalizedCategories.uncategorizedCategory;
  if (uncategorized) {
    const mapped = categoriesByKey.get(UNCATEGORIZED_ID);
    if (!mapped?.id) {
      missingKeys.push(UNCATEGORIZED_ID);
    } else {
      uncategorized.items.forEach((item, index) => {
        const row = normalizeItemRow(item, mapped.id, index, { forceOffMenu: true });
        if (row) rows.push(row);
      });
    }
  }

  return { rows, missingKeys };
}

async function upsertItems(rows = []) {
  if (!rows.length) return;
  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/rest/v1/items`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw new Error(getApiErrorMessage(payload, 'Failed to persist items'));
  }
}

function normalizeDeletedItemIds(payload = {}) {
  const candidates = [
    payload.deleted_item_ids,
    payload.deletedItemIds,
    payload.snapshot?.deleted_item_ids,
    payload.snapshot?.deletedItemIds,
  ];
  const ids = candidates
    .flatMap(value => asArray(value))
    .map(asString)
    .filter(Boolean)
    .filter(id => !id.startsWith('local-'));
  return Array.from(new Set(ids));
}

async function deleteExplicitlyRemovedItems(deletedItemIds = [], categoriesByKey = new Map()) {
  if (!deletedItemIds.length) return 0;
  const categoryIds = Array.from(categoriesByKey.values())
    .map(row => asString(row?.id))
    .filter(Boolean);
  if (!categoryIds.length) return 0;

  const quotedItemIds = deletedItemIds.map(id => `"${id}"`).join(',');
  const categoryFilter = categoryIds.join(',');
  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(
    `${sbUrl}/rest/v1/items?id=in.(${quotedItemIds})&category_id=in.(${categoryFilter})`,
    { method: 'DELETE', headers: serviceHeaders({ Prefer: 'return=minimal' }) }
  );
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw new Error(getApiErrorMessage(payload, 'Failed to delete removed items'));
  }
  return deletedItemIds.length;
}

function buildMenuMetaPatch(meta = {}, ts) {
  const patch = { last_updated_ts: ts };
  if (Object.prototype.hasOwnProperty.call(meta, 'bot_id')) {
    patch.bot_id = asString(meta.bot_id);
  }
  if (Object.prototype.hasOwnProperty.call(meta, 'notifications') && asObject(meta.notifications)) {
    patch.notifications = meta.notifications;
  }
  return patch;
}

async function upsertMenuMeta(menuId, patch) {
  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/rest/v1/menu_meta?on_conflict=menu_id`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify({ menu_id: menuId, ...patch }),
  });
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw new Error(getApiErrorMessage(payload, 'Failed to persist menu metadata'));
  }
}

async function patchRestaurantDesignIfPresent(restaurantId, restaurant = {}) {
  if (!restaurantId) return false;
  const hasDesign = Object.prototype.hasOwnProperty.call(restaurant, 'design');
  const design = hasDesign ? restaurant.design : undefined;
  if (!hasDesign) return false;

  const patch = { design: asObject(design) || {} };
  if (Object.prototype.hasOwnProperty.call(restaurant, 'use_custom_design')) {
    patch.use_custom_design = !!restaurant.use_custom_design;
  }

  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/rest/v1/restaurants?id=eq.${restaurantId}`, {
    method: 'PATCH',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw new Error(getApiErrorMessage(payload, 'Failed to persist restaurant design'));
  }
  return true;
}

export async function saveLiveMenuCommand(req) {
  const payload = parseRequestBody(req);
  const menuId = resolveMenuId(req, payload);
  if (!isSupportedMenuId(menuId)) throw { status: 400, message: 'Unsupported menu_id' };

  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  if (role !== 'manager' && role !== 'admin') {
    throw { status: 403, message: 'Forbidden' };
  }
  await requireMenuAccess(uid, role, menuId);

  const actor = {
    id: uid,
    name: String(profile?.name || '').trim(),
    role,
  };
  const snapshotPayload = asObject(payload?.snapshot) || payload;
  await assertCategoryGovernanceAllowed({
    actor,
    menuId,
    snapshot: snapshotPayload,
    requireCategorySnapshot: true,
  });

  const expectedLiveRevision = firstDefined(
    payload?.expected_live_revision,
    payload?.expectedLiveRevision,
    payload?.snapshot?.expected_live_revision,
    payload?.snapshot?.expectedLiveRevision
  );
  const expectedDraftRevision = firstDefined(
    payload?.expected_draft_revision,
    payload?.expectedDraftRevision,
    payload?.snapshot?.expected_draft_revision,
    payload?.snapshot?.expectedDraftRevision
  );
  const revisionMeta = await readMenuMeta(menuId);
  const currentRevisions = readRevisionState(revisionMeta);
  assertExpectedRevision(expectedLiveRevision, revisionMeta?.last_updated_ts || null, 'live_revision', {
    menuId,
    command: 'menu-live.v1',
    currentRevisions,
  });
  assertExpectedRevision(expectedDraftRevision, revisionMeta?.draft_saved_ts || null, 'draft_revision', {
    menuId,
    command: 'menu-live.v1',
    currentRevisions,
  });

  const { categories, meta, restaurant } = extractSnapshot(payload);
  const { menu, categoriesByKey: existingByKey } = await readMenuAndCategories(menuId);
  const normalizedCategories = normalizeCategoryRows(menuId, categories);
  if (!normalizedCategories.categoryRows.length && !normalizedCategories.uncategorizedCategory) {
    throw { status: 400, message: 'Snapshot payload must include cats[]' };
  }

  const categoriesByKey = await upsertCategories(menuId, normalizedCategories, existingByKey);
  const itemRowsResult = buildItemRows(normalizedCategories, categoriesByKey);
  if (itemRowsResult.missingKeys.length) {
    throw {
      status: 400,
      message: `Missing category rows for keys: ${itemRowsResult.missingKeys.join(', ')}`,
    };
  }
  await upsertItems(itemRowsResult.rows);

  const deletedItemIds = normalizeDeletedItemIds(payload);
  const deletedCount = await deleteExplicitlyRemovedItems(deletedItemIds, categoriesByKey);

  const ts = Date.now();
  await upsertMenuMeta(menuId, buildMenuMetaPatch(meta, ts));
  const restaurantDesignUpdated = await patchRestaurantDesignIfPresent(menu.restaurant_id, restaurant);

  return {
    ok: true,
    status: 'live_saved',
    ts,
    menu_id: menuId,
    compatibility: {
      command: 'menu-live',
      snapshotShape: 'legacy-cats-meta-restaurant',
      uncategorizedKey: UNCATEGORIZED_ID,
      categoryCount: normalizedCategories.categoryRows.length + 1,
      itemCount: itemRowsResult.rows.length,
      deletedItemCount: deletedCount,
      restaurantDesignUpdated,
    },
  };
}
