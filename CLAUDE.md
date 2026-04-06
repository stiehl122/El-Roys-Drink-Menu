# CLAUDE.md — El Roy's Drink Menu

## Mission

Maintain a zero-dependency web app for exactly two restaurants:

- Leroy's Lounge
- El Roy's Cantina

Each restaurant has two fixed menus, Drinks and Food. Do not generalize this into arbitrary restaurant/menu CRUD unless the task explicitly asks for it.

## Architecture Snapshot

- `/` is a site picker only.
- `/leroyslounge` and `/elroyscantina` are route-owned public pages. Each route ships its own `index.html`, `style.css`, and `app.js`, alongside the shared runtime in `/app.js`.
- `/manager` and `/admin` are separate HTML shells that load the shared runtime from `/app.js` and shared styles from `/style.css`.
- `app.js` is the shared runtime for menu resolution, Supabase reads/writes, auth/session restore, manager/admin flows, notifications, featured groups, route navigation, and fallback public rendering.
- `style.css` is the shared stylesheet for manager/admin shells and shared public behavior. Restaurant folders layer their own styles on top.
- `vercel.json` rewrites clean routes to those HTML entrypoints.
- `/api/*.js` provides serverless config, role lookup, user management, and notification delivery. Vercel is required for full functionality.
- Supabase is the source of truth for menus, categories, items, featured state, history, notification config, and auth-backed access.

## Canonical Model

- Source of truth for restaurant/menu constants: `RESTAURANTS` and `MENUS` in `app.js`.
- Supported menus only: Leroy's Lounge Drinks, Leroy's Lounge Food, El Roy's Cantina Drinks, El Roy's Cantina Food.
- Legacy `?menu=el-roys` must still normalize to El Roy's Cantina Drinks.
- Category defaults live in `DEFAULT_CATEGORY_DEFS` and `DEFAULT_FOOD_CATEGORY_DEFS`.
- Deleted categories move items into `__uncategorized__`, which stays hidden from the public UI.

## High-Risk Behaviors

- `Save` persists quietly. `Send Update` persists, sends notifications, and updates the public timestamp/history.
- Draft indicators reflect unsent changes since the last send.
- 86'd items stay visible publicly with strike-through or badge treatment.
- Food menus hide recipe controls and use food defaults.
- Recovery session data stays in memory only through `_recoverySessionData`, never localStorage.
- Public footer shows `APP_VERSION` and last-updated time. Preview deployments show a `PREVIEW` badge.
- Public routes should boot route-first and avoid flashing the shared loading shell.
- If a dedicated public route is unavailable or disabled, shared fallback rendering must still work.

## Edit Boundaries

- Public route design/content: `leroyslounge/*`, `elroyscantina/*`, plus shared hooks in `app.js` when needed.
- Manager/admin UX: `manager/index.html`, `admin/index.html`, `style.css`, `app.js`.
- Auth/access control: auth overlay in `app.js`, plus `api/_auth.js`, `api/role.js`, `api/users.js`.
- Persistence/menu resolution/notifications: `sbResolveMenu()`, `loadActiveMenuState()`, `persistState()`, `sendUpdate()`, and related API routes.
- Schema/data history: `supabase/migrations/*` only when the task is explicitly about schema or seed data.

## Working Rules

- No dependencies, no bundler, no build step.
- Preserve Supabase auth, live polling, database-backed menu state, and per-menu access control.
- Use CSS custom properties for new colors in `style.css`; avoid hardcoded hex values there.
- Keep accessibility intact: dialog behavior, keyboard flows, ARIA states, and live regions.
- Prefer concise docs over drift-prone line maps or copied constants.
- For Stitch-related public page work, treat the route files as the design destination. Do not reintroduce a separate generated-design artifact flow.
