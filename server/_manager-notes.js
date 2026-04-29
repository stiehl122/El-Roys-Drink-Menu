import {
  readProfile,
  requireAuthenticatedUser,
  requireMenuAccess,
} from './_auth.js';
import { isSupportedMenuId } from './_menu-read.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';

function asString(value) {
  return value == null ? '' : String(value);
}

function createActor(uid, profile = {}) {
  return {
    id: String(uid || ''),
    name: String(profile?.name || '').trim(),
    role: String(profile?.role || 'none').trim() || 'none',
  };
}

async function readAuthorizedNotesActor(req, menuId) {
  if (!isSupportedMenuId(menuId)) throw { status: 400, message: 'Unsupported menu_id' };

  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  if (role !== 'manager' && role !== 'admin') throw { status: 403, message: 'Forbidden' };
  await requireMenuAccess(uid, role, menuId);
  return createActor(uid, profile);
}

export function createManagerNotePayload(row = null) {
  return {
    note: asString(row?.note),
    updated_at: asString(row?.updated_at),
    updated_by: asString(row?.updated_by),
  };
}

export function normalizeManagerNoteBody(body = {}) {
  return {
    menuId: String(body?.menu_id || body?.menuId || '').trim(),
    note: String(body?.note ?? ''),
  };
}

export async function readManagerNoteForMenu(menuId) {
  const normalizedMenuId = String(menuId || '').trim();
  if (!isSupportedMenuId(normalizedMenuId)) throw { status: 400, message: 'Unsupported menu_id' };

  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(
    `${sbUrl}/rest/v1/menu_manager_notes?menu_id=eq.${encodeURIComponent(normalizedMenuId)}&select=note%2Cupdated_at%2Cupdated_by&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw { status: 500, message: getApiErrorMessage(payload, 'Failed to read manager note') };
  }

  const rows = await response.json();
  return createManagerNotePayload(Array.isArray(rows) ? rows[0] : null);
}

export async function readManagerNoteCommand(req, menuId) {
  const normalizedMenuId = String(menuId || '').trim();
  const actor = await readAuthorizedNotesActor(req, normalizedMenuId);
  const note = await readManagerNoteForMenu(normalizedMenuId);
  return { actor, note };
}

export async function writeManagerNoteCommand(req, body = {}) {
  const { menuId, note } = normalizeManagerNoteBody(body);
  const actor = await readAuthorizedNotesActor(req, menuId);
  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/rest/v1/menu_manager_notes?on_conflict=menu_id`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    }),
    body: JSON.stringify({
      menu_id: menuId,
      note,
      updated_at: new Date().toISOString(),
      updated_by: actor.id || null,
    }),
  });
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw { status: 500, message: getApiErrorMessage(payload, 'Failed to save manager note') };
  }

  const rows = await response.json();
  return {
    actor,
    note: createManagerNotePayload(Array.isArray(rows) ? rows[0] : null),
  };
}
