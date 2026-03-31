# CLAUDE.md — El Roy's Drink Menu

## Project Overview

A zero-dependency web app that powers the live menu for El Roy's — supports both drink and food menus. Staff sign in via Supabase email/password auth; changes sync to Firebase Realtime Database and can be pushed to configured notification channels (e.g. GroupMe) as a formatted update.

## Architecture

- **Three files:** `index.html` (HTML structure), `style.css` (styles), `app.js` (logic). No build step, no bundler, and no package manager.
- **Supabase PostgREST** — primary cloud read/write path for menus, categories, items, design settings, featured groups, and update history.
- **localStorage fallback** — used for cached menu state, timestamps, and auth/session persistence when network reads fail or the app is offline.
- **GroupMe Bot API** — one possible downstream notification channel, always called server-side through Vercel routes.
- **Supabase Auth + role API** — email/password auth in the client, with role and menu-access enforcement provided by `/api/role` and `/api/users`.
- **Vercel API routes** — five serverless endpoints required for full functionality:
  - `/api/config` — serves Supabase credentials to the client
  - `/api/role` — looks up the authenticated user's role and profile
  - `/api/send-groupme` — proxies GroupMe Bot API calls server-side
  - `/api/send-notification` — dispatches notifications to enabled channels per menu (reads `menu_meta.notifications`)
  - `/api/users` — admin-only user management (list users, update roles, manage menu access)
- `api/_auth.js` is a shared auth helper imported by the API routes; the underscore prefix intentionally excludes it from Vercel's routing.
- Full functionality requires Vercel (or equivalent serverless) deployment for the API routes. Plain static hosting will not support authenticated writes or notification sending.
- **`app.js` organization** — still section-banner based, but large sections now lean on helper layers for:
  - active-menu loading (`loadActiveMenuState`, `refreshFeaturedForActiveMenu`)
  - render fan-out (`renderPublicViews`, `refreshManagerViews`, `refreshCategoryAdminViews`)
  - public/manager markup builders (`buildPublicItemHtml`, `buildManagerItemHtml`, `buildRecipeListHtml`)
  - persistence/diff helpers (`buildCategoryUpsertRows`, `buildItemUpsertRows`, `computeCategoryDiff`, `computeFeaturedDiff`)
  - admin CRUD helpers (`patchUser`, `fetchRestaurantMenuIndex`, `copyMenuCategoriesAndItems`, `openInlineRenameForm`)

## Menu Categories

Categories are admin-configurable at runtime via the Categories tab. The app ships with two sets of defaults:

**Drink menu defaults** (`DEFAULT_CATEGORY_DEFS`): beer, canned, cocktails, tequila, frozen, special.

**Food menu defaults** (`DEFAULT_FOOD_CATEGORY_DEFS`): starters, tacos, entrees, sides, desserts.

Admins can add, rename, reorder, or delete categories. Deleting a category moves its items to a hidden `__uncategorized__` pool.

## Access Levels

| Feature | `manager` role | `admin` role |
|---|---|---|
| Edit / save / send menu | Yes | Yes |
| View Admin tab | No | Yes |
| Change categories, design, database settings | No | Yes |

New accounts start with `role: none` and require admin promotion before they can access the manager interface.

## Key Behaviors to Preserve

- **Save vs. Send Update:** `Save` persists the current menu state to Supabase silently. `Send Update` saves *and* fires notifications + updates the "Last Updated" header timestamp.
- **Draft indicators:** A green dot on an item means it has been added/changed but not yet announced via Send Update.
- **86'd items:** Remain visible on the public menu with a strikethrough and "86'D" badge; toggled per item in manager mode.
- **Item descriptions:** Optional, expandable via a `›` icon on the public view; editable via `📝` in manager mode.
- **Per-item pricing:** Each item has an optional `price` field, shown on the public view as a tag (drinks) or badge (food).
- **Food menu support:** Menus have a `type` of `'drinks'` or `'food'`. Food menus use different default categories and hide recipe buttons.
- **Multi-restaurant / multi-menu:** The app supports multiple restaurants, each with multiple menus. `RESTAURANT_ID` tracks the active restaurant; design settings cascade from restaurant to menu. The menu picker overlay lets managers switch between menus they have access to.
- **Notification channels:** Admins configure per-menu notification channels (e.g. GroupMe) via the Notifications sub-panel in Admin. Send Update dispatches to all enabled channels via `/api/send-notification`.
- **Change count badge:** The Send Update button displays the number of unsent changes.
- **Auth wizard:** The sign-in overlay is a four-screen wizard: **Sign In** (email/password), **Sign Up** (first name, last name, email, password), **Forgot Password** (sends Supabase reset email via `POST /auth/v1/recover`), and **Reset Password** (in-app screen, reached when the app detects `#type=recovery&access_token=...` in the URL hash on load; updates password via `PUT /auth/v1/user`). Google OAuth and SMS OTP are not present.
- **Recovery token handling:** The recovery session data (`access_token`, etc.) is stored only in the in-memory variable `_recoverySessionData` and is cleared when the overlay is closed. It is never written to localStorage or any persistent store.
- **Sign-up flow:** New accounts are created with `role: none`. An admin must promote the account to `manager` or `admin` via the Admin tab (or the Supabase dashboard) before the user can edit the menu.
- **Public menu footer:** The footer on the public menu view displays the app version (`APP_VERSION` constant in `app.js:2`) and the last-updated timestamp. On Vercel preview deployments, it also shows a `PREVIEW` badge (detected via `IS_PREVIEW`, which checks that the hostname ends with `.vercel.app` but is not exactly `el-roys-drink-menu.vercel.app`). **`APP_VERSION` must be updated for every release, including patch releases (e.g. `v0.6` → `v0.6.1`).**

