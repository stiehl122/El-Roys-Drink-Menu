# El Roy's Drink Menu

Zero-dependency web app for the live public and manager-facing menus of exactly two restaurants:

- Leroy's Lounge
- El Roy's Cantina

Each restaurant has two menus, Drinks and Food, for four total menus. The public experience is custom-design first: each restaurant's public page is owned by its route files, and the shared app falls back to the default accordion renderer only when a route-specific design is unavailable or disabled.

## Current Architecture

- `index.html`, `style.css`, `app.js`: no build step, bundler, or package manager
- Supabase PostgREST: primary read/write path for restaurants, menus, categories, items, menu metadata, featured groups, history, and auth-backed user data
- `localStorage`: session/cache layer used by parts of the shared runtime; live menu behavior is database-backed
- Supabase Auth: client email/password auth with recovery handling
- Vercel API routes in [`api/`](api): config delivery, role lookup, user management, and notifications
- Route-owned public pages in [`leroyslounge/index.html`](leroyslounge/index.html) and [`elroyscantina/index.html`](elroyscantina/index.html)
- Supabase migrations in [`supabase/migrations/`](supabase/migrations) as the database history and provisioning source of truth

## Fixed Restaurant And Menu Model

The app is intentionally centered on four known menus, not arbitrary multi-restaurant CRUD:

- Leroy's Lounge Drinks
- Leroy's Lounge Food
- El Roy's Cantina Drinks
- El Roy's Cantina Food

Those IDs and slugs are hardcoded in [`app.js`](app.js). Legacy `?menu=el-roys` links still normalize to El Roy's Cantina Drinks.

## Key Behaviors

- `Save` persists current state without notifying anyone
- `Send Update` persists, sends notifications, and updates the public timestamp
- Draft indicators show unsent item changes
- 86'd items remain visible publicly with a strike-through and badge
- Item descriptions and optional prices are supported in public and manager views
- Food menus hide recipe controls and use food defaults
- Managers have per-menu access; admins have global access
- Public footer shows `APP_VERSION` and last-updated time; preview deployments show a `PREVIEW` badge

Current app version in code: `v0.8.1` from [`app.js:2`](app.js#L2).

## Public Routes

- Root app shell: `/`
- Leroy's Lounge public route: `/leroyslounge`
- El Roy's Cantina public route: `/elroyscantina`

The shared app detects route ownership and renders the matching public restaurant page when possible. Dedicated restaurant routes now boot route-first so they do not first-paint the shared `CURRENT MENU` shell. Manager/admin flows still live in the shared app shell.

## Repo Layout

```text
El-Roys-Drink-Menu/
├── index.html
├── style.css
├── app.js
├── api/
│   ├── _auth.js
│   ├── config.js
│   ├── role.js
│   ├── send-groupme.js
│   ├── send-notification.js
│   └── users.js
├── leroyslounge/
│   └── index.html
├── elroyscantina/
│   └── index.html
├── assets/
├── docs/
├── scripts/
└── supabase/
    ├── config.toml
    └── migrations/
```

## Setup

### 1. Create A Supabase Project

1. Create a Supabase project.
2. Under Project Settings, copy:
   - project URL
   - anon/public key
   - service role key
3. Enable Email auth.
4. Apply the repo migrations so the project has the expected schema and seed state.

If you use the Supabase CLI locally, this repo is configured to apply migrations during `db push` / `db reset` via [`supabase/config.toml`](supabase/config.toml).

### 2. Configure Vercel

This app requires Vercel for full functionality. The API routes are not optional if you need authenticated role checks, user management, or notification delivery.

Set these required environment variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional notification environment variables:

- `GROUPME_BOT_ID`
- `DISCORD_WEBHOOK_URL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_TO_NUMBERS`
- `GENERIC_WEBHOOK_URL`
- `GENERIC_WEBHOOK_SECRET`

Per-restaurant notification credential mapping is stored in the database; the app can point a restaurant's notification channels at any of the configured env var names.

### 3. Deploy

1. Import the repo into Vercel.
2. Set the environment variables above.
3. Deploy.
4. Open the deployment URL and verify `/api/config` returns the Supabase config payload.

Static-only hosting is insufficient for the full app.

## First-Time Bootstrapping

1. Run the Supabase migrations against the target project.
2. Deploy to Vercel with the required env vars.
3. Open the app and create a user through the Sign Up flow.
4. Promote the first admin directly in Supabase if needed.
5. Use the Admin tab to assign menu access for managers across the four fixed menus.

New accounts start with `role: none`.

## Access Model

| Capability | `manager` | `admin` |
|---|---|---|
| Edit/save/send for assigned menus | Yes | Yes |
| View Admin tab | No | Yes |
| Change categories | No | Yes |
| Manage users and menu access | No | Yes |
| Configure notification credentials | No | Yes |
| Manage featured groups/history/design toggles | No | Yes |

## Categories

Drink defaults:

- `beer`
- `canned`
- `cocktails`
- `tequila`
- `frozen`
- `special`

Food defaults:

- `starters`
- `tacos`
- `entrees`
- `sides`
- `desserts`

Categories remain admin-configurable at runtime. Deleting a category moves its items into the hidden `__uncategorized__` pool.

## Public Design Workflow

Stitch is the source of truth for each restaurant's public design.

- Leroy's Lounge design lives in [`leroyslounge/index.html`](leroyslounge/index.html)
- El Roy's Cantina design lives in [`elroyscantina/index.html`](elroyscantina/index.html)
- Shared fallback rendering still exists in [`app.js`](app.js)

When a design changes, update the route page directly instead of introducing a separate generated design artifact.

## Notifications

Notification sends go through [`api/send-notification.js`](api/send-notification.js).

Supported channels:

- GroupMe
- Twilio SMS
- Discord webhook
- Generic webhook

Enabled/disabled channels are stored per menu. Credential-env-key mapping is stored per restaurant.

## Local Development

There is no build step. Serve the repo with any static file server and use the Vercel deployment for full API behavior, or run a local Vercel-compatible dev flow if you need serverless routes locally.

When doing normal UI work:

- do not add dependencies
- do not add a bundler
- keep the app working as plain HTML/CSS/JS
- preserve Supabase auth, live polling, and database-backed menu updates

## Database Files

The `.sql` files under [`supabase/migrations/`](supabase/migrations) are not used by the browser at runtime, but they are still needed as schema/data migration history and for provisioning a fresh Supabase project.

## Release Notes

- `APP_VERSION` must be updated for every release, including patches
- preview Vercel deployments show a `PREVIEW` badge in the public footer
- schema changes belong in Supabase migrations, not ad hoc dashboard edits
