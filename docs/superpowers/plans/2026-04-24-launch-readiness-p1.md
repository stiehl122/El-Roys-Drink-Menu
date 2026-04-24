# Launch Readiness P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the important pre-launch risks that make a private beta fragile: security headers, server abuse controls, iOS data/config hardening, public launch surface completeness, and high-value QA coverage.

**Architecture:** Add narrow, dependency-free hardening around existing boundaries instead of changing the product model. Server changes stay in small shared helpers; web launch files remain static; iOS changes stay in native storage/config surfaces; tests prove the hardening without introducing a bundler or package manager.

**Tech Stack:** Plain HTML/CSS/JS, Vercel `vercel.json`, dependency-free Node server helpers, `node:test`, Swift/XCTest, Markdown docs.

---

## File Structure

- Modify: `vercel.json`
  Responsibility: Add security headers, cache rules, and static route handling without changing current rewrites.
- Create: `robots.txt`
  Responsibility: Give crawlers an explicit policy.
- Create: `sitemap.xml`
  Responsibility: List public launch routes.
- Create: `404.html`
  Responsibility: Provide a static broken-route fallback.
- Create: `500.html`
  Responsibility: Provide a static server-error fallback.
- Modify: `index.html`, `leroyslounge/index.html`, `elroyscantina/index.html`, `manager/index.html`, `admin/index.html`
  Responsibility: Add metadata, canonical URLs, and social preview data.
- Modify: `server/_request.js`
  Responsibility: Add dependency-free JSON body size/content-type validation.
- Create: `server/_fetch.js`
  Responsibility: Centralize timeout-bound fetch calls.
- Modify: `server/_product-lookup.js`, `server/_untappd.js`, `server/_notification-delivery.js`, `server/_landing-import.js`
  Responsibility: Use timeout-bound fetches for external providers.
- Create: `tests/server-request-hardening.test.cjs`
  Responsibility: Prove request parsing rejects oversized and invalid JSON bodies.
- Create: `tests/server-fetch-timeout.test.cjs`
  Responsibility: Prove timeout helper aborts hung requests.
