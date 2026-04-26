# Launch Readiness P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish post-launch maintainability, accessibility, performance, brand consistency, and documentation after P0/P1 launch risks are closed.

**Architecture:** Keep these improvements incremental and reversible. Do not introduce a bundler, package manager, generic restaurant CRUD, or broad redesign; improve the current route-owned public pages, shared docs, and native iOS app in place.

**Tech Stack:** Plain HTML/CSS/JS, static docs, existing Node tests, SwiftUI/XCTest, current assets.

---

## File Structure

- Modify: `app.js`, `core/`, and `routes/shared/` only for small runtime extraction or accessibility fixes.
  Responsibility: Reduce obvious shared-runtime weight and improve semantic/focus behavior without changing product flows.
- Modify: `style.css` and `styles/`
  Responsibility: Improve legal/error page styling, focus indicators, heading scale, reduced motion, and responsive polish.
- Modify: `index.html`, `leroyslounge/index.html`, `elroyscantina/index.html`
  Responsibility: Normalize heading hierarchy and metadata polish.
- Modify: `ios/ElRoysManagerApp/Assets.xcassets`
  Responsibility: Replace temporary app icons and polish App Store presentation assets.
- Modify: SwiftUI views under `ios/ElRoysManagerApp/Features/`
  Responsibility: Add accessibility labels, Dynamic Type checks, and reduce-motion accommodations.
- Create: `docs/launch/manual-qa-web.md`
  Responsibility: Keep a repeatable public/manager/admin manual QA script.
- Create: `docs/launch/manual-qa-ios.md`
  Responsibility: Keep a repeatable iOS manual QA script.
- Create: `docs/launch/operations-playbook.md`
  Responsibility: Describe support, monitoring review, backups, incidents, and post-launch checks.
- Create: `docs/architecture/runtime-split-map.md`
  Responsibility: Track future `app.js` decomposition boundaries without forcing a risky launch refactor.
- Modify: `docs/FEATURES.md`
  Responsibility: Keep web/iOS parity expectations current after polish.

## Task 1: Normalize Public Heading Hierarchy And Focus Polish

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Create: `tests/public-accessibility-static.test.cjs`

- [ ] **Step 1: Write the static accessibility test**

Create `tests/public-accessibility-static.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

test('root page has exactly one h1', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.equal(countMatches(html, /<h1\b/gi), 1);
});

test('global stylesheet includes visible focus and reduced motion rules', () => {
  const css = fs.readFileSync('style.css', 'utf8');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
```

- [ ] **Step 2: Run the test to verify current state**

Run: `node --test tests/public-accessibility-static.test.cjs`

Expected: FAIL if the root still has multiple H1s or missing focus/reduced-motion coverage.

- [ ] **Step 3: Normalize root headings**

In `index.html`, keep one page-level heading:

```html
<h1>El Roy's Drink Menu</h1>
```

Convert secondary hero/chooser labels that are currently `h1` to `h2` or `p` while preserving visual classes:

```html
<h2 class="restaurant-card-title">Leroy's Lounge</h2>
<h2 class="restaurant-card-title">El Roy's Cantina</h2>
```

- [ ] **Step 4: Add focus-visible and reduced-motion defaults**

In `style.css`, add:

```css
:focus-visible {
  outline: 3px solid #f4c95d;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Run accessibility static test**

Run: `node --test tests/public-accessibility-static.test.cjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css tests/public-accessibility-static.test.cjs
git commit -m "fix: polish public accessibility basics"
```

## Task 2: Add Manual QA Playbooks

**Files:**
- Create: `docs/launch/manual-qa-web.md`
- Create: `docs/launch/manual-qa-ios.md`

- [ ] **Step 1: Create the web QA playbook**

Create `docs/launch/manual-qa-web.md`:

```markdown
# Manual QA: Web

## Public Routes

- Open `/` on desktop and mobile widths.
- Open `/leroyslounge` and `/elroyscantina` directly.
- Confirm no shared loading shell flashes before route-owned content.
- Confirm footer staff sign-in remains in the footer.
- Confirm 86'd items remain visible with badge or strike-through.
- Confirm public footer shows app version and last updated time.

## Manager

- Sign in as a manager with access to one menu.
- Confirm inaccessible menus are hidden or blocked.
- Edit an item and click Save; verify no notification is sent.
- Edit an item and click Send Update; verify public timestamp/history changes and notification is sent.
- Delete a category; verify items move to `__uncategorized__` and do not appear publicly.
- Open a food menu; verify recipe controls are hidden and food defaults apply.

## Admin

- Sign in as admin.
- Save landing draft without publishing.
- Publish one selected landing section.
- Update a manager's menu access and verify the manager sees the new access.
```

- [ ] **Step 2: Create the iOS QA playbook**

Create `docs/launch/manual-qa-ios.md`:

```markdown
# Manual QA: iOS

## Launch

- Install a fresh simulator build.
- Launch the app in light mode and dark mode.
- Increase Dynamic Type and relaunch.
- Enable VoiceOver and reach the sign-in form.

