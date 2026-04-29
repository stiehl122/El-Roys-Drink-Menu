import {
  createPublicMenuCatalogPayload,
  createPublicMenuPayload,
  getKnownMenus,
  getKnownRestaurants,
  isSupportedMenuId,
  parseMenuId,
  readPublicMenuRevision,
  readMenuStateBundle,
} from '../server/_menu-read.js';
import '../core/domain/constants.js';
import { proxyFontFile, proxyFontStylesheet } from '../server/_font-proxy.js';
import { readLandingPageState } from '../server/_landing-page-state.js';
import {
  applyPublicJsonCacheHeaders,
  buildPublicJsonCacheHeaders,
  buildPublicJsonPayloadRevision,
  isPublicJsonNotModified,
} from '../server/_public-cache.js';
import { getSupabaseServerConfig, readJsonSafe, serviceHeaders } from '../server/_supabase.js';
import { readAction, readQueryValue } from '../server/_request.js';

const domainConstants = (globalThis.__HF_DOMAIN_CONSTANTS__ && typeof globalThis.__HF_DOMAIN_CONSTANTS__ === 'object')
  ? globalThis.__HF_DOMAIN_CONSTANTS__
  : {};
const APP_VERSION = domainConstants.APP_VERSION || 'dev';

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

function sendCachedJson(req, res, action, revision, payload) {
  const headers = buildPublicJsonCacheHeaders({ action, revision, appVersion: APP_VERSION });
  applyPublicJsonCacheHeaders(res, headers);
  if (isPublicJsonNotModified(req, headers)) {
    return res.status(304).end();
  }
  return res.json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const action = readAction(req) || 'menu';

    if (action === 'landing') {
      const payload = await readLandingPageState({ includeDraft: false });
      return sendCachedJson(req, res, 'landing', buildPublicJsonPayloadRevision(payload), payload);
    }

    if (action === 'menu_index' || action === 'catalog') {
      const payload = await readMenuIndex();
      const catalog = createPublicMenuCatalogPayload(payload.menus);
      const responsePayload = {
        menus: catalog.menus,
        restaurants: action === 'catalog' ? catalog.restaurants : getKnownRestaurants(),
        appVersion: catalog.appVersion,
      };
      return sendCachedJson(req, res, action, buildPublicJsonPayloadRevision(responsePayload), responsePayload);
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

    if (action === 'revision') {
      const menuId = parseMenuId(req);
      if (!isSupportedMenuId(menuId)) {
        return res.status(400).json({ error: 'Unsupported menu_id' });
      }
      const revision = await readPublicMenuRevision(menuId);
      return sendCachedJson(req, res, 'revision', buildPublicJsonPayloadRevision(revision), revision);
    }

    const menuId = parseMenuId(req);
    if (!isSupportedMenuId(menuId)) {
      return res.status(400).json({ error: 'Unsupported menu_id' });
    }
    const bundle = await readMenuStateBundle(menuId);
    const payload = createPublicMenuPayload(bundle);
    return sendCachedJson(req, res, 'menu', buildPublicJsonPayloadRevision(payload), payload);
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
