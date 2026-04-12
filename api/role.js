import {
  readMenuAccessForUser,
  readProfile,
  requireAuthenticatedUser,
} from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { uid } = await requireAuthenticatedUser(req);
    const profile = await readProfile(uid, { select: 'role,name' });
    const role = profile?.role || 'none';

    // For managers, return the list of menu IDs they have explicit access to.
    // Admins have access to all menus — return an empty array (the client treats admin as all-access).
    let accessibleMenuIds = [];
    if (role === 'manager') {
      try {
        const rows = await readMenuAccessForUser(uid, { select: 'menu_id' });
        accessibleMenuIds = rows.map(row => row.menu_id);
      } catch (_) {
        accessibleMenuIds = [];
      }
    }

    return res.json({ role, name: profile?.name || '', accessibleMenuIds });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
