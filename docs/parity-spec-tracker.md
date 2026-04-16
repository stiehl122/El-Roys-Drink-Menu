# Menu Save/Send Parity Tracker

This tracker is the canonical target-state document for the menu save, queue,
history, and send workflow shared by the server, web manager, and native iOS
client.

Scope stays fixed to exactly two restaurants and four menus:

- Leroy's Lounge Drinks
- Leroy's Lounge Food
- El Roy's Cantina Drinks
- El Roy's Cantina Food

## Update Policy

- Update this tracker whenever a behavior-changing PR affects menu save/send
  semantics, menu-level status, item tags, history, conflict handling, or iOS
  parity.
- Track the intended cutover model, not the legacy shared-draft model.
- Keep landing-page admin draft/publish behavior out of scope for this tracker.

## Canonical Workflow Model

1. `Drafting` is client-local only. Local drafts are stored per
   `user + menu + client/device`, autosaved locally, restored on relaunch, and
   deleted after the current local editor snapshot is successfully saved live.
2. The server owns the live menu snapshot, the notification baseline, the menu
   history feed, and the menu-wide queue state.
3. Menu-level server status is either `Live` or `Live | Unsent`.
4. Item-level `Unsent` is server-derived from the current live snapshot versus
   the notification baseline.
5. Item-level `Draft` is client-local and takes precedence over `Unsent` on the
   editing client.
6. `Save Quietly` writes the current editor snapshot to the live menu and keeps
   the queue available for a later send.
7. `Save & Send` writes the current editor snapshot to the live menu, sends the
   checked change groups, and clears the unchecked change groups without
   notifying.
8. `Send` is the no-local-save variant of `Save & Send` when the menu is already
   `Live | Unsent`.
9. `Discard Draft` is local-only and must never modify the shared server queue
   or history.

## Queue And Preview Contract

- The queue is a derived net diff, not a stored list of item flags.
- The server compares the live menu against a reduced notification baseline
  projection keyed by stable item IDs.
- The queue must be shared menu-wide across web and iOS.
- Quiet saves must preserve queued notify-worthy deltas for later send.
- Add/remove and 86/restore pairs must net out before send when they cancel each
  other.
- Rename must render as `Removed old item name` plus `Added new item name`, but
  remain one inseparable selectable change group.
- Preview selection operates on grouped change units, not raw rendered lines.
- Preview must remain section-grouped and must separate:
  - `Will Send`
  - `Will Clear Without Sending`
  - `Will Save Only`
- Quiet-only changes must be shown in preview even though they are not
  selectable.

## Notify-Worthy Versus Quiet-Only Changes

Notify-worthy changes:

- item added
- item removed
- item 86'd
- item restored
- featured/specials membership changed
- item renamed, rendered as remove plus add for staff-facing notification copy

Quiet-only changes:

- price
- description
- recipe text
- recipe visibility
- category copy
- cosmetic reorder
- category moves, if a move affordance is ever added later

## Capability Matrix

| Capability | Intended Owner | Target State | Cutover Notes |
| --- | --- | --- | --- |
| Workspace read model | server | Returns menu-level publish state, live revision, notification baseline revision, queue metadata, and enough notification projection data for both clients to derive `Unsent` tags and send preview state. | Replace shared-draft metadata in the shared workspace payload. |
| Local draft storage | client-local | Local drafts autosave per `user + menu + client/device`, survive refresh/relaunch, never sync to the server, and are deleted after successful live save or explicit discard. | Web needs parity with the existing iOS-style device draft behavior. |
| Live save | server | Live writes happen only at explicit save time, guarded by live revision checks, and update the guest-facing last-updated timestamp immediately. | `Save Quietly` and the save half of `Save & Send` use the same live-save boundary. |
| Send preview / diff | server with client overlay | The server derives grouped notify-worthy changes from live versus notification baseline, while the client layers current local draft changes into the preview before confirmation. | Replace shared-draft-based preview gating. |
| Notification baseline / queue | server | The queue is derived from live versus a reduced notification baseline projection, shared across all clients, and only advances on successful send or explicit clear-through-uncheck. | Do not store per-item queue flags as source of truth. |
| Menu history / recent updates | server | History is menu-wide, typed, grouped by `operation_id`, and shared consistently across web and iOS. | Replace send-only mental model with save, send, clear, and failure event types. |
| Item tags | mixed | `Unsent` is server-derived and shared; `Draft` is client-local and overrides `Unsent` on the editing client only. | Web already has local badge behavior; both clients must converge on the same contract. |
| Conflict handling | server plus client recovery | Staleness is checked only at save/send time; non-overlapping local drafts auto-rebase; overlapping changes require review before save. | Replace shared-draft revision semantics with live revision plus notification baseline revision semantics. |
| Public footer metadata | server | Guest-facing last-updated time reflects the last live save, not the last notification send, and must not leak queue state. | Preserve current footer truthfulness while decoupling send timing. |
| Migration / cutover | server plus clients | Straight cutover. Existing server-shared drafts are cleared, not migrated, and the legacy shared-draft workflow is removed rather than supported in parallel. | No compatibility layer for shared drafts after cutover. |

## Surface Notes

### Server

- The server must become authoritative for `Live` versus `Live | Unsent`.
- The server must own the reduced notification baseline projection and its
  revision.
- `Save & Send` must be atomic from the product point of view: the saved live
  snapshot, queue transition, and history writes must correspond to the same
  operation.
- Send failures must leave the checked change groups in the queue for retry.
- `Save Quietly` must record a first-class history event even when it creates no
  send work.

### Web Manager

- Replace shared-draft UI language and status copy with local-draft language.
- Use server-backed menu status for `Live` and `Live | Unsent`.
- Keep local `Draft` item tags and layer them on top of shared `Unsent` state.
- Use dynamic primary action labels:
  - `Save` for quiet-only local changes with nothing sendable
  - `Save Quietly` when sendable changes exist but the user wants a quiet save
  - `Save & Send` when local save plus queue review is required
  - `Send` when there is no local save but the menu is already `Live | Unsent`

### Native iOS

- Reuse device-local draft storage keyed by `user + menu`.
- Remove shared-draft assumptions from the app model, send gating, and copy.
- Drive send availability from server unsent state plus local changes, not only
  from local diff versus live.
- Mirror web preview sections, grouped selection behavior, and dynamic action
  language.

### Public And Guest Surfaces

- Public menus should reflect live saves immediately, including quiet saves.
- Public routes must not expose queue state, draft state, or send/clear history
  nuance.

### Admin And Landing Page

- The shared `/admin` landing-page subsection draft/publish workflow is out of
  scope for this parity tracker.
- Only menu workspaces participate in this cutover.

## Migration Sequence

1. Cut the shared workspace read model over from shared-draft metadata to
   publish-state, notification-baseline, and queue-projection data.
2. Land the server-side notification baseline projection, grouped diff engine,
   typed history writes, and stale-save conflict contract.
3. Cut the web manager onto local-only drafts, server-backed `Unsent`, and the
   new preview/action semantics.
4. Cut the iOS client onto the same server contract and remove shared-draft UI
   and API expectations.
5. Clear any existing shared drafts at release cutover and remove the legacy
   shared-draft path instead of running dual semantics.

## Explicit Non-Goals

- Arbitrary restaurant or menu CRUD.
- Landing-page admin subsection draft/publish parity.
- Consumer App Store menu behavior.
- Native admin-console delivery in the iOS app.
- Event-sourced queue or draft architecture.
- Migrating server-shared drafts into client-local drafts.
