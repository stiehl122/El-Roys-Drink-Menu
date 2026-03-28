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

    const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    const users = (authUsers || []).map(u => ({
      id:    u.id,
      email: u.email,
      name:  profileMap[u.id]?.name || '',
      role:  profileMap[u.id]?.role || 'none',
    }));

    return res.json(users);
  }

  if (req.method === 'PATCH') {
    const { userId, role, name } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (role !== undefined && userId === caller.uid) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const update = {};
    if (role !== undefined) {
      if (!['none', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      update.role = role;
    }
    if (name !== undefined) {
      update.name = String(name).trim().slice(0, 100);
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    const updateRes = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': sbService,
        'Authorization': `Bearer ${sbService}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(update),
    });
    if (!updateRes.ok) return res.status(500).json({ error: 'Failed to update' });
    return res.status(204).end();
  }

  return res.status(405).end();
}
