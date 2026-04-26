# App Store Account Deletion Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account deletion and privacy disclosures credible enough for TestFlight/App Store submission.

**Architecture:** Keep the current in-app deletion request entry point, but add a server-owned admin completion path, explicit legal/support contact content, and tests proving the request can be seen and completed. Do not delete accounts automatically from a client request; require an admin completion action so access removal and audit logging stay deliberate.

**Tech Stack:** SwiftUI, Vercel serverless JavaScript, Supabase Auth Admin REST via service role, plain HTML legal pages, Node tests.

---

## Ownership

Codex can handle code, tests, privacy-page wording, and admin UI plumbing. Project owner intervention is required for the real support/privacy email, deletion SLA, App Store Connect privacy nutrition labels, and final counsel/owner review of legal wording.

## File Structure

- Modify: `server/_auth-proxy.js` for request metadata shape if needed.
- Modify: `server/_admin-read-models.js` to expose pending account deletion requests.
- Modify: `api/admin.js` to accept an admin completion action.
- Modify: `admin/index.html` and `app.js` admin UI to show and complete deletion requests.
- Modify: `privacy.html`, `terms.html`, `docs/launch/app-store-privacy-checklist.md`.
- Modify: `ios/ElRoysManagerApp/App/AppModel.swift` and `ios/ElRoysManagerApp/Features/Home/HomeViews.swift` copy if needed.
- Test: `tests/account-deletion-readiness.test.cjs`.

### Task 1: Server Admin Contract For Deletion Requests

**Files:**
- Create: `tests/account-deletion-readiness.test.cjs`
- Modify: `server/_admin-read-models.js`
- Modify: `api/admin.js`

- [ ] **Step 1: Write failing source-contract tests**

Create `tests/account-deletion-readiness.test.cjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin API exposes account deletion request read and completion actions', () => {
  const apiSource = readFileSync('api/admin.js', 'utf8');
  assert.match(apiSource, /account_deletion_requests/);
  assert.match(apiSource, /complete_account_deletion_request/);
});

test('admin read models select deletion request metadata from auth users', () => {
  const source = readFileSync('server/_admin-read-models.js', 'utf8');
  assert.match(source, /account_deletion_requested/);
  assert.match(source, /pending_admin_review/);
  assert.match(source, /readAccountDeletionRequests/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/account-deletion-readiness.test.cjs
```

Expected: FAIL because the admin contract is missing.

- [ ] **Step 3: Add read model export**

In `server/_admin-read-models.js`, export:

