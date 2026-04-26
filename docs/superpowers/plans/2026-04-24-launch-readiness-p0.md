# Launch Readiness P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the launch blockers found in the hostile tester / first-time user audit so the project can safely move from internal-only testing to a private beta readiness gate.

**Architecture:** Keep every fix inside the current zero-dependency architecture: plain HTML/CSS/JS, dependency-free Vercel functions, Supabase migrations/RPC for transactional data work, and native Swift/Xcode project files for iOS. Treat server-side state and access control as the source of truth; clients should not paper over failed persistence, authorization, or release configuration defects.

**Tech Stack:** Node/Vercel CommonJS handlers, Supabase SQL migrations, `node:test`, plain browser JavaScript, SwiftUI/XCTest, Xcode project/generator scripts, Markdown launch docs.

---

## File Structure

- Modify: `server/_admin-read-models.js`
  Responsibility: Stop replacing `menu_access` with a delete-then-insert sequence that can lose access rows on partial failure.
- Create: `supabase/migrations/20260424000000_update_user_menu_access_atomic.sql`
  Responsibility: Add a Supabase RPC that updates a user profile and menu access in a single transaction.
- Create: `tests/admin-user-access-atomicity.test.cjs`
  Responsibility: Prove the server calls the atomic RPC and no longer performs direct `menu_access` delete-before-insert writes.
- Modify: `app.js`
  Responsibility: Fix the restored draft / tied reorder dirty-state bug while preserving quiet Save vs Send Update semantics.
- Modify: `tests/manager-item-reorder-draft-state.test.cjs`
  Responsibility: Keep the existing failing dirty-state test green and add one narrower regression if needed.
- Modify: `server/_menu-publish.js`, `api/manager.js`, and related phase tests only if they represent real failing behavior.
  Responsibility: Reconcile failing publish/transport boundary tests with current architecture without weakening launch-critical coverage.
- Modify: `ios/scripts/generate_project.rb`
  Responsibility: Generate valid Debug, Preview, and Release build settings consistently.
- Modify: `ios/ElRoysManagerApp.xcodeproj/project.pbxproj`
  Responsibility: Apply generated project changes so `xcodebuild test` can launch the app.
- Modify: `ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme`
  Responsibility: Ensure test/build/archive actions point to real configurations.
- Create: `ios/ElRoysManagerApp/Resources/PrivacyInfo.xcprivacy`
  Responsibility: Add an explicit privacy manifest shell for the app and document whether required reason APIs are used.
- Modify: `ios/ElRoysManagerApp.xcodeproj/project.pbxproj`
  Responsibility: Include the privacy manifest in the app target resources.
- Create: `privacy.html`
  Responsibility: Provide a reachable privacy policy launch surface for web and App Store metadata.
- Create: `terms.html`
  Responsibility: Provide a reachable terms/support launch surface for web and App Store metadata.
- Modify: `app.js` and relevant iOS account/settings views
  Responsibility: Add a clear account deletion request path if the app supports sign-up.
- Create: `docs/launch/release-runbook.md`
  Responsibility: Document release, deploy, migration, rollback, backup, and post-deploy smoke steps.
- Create: `docs/launch/environment-matrix.md`
  Responsibility: Document required and optional env vars for Vercel, Supabase, notifications, preview audit, and iOS.

## Task 1: Make Admin User Access Updates Atomic

**Files:**
- Create: `tests/admin-user-access-atomicity.test.cjs`
- Modify: `server/_admin-read-models.js`
- Create: `supabase/migrations/20260424000000_update_user_menu_access_atomic.sql`

- [ ] **Step 1: Write the failing test**

Create `tests/admin-user-access-atomicity.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', 'server', '_admin-read-models.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('admin updateUserAccess uses atomic RPC instead of deleting menu_access rows first', () => {
  assert.match(
    source,
    /rpc\/update_user_profile_and_menu_access/,
    'updateUserAccess must call the transactional Supabase RPC'
  );
  assert.doesNotMatch(
    source,
    /rest\/v1\/menu_access\?user_id=eq\.\$\{userId\}/,
    'updateUserAccess must not delete all existing access rows before inserting replacements'
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/admin-user-access-atomicity.test.cjs`

