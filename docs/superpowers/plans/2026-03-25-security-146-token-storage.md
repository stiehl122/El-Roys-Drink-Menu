# Fix #146: Auth Tokens in localStorage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move auth tokens (`accessToken`, `refreshToken`) from `localStorage` to `sessionStorage` to eliminate the persistent cross-session exfiltration risk.

**Architecture:** A targeted swap in `app.js` — introduce `SS_KEYS` and `ssSet`/`ssGet`/`ssDel` helpers mirroring the existing `LS_KEYS` pattern, then redirect all token reads/writes to `sessionStorage`. Menu state and non-sensitive config remain in `localStorage`. A stale-key cleanup on page load silently removes any tokens already persisted in localStorage.

**Tech Stack:** Vanilla JS, `sessionStorage` Web API, `app.js` only — no new API routes, no new files.

---

## Recommendation: sessionStorage (Option 1)

**Why not HttpOnly cookie (Option 3):** Requires a new `/api/session` Vercel route, server-side cookie issuance and renewal, and changes to every API route that validates Bearer tokens. Significantly larger and higher-risk change.

**Why sessionStorage:** Eliminates the most dangerous exposure — a refresh token that persists on disk across sessions and tabs. A single-file, targeted change. The residual risk (active-tab XSS can still read `sessionStorage`) is real but narrower; the existing XSS-escaping fixes in v0.5.3–v0.5.5 have already tightened the attack surface.

**UX trade-off:** Opening the app in a second browser tab requires re-authentication. Minor for a staff tool used on a dedicated device. Communicate to managers before deploying.

---

## File Map

| File | Change |
|------|--------|
| `app.js` | Add `SS_KEYS`, `ssSet/ssGet/ssDel`, redirect token storage, stale-key cleanup |

---

## Task 1: Add `SS_KEYS` Constants and sessionStorage Helpers

- [ ] **Step 1: Read the existing `LS_KEYS` block in `app.js`**

Find the `LS_KEYS` object (search for `LS_KEYS`). Note its structure — the new `SS_KEYS` block mirrors it for token keys only.

- [ ] **Step 2: Add `SS_KEYS` and helpers immediately after the `lsDel` helper**

```javascript
// ─── SESSION STORAGE (auth tokens only — not persisted across tabs/sessions) ──
const SS_KEYS = {
  accessToken:  'sb_access_token',
  refreshToken: 'sb_refresh_token',
  expiresAt:    'sb_expires_at',
};
function ssSet(key, val) { try { sessionStorage.setItem(key, val); } catch(e) {} }
function ssGet(key)      { try { return sessionStorage.getItem(key); } catch(e) { return null; } }
function ssDel(key)      { try { sessionStorage.removeItem(key); } catch(e) {} }
```

- [ ] **Step 3: Validate syntax**

```bash
node --check app.js
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(security): add sessionStorage helpers for auth token isolation (#146)"
```

---

## Task 2: Update `_applySession()` to Write Tokens to sessionStorage

- [ ] **Step 1: Find `_applySession` in `app.js`**

Search for `function _applySession`. It currently does `lsSet(LS_KEYS.accessToken, ...)`, `lsSet(LS_KEYS.refreshToken, ...)`, `lsSet(LS_KEYS.expiresAt, ...)`.

- [ ] **Step 2: Replace the three `lsSet` token calls with `ssSet`**

Change:
```javascript
lsSet(LS_KEYS.accessToken,  data.access_token);
lsSet(LS_KEYS.refreshToken, data.refresh_token);
lsSet(LS_KEYS.expiresAt,    String(expiresAt));
```

To:
```javascript
ssSet(SS_KEYS.accessToken,  data.access_token);
ssSet(SS_KEYS.refreshToken, data.refresh_token);
ssSet(SS_KEYS.expiresAt,    String(expiresAt));
```

- [ ] **Step 3: Validate syntax**

```bash
node --check app.js
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(security): write auth tokens to sessionStorage in _applySession (#146)"
```

---

## Task 3: Update `_tryRestoreSession()` to Read Tokens from sessionStorage

- [ ] **Step 1: Find `_tryRestoreSession` in `app.js`**

Search for `function _tryRestoreSession`. It currently reads `lsGet(LS_KEYS.accessToken)`, `lsGet(LS_KEYS.refreshToken)`, `lsGet(LS_KEYS.expiresAt)`.

- [ ] **Step 2: Replace the three `lsGet` token reads with `ssGet`**

Change:
```javascript
const accessToken  = lsGet(LS_KEYS.accessToken);
const refreshToken = lsGet(LS_KEYS.refreshToken);
const expiresAt    = lsGet(LS_KEYS.expiresAt);
```

