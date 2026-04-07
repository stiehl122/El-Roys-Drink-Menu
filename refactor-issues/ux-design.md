# UX-Design Lens

Primary owner for user trust, clarity, and accessibility fixes. Read `refactor-issues/README.md` first.

## Owned Flags

- `featured-confirmation-soft-dismissal`
- `manager-a11y-gaps`

## Shared UX Support

Also support:

- `persistence-state-machine-fragmented`
- `send-update-transaction-broken`
- `menu-url-global-configuration`

## Support Flag: Truthful Draft and Send State

Severity: High

Merged findings:

- `autosave-draft-blind-spot`

Problem:

The current manager UI can say "No unsent changes" while meaningful edits have already persisted or while send-related state is inconsistent. Once the behavior/state-machine fix lands, the UI must stop implying a false boundary.

Scope:

- Align draft labels, action-bar visibility, send affordances, and success/warning messaging with the new real behavior.
- Distinguish full send success from partial delivery or post-send sync warnings where needed.

Not in scope:

- Redesigning the manager workspace layout from scratch

Key evidence:

- `app.js` -> manager dashboard/action-bar draft logic
- `app.js` -> diff computation
- `app.js` -> auto-saving edit flows

Acceptance criteria:

- The UI does not claim there are no unsent changes when the app still has meaningful unsent or partially synced work.
- Send messaging distinguishes full success from partial or warning states if the new behavior requires that distinction.

Coordination:

- Coordinate tightly with `refactor-issues/behavior.md`.

## Flag: `featured-confirmation-soft-dismissal`

Severity: High

Problem:

The featured-confirmation reminder can be cleared for the session by clicking "Update Featured" even if the user did not confirm anything or make any change.

Scope:

- Keep the reminder sticky until a real confirmation event or other clearly valid resolution occurs.

Not in scope:

- Rebuilding the featured editor UI unless needed to fix the reminder logic

Key evidence:

- `app.js` -> featured-confirmation reminder state and session key writes

Acceptance criteria:

- Users cannot dismiss the confirmation warning merely by opening an update flow and backing out.
- The reminder only clears on a meaningful confirming action.

## Flag: `manager-a11y-gaps`

Severity: Medium

Merged findings:

- `custom-picker-a11y-gap`
- `send-preview-modal-a11y`
- `item-reorder-keyboard-gap`

Problem:

Several high-traffic manager controls still assume mouse use or omit accessible dialog/focus behavior.

Scope:

- Improve accessibility in controls touched by the refactor, especially send-preview, custom pickers, and item/category reorder affordances.

Not in scope:

- Full design-system overhaul

Key evidence:

- `app.js` -> send-preview modal behavior
- `app.js` -> custom picker/autocomplete behavior
- `app.js` -> item reordering controls

Acceptance criteria:

- Dialog-like flows touched by this refactor expose correct focus and semantics.
- Touched picker/reorder controls have a keyboard-accessible path.

Coordination:

- Treat this as opportunistic unless the refactor already changes these controls.

## Support Flag: Menu URL Setting Clarity

Severity: Medium

Merged findings:

- `global-menu-url-context-drift`

Problem:

If notification link behavior changes to be menu-aware, the admin UI must not keep implying one global browser-local setting that silently applies everywhere.

Scope:

- Update labels/copy/feedback as needed to match the new behavior.

Acceptance criteria:

- The UI copy matches the actual menu-link behavior after the behavior refactor.
