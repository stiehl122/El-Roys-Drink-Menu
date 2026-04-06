# El Roy's Drink Menu

Zero-dependency web app for the live public and staff-facing menus of exactly two restaurants:

- Leroy's Lounge
- El Roy's Cantina

Each restaurant has two fixed menus, Drinks and Food. Public pages are route-owned and custom-design first.

## Route Map

- `/`: site picker
- `/leroyslounge`: Leroy's Lounge public route
- `/elroyscantina`: El Roy's Cantina public route
- `/manager`: manager workspace
- `/admin`: admin console

Route rewrites live in [`vercel.json`](vercel.json).

## Architecture

- Shared runtime: [`app.js`](app.js) for menu resolution, Supabase reads/writes, auth/session restore, manager/admin flows, notifications, featured groups, route navigation, and fallback public rendering.
- Shared styles: [`style.css`](style.css)
- Route-owned public shells: [`leroyslounge/index.html`](leroyslounge/index.html), [`leroyslounge/style.css`](leroyslounge/style.css), [`leroyslounge/app.js`](leroyslounge/app.js), [`elroyscantina/index.html`](elroyscantina/index.html), [`elroyscantina/style.css`](elroyscantina/style.css), [`elroyscantina/app.js`](elroyscantina/app.js)
- Shared settings shells: [`manager/index.html`](manager/index.html), [`admin/index.html`](admin/index.html)
- Serverless API routes: [`api/config.js`](api/config.js), [`api/role.js`](api/role.js), [`api/users.js`](api/users.js), [`api/send-notification.js`](api/send-notification.js), [`api/send-groupme.js`](api/send-groupme.js), [`api/_auth.js`](api/_auth.js)

Supabase is the source of truth for menus, categories, items, featured groups, history, notification config, and auth-backed access. Local storage is still used for session/cache support, but live menu state is database-backed.

## Fixed Domain Model

This app is intentionally centered on four known menus, not arbitrary multi-restaurant CRUD: Leroy's Lounge Drinks, Leroy's Lounge Food, El Roy's Cantina Drinks, and El Roy's Cantina Food.

The canonical constants live in [`app.js`](app.js) under `RESTAURANTS` and `MENUS`. Legacy `?menu=el-roys` links still normalize to El Roy's Cantina Drinks.

## Behaviors To Preserve

- `Save` persists current state without notifying anyone.
- `Send Update` persists, sends notifications, and updates the public timestamp/history.
- Draft indicators reflect unsent changes.
- 86'd items remain visible publicly with strike-through or badge treatment.
- Item descriptions and optional prices are supported in public and manager views.
- Food menus hide recipe controls and use food defaults.
- Managers have per-menu access; admins have global access.
- Recovery session data stays in memory only and is never written to localStorage.
- Public footer shows `APP_VERSION` and last-updated time; preview deployments show a `PREVIEW` badge.
- Public routes boot route-first and should not flash the shared loading shell.

## Categories

Drink defaults live in `DEFAULT_CATEGORY_DEFS`.

- `beer`
- `canned`
- `cocktails`
- `tequila`
- `frozen`
- `special`

Food defaults live in `DEFAULT_FOOD_CATEGORY_DEFS`.

- `starters`
- `tacos`
- `entrees`
- `sides`
- `desserts`

Categories stay admin-configurable at runtime. Deleting a category moves its items into the hidden `__uncategorized__` pool.

## Auth And Access

- Client auth uses Supabase Auth email/password flows.
- Role and per-menu access checks are enforced through [`api/role.js`](api/role.js) and [`api/users.js`](api/users.js).
- New accounts start with `role: none`.
- Managers can edit only their assigned menus.
- Admins can manage all four menus, users, categories, notifications, and settings shells.

## Notifications

Notification sends go through [`api/send-notification.js`](api/send-notification.js).

Supported channels:

- GroupMe
- Twilio SMS
- Discord webhook
- Generic webhook

Channel enablement is stored per menu. Credential key mapping is stored per restaurant and resolved against Vercel environment variables.

## Setup And Deploy

### 1. Create Supabase

1. Create a Supabase project.
2. Copy the project URL, anon key, and service role key.
3. Enable email auth.
4. Apply the migrations in [`supabase/migrations/`](supabase/migrations).

### 2. Configure Vercel

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional notification variables:

- `GROUPME_BOT_ID`
- `DISCORD_WEBHOOK_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_TO_NUMBERS`
- `GENERIC_WEBHOOK_URL`
- `GENERIC_WEBHOOK_SECRET`

### 3. Deploy

1. Import the repo into Vercel.
2. Set the environment variables.
3. Deploy.
4. Verify `/api/config` returns the Supabase config payload.

Vercel is required for full functionality. Static-only hosting will not support authenticated writes, config delivery, role lookup, or notifications.

## Development Guardrails

- Do not add dependencies.
- Do not add a bundler or build step.
- Keep the app working as plain HTML, CSS, and JavaScript.
- Preserve Supabase auth, live polling, database-backed menu updates, and per-menu access control.
- Use CSS custom properties for new colors in [`style.css`](style.css).
- Put schema changes in [`supabase/migrations/`](supabase/migrations), not ad hoc dashboard edits.
- For public page redesigns, update the route files directly. Stitch is the design source, but the route files are the implementation destination.
