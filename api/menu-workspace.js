import {
  createMenuWorkspacePayload,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from './_menu-read.js';
import {
  requireAuthenticatedUser,
  readMenuAccessForUser,
  readProfile,
  requireMenuAccess,
} from './_auth.js';

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
    return res.json(createMenuWorkspacePayload(await readMenuStateBundle(menuId), {
      actor: {
        id: uid,
        name: profile?.name || '',
        role,
        accessibleMenuIds,
      },
    }));
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
