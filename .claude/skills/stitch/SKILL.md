---
name: stitch
description: >
  Treat Stitch as the source of truth for a restaurant's public design. Verify
  the target restaurant, download the Stitch screen, and fit the app's live
  menu/auth/manager functionality into the Stitch design with minimal visual
  deviation. Update the restaurant route page directly instead of generating a
  separate design artifact folder. Expected inputs:
  restaurant name, Stitch project ID, and optional screen ID.
---

# Stitch

Use this skill when the user mentions `/stitch`, asks to import a Stitch design,
or wants a restaurant public page rebuilt from Stitch.

## Core rule

Stitch owns the design.

Your job is not to reinterpret, improve, or "clean up" the UI. Your job is to:
- preserve the Stitch layout, typography, logo, spacing, colors, and overall visual hierarchy as closely as possible
- build the full route-owned menu page HTML around that design, including the app's live functionality hooks and runtime bindings
- ask for help only when required functionality genuinely cannot fit the Stitch design cleanly

Do not fall back to the old assumption that the app provides a shared design shell
and Stitch only provides a fragment. The default assumption is now:
- the entire public restaurant page comes from Stitch
- Codex adapts functionality to the Stitch page

## Expected inputs

- `restaurant_name`
- `stitch_project_id`
- optional `screen_id`
- optional `special_arguments`

Interpret the request flexibly. If the user writes `/stitch El Roy's Cantina 4044680601076201931`, treat that as input. If the user includes extra instructions after the required values, treat the trailing text as `special_arguments` that describe behavior or implementation requirements not obvious from the static Stitch HTML. If required values are missing or the restaurant is ambiguous, ask a concise follow-up.

## Workflow

1. Parse the request.
Identify the numeric Stitch project ID, optional screen ID, and optional trailing `special_arguments`. Treat the restaurant-name portion as the restaurant name, and treat any remaining trailing instruction text as behavior guidance that should shape the implementation without overriding Stitch as the design source of truth.

2. Verify the restaurant before touching files.
Use live app config when available:
- Prefer the deployed app's `/api/config` response or existing environment values for `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- In v0.8.x, only `Leroy's Lounge` and `El Roy's Cantina` are valid targets.
- Query `restaurants` by name.
- If there is no match, report that clearly.
- If there are multiple plausible matches, stop and ask the user which one to use.

3. Download the Stitch project with the Stitch MCP tools.
Use this sequence:
- `mcp__stitch__get_project`
- `mcp__stitch__list_screens`
- `mcp__stitch__get_screen`

Selection rules:
- If `screen_id` was provided, confirm it exists in the project.
- If no `screen_id` was provided and there is exactly one screen, use it.
- If multiple screens exist and the user did not specify one, ask which screen to use.

4. Fit app functionality to the Stitch design.

Default implementation rule:
- Preserve the Stitch structure first.
- Stitch owns the design; the route implementation owns the full menu page HTML, semantic hooks, and dynamic bindings needed for the app to work.

That means:
- use Stitch fonts, logos, textures, and other visual assets whenever available
- download and store required remote Stitch assets in stable repo asset paths when the route depends on them; do not leave critical design assets as fragile remote references
- keep the Stitch section hierarchy and spacing
- keep the Stitch item presentation unless functionality forces a change
- inspect the Stitch screen for explicit item-state treatments, including unavailable or 86'd items, and preserve those treatments when present
- avoid introducing an app-authored hero, card system, or layout language when Stitch already defines one

Required functionality to fit into the design as needed:
- live menu sections and items
- featured items / specials
- prices
- descriptions
- 86'd state
- last updated timestamp
- sign-in entry point
- manager/admin entry points when applicable
- menu switching when applicable

Missing-control rule:
- if required functionality depends on a button or other explicit control that is not present in the Stitch design, do not invent or place that control unilaterally
- ask the user how they want that functionality introduced before proceeding with the visual implementation
- only add the missing control without asking when the user has already given clear prior direction for that exact control pattern

86'd state rule:
- If the Stitch design shows an explicit visual treatment for an unavailable, sold-out, disabled, hidden, or 86'd item state, preserve that exact treatment as closely as possible.
- If the Stitch design does not show that state, use the app's canonical fallback treatment: keep the item visible publicly with strike-through and an `86'D` badge.
- Do not remove 86'd items from the public menu unless the Stitch design explicitly requires a presentation that still clearly communicates the unavailable state.

If the request is for a dedicated restaurant route:
- treat the Stitch screen as the full public page template
- prefer updating the route entry page such as `leroyslounge/index.html` or `elroyscantina/index.html`
- preserve the Stitch page visually and bind live data into it
- create the full route-owned menu page HTML, not a partial fragment or isolated design mock
- include the complete functionality surface required by the live page, including public rendering, featured content, prices, descriptions, 86'd state, timestamps, sign-in entry points, and manager/admin hooks when applicable
- keep the restaurant route's design CSS owned by that route instead of adding restaurant-specific design styling to the shared root `style.css`

If the request includes root-level picker changes:
- update `index.html` only for the picker or shared shell concerns
- keep the restaurant-specific public design in the route files

5. Implementation rules when adapting a Stitch screen.

HTML rules:
- remove `<script>` tags and their contents
- remove external stylesheet links except font stylesheets you intentionally keep
- move inline `<style>` content into CSS output
- preserve the Stitch markup structure as much as possible
- keep the output as a full route-owned page section, not a fragment in a separate design folder

CSS rules:
- preserve Stitch typography and visual tokens
- preserve font imports when needed
- preserve asset references when practical; if a remote asset is needed for the route to match Stitch, download it into a stable repo asset path used by the route page
- if the target runtime requires scoping, scope as narrowly as needed without altering the visual result more than necessary

Markup rules:
- preserve the design's existing classes
- add semantic classes only where needed for data binding:
  - `.menu-category`
  - `.menu-item`
  - `.menu-item-name`
  - `.menu-item-price`
  - `.menu-item-desc`
  - `.menu-item-86d`
- when Stitch includes a distinct unavailable-item variant, bind the 86'd state into that variant instead of replacing it with a generic app-authored pattern

6. Write the output files.

Update the route-owned public page files directly:
- `leroyslounge/index.html`
- `elroyscantina/index.html`

When route-specific styling is required, write it to route-owned CSS files that live with the restaurant page, for example:
- `leroyslounge/style.css`
- `elroyscantina/style.css`

When needed, add or update supporting assets in stable repo asset paths used by those route files.

Asset rule:
- required design assets are part of the implementation, not optional polish
- download the necessary Stitch assets before finishing the task
- report exactly which assets were downloaded and where they were written

7. Report the result.

Summarize:
- verified restaurant name and ID
- Stitch project ID and screen ID used
- route files updated, if any
- asset files updated, if any
- any places where functionality could not cleanly fit the Stitch design

If you had to compromise visually, say exactly where and why.

## Repo-specific rules

- Do not introduce dependencies or build steps.
- Do not write to `designs/`; that folder is deprecated.
- Treat `index.html`, `leroyslounge/index.html`, and `elroyscantina/index.html` as the design source files.
- Preserve route-specific public pages when they already exist.
- Do not tell the user to use an in-app Design tab; that workflow is deprecated.
- The route-owned restaurant pages are the architecture. Stitch supplies the design, and the implementation must produce the complete live route page HTML and hooks inside those route files.
- Restaurant-specific public design CSS should live with the restaurant route, not in the shared root `style.css`.
- If the user is asking to create or refresh a Stitch-driven page, do the work instead of only describing it.
