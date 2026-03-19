export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) return res.status(500).json({ error: 'GROUPME_BOT_ID is not configured' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  const response = await fetch('https://api.groupme.com/v3/bots/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bot_id: botId, text })
  });

  res.status(response.ok || response.status === 202 ? 202 : response.status).end();
}