```js
export async function readAccountDeletionRequests() {
  const { sbUrl, sbService } = getSupabaseServerConfig();
  const response = await fetch(`${sbUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: sbService,
      Authorization: `Bearer ${sbService}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw { status: 500, message: 'Failed to read account deletion requests' };
  const payload = await response.json();
  const users = Array.isArray(payload?.users) ? payload.users : [];
  return {
    ok: true,
    requests: users
      .filter(user => user?.user_metadata?.account_deletion_requested === true)
      .map(user => ({
        userId: user.id,
        email: user.email || '',
        requestedAt: user.user_metadata.account_deletion_requested_at || '',
        status: user.user_metadata.account_deletion_request_status || 'pending_admin_review',
        source: user.user_metadata.account_deletion_request_source || '',
      }))
      .filter(request => request.status === 'pending_admin_review'),
  };
}
```

- [ ] **Step 4: Add admin API read action**

Import `readAccountDeletionRequests` in `api/admin.js`, then add to the GET switch:

```js
case 'account_deletion_requests':
  return res.json(await readAccountDeletionRequests());
```

- [ ] **Step 5: Run test**

Run:

```bash
node --test tests/account-deletion-readiness.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/admin.js server/_admin-read-models.js tests/account-deletion-readiness.test.cjs
git commit -m "feat: expose account deletion requests to admins"
```

### Task 2: Admin Completion Action

**Files:**
- Modify: `server/_admin-read-models.js`
- Modify: `api/admin.js`
- Test: `tests/account-deletion-readiness.test.cjs`

- [ ] **Step 1: Add failing source-contract test**

Append:

```js
test('admin completion action removes access and marks deletion metadata complete', () => {
  const source = readFileSync('server/_admin-read-models.js', 'utf8');
  assert.match(source, /completeAccountDeletionRequest/);
  assert.match(source, /menu_access/);
  assert.match(source, /account_deletion_request_status/);
  assert.match(source, /completed/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/account-deletion-readiness.test.cjs
```

Expected: FAIL until completion helper exists.

- [ ] **Step 3: Implement completion helper**

Add this export to `server/_admin-read-models.js`:

```js
export async function completeAccountDeletionRequest(userId, actor = null) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw { status: 400, message: 'Missing user id' };
  const { sbUrl, sbService } = getSupabaseServerConfig();
  const serviceHeaders = {
    apikey: sbService,
    Authorization: `Bearer ${sbService}`,
    'Content-Type': 'application/json',
  };

  const accessResponse = await fetch(`${sbUrl}/rest/v1/menu_access?user_id=eq.${encodeURIComponent(normalizedUserId)}`, {
    method: 'DELETE',
    headers: serviceHeaders,
  });
  if (!accessResponse.ok) throw { status: 500, message: 'Failed to remove menu access' };

  const metadata = {
    account_deletion_requested: true,
    account_deletion_request_status: 'completed',
    account_deletion_completed_at: new Date().toISOString(),
    account_deletion_completed_by: actor?.uid || actor?.id || '',
  };

  const userResponse = await fetch(`${sbUrl}/auth/v1/admin/users/${encodeURIComponent(normalizedUserId)}`, {
    method: 'PUT',
    headers: serviceHeaders,
    body: JSON.stringify({ user_metadata: metadata }),
  });
  if (!userResponse.ok) throw { status: 500, message: 'Failed to mark deletion request complete' };

  return { ok: true, userId: normalizedUserId, status: 'completed' };
}
```

- [ ] **Step 4: Wire API action**

Import `completeAccountDeletionRequest`, then add this POST case to `api/admin.js`:

```js
case 'complete_account_deletion_request':
  return res.json(await completeAccountDeletionRequest(body?.user_id || body?.userId, actor));
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/account-deletion-readiness.test.cjs tests/admin-user-access-atomicity.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/admin.js server/_admin-read-models.js tests/account-deletion-readiness.test.cjs
git commit -m "feat: let admins complete account deletion requests"
```

### Task 3: Legal And Checklist Content

**Files:**
- Modify: `privacy.html`
- Modify: `terms.html`
- Modify: `docs/launch/app-store-privacy-checklist.md`
- Test: `tests/account-deletion-readiness.test.cjs`

- [ ] **Step 1: Add failing content test**

Append:

```js
test('privacy and terms expose concrete contact and deletion timeline', () => {
  const privacy = readFileSync('privacy.html', 'utf8');
  const terms = readFileSync('terms.html', 'utf8');
  assert.match(privacy, /privacy@elroys.example/);
  assert.match(privacy, /within 30 days/);
  assert.match(privacy, /remove menu access/);
  assert.match(terms, /support@elroys.example/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/account-deletion-readiness.test.cjs
```

Expected: FAIL until owner-approved contact values are inserted.

- [ ] **Step 3: Replace placeholder contacts after owner approval**

Use owner-provided contacts. If the owner approves `privacy@elroys.example` and `support@elroys.example` only for prelaunch testing, add those exact values and open a follow-up issue to replace them before public launch. The final production version must use real inboxes controlled by the restaurants.

Replace the Account Deletion and Contact paragraphs in `privacy.html`:

```html
<h2 id="account-deletion">Account Deletion</h2>
<p>Staff can initiate account deletion from the iOS Account screen. The request is recorded on the authenticated staff account for administrator review. An administrator will remove menu access, disable or delete the Supabase Auth account, and confirm completion within 30 days.</p>
<h2>Contact</h2>
<p>For privacy requests, email <a href="mailto:privacy@elroys.example">privacy@elroys.example</a>.</p>
```

Replace support copy in `terms.html`:

```html
<h2>Support</h2>
<p>For support, email <a href="mailto:support@elroys.example">support@elroys.example</a>.</p>
```

- [ ] **Step 4: Update App Store checklist**

Add this checked list to `docs/launch/app-store-privacy-checklist.md`:

```markdown
## Owner Confirmation Required

- [ ] Replace `privacy@elroys.example` with the production privacy inbox.
- [ ] Replace `support@elroys.example` with the production support inbox.
- [ ] Confirm the account deletion completion SLA is accurate.
- [ ] Complete App Store Connect privacy nutrition labels from this checklist.
- [ ] Confirm whether account records are disabled or permanently deleted in Supabase Auth.
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/account-deletion-readiness.test.cjs
```

Expected: PASS once the approved contact values match the test.

- [ ] **Step 6: Commit**

```bash
git add privacy.html terms.html docs/launch/app-store-privacy-checklist.md tests/account-deletion-readiness.test.cjs
git commit -m "docs: complete account deletion privacy readiness"
```

### Task 4: iOS Copy And Manual Verification

**Files:**
- Modify: `ios/ElRoysManagerApp/App/AppModel.swift`
- Modify: `ios/ElRoysManagerApp/Features/Home/HomeViews.swift`
- Test: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Add iOS source assertion**

Add to `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`:

```swift
func testAccountDeletionCopyStatesAdminCompletionTimeline() throws {
  let appModelSource = try String(contentsOf: appModelSourceURL(), encoding: .utf8)
  let homeSource = try String(contentsOf: homeViewsSourceURL(), encoding: .utf8)
  XCTAssertTrue(appModelSource.contains("within 30 days"))
  XCTAssertTrue(homeSource.contains("Account Deletion Details"))
}
```

If `appModelSourceURL()` or `homeViewsSourceURL()` does not exist, add helper functions beside the existing source-file helpers in the same test file.

- [ ] **Step 2: Run iOS test to verify it fails**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL until copy includes the timeline.

- [ ] **Step 3: Update iOS success notice**

Change the deletion success message in `AppModel.swift`:

```swift
message: "Your account deletion request was recorded for administrator review. Completion is handled by an administrator within 30 days."
```

- [ ] **Step 4: Run iOS tests**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/ElRoysManagerApp/App/AppModel.swift ios/ElRoysManagerApp/Features/Home/HomeViews.swift ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "fix: clarify iOS account deletion request flow"
```

## Self-Review Notes

- Spec coverage: covers in-app request, admin visibility, admin completion, privacy page, terms page, App Store checklist, iOS copy.
- Placeholder scan: owner-controlled contacts are explicitly marked as intervention points and not hidden as implementation placeholders.
- Intervention scan: owner must provide real inboxes, App Store Connect answers, and legal approval.
