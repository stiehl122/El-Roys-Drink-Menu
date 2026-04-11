import { authorizeNotificationRequest } from './_notification-gateway.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) return res.status(500).json({ error: 'GROUPME_BOT_ID not configured' });

  let payload;
  try {
    payload = await authorizeNotificationRequest(req);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const safeText = payload.text;

  const r = await fetch('https://api.groupme.com/v3/bots/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bot_id: botId, text: safeText })
  });
  res.status(r.ok || r.status === 202 ? 202 : r.status).end();
}
