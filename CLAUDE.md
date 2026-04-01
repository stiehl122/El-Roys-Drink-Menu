# CLAUDE.md — El Roy's Drink Menu

## Project Overview

A zero-dependency web app that powers the live menu for El Roy's — supports both drink and food menus. Staff sign in via Supabase email/password auth; changes sync to Firebase Realtime Database and can be pushed to configured notification channels (e.g. GroupMe) as a formatted update.

## Architecture

- **Three files:** `index.html` (HTML structure), `style.css` (styles), `app.js` (logic). No build step, no bundler, and no package manager.
- **Supabase PostgREST** — primary cloud read/write path for menus, categories, items, design settings, featured groups, and update history.
- **localStorage fallback** — used for cached menu state, timestamps, and auth/session persistence when network reads fail or the app is offline.
- **GroupMe Bot API** — one possible downstream notification channel, always called server-side through Vercel routes.
- **Supabase Auth + role API** — email/password auth in the client, with role and menu-access enforcement provided by `/api/role` and `/api/users`.
- **Supabase Storage** — `menu-designs` bucket stores per-restaurant custom HTML/CSS design files. Files are public-read, admin-write (via RLS). File naming: `{sanitized_restaurant_name}_design.html` and `{sanitized_restaurant_name}_design.css` where sanitized = lowercase with runs of non-alphanumeric chars replaced by `_`.
- **Vercel API routes** — six serverless endpoints required for full functionality:
  - `/api/config` — serves Supabase credentials to the client
  - `/api/role` — looks up the authenticated user's role and profile
  - `/api/send-groupme` — proxies GroupMe Bot API calls server-side
  - `/api/send-notification` — dispatches notifications to enabled channels per menu (reads `menu_meta.notifications`)
  - `/api/users` — admin-only user management (list users, update roles, manage menu access)
  - `/api/design-upload` — admin-only proxy for uploading/deleting custom design files to Supabase Storage
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
- **Custom Design:** Admins can enable a per-restaurant custom design by uploading `{sanitized}_design.html` and `{sanitized}_design.css` to Supabase Storage and toggling `restaurants.use_custom_design` on via the Admin Design tab. When enabled, `renderPublicView()` fetches and injects the custom HTML/CSS instead of building the DOM from `CATEGORY_DEFS`. Falls back to the default renderer if files are unavailable or fail to load. Custom CSS is removed when entering manager or admin mode to prevent bleed. Use `/stitch` to download a Stitch project and meld it into the correct format.
- **Public menu footer:** The footer on the public menu view displays the app version (`APP_VERSION` constant in `app.js:2`) and the last-updated timestamp. On Vercel preview deployments, it also shows a `PREVIEW` badge (detected via `IS_PREVIEW`, which checks that the hostname ends with `.vercel.app` but is not exactly `el-roys-drink-menu.vercel.app`). **`APP_VERSION` must be updated for every release, including patch releases (e.g. `v0.6` → `v0.6.1`).**

## Code Map

**`app.js` (~4,300 lines)** — section headers use `// ─── SECTION ───` banners, with most large sections now split by helper functions inside the same file:

