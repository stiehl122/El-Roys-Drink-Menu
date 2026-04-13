import {
  requireAuthenticatedUser,
  requireMenuAccess,
  readProfile,
} from './_auth.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';
import {
  getKnownMenuById,
  isSupportedMenuId,
} from './_menu-read.js';

function getContentHeaders() {
  return serviceHeaders({
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

function formatInList(values = [], { quoted = false } = {}) {
  return values
    .filter(Boolean)
    .map(value => (quoted ? `"${value}"` : value))
    .join(',');
}

function cloneItemUpcharges(upcharges = []) {
  if (!Array.isArray(upcharges)) return [];
  return upcharges
    .map(entry => ({
      label: String(entry?.label || '').trim(),
      price: String(entry?.price || '').trim(),
    }))
    .filter(entry => entry.label || entry.price);
}

function normalizeRecipe(recipe = []) {
  if (Array.isArray(recipe)) return recipe.filter(Boolean).map(entry => String(entry).trim()).filter(Boolean);
  if (typeof recipe === 'string' && recipe.trim()) return [recipe.trim()];
  return [];
}

function normalizeSnapshot(snapshot = {}) {
  const cats = Array.isArray(snapshot?.cats) ? snapshot.cats : [];
  return {
    cats: cats.map((category, categoryIndex) => ({
      id: String(category?.id || ''),
      key: String(category?.key || '').trim(),
      label: String(category?.label || '').trim(),
      icon: String(category?.icon || ''),
      color: String(category?.color || ''),
      sub: String(category?.sub || ''),
      placeholder: String(category?.placeholder || ''),
      display_order: Number.isFinite(Number(category?.display_order)) ? Number(category.display_order) : categoryIndex,
      items: (Array.isArray(category?.items) ? category.items : []).map((item, itemIndex) => ({
        id: String(item?.id || ''),
        name: String(item?.name || '').trim(),
        desc: String(item?.desc || ''),
        recipe: normalizeRecipe(item?.recipe),
        price: item?.price == null ? null : String(item.price || ''),
        is_eighty_sixed: !!item?.is_eighty_sixed,
        on_menu: item?.on_menu !== false,
        visibility: String(item?.visibility || 'public'),
        upcharges: cloneItemUpcharges(item?.upcharges),
        show_description: item?.show_description !== false,
        show_recipe: !!item?.show_recipe,
        display_order: Number.isFinite(Number(item?.display_order)) ? Number(item.display_order) : itemIndex,
      })).filter(item => item.id && item.name),
    })).filter(category => category.key && category.label),
    meta: snapshot?.meta && typeof snapshot.meta === 'object' ? snapshot.meta : {},
    restaurant: snapshot?.restaurant && typeof snapshot.restaurant === 'object' ? snapshot.restaurant : null,
  };
}

async function fetchJsonOrThrow(url, fallbackMessage) {
  const response = await fetch(url, { headers: serviceHeaders() });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

async function patchJsonOrThrow(url, body, fallbackMessage, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'PATCH',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=minimal',
    }),
    body: JSON.stringify(body || {}),
  });
  if (response.ok) return response;
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

async function deleteOrThrow(url, fallbackMessage) {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: serviceHeaders(),
  });
  if (response.ok) return response;
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

export async function readAuthorizedMenuActor(req, menuId) {
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }
  const caller = await requireAuthenticatedUser(req);
  const profile = await readProfile(caller.uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  if (!['manager', 'admin'].includes(role)) {
    throw { status: 403, message: 'Forbidden' };
  }
  await requireMenuAccess(caller.uid, role, menuId);
  return {
    id: caller.uid,
    name: String(profile?.name || '').trim(),
    role,
  };
}

