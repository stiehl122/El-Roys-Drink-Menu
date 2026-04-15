import { getApiErrorMessage, getSupabaseServerConfig, readJsonSafe, serviceHeaders } from './_supabase.js';

const LANDING_PAGE_STATE_ID = 'root';

async function fetchJsonOrThrow(url, options = {}, fallbackMessage = 'Server error') {
  const response = await fetch(url, options);
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw { status: response.status || 500, message: getApiErrorMessage(payload, fallbackMessage) };
}

export async function readLandingPageState({ includeDraft = false } = {}) {
  const { sbUrl } = getSupabaseServerConfig();
  const select = includeDraft
    ? 'id,draft_content,live_content,draft_saved_ts,live_published_ts'
    : 'id,live_content,live_published_ts';
  const rows = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/landing_page_state?id=eq.${encodeURIComponent(LANDING_PAGE_STATE_ID)}&select=${select}&limit=1`,
    { headers: serviceHeaders() },
    'Failed to load landing page state'
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw { status: 404, message: 'Landing page state is missing.' };
  return row;
}

export async function saveLandingPageDraft({
  draftContent = {},
  liveContent = {},
  draftSavedTs = null,
  livePublishedTs = null,
} = {}) {
  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/rest/v1/landing_page_state`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    }),
    body: JSON.stringify([{
      id: LANDING_PAGE_STATE_ID,
      draft_content: draftContent || {},
      live_content: liveContent || {},
      draft_saved_ts: draftSavedTs,
      live_published_ts: livePublishedTs,
    }]),
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw {
      status: response.status || 500,
      message: getApiErrorMessage(payload, 'Failed to save landing page state'),
    };
  }
  return Array.isArray(payload) ? (payload[0] || null) : payload;
}
