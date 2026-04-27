# P2 Launch Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up low-risk launch polish issues that make the public website feel less finished: desktop overflow, hidden inactive surfaces, and missing regression checks for those details.

**Architecture:** Keep this lane CSS-and-test focused to avoid conflict with P0/P1 implementation work. Add general-purpose CSS safeguards and tests that assert public launch surfaces do not rely on visually hidden but accessibility-visible inactive panels.

**Tech Stack:** Plain CSS, HTML, JavaScript source-contract tests, Node test runner.

---

### Task 1: Prevent Horizontal Overflow On Public Landing And Route Pages

**Files:**
- Modify: `style.css`
- Modify: `styles/shared-shell.css`
- Test: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Add failing CSS contract test**

Add this test to `tests/public-launch-surface.test.cjs`.

```js
test('public surfaces include horizontal overflow guards', () => {
  const rootCss = fs.readFileSync(path.join(repoRoot, 'style.css'), 'utf8');
  const sharedCss = fs.readFileSync(path.join(repoRoot, 'styles/shared-shell.css'), 'utf8');
  assert.match(rootCss, /html,\s*body\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(rootCss, /\.landing-root\s*\{[^}]*overflow-x:\s*clip/s);
  assert.match(sharedCss, /\.app-shell\s*\{[^}]*min-width:\s*0/s);
});
```

- [ ] **Step 2: Run the failing public surface test**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
```

Expected before implementation: FAIL because one or more overflow guards are missing.

- [ ] **Step 3: Add public overflow guards**

In `style.css`, add or update:

```css
html,
body {
  max-width: 100%;
  overflow-x: hidden;
}

.landing-root {
  overflow-x: clip;
}
```

In `styles/shared-shell.css`, add or update:

```css
.app-shell {
  min-width: 0;
}
```

If `.app-shell` already exists, merge `min-width: 0;` into the existing rule instead of creating a duplicate.

### Task 2: Ensure Hidden Inactive Panels Are Not Accessibility-Visible

**Files:**
- Modify: `style.css`
- Modify only if needed: `index.html`
- Test: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Add failing hidden-state test**

Add this test to `tests/public-launch-surface.test.cjs`.

```js
test('inactive public panels use the hidden attribute and global hidden CSS', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(repoRoot, 'style.css'), 'utf8');
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(html, /id="manager-app"[^>]*hidden/);
  assert.match(html, /id="admin-app"[^>]*hidden/);
});
```

- [ ] **Step 2: Run the failing hidden-state test**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
```

Expected before implementation: FAIL if global hidden CSS or inactive-panel `hidden` attributes are missing.

- [ ] **Step 3: Add hidden CSS and inactive panel attributes**

In `style.css`, add:

```css
[hidden] {
  display: none !important;
}
```

In `index.html`, ensure inactive app surface roots start hidden:

```html
<main id="manager-app" hidden>
```

```html
<main id="admin-app" hidden>
```

If those elements are not `<main>`, preserve the current tag and add `hidden` to the existing opening tag.

### Task 3: Verify Low-Risk Polish Does Not Regress Boot Order

**Files:**
- Verify: `style.css`
- Verify: `styles/shared-shell.css`
- Verify: `index.html`
- Verify: `tests/public-launch-surface.test.cjs`

- [ ] **Step 1: Run public launch surface tests**

Run:

```bash
node --test tests/public-launch-surface.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run HTML script-order check**

Run:

```bash
node scripts/check-html-script-order.cjs
```

Expected: PASS.

- [ ] **Step 3: Run shared runtime syntax check**

Run:

```bash
node --check app.js
```

Expected: PASS.

