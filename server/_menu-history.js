import {
  requireAuthenticatedUser,
  readProfile,
  requireMenuAccess,
  requireRestaurantSpecialsAccess,
} from './_auth.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';
import {
  getKnownMenuById,
  getKnownRestaurants,
  isSupportedMenuId,
  parseMenuId,
} from './_menu-read.js';

function normalizePositiveInteger(value, fallback, { min = 1, max = 100 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function parseScalarQueryParam(req, key) {
  if (req?.query && Object.prototype.hasOwnProperty.call(req.query, key)) {
    return req.query[key];
  }
  try {
    const url = new URL(req?.url || '/', 'http://localhost');
    return url.searchParams.get(key);
  } catch (_) {
    return null;
  }
}

function normalizeHistoryScope(value = '') {
  return String(value || '').trim().toLowerCase() === 'restaurant'
    ? 'restaurant'
    : 'menu';
}

function getKnownRestaurantById(restaurantId = '') {
  return getKnownRestaurants().find(restaurant => restaurant.id === restaurantId) || null;
}

export function normalizeHistoryDays(value) {
  return normalizePositiveInteger(value, 7, { min: 1, max: 30 });
}

export function normalizeHistoryLimit(value) {
  return normalizePositiveInteger(value, 25, { min: 1, max: 50 });
}

export function parseMenuHistoryRequest(req) {
  return {
    menuId: parseMenuId(req),
    days: normalizeHistoryDays(parseScalarQueryParam(req, 'days')),
    limit: normalizeHistoryLimit(parseScalarQueryParam(req, 'limit')),
    scope: normalizeHistoryScope(parseScalarQueryParam(req, 'scope')),
  };
}

export function normalizeHistoryLogEntry(entry = {}, options = {}) {
  const includeMenu = options.includeMenu === true;
  return {
    id: String(entry?.id || ''),
    menu_id: String(entry?.menu_id || ''),
    user_id: String(entry?.user_id || ''),
    user_name: String(entry?.user_name || '').trim(),
    diff: Array.isArray(entry?.diff) ? entry.diff : [],
    message: String(entry?.message || '').trim(),
    source: String(entry?.source || '').trim(),
    created_at: String(entry?.created_at || ''),
    ...(includeMenu ? { menu: entry?.menu && typeof entry.menu === 'object' ? entry.menu : null } : {}),
  };
}

function normalizeActor(actor = null) {
  if (!actor) return null;
  return {
    id: String(actor.id || ''),
    name: String(actor.name || '').trim(),
    role: String(actor.role || 'none'),
  };
}

export function createMenuHistoryPayload({
  actor = null,
  menu = null,
  restaurant = null,
  logs = [],
  days = 7,
  limit = 25,
  scope = 'menu',
  includesSource = false,
} = {}) {
  const normalizedScope = normalizeHistoryScope(scope);
  const normalizedLogs = (Array.isArray(logs) ? logs : [])
    .map(entry => normalizeHistoryLogEntry(entry, { includeMenu: normalizedScope === 'restaurant' }));
  return {
    logs: normalizedLogs,
    context: {
      kind: normalizedScope === 'restaurant' ? 'restaurant-history' : 'menu-history',
      menu: menu || null,
      ...(restaurant ? { restaurant } : {}),
    },
    actor: normalizeActor(actor),
    history: {
      days: normalizeHistoryDays(days),
      limit: normalizeHistoryLimit(limit),
      count: normalizedLogs.length,
      scope: normalizedScope,
      partial: false,
    },
    capabilities: {
      canReadHistory: true,
      includesMessage: true,
      includesSource: !!includesSource,
    },
    compatibility: {
      contract: 'menu-history.v2',
      sourceStamped: !!includesSource,
    },
  };
}

async function fetchJsonOrThrow(url, fallbackMessage) {
  const response = await fetch(url, { headers: serviceHeaders() });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw { status: 500, message: getApiErrorMessage(payload, fallbackMessage) };
}

async function readAuthorizedHistoryActor(req, menuId) {
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const caller = await requireAuthenticatedUser(req);
  const profile = await readProfile(caller.uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  if (!['manager', 'admin'].includes(role)) {
    throw { status: 403, message: 'Forbidden' };
  }
  return {
    id: caller.uid,
    name: String(profile?.name || '').trim(),
    role,
  };
}

async function readHistoryLogsForMenuIds(menuIds = [], { days = 7, limit = 25, includeSource = true } = {}) {
  const safeMenuIds = Array.isArray(menuIds) ? menuIds.filter(Boolean) : [];
  if (!safeMenuIds.length) return { logs: [], includesSource: false };
  const { sbUrl } = getSupabaseServerConfig();
  const sinceIso = new Date(Date.now() - (normalizeHistoryDays(days) * 24 * 60 * 60 * 1000)).toISOString();
  const menuFilter = safeMenuIds.length === 1
    ? `menu_id=eq.${safeMenuIds[0]}`
    : `menu_id=in.(${safeMenuIds.join(',')})`;
  const baseUrl = `${sbUrl}/rest/v1/update_log?${menuFilter}&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=${normalizeHistoryLimit(limit)}`;
  const withSourceSelect = 'id,menu_id,user_id,user_name,diff,message,source,created_at';
  const fallbackSelect = 'id,menu_id,user_id,user_name,diff,message,created_at';

  const readRows = async select => fetchJsonOrThrow(
    `${baseUrl}&select=${select}`,
    'Failed to load menu history'
  );

  if (!includeSource) {
    const logs = await readRows(fallbackSelect);
    return { logs, includesSource: false };
  }

  try {
    const logs = await readRows(withSourceSelect);
    return { logs, includesSource: true };
  } catch (error) {
    const message = `${error?.message || ''}`.toLowerCase();
    if (!message.includes('source') || (!message.includes('column') && !message.includes('schema cache'))) {
      throw error;
    }
    const logs = await readRows(fallbackSelect);
    return { logs, includesSource: false };
  }
}

export async function readMenuHistoryForRequest(req) {
  const { menuId, days, limit, scope } = parseMenuHistoryRequest(req);
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const menu = getKnownMenuById(menuId);
  const restaurant = getKnownRestaurantById(menu?.restaurantId || '');
  const actor = await readAuthorizedHistoryActor(req, menuId);

  if (scope === 'restaurant' && menu?.restaurantId) {
    const config = await requireRestaurantSpecialsAccess(actor.id, actor.role, menu.restaurantId);
    const historyResult = await readHistoryLogsForMenuIds(config?.menuIds || [], {
      days,
      limit,
      includeSource: true,
    });
    const logs = (Array.isArray(historyResult.logs) ? historyResult.logs : []).map(entry => ({
      ...entry,
      menu: getKnownMenuById(entry?.menu_id || ''),
    }));
    return createMenuHistoryPayload({
      actor,
      menu,
      restaurant,
      logs,
      days,
      limit,
      scope,
      includesSource: historyResult.includesSource,
    });
  }

  await requireMenuAccess(actor.id, actor.role, menuId);
  const historyResult = await readHistoryLogsForMenuIds([menuId], {
    days,
    limit,
    includeSource: true,
  });

  return createMenuHistoryPayload({
    actor,
    menu,
    logs: historyResult.logs,
    days,
    limit,
    scope: 'menu',
    includesSource: historyResult.includesSource,
  });
}
