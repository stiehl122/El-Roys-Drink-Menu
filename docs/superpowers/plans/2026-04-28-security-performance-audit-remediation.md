# Security Performance Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security and performance findings from the April 28, 2026 read-only audit without changing the product shape or adding dependencies.

**Architecture:** Keep all authority on the same-origin server APIs. Strip server-owned/admin-owned fields from manager live-save payloads, lock Supabase profile creation with a migration, constrain auth redirects, add low-cost abuse protection to external lookup actions, and reduce public route boot/poll cost with cache validators, a revision endpoint, lazy assets, and route-scoped script loading.

**Tech Stack:** Plain HTML, CSS, JavaScript, Node `node:test`, Vercel serverless API routes, Supabase PostgREST/Auth, Swift iOS client source.

---

## Scope Check

This plan covers two related but independently reviewable tracks:

- Security hardening: Tasks 1-4.
- Performance hardening: Tasks 5-9.

Each task produces working, testable software on its own. Execute in order because later performance tasks depend on the revision metadata introduced in Task 5.

## File Structure

- `server/_menu-live.js`: owns legacy manager `save_live`; it must stop persisting admin-owned notification and restaurant-design fields.
- `tests/phase8-server-write-boundaries.test.cjs`: existing server write-boundary tests; add regression coverage for stripped live-save fields.
- `supabase/migrations/20260428000000_lockdown_profile_self_insert.sql`: migration that prevents direct self-inserted profile privilege escalation.
- `tests/supabase-migrations-security.test.cjs`: static migration tests for Supabase policy hardening.
- `server/_auth-proxy.js`: owns password reset proxying; add same-origin recovery redirect normalization.
- `tests/auth-abuse-controls.test.cjs`: existing auth abuse tests; add reset redirect coverage.
- `server/_manager-action-limits.js`: new focused helper for per-instance throttles on manager external lookup actions.
- `api/manager.js`: applies the helper and requires a supported menu context for external lookups.
- `tests/manager-external-actions-rate-limit.test.cjs`: coverage for lookup throttling and menu access.
- `server/_public-cache.js`: new focused helper for JSON cache/ETag headers.
- `server/_menu-read.js`: expose a lightweight public revision payload.
- `api/public.js`: emit public cache headers and serve the revision payload.
- `tests/public-api-cache.test.cjs`: cache and revision endpoint coverage.
- `core/data/menu-state-loader.js`: skip full hydration when polling receives an unchanged revision response.
- `core/session/poll-scheduler.js`: add bounded exponential backoff after repeated polling errors.
- `app.js`: mirror the delegated loader/scheduler changes in the fallback implementation and call the revision endpoint before full menu reads.
- `tests/public-polling-performance.test.cjs`: browser-runtime tests for unchanged polls and backoff.
- `leroyslounge/index.html`: lazy/decode non-critical wall images and point them at optimized assets.
- `assets/leroys-lounge/wall/optimized/`: committed optimized wall assets.
- `tests/public-launch-surface.test.cjs`: public route performance budget tests.
- `leroyslounge/index.html` and `elroyscantina/index.html`: remove manager/admin script loading from public routes.
- `routes/shared/public-route-core.js`: provide any small route-owned hooks previously borrowed from manager/admin modules.
- `ios/ElRoysManagerApp/Clients/BackendClients.swift`: add revision endpoint client.
- `ios/ElRoysManagerApp/App/AppModel.swift`: check revision before fetching full workspace.
- `tests/ios-source-contracts.test.cjs`: iOS source-shape regression tests.
- `docs/FEATURES.md`: document the shared revision endpoint if iOS behavior changes.

---

### Task 1: Strip Admin-Owned Fields From Manager Live Save

**Files:**
- Modify: `server/_menu-live.js`
- Modify: `tests/phase8-server-write-boundaries.test.cjs`

- [ ] **Step 1: Write the failing test for notification and restaurant design stripping**

Append this test after `saveLiveMenuCommand clones featured_specials items when they reuse a base menu item id` in `tests/phase8-server-write-boundaries.test.cjs`:

```js
test('saveLiveMenuCommand does not persist admin-owned notifications or restaurant design from manager payloads', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const module = await importApiModule('server/_menu-live.js');
  const originalFetch = global.fetch;
  const fetchCalls = [];
  const menuId = '00000000-0000-0000-0000-000000000020';

  function ok(payload) {
    return {
      ok: true,
      async json() {
        return payload;
      },
    };
  }

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, options });

    if (href.includes('/auth/v1/user')) {
      return ok({ id: 'user-1' });
    }

    if (href.includes('/rest/v1/profiles?id=eq.user-1&select=role,name')) {
      return ok([{ role: 'manager', name: 'Manager Tester' }]);
    }

    if (href.includes(`/rest/v1/menu_access?user_id=eq.user-1&menu_id=eq.${menuId}&select=menu_id&limit=1`)) {
      return ok([{ menu_id: menuId }]);
    }

    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=*&limit=1`)) {
      return ok([{ last_updated_ts: 10, draft_saved_ts: null, last_sent_ts: null }]);
    }

    if (href.includes(`/rest/v1/menus?id=eq.${menuId}&select=id,restaurant_id,type,archived&limit=1`)) {
      return ok([{
        id: menuId,
        restaurant_id: '00000000-0000-0000-0000-000000000010',
        type: 'drinks',
        archived: false,
      }]);
    }

    if (href.includes(`/rest/v1/categories?menu_id=eq.${menuId}&select=id,key`)) {
      return ok([
        { id: 'cocktails-cat', key: 'cocktails' },
        { id: 'uncategorized-uuid-1', key: '__uncategorized__' },
      ]);
    }

    if (href.includes('/categories?on_conflict=')) {
      return ok([]);
    }

    if (href.endsWith('/rest/v1/items')) {
      return ok([]);
    }

    if (href.includes('/menu_meta?on_conflict=menu_id')) {
      return ok([]);
    }

    if (href.includes('/rest/v1/restaurants?id=eq.')) {
      throw new Error(`Unexpected restaurant design persistence: ${href}`);
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const result = await module.saveLiveMenuCommand({
      headers: { authorization: 'Bearer test-token' },
      body: {
        menu_id: menuId,
        snapshot: {
          cats: [{
            id: 'cocktails',
            key: 'cocktails',
            label: 'Cocktails',
            items: [{ id: 'item-1', name: 'House Marg' }],
          }],
          meta: {
            bot_id: 'legacy-bot-id',
            notifications: {
              groupme: { enabled: false },
              sms: { enabled: true },
            },
          },
          restaurant: {
            id: '00000000-0000-0000-0000-000000000010',
            design: { primaryColor: '#ff00ff' },
            use_custom_design: true,
          },
        },
      },
    });

    assert.equal(result.ok, true);
  } finally {
    global.fetch = originalFetch;
  }

  const metaPersistCall = fetchCalls.find(call => call.url.includes('/menu_meta?on_conflict=menu_id'));
  assert.ok(metaPersistCall, 'expected menu metadata persistence request');
  const metaPayload = JSON.parse(metaPersistCall.options.body);
  assert.equal(metaPayload.bot_id, 'legacy-bot-id');
  assert.equal(Object.prototype.hasOwnProperty.call(metaPayload, 'notifications'), false);
  assert.equal(fetchCalls.some(call => call.url.includes('/rest/v1/restaurants?id=eq.')), false);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