Expected: FAIL because `server/_admin-read-models.js` still contains direct `menu_access` delete/insert logic and no RPC call.

- [ ] **Step 3: Add the atomic Supabase RPC migration**

Create `supabase/migrations/20260424000000_update_user_menu_access_atomic.sql`:

```sql
create or replace function public.update_user_profile_and_menu_access(
  target_user_id uuid,
  target_full_name text,
  target_role text,
  target_menu_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role text;
  normalized_menu_ids uuid[];
begin
  normalized_role := coalesce(nullif(trim(target_role), ''), 'manager');

  if normalized_role not in ('manager', 'admin') then
    raise exception 'Invalid role: %', normalized_role using errcode = '22023';
  end if;

  normalized_menu_ids := coalesce(target_menu_ids, array[]::uuid[]);

  update public.profiles
  set
    full_name = nullif(trim(coalesce(target_full_name, '')), ''),
    role = normalized_role,
    updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;

  delete from public.menu_access
  where user_id = target_user_id
    and not (menu_id = any(normalized_menu_ids));

  insert into public.menu_access (user_id, menu_id)
  select target_user_id, menu_id
  from unnest(normalized_menu_ids) as menu_id
  on conflict (user_id, menu_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'userId', target_user_id,
    'role', normalized_role,
    'menuIds', normalized_menu_ids
  );
end;
$$;

revoke all on function public.update_user_profile_and_menu_access(uuid, text, text, uuid[]) from public;
grant execute on function public.update_user_profile_and_menu_access(uuid, text, text, uuid[]) to service_role;
```

- [ ] **Step 4: Replace delete-then-insert with the RPC call**

In `server/_admin-read-models.js`, replace the body of `updateUserAccess()` after input normalization with this pattern:

```js
async function updateUserAccess(body = {}) {
  const userId = String(body.userId || '').trim();
  if (!userId) throw { status: 400, message: 'User id is required' };

  const fullName = String(body.fullName || '').trim();
  const role = String(body.role || 'manager').trim() || 'manager';
  const menuIds = Array.isArray(body.menuIds)
    ? body.menuIds.map(id => String(id || '').trim()).filter(Boolean)
    : [];

  const sbUrl = getSupabaseUrl();
  const sbService = getSupabaseServiceKey();
  const response = await fetch(`${sbUrl}/rest/v1/rpc/update_user_profile_and_menu_access`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }, sbService),
    body: JSON.stringify({
      target_user_id: userId,
      target_full_name: fullName,
      target_role: role,
      target_menu_ids: menuIds,
    }),
  });

  if (!response.ok) {
    const message = await getResponseError(response, 'Failed to update user access');
    throw { status: response.status || 500, message };
  }

  return { ok: true };
}
```

- [ ] **Step 5: Run the atomicity test**

Run: `node --test tests/admin-user-access-atomicity.test.cjs`

Expected: PASS.

- [ ] **Step 6: Run admin/server-adjacent tests**

Run: `node --test tests/phase9-publish-specials-boundaries.test.cjs tests/architecture-boundaries.test.cjs`

Expected: PASS. If a test fails because it asserts the old delete-then-insert implementation, update that test to assert the RPC boundary instead.

- [ ] **Step 7: Commit**

```bash
git add server/_admin-read-models.js supabase/migrations/*_update_user_menu_access_atomic.sql tests/admin-user-access-atomicity.test.cjs
git commit -m "fix: update manager access atomically"
```

## Task 2: Make The Node Launch Regression Suite Green

**Files:**
- Modify: `app.js`
- Modify: `tests/manager-item-reorder-draft-state.test.cjs`
- Modify only if behavior is truly stale: `tests/phase10-conflict-hardening-boundaries.test.cjs`, `tests/phase2-module-extraction.test.cjs`, `tests/phase5-api-transport-consolidation.test.cjs`, `server/_menu-publish.js`, `api/manager.js`

- [ ] **Step 1: Reproduce the current failures**

Run:

```bash
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
```

Expected: FAIL until the five known launch-audit failures are either fixed in code or reviewed and replaced with equivalent current-architecture coverage.

- [ ] **Step 2: Isolate the real dirty-state failure**

Run:

```bash
node --test tests/manager-item-reorder-draft-state.test.cjs
```

Expected: FAIL at the tied draft canonicalization assertion that expects `hasActualLocalDraftChanges()` to be `false`.

- [ ] **Step 3: Fix canonical tied-item comparison**

In `app.js`, find the persisted draft hydration / dirty comparison helpers used by `applyPersistedDraftState()`. Ensure both the restored draft and the baseline snapshot are normalized with the same deterministic item ordering before dirty-state comparison. Use this comparator shape:

```js
function compareDraftItemsForDirtyState(left = {}, right = {}) {
  const leftOrder = Number(left.display_order ?? left.displayOrder ?? 0);
  const rightOrder = Number(right.display_order ?? right.displayOrder ?? 0);
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftId = String(left.id || '');
  const rightId = String(right.id || '');
  if (leftId !== rightId) return leftId.localeCompare(rightId);

  return String(left.name || '').localeCompare(String(right.name || ''));
}

function normalizeDraftItemsForDirtyState(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort(compareDraftItemsForDirtyState);
}
```

Then apply `normalizeDraftItemsForDirtyState()` to every per-category item array before comparing restored draft state against the last persisted/server state. Do not change public rendering order, category deletion behavior, or Save/Send semantics in this task.

- [ ] **Step 4: Run the dirty-state test**

Run:

```bash
node --test tests/manager-item-reorder-draft-state.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Triage the four phase/boundary failures**

Run each failing file independently:

```bash
node --test tests/phase10-conflict-hardening-boundaries.test.cjs
node --test tests/phase2-module-extraction.test.cjs
node --test tests/phase5-api-transport-consolidation.test.cjs
```

Expected: each file either PASS after implementation fixes or a reviewed test update that preserves equivalent launch coverage.

- [ ] **Step 6: Preserve publish conflict hardening**

If `tests/phase10-conflict-hardening-boundaries.test.cjs` still fails, update `server/_menu-publish.js` so revision conflict checks happen before notification side effects. The publish path should keep this ordering:

```js
const currentRevisions = readRevisionState(meta);
const expectedDraftRevision = normalizeRevision(payload.expectedDraftRevision);
const expectedNotificationRevision = normalizeRevision(payload.expectedNotificationRevision);
const notificationBaselineRevision = expectedNotificationRevision ?? expectedDraftRevision;

assertNoDraftRevisionConflict(currentRevisions, expectedDraftRevision);
assertNoNotificationRevisionConflict(currentRevisions, notificationBaselineRevision);

