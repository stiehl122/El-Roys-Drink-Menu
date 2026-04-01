# CLAUDE.md — El Roy's Drink Menu

## Project Overview

A zero-dependency web app that runs the live public and manager-facing menus for exactly two restaurants:

- **Leroy's Lounge**
- **El Roy's Cantina**

Each restaurant has two menus, **Drinks** and **Food**, for four total menus. Managers are still assigned per menu, so bartenders and kitchen staff can have separate access. Public rendering is now **custom-design first**: each restaurant is expected to provide uploaded HTML/CSS design files, and the legacy category-accordion renderer exists only as a fallback when a design is disabled or missing.

## Architecture

- **Three files:** `index.html` (markup), `style.css` (styles), `app.js` (logic). No build step, bundler, or package manager.
- **Supabase PostgREST** — primary read/write path for restaurants, menus, categories, items, menu metadata, featured groups, and update history.
- **localStorage fallback** — caches menu state, timestamps, and auth/session state for degraded or offline reads.
- **Supabase Auth + role API** — email/password auth in the client; `/api/role` and `/api/users` enforce role and per-menu access.
- **Supabase Storage** — `menu-designs` bucket stores restaurant-scoped public HTML/CSS files named `{sanitized_restaurant_name}_design.html` and `.css`.
- **Vercel API routes** — required for config, roles, notifications, user management, and design uploads.
- **Hardcoded restaurant/menu model** — the app still uses relational `restaurants` and `menus` tables, but the UI is now intentionally tightened around the known IDs in `app.js`:

```js
const RESTAURANTS = {
  LEROYS: { id: '00000000-0000-0000-0000-000000000010', name: "Leroy's Lounge", slug: 'leroys-lounge' },
  ELROYS: { id: '00000000-0000-0000-0000-000000000001', name: "El Roy's Cantina", slug: 'el-roys-cantina' },
};

const MENUS = {
  LEROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000020', restaurantId: RESTAURANTS.LEROYS.id, type: 'drinks', slug: 'leroys-lounge-drinks', name: "Leroy's Lounge Drinks" },
  LEROYS_FOOD:   { id: '00000000-0000-0000-0000-000000000021', restaurantId: RESTAURANTS.LEROYS.id, type: 'food',   slug: 'leroys-lounge-food',   name: "Leroy's Lounge Food" },
  ELROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000002', restaurantId: RESTAURANTS.ELROYS.id, type: 'drinks', slug: 'el-roys-cantina-drinks', name: "El Roy's Cantina Drinks" },
  ELROYS_FOOD:   { id: '00000000-0000-0000-0000-000000000003', restaurantId: RESTAURANTS.ELROYS.id, type: 'food',   slug: 'el-roys-cantina-food',  name: "El Roy's Cantina Food" },
};
```

- **`app.js` organization** — still section-banner based. Large behavior clusters remain in one file but are increasingly split by helper layers such as:
  - menu resolution and hydration (`sbResolveMenu()`, `loadActiveMenuState()`, `refreshFeaturedForActiveMenu()`)
  - public rendering (`renderPublicView()`, `_renderCustomDesignView()`, `_renderDefaultPublicView()`)
  - admin switchers and design controls (`loadAdminSwitcherData()`, `_loadAdminTabData()`, `_renderCustomDesignControls()`)
  - manager rendering and persistence (`buildManagerItemHtml()`, `persistState()`, `computeDiff()`)

## Menu Categories

Categories are still admin-configurable at runtime in the Categories tab.

**Drink defaults** (`DEFAULT_CATEGORY_DEFS`): `beer`, `canned`, `cocktails`, `tequila`, `frozen`, `special`

**Food defaults** (`DEFAULT_FOOD_CATEGORY_DEFS`): `starters`, `tacos`, `entrees`, `sides`, `desserts`

Deleting a category still moves its items into the hidden `__uncategorized__` pool.

## Access Levels

| Feature | `manager` role | `admin` role |
|---|---|---|
| Edit / save / send menu | Yes, for assigned menus | Yes |
| View Admin tab | No | Yes |
| Change categories, design, database settings | No | Yes |

New accounts still start with `role: none`. Admins grant access per menu across the four fixed menus.

## Key Behaviors To Preserve

- **Save vs. Send Update:** `Save` persists current state silently. `Send Update` persists, sends notifications, and updates the public timestamp.
- **Draft indicators:** Green dot means added/changed since the last send.
- **86'd items:** Stay visible publicly with strike-through and badge.
- **Item descriptions:** Optional; expandable publicly and editable in manager mode.
- **Per-item pricing:** Optional `price` shown in public view.
- **Food menu support:** Food menus hide recipe buttons and use food defaults.
- **Two-restaurant / four-menu model:** The app is no longer generic multi-restaurant CRUD. It is intentionally centered on Leroy's Lounge and El Roy's Cantina, each with Food and Drinks menus.
- **Notification channels:** Still configured per menu and sent through `/api/send-notification`.
- **Auth wizard:** Four screens only: Sign In, Sign Up, Forgot Password, Reset Password.
- **Recovery token handling:** Recovery session data stays in `_recoverySessionData` only and is never written to localStorage.
- **Custom Design:** Restaurant-level custom HTML/CSS is the **primary** public rendering path. `renderPublicView()` always tries `_renderCustomDesignView()` first and falls back to `_renderDefaultPublicView()` if the files are missing, fail to load, or the restaurant toggle is disabled. Custom CSS is removed when entering manager/admin mode.
- **Public menu footer:** Shows `APP_VERSION` and last-updated timestamp. Preview deployments show a `PREVIEW` badge. `APP_VERSION` must be updated for every release, including patches.
- **Legacy public links:** Old `?menu=el-roys` links are still normalized to El Roy's Cantina Drinks in `sbResolveMenu()`.

