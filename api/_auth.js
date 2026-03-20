// Shared auth helper — Vercel ignores files prefixed with _ as API endpoints.

/**
 * Verifies the Bearer token in the Authorization header and checks that the
 * caller's role is one of the allowed roles.
 *
 * @param {import('http').IncomingMessage} req
 * @param {...string} roles - Allowed roles (e.g. 'manager', 'admin')
 * @returns {Promise<{uid: string, role: string}>}
 * @throws {{status: number, message: string}} on auth failure
 */
export async function requireRole(req, ...roles) {
  const sbUrl     = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) throw { status: 500, message: 'Server misconfigured' };

  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) throw { status: 401, message: 'Unauthorized' };

  // Verify token and get uid
  const userRes = await fetch(`${sbUrl}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': sbService }
  });
  if (!userRes.ok) throw { status: 401, message: 'Invalid token' };
  const { id: uid } = await userRes.json();
  if (!uid) throw { status: 401, message: 'Invalid token' };

  // Check role
  const roleRes = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${uid}&select=role`,
    { headers: { 'apikey': sbService, 'Authorization': `Bearer ${sbService}` } }
  );
  if (!roleRes.ok) throw { status: 500, message: 'Failed to fetch role' };
  const [profile] = await roleRes.json();
  if (!roles.includes(profile?.role)) throw { status: 403, message: 'Forbidden' };

  return { uid, role: profile.role };
}
