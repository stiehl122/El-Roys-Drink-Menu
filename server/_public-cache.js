import { createHash } from 'node:crypto';

function sanitizeToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, '-')
    .slice(0, 120) || 'none';
}

function normalizeForStableJson(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeForStableJson);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((normalized, key) => {
        normalized[key] = normalizeForStableJson(value[key]);
        return normalized;
      }, {});
  }
  return value;
}

function normalizeEntityTag(value = '') {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^W\//i, '').trim();
}

export function buildPublicJsonPayloadRevision(payload) {
  const stableJson = JSON.stringify(normalizeForStableJson(payload));
  return `sha256:${createHash('sha256').update(stableJson).digest('hex')}`;
}

export function buildPublicJsonCacheHeaders({ action = 'public', revision = 0, appVersion = 'dev' } = {}) {
  const etag = `"${sanitizeToken(action)}:${sanitizeToken(appVersion)}:${sanitizeToken(revision)}"`;
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=60',
    ETag: etag,
    Vary: 'Accept-Encoding',
  };
}

export function isPublicJsonNotModified(req, headers = {}) {
  const expected = normalizeEntityTag(headers.ETag);
  if (!expected) return false;
  const actual = String(req?.headers?.['if-none-match'] || req?.headers?.['If-None-Match'] || '').trim();
  if (!actual) return false;
  return actual
    .split(',')
    .map(normalizeEntityTag)
    .some(candidate => candidate === '*' || candidate === expected);
}

export function applyPublicJsonCacheHeaders(res, headers = {}) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}
