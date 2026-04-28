import {
  createPublicMenuCatalogPayload,
  createPublicMenuPayload,
  getKnownMenus,
  getKnownRestaurants,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from '../server/_menu-read.js';
import { proxyFontFile, proxyFontStylesheet } from '../server/_font-proxy.js';
import { readLandingPageState } from '../server/_landing-page-state.js';
import { getSupabaseServerConfig, readJsonSafe, serviceHeaders } from '../server/_supabase.js';
import { readAction, readQueryValue } from '../server/_request.js';

async function readMenuIndex() {
  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(
    `${sbUrl}/rest/v1/menus?id=in.(${getKnownMenus().map(menu => menu.id).join(',')})&select=id,name,slug,type,restaurant_id,archived&order=name.asc`,
    { headers: serviceHeaders() }
  );
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw { status: response.status || 500, message: payload?.error || payload?.message || 'Failed to load menu index' };
  }
  const menus = await response.json();
  return { menus };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const action = readAction(req) || 'menu';

    if (action === 'landing') {
      return res.json(await readLandingPageState({ includeDraft: false }));
    }

    if (action === 'menu_index' || action === 'catalog') {
      const payload = await readMenuIndex();
      const catalog = createPublicMenuCatalogPayload(payload.menus);
      return res.json({
        menus: catalog.menus,
        restaurants: action === 'catalog' ? catalog.restaurants : getKnownRestaurants(),
        appVersion: catalog.appVersion,
      });
    }

    if (action === 'font_css') {
      const proxied = await proxyFontStylesheet({
        set: String(readQueryValue(req, 'set') || '').trim(),
        font: String(readQueryValue(req, 'font') || '').trim(),
      });
      res.setHeader('Content-Type', proxied.contentType);
      res.setHeader('Cache-Control', proxied.cacheControl);
      return res.status(200).send(proxied.body);
    }

    if (action === 'font_file') {
      const proxied = await proxyFontFile(String(readQueryValue(req, 'url') || '').trim());
      res.setHeader('Content-Type', proxied.contentType);
      res.setHeader('Cache-Control', proxied.cacheControl);
      return res.status(200).send(proxied.body);
    }

    const menuId = parseMenuId(req);
    if (!isSupportedMenuId(menuId)) {
      return res.status(400).json({ error: 'Unsupported menu_id' });
    }
    const bundle = await readMenuStateBundle(menuId);
    return res.json(createPublicMenuPayload(bundle));
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