- Modify: `ios/ElRoysManagerApp/Storage/OfflineDraftStore.swift`
  Responsibility: Apply iOS file protection to offline draft JSON files.
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`
  Responsibility: Verify protected draft file attributes.
- Modify: `ios/scripts/generate_project.rb`
  Responsibility: Make iOS environment configuration explicit and documented.
- Modify: `docs/launch/environment-matrix.md`
  Responsibility: Include iOS environment and provider config validation details.
- Create: `tests/public-launch-surface.test.cjs`
  Responsibility: Prove public launch files and metadata exist.

## Task 1: Add Production Security Headers

**Files:**
- Modify: `vercel.json`
- Create: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Write the failing header test**

Create `tests/public-launch-surface.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('vercel config defines launch security headers', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.ok(Array.isArray(config.headers), 'vercel.json must define headers');
  const headerNames = new Set(
    config.headers.flatMap(entry => (entry.headers || []).map(header => header.key.toLowerCase()))
  );

  for (const required of [
    'content-security-policy',
    'strict-transport-security',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'x-frame-options',
  ]) {
    assert.ok(headerNames.has(required), `missing ${required}`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/public-launch-surface.test.cjs`

Expected: FAIL because `vercel.json` has rewrites only.

- [ ] **Step 3: Add dependency-free Vercel headers**

Update `vercel.json` while preserving the existing rewrites:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.supabase.co https://world.openfoodfacts.org https://api.untappd.com https://api.groupme.com https://api.twilio.com https://discord.com https://discordapp.com; form-action 'self'"
        },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(self), microphone=(), geolocation=(), payment=()" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/leroyslounge", "destination": "/leroyslounge/index.html" },
    { "source": "/elroyscantina", "destination": "/elroyscantina/index.html" },
    { "source": "/manager", "destination": "/manager/index.html" },
    { "source": "/admin", "destination": "/admin/index.html" }
  ]
}
```

- [ ] **Step 4: Run the header test**

Run: `node --test tests/public-launch-surface.test.cjs`

Expected: PASS.

- [ ] **Step 5: Smoke-test CSP locally or on preview**

Open the Vercel preview or run the local static server used by the project, then verify public pages do not show CSP violations in the console. If a legitimate external provider is blocked, add only that specific origin.

- [ ] **Step 6: Commit**

```bash
git add vercel.json tests/public-launch-surface.test.cjs
git commit -m "chore: add production security headers"
```

## Task 2: Add Public Metadata, Robots, Sitemap, And Error Pages

**Files:**
- Create: `robots.txt`
- Create: `sitemap.xml`
- Create: `404.html`
- Create: `500.html`
- Modify: `index.html`
- Modify: `leroyslounge/index.html`
- Modify: `elroyscantina/index.html`
- Modify: `manager/index.html`
- Modify: `admin/index.html`
- Modify: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Extend the launch surface test**

Append to `tests/public-launch-surface.test.cjs`:

```js
test('public launch files exist', () => {
  for (const file of ['robots.txt', 'sitemap.xml', '404.html', '500.html']) {
    assert.ok(fs.existsSync(file), `${file} must exist before launch`);
  }
});

test('public html shells include launch metadata', () => {
  for (const file of ['index.html', 'leroyslounge/index.html', 'elroyscantina/index.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<meta name="description"/, `${file} missing meta description`);
    assert.match(html, /<link rel="canonical"/, `${file} missing canonical link`);
    assert.match(html, /<meta property="og:title"/, `${file} missing Open Graph title`);
    assert.match(html, /<meta name="twitter:card"/, `${file} missing Twitter card`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/public-launch-surface.test.cjs`

Expected: FAIL because these files and metadata are not complete.

- [ ] **Step 3: Create `robots.txt`**

```txt
User-agent: *
Allow: /

Sitemap: https://el-roys-drink-menu.vercel.app/sitemap.xml
```

- [ ] **Step 4: Create `sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://el-roys-drink-menu.vercel.app/</loc>
  </url>
  <url>
    <loc>https://el-roys-drink-menu.vercel.app/leroyslounge</loc>
  </url>
  <url>
    <loc>https://el-roys-drink-menu.vercel.app/elroyscantina</loc>
  </url>
</urlset>
```

- [ ] **Step 5: Create `404.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page Not Found | El Roy's Drink Menu</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="error-page">
  <main class="error-shell">
    <h1>Page Not Found</h1>
    <p>Choose a menu from the landing page.</p>
    <p><a href="/">Back to menus</a></p>
  </main>
</body>
</html>
```

- [ ] **Step 6: Create `500.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service Unavailable | El Roy's Drink Menu</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="error-page">
  <main class="error-shell">
    <h1>Service Unavailable</h1>
    <p>The menu service is having trouble. Please try again shortly.</p>
    <p><a href="/">Back to menus</a></p>
  </main>
</body>
</html>
```

- [ ] **Step 7: Add metadata to public shells**

Add this pattern to each public HTML head, using restaurant-specific text and canonical URL:

```html
<meta name="description" content="View current menus for Leroy's Lounge and El Roy's Cantina.">
<link rel="canonical" href="https://el-roys-drink-menu.vercel.app/">
<meta property="og:title" content="El Roy's Drink Menu">
<meta property="og:description" content="Choose Leroy's Lounge or El Roy's Cantina to view current menus.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://el-roys-drink-menu.vercel.app/">
<meta name="twitter:card" content="summary">
```

For `leroyslounge/index.html`, set canonical and OG URL to `/leroyslounge`. For `elroyscantina/index.html`, set canonical and OG URL to `/elroyscantina`.

- [ ] **Step 8: Add noindex metadata to staff/admin shells**

Add to `manager/index.html` and `admin/index.html`:

```html
<meta name="robots" content="noindex,nofollow">
```

- [ ] **Step 9: Run tests and HTML order check**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
node scripts/check-html-script-order.cjs
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add robots.txt sitemap.xml 404.html 500.html index.html leroyslounge/index.html elroyscantina/index.html manager/index.html admin/index.html tests/public-launch-surface.test.cjs
git commit -m "feat: complete public launch metadata"
```

## Task 3: Add Request Size, Content-Type, And JSON Parsing Guards

**Files:**
- Modify: `server/_request.js`
- Create: `tests/server-request-hardening.test.cjs`

- [ ] **Step 1: Write request hardening tests**

Create `tests/server-request-hardening.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonBody } = require('../server/_request.js');

function makeReq({ body = '', headers = {}, method = 'POST' } = {}) {
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body);
    },
  };
}