To:
```javascript
const accessToken  = ssGet(SS_KEYS.accessToken);
const refreshToken = ssGet(SS_KEYS.refreshToken);
const expiresAt    = ssGet(SS_KEYS.expiresAt);
```

- [ ] **Step 3: Validate syntax**

```bash
node --check app.js
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(security): read auth tokens from sessionStorage in _tryRestoreSession (#146)"
```

---

## Task 4: Update `signOut()` to Clear sessionStorage Tokens

- [ ] **Step 1: Find `signOut` (or `handleSignOut`) in `app.js`**

Search for `lsDel(LS_KEYS.accessToken)`. There may also be `lsDel(LS_KEYS.refreshToken)` and `lsDel(LS_KEYS.expiresAt)`.

- [ ] **Step 2: Replace the token `lsDel` calls with `ssDel`**

Change:
```javascript
lsDel(LS_KEYS.accessToken);
lsDel(LS_KEYS.refreshToken);
lsDel(LS_KEYS.expiresAt);
```

To:
```javascript
ssDel(SS_KEYS.accessToken);
ssDel(SS_KEYS.refreshToken);
ssDel(SS_KEYS.expiresAt);
```

- [ ] **Step 3: Validate syntax**

```bash
node --check app.js
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(security): clear sessionStorage tokens on sign out (#146)"
```

---

## Task 5: Update `_scheduleTokenRefresh()` to Use sessionStorage

- [ ] **Step 1: Find `_scheduleTokenRefresh` in `app.js`**

The refresh callback likely calls `_applySession` (which will now use `ssSet` after Task 2), so this may already be covered. But verify there are no direct `lsSet(LS_KEYS.accessToken, ...)` calls inside the refresh callback.

- [ ] **Step 2: If any direct token writes exist in the refresh path, replace with `ssSet`**

Apply the same `lsSet` → `ssSet` pattern for any `LS_KEYS.accessToken`, `LS_KEYS.refreshToken`, or `LS_KEYS.expiresAt` references found.

- [ ] **Step 3: Validate syntax**

```bash
node --check app.js
```

- [ ] **Step 4: Commit (only if changes were needed)**

```bash
git add app.js
git commit -m "feat(security): use sessionStorage in token refresh path (#146)"
```

---

## Task 6: Grep for Any Remaining LS_KEYS Token References

- [ ] **Step 1: Search for remaining token references in localStorage**

```bash
grep -n "LS_KEYS\.accessToken\|LS_KEYS\.refreshToken\|LS_KEYS\.expiresAt" app.js
```

Expected: no output. If any matches remain, apply the `ssSet`/`ssGet`/`ssDel` replacement.

- [ ] **Step 2: Validate syntax**

```bash
node --check app.js
```

---

## Task 7: Stale-Key Cleanup on Page Load

Managers who were signed in before this fix have their refresh token in `localStorage`. Clean it silently on page load.

- [ ] **Step 1: Find the `init()` function in `app.js`**

At the very start of `init()`, before any other logic, add:

```javascript
// Remove any auth tokens previously stored in localStorage (migrated to sessionStorage in v0.5.6)
['sb_access_token', 'sb_refresh_token', 'sb_expires_at'].forEach(k => {
  try { localStorage.removeItem(k); } catch(e) {}
});
```

Note: uses the raw key strings (same values as `SS_KEYS`) in case `LS_KEYS` used the same key names.

- [ ] **Step 2: Validate syntax**

```bash
node --check app.js
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(security): clear stale localStorage auth tokens on page load (#146)"
```

---

## Task 8: Manual Verification

- [ ] **Step 1: Sign in as manager on the preview deployment**

- [ ] **Step 2: Open DevTools → Application → Local Storage**

Confirm `sb_access_token`, `sb_refresh_token`, and `sb_expires_at` are **not** present in localStorage.

- [ ] **Step 3: Open DevTools → Application → Session Storage**

Confirm `sb_access_token`, `sb_refresh_token`, and `sb_expires_at` **are** present.

- [ ] **Step 4: Refresh the page**

Confirm you are still signed in (session persists across page reload within the same tab).

- [ ] **Step 5: Open a new tab to the same URL**

Confirm you are **not** signed in (sessionStorage does not cross tabs). This is the expected trade-off.

- [ ] **Step 6: Sign out and verify cleanup**

Sign out. Open DevTools → Application → Session Storage. Confirm the three token keys are gone.

- [ ] **Step 7: Verify manager workflow end-to-end**

Sign in → enter manager mode → make a change → save → confirm save toast → refresh → confirm still signed in.

---

## Known Residual Risk

Active-tab XSS can still read `sessionStorage`. This fix eliminates the persistent cross-session exfiltration vector, not all possible token theft. The gold-standard mitigation (HttpOnly cookie) remains a valid follow-on PR.