## Auth

- Sign in with a manager account.
- Sign out.
- Trigger password reset and confirm the documented handoff works.
- Open account deletion request path.

## Menu Editing

- Load each accessible menu.
- Edit an item and Save.
- Edit an item and Send Update.
- Create an offline draft, kill the app, relaunch, restore it, and send it.
- Confirm food menus do not expose drink recipe controls.

## Failure Modes

- Launch with network disabled.
- Attempt sign-in with wrong password.
- Attempt Send Update with network disabled.
- Re-enable network and confirm recovery.
```

- [ ] **Step 3: Commit**

```bash
git add docs/launch/manual-qa-web.md docs/launch/manual-qa-ios.md
git commit -m "docs: add manual qa playbooks"
```

## Task 3: Replace Temporary iOS App Icon Assets

**Files:**
- Modify: `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/*`
- Modify: `docs/launch/app-store-privacy-checklist.md`

- [ ] **Step 1: Inventory current icon assets**

Run:

```bash
find ios/ElRoysManagerApp/Assets.xcassets -maxdepth 3 -type f | sort
```

Expected: list current icon set and any `ELROYSTEMPLOGO` references.

- [ ] **Step 2: Replace icons with final assets**

Place final PNG icons into `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/` with the filenames referenced by `Contents.json`. Use opaque square PNGs at the sizes required by Xcode for the existing icon set.

- [ ] **Step 3: Verify no temporary names remain**

Run:

```bash
rg -n "TEMP|ELROYSTEMPLOGO|placeholder|sample" ios/ElRoysManagerApp/Assets.xcassets docs/launch/app-store-privacy-checklist.md
```

Expected: no temporary icon references remain.

- [ ] **Step 4: Build the iOS app**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add ios/ElRoysManagerApp/Assets.xcassets docs/launch/app-store-privacy-checklist.md
git commit -m "chore: replace temporary iOS app icons"
```

## Task 4: Add Operations Playbook

**Files:**
- Create: `docs/launch/operations-playbook.md`

- [ ] **Step 1: Create the operations playbook**

Create `docs/launch/operations-playbook.md`:

```markdown
# Operations Playbook

## Daily Checks During Launch Week

- Open `/`, `/leroyslounge`, and `/elroyscantina`.
- Sign in to `/manager`.
- Perform a quiet Save on a non-public test item.
- Perform a Send Update during an approved test window.
- Check Vercel function logs for 4xx/5xx spikes.
- Check Supabase logs for auth/database errors.

## Incident Response

1. Identify affected surface: public web, manager/admin, iOS, notifications, or Supabase.
2. Stop risky admin/menu edits if data integrity is involved.
3. Roll back Vercel deployment if the issue is web/server code.
4. Restore from Supabase backup only after owner approval if data corruption is confirmed.
5. Record incident timeline, user impact, root cause, and follow-up tasks.

## Support Diagnostics

- User email.
- Restaurant and menu.
- Browser or iOS version.
- Approximate time and timezone.
- Action attempted: Save, Send Update, sign-in, landing publish, notification send.
- Screenshot or exact error text.

## Backup Verification

- Confirm Supabase backup availability before public launch.
- Perform restore rehearsal before any schema migration that touches menus, menu access, profiles, or publish history.
```

- [ ] **Step 2: Commit**

```bash
git add docs/launch/operations-playbook.md
git commit -m "docs: add operations playbook"
```

## Task 5: Document Future Runtime Split Without Refactoring Launch Code

**Files:**
- Create: `docs/architecture/runtime-split-map.md`

- [ ] **Step 1: Create the runtime split map**

Create `docs/architecture/runtime-split-map.md`:

```markdown
# Runtime Split Map

The app remains dependency-free and build-free. This document tracks safe future extraction boundaries for reducing `app.js` size without changing launch behavior.

## Current Runtime Owners

- `core/auth/`: shared auth overlay and session service.
- `core/data/`: menu state loading.
- `core/domain/`: constants, menu defaults, featured specials.
- `core/landing/`: landing admin and root rendering.
- `core/session/`: save/send publish workflow and polling.
- `routes/shared/public-route-core.js`: dedicated public route boot.
- `app.js`: remaining manager/admin/public orchestration and compatibility glue.

## Safe Future Extractions

1. Manager item form rendering and validation.
2. Admin user access workspace.
3. Notification settings editor.
4. Legacy localStorage migration helpers.
5. Public footer rendering.

## Rules

- Keep `/leroyslounge` and `/elroyscantina` route-first.
- Do not add a bundler or dependency.
- Do not generalize beyond Leroy's Lounge and El Roy's Cantina.
- Move tests with behavior, not after behavior.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/runtime-split-map.md
git commit -m "docs: map future runtime split"
```

## Task 6: Final P2 Verification

- [ ] **Step 1: Run static and regression tests**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run iOS build**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Re-run the launch audit**

Run the project launch-readiness audit skill and confirm remaining P2 items are either closed or intentionally deferred.

