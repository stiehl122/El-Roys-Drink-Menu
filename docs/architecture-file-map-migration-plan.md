# Architecture File Map and Migration Order

## Goal

Move from a monolithic shared runtime toward compartmentalized, boundary-tested modules that allow parallel work on public routes, manager/admin UX, auth/access, and persistence with minimal merge conflicts.

Constraints preserved:
- No dependencies
- No bundler/build step
- Supabase auth/persistence and route-owned public pages remain intact
- Existing clean route rewrites and fallback rendering behavior remain intact

## Success Criteria

- Independent feature work should typically touch 1-3 files in one module area.
- High-churn surfaces (auth, manager item editing, notifications, public route rendering) should have stable boundaries and tests.
- Shared constants for restaurants/menus should have one canonical source used by client and API.
- Auth entry should come from one source-of-truth controller and one overlay origin.

## Phase Status (Completed)

- Phase 0: Complete
- Phase 1: Complete
- Phase 1.5: Complete
- Phase 2: Complete
- Phase 3: In Progress (manager/admin/public UI boundaries established, deeper handler extraction pending)

## Current Hotspots (Baseline)

- `app.js` (~8.4k lines): mixed concerns across domain constants, app state, data, auth, routing, manager/admin UI, publishing, notifications.
- `style.css` (~6.3k lines): shared manager/admin/public styles in one high-churn file.
- Public route runtime duplication between `leroyslounge/app.js` and `elroyscantina/app.js`.
- Auth overlay markup duplicated in every entry shell (`/`, route pages, `/manager`, `/admin`) with shared controller logic in `app.js`.
- Client/server domain IDs duplicated (menu/restaurant constants in `app.js` and `api/_auth.js`).

## Target File Map

### 1) Shared Runtime Modules

Create a shared runtime namespace rooted at `core/`.

```text
core/
  domain/
    constants.js             # APP_VERSION, RESTAURANTS, MENUS, known orders, legacy slug aliases, site paths
    category-defaults.js     # DEFAULT_CATEGORY_DEFS, DEFAULT_FOOD_CATEGORY_DEFS
  state/
    app-state.js             # mutable runtime state container + getters/setters
    draft-ledger.js          # draft indicators and draft badge derivation
  data/
    supabase-client.js       # headers/fetch wrappers
    menu-repository.js       # sbResolveMenu, sbRead/sbPatch primitives
    menu-state-loader.js     # createMenuStateLoaderService + fallback/cache sync
    specials-repository.js   # restaurant specials reads/writes integration points
  session/
    menu-session.js          # createMenuSessionLifecycle + ensureCurrentMenuSession
    publish-service.js       # createMenuPublishService + notification/publish workflow
    poll-scheduler.js        # createMenuPollScheduler + start/stop polling orchestration
  routing/
    page-mode.js             # getAppPageModeFromPath, route/site detection helpers
    href-resolver.js         # public/manager/admin href + menu link resolver
    settings-policy.js       # createSettingsRoutePolicyService
    public-render-coordinator.js
  auth/
    auth-entrypoint.js       # requestSignIn({ origin, screen, reason, returnTo }) gateway
    auth-overlay-template.js # single injected auth overlay markup source
    auth-overlay-controller.js
    supabase-auth.js         # sbSignIn/sbSignUp/sbRefresh/sbUpdatePassword/sbGetProfile
    auth-session.js          # createAccessSessionService, _applySession, refresh scheduling
    auth-ui.js               # compatibility wrappers during migration
  ui/
    shell-visibility.js      # showAppShell/showPicker/public shell toggles
    user-header.js           # renderUserHeader/applyRole/user chip/dropdowns
    menu-picker.js           # showMenuPicker/selectMenu/updateActiveMenuBar
    manager/
      workspace.js
      items.js
      pricing.js
      descriptions.js
      categories.js
      database.js
      tabs.js
    admin/
      workspace.js
      users.js
      notifications.js
      switcher.js
    public/
      renderer-default.js
      footer-actions.js
      category-collapse.js
    shared/
      toast.js
      modal-preview.js
      design-controls.js
      keyboard-shortcuts.js
  bootstrap/
    init.js                  # init orchestration and startup order
```