node --test tests/phase8-server-write-boundaries.test.cjs
```

Expected: FAIL with `Unexpected restaurant design persistence` or with `notifications` still present in the persisted menu meta payload.

- [ ] **Step 3: Remove notification persistence and restaurant design patching from `saveLiveMenuCommand`**

In `server/_menu-live.js`, replace `buildMenuMetaPatch` with:

```js
function buildMenuMetaPatch(meta = {}, ts) {
  const patch = { last_updated_ts: ts };
  if (Object.prototype.hasOwnProperty.call(meta, 'bot_id')) {
    patch.bot_id = asString(meta.bot_id);
  }
  return patch;
}
```

In the same file, remove this line from `saveLiveMenuCommand`:

```js
const restaurantDesignUpdated = await patchRestaurantDesignIfPresent(menu.restaurant_id, restaurant);
```

Then replace the returned compatibility object field:

```js
restaurantDesignUpdated,
```

with:

```js
restaurantDesignUpdated: false,
```

Leave `patchRestaurantDesignIfPresent` in place only if another live-save caller still imports it. If `rg "patchRestaurantDesignIfPresent" server api app.js` shows no other use, remove the whole function:

```js
async function patchRestaurantDesignIfPresent(restaurantId, restaurant = {}) {
  if (!restaurantId) return false;
  const hasDesign = Object.prototype.hasOwnProperty.call(restaurant, 'design');
  const design = hasDesign ? restaurant.design : undefined;
  if (!hasDesign) return false;

  const patch = { design: asObject(design) || {} };
  if (Object.prototype.hasOwnProperty.call(restaurant, 'use_custom_design')) {
    patch.use_custom_design = !!restaurant.use_custom_design;
  }

  const { sbUrl } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/rest/v1/restaurants?id=eq.${restaurantId}`, {
    method: 'PATCH',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw new Error(getApiErrorMessage(payload, 'Failed to persist restaurant design'));
  }
  return true;
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test tests/phase8-server-write-boundaries.test.cjs tests/phase22-category-governance.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_menu-live.js tests/phase8-server-write-boundaries.test.cjs
git commit -m "fix: keep manager live save out of admin settings"
```

---

### Task 2: Lock Down Supabase Profile Self-Insert

**Files:**
- Create: `supabase/migrations/20260428000000_lockdown_profile_self_insert.sql`
- Create: `tests/supabase-migrations-security.test.cjs`

- [ ] **Step 1: Write the failing migration security test**

Create `tests/supabase-migrations-security.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function readMigration(fileName) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8');
}

test('profile self-insert policy can only create role none profiles', () => {
  const source = readMigration('20260428000000_lockdown_profile_self_insert.sql');

  assert.match(source, /drop policy if exists "Users can insert own profile" on profiles;/);
  assert.match(source, /create policy "Users can insert own profile"/);
  assert.match(source, /for insert/);
  assert.match(source, /with check \(\s*auth\.uid\(\) = id\s+and\s+role = 'none'\s*\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/supabase-migrations-security.test.cjs
```

Expected: FAIL with `ENOENT` for `20260428000000_lockdown_profile_self_insert.sql`.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260428000000_lockdown_profile_self_insert.sql`:

```sql
drop policy if exists "Users can insert own profile" on profiles;

create policy "Users can insert own profile"
  on profiles for insert
  with check (
    auth.uid() = id
    and role = 'none'
  );
```

- [ ] **Step 4: Run the migration test**

Run:

```bash
node --test tests/supabase-migrations-security.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Run related server boundary tests**

Run:

```bash
node --test tests/phase15-auth-boundaries.test.cjs tests/admin-user-access-atomicity.test.cjs tests/supabase-migrations-security.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260428000000_lockdown_profile_self_insert.sql tests/supabase-migrations-security.test.cjs
git commit -m "fix: restrict profile self insert role"
```

---

### Task 3: Constrain Password Reset Redirects

**Files:**
- Modify: `server/_auth-proxy.js`
- Modify: `tests/auth-abuse-controls.test.cjs`

- [ ] **Step 1: Write the failing reset redirect test**

Append this test to `tests/auth-abuse-controls.test.cjs`:

```js
test('auth proxy normalizes password reset redirects to same-origin manager reset URL', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction, resetAuthAbuseLimitersForTest } = await import('../server/_auth-proxy.js');
    resetAuthAbuseLimitersForTest();

    const result = await executeAuthAction(createJsonRequest({
      action: 'reset_password',
      email: 'manager@example.com',
      redirect_to: 'https://evil.example/reset',
    }, {
      host: 'menus.example.test',
      'x-forwarded-proto': 'https',
      'x-real-ip': '203.0.113.88',
    }));

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/recover');
    assert.deepEqual(calls[0].body, {
      email: 'manager@example.com',
      redirect_to: 'https://menus.example.test/manager',
    });

    resetAuthAbuseLimitersForTest();
  });
});
```

- [ ] **Step 2: Run the auth test to verify it fails**

Run:

```bash
node --test tests/auth-abuse-controls.test.cjs
```

Expected: FAIL because `redirect_to` is still `https://evil.example/reset`.

- [ ] **Step 3: Add origin and redirect helpers**

In `server/_auth-proxy.js`, add these helpers after `readClientIp`:

```js
function readRequestOrigin(req) {
  const proto = readHeaderValue(req, 'x-forwarded-proto') || 'https';
  const host = readHeaderValue(req, 'x-forwarded-host') || readHeaderValue(req, 'host');
  if (!host) return '';
  return `${String(proto).split(',')[0].trim() || 'https'}://${String(host).split(',')[0].trim()}`;
}

function normalizePasswordResetRedirect(req, requestedRedirect = '') {
  const origin = readRequestOrigin(req);
  if (!origin) return '';
  try {
    const requested = new URL(String(requestedRedirect || ''), origin);
    const allowed = new URL('/manager', origin);
    if (requested.origin === allowed.origin && requested.pathname === '/manager') {
      return allowed.href;
    }
    return allowed.href;
  } catch (_) {
    return `${origin}/manager`;
  }
}
```

- [ ] **Step 4: Use the normalized redirect in `reset_password`**

Replace the `reset_password` case body in `executeAuthAction`:

```js
case 'reset_password':
  await supabaseAuthRequest('auth/v1/recover', {
    body: {
      email: String(body?.email || '').trim(),
      redirect_to: String(body?.redirect_to || body?.redirectTo || '').trim(),
    },
  }, 'Password reset request failed.');
  return { ok: true };
