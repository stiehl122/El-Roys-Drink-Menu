export function getSupabaseServerConfig() {
  const sbUrl = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) throw { status: 500, message: 'Server misconfigured' };
  return { sbUrl, sbService };
}

export function serviceHeaders(extra = {}, sbServiceOverride = '') {
  const sbService = sbServiceOverride || getSupabaseServerConfig().sbService;
  return {
    apikey: sbService,
    Authorization: `Bearer ${sbService}`,
    ...extra,
  };
}

export async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

export function getApiErrorMessage(payload, fallback = 'Server error') {
  return payload?.error || payload?.message || payload?.hint || payload?.details || fallback;
}

export async function fetchSupabase(pathname, options = {}) {
  const { sbUrl, sbService } = getSupabaseServerConfig();
  const url = /^https?:\/\//i.test(pathname || '') ? pathname : `${sbUrl}${pathname}`;
  const headers = serviceHeaders(options.headers || {}, sbService);
  return await fetch(url, {
    ...options,
    headers,
  });
}

export async function fetchSupabaseJson(pathname, options = {}) {
  const response = await fetchSupabase(pathname, options);
  const payload = await readJsonSafe(response);
  return { response, payload };
}
