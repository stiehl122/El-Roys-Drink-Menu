# Auth Abuse Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dependency-free abuse resistance around auth actions and document the required Supabase production auth settings.

**Architecture:** Add a tiny in-memory rate limiter for Vercel function instances and use it as a first line of defense for sign-in, sign-up, reset, refresh, and preview audit actions. This does not replace Supabase platform limits, so the launch checklist must verify production Supabase settings too.

**Tech Stack:** Plain JavaScript, Vercel serverless functions, Supabase Auth REST, Node tests.

---

## Ownership

Codex can handle the code, tests, and docs. Project owner intervention is required to verify production Supabase Auth settings, decide final password policy, and configure any Vercel firewall or provider-level rate limits.

## File Structure

- Create: `server/_rate-limit.js`
- Modify: `server/_auth-proxy.js`
- Modify: `docs/launch/environment-matrix.md`
- Modify: `docs/launch/smoke-test-checklist.md`
- Test: `tests/auth-abuse-controls.test.cjs`

### Task 1: Rate Limiter Helper

**Files:**
- Create: `server/_rate-limit.js`
- Create: `tests/auth-abuse-controls.test.cjs`

- [ ] **Step 1: Write failing tests**

Create:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../server/_rate-limit.js';

test('createRateLimiter blocks requests after the configured limit', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 1000 });
  assert.equal(limiter.check('ip:1').allowed, true);
  assert.equal(limiter.check('ip:1').allowed, true);
  const blocked = limiter.check('ip:1');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.status, 429);
});

test('createRateLimiter resets after the window', () => {
  let current = 1000;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => current });
  assert.equal(limiter.check('ip:1').allowed, true);
  assert.equal(limiter.check('ip:1').allowed, false);
  current = 2500;
  assert.equal(limiter.check('ip:1').allowed, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/auth-abuse-controls.test.cjs
```

Expected: FAIL because `server/_rate-limit.js` does not exist.

- [ ] **Step 3: Implement helper**

Create `server/_rate-limit.js`:

```js
export function createRateLimiter({ limit = 10, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();

  function check(key) {
    const normalizedKey = String(key || 'anonymous');
    const current = now();
    const existing = buckets.get(normalizedKey);
    if (!existing || existing.resetAt <= current) {
      buckets.set(normalizedKey, { count: 1, resetAt: current + windowMs });
      return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: current + windowMs };
    }
    if (existing.count >= limit) {
      return {
        allowed: false,
        status: 429,
        message: 'Too many requests. Try again soon.',
        retryAfter: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)),
      };
    }
    existing.count += 1;
    return { allowed: true, remaining: Math.max(0, limit - existing.count), resetAt: existing.resetAt };
  }

  return { check };
}
```

- [ ] **Step 4: Run test**

Run:

```bash
node --test tests/auth-abuse-controls.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_rate-limit.js tests/auth-abuse-controls.test.cjs
git commit -m "feat: add dependency-free rate limiter"
```

### Task 2: Apply Limiter To Auth Proxy

**Files:**
- Modify: `server/_auth-proxy.js`
- Test: `tests/auth-abuse-controls.test.cjs`

- [ ] **Step 1: Add source guard test**

Append:

```js
test('auth proxy applies rate limits to high-risk auth actions', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile('server/_auth-proxy.js', 'utf8'));
  assert.match(source, /createRateLimiter/);
  assert.match(source, /assertAuthRateLimit/);
  assert.match(source, /sign_in/);
  assert.match(source, /sign_up/);
  assert.match(source, /reset_password/);
  assert.match(source, /preview_audit_sign_in/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/auth-abuse-controls.test.cjs
```

Expected: FAIL because auth proxy does not import/use limiter.

- [ ] **Step 3: Wire limiter in `server/_auth-proxy.js`**

Import:

```js
import { createRateLimiter } from './_rate-limit.js';
```

Add module-level limiter:

```js
const authRateLimiter = createRateLimiter({
  limit: Number(process.env.AUTH_RATE_LIMIT_PER_WINDOW || 20),
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000),
});
```

Add helper:

```js
function readClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unknown');
}

function assertAuthRateLimit(req, action) {
  const riskyActions = new Set(['sign_in', 'sign_up', 'reset_password', 'preview_audit_sign_in', 'web_sign_in']);
  if (!riskyActions.has(action)) return;
  const result = authRateLimiter.check(`${action}:${readClientIp(req)}`);
  if (!result.allowed) {
    throw {
      status: result.status,
      message: result.message,
      headers: { 'Retry-After': String(result.retryAfter || 60) },
    };
  }
}
```

Call it immediately after reading `action`:

```js
assertAuthRateLimit(req, action);
```

- [ ] **Step 4: Preserve headers in `api/auth.js` error path**

In the `catch` block:

```js
if (error?.headers && typeof error.headers === 'object') {
  Object.entries(error.headers).forEach(([key, value]) => res.setHeader(key, value));
}
return res.status(error?.status || 500).json({ error: error?.message || 'Server error' });
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/auth-abuse-controls.test.cjs tests/server-request-hardening.test.cjs tests/phase15-auth-boundaries.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/auth.js server/_auth-proxy.js tests/auth-abuse-controls.test.cjs
git commit -m "fix: rate limit high-risk auth actions"
```

### Task 3: Document Production Auth Settings

**Files:**
- Modify: `docs/launch/environment-matrix.md`
- Modify: `docs/launch/smoke-test-checklist.md`

- [ ] **Step 1: Add env rows**

Add rows to `docs/launch/environment-matrix.md`:

```markdown
| `AUTH_RATE_LIMIT_PER_WINDOW` | Auth proxy | Optional | Vercel env | defaults to 20 attempts | auth abuse smoke |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Auth proxy | Optional | Vercel env | defaults to 5 minutes | auth abuse smoke |
```

- [ ] **Step 2: Add owner verification checklist**

Add to `docs/launch/smoke-test-checklist.md`:

```markdown
## Auth Abuse Settings

- Confirm Supabase production password minimum is at least 8 characters or owner-approved for staff-only beta.
- Confirm Supabase sign-in/sign-up rate limit is enabled.
- Confirm password reset emails cannot be spammed faster than the owner-approved threshold.
- Confirm repeated bad sign-ins eventually return HTTP 429 or Supabase equivalent throttling.
```

- [ ] **Step 3: Run docs/source tests**

Run:

```bash
node --test tests/auth-abuse-controls.test.cjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/launch/environment-matrix.md docs/launch/smoke-test-checklist.md
git commit -m "docs: document auth abuse launch checks"
```

## Self-Review Notes

- Spec coverage: covers app-side rate limit and production Supabase owner checks.
- Placeholder scan: no placeholders remain.
- Intervention scan: owner must verify production provider settings.
