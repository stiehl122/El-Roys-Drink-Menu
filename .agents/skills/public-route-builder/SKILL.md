---
name: public-route-builder
description: Build or repair the route-owned public pages for Leroy's Lounge or El Roy's Cantina while preserving Stitch fidelity and live menu behavior. Use when work touches `leroyslounge/`, `elroyscantina/`, shared custom-design rendering, footer/version output, or route fallback behavior.
---

# Public Route Builder

Use this skill when the user asks to rebuild, refine, debug, or review the
public restaurant routes.

## Ownership

- `leroyslounge/index.html`
- `leroyslounge/style.css`
- `leroyslounge/app.js`
- `leroyslounge/DESIGN.md`
- `elroyscantina/index.html`
- `elroyscantina/style.css`
- `elroyscantina/app.js`
- `elroyscantina/DESIGN.md`
- route assets used by those pages
- shared public handoff points in root `app.js` such as `renderPublicView()`
  and `_renderCustomDesignView()`

## Goals

- preserve the route-owned design
- keep live menu rendering working
- preserve featured content, last-updated output, footer version output, and
  preview badge behavior
- preserve fallback behavior when a route implementation is unavailable

## Workflow

1. Read the target route's `index.html`, `style.css`, `app.js`, and
   `DESIGN.md`.
2. If the issue touches integration, read the related shared public-render code
   in root `app.js`.
3. Identify the runtime contract the route depends on:
   - categories and items
   - featured groups
   - last-updated labels
   - footer version and preview state
   - auth or manager-entry affordances (footer staff actions first)
4. Make the smallest route-owned changes that restore both design fidelity and
   live behavior.
5. Sanity-check mobile and desktop assumptions.

## Do Not Break

- Stitch-driven design fidelity
- `renderPublicView()` route selection
- `_renderCustomDesignView()` handoff behavior
- footer `APP_VERSION` output
- `PREVIEW` badge behavior on preview deployments
- last-updated output
- footer staff sign-in/manager/admin/sign-out controls
- shared auth overlay script/style includes in route shells
- route fallback behavior

## Output

Report:
- which route or shared public files changed
- what live behavior was preserved or restored
- any browser verification that still needs to happen manually
