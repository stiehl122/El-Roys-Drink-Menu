import {
  createPublicMenuPayload,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from '../server/_menu-read.js';
import { readRestaurantToolsPayload } from '../server/_restaurant-tools-read.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const menuId = parseMenuId(req);
    if (!isSupportedMenuId(menuId)) {
      return res.status(400).json({ error: 'Unsupported menu_id' });
    }

    const bundle = await readMenuStateBundle(menuId);
    const restaurantTools = await readRestaurantToolsPayload({
      restaurantId: bundle?.menu?.restaurantId || '',
      currentMenuId: menuId,
    });
    return res.json(createPublicMenuPayload(bundle, {
      featuredGroups: restaurantTools.featuredGroups,
      featuredCompatibility: restaurantTools.compatibility,
    }));
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
