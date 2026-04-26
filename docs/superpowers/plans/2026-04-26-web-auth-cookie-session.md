# Web Auth Cookie Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop storing staff/admin Supabase access and refresh tokens in browser `localStorage` and move web session restore/refresh/sign-out behind server-managed secure cookies.

**Architecture:** Keep iOS bearer-token auth unchanged. Add a small dependency-free cookie/session helper under `server/`, extend `/api/auth` with web-session actions, and teach the web auth boundary to use those actions instead of reading/writing `hf_sb_access_token` and `hf_sb_refresh_token`. Do not introduce a bundler, npm package, or Supabase client dependency.

**Tech Stack:** Plain JavaScript, Vercel serverless functions, Supabase Auth REST, Node test runner.

---

## Ownership

Codex can handle the code, tests, and docs. Project owner intervention is required only to verify production Vercel cookie behavior over HTTPS and to rotate existing staff sessions after deployment if a token-exposure window is assumed.

## File Structure

- Create: `server/_web-session-cookie.js` for dependency-free cookie parsing/serialization.
- Modify: `server/_auth-proxy.js` to add `web_sign_in`, `web_refresh`, `web_session`, and `web_sign_out` actions.
- Modify: `api/auth.js` to let auth proxy set headers/status through returned response metadata.
- Modify: `core/auth/auth-api.js` and `app.js` auth dependency wiring to use web-session API calls.
- Modify: `core/auth/auth-session-service.js` to stop requiring storage-backed refresh tokens for web.
- Test: `tests/web-auth-cookie-session.test.cjs`.
- Test: `tests/phase15-auth-boundaries.test.cjs` if auth boundary assertions need updates.
- Docs: `README.md`, `docs/launch/environment-matrix.md`, `docs/FEATURES.md`.

### Task 1: Cookie Helper

**Files:**
- Create: `server/_web-session-cookie.js`
- Test: `tests/web-auth-cookie-session.test.cjs`

- [ ] **Step 1: Write the failing tests**

Add this file:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionCookies,
  buildClearSessionCookies,
  readCookieValue,
} from '../server/_web-session-cookie.js';

test('buildSessionCookies emits secure HttpOnly SameSite cookies for web auth tokens', () => {
  const cookies = buildSessionCookies({
    accessToken: 'access.123',
    refreshToken: 'refresh.456',
    expiresIn: 3600,
  });

  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^hf_web_access=access\.123;/);
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /Secure/);
  assert.match(cookies[0], /SameSite=Lax/);
  assert.match(cookies[0], /Path=\//);
  assert.match(cookies[1], /^hf_web_refresh=refresh\.456;/);
  assert.match(cookies[1], /Max-Age=2592000/);
});

test('buildClearSessionCookies expires both web auth cookies', () => {
  const cookies = buildClearSessionCookies();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every(cookie => cookie.includes('Max-Age=0')));
  assert.ok(cookies.every(cookie => cookie.includes('HttpOnly')));
});

