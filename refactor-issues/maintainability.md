# Maintainability Lens

Primary owner for extracting safe seams under the already-deduped issue flags. Read `refactor-issues/README.md` first.

This lens mostly supports shared root causes that were merged into Behavior and Architecture flags. Do not create new broad cleanup work. Extract only the seams needed to make the high-severity fixes stick.

## Support Task: Shared Mutation Contract

Supports flags:

- `persistence-state-machine-fragmented`

Merged findings:

- `mutation-contract-drift`

Problem:

There is no single edit seam that marks draft state, enforces Save/Send invariants, and controls persistence. Some paths mutate in memory and call `invalidateDiff()`, while others mutate in memory and call `persistState()` directly.

Scope:

- Extract one small shared mutation contract for menu edits.
- Make draft invalidation, persistence staging, and manager refresh behavior consistent.

Not in scope:

- Large architecture rewrites unrelated to the persistence issue

Key evidence:

- `app.js` -> `invalidateDiff()`
- `app.js` -> `toggle86()`
- `app.js` -> `toggleVisibility()`
- `app.js` -> `renameItem()`
- `app.js` -> `addIngredient()`, `removeIngredient()`, `saveDesc()`, `savePrice()`

Acceptance criteria:

- New or existing edit flows cannot bypass the shared contract accidentally.
- Future edits do not need to remember separate draft and persistence rules at each call site.

## Support Task: Shared Save/Send Orchestrator

Supports flags:

- `persistence-state-machine-fragmented`
- `send-update-transaction-broken`

Merged findings:

- `save-send-pipeline-duplication`

Problem:

Save and Send Update each layer additional sync work around `persistState()` in different orders with different failure handling, which makes invariants drift.

Scope:

- Extract one shared persistence/sync seam that both Save and Send Update can build on.
- Make failure handling, metadata sync, and cache updates easier to reason about.

Not in scope:

- Moving business logic into new services

Key evidence:

- `app.js` -> `persistState()`
- `app.js` -> `saveMenu()`
- `app.js` -> `sendUpdate()`

Acceptance criteria:

- Save and Send Update no longer each re-encode the same persistence contract differently.
- A future change to persistence ordering or metadata sync has one obvious landing zone.

## Support Task: Explicit Public Route Adapter

Supports flags:

- `public-route-contract-drift`
- `specials-identity-and-canonical-model-drift` (only where route/shared ownership is involved)

Merged findings:

- `route-runtime-drift`

Problem:

Equivalent public behaviors are implemented separately in `leroyslounge/app.js` and `elroyscantina/app.js`, and both routes reach into shared globals directly.

Scope:

- Pull shared public behavior behind a small explicit adapter.
- Keep route files focused on route-owned layout/skin concerns.

Not in scope:

- Eliminating route-specific files
- Unifying restaurant styles

Key evidence:

- `leroyslounge/app.js`
- `elroyscantina/app.js`
- `app.js` -> route/public helper surface

Acceptance criteria:

- The two route files implement the same behavioral adapter surface.
- Route-specific fixes no longer require parallel hand edits in multiple places for the same shared behavior.