### 2) Route-Owned Public Runtime

```text
routes/
  shared/
    public-route-core.js     # common renderer contract glue, menu switching, settings dropdown behavior
  leroyslounge/
    route-renderer.js        # brand/theme-specific templates + selectors only
  elroyscantina/
    route-renderer.js        # brand/theme-specific templates + selectors only
```

Keep route ownership intact:
- `leroyslounge/index.html|style.css|app.js`
- `elroyscantina/index.html|style.css|app.js`

But route `app.js` files become thin wrappers that pass brand selectors and markup adapters into `routes/shared/public-route-core.js`.

### 3) API Layer Decomposition

```text
api/
  _auth.js                   # role and access guard boundary (kept)
  _supabase.js               # shared service headers + rest helpers + json/error helpers
  _notification-gateway.js   # shared authorization gate (kept)
  role.js
  users.js
  specials.js
  send-notification.js
  send-groupme.js
```

Goal: endpoint files keep handler-level intent; transport and repetitive Supabase boilerplate moves to `_supabase.js`.

### 4) Style Layers

```text
styles/
  tokens.css                 # CSS vars and semantic tokens
  shared-shell.css           # wrapper/loading/auth base and shared controls
  public-fallback.css        # non-route-owned public fallback shell
  manager.css                # manager settings shell
  admin.css                  # admin console shell
  components/
    auth-overlay.css
    menu-picker.css
    toast.css
```

Route-specific styles remain in:
- `leroyslounge/style.css`
- `elroyscantina/style.css`

`/style.css` can remain as compatibility entrypoint that `@import`s layered files during transition.

### 5) Test Layout

```text
tests/
  boundaries/
    session.boundary.test.cjs
    publish.boundary.test.cjs
    auth.boundary.test.cjs
    routing.boundary.test.cjs
    public-route.boundary.test.cjs
    manager-ui.boundary.test.cjs
    api-gateway.boundary.test.cjs
  helpers/
    runtime.cjs
```

Split `architecture-boundaries.test.cjs` into module-focused boundary suites without losing current coverage.

## Migration Order (Safe, Small Slices)

### Phase 0: Guardrails and Mechanical Prep

1. Add architecture ownership map doc (`docs/`) and module labels.
2. Add import-order check script (no build required) for HTML script tags to avoid accidental reorder regressions.
3. Add a test helper that can load multiple runtime files in deterministic order (extend `tests/helpers/runtime.cjs`).

### Phase 1: Canonical Domain and Shared Utilities

1. Extract canonical constants into `core/domain/constants.js`.
2. Rewire `app.js` and `api/_auth.js` to consume canonical constants (single source-of-truth).
3. Extract category defaults into `core/domain/category-defaults.js` and consume from current code.
4. Add boundary tests for constants normalization and legacy slug alias behavior.

Expected merge-conflict reduction: medium. Large payoff because many features currently touch constants.

### Phase 1.5: Auth Unification (Single Sign-In Origin)

1. Introduce `requestSignIn({ origin, screen, reason, returnTo })` and move all auth triggers to this entrypoint:
   - Public/footer sign-in
   - Header sign-in
   - Settings `requireAuth()` gate
   - Recovery callback reset flow
2. Extract auth API calls into `core/auth/auth-api.js` and keep `app.js` wrappers temporarily for backward compatibility.
3. Extract session/auth state orchestration into `core/auth/auth-session-service.js`:
   - `createAccessSessionService`
   - `_applySession`
   - token refresh scheduling
   - sign-out session cleanup
4. Extract overlay runtime controller into `core/auth/auth-overlay-controller.js`:
   - open/close/focus trap
   - screen transitions (`signin/signup/forgot/reset`)
   - auth keyboard wiring