```

with:

```js
case 'reset_password':
  await supabaseAuthRequest('auth/v1/recover', {
    body: {
      email: String(body?.email || '').trim(),
      redirect_to: normalizePasswordResetRedirect(req, body?.redirect_to || body?.redirectTo || ''),
    },
  }, 'Password reset request failed.');
  return { ok: true };
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/auth-abuse-controls.test.cjs tests/web-auth-cookie-session.test.cjs tests/phase15-auth-boundaries.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/_auth-proxy.js tests/auth-abuse-controls.test.cjs
git commit -m "fix: constrain password reset redirects"
```

---

### Task 4: Add Menu-Gated Throttles To External Manager Lookups

**Files:**
- Create: `server/_manager-action-limits.js`
- Modify: `api/manager.js`
- Create: `tests/manager-external-actions-rate-limit.test.cjs`

- [ ] **Step 1: Write helper unit tests**

Create `tests/manager-external-actions-rate-limit.test.cjs`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

test('manager external action limiter blocks repeated action and IP keys', async () => {
  let now = 1_000;
  const {
    checkManagerExternalActionLimit,
    resetManagerExternalActionLimitersForTest,
    setManagerExternalActionLimiterNowForTest,
  } = await import('../server/_manager-action-limits.js');

  resetManagerExternalActionLimitersForTest();
  setManagerExternalActionLimiterNowForTest(() => now);

  const req = {
    headers: { 'x-real-ip': '203.0.113.111' },
    socket: { remoteAddress: '10.0.0.2' },
  };

  for (let index = 0; index < 20; index += 1) {
    assert.equal(checkManagerExternalActionLimit(req, 'product_lookup')?.status || 200, 200);
  }

  const blocked = checkManagerExternalActionLimit(req, 'product_lookup');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '60');
  assert.equal(blocked.body.error, 'Too many lookup requests. Please wait before trying again.');

  now = 62_000;
  assert.equal(checkManagerExternalActionLimit(req, 'product_lookup'), null);

  resetManagerExternalActionLimitersForTest();
  setManagerExternalActionLimiterNowForTest(null);
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
node --test tests/manager-external-actions-rate-limit.test.cjs
```

Expected: FAIL with module not found for `server/_manager-action-limits.js`.

- [ ] **Step 3: Add the limiter helper**

Create `server/_manager-action-limits.js`:

```js
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
```

- [ ] **Step 4: Add API route behavior tests**

Append this test to `tests/manager-external-actions-rate-limit.test.cjs`:

```js
test('manager external lookup actions require supported menu access before upstream lookup', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';

  const originalFetch = global.fetch;
  const fetchCalls = [];
  const manager = await import(`../api/manager.js?managerLookup=${Date.now()}-${Math.random()}`);
  const { resetManagerExternalActionLimitersForTest } = await import('../server/_manager-action-limits.js');
  resetManagerExternalActionLimitersForTest();

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, options });

    if (href.includes('/auth/v1/user')) {
      return { ok: true, async json() { return { id: 'user-1' }; } };
    }

    if (href.includes('/rest/v1/profiles?id=eq.user-1')) {
      return { ok: true, async json() { return [{ role: 'manager', name: 'Manager Tester' }]; } };
    }

    if (href.includes('/rest/v1/menu_access?user_id=eq.user-1&menu_id=eq.00000000-0000-0000-0000-000000000020')) {
      return { ok: true, async json() { return [{ menu_id: '00000000-0000-0000-0000-000000000020' }]; } };
    }

    throw new Error(`Unexpected upstream request: ${href}`);
  };

  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      'x-real-ip': '198.51.100.17',
    },
    body: {
      action: 'product_lookup',
      menu_id: '00000000-0000-0000-0000-000000000020',
      barcode: '123456789012',
    },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };

  try {
    await manager.default(req, res);
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
  }

  assert.equal(res.statusCode, 500);
  assert.match(String(res.body?.error || ''), /Unexpected upstream request/);
  assert.ok(fetchCalls.some(call => call.url.includes('/auth/v1/user')), 'expected auth check');
  assert.ok(fetchCalls.some(call => call.url.includes('/rest/v1/menu_access?')), 'expected menu access check before upstream lookup');
});
```

- [ ] **Step 5: Run the API route behavior test to verify it fails**

Run:

```bash
node --test tests/manager-external-actions-rate-limit.test.cjs
```

Expected: FAIL because `api/manager.js` does not import the limiter and does not require menu access for lookup actions.

- [ ] **Step 6: Apply throttling and menu access in `api/manager.js`**

Add imports:

```js
import { isSupportedMenuId } from '../server/_menu-read.js';
import { requireMenuAccess, requireRole, requireAuthenticatedUser, readProfile } from '../server/_auth.js';
import { checkManagerExternalActionLimit } from '../server/_manager-action-limits.js';
```

If `requireRole` is already imported from `../server/_auth.js`, extend the existing import rather than creating a duplicate.

Add this helper above the default handler:

```js
async function authorizeExternalLookup(req, body, action) {
  const limited = checkManagerExternalActionLimit(req, action);
  if (limited) throw limited;

  const menuId = String(body?.menu_id || body?.menuId || '').trim();
  if (!isSupportedMenuId(menuId)) throw { status: 400, message: 'Unsupported menu_id' };

  const { uid } = await requireAuthenticatedUser(req);
  const profile = await readProfile(uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  if (role !== 'manager' && role !== 'admin') throw { status: 403, message: 'Forbidden' };
  await requireMenuAccess(uid, role, menuId);
  return { menuId, uid, role };
}
```

Replace each external lookup authorization:

```js
await requireRole(req, 'manager', 'admin');
```

inside `product_lookup`, `untappd_search`, and `untappd_preview` with:

```js
await authorizeExternalLookup(req, body, action);
```

Update the catch block so helper-shaped rate-limit errors preserve headers when present:

```js
if (error?.headers && typeof res.setHeader === 'function') {
  for (const [key, value] of Object.entries(error.headers)) {
    res.setHeader(key, value);
  }
}
return res.status(error?.status || 500).json(error?.body || {
  error: error?.message || 'Server error',
  compatibility: error?.compatibility || null,
  audit: error?.audit || null,
});
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node --test tests/manager-external-actions-rate-limit.test.cjs tests/phase8-server-write-boundaries.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/_manager-action-limits.js api/manager.js tests/manager-external-actions-rate-limit.test.cjs
git commit -m "fix: throttle manager external lookups"
```

---

### Task 5: Add Public Cache Headers And A Lightweight Revision Endpoint

**Files:**
- Create: `server/_public-cache.js`
- Modify: `server/_menu-read.js`
- Modify: `api/public.js`
- Create: `tests/public-api-cache.test.cjs`

- [ ] **Step 1: Write cache helper tests**

Create `tests/public-api-cache.test.cjs`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

test('public JSON cache helper emits stable ETag and shared cache headers', async () => {
  const { buildPublicJsonCacheHeaders } = await import('../server/_public-cache.js');
  const headers = buildPublicJsonCacheHeaders({
    action: 'menu',
    revision: 1712705100000,
    appVersion: 'v1.2.3',
  });

  assert.equal(headers['Cache-Control'], 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
  assert.equal(headers.ETag, '"menu:v1.2.3:1712705100000"');
  assert.equal(headers.Vary, 'Accept-Encoding');
});

test('public JSON cache helper marks matching if-none-match as not modified', async () => {
  const { buildPublicJsonCacheHeaders, isPublicJsonNotModified } = await import('../server/_public-cache.js');
  const headers = buildPublicJsonCacheHeaders({
    action: 'landing',
    revision: 44,
    appVersion: 'v9',
  });

  assert.equal(isPublicJsonNotModified({ headers: { 'if-none-match': headers.ETag } }, headers), true);
  assert.equal(isPublicJsonNotModified({ headers: { 'if-none-match': '"other"' } }, headers), false);
});
```

- [ ] **Step 2: Run cache helper tests to verify they fail**

Run:

```bash
node --test tests/public-api-cache.test.cjs
```

Expected: FAIL with module not found for `server/_public-cache.js`.

- [ ] **Step 3: Add the cache helper**

Create `server/_public-cache.js`:

```js
function sanitizeToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, '-')
    .slice(0, 120) || 'none';
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
  const expected = String(headers.ETag || '').trim();
  if (!expected) return false;
  const actual = String(req?.headers?.['if-none-match'] || req?.headers?.['If-None-Match'] || '').trim();
  return actual === expected;
}

