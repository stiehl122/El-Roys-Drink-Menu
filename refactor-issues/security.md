# Security Lens

Primary owner for privilege boundaries, unsafe exposure, and notification/auth attack surfaces. Read `refactor-issues/README.md` first.

## Owned Flags

- `legacy-groupme-menu-access-bypass`
- `featured-sell-note-auth-leak`
- `localstorage-session-token-persistence`

## Shared Security Support

Also support `persistence-state-machine-fragmented` where the current save path crosses an admin-only write boundary.

## Support Flag: Admin-Only Design Write in General Save Path

Severity: High

Merged findings:

- `manager-save-admin-design-coupling`

Problem:

General manager saves still run through a path that includes `sbPatchRestaurantDesign(currentDesign)`, even though the `restaurants` table is admin-write only.

Scope:

- Decouple ordinary manager saves from admin-only restaurant-design writes.
- Preserve admin ability to update restaurant design where intended.

Not in scope:

- Reworking design editing UX unless necessary for permission clarity

Key evidence:

- `app.js` -> `persistState()`
- `app.js` -> `sbPatchRestaurantDesign()`
- `supabase/migrations/20260327000000_v0.7.0_menu_schema.sql`

Acceptance criteria:

- A manager can save allowed menu changes without crossing an admin-only write boundary.
- Admin-only restaurant design writes remain admin-only.

Coordination:

- Coordinate with `refactor-issues/behavior.md` because this currently lives inside the shared persistence state machine.

## Flag: `legacy-groupme-menu-access-bypass`

Severity: High

Problem:

The legacy `/api/send-groupme` route accepts any manager/admin token and posts arbitrary text through the global bot without validating `menu_id` or per-menu access.

Scope:

- Remove the legacy bypass or harden it to the same authorization model as the current notification route.

Not in scope:

- Replacing GroupMe as a provider

Key evidence:

- `api/send-groupme.js`
- `api/send-notification.js`
- `api/_auth.js` -> `requireMenuAccess()`

Acceptance criteria:

- No notification endpoint can be used to send cross-menu updates with only broad role access.

## Flag: `featured-sell-note-auth-leak`

Severity: High

Problem:

The shared public fallback path exposes featured sell notes to any signed-in session, even though the field is labeled "staff only" and self-signup leaves role `none` users authenticated.

Scope:

- Gate featured sell-note visibility by the correct privilege boundary.
- Preserve valid staff visibility where intended.

Not in scope:

- Reworking featured-item visuals unrelated to the leak

Key evidence:

- `app.js` -> shared public fallback rendering of featured slots
- `app.js` -> featured-item editor labeling for sell notes
- `app.js` -> signup/sign-in state and role handling

Acceptance criteria:

- Role `none` users cannot view staff-only sell notes.
- Public fallback and route-owned public behavior do not leak staff-only featured metadata.

## Flag: `localstorage-session-token-persistence`

Severity: High

Problem:

Access and refresh tokens are stored, refreshed, and restored from `localStorage`. In a codebase that relies heavily on `innerHTML` and inline handlers, any future DOM injection issue would become durable account takeover.

Scope:

- Reduce the durability/exposure of session tokens while preserving auth restore requirements and recovery-session constraints.
- Keep `_recoverySessionData` memory-only.

Not in scope:

- Full auth-provider replacement
- Server-side session architecture rewrite

Key evidence:

- `app.js` -> token write/refresh/restore paths
- `app.js`, `leroyslounge/app.js` -> heavy `innerHTML`/inline-handler surfaces

Acceptance criteria:

- Session handling materially reduces the blast radius of any future DOM injection bug.
- Recovery flow still keeps recovery-session data out of `localStorage`.
- Sign-in, restore, and logout behavior remain correct for manager and admin users.
