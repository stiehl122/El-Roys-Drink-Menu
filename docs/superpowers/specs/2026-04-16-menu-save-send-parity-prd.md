# Menu Save/Send Parity Redesign PRD
**Date:** 2026-04-16
**Status:** Drafted from product decision interview

## Problem Statement

The current menu workflow no longer matches the product the team wants to run.
The web client, iOS client, and server still carry shared-draft assumptions,
legacy publish wording, and mixed ownership of draft and send semantics. That
creates drift in core staff behaviors:

- local edits versus shared unsent work are not modeled the same way on both
  clients
- the server still behaves as though shared drafts are a first-class state even
  though the intended workflow is moving away from them
- patch-note and notification state is not represented as one trustworthy
  menu-wide queue across all clients
- action labels and status pills can imply different things depending on which
  client opened the menu
- quiet live saves, queue clearing, and notification sends do not have one
  shared history model

The team wants a straight cutover to a simpler workflow:

- local-only drafts
- server-owned `Live` versus `Live | Unsent`
- one shared queue derived from live state versus notification baseline
- one server-backed history feed
- one consistent save/send experience on web and iOS

## Solution

Replace the shared-draft workflow with a local-draft plus server-queue model.
Drafting becomes private working state stored per `user + menu + client/device`.
The server becomes authoritative for the live menu, the notification baseline,
the menu-wide unsent queue, and the history feed.

The new workflow is:

- `Drafting`: a client-local state that exists only when the current device has
  unsaved edits
- `Live`: server live matches the server notification baseline
- `Live | Unsent`: server live is ahead of the notification baseline and there
  is sendable or clearable queue work available to every client
- `Save`: quiet-only local changes with nothing sendable
- `Save Quietly`: save the current local snapshot live without sending and keep
  the queue available for later send
- `Save & Send`: save the current local snapshot live, preview grouped notify
  changes, send checked groups, and clear unchecked groups without sending
- `Send`: the no-local-save variant of the same preview/send/clear flow when the
  menu is already `Live | Unsent`
- `Discard Draft`: abandon only the current client-local draft after
  confirmation

The patch-notes queue stays derived, not stored as a list of flags. The server
computes it from the live menu and a reduced notification baseline projection
keyed by stable item IDs. Quiet-only changes still save live and appear in
history, but they do not create notification lines. History becomes a typed,
server-shared audit trail grouped by `operation_id`.

## User Stories

1. As a manager editing a menu on web, I want my in-progress edits to stay local
   to my device, so that I can work privately without creating shared draft
   confusion for other staff.
2. As a manager editing a menu on iPhone, I want my local draft to survive app
   relaunch, so that I do not lose work if the app closes or I switch away.
3. As a manager, I want local drafts to be scoped to my user and menu, so that
   another signed-in user never sees my unfinished edits on the same device.
4. As a manager, I want local drafts deleted automatically after a successful
   live save, so that stale local state does not reopen after the work is
   already live.
5. As a manager, I want a confirmable `Discard Draft` action, so that I can
   intentionally abandon local edits without accidentally changing shared queue
   state.
6. As a manager, I want `Live` and `Live | Unsent` to mean the same thing on web
   and iOS, so that the menu’s shared server state is trustworthy regardless of
   client.
7. As a manager, I want `Drafting` to represent only local unsaved edits, so
   that I can distinguish private work from shared unsent live changes.
8. As a manager opening a menu with no local edits, I want to see `Live | Unsent`
   when another client already made quiet saves, so that I know there is still
   queue work available to send or clear.
9. As a manager, I want per-item `Unsent` tags to come from the server, so that
   both clients agree on which live changes still need notification attention.
10. As a manager actively editing an item, I want local `Draft` to override
    `Unsent` on my current client, so that the item’s most actionable state is
    obvious while I work.
11. As a manager, I want `Save Quietly` to update the live menu without sending
    notifications, so that I can stage multiple live edits before one later send.
12. As a manager, I want quiet saves to preserve the queue for later, so that
    earlier unsent changes still appear when I am finally ready to notify staff.
13. As a manager, I want `Save & Send` to be the usual one-shot workflow, so
    that I can save live and handle queue/send review in one flow.
