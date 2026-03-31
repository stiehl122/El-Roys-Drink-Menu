# CLAUDE.md — El Roy's Drink Menu

## Project Overview

A zero-dependency web app that powers the live menu for El Roy's — supports both drink and food menus. Staff sign in via Supabase email/password auth; changes sync to Firebase Realtime Database and can be pushed to configured notification channels (e.g. GroupMe) as a formatted update.

## Architecture

- **Three files:** `index.html` (HTML structure), `style.css` (styles), `app.js` (logic). No build step, no bundler, and no package manager.
- **Firebase Realtime Database** — cloud sync for menu state and configuration across devices.
- **localStorage fallback** — used when Firebase is unavailable (offline-capable).
- **GroupMe Bot API** — sends formatted patch-note messages to a group chat.
- **Supabase** — authentication (email/password) and role management (`none`, `manager`, `admin`).
- **Vercel API routes** — five serverless endpoints required for full functionality:
  - `/api/config` — serves Supabase credentials to the client
  - `/api/role` — looks up the authenticated user's role and profile
  - `/api/send-groupme` — proxies GroupMe Bot API calls server-side
  - `/api/send-notification` — dispatches notifications to enabled channels per menu (reads `menu_meta.notifications`)
  - `/api/users` — admin-only user management (list users, update roles, manage menu access)
- `api/_auth.js` is a shared auth helper imported by the API routes; the underscore prefix intentionally excludes it from Vercel's routing.
- Full functionality requires Vercel (or equivalent serverless) deployment for the API routes. Plain static hosting will not support authenticated writes or notification sending.

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

- **Save vs. Send Update:** `Save` persists to Firebase silently. `Send Update` saves *and* fires a GroupMe message + updates the "Last Updated" header timestamp.
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

**`app.js` (~3,350 lines)** — section headers use `// ─── SECTION ───` banners:

| Lines | Section | Key functions |
|---|---|---|
| 1-100 | Config & constants | `APP_VERSION`, `LS_KEYS`, `CATEGORY_DEFS`, `DESIGN_DEFAULTS` |
| 101-134 | Menu state & helpers | `defaultState()`, `findItem()`, `invalidateDiff()` |
| 135-402 | Supabase data layer | `hydrateState()`, Firebase read/write, state sync |
| 403-686 | Design & config | `applyDesign()`, `renderDesignSection()`, logo upload, font selects |
| 687-869 | Category management | `renderCategoriesTab()`, `toggleCategoryEdit()`, `toggleAddCategoryForm()` |
| 870-1039 | Init & boot | `DOMContentLoaded` listener, auth bootstrap, menu load |
| 1040-1140 | Auto-refresh polling | `startPolling()`, `stopPolling()`, `updateLastUpdatedLabel()` |
| 1141-1236 | Public view | `renderPublicView()`, `renderFooter()`, collapse/expand |
| 1237-1381 | Supabase auth (REST) | Token refresh, `_applySession()`, `renderUserHeader()`, `applyRole()` |
| 1382-1449 | Auth overlay | `openAuthOverlay()`, `renderAuthScreen()`, `signOut()` |
| 1450-1757 | Menu picker | `openMenuPicker()`, `closeMenuPicker()`, `selectMenu()` |
| 1758-1815 | Manager mode | `enterManager()`, `exitManager()` |
| 1816-1955 | Notifications & admin switcher | `onNotifToggle()`, `_refreshAdminMenuSelect()` |
| 1956-2301 | Manager item editing | `renderManagerItems()`, `addItem()`, `removeItem()`, `renameItem()` |
| 2302-2361 | Autocomplete | `showAutocomplete()`, `hideAutocomplete()` |
| 2362-2551 | 86 toggle, descriptions, recipes | `toggle86()`, `toggleItemDesc()`, `toggleItemRecipe()` |
| 2552-2601 | Draft indicators & diff | `updateDraftIndicator()`, `computeDiff()` |
| 2602-2711 | Preview & send update | `openPreview()`, `closeModal()`, send GroupMe message |
| 2712-2752 | Toast | `showToast()` |
| 2753-2935 | User management | `renderUsersTab()`, `buildMenuAccessHTML()`, invite modal |
| 2936-3066 | Tab switching & keyboard | `switchManagerTab()`, `switchAdminTab()` |
| 3068-3352 | Restaurant & menu management | `openAddRestaurantForm()`, `openRenameMenuForm()`, slug sync |

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
- Preserve offline/localStorage fallback behavior when touching Firebase sync code.
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