test('readCookieValue extracts a named cookie without decoding unrelated entries', () => {
  const req = { headers: { cookie: 'theme=dark; hf_web_refresh=refresh%20456; other=value' } };
  assert.equal(readCookieValue(req, 'hf_web_refresh'), 'refresh 456');
  assert.equal(readCookieValue(req, 'missing'), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/web-auth-cookie-session.test.cjs
```

Expected: FAIL with a module-not-found error for `server/_web-session-cookie.js`.

- [ ] **Step 3: Implement the helper**

Create `server/_web-session-cookie.js`:

```js
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
    if (rawKey === target) return decodeURIComponent(rawValue.join('=') || '');
  }
  return '';
}

export const WEB_SESSION_COOKIE_NAMES = Object.freeze({
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/web-auth-cookie-session.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_web-session-cookie.js tests/web-auth-cookie-session.test.cjs
git commit -m "feat: add web auth session cookie helper"
```

### Task 2: Server Web-Session Auth Actions

**Files:**
- Modify: `server/_auth-proxy.js`
- Modify: `api/auth.js`
- Test: `tests/web-auth-cookie-session.test.cjs`

- [ ] **Step 1: Extend the failing test**

Append to `tests/web-auth-cookie-session.test.cjs`:

```js
test('auth proxy source exposes web-session actions and never returns refresh token to web session callers', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile('server/_auth-proxy.js', 'utf8'));
  assert.match(source, /case 'web_sign_in'/);
  assert.match(source, /case 'web_refresh'/);
  assert.match(source, /case 'web_session'/);
  assert.match(source, /case 'web_sign_out'/);
  assert.match(source, /buildSessionCookies/);
  assert.match(source, /buildClearSessionCookies/);
  assert.doesNotMatch(source, /webSessionPayload[\s\S]*refresh_token/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/web-auth-cookie-session.test.cjs
```

Expected: FAIL because the new actions are not present.

- [ ] **Step 3: Add response metadata support to `api/auth.js`**

Replace the POST return block in `api/auth.js`:

```js
const result = await executeAuthAction(req);
if (result?.headers && typeof result.headers === 'object') {
  Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value));
}
if (result?.status) return res.status(result.status).json(result.body || {});
return res.json(result?.body || result);
```

- [ ] **Step 4: Add web-session helpers to `server/_auth-proxy.js`**

Import cookie helpers:

```js
import {
  buildClearSessionCookies,
  buildSessionCookies,
  readCookieValue,
  WEB_SESSION_COOKIE_NAMES,
} from './_web-session-cookie.js';
```

Add these functions above `executeAuthAction`:

```js
function webSessionPayload(session = {}) {
  return {
    ok: true,
    session: {
      access_token: session.access_token || '',
      expires_in: session.expires_in || 3600,
      token_type: session.token_type || 'bearer',
      user: session.user || null,
    },
  };
}

async function signInWebSession(body = {}) {
  const session = await supabaseAuthRequest('auth/v1/token?grant_type=password', {
    body: {
      email: String(body?.email || '').trim(),
      password: String(body?.password || ''),
    },
  }, 'Authentication failed.');
  return {
    headers: {
      'Set-Cookie': buildSessionCookies({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in,
      }),
    },
    body: webSessionPayload(session),
  };
}

async function refreshWebSession(req, body = {}) {
  const refreshToken = String(body?.refresh_token || body?.refreshToken || '').trim()
    || readCookieValue(req, WEB_SESSION_COOKIE_NAMES.refresh);
  if (!refreshToken) throw { status: 401, message: 'Session refresh unavailable' };
  const session = await supabaseAuthRequest('auth/v1/token?grant_type=refresh_token', {
    body: { refresh_token: refreshToken },
  }, 'Token refresh failed.');
  return {
    headers: {
      'Set-Cookie': buildSessionCookies({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in,
      }),
    },
    body: webSessionPayload(session),
  };
}

async function readWebSession(req) {
  const token = readCookieValue(req, WEB_SESSION_COOKIE_NAMES.access);
  if (!token) throw { status: 401, message: 'No web session' };
  const { user } = await requireAuthenticatedUser({ ...req, headers: { ...(req.headers || {}), authorization: `Bearer ${token}` } });
  return { ok: true, session: { access_token: token, user } };
}

function signOutWebSession() {
  return {
    headers: { 'Set-Cookie': buildClearSessionCookies() },
    body: { ok: true },
  };
}
```

Then add cases inside `executeAuthAction`:

```js
case 'web_sign_in':
  return signInWebSession(body);
case 'web_refresh':
  return refreshWebSession(req, body);
case 'web_session':
  return readWebSession(req);
case 'web_sign_out':
  return signOutWebSession();
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/web-auth-cookie-session.test.cjs tests/phase15-auth-boundaries.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/auth.js server/_auth-proxy.js tests/web-auth-cookie-session.test.cjs
git commit -m "feat: add server-managed web auth sessions"
```

### Task 3: Web Client Stops Writing Auth Tokens To localStorage

**Files:**
- Modify: `core/auth/auth-api.js`
- Modify: `core/auth/auth-session-service.js`
- Modify: `app.js`
- Test: `tests/web-auth-cookie-session.test.cjs`

- [ ] **Step 1: Add failing source guard**

Append:

```js
test('web runtime no longer persists Supabase access or refresh tokens in localStorage', async () => {
  const appSource = await import('node:fs/promises').then(fs => fs.readFile('app.js', 'utf8'));
  assert.doesNotMatch(appSource, /hf_sb_access_token/);
  assert.doesNotMatch(appSource, /hf_sb_refresh_token/);
  assert.doesNotMatch(appSource, /localStorage\.getItem\(LS_KEYS\.accessToken\)/);
  assert.doesNotMatch(appSource, /localStorage\.getItem\(LS_KEYS\.refreshToken\)/);
  assert.doesNotMatch(appSource, /lsSet\(LS_KEYS\.accessToken/);
  assert.doesNotMatch(appSource, /lsSet\(LS_KEYS\.refreshToken/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/web-auth-cookie-session.test.cjs
```

Expected: FAIL on existing localStorage token references.

- [ ] **Step 3: Update auth API actions**

In `core/auth/auth-api.js`, change web sign-in and refresh bodies:

```js
body: JSON.stringify({ action: 'web_sign_in', email, password }),
```

and:

```js
body: JSON.stringify({ action: 'web_refresh' }),
```

Add:

```js
async signOutWebSession() {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'web_sign_out' }),
  });
  return readAuthApiPayload(response, 'Failed to sign out.');
}
```

- [ ] **Step 4: Remove token storage keys from `app.js`**

Delete `accessToken`, `refreshToken`, and `expiresAt` from `LS_KEYS`. Keep `uid` and `email` only if they are still used for non-sensitive display caching.

Replace storage writes in `_applySession` with:

```js
lsSet(LS_KEYS.uid, userId);
lsSet(LS_KEYS.email, email);
```

Replace token refresh writes with:

```js
currentUser.accessToken = accessToken;
currentUser.expiresAt = nextExpiresAt;
```

and:

```js
currentUser.accessToken = data.access_token;
currentUser.expiresAt = Date.now() + expiresIn;
```

- [ ] **Step 5: Change restore to call the server**

Replace localStorage restore logic in `restoreStoredSession()` with:

```js
try {
  const data = await sbRefreshToken('');
  const session = await this.applyAuthenticatedSession(data);
  return { restored: true, source: 'web-session-cookie', data, session };
} catch (error) {
  if (isTerminalAuthSessionError(error)) return { restored: false, reason: 'no-web-session' };
  return { restored: false, reason: 'web-session-unavailable', error };
}
```

Ensure `sbRefreshToken` ignores its argument for web and posts `{ action: 'web_refresh' }`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/web-auth-cookie-session.test.cjs tests/phase15-auth-boundaries.test.cjs tests/architecture-boundaries.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app.js core/auth/auth-api.js core/auth/auth-session-service.js tests/web-auth-cookie-session.test.cjs
git commit -m "fix: stop persisting web auth tokens in local storage"
```

### Task 4: Tighten CSP After Token Migration

**Files:**
- Modify: `vercel.json`
- Test: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Add failing CSP assertion**

In `tests/public-launch-surface.test.cjs`, add:

```js
test('vercel CSP does not allow unsafe inline scripts after web auth cookie migration', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const header = config.headers[0].headers.find(entry => entry.key === 'Content-Security-Policy');
  assert.ok(header);
  assert.doesNotMatch(header.value, /script-src[^;]*'unsafe-inline'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
```

Expected: FAIL while inline handlers remain.

- [ ] **Step 3: Remove inline handler dependency or choose nonce rollout**

If inline handler removal is too large for the same release, keep this task as a separate branch and do not claim the P0 is fully closed. The minimal acceptable launch step is to remove token persistence first. The stricter CSP rollout should replace inline `onclick`/`onchange` handlers with delegated listeners before removing `'unsafe-inline'`.

- [ ] **Step 4: Run full web checks**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vercel.json tests/public-launch-surface.test.cjs app.js index.html manager/index.html admin/index.html leroyslounge/index.html elroyscantina/index.html
git commit -m "chore: tighten web script security policy"
```

## Self-Review Notes

- Spec coverage: covers token storage, server cookie sessions, sign-in/refresh/sign-out, CSP follow-up, docs.
- Placeholder scan: no forbidden placeholder terms or undefined function names remain.
- Intervention scan: owner must verify HTTPS cookie behavior and decide whether to rotate staff sessions after deployment.
