// Shared auth helper — Vercel ignores files prefixed with _ as API endpoints.

import '../core/domain/constants.js';

const domainConstants = (globalThis.__HF_DOMAIN_CONSTANTS__ && typeof globalThis.__HF_DOMAIN_CONSTANTS__ === 'object')
  ? globalThis.__HF_DOMAIN_CONSTANTS__
  : {};
const RESTAURANT_SPECIALS = domainConstants.RESTAURANT_SPECIALS || buildFallbackRestaurantSpecials();

function buildFallbackRestaurantSpecials() {
  return {
    '00000000-0000-0000-0000-000000000010': {
      canonicalId: 'leroyslounge-specials',
      name: "Leroy's Specials",
      menuIds: [
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000021',
      ],
    },
    '00000000-0000-0000-0000-000000000001': {
      canonicalId: 'elroyscantina-specials',
      name: "El Roy's Specials",
      menuIds: [
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
      ],
    },
  };
}

function getSupabaseServerConfig() {
  const sbUrl = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) throw { status: 500, message: 'Server misconfigured' };
  return { sbUrl, sbService };
}

function serviceHeaders(sbService, extra = {}) {
  return {
    apikey: sbService,
    Authorization: `Bearer ${sbService}`,
    ...extra,
  };
}

export async function requireAuthenticatedUser(req) {
  const { sbUrl, sbService } = getSupabaseServerConfig();
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) throw { status: 401, message: 'Unauthorized' };

  const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: sbService },
  });
  if (!userRes.ok) throw { status: 401, message: 'Invalid token' };
  const { id: uid } = await userRes.json();
  if (!uid) throw { status: 401, message: 'Invalid token' };

  return { uid, token, sbUrl, sbService };
}

export async function readProfile(uid, options = {}) {
  const { sbUrl, sbService } = getSupabaseServerConfig();
  const select = options.select || 'role,name';
  const profileRes = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${uid}&select=${select}`,
    { headers: serviceHeaders(sbService) }
  );
  if (!profileRes.ok) throw { status: 500, message: 'Failed to fetch role' };
  const [profile] = await profileRes.json();
  return profile || null;
}

export async function readMenuAccessForUser(uid, options = {}) {
  const { sbUrl, sbService } = getSupabaseServerConfig();
  const select = options.select || 'menu_id';
  const menuIds = Array.isArray(options.menuIds) ? options.menuIds.filter(Boolean) : [];
  const query = menuIds.length
    ? `${sbUrl}/rest/v1/menu_access?user_id=eq.${uid}&menu_id=in.(${menuIds.join(',')})&select=${select}`
    : `${sbUrl}/rest/v1/menu_access?user_id=eq.${uid}&select=${select}`;
  const accessRes = await fetch(query, { headers: serviceHeaders(sbService) });
  if (!accessRes.ok) throw { status: 500, message: 'Failed to verify menu access' };
  return accessRes.json();
}

/**
 * Verifies the Bearer token in the Authorization header and checks that the
 * caller's role is one of the allowed roles.
 *
 * @param {import('http').IncomingMessage} req
 * @param {...string} roles - Allowed roles (e.g. 'manager', 'admin')
 * @returns {Promise<{uid: string, role: string}>}
 * @throws {{status: number, message: string}} on auth failure
 */
export async function requireRole(req, ...roles) {
  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role' });
  if (!roles.includes(profile?.role)) throw { status: 403, message: 'Forbidden' };

  return { uid, role: profile.role };
}

export async function requireMenuAccess(uid, role, menuId) {
  getSupabaseServerConfig();
  if (!menuId) throw { status: 400, message: 'Missing menu_id' };
  if (role === 'admin') return;

  const rows = await readMenuAccessForUser(uid, { menuIds: [menuId] });
  if (!rows.length) throw { status: 403, message: 'Forbidden' };
}

export function getRestaurantSpecialConfig(restaurantId) {
  return restaurantId ? RESTAURANT_SPECIALS[restaurantId] || null : null;
}

export async function requireRestaurantSpecialsAccess(uid, role, restaurantId) {
  getSupabaseServerConfig();
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!config) throw { status: 400, message: 'Unsupported restaurant' };
  if (role === 'admin') return config;

  const rows = await readMenuAccessForUser(uid, { menuIds: config.menuIds });
  const accessibleMenuIds = new Set(rows.map(row => row.menu_id));
  if (!config.menuIds.every(menuId => accessibleMenuIds.has(menuId))) {
    throw { status: 403, message: 'Forbidden' };
  }
  return config;
}