// Only after conflicts are ruled out:
await persistPublishedMenuState(/* existing args */);
await deliverNotificationsIfNeeded(/* existing args */);
```

- [ ] **Step 7: Preserve API transport boundary coverage**

If `tests/phase5-api-transport-consolidation.test.cjs` fails because the implementation moved from `../server/_supabase.js` to a better shared helper, update the test to assert the actual desired boundary instead of the old filename. The test must still prove:

```js
assert.match(managerSource, /require\(['"].*server\/_auth/);
assert.match(managerSource, /require\(['"].*server\/_request/);
assert.doesNotMatch(managerSource, /SUPABASE_SERVICE_ROLE_KEY.*SUPABASE_SERVICE_ROLE_KEY/s);
```

- [ ] **Step 8: Run the full Node suite**

Run:

```bash
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
```

Expected: PASS.

- [ ] **Step 9: Run syntax checks**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
```

Expected: both PASS.

- [ ] **Step 10: Commit**

```bash
git add app.js server/_menu-publish.js api/manager.js tests
git commit -m "fix: clear launch regression suite"
```

## Task 3: Repair iOS Build Configurations And Test Launch

**Files:**
- Modify: `ios/scripts/generate_project.rb`
- Modify: `ios/ElRoysManagerApp.xcodeproj/project.pbxproj`
- Modify: `ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme`
- Test: `ios/ElRoysManagerAppTests/*.swift`
- Test: `ios/ElRoysManagerAppUITests/*.swift`

- [ ] **Step 1: Reproduce the iOS launch failure**

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

Expected: FAIL until Debug configuration and scheme output paths are fixed.

- [ ] **Step 2: Update the generator configuration list**

In `ios/scripts/generate_project.rb`, ensure each target receives exactly `Debug` and `Release` configurations and that the app target settings set environment names intentionally:

```ruby
def apply_app_build_settings(config, bundle_id)
  settings = config.build_settings
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = bundle_id
  settings['CURRENT_PROJECT_VERSION'] = '1'
  settings['MARKETING_VERSION'] = '0.1.0'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '18.0'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['DEVELOPMENT_TEAM'] = ENV.fetch('APPLE_DEVELOPMENT_TEAM', 'FCM3AK447F')
  settings['APPBaseURL'] = ENV.fetch('ELROYS_IOS_APP_BASE_URL', 'https://el-roys-drink-menu.vercel.app')
  settings['APPPublicOrigin'] = ENV.fetch('ELROYS_IOS_PUBLIC_ORIGIN', 'https://el-roys-drink-menu.vercel.app')
  settings['APPEnvironmentName'] = config.name == 'Release' ? 'Production' : 'Preview'
end
```

Also ensure the scheme test action references `Debug` and the generated project actually contains a `Debug` configuration for the app, unit test, and UI test targets.

- [ ] **Step 3: Regenerate the project**

Run:

```bash
ruby ios/scripts/generate_project.rb
```

Expected: `ios/ElRoysManagerApp.xcodeproj/project.pbxproj` and scheme files are updated deterministically.

- [ ] **Step 4: Build Debug explicitly**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Expected: BUILD SUCCEEDED with no warning that Debug is missing.

- [ ] **Step 5: Run iOS tests**

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

Expected: TEST SUCCEEDED and the UI test can launch `ElRoysManagerApp.app`.

- [ ] **Step 6: Commit**

```bash
git add ios/scripts/generate_project.rb ios/ElRoysManagerApp.xcodeproj
git commit -m "fix: repair iOS test build configurations"
```

## Task 4: Add App Store Privacy, Terms, And Account Deletion Readiness

**Files:**
- Create: `privacy.html`
- Create: `terms.html`
- Create: `ios/ElRoysManagerApp/Resources/PrivacyInfo.xcprivacy`
- Modify: `ios/ElRoysManagerApp.xcodeproj/project.pbxproj`
- Modify: iOS account/settings/auth view that currently exposes sign-up/account state
- Modify: public/footer HTML or shared footer rendering in `app.js`
- Create: `docs/launch/app-store-privacy-checklist.md`

- [ ] **Step 1: Create the privacy page**

Create `privacy.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Policy | El Roy's Drink Menu</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="legal-page">
  <main class="legal-shell">
    <h1>Privacy Policy</h1>
    <p>Last updated: April 24, 2026</p>
    <p>This app is used to manage menus for Leroy's Lounge and El Roy's Cantina.</p>
    <h2>Information We Process</h2>
    <p>Staff accounts use email addresses and authentication session data. Menu edits, menu drafts, publish history, and notification settings are stored to operate the menu management service.</p>
    <h2>Third-Party Services</h2>
    <p>The service uses Supabase for authentication and database storage. Optional notification providers may include GroupMe, Twilio, Discord, or a configured webhook.</p>
    <h2 id="account-deletion">Account Deletion</h2>
    <p>Staff can request account deletion from the iOS Account screen or by contacting an administrator at the restaurant. Administrators must remove menu access, delete or disable the staff account in Supabase Auth, and confirm completion with the requester.</p>
    <h2>Contact</h2>
    <p>For privacy requests, contact the restaurant administrator who manages staff access.</p>
  </main>
</body>
</html>
```

- [ ] **Step 2: Create the terms page**

Create `terms.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Terms | El Roy's Drink Menu</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="legal-page">
  <main class="legal-shell">
    <h1>Terms</h1>
    <p>Last updated: April 24, 2026</p>
    <p>This service is for authorized staff managing menus for Leroy's Lounge and El Roy's Cantina.</p>
    <h2>Authorized Use</h2>
    <p>Only approved staff and administrators may access manager and admin tools.</p>
    <h2>Support</h2>
    <p>For support, contact the restaurant administrator who manages staff access.</p>
  </main>
</body>
</html>
```

- [ ] **Step 3: Add the privacy manifest**

Create `ios/ElRoysManagerApp/Resources/PrivacyInfo.xcprivacy`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
</dict>
</plist>
```

If the app uses APIs Apple classifies as required-reason APIs, update `NSPrivacyAccessedAPITypes` with the required reasons before App Store submission.

- [ ] **Step 4: Add legal links to web footer staff actions**

In the shared footer rendering path in `app.js`, add footer links without moving the staff sign-in entry out of the footer:

```js
const legalLinksHtml = `
  <a class="footer-link" href="/privacy.html">Privacy</a>
  <a class="footer-link" href="/terms.html">Terms</a>
`;
```

Place the links near existing footer actions, not at the top of public pages.

- [ ] **Step 5: Add an iOS account deletion request action**

In the authenticated account/settings view, add a button that opens the account deletion section of the privacy page until a server-side self-service deletion endpoint exists:

```swift
Button("Request Account Deletion") {
  if let url = URL(string: "https://el-roys-drink-menu.vercel.app/privacy.html#account-deletion") {
    UIApplication.shared.open(url)
  }
}
.accessibilityHint("Opens account deletion instructions for your staff account.")
```

- [ ] **Step 6: Document App Store privacy answers**

Create `docs/launch/app-store-privacy-checklist.md`:

```markdown
# App Store Privacy Checklist

- Privacy policy URL: `/privacy.html`
- Terms URL: `/terms.html`
- Account deletion path: in-app link to `/privacy.html#account-deletion` and administrator deletion process.
- Authentication provider: Supabase.
- Database provider: Supabase.
- Optional notification providers: GroupMe, Twilio, Discord, generic webhook.
- Camera usage: barcode scanner for menu item lookup.
- Tracking: none unless a future analytics tool is added.
- Third-party SDKs: none beyond Apple system frameworks in the native app.
- Privacy manifest: `ios/ElRoysManagerApp/Resources/PrivacyInfo.xcprivacy`.

Before TestFlight/App Store submission, the project owner must confirm the administrator deletion process and complete App Store Connect privacy nutrition labels.
```

- [ ] **Step 7: Verify launch legal pages do not contain fake support values**

Run:

```bash
rg -n "example\\.com" privacy.html terms.html docs/launch/app-store-privacy-checklist.md ios/ElRoysManagerApp
```

Expected: no matches before commit.

- [ ] **Step 8: Run syntax/build checks**

Run:

```bash
node --check app.js
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add privacy.html terms.html app.js ios docs/launch/app-store-privacy-checklist.md
git commit -m "feat: add launch privacy and account deletion readiness"
```

## Task 5: Create The Release, Environment, Backup, And Smoke Runbooks

**Files:**
- Create: `docs/launch/release-runbook.md`
- Create: `docs/launch/environment-matrix.md`
- Create: `docs/launch/smoke-test-checklist.md`

- [ ] **Step 1: Create the environment matrix**

Create `docs/launch/environment-matrix.md`:

```markdown
# Environment Matrix

| Config item | Used by | Required? | Production source | Failure behavior | Validation |
|---|---|---:|---|---|---|
| `SUPABASE_URL` | Vercel API | Yes | Vercel env | API returns server misconfigured | `curl /api/auth?mode=bootstrap` |
| `SUPABASE_ANON_KEY` | Auth proxy/bootstrap | Yes | Vercel env | login/bootstrap fails | login smoke |
| `SUPABASE_SERVICE_ROLE_KEY` | Server data access | Yes | Vercel env | API returns server misconfigured | manager menu load smoke |
| `VERCEL_ENV` | Preview badges/audit gating | Yes on Vercel | Vercel system env | preview/prod branching wrong | inspect footer badge |
| `LOOP_MANAGER_EMAIL` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview sign-in smoke |
| `LOOP_MANAGER_PASSWORD` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview sign-in smoke |
| `LOOP_ADMIN_EMAIL` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview admin smoke |
| `LOOP_ADMIN_PASSWORD` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview admin smoke |
| `GROUPME_BOT_ID` | Notifications | Optional | Vercel env | GroupMe sends skipped/fail | Send Update smoke |
| `TWILIO_ACCOUNT_SID` | Notifications | Optional | Vercel env | SMS sends skipped/fail | Send Update smoke |
| `TWILIO_AUTH_TOKEN` | Notifications | Optional | Vercel env | SMS sends skipped/fail | Send Update smoke |
| `DISCORD_WEBHOOK_URL` | Notifications | Optional | Vercel env | Discord sends skipped/fail | Send Update smoke |
| `GENERIC_WEBHOOK_URL` | Notifications | Optional | Vercel env | webhook sends skipped/fail | Send Update smoke |
| `UNTAPPD_CLIENT_ID` | Untappd lookup | Optional | Vercel env | Untappd lookup unavailable | manager lookup smoke |
| `UNTAPPD_CLIENT_SECRET` | Untappd lookup | Optional | Vercel env | Untappd lookup unavailable | manager lookup smoke |
| `ELROYS_IOS_APP_BASE_URL` | iOS project generator | Optional | shell env before generation | generated app points to default prod | inspect Info.plist |
| `APPLE_DEVELOPMENT_TEAM` | iOS project generator | Yes for archive | shell env or generator default | archive/signing fails | Xcode archive |
```
```

- [ ] **Step 2: Create the release runbook**

Create `docs/launch/release-runbook.md`:

```markdown
# Release Runbook

## Pre-Release

1. Confirm `git status --short` is clean.
2. Run `node --check app.js`.
3. Run `node scripts/check-html-script-order.cjs`.
4. Run `node --test tests/*.test.cjs tests/boundaries/*.test.cjs`.
5. Run iOS simulator tests:
   `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO test`.
6. Confirm Supabase migrations planned for this release are applied to staging/preview first.
7. Confirm backup exists before applying production migrations.

## Deploy

1. Deploy to Vercel preview.
2. Run `docs/launch/smoke-test-checklist.md` against preview.
3. Apply Supabase production migrations.
4. Deploy to production.
5. Run the same smoke checklist against production.

## Rollback

1. Revert the Vercel deployment to the previous production deployment.
2. If a migration is not backward-compatible, stop and use the documented database restore process instead of guessing.
3. Verify public routes, manager login, Save, and Send Update after rollback.

## Backup And Restore

1. Before launch-day migrations, create a Supabase backup or confirm the latest automatic backup is restorable.
2. Record backup timestamp in release notes.
3. Perform a restore rehearsal before public launch and after any schema migration that changes menu/access tables.
```
```

- [ ] **Step 3: Create the smoke checklist**

Create `docs/launch/smoke-test-checklist.md`:

```markdown
# Smoke Test Checklist

## Public Web

- `/` loads without console errors.
- `/leroyslounge` loads route-first and shows footer staff sign-in.
- `/elroyscantina` loads route-first and shows footer staff sign-in.
- Public footer shows `APP_VERSION` and last-updated time.
- Preview deployments show `PREVIEW`.
- `?menu=el-roys` normalizes to El Roy's Cantina Drinks.

## Manager

- Manager signs in.
- Manager only sees menus they are allowed to edit.
- Save persists quietly and does not send notifications.
- Send Update persists, sends notifications, and updates public timestamp/history.
- 86'd items remain public with badge or strike-through.
- Food menu hides recipe controls.

## Admin

- Admin signs in.
- Admin can update landing draft without publishing live sections.
- Admin can publish selected landing sections live.
- Admin can update manager menu access without losing existing access on simulated failure.

## iOS

- App launches on simulator.
- Staff sign-in works.
- Menu load works.
- Save and Send Update preserve their different meanings.
- Offline draft can be created, restored, sent, and cleared.
- Account deletion request path is reachable.
```
```

- [ ] **Step 4: Commit**

```bash
git add docs/launch/release-runbook.md docs/launch/environment-matrix.md docs/launch/smoke-test-checklist.md
git commit -m "docs: add launch release runbooks"
```

## Final Verification

- [ ] **Step 1: Run all web/server checks**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
```

Expected: all PASS.

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

- [ ] **Step 3: Re-run the launch-readiness audit**

Run the project launch-readiness audit skill after it exists:

```text
Use the launch-readiness-auditor project skill and produce an updated P0/P1/P2 launch-readiness report.
```

Expected: no P0 blockers remain.
