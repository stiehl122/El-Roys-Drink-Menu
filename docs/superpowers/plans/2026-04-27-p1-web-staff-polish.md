# P1 Web Staff Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the most visible pre-launch web staff UX problems: staff routes should keep honest URLs, adding items should not trap users in the modal, and logged-out public pages should not emit avoidable auth errors.

**Architecture:** Preserve the existing dependency-free web runtime and shared auth layer. Make small targeted changes in `app.js` and the existing boundary tests so staff route state, modal completion, and anonymous auth bootstrap remain predictable.

**Tech Stack:** Plain JavaScript, HTML DOM tests, Node test runner, Vercel production-compatible routes.

---

### Task 1: Keep `/manager` And `/admin` URLs Honest After Route Resolution

**Files:**
- Modify: `app.js`
- Test: `tests/architecture-boundaries.test.cjs`

- [ ] **Step 1: Write failing route-address tests**

Add assertions to `tests/architecture-boundaries.test.cjs` near the existing `replaceState` and manager/admin href tests.

```js
test('manager route resolution preserves manager URL instead of public route', () => {
  const source = readAppJs();
  assert.match(source, /function syncResolvedMenuAddressBar/);
  assert.match(source, /managerPath = getManagerHrefForMenuId\(resolvedMenu\.id\)/);
  assert.doesNotMatch(source, /history\.replaceState\(\{\}, '', publicHref\)/);
});

test('admin route resolution preserves admin URL instead of public route', () => {
  const source = readAppJs();
  assert.match(source, /adminPath = getAdminHrefForMenuId\(resolvedMenu\.id\)/);
  assert.match(source, /isAdminRoute\(\)/);
});
```

- [ ] **Step 2: Run the failing route tests**

Run:

```bash
node --test tests/architecture-boundaries.test.cjs
```

Expected before implementation: FAIL on missing `syncResolvedMenuAddressBar`.

- [ ] **Step 3: Implement a route-aware address-bar sync helper**

In `app.js`, near the existing route helpers, add:

```js
function syncResolvedMenuAddressBar(resolvedMenu) {
  if (!resolvedMenu || typeof window === 'undefined' || !window.history) {
    return;
  }

  const currentSearch = window.location?.search || '';
  const managerPath = getManagerHrefForMenuId(resolvedMenu.id);
  const adminPath = getAdminHrefForMenuId(resolvedMenu.id);
  const publicHref = getPublicHrefForMenuId(resolvedMenu.id);

  let targetHref = publicHref;
  if (isManagerRoute()) {
    targetHref = managerPath;
  } else if (isAdminRoute()) {
    targetHref = adminPath;
  }

  if (currentSearch.includes('audit=')) {
    targetHref += targetHref.includes('?') ? '&audit=1' : '?audit=1';
  }

  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (targetHref && targetHref !== currentHref) {
    window.history.replaceState({}, '', targetHref);
  }
}
```

Replace direct calls that write `publicHref` during menu resolution with:

```js
syncResolvedMenuAddressBar(resolvedMenu);
```

Use the existing local variable name for the resolved menu if it differs.

- [ ] **Step 4: Run route tests**

Run:

```bash
node --test tests/architecture-boundaries.test.cjs
```

Expected: PASS.

### Task 2: Make Add Item Modal Completion Recoverable

**Files:**
- Modify: `app.js`
- Test: `tests/phase16-add-item-modal.test.cjs`

- [ ] **Step 1: Write failing modal tests**

Add this test near the existing add-item modal tests in `tests/phase16-add-item-modal.test.cjs`.

```js
test('add item modal shows a clear done action after Confirm & Add More', async () => {
  const sandbox = createAddItemModalSandbox();
  sandbox.renderAddItemModal({ mode: 'manual' });

  sandbox.document.querySelector('#add-item-name').value = 'Audit Margarita';
  sandbox.document.querySelector('#add-item-price').value = '9';
  sandbox.document.querySelector('[data-add-item-action="add-more"]').click();

  assert.match(
    sandbox.document.querySelector('#manager-add-item-modal-host').textContent,
    /Item added/i
  );
  assert.ok(
    sandbox.document.querySelector('[data-add-item-action="done-review"]'),
    'Expected a Done action so users can return to the save dock.'
  );
});
```

If the sandbox helper name differs, reuse the helper already used by neighboring tests.

- [ ] **Step 2: Run the failing modal test**

Run:

```bash
node --test tests/phase16-add-item-modal.test.cjs
```

Expected before implementation: FAIL because the done/review action and added confirmation are not present.

- [ ] **Step 3: Add modal success state**

In `app.js`, extend the add item modal state:

```js
const addItemModalState = {
  open: false,
  mode: 'manual',
  lastAddedName: '',
};
```

After a successful `confirmAddItemModal({ addMore: true })`, set:

```js
addItemModalState.lastAddedName = normalizedItem.name;
renderAddItemModal(addItemModalState);
```

In `renderAddItemModal`, render this feedback above the form when `lastAddedName` is present:

```js
${addItemModalState.lastAddedName ? `
  <div class="manager-inline-status" role="status">
    Item added: ${escapeHtml(addItemModalState.lastAddedName)}
  </div>
` : ''}
```

Add this action beside Cancel/Confirm:

```html
<button type="button" class="manager-secondary-action" data-add-item-action="done-review" onclick="closeAddItemModal()">
  Done
</button>
```

Ensure `closeAddItemModal()` clears `lastAddedName`.

- [ ] **Step 4: Run modal tests**

Run:

```bash
node --test tests/phase16-add-item-modal.test.cjs
```

Expected: PASS.

### Task 3: Avoid Public 401 Console Noise For Anonymous Profile Fetch

**Files:**
- Modify: `app.js`
- Test: `tests/phase15-auth-boundaries.test.cjs`

- [ ] **Step 1: Write a failing auth boundary test**

Add this test near the auth API adapter tests in `tests/phase15-auth-boundaries.test.cjs`.

```js
test('profile fetch is skipped when no access token is available', () => {
  const source = readAppJs();
  assert.match(source, /getProfile:\s*\(\{\s*accessToken = ''\s*\} = \{\}\) =>/);
  assert.match(source, /if \(!accessToken\)/);
  assert.match(source, /return Promise\.resolve\(\{ ok: false, profile: null, reason: 'missing-token' \}\)/);
});
```

- [ ] **Step 2: Run the failing auth test**

Run:

```bash
node --test tests/phase15-auth-boundaries.test.cjs
```

Expected before implementation: FAIL on missing missing-token short-circuit.

- [ ] **Step 3: Short-circuit empty profile requests**

In `app.js`, update the `authApi.getProfile` implementation to:

```js
getProfile: ({ accessToken = '' } = {}) => {
  if (!accessToken) {
    return Promise.resolve({ ok: false, profile: null, reason: 'missing-token' });
  }

  return fetch('/api/auth?mode=profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then(readApiJsonOrNull);
},
```

If there is a mirrored auth adapter in `core/auth/`, make the same short-circuit there and add the same test pattern to the nearest matching test file.

- [ ] **Step 4: Run web staff tests and syntax checks**

Run:

```bash
node --test tests/architecture-boundaries.test.cjs tests/phase16-add-item-modal.test.cjs tests/phase15-auth-boundaries.test.cjs
node --check app.js
node scripts/check-html-script-order.cjs
```

Expected: all tests pass and syntax checks succeed.

