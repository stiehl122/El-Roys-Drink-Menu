import {
  readMenuAccessForUser,
  readProfile,
  requireAuthenticatedUser,
} from '../server/_auth.js';
import { getSupabaseServerConfig } from '../server/_supabase.js';
import { createSessionBootstrapPayload } from '../server/_menu-read.js';

function readRequestMode(req) {
  const fallbackMode = String(req?.query?.mode || req?.query?.kind || '').trim().toLowerCase();
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const mode = String(url.searchParams.get('mode') || url.searchParams.get('kind') || fallbackMode).trim().toLowerCase();
    if (mode) return mode;
    if (url.pathname.endsWith('/config')) return 'config';
    if (url.pathname.endsWith('/role')) return 'profile';
    return '';
  } catch (_) {
    return fallbackMode;
  }
}

function hasAuthorizationHeader(req) {
  return !!String(req?.headers?.authorization || '').trim();
}

function isPreviewRuntime() {
  return String(process.env.VERCEL_ENV || '').toLowerCase() === 'preview';
}

function normalizeAuditMode(value = '') {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'admin' ? 'admin' : 'manager';
}

function getLoopAuditConfig(mode = 'manager') {
  const normalizedMode = normalizeAuditMode(mode);
  const prefix = normalizedMode === 'admin' ? 'LOOP_ADMIN' : 'LOOP_MANAGER';
  const email = String(process.env[`${prefix}_EMAIL`] || '').trim();
  const password = String(process.env[`${prefix}_PASSWORD`] || '').trim();
  const label = String(process.env[`${prefix}_LABEL`] || '').trim()
    || (normalizedMode === 'admin' ? 'Use Preview Admin Audit Session' : 'Use Preview Manager Audit Session');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  return {
    mode: normalizedMode,
    email,
    password,
    label,
    anonKey,
    available: !!(email && password && anonKey && isPreviewRuntime()),
  };
}

function readBootstrapConfig() {
  return {
    supabaseUrl: String(process.env.SUPABASE_URL || '').trim(),
    supabaseAnonKey: String(process.env.SUPABASE_ANON_KEY || '').trim(),
  };
}

function buildBootstrapReadiness(loopAudit = null) {
  const config = readBootstrapConfig();
  return {
    config,
    readiness: {
      hasSupabaseConfig: !!(config.supabaseUrl && config.supabaseAnonKey),
      previewAuditAvailable: !!loopAudit?.available,
    },
  };
}

async function signInPreviewAuditUser({ sbUrl, anonKey, email, password }) {
  const response = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw {
      status: response.status || 500,
      message: payload?.error_description || payload?.msg || payload?.message || 'Preview audit sign-in failed.',
    };
  }
  return payload;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  try {
    const mode = readRequestMode(req);

    if (req.method === 'POST') {
      if (!isPreviewRuntime()) {
        return res.status(403).json({ error: 'Preview audit session is only available on preview deployments.' });
      }

      const requestedMode = normalizeAuditMode(req.body?.mode || req.query?.mode || 'manager');
      const config = getLoopAuditConfig(requestedMode);
      if (!config.available) {
        return res.status(404).json({ error: 'Preview audit session is not configured for this deployment.' });
      }

      const { sbUrl } = getSupabaseServerConfig();
      const session = await signInPreviewAuditUser({
        sbUrl,
        anonKey: config.anonKey,
        email: config.email,
        password: config.password,
      });
      const uid = session?.user?.id || '';
      if (!uid) {
        return res.status(500).json({ error: 'Preview audit session did not return a valid user.' });
      }

      const profile = await readProfile(uid, { select: 'role,name' });
      const role = profile?.role || 'none';
      const accessibleMenuIds = role === 'manager'
        ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
        : [];

      const expectedRole = requestedMode === 'admin' ? 'admin' : 'manager';
      if (role !== expectedRole && !(requestedMode === 'manager' && role === 'admin')) {
        return res.status(403).json({ error: `Preview audit account must have ${expectedRole} access.` });
      }

      return res.json({
        ok: true,
        label: config.label,
        mode: requestedMode,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        },
        actor: {
          role,
          name: profile?.name || '',
          accessibleMenuIds,
        },
      });
    }

    if (mode === 'config') {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
      return res.json(readBootstrapConfig());
    }

    if (mode === 'profile') {
      const { uid } = await requireAuthenticatedUser(req);
      const profile = await readProfile(uid, { select: 'role,name' });
      const role = profile?.role || 'none';
      const accessibleMenuIds = role === 'manager'
        ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
        : [];
      return res.json({ role, name: profile?.name || '', accessibleMenuIds });
    }

    const previewAuditMode = normalizeAuditMode(req.query?.mode || 'manager');
    const loopAudit = getLoopAuditConfig(previewAuditMode);
    if (!hasAuthorizationHeader(req)) {
      const bootstrapPayload = createSessionBootstrapPayload();
      const readinessPayload = buildBootstrapReadiness(loopAudit);
      return res.json({
        ...bootstrapPayload,
        ...readinessPayload,
        loopAudit: {
          available: loopAudit.available,
          label: loopAudit.label,
          mode: previewAuditMode,
          previewOnly: true,
        },
        compatibility: {
          ...bootstrapPayload.compatibility,
          includesConfig: true,
          readinessShape: 'bootstrap.readiness.v1',
        },
      });
    }

    const { uid } = await requireAuthenticatedUser(req);
    const profile = await readProfile(uid, { select: 'role,name' });
    const role = profile?.role || 'none';
    const accessibleMenuIds = role === 'manager'
      ? (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id)
      : [];
    const readinessPayload = buildBootstrapReadiness(loopAudit);
    const bootstrapPayload = createSessionBootstrapPayload({
      actor: {
        id: uid,
        name: profile?.name || '',
        role,
      },
      accessibleMenuIds,
    });
    return res.json({
      ...bootstrapPayload,
      ...readinessPayload,
      loopAudit: {
        available: loopAudit.available,
        label: loopAudit.label,
        mode: previewAuditMode,
        previewOnly: true,
      },
      compatibility: {
        ...bootstrapPayload.compatibility,
        includesConfig: true,
        readinessShape: 'bootstrap.readiness.v1',
      },
    });
  } catch (error) {
    return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
  }
}