export function applyPublicJsonCacheHeaders(res, headers = {}) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}
```

- [ ] **Step 4: Add revision read tests**

Append this test to `tests/public-api-cache.test.cjs`:

```js
test('public revision payload reads only menu metadata needed for polling', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;
  const calls = [];
  const menuId = '00000000-0000-0000-0000-000000000020';

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, options });
    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=last_updated_ts,draft_saved_ts,last_sent_ts&limit=1`)) {
      return { ok: true, async json() { return [{ last_updated_ts: 123, draft_saved_ts: 99, last_sent_ts: 100 }]; } };
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const { readPublicMenuRevision } = await import(`../server/_menu-read.js?publicRevision=${Date.now()}-${Math.random()}`);
    const payload = await readPublicMenuRevision(menuId);
    assert.deepEqual(payload, {
      menuId,
      revision: 123,
      lastUpdatedTs: 123,
      lastSentTs: 100,
    });
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert.equal(calls.length, 1);
});
```

- [ ] **Step 5: Run revision test to verify it fails**

Run:

```bash
node --test tests/public-api-cache.test.cjs
```

Expected: FAIL because `readPublicMenuRevision` is not exported.

- [ ] **Step 6: Export `readPublicMenuRevision`**

In `server/_menu-read.js`, add this export near `readMenuStateBundle`:

```js
export async function readPublicMenuRevision(menuId) {
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const { sbUrl } = getSupabaseServerConfig();
  const rows = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}&select=last_updated_ts,draft_saved_ts,last_sent_ts&limit=1`,
    'Failed to load menu revision'
  );
  const meta = rows?.[0] || {};
  const lastUpdatedTs = meta?.last_updated_ts ? Number(meta.last_updated_ts) : 0;
  const lastSentTs = meta?.last_sent_ts ? Number(meta.last_sent_ts) : 0;
  return {
    menuId,
    revision: lastUpdatedTs,
    lastUpdatedTs,
    lastSentTs,
  };
}
```

- [ ] **Step 7: Wire cache headers and the revision action in `api/public.js`**

Add imports:

```js
import { APP_VERSION } from '../core/domain/constants.js';
import {
  applyPublicJsonCacheHeaders,
  buildPublicJsonCacheHeaders,
  isPublicJsonNotModified,
} from '../server/_public-cache.js';
```

Extend the existing `_menu-read.js` import with:

```js
readPublicMenuRevision,
```

Add this helper above the handler:

```js
function sendCachedJson(req, res, action, revision, payload) {
  const headers = buildPublicJsonCacheHeaders({ action, revision, appVersion: APP_VERSION });
  applyPublicJsonCacheHeaders(res, headers);
  if (isPublicJsonNotModified(req, headers)) {
    return res.status(304).end();
  }
  return res.json(payload);
}
```

Use it in the handler:

```js
if (action === 'landing') {
  const payload = await readLandingPageState({ includeDraft: false });
  const revision = payload?.published_at || payload?.updated_at || APP_VERSION;
  return sendCachedJson(req, res, 'landing', revision, payload);
}
```

```js
if (action === 'menu_index' || action === 'catalog') {
  const payload = await readMenuIndex();
  const catalog = createPublicMenuCatalogPayload(payload.menus);
  return sendCachedJson(req, res, action, APP_VERSION, {
    menus: catalog.menus,
    restaurants: action === 'catalog' ? catalog.restaurants : getKnownRestaurants(),
    appVersion: catalog.appVersion,
  });
}
```

Before the full menu payload branch, add:

```js
if (action === 'revision') {
  const menuId = parseMenuId(req);
  if (!isSupportedMenuId(menuId)) {
    return res.status(400).json({ error: 'Unsupported menu_id' });
  }
  const revision = await readPublicMenuRevision(menuId);
  return sendCachedJson(req, res, 'revision', revision.revision, revision);
}
```

Replace the final full menu return:

```js
const bundle = await readMenuStateBundle(menuId);
return res.json(createPublicMenuPayload(bundle));
```

with:

```js
const bundle = await readMenuStateBundle(menuId);
const payload = createPublicMenuPayload(bundle);
return sendCachedJson(req, res, 'menu', payload?.meta?.last_updated_ts || payload?.meta?.lastUpdatedTs || 0, payload);
```

- [ ] **Step 8: Add API handler cache behavior test**

Append this test to `tests/public-api-cache.test.cjs`:

```js
test('public API returns 304 for matching revision ETag', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;
  const menuId = '00000000-0000-0000-0000-000000000020';

  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=last_updated_ts,draft_saved_ts,last_sent_ts&limit=1`)) {
      return { ok: true, async json() { return [{ last_updated_ts: 123, draft_saved_ts: 99, last_sent_ts: 100 }]; } };
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };

  try {
    const api = await import(`../api/public.js?publicCache=${Date.now()}-${Math.random()}`);
    await api.default({
      method: 'GET',
      url: `/api/public?action=revision&menu_id=${menuId}`,
      headers: { 'if-none-match': '"revision:v0.8.15:123"' },
      query: { action: 'revision', menu_id: menuId },
    }, res);
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert.equal(res.statusCode, 304);
  assert.equal(res.body, null);
  assert.equal(res.headers['Cache-Control'], 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
});
```

If `APP_VERSION` is not `v0.8.15`, update only the expected ETag string to the value exported by `core/domain/constants.js`.

- [ ] **Step 9: Run focused tests**

Run:

```bash
node --test tests/public-api-cache.test.cjs tests/phase7-server-read-boundaries.test.cjs tests/public-launch-surface.test.cjs
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/_public-cache.js server/_menu-read.js api/public.js tests/public-api-cache.test.cjs
git commit -m "perf: add public cache validators"
```

---

### Task 6: Skip Full Public Polls When Revision Is Unchanged

**Files:**
- Modify: `core/data/menu-state-loader.js`
- Modify: `app.js`
- Create: `tests/public-polling-performance.test.cjs`

- [ ] **Step 1: Write a module test for unchanged revision polls**

Create `tests/public-polling-performance.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadSessionModule(relativePath) {
  const sandbox = {
    __HF_SESSION_MODULES__: {},
    console,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  vm.runInContext(source, sandbox, { filename: relativePath });
  return sandbox.__HF_SESSION_MODULES__;
}

test('menu state loader poll skips full state read when revision is unchanged', async () => {
  const modules = loadSessionModule('core/data/menu-state-loader.js');
  let revisionReads = 0;
  let stateReads = 0;
  const service = modules.createMenuStateLoaderService({
    getLastUpdatedTs: () => 123,
    readRevision: async () => {
      revisionReads += 1;
      return { revision: 123 };
    },
    readState: async () => {
      stateReads += 1;
      return { cats: [] };
    },
    buildSnapshot: source => ({ source }),
    getCategorySnapshot: () => '[]',
    getDesignSnapshot: () => '{}',
    getFeaturedSnapshot: () => '[]',
  });

  const result = await service.poll({ useRevisionProbe: true });

  assert.equal(revisionReads, 1);
  assert.equal(stateReads, 0);
  assert.deepEqual(result, {
    changed: false,
    designChanged: false,
    skipped: true,
    reason: 'revision-unchanged',
    snapshot: { source: 'poll' },
  });
});
```

- [ ] **Step 2: Run the polling test to verify it fails**

Run:

```bash
node --test tests/public-polling-performance.test.cjs
```

Expected: FAIL because `readRevision` is ignored and the state read still runs.

- [ ] **Step 3: Add `readRevision` dependency and unchanged fast path**

In `core/data/menu-state-loader.js`, inside `createMenuStateLoaderServiceImpl`, add this dependency near `readState`:

```js
const readRevision = typeof deps.readRevision === 'function' ? deps.readRevision : null;
```

At the top of `async poll(options = {})`, replace:

```js
void options;
const oldTs = getLastUpdatedTs();
```

with:

```js
const oldTs = getLastUpdatedTs();
if (options.useRevisionProbe && readRevision) {
  const revision = await readRevision({ request: options.request || globalScope.buildCurrentMenuPageRequest?.(), source: 'poll', options });
  const nextRevision = revision?.revision || revision?.lastUpdatedTs || 0;
  if (String(nextRevision || '') === String(oldTs || '')) {
    return {
      changed: false,
      designChanged: false,
      skipped: true,
      reason: 'revision-unchanged',
      snapshot: buildSnapshot('poll'),
    };
  }
}
```

- [ ] **Step 4: Mirror the same fast path in `app.js` fallback loader**

In `app.js`, inside the fallback `createMenuStateLoaderService` implementation, add:

```js
const readRevision = typeof deps.readRevision === 'function' ? deps.readRevision : null;
```

near the existing dependency reads.

At the top of its `poll(options = {})`, replace:

```js
void options;
const oldTs = getLastUpdatedTs();
```

with:

```js
const oldTs = getLastUpdatedTs();
if (options.useRevisionProbe && readRevision) {
  const revision = await readRevision({ request: options.request || buildCurrentMenuPageRequest(), source: 'poll', options });
  const nextRevision = revision?.revision || revision?.lastUpdatedTs || 0;
  if (String(nextRevision || '') === String(oldTs || '')) {
    return {
      changed: false,
      designChanged: false,
      skipped: true,
      reason: 'revision-unchanged',
      snapshot: buildSnapshot('poll'),
    };
  }
}
```

- [ ] **Step 5: Add public revision fetch in `app.js`**

Add this function near `sbRead`/public API read helpers:

```js
async function sbReadPublicRevision(request = buildCurrentMenuPageRequest()) {
  const menuId = request?.requestedMenuId || MENU_ID;
  if (!menuId) return null;
  const params = new URLSearchParams({ action: 'revision', menu_id: menuId });
  const response = await fetch(`/api/public?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 304) {
    return { revision: getLastUpdatedTs() || 0, notModified: true };
  }
  if (!response.ok) throw new Error('Failed to load menu revision');
  return response.json();
}
```

When creating the loader service, pass:

```js
readRevision: ({ request }) => sbReadPublicRevision(request),
```

In `getMenuPollScheduler`, change the refresh call:

```js
}).refresh({
  reason: 'poll',
  requestedMenuId: menuId,
  source: 'poll',
  expectedMenuType: menuType,
});
```

to:

```js
}).refresh({
  reason: 'poll',
  requestedMenuId: menuId,
  source: 'poll',
  expectedMenuType: menuType,
  useRevisionProbe: true,
});
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test tests/public-polling-performance.test.cjs tests/phase15-auth-unification-complete.test.cjs tests/phase7-server-read-boundaries.test.cjs
node --check app.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add core/data/menu-state-loader.js app.js tests/public-polling-performance.test.cjs
git commit -m "perf: skip unchanged public menu polls"
```

---

### Task 7: Add Polling Backoff After Repeated Errors

**Files:**
- Modify: `core/session/poll-scheduler.js`
- Modify: `app.js`
- Modify: `tests/public-polling-performance.test.cjs`

- [ ] **Step 1: Write scheduler backoff tests**

Append this test to `tests/public-polling-performance.test.cjs`:

```js
test('menu poll scheduler backs off after repeated errors and resets after success', async () => {
  const modules = loadSessionModule('core/session/poll-scheduler.js');
  let now = 1_000;
  let loaderCalls = 0;
  let errors = 0;

  const scheduler = modules.createMenuPollScheduler({
    loader: async () => {
      loaderCalls += 1;
      throw new Error('network down');
    },
    onResult: async result => result,
    onError: () => {
      errors += 1;
    },
    getContextKey: () => 'menu|drinks|restaurant',
    now: () => now,
    backoffBaseMs: 10_000,
    backoffMaxMs: 60_000,
  });

  await scheduler.tick();
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(loaderCalls, 3);
  assert.equal(errors, 3);

  await scheduler.tick();
  assert.equal(loaderCalls, 3, 'fourth immediate tick should be backed off');

  now = 11_001;
  await scheduler.tick();
  assert.equal(loaderCalls, 4);
});
```

- [ ] **Step 2: Run scheduler test to verify it fails**

Run:

```bash
node --test tests/public-polling-performance.test.cjs
```

Expected: FAIL because `now`, `backoffBaseMs`, and `backoffMaxMs` are ignored.

- [ ] **Step 3: Add backoff to `core/session/poll-scheduler.js`**

Inside `createMenuPollScheduler`, extend destructuring:

```js
const {
  loader,
  onResult,
  onError,
  getContextKey,
  now = () => Date.now(),
  backoffBaseMs = 10_000,
  backoffMaxMs = 120_000,
} = config;
```

Add state after the queue variables:

```js
let consecutiveErrors = 0;
let nextAllowedAt = 0;
```

At the top of `run`, after the in-flight check, add:

```js
const currentTime = now();
if (reason === 'interval' && nextAllowedAt && currentTime < nextAllowedAt) {
  return { skipped: true, reason: 'backoff', nextAllowedAt };
}
```

Inside the success branch after `finalResult = await onResult(...)`, add:

```js
consecutiveErrors = 0;
nextAllowedAt = 0;
```

Inside the catch branch after `onError(...)`, add:

```js
consecutiveErrors += 1;
if (consecutiveErrors >= 3) {
  const multiplier = Math.min(2 ** (consecutiveErrors - 3), Math.ceil(backoffMaxMs / backoffBaseMs));
  nextAllowedAt = now() + Math.min(backoffBaseMs * multiplier, backoffMaxMs);
}
```

Inside `reset()`, add:

```js
consecutiveErrors = 0;
nextAllowedAt = 0;
```

- [ ] **Step 4: Mirror the same backoff in `app.js` fallback scheduler**

Apply the same code changes to the fallback `createMenuPollScheduler` implementation in `app.js`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test tests/public-polling-performance.test.cjs
node --check app.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/session/poll-scheduler.js app.js tests/public-polling-performance.test.cjs
git commit -m "perf: back off public polling failures"
```

