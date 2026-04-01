---
name: stitch
description: Download a Stitch project, verify the target restaurant exists in Supabase, meld the design with app conventions, and save output to designs/. Use when an admin has a Stitch project ready to integrate as a shared restaurant-level custom public view for El Roy's. Usage: /stitch <restaurant_name> <stitch_project_id> [screen_id]
---

Arguments: $ARGUMENTS — expects `<restaurant_name> <stitch_project_id> [screen_id]`

Parse arguments from `$ARGUMENTS`:
- `restaurant_name` — the restaurant name (may be multiple words; everything before the last 1–2 space-separated tokens that look like IDs)
- `stitch_project_id` — numeric Stitch project ID (e.g. `4044680601076201931`)
- `screen_id` — optional screen ID within the project

---

## Step 1 — Parse & validate arguments

Split `$ARGUMENTS`. The last token that is numeric is the `stitch_project_id`. If two numeric tokens are present, the second-to-last is the `stitch_project_id` and the last is the `screen_id`. Everything before is the `restaurant_name`.

If fewer than 2 tokens are present, print usage and abort:
```
Usage: /stitch <restaurant_name> <stitch_project_id> [screen_id]
Example: /stitch "Leroy's Lounge" 4044680601076201931
```

---

## Step 2 — Verify the restaurant exists in Supabase

Read `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the live app by fetching `/api/config` (GET request to the Vercel deployment URL, or read from environment). If not available, instruct the user to ensure they are on a deployed branch.

Query the restaurants table:
```
GET {SUPABASE_URL}/rest/v1/restaurants?name=ilike.{restaurant_name}&select=id,name
Headers: apikey: {SUPABASE_ANON_KEY}
```

- If **no match**: print an error and list all available restaurants (`GET /rest/v1/restaurants?select=name&order=name.asc`). Abort.
- If **multiple matches**: show the list and ask the user to clarify.
- If **exactly one match**: proceed with that restaurant's `id` and `name` for all file naming and output paths.

---

## Step 3 — Download the Stitch project

Use the Stitch MCP tools in this order:

1. **Verify project exists:**
   ```
   mcp__stitch__get_project({ name: "projects/{stitch_project_id}" })
   ```
   If this fails, print the error and abort.

2. **List screens:**
   ```
   mcp__stitch__list_screens({ projectId: "{stitch_project_id}" })
   ```
   - If `screen_id` was provided, confirm it appears in the list.
   - If no `screen_id` was provided and there is exactly one screen, use it automatically.
   - If there are multiple screens and no `screen_id`, print the list and ask the user which to use. Abort until clarified.

3. **Download the target screen:**
   ```
   mcp__stitch__get_screen({
     name: "projects/{stitch_project_id}/screens/{screen_id}",
     projectId: "{stitch_project_id}",
     screenId: "{screen_id}"
   })
   ```
   Extract the HTML and CSS from the response.

---

## Step 4 — Save raw files

Compute `sanitized_restaurant_name`:
- Lowercase the restaurant name
- Replace runs of non-alphanumeric characters with `_`
- Strip leading/trailing underscores

Create directory: `designs/{sanitized_restaurant_name}/`

Write raw Stitch output:
- `designs/{sanitized_restaurant_name}/raw_screen.html` — the raw HTML from Stitch
- `designs/{sanitized_restaurant_name}/raw_screen.css` — the raw CSS from Stitch

---

## Step 5 — Meld the design

Transform the raw HTML and CSS to produce files that work inside the app's `#public-categories` container:

**HTML transformations:**
- Strip all `<script>` tags and their contents entirely (security)
- Strip any `<link>` tags pointing to external stylesheets (other than Google Fonts)
- Do NOT strip `<style>` blocks — move their content into the CSS file instead
- The output should be a self-contained HTML fragment (no `<html>`, `<head>`, or `<body>` wrappers — just the inner body content)

**CSS transformations:**
- Prefix all selectors with `#public-categories` to scope them and prevent bleed into the app shell (e.g. `.menu-card { ... }` becomes `#public-categories .menu-card { ... }`)
- Exception: do not prefix `@keyframes`, `@font-face`, or `:root` rules
- Strip any `url()` references that point to external non-font resources (images, etc.) — replace with empty string or a `var(--bg)` fallback
- Google Fonts `@import` or `@font-face` rules are allowed and should be preserved

**Data-binding class annotations:**
Review the melded HTML and add or confirm the presence of these semantic classes so the app can identify live data regions in future enhancements:
- `.menu-category` — wraps each menu category section
- `.menu-item` — wraps each item row
- `.menu-item-name` — the item name element
- `.menu-item-price` — the price display (if present)
- `.menu-item-desc` — the description (if present)
- `.menu-item-86d` — the 86'd indicator (if present)

These classes should be added to existing elements without removing existing classes.

---

## Step 6 — Write melded output

Write the melded files:
- `designs/{sanitized_restaurant_name}/{sanitized_restaurant_name}_design.html`
- `designs/{sanitized_restaurant_name}/{sanitized_restaurant_name}_design.css`

These are the files to upload via the Admin Design tab.

---

## Step 7 — Report

Print a summary:
```
✓ Restaurant verified: "{restaurant_name}" (ID: {restaurant_id})
✓ Stitch project downloaded: {stitch_project_id} / screen {screen_id}
✓ Raw files saved:
    designs/{sanitized_restaurant_name}/raw_screen.html
    designs/{sanitized_restaurant_name}/raw_screen.css
✓ Melded output saved:
    designs/{sanitized_restaurant_name}/{sanitized_restaurant_name}_design.html
    designs/{sanitized_restaurant_name}/{sanitized_restaurant_name}_design.css

Next steps:
1. Review the melded files to verify the design looks correct.
2. Go to Admin → Design tab, select "{restaurant_name}", and upload the .html and .css files.
3. Toggle "Use Custom Design" on to activate it for the public view.
```
