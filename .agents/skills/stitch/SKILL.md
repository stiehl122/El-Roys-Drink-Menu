---
name: stitch
description: >
  Convert a Stitch project into El Roy's custom-design files by verifying the
  target restaurant, downloading the Stitch screen, saving raw exports,
  melding the markup/CSS to app conventions, and writing upload-ready files
  into `designs/`. Use when the user mentions `/stitch`, asks to integrate a
  Stitch project, or wants a restaurant custom design prepared from Stitch.
  Expected inputs: restaurant name, Stitch project ID, and optional screen ID.
---

# Stitch

Use this skill when the user wants the Codex equivalent of the repo's Claude `/stitch` workflow.

Expected inputs:
- `restaurant_name`
- `stitch_project_id`
- optional `screen_id`

Interpret the request flexibly. If the user writes `/stitch El Roy's Cantina 4044680601076201931`, treat that as the input. If the request is missing required values or the restaurant name is ambiguous, ask a concise follow-up.

## Workflow

1. Parse the request.
Identify the numeric Stitch project ID and optional numeric screen ID. Treat the remaining text as the restaurant name.

2. Verify the restaurant exists before touching Stitch files.
Use the live app config when available:
- Prefer the deployed app's `/api/config` response or existing environment values for `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- In v0.8.x, only `Leroy's Lounge` and `El Roy's Cantina` are valid targets. If the request names anything else, stop and tell the user to choose one of those two restaurants.
- Query `restaurants` by name.
- If there is no match, report that clearly and list available restaurant names if you can retrieve them.
- If there are multiple plausible matches, stop and ask the user which restaurant to use.

3. Download the Stitch project with the Stitch MCP tools.
Use this sequence:
- `mcp__stitch__get_project`
- `mcp__stitch__list_screens`
- `mcp__stitch__get_screen`

Selection rules:
- If `screen_id` was provided, confirm it exists in the project.
- If no `screen_id` was provided and there is exactly one screen, use it.
- If multiple screens exist and the user did not specify one, ask which screen to use.

4. Save raw exports under `designs/{sanitized_restaurant_name}/`.
Use the repo's naming convention:
- lowercase
- replace runs of non-alphanumeric characters with `_`
- trim leading and trailing `_`

Write:
- `raw_screen.html`
- `raw_screen.css`

5. Meld the design for the app's custom-design runtime.

HTML rules:
- Remove all `<script>` tags and their contents.
- Remove external stylesheet `<link>` tags except allowed font stylesheets.
- Move inline `<style>` content into the output CSS.
- Produce an HTML fragment only, not a full document shell.

CSS rules:
- Scope selectors to `#public-categories`.
- Do not prefix `@keyframes`, `@font-face`, or `:root`.
- Remove external non-font asset URLs where practical.
- Preserve font imports and font-face rules when they are needed.

Markup rules:
- Preserve the design's existing classes.
- Add semantic classes where needed so future data binding can target the structure:
  - `.menu-category`
  - `.menu-item`
  - `.menu-item-name`
  - `.menu-item-price`
  - `.menu-item-desc`
  - `.menu-item-86d`

6. Write the upload-ready files.
Save:
- `designs/{sanitized_restaurant_name}/{sanitized_restaurant_name}_design.html`
- `designs/{sanitized_restaurant_name}/{sanitized_restaurant_name}_design.css`

These are the files the admin uploads through Admin -> Design.

7. Report the result.
Summarize:
- verified restaurant name and ID
- Stitch project ID and screen ID used
- raw files written
- melded files written
- any assumptions or manual cleanup still recommended

End with the operational next steps:
1. Review the melded files.
2. Upload the generated HTML and CSS in Admin -> Design.
3. Leave "Use Custom Design" enabled unless the restaurant needs to fall back to the default renderer temporarily.

## Repo-specific constraints

- Keep the output aligned with the app's existing custom-design behavior described in `CLAUDE.md`.
- Do not introduce dependencies or build steps.
- Write files directly into `designs/`.
- If the user is asking to create or refresh design files, do the work rather than only describing it.
