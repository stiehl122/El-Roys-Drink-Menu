import {
  readMenuAccessForUser,
  readProfile,
  requireAuthenticatedUser,
} from './_auth.js';
import { createSessionBootstrapPayload } from './_menu-read.js';
import { getSupabaseServerConfig, readJsonSafe } from './_supabase.js';
import { parseRequestBody, readAction, readQueryValue } from './_request.js';

function getSupabaseAnonKey() {
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!anonKey) throw { status: 500, message: 'Server misconfigured' };
  return anonKey;
}

function isPreviewRuntime() {
  return String(process.env.VERCEL_ENV || '').toLowerCase() === 'preview';
}

function normalizeAuditMode(value = '') {
  return String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'manager';
}

function buildCompatibilityConfig() {
  return {
    supabaseUrl: 'server-managed',
    supabaseAnonKey: 'server-managed',
  };
}

function buildAccountDeletionRequestMetadata() {
  const requestedAt = new Date().toISOString();
  return {
    account_deletion_requested: true,
    account_deletion_requested_at: requestedAt,
    account_deletion_request_source: 'ios-account-menu',
    account_deletion_request_status: 'pending_admin_review',
  };
}

function getLoopAuditConfig(mode = 'manager') {
  const normalizedMode = normalizeAuditMode(mode);
  const prefix = normalizedMode === 'admin' ? 'LOOP_ADMIN' : 'LOOP_MANAGER';
  const email = String(process.env[`${prefix}_EMAIL`] || '').trim();
  const password = String(process.env[`${prefix}_PASSWORD`] || '').trim();
  const label = String(process.env[`${prefix}_LABEL`] || '').trim()
    || (normalizedMode === 'admin' ? 'Use Preview Admin Audit Session' : 'Use Preview Manager Audit Session');
  const anonKey = getSupabaseAnonKey();
  return {
    mode: normalizedMode,
    email,
    password,
    label,
    anonKey,
    available: !!(email && password && anonKey && isPreviewRuntime()),
  };
}

function buildBootstrapReadiness(loopAudit = null) {
  const { sbUrl } = getSupabaseServerConfig();
  const anonKey = getSupabaseAnonKey();
  return {
    config: buildCompatibilityConfig(),
    readiness: {
      hasSupabaseConfig: !!(sbUrl && anonKey),
      previewAuditAvailable: !!loopAudit?.available,
    },
  };
}

function authHeaders(extra = {}) {
  return {
    apikey: getSupabaseAnonKey(),
    ...extra,
  };
}

async function readSupabaseAuthJson(response, fallbackMessage) {
  const payload = await readJsonSafe(response);
  if (response.ok) return payload || {};
  throw {
    status: response.status || 500,
    message: payload?.error_description || payload?.msg || payload?.error || payload?.message || fallbackMessage,
  };
}

async function requestAccountDeletion(req) {
  const { uid, token, user } = await requireAuthenticatedUser(req);
  const currentMetadata = user?.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : {};
  const metadata = buildAccountDeletionRequestMetadata();
  await supabaseAuthRequest('auth/v1/user', {
    method: 'PUT',
    accessToken: token,
    body: {
      data: {
        ...currentMetadata,
        ...metadata,
      },
    },
  }, 'Account deletion request failed.');
  return {
    ok: true,
    userId: uid,
    requestedAt: metadata.account_deletion_requested_at,
    status: metadata.account_deletion_request_status,
  };
}

