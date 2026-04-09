# Refactor Issues Pack

This folder is the source-of-truth handoff for the parallel refactor investigation run on 2026-04-06.

Use this pack when implementing the refactor. It already merges duplicate findings across the six investigation lenses, so do not reopen dedupe unless the code clearly contradicts the pack.

## Read Order

1. `refactor-issues/README.md`
2. Your assigned lens file
3. Any linked supporting lens files only when the assigned file says coordination is required

If two files disagree, this `README.md` wins.

## Global Constraints

- No dependencies, no bundler, no build step.
- Preserve the fixed domain model: exactly two restaurants and four menus.
- Preserve Supabase auth, polling, notifications, manager/admin access control, and route-owned public pages.
- Preserve Save vs Send Update as explicit user-facing actions.
- Keep recovery-session data out of `localStorage`.
- Do not generalize into arbitrary restaurant/menu CRUD.
- Keep restaurant-specific visual language intact unless a lens file explicitly requires a shared behavior change.

## Priority Order

1. Fix state/persistence/send problems that can silently publish live data or leave app state inconsistent.
2. Fix authorization and information-leak issues that can expose internal data or bypass menu scoping.
3. Stabilize public-route boundaries so route-specific fixes land consistently in both restaurants.
4. Remove race conditions and deterministic duplicate rerenders on hot paths.
5. Clean up UX/accessibility issues that directly affect trust or successful task completion.

## Deduped Issue Map

| Flag | Severity | Primary Lens | Supporting Lenses | Merged Findings |
| --- | --- | --- | --- | --- |
| `persistence-state-machine-fragmented` | Critical | Behavior | Maintainability, UX-Design, Security | `autosave-nonstructural-edits-bypass-save`, `autosave-draft-blind-spot`, `mutation-contract-drift`, `save-menu-non-atomic-partial-publish`, `manager-save-admin-design-coupling` |
| `send-update-transaction-broken` | Critical | Behavior | Maintainability, UX-Design | `send-update-notifies-before-persist`, `send-update-partial-delivery-marked-success`, `save-send-pipeline-duplication` |
| `public-route-contract-drift` | High | Architecture | Maintainability, Performance | `implicit-route-runtime-contract`, `route-shell-boundary-leak`, `route-runtime-drift` |
| `specials-identity-and-canonical-model-drift` | High | Architecture | Maintainability | `specials-name-identity`, `canonical-model-drift`, `specials-ensure-contract-mismatch` |
| `menu-context-fallback-drift` | High | Behavior | Performance | `menu-cache-not-keyed-by-menu`, `food-defaults-not-applied-on-fallback` |
| `menu-url-global-configuration` | High | Behavior | UX-Design | `menu-url-global-local-only`, `global-menu-url-context-drift` |
| `polling-loop-races-and-full-fetches` | High | Performance | Architecture | `poll-overlap`, `poll-full-read` |
| `public-render-rebuild-duplication` | High | Performance | Architecture, UX-Design | `header-rebuild-public`, `hidden-public-render` |
| `legacy-groupme-menu-access-bypass` | High | Security | none | `legacy-groupme-menu-access-bypass` |
| `featured-sell-note-auth-leak` | High | Security | Architecture | `featured-sell-note-auth-leak` |
| `localstorage-session-token-persistence` | High | Security | none | `localstorage-session-token-persistence` |
| `featured-confirmation-soft-dismissal` | High | UX-Design | Behavior | `featured-confirmation-soft-dismissal` |
| `manager-a11y-gaps` | Medium | UX-Design | none | `custom-picker-a11y-gap`, `send-preview-modal-a11y`, `item-reorder-keyboard-gap` |

## Cross-Lens Coordination

### Shared State Machine

- Behavior owns the user-visible Save, Send Update, cache, and fallback semantics.
- Maintainability owns extraction of shared mutation and sync seams so the fix does not stay ad hoc.
- Security owns authorization boundaries that are currently coupled into general save flows.
- UX-Design owns truthful draft/send messaging once the underlying state machine is fixed.

### Public Route Boundary

- Architecture owns the route adapter contract and route-vs-shared responsibilities.
- Maintainability supports consolidation so the contract is explicit in code.
- Performance validates that the new boundary does not trigger duplicate public renders.

### Notification Stack

- Behavior owns ordering and partial-failure handling for Send Update.
- Security owns removal or hardening of the legacy notification bypass.
- UX-Design owns any partial-success or retry messaging that changes in the UI.

### Specials Identity

- Architecture owns the data model and API contract.
- Maintainability supports extraction of the canonical source and removal of duplicated constants.

## Lens Files

- `refactor-issues/behavior.md`
- `refactor-issues/architecture.md`
- `refactor-issues/performance.md`
- `refactor-issues/maintainability.md`
- `refactor-issues/security.md`
- `refactor-issues/ux-design.md`

## Verification Expectations

- Test both public routes: `/leroyslounge` and `/elroyscantina`.
- Test both menu types: drinks and food.
- Test manager and admin flows separately.
- Test Save and Send Update separately, including partial failure cases.
- Test preview/local behavior without relying on hidden route-specific manager/admin shells.
- Test auth restore, recovery, and sign-in state after any token-handling change.
- Test featured-item confirmation and sell-note visibility after auth and route changes.

## Implementation Notes

- Fix Critical issues before High issues unless a High issue is a direct prerequisite.
- Medium issues are optional unless the affected files or controls are already being touched.
- Prefer one shared seam per concern over patching each call site independently.
- Keep the issue flag names stable in commit messages, notes, and implementation summaries.
