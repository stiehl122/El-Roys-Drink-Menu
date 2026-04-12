---
name: stitch
description: >
  Rebuild a restaurant's public route directly from a Stitch project. Treat the
  imported Stitch screen as design gospel, generate complete route-owned files
  (`index.html`, `style.css`, route `app.js`, and `DESIGN.md`), download
  required assets into stable repo paths, and fully replace deprecated
  Stitch-source artifacts on each run. Expected inputs: restaurant name, Stitch
  project ID, and optional screen ID.
---

# Stitch

Use this skill when the user mentions `/stitch`, asks to import or refresh a
Stitch design, or wants a restaurant route rebuilt from Stitch.

## Core rule

Stitch owns the design.

Treat the imported Stitch project as immutable visual source material. Your job
is to make that design functional for this app, not to reinterpret, modernize,
or "improve" it.

Required posture:
- preserve Stitch markup structure, typography, spacing, assets, and visual hierarchy as closely as possible
- generate complete route-owned implementation files, not fragments or mock exports
- only introduce new UI when the app needs a control that Stitch does not provide
- ask the user before adding a missing control pattern that is not already directed

## Expected inputs

- `restaurant_name`
- `stitch_project_id`
- optional `screen_id`
- optional trailing implementation notes from the user

Interpret `/stitch Leroy's Lounge 4044680601076201931` as valid input. If the
user appends extra instructions after the required values, treat them as
implementation constraints that must not override Stitch as the design source.

## Valid targets

Only these restaurants are valid:
- `Leroy's Lounge`
- `El Roy's Cantina`

Route and asset targets:
- Leroy's Lounge
  - `leroyslounge/index.html`
  - `leroyslounge/style.css`
  - `leroyslounge/app.js`
  - `leroyslounge/DESIGN.md`
  - `/assets/leroys-lounge/`
- El Roy's Cantina
  - `elroyscantina/index.html`
  - `elroyscantina/style.css`
  - `elroyscantina/app.js`
  - `elroyscantina/DESIGN.md`
  - `/assets/el-roys-cantina/`

## Output contract

Every successful `/stitch` run must produce or refresh all of the following for
the target route:
- full route `index.html`
- route-specific `style.css`
- route-specific `app.js`
- route-local `DESIGN.md`

Every successful `/stitch` run must also:
- delete the route's deprecated `stitch-source/` folder if it exists
- download required Stitch images and other design assets into stable repo asset paths
- rewrite generated file references to use those local asset paths
- report the restaurant, project, screen, files updated, assets downloaded, and any design compromises

Do not preserve old Stitch artifacts between runs. Rebuild fresh each time.

## Workflow

1. Parse the request.

Extract:
- restaurant name
- numeric Stitch project ID
- optional screen ID
- optional trailing instructions

If the restaurant name is ambiguous or the project ID is missing, ask a concise
follow-up. If multiple screens exist and the user did not specify one, ask which
screen to use.

2. Verify the restaurant before touching files.

Verification rules:
- accept only `Leroy's Lounge` or `El Roy's Cantina`
- map the restaurant to its route folder and stable asset directory before editing
- if the restaurant is invalid, stop and report that clearly

Do not modify files until the target restaurant is verified.

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
- the full HTML structure
- embedded or linked CSS relevant to the design
- font imports that are required for fidelity
- image and asset references

Transformation rules:
- remove `<script>` tags and their contents
- keep semantic HTML structure whenever possible
- move inline `<style>` blocks into the route `style.css`
- keep Stitch class names and structure unless a change is required for app binding

5. Clean the old implementation before rebuilding.

Before writing new route outputs:
- remove `{route}/stitch-source/` if it exists
- remove or replace old generated Stitch artifacts tied to the prior import
- treat the new run as a full rebuild, not an incremental patch-up

Do not keep the raw export as a route-local artifact folder. The implementation
and `DESIGN.md` are the durable record.

6. Download and localize required assets.

Asset rules:
- extract all remote asset URLs used by the selected Stitch HTML and CSS
- download required images, textures, logos, and other design assets into the route's stable asset directory
- update generated HTML and CSS to reference local asset paths
- required design assets are part of the implementation, not optional polish

If the design depends on a remote asset and it is necessary for visual fidelity,
download it before finishing. Do not leave critical assets as fragile remote
references when stable local storage is possible.

7. Generate complete route-owned files.

### `index.html`

Generate the full route page, not a partial fragment.

