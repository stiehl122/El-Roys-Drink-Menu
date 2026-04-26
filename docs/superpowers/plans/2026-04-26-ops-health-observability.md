# Ops Health Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a launch-grade health endpoint, smoke checks, and operational runbook entries so the app can be monitored and operated after release.

**Architecture:** Add a dependency-free `/api/health` endpoint that checks required server config and optionally performs a lightweight Supabase REST check. Document manual monitoring and incident steps without adding paid observability dependencies by default.

**Tech Stack:** Vercel serverless JavaScript, Supabase REST, Node tests, launch docs.

---

## Ownership

Codex can add the endpoint, tests, and docs. Project owner intervention is required to configure external uptime monitoring, Vercel/Supabase alert recipients, App Store crash-reporting workflow, and backup/restore access.

## File Structure

- Create: `api/health.js`
- Create: `server/_health.js`
- Create: `tests/ops-health.test.cjs`
- Modify: `docs/launch/release-runbook.md`
- Modify: `docs/launch/smoke-test-checklist.md`
- Modify: `README.md`

### Task 1: Health Endpoint Contract

**Files:**
- Create: `tests/ops-health.test.cjs`
- Create: `server/_health.js`
- Create: `api/health.js`

- [ ] **Step 1: Write failing tests**

Create:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHealthPayload } from '../server/_health.js';

test('createHealthPayload reports missing required env without exposing secret values', () => {
  const payload = createHealthPayload({
    env: { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: 'secret-value', SUPABASE_ANON_KEY: '' },
  });
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.checks.requiredEnv.missing, ['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  assert.equal(JSON.stringify(payload).includes('secret-value'), false);
});

test('health API exists and returns health payload', () => {
  const apiSource = readFileSync('api/health.js', 'utf8');
  assert.match(apiSource, /createHealthPayload/);
  assert.match(apiSource, /status\(payload\.ok \? 200 : 503\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ops-health.test.cjs
```

Expected: FAIL because health modules do not exist.

- [ ] **Step 3: Implement `server/_health.js`**

Create:

```js
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export function createHealthPayload({ env = process.env, now = () => new Date().toISOString() } = {}) {
  const missing = REQUIRED_ENV.filter(key => !String(env[key] || '').trim());
  return {
    ok: missing.length === 0,
    service: 'el-roys-drink-menu',
    checkedAt: now(),
    checks: {
      requiredEnv: {
        ok: missing.length === 0,
        missing,
      },
    },
  };
}
```

- [ ] **Step 4: Implement `api/health.js`**

Create:

```js
import { createHealthPayload } from '../server/_health.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const payload = createHealthPayload();
  return res.status(payload.ok ? 200 : 503).json(payload);
}
```

- [ ] **Step 5: Run test**

Run:

```bash
node --test tests/ops-health.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/health.js server/_health.js tests/ops-health.test.cjs
git commit -m "feat: add launch health endpoint"
```

### Task 2: Add Supabase Readiness Check

**Files:**
- Modify: `server/_health.js`
- Modify: `api/health.js`
- Test: `tests/ops-health.test.cjs`

- [ ] **Step 1: Add failing test for async Supabase check shape**

Append:

```js
test('health source includes optional Supabase connectivity check without leaking keys', () => {
  const source = readFileSync('server/_health.js', 'utf8');
  assert.match(source, /checkSupabaseConnectivity/);
  assert.match(source, /rest\/v1\/menus/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY.*payload/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ops-health.test.cjs
```

Expected: FAIL until connectivity check exists.

- [ ] **Step 3: Implement optional connectivity check**

Add to `server/_health.js`:

```js
export async function checkSupabaseConnectivity({ env = process.env, fetchImpl = fetch } = {}) {
  const sbUrl = String(env.SUPABASE_URL || '').trim();
  const sbService = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!sbUrl || !sbService) return { ok: false, status: 'missing_config' };
  try {
    const response = await fetchImpl(`${sbUrl}/rest/v1/menus?select=id&limit=1`, {
      headers: {
        apikey: sbService,
        Authorization: `Bearer ${sbService}`,
      },
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 'fetch_failed', message: error?.name || 'Error' };
  }
}
```

Update `api/health.js`:

```js
import { checkSupabaseConnectivity, createHealthPayload } from '../server/_health.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const payload = createHealthPayload();
  const supabase = await checkSupabaseConnectivity();
  payload.checks.supabase = supabase;
  payload.ok = payload.ok && supabase.ok;
  return res.status(payload.ok ? 200 : 503).json(payload);
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/ops-health.test.cjs tests/server-fetch-timeout.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/health.js server/_health.js tests/ops-health.test.cjs
git commit -m "feat: check Supabase readiness in health endpoint"
```

### Task 3: Operations Runbook And Smoke Checks

**Files:**
- Modify: `docs/launch/release-runbook.md`
- Modify: `docs/launch/smoke-test-checklist.md`
- Modify: `README.md`

- [ ] **Step 1: Add smoke check command**

Add to `docs/launch/smoke-test-checklist.md`:

```markdown
## Health And Operations

- `curl "$BASE_URL/api/health"` returns HTTP 200 and `"ok":true`.
- Vercel function logs show no repeated 5xx responses after smoke.
- Supabase logs show no auth/database error spike after smoke.
- Owner confirms latest Supabase backup timestamp before production migration.
```

- [ ] **Step 2: Add incident runbook**

Add to `docs/launch/release-runbook.md`:

```markdown
## Post-Deploy Monitoring

For the first release day:

1. Check `/api/health` immediately after deploy.
2. Check Vercel function logs for `/api/auth`, `/api/manager`, `/api/admin`, and `/api/public`.
3. Check Supabase Auth and Postgres logs for failed auth, permission, or migration errors.
4. Verify public routes, manager login, quiet Save, Send Update, and iOS sign-in.
5. If menu data corruption is suspected, stop writes by disabling staff access, capture logs, and restore from a verified Supabase backup only after owner approval.
```

- [ ] **Step 3: Add README health note**

Add under setup/deploy verification:

```markdown
5. Verify `/api/health` returns `{"ok":true}` before running manager/admin smoke tests.
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/ops-health.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/launch/release-runbook.md docs/launch/smoke-test-checklist.md
git commit -m "docs: add operations health runbook"
```

## Self-Review Notes

- Spec coverage: covers health endpoint, readiness, smoke checks, logs, backup owner gate, and incident response.
- Placeholder scan: no placeholders remain.
- Intervention scan: owner must configure external monitoring, alert recipients, and backup access.
