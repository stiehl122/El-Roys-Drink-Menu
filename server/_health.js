import { fetchWithTimeout } from './_fetch.js';

export const REQUIRED_HEALTH_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const SUPABASE_HEALTH_TIMEOUT_MS = 5000;

function normalizeSupabaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function readConfigStatus(env) {
  return REQUIRED_HEALTH_ENV.reduce((status, name) => {
    status[name] = { configured: Boolean(String(env?.[name] || '').trim()) };
    return status;
  }, {});
}

function hasRequiredConfig(config) {
  return REQUIRED_HEALTH_ENV.every(name => config[name]?.configured);
}

async function checkSupabaseReadiness(env, fetchImpl, timeoutMs = SUPABASE_HEALTH_TIMEOUT_MS) {
  const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const response = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/menus?select=id&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
    { timeoutMs, fetchImpl }
  );

  if (response?.ok) {
    return {
      checked: true,
      ok: true,
      status: response.status || 200,
    };
  }

  return {
    checked: true,
    ok: false,
    status: response?.status || 0,
    message: 'Supabase readiness check failed',
  };
}

export async function checkHealth(options = {}) {
  const env = options.env || process.env;
  const config = readConfigStatus(env);

  if (!hasRequiredConfig(config)) {
    return {
      ok: false,
      config,
      supabase: {
        checked: false,
        ok: false,
        message: 'Skipped because required configuration is missing',
      },
    };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let supabase;
  try {
    supabase = await checkSupabaseReadiness(env, fetchImpl, options.supabaseTimeoutMs);
  } catch (_) {
    supabase = {
      checked: true,
      ok: false,
      message: 'Supabase readiness check failed',
    };
  }

  return {
    ok: supabase.ok,
    config,
    supabase,
  };
}
