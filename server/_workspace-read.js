import {
  createMenuWorkspacePayload,
  createSessionBootstrapPayload,
  getDefaultMenuId,
  getKnownMenus,
  getKnownRestaurants,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from './_menu-read.js';
import { readMenuAccessForUser, readProfile } from './_auth.js';
import { readManagerNoteForMenu } from './_manager-notes.js';

function normalizeWorkspaceActor({ uid = '', role = 'none', name = '' } = {}) {
  return {
    id: uid || '',
    role: role || 'none',
    name: name || '',
  };
}

export async function buildBootstrapPayload({ uid = '', includeActor = false } = {}) {
  const actorProfile = includeActor && uid
    ? await readProfile(uid, { select: 'role,name' })
    : null;
  const role = actorProfile?.role || 'none';
  const accessibleMenuIds = role === 'manager'
    ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
    : [];

  const payload = createSessionBootstrapPayload({
    actor: includeActor && uid
      ? {
          id: uid,
          name: actorProfile?.name || '',
          role,
        }
      : null,
    accessibleMenuIds,
  });

  return {
    actor: payload.actor,
    capabilities: payload.capabilities,
    access: payload.access,
    compatibility: payload.compatibility || null,
    bootstrap: {
      appVersion: payload.appVersion,
      defaultMenuId: getDefaultMenuId(payload.access?.accessibleMenuIds || []),
    },
    scope: {
      menus: getKnownMenus(),
      restaurants: getKnownRestaurants(),
    },
  };
}

export async function buildWorkspacePayload({ menuId, uid, role }) {
  const actorProfile = await readProfile(uid, { select: 'role,name' });
  const effectiveRole = actorProfile?.role || role || 'none';
  const accessibleMenuIds = effectiveRole === 'manager'
    ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
    : [];
  const bundle = await readMenuStateBundle(menuId);
  const payload = createMenuWorkspacePayload(bundle, {
    actor: { ...normalizeWorkspaceActor({
      uid,
      role: effectiveRole,
      name: actorProfile?.name || '',
    }), accessibleMenuIds },
  });
  payload.managerNote = await readManagerNoteForMenu(menuId);
  return payload;
}

export { createSessionBootstrapPayload, getDefaultMenuId, getKnownMenus, getKnownRestaurants, isSupportedMenuId, parseMenuId, readMenuStateBundle };