---

### Task 8: Optimize Leroy's Wall Images And Enforce Public Asset Budgets

**Files:**
- Modify: `leroyslounge/index.html`
- Create: `assets/leroys-lounge/wall/optimized/leroys-established-sign.png`
- Create: `assets/leroys-lounge/wall/optimized/leroys-horizontal-wood-sign.png`
- Create: `assets/leroys-lounge/wall/optimized/leroys-ice-cold-beer-sign.png`
- Create: `assets/leroys-lounge/wall/optimized/leroys-pool-free-play-sign.png`
- Create: `assets/leroys-lounge/wall/optimized/leroys-pull-tabs-sign.png`
- Create: `assets/leroys-lounge/wall/optimized/leroys-thumbs-up-panel.png`
- Create: `assets/leroys-lounge/wall/optimized/leroys-michigan-plate.png`
- Create: `assets/leroys-lounge/wall/optimized/leroys-margarita-note.png`
- Modify: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Write public image budget tests**

Append this test to `tests/public-launch-surface.test.cjs`:

```js
test('Leroy public wall images use optimized lazy assets for non-critical signs', () => {
  const path = require('node:path');
  const html = fs.readFileSync('leroyslounge/index.html', 'utf8');
  const imageTags = [...html.matchAll(/<img\b[^>]*class="([^"]*\bll-wall-[^"]*)"[^>]*>/g)].map(match => match[0]);

  assert.ok(imageTags.length >= 8, 'expected Leroy wall image tags');

  const nonCriticalTags = imageTags.filter(tag => !/ll-wall-location-sign|ll-wall-brand-sign|ll-wall-beer-sign/.test(tag));
  for (const tag of nonCriticalTags) {
    assert.match(tag, /loading="lazy"/, `${tag} must lazy load`);
    assert.match(tag, /decoding="async"/, `${tag} must async decode`);
    assert.match(tag, /\/assets\/leroys-lounge\/wall\/optimized\//, `${tag} must use optimized asset path`);
  }

  const optimizedFiles = [
    'leroys-established-sign.png',
    'leroys-horizontal-wood-sign.png',
    'leroys-ice-cold-beer-sign.png',
    'leroys-pool-free-play-sign.png',
    'leroys-pull-tabs-sign.png',
    'leroys-thumbs-up-panel.png',
    'leroys-michigan-plate.png',
    'leroys-margarita-note.png',
  ];

  for (const file of optimizedFiles) {
    const fullPath = path.join('assets', 'leroys-lounge', 'wall', 'optimized', file);
    assert.ok(fs.existsSync(fullPath), `${fullPath} must exist`);
    const size = fs.statSync(fullPath).size;
    assert.ok(size <= 700 * 1024, `${fullPath} must be 700KB or smaller, got ${size}`);
  }
});
```

- [ ] **Step 2: Run the image budget test to verify it fails**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
```

Expected: FAIL because optimized assets do not exist and non-critical images are eager.

- [ ] **Step 3: Generate optimized static assets**

Run these commands from the repo root:

```bash
mkdir -p assets/leroys-lounge/wall/optimized
sips -Z 1200 assets/leroys-lounge/wall/leroys-established-sign.png --out assets/leroys-lounge/wall/optimized/leroys-established-sign.png
sips -Z 1400 assets/leroys-lounge/wall/leroys-horizontal-wood-sign.png --out assets/leroys-lounge/wall/optimized/leroys-horizontal-wood-sign.png
sips -Z 1200 assets/leroys-lounge/wall/leroys-ice-cold-beer-sign.png --out assets/leroys-lounge/wall/optimized/leroys-ice-cold-beer-sign.png
sips -Z 1000 assets/leroys-lounge/wall/leroys-pool-free-play-sign.png --out assets/leroys-lounge/wall/optimized/leroys-pool-free-play-sign.png
sips -Z 1000 assets/leroys-lounge/wall/leroys-pull-tabs-sign.png --out assets/leroys-lounge/wall/optimized/leroys-pull-tabs-sign.png
sips -Z 1000 assets/leroys-lounge/wall/leroys-thumbs-up-panel.png --out assets/leroys-lounge/wall/optimized/leroys-thumbs-up-panel.png
sips -Z 1000 assets/leroys-lounge/wall/leroys-michigan-plate.png --out assets/leroys-lounge/wall/optimized/leroys-michigan-plate.png
sips -Z 1000 assets/leroys-lounge/wall/leroys-margarita-note.png --out assets/leroys-lounge/wall/optimized/leroys-margarita-note.png
```

If one generated file is still over 700KB, rerun that `sips` command with `-Z 800` for the same input/output path.

- [ ] **Step 4: Point Leroy HTML at optimized assets and lazy-load non-critical signs**

In `leroyslounge/index.html`, keep the top three header images eager but point them at optimized assets:

```html
<img class="ll-wall-location-sign" src="/assets/leroys-lounge/wall/optimized/leroys-established-sign.png" alt="EST. 2024, Fenton, MI" width="1680" height="916" decoding="async">
<a class="ll-wall-brand-link" href="/" aria-label="Return to the restaurant chooser">
  <img class="ll-wall-brand-sign" src="/assets/leroys-lounge/wall/optimized/leroys-horizontal-wood-sign.png" alt="Leroy's Lounge" width="2000" height="880" decoding="async">
</a>
<img class="ll-wall-beer-sign" src="/assets/leroys-lounge/wall/optimized/leroys-ice-cold-beer-sign.png" alt="Ice Cold Beer Served Here" width="1680" height="916" decoding="async">
```

Replace the side images with:

```html
<img class="ll-wall-side-image ll-wall-side-image--pool" src="/assets/leroys-lounge/wall/optimized/leroys-pool-free-play-sign.png" alt="Pool Free Play" width="1680" height="916" loading="lazy" decoding="async">
<a class="ll-wall-side-link ll-wall-pull-tabs-link" href="https://www.michiganlottery.com/resources/pull-tabs-prizes-remaining" target="_blank" rel="noopener noreferrer" aria-label="Open Michigan Lottery pull tabs prizes remaining">
  <img class="ll-wall-side-image ll-wall-side-image--pull-tabs" src="/assets/leroys-lounge/wall/optimized/leroys-pull-tabs-sign.png" alt="Pull Tabs Sold Here" width="1680" height="916" loading="lazy" decoding="async">