| Lines | Section | Key functions |
|---|---|---|
| 1-143 | Config & state helpers | `APP_VERSION`, `LS_KEYS`, `defaultState()`, `invalidateDiff()`, `getCachedDiff()` |
| 144-531 | Supabase data layer | `sbResolveMenu()`, `sbRead()`, `hydrateState()`, `loadActiveMenuState()`, `refreshFeaturedForActiveMenu()` |
| 532-848 | Design & category helpers | `applyDesign()`, `renderPublicViews()`, `refreshManagerViews()`, `renderCategoriesTab()` |
| 849-1221 | Init, session restore, public boot | `init()`, `_tryHandleRecoveryCallback()`, `_tryRestoreSession()`, `showPublicView()` |
| 1222-1510 | Polling + public rendering | `startPolling()`, `renderFeaturedPublicSection()`, `buildPublicCategorySection()`, `renderPublicView()`, `_renderDefaultPublicView()`, `_renderCustomDesignView()` |
| 1511-1960 | Auth, overlays, menu picker | `_applySession()`, `renderUserHeader()`, `openAuthOverlay()`, `showMenuPicker()` |
| 1961-2380 | Manager/admin entry + switchers + custom design | `enterManager()`, `enterAdmin()`, `initAdminSwitcherTab()`, `_loadAdminTabData()`, `_renderCustomDesignControls()`, `toggleCustomDesign()`, `uploadCustomDesignFile()`, `removeCustomDesign()` |
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
- **Do not read `.sql` migration files during normal site work.** When planning, reviewing, or coding on the site UI/client/API behavior, ignore files in `supabase/migrations/`. Only read or modify those `.sql` files when the task explicitly involves database/schema changes.
- **Use CSS custom properties for colors.** All colors in `style.css` must use `var(--*)` references — no hardcoded hex values. New colors should be declared as semantic variables in `:root` (and `body.manager-mode` where the value differs in manager view) before being referenced.
- **Accessibility conventions:** Interactive elements follow WAI-ARIA patterns throughout. The tab bar uses a full ARIA tab widget (`role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`). Collapsible category headers have `role="button"`, `aria-expanded`, and keyboard (Enter/Space) support. The auth overlay is a focus-trapped `role="dialog"`. The toast uses `role="status" aria-live="polite"`. The user chip dropdown syncs `aria-expanded` and moves focus on open/close. Preserve these attributes when touching the relevant elements.

## Custom Design / Stitch Workflow

Per-restaurant custom designs replace the default `renderPublicView()` output with uploaded HTML/CSS files served from Supabase Storage.

### Flag lifecycle

1. `restaurants.use_custom_design` defaults to `false`. Toggle it via Admin → Design tab → "Use Custom Design" checkbox for the selected restaurant.
2. When `true`, `renderPublicView()` fetches `{sanitized}_design.html` and `{sanitized}_design.css` from the `menu-designs` bucket and renders them inside `#public-categories`. Falls back to the default renderer on any fetch error.
3. Custom CSS is injected as `<style id="custom-design-style">` and removed when entering manager or admin mode.

### File naming

`sanitizeMenuName(name)` → lowercase, runs of non-alphanumeric chars replaced by `_`, leading/trailing `_` stripped.

Examples: `"Happy Hour"` → `"happy_hour"`, `"El Roy's"` → `"el_roy_s"`

### `/stitch` skill

Run `/stitch <restaurant_name> <stitch_project_id> [screen_id]` to:

1. Verify the named restaurant exists in Supabase
2. Download the Stitch project/screen via the Stitch MCP tools
3. Save raw files to `designs/{sanitized_restaurant_name}/`
4. Meld the HTML/CSS (strip scripts, scope CSS to `#public-categories`, add semantic data-binding classes)
5. Write `{sanitized_restaurant_name}_design.html` / `.css` ready for upload

After running `/stitch`, upload the melded files via Admin → Design tab for that restaurant, then toggle "Use Custom Design" on.

### Re-melding

If the Stitch design is updated, re-run `/stitch` with the same arguments. The raw files are overwritten and new melded output replaces the previous files. Re-upload via the admin tab.

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
│   ├── design-upload.js      # Admin-only custom design file upload/delete proxy
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
├── designs/              # Per-restaurant custom design files (raw Stitch downloads + melded output)
│   └── {sanitized_restaurant_name}/
│       ├── raw_screen.html       # Raw Stitch export (preserved for re-meld)
│       ├── raw_screen.css
│       ├── {name}_design.html    # Melded output — upload to Supabase Storage
│       └── {name}_design.css
├── .claude/
│   └── skills/             # Claude Code skill definitions (includes /stitch meld workflow)
├── README.md             # Setup and usage documentation
└── CLAUDE.md             # This file
```
