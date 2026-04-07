// Shared auth helper — Vercel ignores files prefixed with _ as API endpoints.

const RESTAURANT_SPECIALS = {
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
  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) throw { status: 500, message: 'Server misconfigured' };

  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) throw { status: 401, message: 'Unauthorized' };

  // Verify token and get uid
  const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': sbService }
  });
  if (!userRes.ok) throw { status: 401, message: 'Invalid token' };
  const { id: uid } = await userRes.json();
  if (!uid) throw { status: 401, message: 'Invalid token' };

  // Check role
  const roleRes = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${uid}&select=role`,
    { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
  );
  if (!roleRes.ok) throw { status: 500, message: 'Failed to fetch role' };
  const [profile] = await roleRes.json();
  if (!roles.includes(profile?.role)) throw { status: 403, message: 'Forbidden' };

  return { uid, role: profile.role };
}

export async function requireMenuAccess(uid, role, menuId) {
  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) throw { status: 500, message: 'Server misconfigured' };
  if (!menuId) throw { status: 400, message: 'Missing menu_id' };
  if (role === 'admin') return;

  const accessRes = await fetch(
    `${sbUrl}/rest/v1/menu_access?user_id=eq.${uid}&menu_id=eq.${menuId}&select=menu_id&limit=1`,
    { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
  );
  if (!accessRes.ok) throw { status: 500, message: 'Failed to verify menu access' };
  const rows = await accessRes.json();
  if (!rows.length) throw { status: 403, message: 'Forbidden' };
}

export function getRestaurantSpecialConfig(restaurantId) {
  return restaurantId ? RESTAURANT_SPECIALS[restaurantId] || null : null;
}

export async function requireRestaurantSpecialsAccess(uid, role, restaurantId) {
  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) throw { status: 500, message: 'Server misconfigured' };
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!config) throw { status: 400, message: 'Unsupported restaurant' };
  if (role === 'admin') return config;

  const accessRes = await fetch(
    `${sbUrl}/rest/v1/menu_access?user_id=eq.${uid}&menu_id=in.(${config.menuIds.join(',')})&select=menu_id`,
    { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
  );
  if (!accessRes.ok) throw { status: 500, message: 'Failed to verify specials access' };
  const rows = await accessRes.json();
  const accessibleMenuIds = new Set(rows.map(row => row.menu_id));
  if (!config.menuIds.every(menuId => accessibleMenuIds.has(menuId))) {
    throw { status: 403, message: 'Forbidden' };
  }
  return config;
}
