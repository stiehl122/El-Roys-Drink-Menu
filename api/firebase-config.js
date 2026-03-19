export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fbSecret  = process.env.FIREBASE_SECRET;
  if (!sbUrl || !sbService || !fbSecret) return res.status(500).json({ error: 'Server misconfigured' });

  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Verify token and get uid
  const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': sbService }
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
  const { id: uid } = await userRes.json();
  if (!uid) return res.status(401).json({ error: 'Invalid token' });

  // Read role with service key (bypasses RLS)
  const roleRes = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${uid}&select=role`,
    { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
  );
  const [profile] = await roleRes.json();
  const role = profile?.role || 'none';
  if (role !== 'manager' && role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  res.json({ fbSecret: process.env.FIREBASE_SECRET });
}
