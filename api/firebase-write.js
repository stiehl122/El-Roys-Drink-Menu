export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

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

  // Check role
  const roleRes = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${uid}&select=role`,
    { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
  );
  if (!roleRes.ok) return res.status(500).json({ error: 'Failed to fetch role' });
  const [profile] = await roleRes.json();
  if (profile?.role !== 'manager' && profile?.role !== 'admin')
    return res.status(403).json({ error: 'Forbidden' });

  // Write to Firebase
  const { fbUrl, state } = req.body;
  if (!fbUrl || state === undefined) return res.status(400).json({ error: 'Missing fbUrl or state' });

  const r = await fetch(`${fbUrl}/menu.json?auth=${fbSecret}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
  if (!r.ok) return res.status(502).json({ error: `Firebase write failed: ${r.status}` });
  res.status(200).end();
}
