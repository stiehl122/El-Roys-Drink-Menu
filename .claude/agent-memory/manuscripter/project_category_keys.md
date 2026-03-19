---
name: project_category_keys
description: Current menu category keys from DEFAULT_CATEGORY_DEFS in app.js, post-migration
type: project
---

The menu category keys changed during the Supabase migration / v0.4-v0.5 development. The old keys (`beers`, `infusedTequila`, `frozenMarg`, `monthlySpecials`, `cannedBottled`) were replaced.

**Current keys (from DEFAULT_CATEGORY_DEFS in app.js):**
- `beer` — Beers on Tap
- `canned` — Canned & Bottled
- `cocktails` — Cocktails (new category added)
- `tequila` — Infused Tequila
- `frozen` — Frozen Marg
- `special` — Monthly Specials

**Why:** Category definitions were refactored to shorter, cleaner keys. A `cocktails` category was also added.

**How to apply:** Any documentation or code referencing old category keys (e.g. `beers`, `cannedBottled`) is stale and should be updated to the current keys above.