14. As a manager, I want `Send` to appear when there is nothing local to save,
    so that the button language reflects that the changes are already live.
15. As a manager making only quiet-only edits such as price or description
    changes, I want the primary save action to behave like a save, not a send,
    so that the product does not imply a notification that will never happen.
16. As a manager, I want the preview to show which changes will send, which will
    clear without sending, and which will save only, so that the consequences of
    my choices are explicit before I confirm.
17. As a manager, I want quiet-only edits to appear in the preview even though
    they are not selectable, so that I do not mistake their absence from the
    send list for a bug.
18. As a manager, I want grouped selection by real change unit instead of raw
    rendered lines, so that rename and other multi-line cases stay coherent.
19. As a manager, I want rename to appear as `Removed old item name` and
    `Added new item name`, so that staff-facing notification copy matches how
    the change will be understood operationally.
20. As a manager, I want a rename’s remove/add lines to behave as one
    inseparable selectable group, so that I cannot accidentally send only half
    of the rename.
21. As a manager, I want quiet fields like price, description, recipe, and
    reorder changes to stay out of notifications, so that the queue remains
    focused on operationally relevant updates.
22. As a manager, I want add/remove and 86/restore pairs to net out before send,
    so that the queue shows only the final live difference that still matters.
23. As a manager, I want server queue state to survive across clients, so that
    any staff member can pick up the same menu and finish the send flow.
24. As a manager, I want `Save & Send` with unchecked rows to clear those rows
    without notifying, so that I can intentionally acknowledge a queue item
    without sending it to channels.
25. As a manager, I want checked rows to stay in the queue when send delivery
    fails, so that a failed send never silently behaves like a quiet clear.
26. As a manager, I want history to record quiet saves, sends, clears, and
    failures, so that the audit trail reflects what actually happened to the
    menu and the queue.
27. As a manager, I want history and recent updates to be server-backed and
    shared across clients, so that web and iOS do not tell different stories
    about the same menu.
28. As a manager, I want guest-facing last-updated time to reflect when the live
    menu changed, so that public metadata stays honest even when notifications
    are delayed.
29. As a manager, I want stale-save checking to happen when I actually save or
    send, so that background refreshes do not constantly interrupt drafting.
30. As a manager, I want non-overlapping local drafts to auto-rebase on newer
    live data, so that routine cross-client edits do not force unnecessary
    manual reconciliation.
31. As a manager, I want overlapping stale changes to require review before
    save, so that one client does not blindly overwrite another client’s live
    work.
32. As a manager, I want featured changes to participate in the same queue and
    history model as menu items, so that specials and featured updates follow
    the same operational workflow.
33. As a manager, I want the landing-page admin draft/publish system left alone
    during this cutover, so that menu workflow refactoring does not expand into
    a separate product surface.
34. As a developer, I want one shared server contract for workspace state, queue
    derivation, history, and save/send commands, so that web and iOS stop
    re-implementing divergent product rules.
35. As a developer, I want the straight cutover to clear unsupported legacy
    shared drafts instead of migrating them, so that the new model does not
    inherit ambiguous server-owned draft state.

## Implementation Decisions

- Replace the shared-draft mental model with two durable server truths and one
  client-local truth:
  - server live menu state
  - server notification baseline state
  - client-local draft state
- Keep the notification queue derived from live versus a reduced notification
  baseline projection instead of storing explicit queue flags per item.
- Key notification diffing by stable item IDs while rendering human-readable
  labels from names.
- Restrict the notification projection to notify-relevant fields only so quiet
  fields do not create queue churn.
- Introduce a server-owned publish-state read model that exposes:
  - menu-level `Live` versus `Live | Unsent`
  - live revision
  - notification baseline revision
  - enough projection data for clients to derive per-item `Unsent`
  - history/recent-update data consistent across clients
- Build or deepen a server notification-baseline service that can:
  - derive grouped net changes
  - render preview sections
  - accept grouped selections
  - advance only the appropriate baseline entries on successful send or clear
- Build or deepen a server save/send command boundary that supports:
  - save live without notifying
  - save live then preview/send/clear
  - send/clear without local save when the menu is already `Live | Unsent`
  - revision-based stale detection at save time only
  - product-level atomicity between live save, queue transition, and history