</a>
<img class="ll-wall-side-image ll-wall-side-image--leroy" src="/assets/leroys-lounge/wall/optimized/leroys-thumbs-up-panel.png" alt="Wood etched Leroy giving a thumbs up" width="1680" height="916" loading="lazy" decoding="async">
```

and:

```html
<img class="ll-wall-side-image ll-wall-side-image--plate" src="/assets/leroys-lounge/wall/optimized/leroys-michigan-plate.png" alt="Michigan license plate reading LER0YS" width="1680" height="916" loading="lazy" decoding="async">
<a class="ll-wall-side-link ll-wall-note-link" href="/elroyscantina?menu=drinks" aria-label="Open El Roy's drink menu">
  <img class="ll-wall-side-image ll-wall-side-image--note" src="/assets/leroys-lounge/wall/optimized/leroys-margarita-note.png" alt="Handwritten note: Try my famous margaritas upstairs. Thanks, Leroy." width="1680" height="916" loading="lazy" decoding="async">
</a>
```

- [ ] **Step 5: Run route tests**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add leroyslounge/index.html assets/leroys-lounge/wall/optimized tests/public-launch-surface.test.cjs
git commit -m "perf: optimize Leroy public wall assets"
```

---

### Task 9: Remove Manager/Admin Scripts From Public Route Boot

**Files:**
- Modify: `leroyslounge/index.html`
- Modify: `elroyscantina/index.html`
- Modify: `routes/shared/public-route-core.js`
- Modify: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Write public route script budget tests**

Append this test to `tests/public-launch-surface.test.cjs`:

```js
test('restaurant public routes do not boot manager or admin modules', () => {
  const routeFiles = ['leroyslounge/index.html', 'elroyscantina/index.html'];
  for (const file of routeFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /\/core\/ui\/manager\//, `${file} must not load manager UI modules`);
    assert.doesNotMatch(html, /\/core\/ui\/admin\//, `${file} must not load admin UI modules`);
    assert.doesNotMatch(html, /\/core\/landing\/admin-workspace\.js/, `${file} must not load landing admin workspace`);
    assert.match(html, /\/core\/ui\/public\/footer-actions\.js/, `${file} must keep public footer actions`);
    assert.match(html, /\/routes\/shared\/public-route-core\.js/, `${file} must keep route core`);
    assert.match(html, /\/app\.js/, `${file} still uses shared runtime until the final app split`);
  }
});
```

