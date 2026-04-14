import {
  createMenuWorkspacePayload,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from '../server/_menu-read.js';
import {
  requireAuthenticatedUser,
  readMenuAccessForUser,
  readProfile,
  requireMenuAccess,
  requireRestaurantSpecialsAccess,
} from '../server/_auth.js';
import { readRestaurantToolsPayload } from '../server/_restaurant-tools-read.js';

function readIncludeFlags(req) {
  const rawInclude = String(req?.query?.include || '').trim();
  if (rawInclude) {
    return rawInclude.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  }
  try {
    const url = new URL(req?.url || '/', 'http://localhost');
    return String(url.searchParams.get('include') || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const menuId = parseMenuId(req);
    if (!isSupportedMenuId(menuId)) {
      return res.status(400).json({ error: 'Unsupported menu_id' });
    }

    const { uid } = await requireAuthenticatedUser(req);
    const profile = await readProfile(uid, { select: 'role,name' });
    const role = profile?.role || 'none';
    if (role !== 'manager' && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await requireMenuAccess(uid, role, menuId);
    const accessibleMenuIds = role === 'manager'
      ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
      : [];
    const bundle = await readMenuStateBundle(menuId);
    const includeFlags = readIncludeFlags(req);
    let restaurantTools = null;
    if (includeFlags.includes('restaurant-tools') && bundle?.menu?.restaurantId) {
      try {
        await requireRestaurantSpecialsAccess(uid, role, bundle.menu.restaurantId);
        restaurantTools = await readRestaurantToolsPayload({
          restaurantId: bundle.menu.restaurantId,
          currentMenuId: menuId,
        });
      } catch (error) {
        if (error?.status && error.status !== 403) throw error;
      }
    }
    return res.json(createMenuWorkspacePayload(bundle, {
      actor: {
        id: uid,
        name: profile?.name || '',
        role,
        accessibleMenuIds,
      },
      restaurantTools,
    }));
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