Requirements:
- preserve the Stitch markup structure as closely as possible
- remove imported scripts
- link the shared `/style.css`
- link the route `style.css`
- link `/core/auth/auth-overlay-unified.css`
- link `/routes/shared/public-route-core.js` before the route `app.js` script
- link the route `app.js`
- include shared auth module scripts used by entry shells (`/core/auth/auth-api.js`, `/core/auth/auth-session-service.js`, `/core/auth/auth-overlay-template.js`, `/core/auth/auth-overlay-controller.js`)
- include the site picker at the top, hidden by default
- include only the shared app shell elements that are still required for auth, modals, toasts, or manager handoff
- add semantic hooks only where needed for runtime binding, such as:
  - `data-category`
  - `data-item-id`
  - `.menu-category`
  - `.menu-item`
  - `.menu-item-name`
  - `.menu-item-price`
  - `.menu-item-desc`
  - `.menu-item-86d`

Do not replace Stitch structure with a generic accordion layout unless the route
explicitly cannot support the design and the user approves that fallback.

### `style.css`

Generate route-owned CSS that contains:
- Stitch visual styles
- required font imports for fidelity
- localized asset references
- app-specific styles needed for runtime behavior without changing the design language

Allowed app-specific additions:
- semantic binding selectors for menu rendering
- fallback 86'd styling when Stitch does not define an unavailable state
- sign-in entry point styling
- manager or admin indicator styling
- hidden or conditional state rules needed for menu switching and auth visibility

Project rule:
- use CSS custom properties for any new colors introduced during integration
- do not leak route-specific styles into the shared root `/style.css`

### `app.js`

Generate route-specific adapter logic that registers the route with
`/routes/shared/public-route-core.js` without duplicating shared application behavior.

The route script must call `createPublicRouteCore(...)` through
`window.__HF_ROUTE_MODULES__` and provide adapter hooks for:
- route selectors and template IDs
- category and featured markup builders
- route-specific swap dropdown behavior

Responsibilities:
- bind live menu categories and items into the Stitch structure
- populate names, prices, descriptions, featured content, and timestamps
- preserve or implement 86'd treatment
- show or hide route elements based on menu type when drinks and food differ
- show or hide auth, manager, and admin entry points using shared root app state
- handle menu switching when the route represents multiple menus
- call back into shared `/app.js` functions for auth, persistence, notifications, and manager/admin flows instead of reimplementing them

Do not duplicate shared application logic inside the route script.

### `DESIGN.md`

Create a route-local `DESIGN.md` documenting the import.

It must include:
- title: `{Restaurant} Menu Design`
- Stitch source project ID
- Stitch source screen ID
- import date
- list of downloaded assets and where they were stored
- design notes describing any visual compromises or functional adjustments
- note whether fallback 86'd treatment is in use

Example structure:

```md
# Leroy's Lounge Menu Design

**Imported from Stitch:** Project 4044680601076201931, Screen abc123, 2026-04-02

## Assets
- logo.png -> /assets/leroys-lounge/logo.png
- texture.png -> /assets/leroys-lounge/texture.png

## Design Notes
- Stitch layout preserved exactly
- 86'd items use Stitch strike-through with app-added badge
- Menu switching uses a discrete control added outside the main content hierarchy

## Last Updated
2026-04-02
```

8. Fit app functionality into the design.

Required functionality to preserve:
- live categories and items
- featured items or specials
- optional prices
- optional descriptions
- 86'd state
- last-updated timestamp
- sign-in entry point
- manager and admin hooks
- menu switching when applicable

86'd rule:
- if Stitch already shows a specific unavailable treatment, preserve that treatment as closely as possible
- if Stitch does not show one, keep the item visible and apply the canonical fallback: strike-through plus `86'D` badge

Missing-control rule:
- if a required capability needs a control that Stitch does not include, ask the user before adding it
- only skip that question when the user already directed the control pattern
- do not inline auth overlay markup into route HTML; auth overlay source must remain centralized in `core/auth/auth-overlay-template.js`

9. Repository rules.

- no dependencies
- no build step
- no package manager changes
- no route-specific design CSS in root `/style.css`
- no writing to `designs/`
- no revived `stitch-source/` folder
- no saving partial design fragments as the primary output

The route files are the product:
- `index.html`
- `style.css`
- `app.js`
- `DESIGN.md`

10. Final reporting.

At the end of the run, report:
- verified restaurant name and fixed restaurant ID when available
- Stitch project ID
- Stitch screen ID
- route files updated
- whether `stitch-source/` was deleted
- assets downloaded, including source URL and local path
- any design compromises or added controls

If required functionality could not fit the Stitch design cleanly, say exactly
where and why.
