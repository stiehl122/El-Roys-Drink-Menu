# Manager Cockpit Rewrite Design

Date: 2026-04-29
Status: Ready for user review
Owner: Codex

## Goal

Replace the live `/manager` workspace with a cockpit-first manager screen based on the local `prototypes/manager-cockpit/` direction. This is a direct replacement, not a preview flag or alternate route. The rewrite should make the manager screen feel like one focused editing workspace while preserving existing auth, menu access, draft, save, send, publish, and public menu contracts.

This is a manager UI rewrite, not a persistence or product model rewrite. The app remains a zero-dependency, plain HTML/CSS/JavaScript app for Leroy's Lounge and El Roy's Cantina, with exactly the existing fixed restaurant/menu shape.

## Decisions

- `/manager` becomes the cockpit-first screen directly after implementation and verification.
- The old primary `Pricing` and `Description/Recipe` sections leave primary navigation.
- Item detail editing moves into a unified Edit Item modal.
- The cockpit item table has no inline name editing. Clicking the item name opens the Edit Item modal.
- Web manager removes swipe-to-86. Swipe remains an iOS-only interaction.
- The cockpit table removes the Delete column.
- Manager-facing removal lives inside the Edit Item modal and means remove/archive from the active menu, not permanent database deletion.
- Permanent database deletion remains admin-only through database prune tooling.
- Quick Notes becomes a real per-menu persisted feature.
- Recent Sends becomes Recent Activity and includes quiet saves plus sends/publishes.
- The existing Save review flow remains. Save in the dock opens review; review owns save-only versus send/update.
- The revision dock collapses/gets out of the way when idle and expands when there are draft changes, sync messages, or reviewable work.

## Architecture

The live manager rendering should move out of large ad hoc `app.js` render functions and into focused manager UI modules under `core/ui/manager/`. `app.js` remains the route/session orchestrator during this rewrite. It continues to own page boot, auth/session decisions, menu state hydration, draft state, publish/session services, and compatibility for existing global callbacks.

The new manager UI layer owns the cockpit shell and presentation:

- `core/ui/manager/cockpit.js`: top-level cockpit render and refresh controller.
- `core/ui/manager/items-table.js`: category-grouped item table rendering and row actions.
- `core/ui/manager/item-editor-modal.js`: unified item editor modal.
- `core/ui/manager/notes.js`: Quick Notes UI and per-menu note binding.
- `core/ui/manager/activity.js`: Recent Activity presentation.
- `core/ui/manager/revision-dock.js`: adaptive revision dock presentation and idle behavior.

Existing files such as `core/ui/manager/workspace.js`, `sections.js`, and `editors.js` will become compatibility adapters during the transition, then be retired or reduced once live callers move to the new modules.

The UI modules should communicate with app state through explicit dependency ports. They can call existing functions for menu mutations, draft invalidation, save review, category data, and auth/capability checks, but they must not learn Supabase details or publish semantics directly.

## Manager Experience

The first `/manager` screen is the cockpit:

- Header: `Manager Workspace`, active menu name, and compact status indicators.
- Left rail: slimmer index/menu context; on mobile it becomes a left drawer.
- Work bar: Add Item, Bulk Actions, Search, and Filter.
- Main editor: category-grouped item table.
- Right side: Featured Preview, Recent Activity, Quick Notes, and Menu Snapshot.
- Lower area: Database/search for managers and admins, with prune controls shown only to admins.
- Bottom: adaptive Revision Dock.

Primary navigation should be focused around the cockpit model:

- Overview
- Edit Items
- Featured
- Activity
- Database

The item table is a scan-and-action surface:

```text
Order | Item Name | Status | Edit | 86
```

Clicking the item name or Edit opens the same Edit Item modal. Rows support visible reorder/drag controls for category ordering. The table does not include inline text fields, a Delete column, or swipe gestures.

## Edit Item Modal

The Edit Item modal becomes the central item editing surface. It supports:

- Item name
- Category
- Public/menu status
- 86 status
- Price
- Upcharges/modifiers
- Description
- Recipe controls for drink menus only
- Description and recipe visibility controls where applicable
- Featured strip controls for Featured Specials/category-owned featured flow
- Remove from menu/archive action with confirmation

The modal should be batch/apply based:

- Opening the modal copies the item into modal-local form state.
- `Done` validates and applies changed fields to `menuState`.
- `Cancel` discards modal-local changes.
- Applying changes invalidates diffs, records the appropriate draft state, refreshes affected cockpit panels, and leaves persistence to the existing Save review flow.

