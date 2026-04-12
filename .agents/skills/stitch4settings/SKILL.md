---
name: stitch4settings
description: >
  Import or refresh a Google Stitch design for the shared `/manager` or `/admin`
  settings routes. Treat Stitch as the visual source of truth for the selected
  settings page, rebuild the route shell in `manager/index.html` or
  `admin/index.html`, and integrate it into the shared `app.js` and `style.css`
  runtime without breaking auth, role gating, or save-vs-send behavior.
---

# Stitch4Settings

Use this skill when the user wants Google Stitch to generate or refresh the
manager or admin settings experience, or when they explicitly mention
`Stitch4Settings`.

## Core rule

Stitch owns the shell design.

Treat the imported Stitch screen as the visual source material for the selected
settings route. Preserve its layout, spacing, hierarchy, and general tone as
closely as possible while wiring it into the existing app behavior.

Required posture:
- preserve Stitch structure unless a runtime hook requires a small change
- keep shared app behavior in root `app.js`; do not fork manager/admin logic into route-local scripts
- keep settings-route auth, role gating, save-vs-send, notifications, featured management, and menu switching intact
- only add controls Stitch omitted when the app truly requires them

## Expected inputs

- `target`
  - valid values: `manager`, `admin`
- `stitch_project_id`
- optional `screen_id`
- optional trailing implementation notes from the user

Interpret examples like these as valid:
- `Use Stitch4Settings for manager 4044680601076201931`
- `Refresh admin from Stitch project 4044680601076201931 screen abc123`

If the target route is missing or ambiguous, ask a concise follow-up.

## Valid targets

Only these routes are valid:
- `manager`
  - `manager/index.html`
- `admin`
  - `admin/index.html`

Supporting shared files:
- `app.js`
- `style.css`

Do not use this skill for:
- `leroyslounge/`
- `elroyscantina/`
- route-owned public menu imports

Use the separate `stitch` skill for those public restaurant pages.

## Required behaviors to preserve

### Manager

The manager route must continue to support:
- active menu context and menu switching
- `Save`
- `Send Update`
- unsent-diff preview modal for `Send Update`
- featured confirmation banner
- featured manager controls
- editable categories and items
- `Recent Changes` for the last 7 days of sent updates
- database search/filter/prune tools
- off-menu items tray
- shared auth overlay module wiring and back-to-menu exit

### Admin

The admin route must continue to support:
- restaurants overview
- notifications configuration
- credential key inputs
- menu URL save
- users list and invite flow
- featured groups management
- shared auth overlay module wiring and back-to-menu exit

The admin route must not regress into a manager editor and must not reintroduce
the removed History tab unless the user explicitly asks for it.

## Output contract

Every successful run must update the selected settings route and any shared
files needed to integrate it:
- `manager/index.html` or `admin/index.html`
- `style.css` when new shared settings-shell styles are needed
- `app.js` when DOM hooks, section targeting, or route-specific guards need adjustment

Do not add dependencies, a build step, or generated framework output.

## Workflow

1. Parse the request.

Extract:
- target route
- numeric Stitch project ID
- optional screen ID
- optional trailing instructions

2. Verify the target route before editing.

Accept only:
- `manager`
- `admin`

If the target is invalid, stop and say so clearly.

3. Read the Stitch project with Stitch MCP tools.

Use this sequence:
- `mcp__stitch__get_project`
- `mcp__stitch__list_screens`
- `mcp__stitch__get_screen`

Selection rules:
- if `screen_id` was provided, confirm it exists and use it
- if exactly one screen exists, use it
- if multiple screens exist and none was specified, ask the user which screen to use

4. Extract the design source.

From the selected Stitch screen, extract:
- shell structure
- visual grouping and layout hierarchy
- button placement and section rhythm
- any embedded CSS or asset references needed for fidelity

Transformation rules:
- remove imported scripts
- keep semantic structure whenever practical
- move inline style into `style.css`
- preserve Stitch class names only when they help; otherwise translate into the existing settings-shell conventions

5. Map the design to the app's required controls.

Before editing, lock the required controls for the chosen route.

### Required manager controls

Ensure the final shell has visible homes for:
- `Overview`
- `Edit Menu`
- `Recent Changes`
- `Categories`
- `Database`
- `Switch Menu`
- `Keep Today's Featured`
- `Update Featured`
- `Save`
- `Send Update`

Required manager hooks that should remain usable:
- `#manager-panel`
- `#manager-categories`
- `#featured-mgr-wrap`
- `#recent-changes-wrap`
- `#catmgr-list`
- `#db-table-wrap`
- `#off-menu-items-wrap`
- `#featured-confirm-banner`
- `#switch-menu-btn`
- `#save-btn`
- `#send-btn`

### Required admin controls

Ensure the final shell has visible homes for:
- `Overview`
- `Restaurants`
- `Notifications`
- `Users`
- `Featured`
- `Refresh`
- `Save Notifications`
- `Save Credential Keys`
- `Save`
- `Invite Staff`
- `Add Group`

Required admin hooks that should remain usable:
- `#admin-panel`
- `#menus-mgmt-list`
- `#notif-restaurant-select`
- `#notif-menu-select`
- `#users-list`
- `#featured-admin-wrap`
- `#new-featured-group-name`

If Stitch does not include enough structure for a required control, add the
minimum missing UI in the same design language.

6. Rebuild the selected route shell.

### `manager/index.html`

Requirements:
- manager-only shell; no admin-only sections
- include shared auth module/style includes (do not inline auth overlay markup) and send-preview modal
- keep public/menu-view handoff elements required by shared runtime
- prefer section-based or rail-based workspace navigation over generic tab markup

### `admin/index.html`

Requirements:
- admin-only shell; no manager-editing sections
- include shared auth module/style includes (do not inline auth overlay markup) and invite modal
- keep public/menu-view handoff elements required by shared runtime
- preserve restaurants, notifications, users, and featured sections only

7. Integrate into shared runtime.

Update `app.js` only as needed to support the new Stitch shell:
- route-aware DOM queries
- section focus helpers
- missing-element guards
- event wiring that depends on moved controls

Do not change business behavior unless the user asked for it.

8. Integrate into shared styles.

Update `style.css` only as needed to support the imported shell:
- use CSS custom properties for any new colors
- keep changes scoped to settings-route UI
- avoid leaking route-specific public-menu styling into the settings shell

9. Validate before finishing.

At minimum:
- `node --check app.js`
- `git diff --check`

If practical, also sanity-check that the selected route still has the controls
and IDs the shared runtime expects.

## Implementation rules

- no dependencies
- no build tools
- preserve Supabase auth and role flows
- preserve save vs send behavior exactly
- `Recent Changes` stays distinct from the unsent `Send Update` preview
- preserve accessibility attributes and keyboard behavior when moving controls
- keep the two-restaurant, four-menu model intact

## Reporting

At the end, report:
- target route
- Stitch project ID
- Stitch screen ID used
- files updated
- any required DOM hook adjustments
- any visual compromises made to preserve app behavior
