import { readMenuHistoryForRequest } from '../server/_menu-history.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const payload = await readMenuHistoryForRequest(req);
    return res.json(payload);
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Failed to load menu history' });
  }
}
