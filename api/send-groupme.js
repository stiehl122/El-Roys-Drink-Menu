import { requireMenuAccess, requireRole } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) return res.status(500).json({ error: 'GROUPME_BOT_ID not configured' });

  let caller;
  try {
    caller = await requireRole(req, 'manager', 'admin');
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const { text, menu_id } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  if (!menu_id) return res.status(400).json({ error: 'Missing menu_id' });

  try {
    await requireMenuAccess(caller.uid, caller.role, menu_id);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

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
