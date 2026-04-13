import {
  createPublicMenuPayload,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from './_menu-read.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const menuId = parseMenuId(req);
    if (!isSupportedMenuId(menuId)) {
      return res.status(400).json({ error: 'Unsupported menu_id' });
    }

    return res.json(createPublicMenuPayload(await readMenuStateBundle(menuId)));
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