test('parseJsonBody rejects oversized JSON bodies', async () => {
  const body = JSON.stringify({ value: 'x'.repeat(1024 * 1024 + 1) });
  await assert.rejects(
    () => parseJsonBody(makeReq({
      body,
      headers: { 'content-type': 'application/json' },
    }), { maxBytes: 1024 }),
    /Request body too large/
  );
});

test('parseJsonBody rejects non-json content types when body is present', async () => {
  await assert.rejects(
    () => parseJsonBody(makeReq({
      body: '{"ok":true}',
      headers: { 'content-type': 'text/plain' },
    })),
    /Content-Type must be application\/json/
  );
});

test('parseJsonBody returns parsed JSON for valid bounded JSON body', async () => {
  const parsed = await parseJsonBody(makeReq({
    body: '{"ok":true}',
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }));
  assert.deepEqual(parsed, { ok: true });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/server-request-hardening.test.cjs`

Expected: FAIL until `parseJsonBody()` supports stream bodies, content type checks, and `maxBytes`.

- [ ] **Step 3: Harden `parseJsonBody()`**

Update `server/_request.js`:

```js
async function readRequestText(req, maxBytes = 1024 * 1024) {
  if (typeof req?.body === 'string') {
    if (Buffer.byteLength(req.body) > maxBytes) throw new Error('Request body too large');
    return req.body;
  }

  if (typeof req?.[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) throw new Error('Request body too large');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  return '';
}

async function parseJsonBody(req, options = {}) {
  const maxBytes = Number(options.maxBytes || 1024 * 1024);
  const contentType = String(req?.headers?.['content-type'] || req?.headers?.['Content-Type'] || '');
  const text = await readRequestText(req, maxBytes);
  if (!text.trim()) return {};
  if (!/^application\/json\b/i.test(contentType)) {
    throw new Error('Content-Type must be application/json');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

module.exports = {
  parseJsonBody,
  getRequestUrl,
};
```

Keep any existing exports from this file intact.

- [ ] **Step 4: Run request tests and API tests**

Run:

```bash
node --test tests/server-request-hardening.test.cjs tests/*.test.cjs tests/boundaries/*.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/_request.js tests/server-request-hardening.test.cjs
git commit -m "fix: harden server request parsing"
```

## Task 4: Add Timeout-Bound External Fetches

**Files:**
- Create: `server/_fetch.js`
- Modify: `server/_product-lookup.js`
- Modify: `server/_untappd.js`
- Modify: `server/_notification-delivery.js`
- Modify: `server/_landing-import.js`
- Create: `tests/server-fetch-timeout.test.cjs`

- [ ] **Step 1: Write timeout helper tests**

Create `tests/server-fetch-timeout.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithTimeout } = require('../server/_fetch.js');

test('fetchWithTimeout aborts hung requests', async () => {
  const started = Date.now();
  await assert.rejects(
    () => fetchWithTimeout('https://example.invalid/hang', {}, {
      timeoutMs: 10,
      fetchImpl: () => new Promise(() => {}),
    }),
    /timed out/
  );
  assert.ok(Date.now() - started < 500, 'timeout should not hang the test process');
});

test('fetchWithTimeout clears timeout after success', async () => {
  const response = await fetchWithTimeout('https://example.test/ok', {}, {
    timeoutMs: 100,
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(response.ok, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/server-fetch-timeout.test.cjs`

Expected: FAIL because `server/_fetch.js` does not exist.

- [ ] **Step 3: Add the helper**

Create `server/_fetch.js`:

```js
async function fetchWithTimeout(url, options = {}, config = {}) {
  const timeoutMs = Number(config.timeoutMs || 8000);
  const fetchImpl = config.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchWithTimeout };
```

- [ ] **Step 4: Replace external provider fetches**

In `server/_product-lookup.js`, `server/_untappd.js`, `server/_notification-delivery.js`, and `server/_landing-import.js`, import and use the helper for calls to third-party or user-provided URLs:

```js
const { fetchWithTimeout } = require('./_fetch.js');

const response = await fetchWithTimeout(url, {
  method: 'GET',
  headers,
}, { timeoutMs: 8000 });
```

Use shorter timeouts for notifications if needed:

```js
await fetchWithTimeout(webhookUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
}, { timeoutMs: 5000 });
```

- [ ] **Step 5: Run timeout and notification/provider tests**

Run:

```bash
node --test tests/server-fetch-timeout.test.cjs tests/phase22-untappd-boundaries.test.cjs tests/phase17-scanner-modules.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/_fetch.js server/_product-lookup.js server/_untappd.js server/_notification-delivery.js server/_landing-import.js tests/server-fetch-timeout.test.cjs
git commit -m "fix: add timeout-bound server fetches"
```

## Task 5: Protect iOS Offline Draft Files

**Files:**
- Modify: `ios/ElRoysManagerApp/Storage/OfflineDraftStore.swift`
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Add a file protection test**

Add this test near existing offline draft store tests in `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`:

```swift
func testOfflineDraftStoreAppliesFileProtection() throws {
  let rootURL = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString, isDirectory: true)
  let store = OfflineDraftStore(rootURL: rootURL, clientScopeId: "ios-phone")

  let draft = OfflineDraftRecord(
    userId: "user-1",
    menuId: "menu-1",
    updatedAt: Date(timeIntervalSince1970: 100),
    document: .empty(menuId: "menu-1", menuName: "Drinks", menuType: .drinks)
  )

  try store.save(draft)
  let fileURL = rootURL
    .appendingPathComponent("ios-phone", isDirectory: true)
    .appendingPathComponent("user-1", isDirectory: true)
    .appendingPathComponent("menu-1.json")
  let values = try fileURL.resourceValues(forKeys: [.fileProtectionKey])
  XCTAssertEqual(values.fileProtection, .completeUntilFirstUserAuthentication)
}
```

- [ ] **Step 2: Run the iOS test to verify it fails**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Expected: FAIL until file protection is applied. If P0 iOS configuration is not fixed yet, stop and complete the P0 iOS plan first.

- [ ] **Step 3: Apply file protection after writing drafts**

In `OfflineDraftStore.save(_:)`, after the JSON write succeeds, add:

```swift
try FileManager.default.setAttributes(
  [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
  ofItemAtPath: fileURL.path
)
```

If the store creates intermediate directories, also apply the same protection to the client and user directories after creation.

- [ ] **Step 4: Run iOS tests**

Run the same `xcodebuild ... test` command.

Expected: TEST SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add ios/ElRoysManagerApp/Storage/OfflineDraftStore.swift ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "fix: protect offline draft files"
```

## Task 6: Final P1 Verification

- [ ] **Step 1: Run web/server checks**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run iOS checks**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Expected: TEST SUCCEEDED.

- [ ] **Step 3: Re-run the launch audit**

Run the project launch-readiness audit skill and confirm these P1 issues no longer appear as open findings.

