import {
  readMenuAccessForUser,
  readProfile,
  requireAuthenticatedUser,
} from '../server/_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const configMode = (url.searchParams.get('mode') || url.searchParams.get('kind') || '') === 'config'
    || url.pathname.endsWith('/config');

  if (configMode) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.json({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    });
  }

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