## Code Map

**`app.js` (~4,349 lines)**  

| Lines | Section | Key functions |
|---|---|---|
| 1-190 | Config, constants, state helpers | `APP_VERSION`, `RESTAURANTS`, `MENUS`, `defaultState()`, `sanitizeMenuName()` |
| 191-600 | Supabase data layer | `sbResolveMenu()`, `sbRead()`, `hydrateState()`, `loadActiveMenuState()` |
| 601-901 | Local notification config + design helpers | `applyDesign()`, `renderPublicViews()`, `_populateAdminDesignPanel()` |
| 902-1084 | Category management | `renderCategoriesTab()`, `confirmAddCategory()`, `deleteCategory()` |
| 1085-1286 | Init and public boot | `init()`, `_tryHandleRecoveryCallback()`, `_tryRestoreSession()`, `showPublicView()` |
| 1287-1596 | Polling and public rendering | `startPolling()`, `renderPublicView()`, `_renderDefaultPublicView()`, `_renderCustomDesignView()` |
| 1597-2132 | Auth, overlays, menu picker | `_applySession()`, `openAuthOverlay()`, `showMenuPicker()`, `selectMenu()` |
| 2133-2584 | Manager entry, notifications, admin switchers, custom design | `enterManager()`, `saveNotifications()`, `loadAdminSwitcherData()`, `toggleCustomDesign()` |
| 2585-3400 | Manager editing and preview flows | `renderManagerItems()`, `persistState()`, `computeDiff()`, `openPreview()` |
| 3401-3812 | Send update, toast, user management | `sendUpdate()`, `showToast()`, `patchUser()` |
| 3813-4349 | Featured, tabs, fixed restaurant/menu admin, preview toolbar | `renderFeaturedAdmin()`, `switchAdminTab()`, `fetchRestaurantMenuIndex()`, `renderMenusPanel()`, `_initPreviewToolbar()` |

**`index.html` (~570 lines)**  

| Line | Element / ID | Purpose |
|---|---|---|
| 6 | `<title>` | Page title |
| 42-58 | public view | Public menu shell and footer |
| 62-176 | manager panel | Edit Menu, Categories, Database |
| 190-193 | `#menus-mgmt-list` | Read-only fixed restaurant/menu panel |
| 197-314 | notifications tab | Per-menu channel configuration |
| 316-402 | design tab | Restaurant selector, primary custom-design controls, fallback design tokens |
| 404-429 | users / featured / history | Admin management panels |
| 433-556 | `#auth-overlay` and modals | Auth wizard, preview modal, invite modal |
| 558-569 | `#menu-picker-overlay` | Hardcoded two-restaurant grouped menu picker |

## Development Guidelines

- Ask clarifying questions only when ambiguity materially changes correctness.
- Do not introduce dependencies.
- No build tools.
- Preserve Supabase auth and role flows.
- Preserve offline/localStorage fallback behavior.
- Ignore `supabase/migrations/*.sql` during normal UI/API work unless the task is explicitly about schema/data changes.
- In `style.css`, use CSS custom properties for colors. No hardcoded hex values in new style rules.
- Preserve accessibility patterns: tab widgets, dialog behavior, keyboard support, ARIA states, and live regions.

## Custom Design / Stitch Workflow

Both restaurants are expected to run on uploaded custom HTML/CSS designs.

### Runtime behavior

1. `renderPublicView()` always calls `_renderCustomDesignView()` first.
2. The app fetches `{sanitized}_design.html` and `{sanitized}_design.css` from the `menu-designs` bucket using the **restaurant name**, not the menu name.
3. If the files are unavailable or the restaurant-level toggle is off, the app falls back to the default accordion renderer.
4. Custom CSS is injected as `#custom-design-style` and removed when switching into manager/admin mode.

### File naming

`sanitizeMenuName(name)` lowercases, replaces runs of non-alphanumeric characters with `_`, and trims leading/trailing underscores.

Examples:
- `"Leroy's Lounge"` → `leroy_s_lounge`
- `"El Roy's Cantina"` → `el_roy_s_cantina`

### `/stitch`

Run `/stitch <restaurant_name> <stitch_project_id> [screen_id]` to:

1. Verify the target restaurant is one of the two supported restaurants.
2. Download the Stitch project/screen.
3. Save raw output under `designs/{sanitized_restaurant_name}/`.
4. Meld the export into the app's restaurant-level custom design format.
5. Write `{sanitized_restaurant_name}_design.html` and `.css` for upload in Admin → Design.

If a design changes, re-run `/stitch` with the same arguments and re-upload the generated files.

## Hosting

**Vercel is required** for full functionality. The API routes in `/api/` must run as serverless functions. Static-only hosting will not support authenticated writes, config delivery, or notifications.

## Repository Structure

```text
El-Roys-Drink-Menu/
├── index.html
├── app.js
├── style.css
├── api/
│   ├── _auth.js
│   ├── config.js
│   ├── design-upload.js
│   ├── role.js
│   ├── send-groupme.js
│   ├── send-notification.js
│   └── users.js
├── lib/
│   ├── config/
│   │   └── notifications.json
│   ├── fonts/
│   └── images/
├── designs/
│   ├── el_roy_s_cantina/
│   │   ├── raw_screen.html
│   │   ├── raw_screen.css
│   │   ├── el_roy_s_cantina_design.html
│   │   └── el_roy_s_cantina_design.css
│   └── leroy_s_lounge/
│       ├── raw_screen.html
│       ├── raw_screen.css
│       ├── leroy_s_lounge_design.html
│       └── leroy_s_lounge_design.css
└── supabase/
    └── migrations/
```
