# Parity Spec Tracker

This tracker is the canonical `#304` readiness document for the shared backend parity refactor and the future native iOS follow-on in `#305`.

## Update Policy

- Update this tracker whenever a functionality-changing PR affects backend parity, shared contracts, manager/admin behavior, or iOS readiness.
- Mark each capability as `centralized`, `partial`, or `client-owned`.
- Keep scope fixed to exactly two restaurants and four menus.

## Capability Matrix

| Capability | Status | Current Source Of Truth | Notes / Backend Prerequisite |
| --- | --- | --- | --- |
| Session bootstrap | centralized | `/api/session-bootstrap`, `server/_menu-read.js` | Actor, access, app version, preview-audit metadata already exist. |
| Workspace reads | centralized | `/api/menu-workspace`, `server/_menu-read.js` | Includes staff permissions, shared draft metadata, revisions, and optional restaurant tools. |
| Public reads | centralized | `/api/menu-public`, `server/_menu-read.js` | Guest-safe projection exists and now carries server-owned featured groups for route/public rendering. |
| Shared draft persistence | centralized | `/api/menu-draft`, `server/_menu-draft.js`, `server/_menu-write.js` | Shared drafts now stamp last saver + source with downgrade handling for older schemas. |
| Live save | centralized | `/api/menu-live`, `server/_menu-live.js` | Revision-aware live persistence exists. |
| Publish / send transport | centralized | `/api/menu-publish`, `server/_menu-publish.js` | One route now owns preview and publish command actions. |
| Publish preview / diff | centralized | `/api/menu-publish`, `server/_menu-publish.js` | Canonical diff/sections/patch text are server-generated and selected by `selected_change_ids`. |
| Menu history reads | centralized | `/api/menu-history`, `server/_menu-history.js` | Menu and restaurant scopes now share one history contract with per-log menu/source metadata. |
| History writes | centralized | `server/_menu-write.js` | `update_log` writes are already app-owned. |
| Featured tools writes | centralized | `/api/specials`, `server/_specials-command.js` | Preserve both-menu access rules. |
| Featured reads | partial | shared routes + client fallback | Workspace/public payloads now provide server-owned featured reads; trim the remaining web fallback helpers after more soak time. |
| Capability / config readiness | centralized | `/api/session-bootstrap` | Bootstrap now carries config + readiness while preserving compat modes and rewrites. |
| Audit source stamping | centralized | `server/_menu-write.js`, `server/_menu-history.js` | Draft saves and update-log history now stamp authoritative source metadata with downgrade handling. |
| Conflict handling | partial | revision guards + reconcile metadata | Stale revision responses now include additive conflict units, server snapshot, and reconcile token while preserving reload semantics. |

## Surface Notes

### Web Manager

- Must stop depending on client-authored preview semantics for parity-critical actions.
- Must treat preview failures as explicit user-visible errors rather than falling back to client-owned publish semantics.
- Must prefer shared history and featured boundaries over direct table reads where parity matters.
- Must preserve current draft vs save vs save-and-send behavior while the backend becomes authoritative.

### Public Routes

- Keep route-owned design and brand fidelity intact.
- Keep guest-safe reads separate from staff workspace reads.
- Do not leak draft or staff-only metadata.

### Admin

- Keep admin-only surfaces on the web for this phase.
- Only change admin flows in `#304` when the backend boundary itself requires it.

### Native iOS Follow-On

- Blocked on `#304`.
- Should consume shared contracts instead of recreating product semantics locally.
- Liquid Glass is required on iOS 26+ with deliberate fallbacks on earlier supported iOS versions.

## Migration Sequence

1. Inventory and classify what is already centralized vs partial vs client-owned.
2. Move server-canonical preview/diff generation behind shared backend contracts.
3. Complete shared history and restaurant-tools read models behind existing routes.
4. Add draft authorship, source stamping, and richer conflict metadata.
5. Cut the web runtime onto unified bootstrap/config/profile reads and server-owned restaurant tools payloads.
6. Trim the remaining featured-read fallback helpers once the new paths have soaked.
7. Re-verify readiness for `#305`.

## Explicit Non-Goals

- Arbitrary restaurant or menu CRUD.
- Consumer App Store menu behavior.
- Native admin-console delivery in the iOS app.
- Replacing Supabase as the system of record during this phase.
- Event-sourced draft or publish architecture.