- Treat send failure as a queue-preserving outcome unless delivery fully
  succeeds.
- Replace shared-draft history assumptions with typed server-authored history
  entries grouped by `operation_id`.
- Record at least these history kinds or equivalent typed events:
  - live save without notification
  - send notification
  - clear queue without send
  - send failed
- Keep quiet-only saves as first-class history even when they do not create
  queue work.
- Preserve guest footer last-updated semantics as live-save time, not send time.
- Build or deepen a web local-draft store that:
  - autosaves with a debounce
  - restores per `user + menu + client`
  - clears on successful live save
  - never syncs to the server
- Replace the web manager’s current shared-draft status logic with a mixed model
  that combines local `Draft` and server `Unsent`.
- Build or deepen a web action-state resolver that chooses between `Save`,
  `Save Quietly`, `Save & Send`, and `Send` based on:
  - whether local changes exist
  - whether sendable local changes exist
  - whether the server queue exists
- Build or deepen a shared preview model for the web UI that presents:
  - `Will Send`
  - `Will Clear Without Sending`
  - `Will Save Only`
  while keeping section grouping intact.
- Reuse and adapt the iOS local draft store instead of introducing a new shared
  server draft mechanism.
- Remove shared-draft assumptions from the iOS app model, action gating, button
  copy, and preview/send flow.
- Build or deepen an iOS action-state resolver and preview view model that match
  the web product semantics instead of using local-diff-only gating.
- Preserve the current lack of cross-category notification behavior; if a move
  affordance is added later, it should stay quiet unless explicitly redesigned.
- Use straight cutover rather than dual-mode rollout.
- Clear any legacy server-shared drafts at cutover instead of migrating them
  into client-local drafts.
- Keep landing-page admin draft/publish logic out of scope for this workstream.

## Testing Decisions

- Good tests should verify externally visible behavior and contract boundaries,
  not internal implementation details or incidental data shapes.
- Server tests should focus on:
  - live versus notification-baseline diff derivation
  - grouped rename/add/remove/86/restore behavior
  - quiet-only change exclusion from the queue
  - queue preservation on failed send
  - baseline advancement on checked-send and unchecked-clear cases
  - stale revision handling and overlap-aware save rejection behavior
  - history event emission for save, send, clear, and failure cases
- Web tests should focus on:
  - menu-level status derivation from server state plus local draft state
  - per-item `Draft` versus `Unsent` badge precedence
  - primary action label selection
  - preview section composition and grouped selection behavior
  - local draft lifecycle through autosave, discard, save, and restore
- iOS tests should focus on:
  - app-model status/action gating from server queue plus local draft state
  - local draft restore and deletion behavior
  - preview grouping and action copy parity with web
  - stale-save recovery and local-draft rebase behavior
- Prior art for boundary-style server and web tests already exists in the repo’s
  publish, preview, history, metadata-read, and architecture boundary suites.
- Prior art for iOS behavior-focused tests already exists in menu-document tests
  and UI smoke coverage; extend those patterns toward queue-aware state and
  action behavior rather than introducing implementation-coupled tests.

## Out of Scope

- Landing-page admin subsection draft/publish redesign.
- Arbitrary restaurant or menu CRUD.
- Consumer App Store guest behavior changes.
- Native admin-console parity in the iOS app.
- Event-sourced menu history or queue storage.
- Per-item stored queue flags as the authoritative notification model.
- Migrating legacy server-shared drafts into client-local drafts.
- New notification channel design beyond preserving current delivery behavior.
- Cross-category move notifications.

## Further Notes

- The straight cutover should be documented clearly for staff because any
  lingering server-shared drafts will be cleared when the new model ships.
- The queue should remain operationally staff-focused rather than
  customer-focused; that is why price and other quiet-only edits stay out of
  notification lines.
- Featured changes stay in the same queue and history model as item changes even
  if the editing surface remains separate.
- `Save & Send` can remain the umbrella entry label even when the modal is doing
  the precise work of distinguishing send versus clear, as long as the modal
  clearly shows the consequences of checked and unchecked groups.
