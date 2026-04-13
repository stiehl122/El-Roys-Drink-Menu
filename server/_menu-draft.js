import {
  requireAuthenticatedUser,
  readProfile,
  requireMenuAccess,
} from './_auth.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';
import { isSupportedMenuId } from './_menu-read.js';
import {
  assertExpectedRevision,
  readMenuMeta,
  readRevisionState,
} from './_menu-write.js';

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
  if (typeof body === 'object') return body;
  return {};
}

function parseMenuIdFromRequest(req, body = {}) {
  if (body?.menu_id) return String(body.menu_id);
  if (req?.query?.menu_id) return String(req.query.menu_id);
  const requestUrl = req?.url || '';
  try {
    const url = new URL(requestUrl, 'http://localhost');
    return url.searchParams.get('menu_id') || '';
  } catch (_) {
    return '';
  }
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return {};
  return snapshot;
}

function normalizeSavedAt(candidate) {
  const asNumber = Number(candidate);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.trunc(asNumber);
  return Date.now();
}

function hasSharedDraft(snapshot = {}) {
  return Object.keys(snapshot).length > 0;
}

function isMissingColumnIssue(payload, columnName) {
  const message = `${payload?.error || payload?.message || payload?.hint || payload?.details || ''}`.toLowerCase();
  return message.includes(columnName.toLowerCase()) &&
    (message.includes('column') || message.includes('schema cache'));
}

function isDraftMigrationMissing(payload) {
  return isMissingColumnIssue(payload, 'draft_state') || isMissingColumnIssue(payload, 'draft_saved_ts');
}

export function parseDraftCommand(req) {
  const body = parseBody(req);
  return {
    menuId: parseMenuIdFromRequest(req, body),
    snapshot: normalizeSnapshot(body?.snapshot),
    savedAt: normalizeSavedAt(body?.saved_at),
    expectedDraftRevision: body?.expected_draft_revision ?? body?.expectedDraftRevision ?? null,
    usedClientSavedAt: Number.isFinite(Number(body?.saved_at)) && Number(body?.saved_at) > 0,
  };
}

export async function saveSharedDraftCommand(req) {
  const command = parseDraftCommand(req);
  const {
    menuId,
    snapshot,
    savedAt,
    expectedDraftRevision,
  } = command;
  if (!isSupportedMenuId(menuId)) throw { status: 400, message: 'Unsupported menu_id' };

  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  if (role !== 'manager' && role !== 'admin') throw { status: 403, message: 'Forbidden' };
  await requireMenuAccess(uid, role, menuId);

  const meta = await readMenuMeta(menuId);
  assertExpectedRevision(expectedDraftRevision, meta?.draft_saved_ts || null, 'draft_revision', {
    menuId,
    command: 'menu-draft.v1',
    currentRevisions: readRevisionState(meta),
  });

  const { sbUrl } = getSupabaseServerConfig();
  const patchRes = await fetch(
    `${sbUrl}/rest/v1/menu_meta?on_conflict=menu_id&select=menu_id,draft_state,draft_saved_ts`,
    {
      method: 'POST',
      headers: serviceHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify({
        menu_id: menuId,
        draft_state: snapshot,
        draft_saved_ts: savedAt,
      }),
    }
  );

  if (!patchRes.ok) {
    const payload = await readJsonSafe(patchRes);
    if (isDraftMigrationMissing(payload)) {
      throw {
        status: 409,
        message: 'Save Draft requires the latest Supabase draft-state migration before it can persist shared drafts.',
        compatibility: {
          migrationRequired: true,
          missingColumns: ['draft_state', 'draft_saved_ts'],
        },
      };
    }
    throw {
      status: 500,
      message: getApiErrorMessage(payload, 'Failed to save shared draft'),
    };
  }
  const rows = await readJsonSafe(patchRes);
  if (!Array.isArray(rows) || !rows.some(row => row?.menu_id === menuId)) {
    throw {
      status: 500,
      message: 'Failed to confirm shared draft persistence',
    };
  }

  return {
    ok: true,
    status: 'draft_saved',
    menuId,
    savedAt,
    hasSharedDraft: hasSharedDraft(snapshot),
    compatibility: {
      command: 'menu-draft.v1',
      acceptedLegacyPayload: true,
      usedClientSavedAt: command.usedClientSavedAt,
      snapshotVersion: Number.isFinite(Number(snapshot?.version)) ? Number(snapshot.version) : null,
    },
  };
}
