import { createRateLimiter } from './_rate-limit.js';

const MANAGER_LOOKUP_LIMIT_MESSAGE = 'Too many lookup requests. Please wait before trying again.';
let nowOverride = null;

function currentNow() {
  return typeof nowOverride === 'function' ? nowOverride() : Date.now();
}

const lookupLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 1000,
  now: currentNow,
});

function readHeaderValue(req, name) {
  const headers = req?.headers;
  if (!headers || typeof headers !== 'object') return '';
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== target) continue;
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  }
  return '';
}

function readClientIp(req) {
  const forwardedFor = readHeaderValue(req, 'x-forwarded-for')
    .split(',')
    .map(value => value.trim())
    .find(Boolean);
  return forwardedFor
    || readHeaderValue(req, 'x-real-ip')
    || String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '').trim()
    || 'unknown';
}

export function checkManagerExternalActionLimit(req, action = '') {
  const key = `${String(action || 'lookup').trim().toLowerCase()}|ip:${readClientIp(req)}`;
  const result = lookupLimiter.check(key);
  if (result.allowed) return null;
  return {
    status: 429,
    headers: { 'Retry-After': result.retryAfter },
    body: {
      error: MANAGER_LOOKUP_LIMIT_MESSAGE,
      retryAfter: result.retryAfter,
      retryAfterSeconds: result.retryAfterSeconds,
    },
  };
}

export function resetManagerExternalActionLimitersForTest() {
  lookupLimiter.reset();
}

export function setManagerExternalActionLimiterNowForTest(nowFn) {
  nowOverride = typeof nowFn === 'function' ? nowFn : null;
}
