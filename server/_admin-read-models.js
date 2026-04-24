import { requireRole } from './_auth.js';
import { getApiErrorMessage, getSupabaseServerConfig, readJsonSafe, serviceHeaders } from './_supabase.js';
import { getKnownRestaurants, sortKnownMenus } from './_menu-read-compat.js';

async function fetchJsonOrThrow(url, fallbackMessage) {
  const response = await fetch(url, { headers: serviceHeaders() });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw { status: response.status || 500, message: getApiErrorMessage(payload, fallbackMessage) };
}

function sortKnownRestaurants(restaurants = []) {
  const knownOrder = getKnownRestaurants().map(restaurant => restaurant.id);
  return restaurants.slice().sort((a, b) => knownOrder.indexOf(a.id) - knownOrder.indexOf(b.id));
}

export async function readAdminCatalog() {
  const { sbUrl } = getSupabaseServerConfig();
  const [restaurants, allMenus] = await Promise.all([
    fetchJsonOrThrow(
      `${sbUrl}/rest/v1/restaurants?select=id,name,slug,use_custom_design,notifications_config&order=name.asc`,
      'Failed to load restaurants'
    ),
    fetchJsonOrThrow(
      `${sbUrl}/rest/v1/menus?select=id,name,slug,type,restaurant_id,archived&order=name.asc`,
      'Failed to load menus'
    ),
  ]);
  return {
    restaurants: sortKnownRestaurants(Array.isArray(restaurants) ? restaurants : []),
    allMenus: sortKnownMenus(Array.isArray(allMenus) ? allMenus : []),
  };
}

export async function readAdminSettingsContext({ menuId = '', restaurantId = '' } = {}) {
  const { sbUrl } = getSupabaseServerConfig();
  const payload = {
    notifications: {},
    menu_url: '',
    notifications_config: {},
  };

  if (menuId) {
    const rows = await fetchJsonOrThrow(
      `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}&select=notifications&limit=1`,
      'Failed to load menu notifications'
    );
    payload.notifications = rows?.[0]?.notifications || {};
    payload.menu_url = String(payload.notifications?.menu_url || '').trim();
  }

  if (restaurantId) {
    const rows = await fetchJsonOrThrow(
      `${sbUrl}/rest/v1/restaurants?id=eq.${restaurantId}&select=notifications_config&limit=1`,
      'Failed to load restaurant notification credentials'
    );
    payload.notifications_config = rows?.[0]?.notifications_config || {};
  }

  return payload;
}

export async function readAdminReadiness() {
  const { sbUrl, sbService } = getSupabaseServerConfig();
  let connected = false;
  let statusCode = 0;
  try {
    const response = await fetch(`${sbUrl}/rest/v1/restaurants?select=id&limit=1`, {
      headers: serviceHeaders({}, sbService),
    });
    statusCode = response.status || 0;
    connected = response.ok;
  } catch (_) {
    connected = false;
  }

  return {
    connected,
    statusCode,
    hasSupabaseConfig: !!(sbUrl && sbService),
  };
}

export async function readAdminUsers() {
  const { sbUrl, sbService } = getSupabaseServerConfig();

  const authRes = await fetch(`${sbUrl}/auth/v1/admin/users?per_page=200`, {
    headers: serviceHeaders({}, sbService),
  });
  if (!authRes.ok) throw { status: 500, message: 'Failed to fetch users' };
  const { users: authUsers } = await authRes.json();

  const profilesRes = await fetch(`${sbUrl}/rest/v1/profiles?select=id,role,name`, {
    headers: serviceHeaders({}, sbService),
  });
  if (!profilesRes.ok) throw { status: 500, message: 'Failed to fetch profiles' };
  const profiles = await profilesRes.json();

  const accessRes = await fetch(`${sbUrl}/rest/v1/menu_access?select=user_id,menu_id`, {
    headers: serviceHeaders({}, sbService),
  });
  if (!accessRes.ok) throw { status: 500, message: 'Failed to fetch menu access' };
  const accessRows = await accessRes.json();

  const profileMap = Object.fromEntries((profiles || []).map(profile => [profile.id, profile]));
  const accessMap = {};
  for (const row of accessRows || []) {
    if (!accessMap[row.user_id]) accessMap[row.user_id] = [];
    accessMap[row.user_id].push(row.menu_id);
  }

  return (authUsers || []).map(user => ({
    id: user.id,
    email: user.email,
    name: profileMap[user.id]?.name || '',
    role: profileMap[user.id]?.role || 'none',
    menuAccess: accessMap[user.id] || [],
  }));
}

export async function updateAdminUser(req, payload = {}) {
  const { sbUrl, sbService } = getSupabaseServerConfig();
  const caller = await requireRole(req, 'admin');
  const { userId, role, name, menuAccess } = payload || {};
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw { status: 400, message: 'userId required' };

  if (role !== undefined && normalizedUserId === caller.uid) {
    throw { status: 400, message: 'Cannot change your own role' };
  }

  const hasRoleUpdate = role !== undefined;
  const hasNameUpdate = name !== undefined;
  const hasMenuAccessUpdate = Array.isArray(menuAccess);
  let normalizedRole = null;
  if (role !== undefined) {
    normalizedRole = String(role || 'manager').trim() || 'manager';
    if (!['none', 'manager', 'admin'].includes(normalizedRole)) {
      throw { status: 400, message: 'Invalid role' };
    }
  }

  if (!hasRoleUpdate && !hasNameUpdate && !hasMenuAccessUpdate) {
    throw { status: 400, message: 'Nothing to update' };
  }

  const response = await fetch(`${sbUrl}/rest/v1/rpc/update_user_profile_and_menu_access`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }, sbService),
    body: JSON.stringify({
      target_user_id: normalizedUserId,
      target_full_name: hasNameUpdate ? String(name || '').trim().slice(0, 100) : null,
      target_role: normalizedRole,
      target_menu_ids: hasMenuAccessUpdate
        ? menuAccess.map(menuId => String(menuId || '').trim()).filter(Boolean)
        : null,
    }),
  });

  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw {
      status: response.status || 500,
      message: getApiErrorMessage(payload, 'Failed to update user access'),
    };
  }

  return { ok: true };
}
