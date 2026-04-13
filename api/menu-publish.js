import { readAuthorizedMenuActor } from './_menu-write.js';
import { publishMenuUpdateForMenu } from './_menu-publish.js';

function parseBody(req) {
  const body = req?.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_) {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = parseBody(req);
  const menuId = String(body?.menu_id || '').trim();
  if (!menuId) return res.status(400).json({ error: 'Missing menu_id' });

  let actor;
  try {
    actor = await readAuthorizedMenuActor(req, menuId);
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || { error: error?.message || 'Unauthorized' });
  }

  try {
    const result = await publishMenuUpdateForMenu({
      actor,
      menuId,
      mode: String(body?.mode || '').trim(),
      snapshot: body?.snapshot || {},
      selectedSections: Array.isArray(body?.selected_sections) ? body.selected_sections : [],
      patchMessage: String(body?.patch_message || ''),
      previewDiff: Array.isArray(body?.preview_diff) ? body.preview_diff : [],
      expectedLiveRevision: body?.expected_live_revision ?? null,
      expectedDraftRevision: body?.expected_draft_revision ?? null,
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || {
      ok: false,
      status: 'menu_publish_failed',
      error: error?.message || 'Failed to publish menu update',
      compatibility: error?.compatibility || null,
    });
  }
}
