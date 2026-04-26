# Public Route Footer Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove top-of-page sign-in controls from public route fallback shells so staff auth entry stays in footer staff actions only.

**Architecture:** Dedicated route templates already use footer staff actions. This plan removes the legacy fallback header sign-in buttons from route shells and updates boundary tests so future route fallback edits cannot reintroduce them.

**Tech Stack:** Plain HTML, shared auth overlay JavaScript, Node test runner.

---

## Ownership

Codex can handle this entirely in code and tests. Project owner intervention is not required.

## File Structure

- Modify: `leroyslounge/index.html`
- Modify: `elroyscantina/index.html`
- Modify: `tests/phase15-auth-unification-complete.test.cjs`
- Optional modify: `tests/public-launch-surface.test.cjs` if launch-surface assertions are preferred there.

### Task 1: Strengthen Auth Entry Test

**Files:**
- Modify: `tests/phase15-auth-unification-complete.test.cjs`

- [ ] **Step 1: Replace route-template-only assertion with full-shell assertion**

Find the test named `restaurant route templates rely on footer staff sign-in only` and replace it with:

```js
test('restaurant public route shells expose staff sign-in only through footer actions', () => {
  const leroysHtml = readFileSync('leroyslounge/index.html', 'utf8');
  const elroysHtml = readFileSync('elroyscantina/index.html', 'utf8');

  assert.equal(leroysHtml.includes('data-auth-origin="route-header"'), false, 'leroyslounge shell must not render route header sign-in');
  assert.equal(elroysHtml.includes('data-auth-origin="route-header"'), false, 'elroyscantina shell must not render route header sign-in');
  assert.equal(leroysHtml.includes('data-route-footer-signin'), true, 'leroyslounge shell must keep footer sign-in');
  assert.equal(elroysHtml.includes('data-route-footer-signin'), true, 'elroyscantina shell must keep footer sign-in');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/phase15-auth-unification-complete.test.cjs
```

Expected: FAIL because both route shells still include `data-auth-origin="route-header"`.

- [ ] **Step 3: Commit failing test**

```bash
git add tests/phase15-auth-unification-complete.test.cjs
git commit -m "test: forbid public route header sign-in fallback"
```

### Task 2: Remove Header Sign-In Buttons

**Files:**
- Modify: `leroyslounge/index.html`
- Modify: `elroyscantina/index.html`

- [ ] **Step 1: Remove Leroy's fallback header button**

Delete this block from `leroyslounge/index.html`:

```html
<button class="header-signin-btn" id="signin-btn" data-auth-trigger="signin" data-auth-origin="route-header">Sign In</button>
```

- [ ] **Step 2: Remove El Roy's fallback header button**

Delete this block from `elroyscantina/index.html`:

```html
<button
  class="header-signin-btn"
  id="signin-btn"
  data-auth-trigger="signin"
  data-auth-origin="route-header"
>
  Sign In
</button>
```

- [ ] **Step 3: Confirm footer sign-in remains**

Run:

```bash
rg -n "data-route-footer-signin|data-auth-origin=\"route-header\"" leroyslounge/index.html elroyscantina/index.html
```

Expected: only `data-route-footer-signin` matches.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/phase15-auth-unification-complete.test.cjs tests/user-chip-route-reimplementation.test.cjs
node scripts/check-html-script-order.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add leroyslounge/index.html elroyscantina/index.html tests/phase15-auth-unification-complete.test.cjs
git commit -m "fix: keep public route sign-in in footer actions"
```

## Self-Review Notes

- Spec coverage: covers both public routes and keeps footer staff sign-in intact.
- Placeholder scan: no placeholders remain.
- Intervention scan: no owner action needed.