Food menus must hide recipe controls and use food defaults. Featured Specials must preserve the category-owned featured flow.

## Quick Notes Persistence

Quick Notes becomes a real per-menu persisted feature. The schema is a dedicated table:

```text
menu_manager_notes
- menu_id uuid primary key references menus(id)
- note text not null default ''
- updated_at timestamptz not null default now()
- updated_by uuid nullable
```

The implementation plan should include a Supabase migration and API/read-write plumbing. Notes are scoped by menu and must respect the same manager/admin access checks as the manager workspace.

Notes save failures must not discard typed text. The UI should keep text locally, show an inline warning, and allow retry.

## Recent Activity

The existing Recent Sends concept becomes Recent Activity. It should include:

- Quiet saves.
- Sends/publishes.
- Actor.
- Time.
- Action type.
- Channel or source.

The panel should degrade gracefully if activity data fails to load. It must not block editing.

## Revision Dock

The dock preserves the current save/review behavior:

- Save opens the existing review flow.
- The review modal handles save-only versus send/update.
- Existing conflict, warning, partial-send, and cloud-sync behavior remains authoritative.

The dock presentation changes:

- Idle state collapses or shrinks so it does not fight normal scrolling.
- Dirty, syncing, warning, or reviewable states expand the dock.
- The transition should be animated but restrained.
- The dock must remain keyboard reachable and screen-reader understandable.

## Access And Error Handling

Current access rules remain unchanged:

- Managers only see menus they can manage.
- Admins have global access.
- Unauthorized manager access still lands in the existing denied/locked flow.

Error handling by surface:

- Menu load/workspace error: cockpit-level error with retry and return-to-menu options.
- Quick Notes save error: inline warning, preserve typed text, allow retry.
- Item modal validation: field-level messages and no apply until valid.
- Save/review errors: preserve existing review/save/send warnings and conflict behavior.
- Recent Activity errors: show empty/error panel without blocking editing.
- Database/prune errors: preserve current admin-only confirmations and safety.

The mobile drawer must preserve accessibility: `aria-expanded`, backdrop close, Escape close, focus return, and no background page scroll while the drawer is open.

## Data Flow

The cockpit uses existing manager state as source of truth:

- `CATEGORY_DEFS`
- `menuState`
- `MENU_ID`
- `MENU_TYPE`
- `RESTAURANT_ID`
- current user
- draft ledger
- session/publish services

UI edits mutate the same in-memory menu state used today, then call existing invalidation and draft-update paths. Persistence remains through the existing Save review flow unless the feature is specifically Quick Notes, which has its own per-menu persistence path.

## Testing

Automated tests should cover:

- Manager shell boots for an authorized manager and admin.
- Manager access denial still works for unauthorized menus.
- Cockpit table renders category groups and rows from `menuState`.
- Clicking item name and Edit both open the Edit Item modal.
- Modal Done updates name, category, price, upcharges, description, recipe, status, visibility, and draft state.
- Modal Cancel does not mutate `menuState`.
- Remove from menu archives/off-menus the item and does not permanently delete it.
- 86 toggles from the visible button and updates draft state.
- Web swipe behavior is absent.
- Save dock still opens the existing review flow.
- Revision dock collapses when idle and expands when dirty/syncing.
- Quick Notes read/write through the new API and migration.
- Recent Activity includes quiet saves and sends.
- Food menus hide recipe controls.
- Featured Specials/category-owned featured flow still works.
- Mobile rail opens as a left drawer and closes accessibly.
- Public menu contracts remain unchanged, including 86'd public display and footer/version behavior.

Verification should include:

- `node --check app.js`
- relevant manager UI tests
- API/migration tests for notes
- auth/access boundary tests
- browser verification on desktop and mobile widths
- save-only versus send/update behavior checks

## Rollout

This ships as a direct `/manager` replacement after implementation and verification. There is no cockpit preview flag and no role-gated rollout. The local prototype can remain as a visual reference during implementation, but the production destination is the real `/manager` route.

## Non-Goals

- Do not generalize the product into arbitrary restaurant/menu CRUD.
- Do not rewrite auth, publish, save/send, polling, or public menu rendering.
- Do not change public menu contracts.
- Do not make swipe gestures part of web manager.
- Do not allow managers to permanently delete database records.
- Do not add dependencies, a bundler, or a build step.
