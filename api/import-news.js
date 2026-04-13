import { requireRole } from './_auth.js';
import { importNewsFromUrl, readRequestJson } from './_landing-import.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireRole(req, 'admin');
    const body = await readRequestJson(req);
    const result = await importNewsFromUrl(body?.url || '');
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'News import failed' });
  }
}
