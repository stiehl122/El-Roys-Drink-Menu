import { saveLiveMenuCommand } from './_menu-live.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const result = await saveLiveMenuCommand(req);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || { error: error?.message || 'Failed to save live menu' });
  }
}
