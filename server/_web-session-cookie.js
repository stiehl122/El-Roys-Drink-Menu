const ACCESS_COOKIE = 'hf_web_access';
const REFRESH_COOKIE = 'hf_web_refresh';
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function encodeCookieValue(value = '') {
  return encodeURIComponent(String(value || ''));
}

function serializeCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeCookieValue(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join('; ');
}

export function buildSessionCookies({ accessToken = '', refreshToken = '', expiresIn = 3600 } = {}) {
  const accessMaxAge = Math.max(60, Number(expiresIn || 3600));
  return [
    serializeCookie(ACCESS_COOKIE, accessToken, { maxAge: accessMaxAge }),
    serializeCookie(REFRESH_COOKIE, refreshToken, { maxAge: REFRESH_MAX_AGE_SECONDS }),
  ];
}

export function buildClearSessionCookies() {
  return [
    serializeCookie(ACCESS_COOKIE, '', { maxAge: 0 }),
    serializeCookie(REFRESH_COOKIE, '', { maxAge: 0 }),
  ];
}

export function readCookieValue(req, name) {
  const cookieHeader = String(req?.headers?.cookie || '');
  const target = String(name || '');
  if (!cookieHeader || !target) return '';
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === target) {
      try {
        return decodeURIComponent(rawValue.join('=') || '');
      } catch (_) {
        return '';
      }
    }
  }
  return '';
}

export const WEB_SESSION_COOKIE_NAMES = Object.freeze({
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
});
