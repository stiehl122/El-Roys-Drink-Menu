export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) return res.status(500).json({ error: 'Server misconfigured' });

  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Verify token and get uid
  const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': sbService }
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
  const { id: uid } = await userRes.json();
  if (!uid) return res.status(401).json({ error: 'Invalid token' });

  // Read role + name from profiles
  const roleRes = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${uid}&select=role,name`,
    { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
  );
  if (!roleRes.ok) return res.status(500).json({ error: 'Failed to fetch role' });
  const [profile] = await roleRes.json();
  const role = profile?.role || 'none';

  // For managers, return the list of menu IDs they have explicit access to.
  // Admins have access to all menus — return an empty array (the client treats admin as all-access).
  let accessibleMenuIds = [];
  if (role === 'manager') {
    const accessRes = await fetch(
      `${sbUrl}/rest/v1/menu_access?user_id=eq.${uid}&select=menu_id`,
      { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
    );
    if (accessRes.ok) {
      const rows = await accessRes.json();
      accessibleMenuIds = rows.map(r => r.menu_id);
    }
  }

  res.json({ role, name: profile?.name || '', accessibleMenuIds });
}
