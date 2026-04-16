import {
  createMenuWorkspacePayload,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from '../server/_menu-read.js';
import {
  requireAuthenticatedUser,
  readMenuAccessForUser,
  readProfile,
  requireMenuAccess,
  requireRestaurantSpecialsAccess,
  requireRole,
} from '../server/_auth.js';
import { readRestaurantToolsPayload } from '../server/_restaurant-tools-read.js';
import { readMenuHistoryForRequest } from '../server/_menu-history.js';
import { saveSharedDraftCommand } from '../server/_menu-draft.js';
import { saveLiveMenuCommand } from '../server/_menu-live.js';
import { readAuthorizedMenuActor } from '../server/_menu-write.js';
import { previewMenuUpdateForMenu, publishMenuUpdateForMenu } from '../server/_menu-publish.js';
import { authorizeNotificationRequest } from '../server/_notification-gateway.js';
import { deliverMenuNotification } from '../server/_notification-delivery.js';
import {
  executeRestaurantSpecialsCommand,
  parseSpecialsCommand,
  respondWithSpecialsResult,
} from '../server/_specials-command.js';
import { getSupabaseServerConfig } from '../server/_supabase.js';
import { lookupProductByBarcode } from '../server/_product-lookup.js';
import { parseRequestBody, readAction, readQueryValue } from '../server/_request.js';

const SPECIALS_ACTIONS = new Set(['ensure', 'add', 'remove', 'move', 'note', 'confirm']);

function readIncludeFlags(req) {
  const rawInclude = String(req?.query?.include || readQueryValue(req, 'include') || '').trim();
  return rawInclude ? rawInclude.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) : [];
}

function parsePublishBody(req) {
  const body = parseRequestBody(req);
  return {
    body,
    menuId: String(body?.menu_id || parseMenuId(req) || '').trim(),
    action: String(body?.action || '').trim().toLowerCase(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.method === 'POST' ? parseRequestBody(req) : null;
    const action = readAction(req, body) || (req.method === 'GET' ? 'workspace' : '');

    if (req.method === 'GET') {
      if (action === 'history') {
        return res.json(await readMenuHistoryForRequest(req));
      }

      const menuId = parseMenuId(req);
      if (!isSupportedMenuId(menuId)) {
        return res.status(400).json({ error: 'Unsupported menu_id' });
      }

      const { uid } = await requireAuthenticatedUser(req);
      const profile = await readProfile(uid, { select: 'role,name' });
      const role = profile?.role || 'none';
      if (role !== 'manager' && role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await requireMenuAccess(uid, role, menuId);
      const accessibleMenuIds = role === 'manager'
        ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
        : [];
      const bundle = await readMenuStateBundle(menuId);
      const includeFlags = readIncludeFlags(req);
      let restaurantTools = null;
      if (includeFlags.includes('restaurant-tools') && bundle?.menu?.restaurantId) {
        try {
          await requireRestaurantSpecialsAccess(uid, role, bundle.menu.restaurantId);
          restaurantTools = await readRestaurantToolsPayload({
            restaurantId: bundle.menu.restaurantId,
            currentMenuId: menuId,
          });
        } catch (error) {
          if (error?.status && error.status !== 403) throw error;
        }
      }
      return res.json(createMenuWorkspacePayload(bundle, {
        actor: {
          id: uid,
          name: profile?.name || '',
          role,
          accessibleMenuIds,
        },
        restaurantTools,
      }));
    }

    switch (action) {
      case 'save_draft':
      case 'clear_draft':
        return res.status(200).json(await saveSharedDraftCommand(req));
      case 'save_live':
        return res.status(200).json(await saveLiveMenuCommand(req));
      case 'save_quietly':
      case 'preview_publish':
      case 'publish': {
        const { body, menuId, action: bodyAction } = parsePublishBody(req);
        if (!menuId) return res.status(400).json({ error: 'Missing menu_id' });
        const actor = await readAuthorizedMenuActor(req, menuId);
        const command = (bodyAction === 'preview' || action === 'preview_publish')
          ? previewMenuUpdateForMenu
          : publishMenuUpdateForMenu;
        const result = await command({
          actor,
          menuId,
          mode: action === 'save_quietly' ? 'save' : String(body?.mode || '').trim(),
          source: String(body?.source || '').trim(),
          snapshot: body?.snapshot || {},
          selectedChangeIds: Array.isArray(body?.selected_change_ids)
            ? body.selected_change_ids
            : (Array.isArray(body?.selected_group_ids) ? body.selected_group_ids : null),
          legacySelectedSections: Array.isArray(body?.selected_sections) ? body.selected_sections : [],
          expectedLiveRevision: body?.expected_live_revision ?? null,
          expectedDraftRevision: body?.expected_draft_revision ?? null,
        });
        return res.status(200).json(result);
      }
      case 'specials': {
        const caller = await requireRole(req, 'manager', 'admin');
        const { sbUrl } = getSupabaseServerConfig();
        const command = parseSpecialsCommand({
          ...req,
          body: {
            ...(body || {}),
            action: String(body?.specials_action || body?.specialsAction || body?.action || '').trim().toLowerCase(),
          },
        });
        const result = await executeRestaurantSpecialsCommand({ sbUrl, caller, command });
        return respondWithSpecialsResult(res, result);
      }
      case 'send_notification': {
        const payload = await authorizeNotificationRequest(req);
        const delivery = await deliverMenuNotification(payload.menuId, payload.text);
        return res.status(delivery.status).json({ results: delivery.results });
      }
      case 'product_lookup': {
        await requireRole(req, 'manager', 'admin');
        const barcode = String(body?.barcode || body?.upc || '').trim();
        return res.json(await lookupProductByBarcode(barcode));
      }
      default:
        if (SPECIALS_ACTIONS.has(action)) {
          const caller = await requireRole(req, 'manager', 'admin');
          const { sbUrl } = getSupabaseServerConfig();
          const command = parseSpecialsCommand({
            ...req,
            body: {
              ...(body || {}),
              action,
            },
          });
          const result = await executeRestaurantSpecialsCommand({ sbUrl, caller, command });
          return respondWithSpecialsResult(res, result);
        }
        return res.status(400).json({ error: 'Unsupported manager action' });
    }
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || {
      error: error?.message || 'Server error',
      compatibility: error?.compatibility || null,
      audit: error?.audit || null,
    });
  }
}