- [ ] **Step 2: Run script budget tests to verify they fail**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
```

Expected: FAIL because both public routes load manager/admin scripts.

- [ ] **Step 3: Remove public-route manager/admin script tags**

In `leroyslounge/index.html`, remove these script tags:

```html
<script src="/core/ui/manager/workspace.js"></script>
<script src="/core/ui/manager/sections.js"></script>
<script src="/core/ui/manager/editors.js"></script>
<script src="/core/ui/admin/workspace.js"></script>
<script src="/core/ui/admin/switcher.js"></script>
<script src="/core/landing/admin-workspace.js"></script>
```

In `elroyscantina/index.html`, remove the same script tags:

```html
<script src="/core/ui/manager/workspace.js"></script>
<script src="/core/ui/manager/sections.js"></script>
<script src="/core/ui/manager/editors.js"></script>
<script src="/core/ui/admin/workspace.js"></script>
<script src="/core/ui/admin/switcher.js"></script>
<script src="/core/landing/admin-workspace.js"></script>
```

- [ ] **Step 4: Add no-op public-safe module fallbacks if route boot needs them**

Run:

```bash
node scripts/check-html-script-order.cjs
node --test tests/public-launch-surface.test.cjs
```

If either command fails because `app.js` expects a manager/admin module boundary on public routes, add this small fallback block near the top of `routes/shared/public-route-core.js`:

```js
(function ensurePublicRouteModuleFallbacks(globalScope) {
  if (!globalScope) return;
  globalScope.__HF_MANAGER_MODULES__ = globalScope.__HF_MANAGER_MODULES__ || {};
  globalScope.__HF_ADMIN_MODULES__ = globalScope.__HF_ADMIN_MODULES__ || {};
  globalScope.__HF_MANAGER_MODULES__.createManagerWorkspace = globalScope.__HF_MANAGER_MODULES__.createManagerWorkspace || function createManagerWorkspaceFallback() {
    return null;
  };
  globalScope.__HF_MANAGER_MODULES__.createManagerSections = globalScope.__HF_MANAGER_MODULES__.createManagerSections || function createManagerSectionsFallback() {
    return null;
  };
  globalScope.__HF_MANAGER_MODULES__.createManagerEditors = globalScope.__HF_MANAGER_MODULES__.createManagerEditors || function createManagerEditorsFallback() {
    return null;
  };
  globalScope.__HF_ADMIN_MODULES__.createAdminWorkspace = globalScope.__HF_ADMIN_MODULES__.createAdminWorkspace || function createAdminWorkspaceFallback() {
    return null;
  };
  globalScope.__HF_ADMIN_MODULES__.createAdminSwitcher = globalScope.__HF_ADMIN_MODULES__.createAdminSwitcher || function createAdminSwitcherFallback() {
    return null;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

If the commands pass without this block, leave `routes/shared/public-route-core.js` unchanged for this task.

- [ ] **Step 5: Run focused verification**

Run:

```bash
node scripts/check-html-script-order.cjs
node --test tests/public-launch-surface.test.cjs tests/phase15-auth-unification-complete.test.cjs
node --check app.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

If `routes/shared/public-route-core.js` changed:

```bash
git add leroyslounge/index.html elroyscantina/index.html routes/shared/public-route-core.js tests/public-launch-surface.test.cjs
git commit -m "perf: slim public route script boot"
```

If `routes/shared/public-route-core.js` did not change:

```bash
git add leroyslounge/index.html elroyscantina/index.html tests/public-launch-surface.test.cjs
git commit -m "perf: slim public route script boot"
```

---

### Task 10: Let iOS Use Revision Checks Before Full Workspace Polls

**Files:**
- Modify: `ios/ElRoysManagerApp/Clients/BackendClients.swift`
- Modify: `ios/ElRoysManagerApp/App/AppModel.swift`
- Modify: `tests/ios-source-contracts.test.cjs`
- Modify: `docs/FEATURES.md`

- [ ] **Step 1: Write iOS source-shape tests**

Append these tests to `tests/ios-source-contracts.test.cjs`:

```js
test('iOS backend client exposes public menu revision fetch before workspace polling', () => {
  const source = fs.readFileSync('ios/ElRoysManagerApp/Clients/BackendClients.swift', 'utf8');

  assert.match(source, /struct MenuRevisionPayload: Decodable/);
  assert.match(source, /let revision: Int64\?/);
  assert.match(source, /func fetchRevision\(menuId: String\) async throws -> MenuRevisionPayload/);
  assert.match(source, /action=revision/);
});

test('iOS editor monitor checks revision before fetching full workspace', () => {
  const source = fs.readFileSync('ios/ElRoysManagerApp/App/AppModel.swift', 'utf8');
  const start = source.indexOf('func checkForRemoteMenuUpdate(menuId: String, force: Bool = false) async');
  const end = source.indexOf('func loadRestaurantTools', start);
  const body = source.slice(start, end);

  assert.match(body, /services\.publicMenuRevision\.fetchRevision\(menuId: menuId\)/);
  assert.match(body, /guard remoteRevision != currentRevision else \{ return \}/);
  assert.ok(
    body.indexOf('fetchRevision(menuId: menuId)') < body.indexOf('services.workspace.fetch(menuId: menuId'),
    'revision fetch must happen before full workspace fetch'
  );
});
```

- [ ] **Step 2: Run iOS source tests to verify they fail**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: FAIL because there is no revision client.

- [ ] **Step 3: Add revision payload and client**

In `ios/ElRoysManagerApp/Clients/BackendClients.swift`, add:

```swift
struct MenuRevisionPayload: Decodable {
  let menuId: String
  let revision: Int64?
  let lastUpdatedTs: Int64?
  let lastSentTs: Int64?
}

struct PublicMenuRevisionClient {
  let baseURL: URL
  let session: URLSession

  func fetchRevision(menuId: String) async throws -> MenuRevisionPayload {
    var components = URLComponents(url: baseURL.appendingPathComponent("api/public"), resolvingAgainstBaseURL: false)
    components?.queryItems = [
      URLQueryItem(name: "action", value: "revision"),
      URLQueryItem(name: "menu_id", value: menuId)
    ]
    guard let url = components?.url else {
      throw BackendError.invalidURL
    }
    let (data, response) = try await session.data(from: url)
    try BackendClientSupport.validate(response: response, data: data)
    return try BackendClientSupport.decoder.decode(MenuRevisionPayload.self, from: data)
  }
}
```

In the service container where `workspace`, `history`, and publish clients are built, add:

```swift
let publicMenuRevision: PublicMenuRevisionClient
```

and initialize it with the same `baseURL` and `session` used by the other clients:

```swift
self.publicMenuRevision = PublicMenuRevisionClient(baseURL: baseURL, session: session)
```

- [ ] **Step 4: Check revision before workspace fetch in `AppModel`**

In `ios/ElRoysManagerApp/App/AppModel.swift`, inside `checkForRemoteMenuUpdate(menuId:force:)`, replace:

```swift
do {
  let fetchedWorkspace = try await services.workspace.fetch(menuId: menuId, accessToken: accessToken)
  let workspace = normalizedEditorWorkspace(fetchedWorkspace)
  guard let currentWorkspace = currentEditorWorkspace else { return }
  guard workspace.workspace.revisions != currentWorkspace.workspace.revisions else { return }
```

with:

```swift
do {
  if !force {
    let revision = try await services.publicMenuRevision.fetchRevision(menuId: menuId)
    let remoteRevision = revision.revision ?? revision.lastUpdatedTs ?? 0
    let currentRevision = currentEditorWorkspace?.workspace.revisions.live ?? 0
    guard remoteRevision != currentRevision else { return }
  }

  let fetchedWorkspace = try await services.workspace.fetch(menuId: menuId, accessToken: accessToken)
  let workspace = normalizedEditorWorkspace(fetchedWorkspace)
  guard let currentWorkspace = currentEditorWorkspace else { return }
  guard workspace.workspace.revisions != currentWorkspace.workspace.revisions else { return }
```

If the live revision property has a different name than `workspace.revisions.live`, use the existing property that maps to `last_updated_ts` and update the test string in Step 1 to match that exact property.

- [ ] **Step 5: Document shared revision capability**

In `docs/FEATURES.md`, add this bullet under the shared web/iOS capabilities section:

```markdown
- Web public routes and the iOS editor can query `/api/public?action=revision&menu_id=<id>` before fetching full menu/workspace payloads, preserving live-update freshness while reducing repeated full-state reads.
```

- [ ] **Step 6: Run source and syntax checks**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs tests/public-api-cache.test.cjs
```

Expected: PASS.

If Xcode tooling is available, also run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Expected: build succeeds. If the Xcode project path or scheme differs, run `find ios -maxdepth 3 -name '*.xcodeproj' -o -name Package.swift` and use the project/scheme that exists.

- [ ] **Step 7: Commit**

```bash
git add ios/ElRoysManagerApp/Clients/BackendClients.swift ios/ElRoysManagerApp/App/AppModel.swift tests/ios-source-contracts.test.cjs docs/FEATURES.md
git commit -m "perf: let iOS poll menu revisions"
```

---

### Task 11: Final Verification And Release Notes

**Files:**
- Modify: `docs/FEATURES.md` if any shared behavior changed outside Task 10.

- [ ] **Step 1: Run full relevant verification**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/server-request-hardening.test.cjs tests/auth-abuse-controls.test.cjs tests/web-auth-cookie-session.test.cjs tests/phase8-server-write-boundaries.test.cjs tests/phase22-category-governance.test.cjs tests/ops-health.test.cjs tests/server-fetch-timeout.test.cjs tests/public-launch-surface.test.cjs tests/phase7-server-read-boundaries.test.cjs tests/phase15-auth-boundaries.test.cjs tests/phase15-auth-unification-complete.test.cjs tests/admin-user-access-atomicity.test.cjs tests/account-deletion-readiness.test.cjs tests/ios-source-contracts.test.cjs tests/supabase-migrations-security.test.cjs tests/manager-external-actions-rate-limit.test.cjs tests/public-api-cache.test.cjs tests/public-polling-performance.test.cjs
```

Expected: all tests pass.

- [ ] **Step 2: Verify no implementation accidentally broadened product scope**

Run:

```bash
rg -n "restaurant CRUD|create restaurant|delete restaurant|arbitrary restaurant|generic restaurant" app.js api server core docs tests ios
```

Expected: no new matches that indicate arbitrary restaurant/menu CRUD.

- [ ] **Step 3: Verify no secrets or token persistence regressions**

Run:

```bash
rg -n "SUPABASE_SERVICE_ROLE_KEY\\s*=|TWILIO_AUTH_TOKEN\\s*=|GROUPME_BOT_ID\\s*=|GENERIC_WEBHOOK_SECRET\\s*=|hf_sb_refresh_token|localStorage\\.setItem\\([^)]*(token|session|refresh)" --hidden --glob '!node_modules/**' --glob '!docs/superpowers/plans/**' .
```

Expected: no real secret assignments. Existing test strings may appear; web runtime must not write refresh tokens to localStorage.

- [ ] **Step 4: Inspect changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected: only files from the completed tasks are changed.

- [ ] **Step 5: Commit final documentation adjustments if needed**

If `docs/FEATURES.md` changed in this task:

```bash
git add docs/FEATURES.md
git commit -m "docs: document audit remediation behavior"
```

If `docs/FEATURES.md` did not change in this task, do not create an empty commit.

---

## Self-Review

**Spec coverage:** The plan covers all audit findings: manager live-save settings bypass, profile self-insert role escalation, password reset redirect normalization, lookup abuse controls, public JSON validators, revision-based polling, polling backoff, Leroy image payload reduction, public route script boot reduction, and iOS parity for revision polling.

**Placeholder scan:** The plan uses concrete file paths, test code, implementation snippets, and verification commands. Conditional steps include exact commands and exact code blocks for both branches.

**Type consistency:** The new names are consistent across tasks: `buildPublicJsonCacheHeaders`, `isPublicJsonNotModified`, `applyPublicJsonCacheHeaders`, `readPublicMenuRevision`, `checkManagerExternalActionLimit`, `resetManagerExternalActionLimitersForTest`, `setManagerExternalActionLimiterNowForTest`, `MenuRevisionPayload`, and `PublicMenuRevisionClient`.
