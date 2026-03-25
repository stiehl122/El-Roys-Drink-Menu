import { requireRole } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const fbSecret = process.env.FIREBASE_SECRET;
  if (!fbSecret) return res.status(500).json({ error: 'Server misconfigured' });

  try {
    await requireRole(req, 'manager', 'admin');
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  // Derive Firebase URL from server env — never trust client-supplied URLs
  const fbUrl = (process.env.FIREBASE_URL || '').replace(/\/+$/, '');
  if (!fbUrl) return res.status(500).json({ error: 'Server misconfigured' });

  const { state } = req.body;
  if (state === undefined) return res.status(400).json({ error: 'Missing state' });

  const r = await fetch(`${fbUrl}/menu.json?auth=${fbSecret}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
  if (!r.ok) return res.status(502).json({ error: `Firebase write failed: ${r.status}` });
  res.status(200).end();
}
