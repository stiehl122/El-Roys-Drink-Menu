import {
  readMenuAccessForUser,
  readProfile,
  requireAuthenticatedUser,
} from '../server/_auth.js';
import { createSessionBootstrapPayload } from '../server/_menu-read.js';

function hasAuthorizationHeader(req) {
  return !!String(req?.headers?.authorization || '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    if (!hasAuthorizationHeader(req)) {
      return res.json(createSessionBootstrapPayload());
    }

    const { uid } = await requireAuthenticatedUser(req);
    const profile = await readProfile(uid, { select: 'role,name' });
    const role = profile?.role || 'none';
    const accessibleMenuIds = role === 'manager'
      ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
      : [];
    return res.json(createSessionBootstrapPayload({
      actor: {
        id: uid,
        name: profile?.name || '',
        role,
      },
      accessibleMenuIds,
    }));
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
