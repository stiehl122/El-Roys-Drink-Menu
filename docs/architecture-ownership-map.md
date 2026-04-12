# Architecture Ownership Map

This map defines module boundaries and stable labels for planning, PR descriptions, and conflict-aware work slicing.

## Label Taxonomy

- `area:domain-model`
- `area:auth`
- `area:data-session`
- `area:routing-public`
- `area:manager-ui`
- `area:admin-ui`
- `area:api-auth-access`
- `area:api-notifications`
- `area:styles-shared`
- `area:styles-route-leroys`
- `area:styles-route-elroys`
- `area:tests-boundaries`
- `area:tooling-architecture`

## Ownership Map

| Area Label | Scope | Current Primary Files | Planned Module Root |
| --- | --- | --- | --- |
| `area:domain-model` | Fixed restaurant/menu constants, aliases, category defaults | `core/domain/constants.js`, `core/domain/category-defaults.js`, `app.js`, `api/_auth.js`, `supabase/migrations/*` | `core/domain/*` |
| `area:auth` | Sign-in flow, overlay UI, session restore/recovery, auth-trigger visibility | `core/auth/auth-api.js`, `core/auth/auth-session-service.js`, `core/auth/auth-overlay-template.js`, `core/auth/auth-overlay-controller.js`, `core/auth/auth-overlay-unified.css`, `app.js`, `index.html`, `manager/index.html`, `admin/index.html`, `leroyslounge/index.html`, `elroyscantina/index.html` | `core/auth/*` |
| `area:data-session` | Menu lifecycle, persistence, publish/send-update, polling, cache fallback | `core/data/menu-state-loader.js`, `core/session/menu-session.js`, `core/session/publish-service.js`, `core/session/poll-scheduler.js`, `app.js` | `core/data/*`, `core/session/*` |
| `area:routing-public` | Route contracts, route renderer registration, fallback public rendering | `app.js`, `routes/shared/public-route-core.js`, `leroyslounge/app.js`, `elroyscantina/app.js` | `core/routing/*`, `routes/shared/*` |
| `area:manager-ui` | Manager workspace, item/category/pricing/description/database flows | `core/ui/manager/workspace.js`, `core/ui/manager/sections.js`, `core/ui/manager/editors.js`, `app.js`, `manager/index.html`, `style.css` | `core/ui/manager/*` |
| `area:admin-ui` | Admin users/notifications/restaurants settings workflows | `core/ui/admin/workspace.js`, `core/ui/admin/switcher.js`, `app.js`, `admin/index.html`, `style.css`, `api/users.js` | `core/ui/admin/*` |
| `area:api-auth-access` | Token/role/menu access enforcement and role lookup | `api/_auth.js`, `api/role.js`, `api/users.js` | `api/_auth.js` + shared helpers |
| `area:api-notifications` | Notification gateway/send flows and provider integration | `api/_notification-gateway.js`, `api/_supabase.js`, `api/send-notification.js`, `api/send-groupme.js`, `api/specials.js` | `api/*` with shared adapters |
| `area:styles-shared` | Shared shell styles for manager/admin/public fallback and shared controls | `style.css`, `styles/*`, `core/auth/auth-overlay-unified.css` | `styles/*` |
| `area:styles-route-leroys` | Leroy route look/feel and layout styles | `leroyslounge/style.css` | `leroyslounge/style.css` |
| `area:styles-route-elroys` | El Roy route look/feel and layout styles | `elroyscantina/style.css` | `elroyscantina/style.css` |
| `area:tests-boundaries` | Boundary-level behavior tests and runtime helpers | `tests/architecture-boundaries.test.cjs`, `tests/phase1-domain-boundaries.test.cjs`, `tests/phase15-auth-boundaries.test.cjs`, `tests/phase15-auth-unification-complete.test.cjs`, `tests/phase2-module-extraction.test.cjs`, `tests/phase2-session-boundaries.test.cjs`, `tests/phase3-ui-boundaries.test.cjs`, `tests/phase3-ui-deep-boundaries.test.cjs`, `tests/phase4-route-deduplication.test.cjs`, `tests/phase5-api-transport-consolidation.test.cjs`, `tests/phase6-style-layer-split.test.cjs`, `tests/runtime-helpers.test.cjs`, `tests/boundaries/*`, `tests/helpers/runtime.cjs` | `tests/boundaries/*`, `tests/helpers/*` |
| `area:tooling-architecture` | Static architecture checks and migration guardrails | `scripts/*`, `docs/*` | `scripts/*`, `docs/*` |

## Parallel Work Rules

1. Prefer one primary area label per change; add secondary labels only when required.
2. If two features need different areas, split into separate PRs/worktrees.
3. If a change touches `app.js`, state the intended destination module in the PR description to reduce long-lived overlap.
4. For route work, keep brand-specific changes in route files and shared behavior in shared runtime modules.
5. For auth updates, route all new sign-in entry behavior through the shared auth entrypoint boundary.
6. Do not reintroduce per-shell auth overlay markup or styles; keep auth template/controller/style centralized in `core/auth/*`.
