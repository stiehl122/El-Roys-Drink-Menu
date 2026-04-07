# Behavior Lens

Primary owner for behavior-correctness fixes. Read `refactor-issues/README.md` first.

## Owned Flags

- `persistence-state-machine-fragmented`
- `send-update-transaction-broken`
- `menu-context-fallback-drift`
- `menu-url-global-configuration`

## Flag: `persistence-state-machine-fragmented`

Severity: Critical

Merged findings:

- `autosave-nonstructural-edits-bypass-save`
- `autosave-draft-blind-spot`
- `save-menu-non-atomic-partial-publish`
- `mutation-contract-drift`
- `manager-save-admin-design-coupling` (shared with Security)

Problem:

Multiple edit paths write live state directly through `persistState()` instead of flowing through one pending-change model. Save is not atomic from the app's perspective, draft state misses some edits, and the same persistence path currently reaches into an admin-only restaurant-design write.

Scope:

- Make category, recipe, description, and price edits obey the same Save/Send Update contract as name/86/visibility edits.
- Ensure draft state reflects every meaningful unsent edit.
- Make Save succeed or fail as one coherent user-visible transition.
- Coordinate with Security so ordinary manager saves do not depend on admin-only restaurant writes.

Not in scope:

- Redesigning manager UI layout
- Rewriting restaurant visuals
- Changing the fixed two-restaurant/four-menu model

Key evidence:

- `app.js` -> `saveCategoryEdit()`, `moveCategoryUp()`, `moveCategoryDown()`, `deleteCategory()`, `confirmAddCategory()`
- `app.js` -> `addIngredient()`, `removeIngredient()`, `saveDesc()`, `savePrice()`
- `app.js` -> `persistState()`
- `app.js` -> `saveMenu()`
- `app.js` -> polling path in `startPolling()`

Acceptance criteria:

- Editing category metadata/order/add/delete does not silently publish outside the intended Save/Send flow.
- Editing price, description, or recipe does not silently publish outside the intended Save/Send flow.
- Draft state and action-bar state reflect all unsent edits.
- Save does not partially publish content and then report failure.
- The persistence path used by managers no longer fails because it includes admin-only restaurant writes.

Coordination:

- Work with `refactor-issues/maintainability.md` for extraction of the shared mutation contract.
- Work with `refactor-issues/security.md` for the admin-only restaurant-write boundary.
- Work with `refactor-issues/ux-design.md` so draft/send messaging stays truthful after the behavior fix.

## Flag: `send-update-transaction-broken`

Severity: Critical

Merged findings:

- `send-update-notifies-before-persist`
- `send-update-partial-delivery-marked-success`
- `save-send-pipeline-duplication`

Problem:

`sendUpdate()` sends notifications before durable persistence and metadata sync. It also treats `207` partial delivery as success. The current pipeline can tell guests an update went out even when the app's stored state, last-sent metadata, or audit trail did not finish syncing.

Scope:

- Make Send Update operate as one coherent state transition.
- Do not treat partial delivery as full success.
- Unify shared persistence/send orchestration instead of keeping a separate ad hoc sync branch.

Not in scope:

- Adding external queueing systems or dependencies
- Replacing the existing notification providers

Key evidence:

- `app.js` -> `sendUpdate()`
- `api/send-notification.js` -> partial-delivery response handling
- `app.js` -> shared persistence helpers used by both Save and Send

Acceptance criteria:

- Notifications are not treated as committed before state and send metadata are in a trustworthy state.
- Partial delivery is surfaced as partial delivery, not full success.
- After a failed send-sync path, the app does not clear state in a way that implies the update fully succeeded.
- Save and Send Update share a clear persistence boundary instead of drifting orchestration logic.

Coordination:

- Work with `refactor-issues/maintainability.md` on the shared sync seam.
- Work with `refactor-issues/ux-design.md` if the UI needs distinct full-success vs partial-success messaging.

## Flag: `menu-context-fallback-drift`

Severity: High

Merged findings:

- `menu-cache-not-keyed-by-menu`
- `food-defaults-not-applied-on-fallback`

Problem:

Fallback and empty/error states are not tightly keyed to the active menu context. A sibling menu can hydrate the wrong cached state, and food menus can retain drink defaults or recipe affordances on fallback paths.

Scope:

- Key local fallback cache by menu identity, not only by restaurant.
- Ensure `MENU_TYPE` drives defaults on empty and error paths.
- Ensure food-mode recipe hiding stays consistent, including the uncategorized pool.

Not in scope:

- Large cache redesigns unrelated to menu correctness
- Visual redesign of food/drinks screens

Key evidence:

- `app.js` -> `readCachedMenuState()`
- `app.js` -> `setActiveMenuContext()`
- `app.js` -> `hydrateState()`
- `app.js` -> food-mode manager item rendering and uncategorized item rendering

Acceptance criteria:

- A failed El Roy food load cannot hydrate stale El Roy drinks cache.
- Empty/error food paths use food defaults, not stale drink categories.
- Food-mode recipe controls are hidden consistently across all manager renderers.

Coordination:

- Keep an eye on `refactor-issues/performance.md` so cache/fallback changes do not worsen polling cost.

## Flag: `menu-url-global-configuration`

Severity: High

Merged findings:

- `menu-url-global-local-only`
- `global-menu-url-context-drift`

Problem:

Notification links come from one device-local global setting instead of the active menu context. A link saved while working in one restaurant can be reused when sending an update for another restaurant or another menu.

Scope:

- Make notification link resolution menu-aware and restaurant-aware.
- Prefer deriving the link from canonical route/menu context or from shared persisted configuration.

Not in scope:

- Rebuilding the admin settings surface from scratch

Key evidence:

- `app.js` -> global `MENU_URL` state
- `app.js` -> `saveMenuUrl()`
- `app.js` -> `buildPatchMessage()`

Acceptance criteria:

- Sending a Leroy's update cannot accidentally append an El Roy's link, and vice versa.
- Link behavior is consistent across devices rather than relying on one browser's local storage state.

Coordination:

- Coordinate with `refactor-issues/ux-design.md` if the admin UI copy or affordance needs to change to match the new behavior.
