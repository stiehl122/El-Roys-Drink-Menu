---
name: supabase-data-maintainer
description: Maintain Supabase-backed menu resolution, hydration, persistence, and offline fallback behavior. Use when work touches `sbResolveMenu()`, `loadActiveMenuState()`, persistence, cache invalidation, history, featured refreshes, or legacy menu-link normalization.
---

# Supabase Data Maintainer

Use this skill when the user asks to debug or change the shared data layer.

## Ownership

- data-layer sections of root `app.js`
- active-menu resolution
- state hydration
- persistence paths
- localStorage fallback behavior
- related refresh flows for featured content, history, and notifications

## Core Rules

- preserve the hardcoded `RESTAURANTS` and `MENUS` model
- preserve legacy public-link normalization such as old `?menu=el-roys`
  behavior
- preserve localStorage fallback behavior
- do not silently change menu IDs, slugs, or restaurant/menu mapping
- avoid schema or migration work unless the user explicitly asks for it

## Workflow

1. Start with the data path, not the UI symptom.
2. Identify whether the issue is in:
   - resolution
   - hydration
   - persistence
   - cache invalidation
   - fallback logic
3. Trace both online and offline assumptions.
4. Confirm active-menu context stays correct across reads, writes, history,
   featured refreshes, and notifications state.
5. Prefer targeted normalization or hydration fixes over broad rewrites.

## Useful Anchors

- `sbResolveMenu()`
- `loadActiveMenuState()`
- `persistState()`
- `refreshFeaturedForActiveMenu()`

## Output

Report:
- which data path changed
- whether the defect lived in resolution, hydration, persistence, or fallback
- the files touched
- what online/offline verification still needs to happen