## Code Map

**`app.js` (~4,300 lines)** — section headers use `// ─── SECTION ───` banners, with most large sections now split by helper functions inside the same file:

| Lines | Section | Key functions |
|---|---|---|
| 1-143 | Config & state helpers | `APP_VERSION`, `LS_KEYS`, `defaultState()`, `invalidateDiff()`, `getCachedDiff()` |
| 144-531 | Supabase data layer | `sbResolveMenu()`, `sbRead()`, `hydrateState()`, `loadActiveMenuState()`, `refreshFeaturedForActiveMenu()` |
| 532-848 | Design & category helpers | `applyDesign()`, `renderPublicViews()`, `refreshManagerViews()`, `renderCategoriesTab()` |
| 849-1221 | Init, session restore, public boot | `init()`, `_tryHandleRecoveryCallback()`, `_tryRestoreSession()`, `showPublicView()` |
| 1222-1487 | Polling + public rendering | `startPolling()`, `renderFeaturedPublicSection()`, `buildPublicCategorySection()`, `renderPublicView()` |
| 1488-1930 | Auth, overlays, menu picker | `_applySession()`, `renderUserHeader()`, `openAuthOverlay()`, `showMenuPicker()` |
| 1931-2208 | Manager/admin entry + switchers | `enterManager()`, `enterAdmin()`, `initAdminSwitcherTab()`, `_loadAdminTabData()` |
| 2209-2909 | Manager editing, persistence, diff | `renderManagerItems()`, `buildManagerItemHtml()`, `persistState()`, `computeDiff()` |
| 2910-3091 | Preview, send update, toast | `openPreview()`, `sendUpdate()`, `showToast()` |
| 3092-3728 | User, history, featured, tabs, database | `patchUser()`, `renderUpdateHistory()`, `renderFeaturedTab()`, `renderDatabaseTab()` |
| 3729-4143 | Restaurant/menu admin + preview toolbar | `fetchRestaurantMenuIndex()`, `duplicateMenu()`, `openInlineRenameForm()`, `_initPreviewToolbar()` |

**`index.html` (~506 lines)** — major DOM regions:

| Line | Element / ID | Purpose |
|---|---|---|
| 12-40 | `<header>` | Logo, title, sign-in/user chip, manager/admin buttons |
| 42-46 | `#loading-view` | Spinner shown during boot |
| 48-60 | `#public-view` | Read-only public menu |
| 62-157 | `#manager-view` | Manager panel (tabs: Edit Menu, Categories, Database) |
| 158-367 | Admin panel | Sub-panels: Restaurants, Notifications, Design, Users |
| 369-452 | `#auth-overlay` | Sign-in / sign-up / forgot / reset wizard |
| 455-498 | Modals & picker | Config JSON, preview, invite, menu picker overlays |

**`style.css` (~542 lines)** — CSS custom properties in `:root` (line 1) and `body.manager-mode` override block. All colors use `var(--*)`.

## Development Guidelines

- **Always ask clarifying questions** before making changes if the request is ambiguous or could be interpreted in multiple ways.
- **Do not introduce external dependencies.** The app must remain self-contained with no external libraries or package manager.
- **No build tools.** Changes are made directly to `index.html`, `style.css`, or `app.js` as appropriate.
- **Required Vercel environment variables:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is used server-side by the API routes; it is never sent to the client.
- **Test in-browser** — for full functionality, deploy to Vercel and use the live URL. Local testing without the API routes will run in read-only / offline mode.
- Keep Supabase auth and role-check flows intact when modifying authentication logic.
- Preserve offline/localStorage fallback behavior when touching Supabase read/write sync code.
- **Use CSS custom properties for colors.** All colors in `style.css` must use `var(--*)` references — no hardcoded hex values. New colors should be declared as semantic variables in `:root` (and `body.manager-mode` where the value differs in manager view) before being referenced.
- **Accessibility conventions:** Interactive elements follow WAI-ARIA patterns throughout. The tab bar uses a full ARIA tab widget (`role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`). Collapsible category headers have `role="button"`, `aria-expanded`, and keyboard (Enter/Space) support. The auth overlay is a focus-trapped `role="dialog"`. The toast uses `role="status" aria-live="polite"`. The user chip dropdown syncs `aria-expanded` and moves focus on open/close. Preserve these attributes when touching the relevant elements.

## Hosting

**Vercel is the required host** for full functionality. The five API routes in `/api/` must run as serverless functions. GitHub Pages or other plain static hosts will not support authenticated writes, Supabase config delivery, or notification sending.

## Repository Structure

```
El-Roys-Drink-Menu/
├── index.html            # HTML structure and markup
├── app.js                # All JavaScript logic
├── style.css             # All CSS styles
├── api/
│   ├── _auth.js              # Shared auth helper (underscore = not a Vercel endpoint)
│   ├── config.js             # Serves Supabase URL + anon key
│   ├── role.js               # Looks up authenticated user's role and profile
│   ├── send-groupme.js       # Proxies GroupMe Bot API calls
│   ├── send-notification.js  # Dispatches notifications to enabled channels per menu
│   └── users.js              # Admin-only user management (roles, menu access)
├── lib/
│   ├── config/
│   │   └── notifications.json  # Notification channel definitions
│   ├── fonts/                  # Self-hosted font files + fonts.css
│   └── images/
│       └── hf-logo.png        # Default logo asset
├── .claude/
│   └── skills/             # Claude Code skill definitions
├── README.md             # Setup and usage documentation
└── CLAUDE.md             # This file
```
