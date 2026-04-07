# Architecture Lens

Primary owner for shared-runtime boundaries, route contracts, and canonical identity fixes. Read `refactor-issues/README.md` first.

## Owned Flags

- `public-route-contract-drift`
- `specials-identity-and-canonical-model-drift`

## Flag: `public-route-contract-drift`

Severity: High

Merged findings:

- `implicit-route-runtime-contract`
- `route-shell-boundary-leak`
- `route-runtime-drift`

Problem:

Public behavior is split across the shared fallback renderer plus two route-owned runtimes that depend on an implicit `window` contract and incidental DOM presence. Manager/admin mode entry is partly markup-driven, and the two restaurants have already drifted in their route adapters.

Scope:

- Define an explicit shared contract between `app.js` and route-owned public files.
- Make route-vs-shared responsibilities clear.
- Remove manager/admin mode behavior that depends on hidden public-route DOM.
- Bring Leroy's and El Roy's route adapters back into parity without flattening their visual differences.

Not in scope:

- Eliminating route-owned public pages
- Replacing the current route structure with a framework/router

Key evidence:

- `app.js` -> shared fallback public rendering and route handoff
- `app.js` -> `enterManager()`, `enterAdmin()`, preview role switching
- `leroyslounge/app.js`
- `elroyscantina/app.js`
- `leroyslounge/index.html`
- `elroyscantina/index.html`

Acceptance criteria:

- Route-specific public files consume a small explicit adapter boundary from `app.js`.
- Manager/admin mode entry is route-derived, not based on whether public markup happens to contain hidden panels.
- Both restaurant routes implement the same behavioral contract even if their visuals differ.
- Fixes to menu switching, timestamps, featured rendering, and auth header behavior land in one clear place.

Coordination:

- Work with `refactor-issues/maintainability.md` to extract the boundary cleanly.
- Work with `refactor-issues/performance.md` so the new contract avoids duplicate rerenders.

## Flag: `specials-identity-and-canonical-model-drift`

Severity: High

Merged findings:

- `specials-name-identity`
- `canonical-model-drift`
- `specials-ensure-contract-mismatch`

Problem:

Restaurant specials still use duplicated fixed-ID maps and display-name identity across client, API, and database behavior. The lifecycle is also confusing: the "ensure" contract does not clearly own creation vs read behavior.

Scope:

- Make specials identity canonical to restaurant/menu IDs rather than display names.
- Reduce or remove duplicated fixed-ID maps across client/server.
- Clarify the `/api/specials` lifecycle contract so creation/read/migration responsibilities are explicit.

Not in scope:

- Expanding specials into a generalized feature for arbitrary restaurants
- Reworking public featured-card visuals beyond what the identity refactor requires

Key evidence:

- `app.js` -> canonical restaurant/menu constants and restaurant specials configuration
- `api/_auth.js` -> duplicated restaurant specials map
- `api/specials.js` -> name-based lookup/upsert and ensure lifecycle
- `supabase/migrations/20260406000000_add_unique_constraint_featured_groups_name.sql`

Acceptance criteria:

- Specials records resolve by canonical identity, not display name.
- Client and server do not silently drift because of duplicated fixed IDs or labels.
- The `/api/specials` contract clearly expresses whether a call reads, creates, migrates, or updates.

Coordination:

- Work with `refactor-issues/maintainability.md` to keep the canonical source single and explicit.
