import { requireMenuAccess, requireRole } from './_auth.js';

export const MAX_NOTIFICATION_TEXT_LENGTH = 1000;

export function truncateNotificationText(text, maxLength = MAX_NOTIFICATION_TEXT_LENGTH) {
  const normalized = String(text || '');
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 16) + '... (truncated)';
}

export async function authorizeNotificationRequest(req, options = {}) {
  const allowedRoles = Array.isArray(options.roles) && options.roles.length
    ? options.roles
    : ['manager', 'admin'];

  const caller = await requireRole(req, ...allowedRoles);
  const menuId = req.body?.menu_id;
  const text = req.body?.text;

  if (!menuId) throw { status: 400, message: 'Missing menu_id' };
  if (!text) throw { status: 400, message: 'Missing text' };

  await requireMenuAccess(caller.uid, caller.role, menuId);

  return {
    caller,
    menuId,
    text: truncateNotificationText(text),
  };
}
