# Per-Menu Featured Specials Design

Date: 2026-04-22
Scope: Replace the restaurant-wide featured/specials model with a menu-owned `Featured Specials` category on all four menus. This is a hard cutover that deletes the old featured and legacy specials code after migration.

## Goal

Rework featured and specials into one fixed per-menu system that is easier to edit, easier to reuse, and easier to reason about.

The new system should:

- give each menu its own dedicated `Featured Specials` category
- let staff add specials through the existing add-item modal
- let staff keep old specials in the editor for later reuse
- let staff control public featured visibility with a simple per-item checkbox
- render featured content from the current menu only, not from a restaurant-wide shared pool
- remove the legacy `special` category and the restaurant-wide featured-groups system entirely

## Approved Product Decisions

- `Featured Specials` exists by default on all four menus.
- It is a fixed system category, not an admin-toggle category.
- It appears in the staff editor as part of the category list.
- It does not appear as a normal category on public routes.
- Items are added to it through the same add-item modal used for other categories.
- Each item in `Featured Specials` has a checkbox that controls whether it appears in the public featured strip.
- Unchecked items stay stored in the category for later reuse.
- Checked items appear in the current featured strip for that same menu.
- If a menu has no enabled featured-special items, the public featured strip for that menu does not render.
- This is a hard cutover. Old code should be removed, not left in place behind compatibility branches.

## Non-Goals

- No new generalized restaurant/menu CRUD model
- No dependency additions, bundler changes, or build-step work
- No hybrid long-lived compatibility layer for old and new featured systems
- No public rendering of `Featured Specials` as a normal category
- No separate slot editor layered on top of the category
- No admin toggle for enabling or disabling the category per menu

## Architecture Decision

The new source of truth is the menu document itself.

Featured state stops being a restaurant-level structure and becomes item state inside a fixed menu-owned category. Public featured rendering is derived from the current menu's `Featured Specials` items, filtered by an item-level enabled flag and ordered by the category's item order.

This means one menu document owns:

- the `Featured Specials` category structure
- the reusable items stored in that category
- which of those items are currently live in the featured strip
- the order in which live featured items appear publicly

The old restaurant-wide featured-groups structure is deleted after migration.

## Product Model

Each of the four menus always includes a fixed category named `Featured Specials`.

This category behaves like a normal editor-owned category for item operations:

- add items
- edit items
- reorder items
- 86 and restore items
- leave old items in place for later reuse

It behaves like a system category for category operations:

- cannot be deleted
- cannot be renamed
- is not optional
- should appear in a predictable position in the staff editor

Recommended position:

- first category card in the staff editor
- first option in the add-item modal category list

That placement makes the specials workflow obvious without inventing a second management surface.

## Staff Editing Flow

### Category behavior

`Featured Specials` appears in the editor category list for managers and admins just like other category cards, but with fixed category governance.

Staff can:

- add items through the existing add-item modal
- edit item fields using existing item editing flows
- reorder items inside the category
- 86 and restore items
- remove items when they are truly no longer needed

Staff cannot:

- rename the category
- delete the category
- hide the category from the editor

### Item behavior

Every item in `Featured Specials` gets a new per-item boolean control, referred to in product copy as `Show in featured strip`.

Behavior:

- checked: item appears in the public featured strip for that menu
- unchecked: item stays stored for staff use but does not appear publicly anywhere

This enables the return-special workflow:

- old special stays in the category
- staff re-check it later
- optionally reorder it
- it becomes live again without recreating the item

### Order behavior

Featured strip order is derived from the item order within `Featured Specials`, filtered to checked items only.

No separate featured slot ordering UI exists after the cutover.

### 86 behavior

If an item in `Featured Specials` is checked and then 86'd, it should continue following the app's normal public 86 behavior rather than silently disappearing. The new system must preserve the existing rule that 86'd items remain visible publicly with the appropriate strike-through or badge treatment.

## Public Rendering

Public routes keep the existing featured-strip placement for each menu, but the data source changes completely.

Public rendering rules:

- derive featured items from the current menu's `Featured Specials` category only
- include only items with `Show in featured strip` enabled
- preserve the category item order when rendering the strip
- do not render `Featured Specials` in the normal public category list
- do not render the featured strip at all when there are no enabled items

This keeps the public UI simple:

- the current featured area still exists
- it is now menu-owned
- it is fed by one hidden editor category instead of a separate restaurant-wide system

## Data Model

### Category structure

Each menu document includes a real saved category for `Featured Specials`.

Recommended category key:

- `featured_specials`

Recommended structural behavior:

- persisted in the same category array as other menu categories
- treated as a fixed system category by category-management code
- excluded from normal public category rendering

### Item structure

Each item inside `Featured Specials` needs a persisted boolean field for whether it should appear in the featured strip.

Recommended field name:

- `featured_enabled`

Behavioral meaning:

- `true`: eligible for public featured rendering
- `false`: preserved only in staff editing flows

This flag is meaningful only for items in `Featured Specials`. The implementation may choose to tolerate the field elsewhere for decoding simplicity, but product behavior should only use it for this system category.

### Derived featured state

After the cutover, public featured content is not stored as a separate top-level featured structure.

Instead it is derived from:

1. the current menu document
2. the `Featured Specials` category
3. items where `featured_enabled` is `true`
4. the current item order in that category

The old top-level restaurant-wide featured-groups payload should be removed from active runtime contracts after migration.

## Save And Send Behavior

This redesign changes the data model for featured content, but it must not change the product meaning of the action buttons.

Required behavior:

- `Save` still quietly persists the current draft/live editing state without sending notifications
- `Send Update` still persists, sends notifications, and advances public timestamp/history
- draft indicators still reflect unsent changes since the last send

Changes to `Featured Specials` items, `featured_enabled` state, and category ordering must flow through the existing save/send model just like other menu edits.

## Hard Cutover And Deletion Scope

This work is explicitly a one-step replacement.

The implementation should:

- migrate old data into the new per-menu `Featured Specials` model
- switch all web editor behavior to the new model
- switch all public route rendering to the new model
- switch iOS decoding/editing/public reading to the new model as needed for parity
- delete the old restaurant-wide featured code
- delete the legacy `special` category code
- delete tests and helpers that exist only to support the retired model

The target state after the cutover is:

- one specials system in product behavior
- one specials system in saved menu data
- one public featured-rendering path
- no duplicate legacy branches left behind

## Migration Strategy

Migration should run as part of the hard cutover and should prioritize preservation over perfect formatting.

### Step 1: Ensure fixed category presence

For each of the four menus:

- ensure a `Featured Specials` category exists
- create it if missing
- place it in the system-defined position

### Step 2: Fold legacy menu-local specials into the new category

If a menu still has content in the deprecated legacy `special` category:

- move those items into `Featured Specials`
- preserve as much item data as possible
- prefer preserving existing item identity when practical
- avoid creating duplicate items when the same item already exists in `Featured Specials`

### Step 3: Fold restaurant-wide featured data into menu-owned items

For old restaurant-wide featured entries:

- map each entry to the referenced menu
- locate or create the corresponding item in that menu's `Featured Specials` category
- set `featured_enabled` to `true`

If an old featured entry references an item that already exists in the target menu's `Featured Specials` category, enable that existing item instead of cloning it.

### Step 4: Preserve uncertain records safely

If an old featured or specials record cannot be mapped with full confidence:

- preserve it inside the target menu's `Featured Specials` category
- default it to `featured_enabled: false`
- do not silently drop it

### Step 5: Remove old code paths

After migration support is in place, remove the retired runtime paths in the same change rather than keeping dormant compatibility code.

## Error Handling And Safeguards

- Migration must be idempotent so reruns do not duplicate items.
- Failed or partial mappings must favor preservation inside `Featured Specials` over data loss.
- Public rendering must fail closed: if no enabled items are available, render no featured strip rather than a broken shell.
- Category-management logic must treat `Featured Specials` as protected system structure.
- Add-item and item-edit flows must continue to work even if older payloads are missing the new boolean field; missing values should normalize to disabled unless migration explicitly enables them.

## iOS And Parity Expectations

This is a real product capability change, not web-only presentation work.

The same change should update shared capability expectations so web and iOS do not silently drift.

Required parity updates:

- `docs/FEATURES.md` should reflect that featured specials become menu-owned rather than restaurant-owned
- iOS menu document decoding should tolerate the new fixed category and item flag
- iOS public reading should derive featured content from the new per-menu model
- iOS editor behavior should not continue assuming restaurant-wide featured groups as the primary source of truth

Any deferred iOS surface polish must not leave shared payloads or public-read behavior drifting from this contract during the cutover.

## Testing Strategy

Testing should validate the new product behavior and the deletion of the retired model.

### Web data and runtime tests

- menu normalization adds `Featured Specials` to all menus
- `Featured Specials` is treated as a protected system category
- missing `featured_enabled` values normalize safely
- migration from legacy `special` content is idempotent
- migration from restaurant-wide featured data is idempotent
- rerunning migration does not duplicate items

### Web editor tests

- add-item modal includes `Featured Specials`
- items in `Featured Specials` expose the `Show in featured strip` control
- checking and unchecking the control updates derived featured output correctly
- reorder in `Featured Specials` changes public featured order
- unchecked items remain editable and preserved for later reuse
- `Featured Specials` cannot be renamed or deleted

### Public rendering tests

- `Featured Specials` is omitted from normal public category rendering
- only enabled items from the current menu render in the featured strip
- no featured strip renders when the category has no enabled items
- enabled 86'd specials still render with normal public 86 treatment
- one menu's enabled specials do not leak into another menu's public route

### Regression tests

- `Save` remains a quiet persistence action
- `Send Update` remains the only action that updates notification/timestamp/history behavior
- route-first boot still holds for public pages after the new featured data path is introduced
- footer staff actions and shared footer metadata remain intact

### iOS tests

- menu document decoding tolerates the new category and item flag
- visible public featured output derives from the current menu only
- hidden reusable specials remain staff-only when not enabled

## Implementation Boundaries

Primary ownership areas:

- `area:domain-model`
- `area:data-session`
- `area:manager-ui`
- `area:routing-public`
- `area:tests-boundaries`

Likely touched surfaces:

- `app.js`
- `core/domain/category-defaults.js`
- shared menu snapshot and normalization paths
- manager category/item rendering flows
- public featured rendering flows
- iOS menu document models and related tests
- `docs/FEATURES.md`

The change should prefer removing obsolete code rather than layering new branches around the retired model.

## Acceptance Criteria

- Every menu has a fixed `Featured Specials` category in staff editing flows.
- Staff add specials through the standard add-item modal.
- Each item in `Featured Specials` can be independently enabled or disabled for the public featured strip.
- Unchecked items stay stored for reuse and do not appear publicly.
- Checked items appear only on the current menu's featured strip.
- `Featured Specials` never appears as a normal public category.
- No public featured strip renders when a menu has no enabled featured-special items.
- The old restaurant-wide featured system is removed.
- The old legacy `special` category path is removed.
- Save/send behavior remains unchanged.
- Parity documentation is updated with the new product model.
