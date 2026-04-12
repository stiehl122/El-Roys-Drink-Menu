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
