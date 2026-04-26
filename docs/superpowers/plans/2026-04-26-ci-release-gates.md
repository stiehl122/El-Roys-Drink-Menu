# CI Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated launch gates so syntax, HTML script order, Node tests, and iOS simulator tests run consistently before release.

**Architecture:** Use GitHub Actions with no project dependencies. Keep the workflow shell-command based because the web/server have no package manager and no build step.

**Tech Stack:** GitHub Actions, Node.js built into runner setup, macOS/Xcode runner for iOS.

---

## Ownership

Codex can add the workflow and docs. Project owner intervention is required to enable GitHub Actions on the repository, decide whether branch protection should require the checks, and pay/approve macOS runner minutes.

## File Structure

- Create: `.github/workflows/launch-gates.yml`
- Modify: `docs/launch/release-runbook.md`
- Test: `tests/ci-release-gates.test.cjs`

### Task 1: Workflow Source Test

**Files:**
- Create: `tests/ci-release-gates.test.cjs`

- [ ] **Step 1: Write failing workflow test**

Create:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('launch gates workflow runs required web and server checks', () => {
  const workflow = readFileSync('.github/workflows/launch-gates.yml', 'utf8');
  assert.match(workflow, /node --check app\.js/);
  assert.match(workflow, /node scripts\/check-html-script-order\.cjs/);
  assert.match(workflow, /node --test tests\/\*\.test\.cjs tests\/boundaries\/\*\.test\.cjs/);
});

test('launch gates workflow runs iOS simulator tests', () => {
  const workflow = readFileSync('.github/workflows/launch-gates.yml', 'utf8');
  assert.match(workflow, /runs-on: macos-/);
  assert.match(workflow, /xcodebuild test/);
  assert.match(workflow, /ElRoysManagerApp\.xcodeproj/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ci-release-gates.test.cjs
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Commit failing test**

```bash
git add tests/ci-release-gates.test.cjs
git commit -m "test: require launch CI gates"
```

### Task 2: Add GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/launch-gates.yml`

- [ ] **Step 1: Create workflow**

Create:

```yaml
name: Launch Gates

on:
  pull_request:
  push:
    branches:
      - main
      - launch-readiness

jobs:
  web-server:
    name: Web and server checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Check app syntax
        run: node --check app.js
      - name: Check HTML script order
        run: node scripts/check-html-script-order.cjs
      - name: Run Node tests
        run: node --test tests/*.test.cjs tests/boundaries/*.test.cjs

  ios:
    name: iOS simulator tests
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4
      - name: Select Xcode
        run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
      - name: List schemes
        run: xcodebuild -list -project ios/ElRoysManagerApp.xcodeproj
      - name: Run iOS tests
        run: >
          xcodebuild test
          -project ios/ElRoysManagerApp.xcodeproj
          -scheme ElRoysManagerApp
          -destination 'platform=iOS Simulator,name=iPhone 16'
          CODE_SIGNING_ALLOWED=NO
```

- [ ] **Step 2: Run local workflow source test**

Run:

```bash
node --test tests/ci-release-gates.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Run same commands locally**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/*.test.cjs tests/boundaries/*.test.cjs
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/launch-gates.yml tests/ci-release-gates.test.cjs
git commit -m "ci: add launch readiness gates"
```

### Task 3: Document Required Checks

**Files:**
- Modify: `docs/launch/release-runbook.md`

- [ ] **Step 1: Add CI section**

Insert after Pre-Release:

```markdown
## CI Gates

Pull requests and pushes to protected launch branches must pass the `Launch Gates` workflow before release:

- Web and server checks: `node --check app.js`, `node scripts/check-html-script-order.cjs`, and the full Node test suite.
- iOS simulator tests: unsigned simulator test run for `ElRoysManagerApp`.

If GitHub macOS capacity is unavailable, run the iOS command locally and paste the command plus result into the release notes before merging.
```

- [ ] **Step 2: Run docs/source tests**

Run:

```bash
node --test tests/ci-release-gates.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/launch/release-runbook.md
git commit -m "docs: document launch CI gates"
```

## Self-Review Notes

- Spec coverage: covers web/server/iOS checks and owner branch-protection intervention.
- Placeholder scan: no placeholders remain.
- Intervention scan: owner must enable Actions and branch protection.
