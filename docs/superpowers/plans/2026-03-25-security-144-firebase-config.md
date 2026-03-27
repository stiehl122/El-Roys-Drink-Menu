# Fix #144: Strip fbUrl/menuUrl from Firebase `_config` Write — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop writing `fbUrl` and `menuUrl` into the publicly-readable Firebase `_config` node — two fields that don't need to be there.

**Architecture:** Two small deletions in `app.js`. No Firebase Security Rules changes. No new API routes. `categories` and `design` stay in `_config` for live-syncing to the public polling loop — live updating is fully preserved.

**Tech Stack:** Vanilla JS, `app.js` only.

---

## Threat Assessment

`_config` contains four fields: `menuUrl`, `fbUrl`, `categories`, `design`.

- `categories` and `design` — not sensitive; required in `_config` for the public 60s polling loop to live-sync category and design changes to the public menu.
- `fbUrl` — the Firebase database URL. An unauthenticated reader of `/menu.json` **already knows this URL** because they needed it to make the request. Zero marginal risk.
- `menuUrl` — the URL to the public menu page. By definition public information.

**Fix:** Stop writing `fbUrl` and `menuUrl` to Firebase. They are already persisted in `localStorage` on the manager's device via `saveFirebaseConfig()` and `saveMenuUrl()`. They have no cloud-sync purpose.

**Threat mitigated:** Data minimization — removes fields from Firebase that have no reason to be there.
**Residual risk:** None meaningful. No Firebase Security Rules changes needed. Live updating fully preserved.

---

## File Map

| File | Change |
|------|--------|
| `app.js` | Remove `menuUrl`/`fbUrl` from `persistState()` + remove two stale boot-time reads |

---

## Task 1: Remove `fbUrl` and `menuUrl` from `persistState()`

- [ ] **Step 1: Find `persistState()` in `app.js`**

Search for `menuState._config`. The current assignment looks like:

```js
menuState._config = {
  menuUrl: MENU_URL, fbUrl: FB_URL,
  categories: CATEGORY_DEFS,
  design: currentDesign,
};
```

- [ ] **Step 2: Remove the two URL fields**

Replace with:

```js
menuState._config = {
  categories: CATEGORY_DEFS,
  design: currentDesign,
};
```

---

## Task 2: Remove Stale Boot-Time Config Reads

The boot sequence reads `_config` from Firebase and syncs fields into `localStorage`. With `fbUrl`/`menuUrl` no longer written, remove the two lines that would attempt to read them (they'd be `undefined` and write `null` to localStorage otherwise).

- [ ] **Step 1: Find the boot config block in `app.js`**

Search for `cfg.menuUrl` and `cfg.fbUrl` in the boot-time `_config` read block (around the `fbRead` callback in `init()`).

- [ ] **Step 2: Remove these two lines**

```js
if (cfg.menuUrl)  { MENU_URL  = cfg.menuUrl;  lsSet(LS_KEYS.menuUrl, MENU_URL); }
if (cfg.fbUrl)    { FB_URL    = cfg.fbUrl;    lsSet(LS_KEYS.fbUrl, FB_URL); }
```

The polling loop only reads `_config.categories` and `_config.design` — no changes needed there.

---

## Task 3: Validate and Commit

- [ ] **Step 1: Syntax check**

```bash
node --check app.js
```

Expected: no output (clean).

- [ ] **Step 2: Commit**

```bash
git add app.js
git commit -m "fix(security): strip fbUrl and menuUrl from Firebase _config write (#144)"
```

---

## Stale Data Note

After the first manager Save post-deployment, `firebase-write.js` does a full `PUT /menu.json` of `menuState`. Since `_config` will no longer include `fbUrl`/`menuUrl`, any existing copies of those fields in Firebase are automatically removed on the next save. No manual cleanup needed.

---

## Verification

- [ ] Sign in as manager, make any change, click Save
- [ ] In Firebase console → Realtime Database → `/menu/_config`: confirm no `fbUrl` or `menuUrl` keys
- [ ] Confirm `categories` and `design` are still present in `_config`
- [ ] Open the public menu in a separate tab — confirm live-sync still works (change a category design setting in manager mode, save, confirm public view updates within 60s)
- [ ] `curl YOUR_DB_URL/menu.json` — confirm response contains `_config` with `categories`/`design` but no `fbUrl`/`menuUrl`