5. Add `core/auth/auth-overlay-template.js` as the single markup source; mount once at runtime and remove duplicated overlay markup from:
   - `/index.html`
   - `/manager/index.html`
   - `/admin/index.html`
   - `/leroyslounge/index.html`
   - `/elroyscantina/index.html`
6. Replace inline `openAuthOverlay()` handlers with delegated auth triggers (`data-auth-trigger`), all routed to `requestSignIn()`.
7. Unify API auth boundary by enhancing `api/_auth.js` and making `api/role.js` a thin adapter over shared helpers.
8. Remove route-specific hard-hiding of topbar sign-in so shared auth visibility policy owns behavior consistently.

Boundary tests to add/update in this phase:
- Auth-required settings flow asserts `requestSignIn()` invocation.
- Recovery session remains memory-only (never persisted to localStorage).
- Overlay controller screen transitions + keyboard behavior.
- Single overlay source assertion (no multi-shell drift).
- `api/role` path verifies no duplicate token verification logic outside shared boundary.

Expected merge-conflict reduction: high. This creates one auth origin and one controller boundary across all surfaces.

### Phase 2: Session/Data Deep Modules

1. Move `createMenuSessionLifecycle`, `createMenuPublishService`, `createMenuStateLoaderService`, and polling scheduler into dedicated `core/session` + `core/data` files.
2. Keep old call sites but route through the new module exports.
3. Preserve existing behavior and expand tests by splitting current lifecycle/publish tests into dedicated files.

Expected reduction: high. This isolates persistence/send-update work from UI styling and shell rendering edits.

### Phase 3: UI Surface Separation (Manager/Admin/Public)

1. Split manager rendering/handlers into `core/ui/manager/*`.
2. Split admin rendering/handlers into `core/ui/admin/*`.
3. Split shared/public fallback rendering into `core/ui/public/*`.
4. Keep `app.js` as orchestrator shim that delegates to modules.

Expected reduction: high. Manager/admin and public work stop colliding in one file region.

### Phase 4: Route Renderer Deduplication

1. Introduce `routes/shared/public-route-core.js` with shared menu-switching/settings-dropdown/sign-in hook behavior.
2. Convert each route app file into a brand adapter only.
3. Keep route-specific HTML/CSS untouched except selectors/hooks needed for the adapter.
4. Add route contract tests per restaurant adapter + shared core behavior tests.

Expected reduction: medium-high. Same fix no longer requires twin route edits.

### Phase 5: API Transport Consolidation

1. Add `api/_supabase.js` for headers, fetch wrappers, response parsing, and common error shaping.
2. Refactor `role.js`, `users.js`, `specials.js`, `send-notification.js` to consume it.
3. Preserve `_auth.js` and `_notification-gateway.js` as guard boundaries.
4. Add API boundary tests for auth + notification gateway + specials edge cases.

Expected reduction: medium. Removes repetitive API edits and inconsistency risk.

### Phase 6: CSS Layer Split

1. Introduce `styles/` layers and migrate shared blocks out of `style.css` incrementally.
2. Keep `/style.css` compatibility wrapper to avoid entrypoint churn.
3. Validate manager/admin/route shells visually after each extraction slice.

Expected reduction: medium. Reduces unrelated style merge collisions.

## Auth Architecture Readiness

- Current readiness for unified sign-in origin: **45-50%**
- Expected after Phase 1.5 completion: **80-85%**

Primary gaps this phase closes:
- 5 duplicated auth overlay markup sources
- inconsistent sign-in entry origins across routes/settings/header/footer
- duplicated API token/profile verification paths

## Proposed KPIs

- `app.js` reduced from 8.4k lines to <2k orchestrator shim.
- No single runtime module over 800 lines.
- Average PR touching only one runtime area (session/data OR manager OR admin OR public OR auth).
- Duplicate public route logic reduced to shared core + thin adapters.
- Auth entrypoints reduced to one request gateway.