export async function readMenuMeta(menuId) {
  const { sbUrl } = getSupabaseServerConfig();
  const rows = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}&select=*&limit=1`,
    'Failed to load menu metadata'
  );
  return rows?.[0] || {};
}

function normalizeRevision(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

export function readRevisionState(meta = {}) {
  return {
    live_revision: normalizeRevision(meta?.last_updated_ts),
    draft_revision: normalizeRevision(meta?.draft_saved_ts),
    last_sent_revision: normalizeRevision(meta?.last_sent_ts),
  };
}

export function assertExpectedRevision(expectedRevision, actualRevision, fieldName, options = {}) {
  if (expectedRevision == null || expectedRevision === '') return;
  const expected = normalizeRevision(expectedRevision);
  const actual = normalizeRevision(actualRevision);
  if (expected == null) return;
  if (actual !== expected) {
    const currentRevisions = options?.currentRevisions && typeof options.currentRevisions === 'object'
      ? options.currentRevisions
      : { [fieldName]: actual };
    const command = typeof options?.command === 'string' ? options.command : null;
    const menuId = options?.menuId ? String(options.menuId) : null;
    throw {
      status: 409,
      message: `${fieldName} is stale`,
      body: {
        ok: false,
        status: 'revision_conflict',
        error: `${fieldName} is stale`,
        code: 'revision_conflict',
        field: fieldName,
        expected,
        actual,
        menu_id: menuId,
        command,
        current_revisions: currentRevisions,
        reconnect: {
          required: true,
          reason: 'stale_revision',
          action: 'reload_workspace',
        },
        compatibility: {
          staleField: fieldName,
          command,
        },
      },
    };
  }
}

async function upsertCategories(menuId, normalizedSnapshot) {
  const { sbUrl } = getSupabaseServerConfig();
  const categoryRows = normalizedSnapshot.cats.map(category => ({
    menu_id: menuId,
    key: category.key,
    label: category.label,
    icon: category.icon,
    color: category.color,
    sub: category.sub,
    placeholder: category.placeholder,
    display_order: category.display_order,
  }));
  if (categoryRows.length) {
    const response = await fetch(`${sbUrl}/rest/v1/categories`, {
      method: 'POST',
      headers: getContentHeaders(),
      body: JSON.stringify(categoryRows),
    });
    if (!response.ok) {
      const payload = await readJsonSafe(response);
      throw new Error(getApiErrorMessage(payload, 'Failed to save categories'));
    }
  }

  const categories = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`,
    'Failed to reload categories'
  );
  return new Map((categories || []).map(category => [category.key, category.id]));
}

async function syncItems(menuId, normalizedSnapshot, categoryIdsByKey) {
  const { sbUrl } = getSupabaseServerConfig();
  const currentCategoryIds = Array.from(categoryIdsByKey.values()).filter(Boolean);
  const existingItems = currentCategoryIds.length
    ? await fetchJsonOrThrow(
        `${sbUrl}/rest/v1/items?category_id=in.(${formatInList(currentCategoryIds)})&select=id`,
        'Failed to load current items'
      )
    : [];

  const itemRows = normalizedSnapshot.cats.flatMap(category => {
    const categoryId = categoryIdsByKey.get(category.key);
    if (!categoryId) return [];
    return category.items.map(item => ({
      id: item.id,
      category_id: categoryId,
      name: item.name,
      desc: item.desc,
      recipe: item.recipe,
      price: item.price,
      is_eighty_sixed: item.is_eighty_sixed,
      is_draft: false,
      on_menu: item.on_menu,
      visibility: item.visibility,
      upcharges: item.upcharges,
      show_description: item.show_description,
      show_recipe: item.show_recipe,
      display_order: item.display_order,
    }));
  });

  if (itemRows.length) {
    const response = await fetch(`${sbUrl}/rest/v1/items`, {
      method: 'POST',
      headers: getContentHeaders(),
      body: JSON.stringify(itemRows),
    });
    if (!response.ok) {
      const payload = await readJsonSafe(response);
      throw new Error(getApiErrorMessage(payload, 'Failed to save items'));
    }
  }

  const nextItemIds = new Set(itemRows.map(item => item.id));
  const removedIds = (existingItems || [])
    .map(item => item.id)
    .filter(itemId => itemId && !nextItemIds.has(itemId));
  if (removedIds.length) {
    await deleteOrThrow(
      `${sbUrl}/rest/v1/items?id=in.(${formatInList(removedIds, { quoted: true })})`,
      'Failed to delete removed items'
    );
  }
}

