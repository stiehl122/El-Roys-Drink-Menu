export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const botId     = process.env.GROUPME_BOT_ID;
  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!botId) return res.status(500).json({ error: 'GROUPME_BOT_ID not configured' });

  // Verify token
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token || !sbUrl || !sbService) return res.status(401).json({ error: 'Unauthorized' });

  // Get user from token
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

  // Forward to GroupMe
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  const MAX_LEN = 1000;
  const safeText = text.length > MAX_LEN
    ? text.slice(0, MAX_LEN - 16) + '... (truncated)'
    : text;

  const r = await fetch('https://api.groupme.com/v3/bots/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bot_id: botId, text: safeText })
  });
  res.status(r.ok || r.status === 202 ? 202 : r.status).end();
}
