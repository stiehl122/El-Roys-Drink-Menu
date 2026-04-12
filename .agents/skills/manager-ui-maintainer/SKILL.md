---
name: manager-ui-maintainer
description: Maintain the shared manager and admin UI in `app.js`, `manager/index.html`, `admin/index.html`, `style.css`, and `core/ui/*`. Use when work touches editing flows, categories, featured items, notifications, previews, admin switchers, or save/send behavior across the four fixed menus.
---

# Manager UI Maintainer

Use this skill when the user asks to change or debug the shared manager/admin
experience.

## Ownership

- root `app.js`
- `core/ui/manager/*` and `core/ui/admin/*`
- `manager/index.html`
- `admin/index.html`
- root `style.css`
- manager and admin panels, overlays, tabs, and preview flows

## Core Invariants

- `Save` persists silently
- `Send Update` persists, sends notifications, and updates the public timestamp
- unsent changes keep the draft indicator behavior
- 86'd items remain supported
- descriptions and optional pricing remain supported
- food-menu behavior stays distinct from drink-menu behavior where required
- admin-only controls remain admin-only
- accessibility behavior stays intact

## Workflow

1. Identify the affected workflow:
   - menu editing
   - categories
   - featured items
   - notifications
   - preview
   - admin switchers
   - user management
2. Read the relevant root `app.js` cluster before editing.
3. Confirm the related markup and styles support the intended behavior before
   changing JavaScript assumptions.
4. Prefer small helper extractions and targeted fixes over broad rewrites.
5. Reason through all four menus, not just the currently visible one.
6. Keep auth overlay concerns centralized in `core/auth/*`; do not add manager/admin-only auth markup or styling overrides.

## Useful Anchors

- `renderManagerItems()`
- `persistState()`
- `computeDiff()`
- `sendUpdate()`
- `loadAdminSwitcherData()`
- `renderFeaturedAdmin()`
- `renderManagerWorkspace()`
- `renderAdminWorkspace()`

## Output

Report:
- which workflow changed
- the files touched
- what behavior was preserved or fixed
- any click-through verification still needed
