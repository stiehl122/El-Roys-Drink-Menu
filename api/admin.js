import {
  authorizeAdminSettingsRequest,
  executeAdminSettingsAction,
} from '../server/_admin-settings.js';
import { readLandingPageState, saveLandingPageDraft } from '../server/_landing-page-state.js';
import {
  completeAccountDeletionRequest,
  readAdminCatalog,
  readAdminSettingsContext,
  readAdminReadiness,
  readAdminUsers,
  readAccountDeletionRequests,
  updateAdminUser,
} from '../server/_admin-read-models.js';
import { parseRequestBody, readAction, readQueryValue } from '../server/_request.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  let actor;
  try {
    actor = await authorizeAdminSettingsRequest(req);
  } catch (error) {
    return res.status(error?.status || 500).json({
      ok: false,
      status: 'admin_unauthorized',
      error: error?.message || 'Unauthorized',
      compatibility: error?.compatibility || null,
      audit: error?.audit || null,
    });
  }

  try {
    if (req.method === 'GET') {
      const action = readAction(req);
      switch (action) {
        case 'catalog':
          return res.json(await readAdminCatalog());
        case 'settings_context':
          return res.json(await readAdminSettingsContext({
            menuId: String(readQueryValue(req, 'menu_id') || '').trim(),
            restaurantId: String(readQueryValue(req, 'restaurant_id') || '').trim(),
          }));
        case 'users':
          return res.json(await readAdminUsers());
        case 'landing_page_state':
          return res.json(await readLandingPageState({ includeDraft: true }));
        case 'readiness':
          return res.json(await readAdminReadiness());
        case 'account_deletion_requests':
          return res.json(await readAccountDeletionRequests());
        default:
          return res.status(400).json({ error: 'Unsupported admin action' });
      }
    }

    const body = await parseRequestBody(req);
    const action = readAction(req, body);

    switch (action) {
      case 'save_notifications':
      case 'save_notification_credential_keys':
      case 'save_menu_url':
      case 'save_restaurant_design':
        return res.status(200).json(await executeAdminSettingsAction(action, body, { actor }));
      case 'save_landing_page_draft':
      case 'publish_landing_sections': {
        const result = await saveLandingPageDraft({
          draftContent: body?.draft_content || body?.draftContent || {},
          liveContent: body?.live_content || body?.liveContent || {},
          draftSavedTs: body?.draft_saved_ts ?? body?.draftSavedTs ?? null,
          livePublishedTs: body?.live_published_ts ?? body?.livePublishedTs ?? null,
        });
        return res.json({ ok: true, action, record: result });
      }
      case 'update_user':
        await updateAdminUser(req, body);
        return res.status(204).end();
      case 'complete_account_deletion_request':
        return res.json(await completeAccountDeletionRequest(body?.user_id || body?.userId, actor));
      default:
        return res.status(400).json({ error: 'Unsupported admin action' });
    }
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || {
      ok: false,
      status: 'admin_failed',
      error: error?.message || 'Failed admin request',
      compatibility: error?.compatibility || null,
      audit: error?.audit || null,
    });
  }
}
