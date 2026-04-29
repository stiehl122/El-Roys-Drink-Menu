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
} from '../server/_auth.js';
import { readMenuHistoryForRequest } from '../server/_menu-history.js';
import { saveSharedDraftCommand } from '../server/_menu-draft.js';
import { saveLiveMenuCommand } from '../server/_menu-live.js';
import { readAuthorizedMenuActor } from '../server/_menu-write.js';
import { previewMenuUpdateForMenu, publishMenuUpdateForMenu } from '../server/_menu-publish.js';
import { authorizeNotificationRequest } from '../server/_notification-gateway.js';
import { deliverMenuNotification } from '../server/_notification-delivery.js';
import { lookupProductByBarcode } from '../server/_product-lookup.js';
import { previewUntappdBeerImport, searchUntappdBeers } from '../server/_untappd.js';
import { parseRequestBody, readAction } from '../server/_request.js';
import { checkManagerExternalActionLimit } from '../server/_manager-action-limits.js';
import { readManagerNoteCommand, writeManagerNoteCommand } from '../server/_manager-notes.js';

async function parsePublishBody(req) {
  const body = await parseRequestBody(req);
  return {
    body,
    menuId: String(body?.menu_id || parseMenuId(req) || '').trim(),
    action: String(body?.action || '').trim().toLowerCase(),
  };
}

async function authorizeExternalLookup(req, body, action) {
  const menuId = String(body?.menu_id || body?.menuId || '').trim();
  if (!isSupportedMenuId(menuId)) throw { status: 400, message: 'Unsupported menu_id' };

  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role' });
  const role = profile?.role || 'none';
  if (role !== 'manager' && role !== 'admin') throw { status: 403, message: 'Forbidden' };
  await requireMenuAccess(uid, role, menuId);

  const limited = checkManagerExternalActionLimit(req, action);
  if (limited) throw limited;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.method === 'POST' ? await parseRequestBody(req) : null;
    const action = readAction(req, body) || (req.method === 'GET' ? 'workspace' : '');

    if (req.method === 'GET') {
      if (action === 'history') {
        return res.json(await readMenuHistoryForRequest(req));
      }
      if (action === 'notes_read') {
        return res.json(await readManagerNoteCommand(req, parseMenuId(req)));
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
      return res.json(createMenuWorkspacePayload(bundle, {
        actor: {
          id: uid,
          name: profile?.name || '',
          role,
          accessibleMenuIds,
        },
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
        const { body: publishBody, menuId, action: bodyAction } = await parsePublishBody(req);
        if (!menuId) return res.status(400).json({ error: 'Missing menu_id' });
        const hasLegacySelectedSections = Object.prototype.hasOwnProperty.call(publishBody || {}, 'selected_sections');
        const actor = await readAuthorizedMenuActor(req, menuId);
        const command = (bodyAction === 'preview' || action === 'preview_publish')
          ? previewMenuUpdateForMenu
          : publishMenuUpdateForMenu;
        const result = await command({
          actor,
          menuId,
          mode: action === 'save_quietly' ? 'save' : String(publishBody?.mode || '').trim(),
          source: String(publishBody?.source || '').trim(),
          snapshot: publishBody?.snapshot || {},
          selectedChangeIds: Array.isArray(publishBody?.selected_change_ids)
            ? publishBody.selected_change_ids
            : (Array.isArray(publishBody?.selected_group_ids) ? publishBody.selected_group_ids : null),
          legacySelectedSections: hasLegacySelectedSections
            ? (Array.isArray(publishBody?.selected_sections) ? publishBody.selected_sections : [])
            : null,
          expectedLiveRevision: publishBody?.expected_live_revision ?? null,
          expectedDraftRevision: publishBody?.expected_draft_revision ?? null,
          expectedNotificationRevision: publishBody?.expected_notification_revision ?? null,
        });
        return res.status(200).json(result);
      }
      case 'send_notification': {
        const payload = await authorizeNotificationRequest(req);
        const delivery = await deliverMenuNotification(payload.menuId, payload.text);
        return res.status(delivery.status).json({ results: delivery.results });
      }
      case 'product_lookup': {
        await authorizeExternalLookup(req, body, action);
        const barcode = String(body?.barcode || body?.upc || '').trim();
        return res.json(await lookupProductByBarcode(barcode));
      }
      case 'untappd_search': {
        await authorizeExternalLookup(req, body, action);
        const query = String(body?.query || body?.q || '').trim();
        return res.json({ beers: await searchUntappdBeers(query) });
      }
      case 'untappd_preview': {
        await authorizeExternalLookup(req, body, action);
        const bid = String(body?.bid || body?.beer_id || '').trim();
        const includeBrewery = Boolean(body?.includeBrewery || body?.include_brewery);
        return res.json({
          preview: await previewUntappdBeerImport(bid, { includeBrewery }),
        });
      }
      case 'notes_write':
        return res.status(200).json(await writeManagerNoteCommand(req, body));
      default:
        return res.status(400).json({ error: 'Unsupported manager action' });
    }
  } catch (error) {
    if (error?.headers && typeof res.setHeader === 'function') {
      for (const [key, value] of Object.entries(error.headers)) {
        res.setHeader(key, value);
      }
    }
    return res.status(error?.status || 500).json(error?.body || {
      error: error?.message || 'Server error',
      compatibility: error?.compatibility || null,
      audit: error?.audit || null,
    });
  }
}