async function supabaseAuthRequest(path, { method = 'POST', body = null, accessToken = '' } = {}, fallbackMessage) {
  const { sbUrl } = getSupabaseServerConfig();
  const headers = authHeaders({
    Accept: 'application/json',
  });
  if (body != null) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${sbUrl}/${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  return readSupabaseAuthJson(response, fallbackMessage);
}

async function readAccessibleMenuIdsForRole(uid, role) {
  if (role !== 'manager') return [];
  return (await readMenuAccessForUser(uid, { select: 'menu_id' })).map(row => row.menu_id);
}

function attachBootstrapCompatibility(payload = {}, readinessPayload = {}, loopAudit = null) {
  return {
    ...payload,
    ...readinessPayload,
    loopAudit: {
      available: !!loopAudit?.available,
      label: loopAudit?.label || 'Use Preview Audit Session',
      mode: loopAudit?.mode || 'manager',
      previewOnly: true,
    },
    compatibility: {
      ...(payload.compatibility || {}),
      includesConfig: true,
      readinessShape: 'bootstrap.readiness.v1',
      configIsCompatibilityShim: true,
    },
  };
}

export async function createBootstrapResponse(req) {
  const requestedMode = normalizeAuditMode(readQueryValue(req, 'mode') || 'manager');
  const loopAudit = getLoopAuditConfig(requestedMode);
  const readinessPayload = buildBootstrapReadiness(loopAudit);

  const authHeader = String(req?.headers?.authorization || '').trim();
  if (!authHeader) {
    return attachBootstrapCompatibility(createSessionBootstrapPayload(), readinessPayload, loopAudit);
  }

  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  const accessibleMenuIds = await readAccessibleMenuIdsForRole(uid, role);
  const payload = createSessionBootstrapPayload({
    actor: {
      id: uid,
      name: profile?.name || '',
      role,
    },
    accessibleMenuIds,
  });
  return attachBootstrapCompatibility(payload, readinessPayload, loopAudit);
}

export async function createProfileResponse(req) {
  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  const accessibleMenuIds = await readAccessibleMenuIdsForRole(uid, role);
  return {
    role,
    name: profile?.name || '',
    accessibleMenuIds,
  };
}

export async function signInPreviewAuditUser(req) {
  if (!isPreviewRuntime()) {
    throw { status: 403, message: 'Preview audit session is only available on preview deployments.' };
  }
  const body = parseRequestBody(req);
  const requestedMode = normalizeAuditMode(body?.mode || readQueryValue(req, 'mode') || 'manager');
  const config = getLoopAuditConfig(requestedMode);
  if (!config.available) {
    throw { status: 404, message: 'Preview audit session is not configured for this deployment.' };
  }

  const session = await supabaseAuthRequest('auth/v1/token?grant_type=password', {
    body: { email: config.email, password: config.password },
  }, 'Preview audit sign-in failed.');
  const uid = session?.user?.id || '';
  if (!uid) {
    throw { status: 500, message: 'Preview audit session did not return a valid user.' };
  }

  const profile = await readProfile(uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  const accessibleMenuIds = await readAccessibleMenuIdsForRole(uid, role);
  const expectedRole = requestedMode === 'admin' ? 'admin' : 'manager';
  if (role !== expectedRole && !(requestedMode === 'manager' && role === 'admin')) {
    throw { status: 403, message: `Preview audit account must have ${expectedRole} access.` };
  }

  return {
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
  };
}

export async function executeAuthAction(req) {
  const body = parseRequestBody(req);
  const action = readAction(req, body);

  switch (action) {
    case 'preview_audit_sign_in':
      return signInPreviewAuditUser(req);
    case 'request_account_deletion':
      return requestAccountDeletion(req);
    case 'sign_in':
      return supabaseAuthRequest('auth/v1/token?grant_type=password', {
        body: {
          email: String(body?.email || '').trim(),
          password: String(body?.password || ''),
        },
      }, 'Authentication failed.');
    case 'sign_up':
      return supabaseAuthRequest('auth/v1/signup', {
        body: {
          email: String(body?.email || '').trim(),
          password: String(body?.password || ''),
          data: {
            name: String(body?.name || '').trim(),
          },
        },
      }, 'Authentication failed.');
    case 'refresh':
      return supabaseAuthRequest('auth/v1/token?grant_type=refresh_token', {
        body: {
          refresh_token: String(body?.refresh_token || body?.refreshToken || '').trim(),
        },
      }, 'Token refresh failed.');
    case 'reset_password':
      await supabaseAuthRequest('auth/v1/recover', {
        body: {
          email: String(body?.email || '').trim(),
          redirect_to: String(body?.redirect_to || body?.redirectTo || '').trim(),
        },
      }, 'Password reset request failed.');
      return { ok: true };
    case 'update_password': {
      const authHeader = String(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
      const accessToken = authHeader || String(body?.access_token || body?.accessToken || '').trim();
      if (!accessToken) throw { status: 401, message: 'Unauthorized' };
      return supabaseAuthRequest('auth/v1/user', {
        method: 'PUT',
        accessToken,
        body: {
          password: String(body?.new_password || body?.newPassword || body?.password || ''),
        },
      }, 'Password update failed.');
    }
    default:
      throw { status: 400, message: 'Unsupported auth action' };
  }
}
