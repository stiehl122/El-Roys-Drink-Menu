import { checkHealth } from '../server/_health.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader?.('Allow', 'GET');
    return res.status(405).end();
  }

  const payload = await checkHealth();
  return res.status(payload.ok ? 200 : 503).json(payload);
}