async function syncDeletedCategories(menuId, normalizedSnapshot) {
  const { sbUrl } = getSupabaseServerConfig();
  const categories = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`,
    'Failed to load existing categories'
  );
  const nextKeys = new Set(normalizedSnapshot.cats.map(category => category.key));
  const deleteIds = (categories || [])
    .filter(category => category?.id && category?.key && !nextKeys.has(category.key))
    .map(category => category.id);
  if (deleteIds.length) {
    await deleteOrThrow(
      `${sbUrl}/rest/v1/categories?id=in.(${formatInList(deleteIds)})`,
      'Failed to delete removed categories'
    );
  }
}

async function patchMenuBotId(menuId, botId) {
  if (botId == null) return;
  const { sbUrl } = getSupabaseServerConfig();
  await patchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}`,
    { bot_id: String(botId || '') },
    'Failed to save menu metadata'
  );
}

export async function saveDraftStateForMenu({ menuId, snapshot = {}, savedAt, expectedDraftRevision = null }) {
  const meta = await readMenuMeta(menuId);
  assertExpectedRevision(expectedDraftRevision, meta?.draft_saved_ts || null, 'draft_revision', {
    menuId,
    command: 'menu-draft.v1',
    currentRevisions: readRevisionState(meta),
  });
  const { sbUrl } = getSupabaseServerConfig();
  const normalizedSavedAt = Number(savedAt || Date.now());
  await patchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}`,
    {
      draft_state: snapshot || {},
      draft_saved_ts: snapshot ? normalizedSavedAt : null,
    },
    'Failed to save draft'
  );
  return {
    draft_saved_ts: snapshot ? normalizedSavedAt : null,
    downgradedFields: [],
  };
}

export async function saveLiveMenuForMenu({ menuId, snapshot = {}, expectedLiveRevision = null, actor = null }) {
  void actor;
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const meta = await readMenuMeta(menuId);
  assertExpectedRevision(expectedLiveRevision, meta?.last_updated_ts || null, 'live_revision', {
    menuId,
    command: 'menu-live.v1',
    currentRevisions: readRevisionState(meta),
  });

  const knownMenu = getKnownMenuById(menuId);
  if (!knownMenu) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const categoryIdsByKey = await upsertCategories(menuId, normalizedSnapshot);
  await syncItems(menuId, normalizedSnapshot, categoryIdsByKey);
  await syncDeletedCategories(menuId, normalizedSnapshot);
  await patchMenuBotId(menuId, normalizedSnapshot.meta?.bot_id);

  return {
    ok: true,
    menu_id: menuId,
    restaurant_id: knownMenu.restaurantId,
    category_count: normalizedSnapshot.cats.length,
    item_count: normalizedSnapshot.cats.reduce((total, category) => total + category.items.length, 0),
  };
}

export async function patchMenuMetaForMenu(menuId, update = {}) {
  const { sbUrl } = getSupabaseServerConfig();
  await patchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}`,
    update,
    'Failed to update menu metadata'
  );
}

export async function insertUpdateLog({ menuId, actor = null, diff = [], message = '' }) {
  if (!message) return true;
  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/rest/v1/update_log`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify({
      menu_id: menuId,
      user_id: actor?.id || null,
      user_name: String(actor?.name || '').trim(),
      diff: Array.isArray(diff) ? diff : [],
      message: String(message || ''),
    }),
  });
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw new Error(getApiErrorMessage(payload, 'Failed to write update log'));
  }
  return true;
}
