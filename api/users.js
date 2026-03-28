import { requireRole } from './_auth.js';

export default async function handler(req, res) {
  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) return res.status(500).json({ error: 'Server misconfigured' });

  let caller;
  try {
    caller = await requireRole(req, 'admin');
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  if (req.method === 'GET') {
    // Fetch all auth users (for emails)
    const authRes = await fetch(`${sbUrl}/auth/v1/admin/users?per_page=200`, {
      headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` }
    });
    if (!authRes.ok) return res.status(500).json({ error: 'Failed to fetch users' });
    const { users: authUsers } = await authRes.json();

    // Fetch all profiles (name + role)
    const profilesRes = await fetch(`${sbUrl}/rest/v1/profiles?select=id,role,name`, {
      headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` }
    });
    if (!profilesRes.ok) return res.status(500).json({ error: 'Failed to fetch profiles' });
    const profiles = await profilesRes.json();

    // Fetch all menu_access rows
    const accessRes = await fetch(`${sbUrl}/rest/v1/menu_access?select=user_id,menu_id`, {
      headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` }
    });
    if (!accessRes.ok) return res.status(500).json({ error: 'Failed to fetch menu access' });
    const accessRows = await accessRes.json();

    const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    // Build per-user menu access map
    const accessMap = {};
    for (const row of accessRows) {
      if (!accessMap[row.user_id]) accessMap[row.user_id] = [];
      accessMap[row.user_id].push(row.menu_id);
    }

    const users = (authUsers || []).map(u => ({
      id:         u.id,
      email:      u.email,
      name:       profileMap[u.id]?.name  || '',
      role:       profileMap[u.id]?.role  || 'none',
      menuAccess: accessMap[u.id]         || [],
    }));

    return res.json(users);
  }

  if (req.method === 'PATCH') {
    const { userId, role, name, menuAccess } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (role !== undefined && userId === caller.uid) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Update profile fields (role and/or name)
    const profileUpdate = {};
    if (role !== undefined) {
      if (!['none', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      profileUpdate.role = role;
    }
    if (name !== undefined) {
      profileUpdate.name = String(name).trim().slice(0, 100);
    }
    if (Object.keys(profileUpdate).length) {
      const updateRes = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': sbService,
          'Authorization': `Bearer ${sbService}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(profileUpdate),
      });
      if (!updateRes.ok) return res.status(500).json({ error: 'Failed to update profile' });
    }

    // Update menu_access rows if provided
    if (Array.isArray(menuAccess)) {
      // Delete all existing access rows for this user
      const delRes = await fetch(`${sbUrl}/rest/v1/menu_access?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` },
      });
      if (!delRes.ok) return res.status(500).json({ error: 'Failed to update menu access' });

      // Insert new rows
      if (menuAccess.length) {
        const rows = menuAccess.map(menuId => ({ user_id: userId, menu_id: menuId }));
        const insRes = await fetch(`${sbUrl}/rest/v1/menu_access`, {
          method: 'POST',
          headers: {
            'apikey': sbService,
            'Authorization': `Bearer ${sbService}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(rows),
        });
        if (!insRes.ok) return res.status(500).json({ error: 'Failed to insert menu access' });
      }
    }

    if (!Object.keys(profileUpdate).length && !Array.isArray(menuAccess)) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    return res.status(204).end();
  }

  return res.status(405).end();
}
