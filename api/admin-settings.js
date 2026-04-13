import {
  authorizeAdminSettingsRequest,
  executeAdminSettingsAction,
} from '../server/_admin-settings.js';

function parseRequestBody(req) {
  const incoming = req?.body;
  if (!incoming) return {};
  if (typeof incoming === 'string') {
    try {
      const parsed = JSON.parse(incoming);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      throw { status: 400, message: 'Invalid JSON body' };
    }
  }
  return incoming && typeof incoming === 'object' ? incoming : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let caller;
  let body;
  try {
    caller = await authorizeAdminSettingsRequest(req);
    body = parseRequestBody(req);
  } catch (error) {
    return res.status(error?.status || 500).json({
      ok: false,
      status: 'admin_settings_unauthorized',
      error: error?.message || 'Unauthorized',
      compatibility: error?.compatibility || null,
      audit: error?.audit || null,
    });
  }

  const action = String(body?.action || '').trim();
  if (!action) {
    return res.status(400).json({
      ok: false,
      status: 'admin_settings_invalid_request',
      error: 'Missing action',
    });
  }

  try {
    const result = await executeAdminSettingsAction(action, body, { actor: caller });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.status || 500).json(error?.body || {
      ok: false,
      status: 'admin_settings_failed',
      error: error?.message || 'Failed to save admin settings',
      compatibility: error?.compatibility || null,
      audit: error?.audit || null,
    });
  }
}
