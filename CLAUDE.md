# CLAUDE.md — El Roy's Drink Menu

## Mission

Maintain a zero-dependency, Vercel-backed app for exactly two restaurants:

- Leroy's Lounge
- El Roy's Cantina

Each restaurant has exactly two fixed menus, Drinks and Food. Do not
generalize the product into arbitrary restaurant/menu CRUD unless a task
explicitly asks for it.

This file should guide agent behavior. It is not meant to be a full codebase
map.

## Product Shape

- `/` is the shared landing page and restaurant chooser, not a parent-company
  brand site.
- `/leroyslounge` and `/elroyscantina` are route-owned public pages.
- `/manager` is the staff editing workspace.
- `/admin` is the admin console, including landing-page management.
- The repo also contains an iOS client. Web remains the primary surface here,
  but shared server contracts and product capabilities should not drift
  silently from iOS expectations.

## Read First

- For design-facing work, read `docs/design/` first.
- For architecture, ownership, or boundary questions, read `docs/architecture/`
  first.
- For cross-client capability or parity questions, read `docs/FEATURES.md`.

Then inspect the smallest relevant code area:

- public route folders
- `core/`
- `api/`
- `server/`
- `ios/`
- `tests/`

## Non-Negotiable Behaviors

- `Save` persists quietly.
- `Send Update` persists, sends notifications, and updates the public
  timestamp/history.
- Landing-page draft save stays separate from publishing selected landing
  sections live.
- Draft indicators reflect unsent changes since the last send/publish.
- 86'd items stay visible publicly with strike-through or badge treatment.
- Food menus hide recipe controls and use food defaults.
- Managers have per-menu access; admins have global access.
- Recovery session data stays in memory only, never localStorage.
- Legacy `?menu=el-roys` still normalizes to El Roy's Cantina Drinks.
- Deleted categories move items into `__uncategorized__`, which stays hidden
  from the public UI.
- Public footer shows `APP_VERSION` and last-updated time; preview deployments
  show a `PREVIEW` badge.
- Public routes should boot route-first and avoid flashing the shared loading
  shell.
- If a dedicated public route is unavailable or disabled, shared fallback
  rendering must still work.
- Public route sign-in entry should remain in footer staff actions; do not
  reintroduce top-of-page login buttons.

## Working Rules

- No dependencies, no bundler, no build step.
- Keep the app working as plain HTML, CSS, and JavaScript.
- Preserve Supabase auth, live polling, database-backed menu state, and
  per-menu access control.
- Keep auth overlay markup and styling centralized in the shared auth layer.
- Keep accessibility intact: dialog behavior, keyboard flows, ARIA states, and
  live regions.
- Prefer updating the module or folder that already owns a behavior instead of
  expanding unrelated files.
- Use `supabase/migrations/` for schema changes; do not rely on ad hoc
  dashboard edits.
- If a change materially affects shared web/iOS capability parity, update
  `docs/FEATURES.md` in the same change.

## Design Rules

- Do not flatten Leroy's Lounge and El Roy's Cantina into one generic
  hospitality brand.
- Shared landing-page work should blend both identities without inventing a
  third umbrella brand.
- Route-owned public pages should lean hard into their assigned restaurant's
  vibe.
- For Stitch-related public-page work, treat the repo files as the design
  destination.

## Verification

- Run the smallest relevant tests in `tests/` for the area you changed,
  especially boundary tests around auth, routing, publish flows, landing-page
  state, or ownership seams.
- Run `node --check app.js` when editing shared runtime behavior.
- Run `node scripts/check-html-script-order.cjs` when touching entry shells or
  shared auth loading.
- Verify the user-facing behavior that matters for the change, not just syntax.
- For route work, confirm route-first boot and footer staff actions still hold.
- For save/send work, confirm quiet save and notify/publish flows still behave
  differently.
- For landing-page work, confirm draft save and selective live publish remain
  separate behaviors.
