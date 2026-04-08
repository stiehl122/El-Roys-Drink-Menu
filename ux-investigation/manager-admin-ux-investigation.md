# Manager + Admin UX Investigation

Date: 2026-04-07

Scope:
- `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html`
- `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html`
- `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css`
- `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js`

Method:
- Parallel investigation across manager-specific, admin-specific, and shared-system concerns.
- Cross-checked against the current Vercel Web Interface Guidelines.
- No code changes were made as part of this investigation.

## Executive Summary

Both pages have stronger shells than inner workflows.

The manager page already has a clear visual direction: fixed glass topbar, left rail, roomy overview cards, and a grounded workspace feel. The admin page also has a solid structural base: fixed rail, sticky topbar, responsive collapse, and clear route-level scope.

The problem is not the outer frame. The problem is that the working parts inside both shells still depend on older shared CRUD primitives and older interaction assumptions. That shows up as dense inline toolbars, over-boxed nested cards, inconsistent save behavior, internal implementation copy leaking into user-facing text, and settings grouped by technical implementation rather than by user task or persistence scope.

If these pages should feel modern, clean, and functional with no extra fluff, the redesign should prioritize:
- simplifying the most common workflows before adding any more surface styling
- separating setting scopes clearly
- removing developer-facing copy and replacing it with concise outcome-focused language
- standardizing the control system instead of continuing to skin legacy components

## What Is Already Worth Preserving

- The manager shell foundation is good: fixed topbar, left rail, spacious overview cards, and fixed action bar. Refs: [manager/index.html:27](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L27), [manager/index.html:123](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L123), [manager/index.html:298](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L298), [style.css:2224](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2224), [style.css:2547](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2547), [style.css:3090](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3090)
- The admin shell foundation is also strong: fixed rail, sticky topbar, responsive rail collapse, and clear section structure. Refs: [admin/index.html:50](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L50), [style.css:1300](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1300), [style.css:1404](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1404), [style.css:1896](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1896)
- Manager-specific operational context is useful and should stay: active menu context, recent changes, featured overview, and stats. Refs: [manager/index.html:52](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L52), [manager/index.html:138](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L138), [manager/index.html:168](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L168), [app.js:4778](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4778)
- The fixed two-restaurant, four-menu model is a strength, not a limitation. The explicit restaurant/menu switcher pattern is correct for this app. Refs: [admin/index.html:124](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L124), [app.js:3551](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3551), [app.js:4883](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4883)
- Deep-linking, skip links, and section targeting are worth keeping. Refs: [manager/index.html:15](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L15), [admin/index.html:14](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L14), [app.js:2793](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L2793), [style.css:1511](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1511), [style.css:2472](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2472)
- Progressive disclosure is the right direction. Categories, history, maintenance disclosures, and the responsive rail drawer are good patterns that need cleaner inner components, not removal. Refs: [app.js:3722](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3722), [app.js:4766](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4766), [style.css:3013](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3013), [style.css:3287](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3287)

## Core Diagnosis

The newer shells are mostly acting as a skin over a broad legacy shared component surface.

The clearest examples are the continued reliance on shared primitives like `.btn-small`, `.config-card`, `.input-row`, `.current-item`, `.user-chip`, and older inline CRUD renderers. The shells restyle those pieces, but they do not fundamentally simplify them. Refs: [style.css:764](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L764), [style.css:772](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L772), [style.css:790](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L790), [style.css:1242](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1242), [style.css:1543](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1543), [style.css:2102](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2102)

That is why both pages feel visually newer than they feel behaviorally.

## Highest-Priority Updates

### 1. Normalize the manager save model

Problem:
The manager page presents one unified editing surface, but it actually mixes two persistence models. The main action bar implies that edits are staged until `Save` or `Send Update`, yet several controls save immediately on blur or click.

Why it matters:
This makes the workspace feel unreliable. Two controls that look equally “editable” can have completely different consequences. That is the opposite of a calm settings page.

Evidence:
- Draft-style edits: add item, remove item, 86, visibility toggle. Refs: [app.js:4038](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4038), [app.js:4147](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4147), [app.js:4164](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4164), [app.js:4257](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4257)
- Immediate-save edits: category reorder/edit, description, price, ingredients, featured sell note. Refs: [app.js:1668](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L1668), [app.js:1684](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L1684), [app.js:1693](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L1693), [app.js:4208](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4208), [app.js:4238](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4238), [app.js:4250](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4250), [app.js:5189](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L5189)
- Action bar framing. Ref: [manager/index.html:298](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L298)

Direction:
Pick one primary commitment model for manager work. Either stage all menu edits until `Save`/`Send Update`, or isolate true autosave controls into clearly labeled secondary panels with visible save state.

### 2. Rebuild the manager `Edit Menu` rows around clarity, not micro-actions

Problem:
The item rows still behave like legacy operator toolbars inside a polished shell. A single row carries reorder, status, name, price, description, recipe, 86, visibility, and delete.

Why it matters:
This is the highest-frequency workflow on the page. If the row feels dense and old, the whole workspace feels old no matter how clean the shell is.

Evidence:
- Section framing. Refs: [manager/index.html:181](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L181), [manager/index.html:185](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L185)
- Row renderer. Refs: [app.js:3768](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3768), [app.js:3776](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3776)
- Legacy row styling and dense toolbar behavior. Refs: [style.css:790](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L790), [style.css:2817](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2817), [style.css:2858](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2858), [style.css:3415](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3415)

Direction:
Make each item a clean primary content row with strong status and only the most important inline controls. Move secondary editing into a labeled details drawer, sheet, or structured subpanel.

### 3. Split admin Notifications by setting scope

Problem:
The Notifications area currently blends menu-level toggles, restaurant-level credential key mappings, and a browser-local menu URL into one visual block.

Why it matters:
The UI implies one cohesive persistence model, but the runtime does not work that way. That is confusing, especially in a page that should feel like a trustworthy settings console.

Evidence:
- Layout grouping. Refs: [admin/index.html:122](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L122), [admin/index.html:199](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L199), [admin/index.html:242](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L242)
- Separate save targets in runtime. Refs: [app.js:3445](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3445), [app.js:3483](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3483), [app.js:3516](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3516)

Direction:
Split the area into clearly labeled scopes:
- menu-level delivery toggles
- restaurant-level credential mapping
- local/browser utilities

Each save action should say exactly what it saves.

### 4. Replace the admin `Users & Access` hybrid table/form

Problem:
`Users & Access` is still a dense live management table with inline editing, role changes, menu-access assignment, status, and multiple `Save` buttons per row.

Why it matters:
It is functional, but it does not feel like a modern settings page. It feels like a legacy admin table inside a new shell.

Evidence:
- Section framing. Refs: [admin/index.html:256](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L256), [admin/index.html:265](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L265)
- User table renderer. Refs: [app.js:4817](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4817), [app.js:4836](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4836), [app.js:4855](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4855), [app.js:4894](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4894)
- Table/grid styling. Refs: [style.css:1695](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1695), [style.css:1704](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1704), [style.css:1785](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1785)

Direction:
Move to lighter summary rows or cards with progressive disclosure. One user should read as one unit of work, not as a dense cluster of unrelated inline controls.

### 5. Remove implementation-language copy from both pages

Problem:
Some copy still reads like design/import notes or internal commentary rather than product language.

Why it matters:
Modern settings pages feel calm because they say only what the operator needs. Internal implementation language is pure visual noise.

Evidence:
- Manager editorial/internal-feeling copy. Refs: [manager/index.html:126](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L126), [manager/index.html:129](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L129), [manager/index.html:195](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L195), [manager/index.html:232](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L232)
- Admin explicit implementation notes. Refs: [admin/index.html:108](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L108), [admin/index.html:119](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L119), [admin/index.html:262](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L262)
- Technical restaurant copy. Ref: [app.js:5459](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L5459)

Direction:
Rewrite copy around operator outcomes:
- what this section controls
- what changes here affect
- what action comes next

No internal “Stitch,” “import,” or technical implementation commentary should remain in the UI.

### 6. Stop styling legacy shared primitives as if that were enough

Problem:
The shells are still built on shared primitives that carry older spacing, hierarchy, and interaction assumptions.

Why it matters:
This is the root cause of the visual mismatch. The shells look newer because of palette, typography, and layout, but the controls still feel older because the underlying component language is older.

Evidence:
- Shared legacy primitives. Refs: [style.css:764](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L764), [style.css:769](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L769), [style.css:772](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L772), [style.css:790](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L790), [style.css:1124](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1124)
- Admin shell only partially reskins inner cards. Refs: [style.css:1543](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1543), [style.css:1564](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1564)
- Manager shell overrides structure but not interaction model. Refs: [style.css:2533](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2533), [style.css:2703](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2703), [style.css:2718](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2718)

Direction:
Build a dedicated settings component layer for these two pages instead of continuing to restyle shared legacy utility components.

## Secondary but Important Updates

### 7. Fix the manager information architecture

Problem:
The rail order does not match the actual section order, and featured confirmation appears in two separate places.

Why it matters:
This weakens the page’s sense of order even before any visual redesign.

Evidence:
- Rail order. Refs: [manager/index.html:115](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L115), [manager/index.html:116](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L116), [manager/index.html:117](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L117)
- Actual section order. Refs: [manager/index.html:181](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L181), [manager/index.html:192](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L192)
- Duplicate featured actions. Refs: [manager/index.html:132](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L132), [manager/index.html:303](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L303)

Direction:
Align rail order to page order and keep one canonical surface for global/featured actions.

### 8. Recast manager Category Management as a true settings surface

Problem:
This section is one of the clearest visual regressions versus the newer shell. It still reads like an older CRUD widget.

Evidence:
- Section and hidden add form. Refs: [manager/index.html:192](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L192), [manager/index.html:203](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L203)
- Renderer and controls. Refs: [app.js:1610](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L1610), [app.js:1628](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L1628)
- Styling. Refs: [style.css:1035](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1035), [style.css:2907](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2907)

Direction:
Treat categories like editorial settings cards or accordions with stronger metadata, clearer edit state, and better reorder affordances.

### 9. Reframe admin `Restaurants & Menus`

Problem:
The section is framed as management, but it currently acts as a static overview with very little operator value.

Evidence:
- Section framing. Ref: [admin/index.html:102](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L102)
- Static renderer and copy. Refs: [app.js:5449](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L5449), [app.js:5459](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L5459)
- Layout. Ref: [style.css:1636](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1636)

Direction:
Either make it a real status/health/overview area with relevant actions, or intentionally downgrade it to a compact informational section.

### 10. Simplify the manager database area

Problem:
The database section still feels like a legacy admin table with tiny filter controls and maintenance disclosures underneath it.

Evidence:
- Section framing. Refs: [manager/index.html:229](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L229), [manager/index.html:238](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L238)
- Toolbar styling. Ref: [style.css:2934](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2934)
- Disclosures. Ref: [style.css:3019](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3019)

Direction:
Make it search-first, lighten the filtering UI, show clearer counts/status, and move maintenance tasks into a visually separate admin-only zone.

### 11. Add stronger section-level feedback states

Problem:
Long-form settings sections rely too heavily on toasts, generic empties, or silent resets.

Evidence:
- Shared navigation state handling. Refs: [app.js:2760](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L2760), [app.js:2801](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L2801)
- Admin notification population/loading. Refs: [app.js:3590](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3590), [app.js:3605](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L3605)
- User and restaurant load states. Refs: [app.js:4708](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4708), [app.js:5468](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L5468)

Direction:
Each major section should have its own loading, saved, error, and empty-state language instead of relying mostly on global toasts.

### 12. Improve mobile simplification instead of only wrapping complexity

Problem:
On smaller screens, the UI often removes helpful copy but keeps the same control density.

Evidence:
- Manager mobile action bar + row wrapping. Refs: [style.css:3312](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3312), [style.css:3415](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3415)
- Mobile hides helper copy. Ref: [style.css:3394](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L3394)
- Admin mobile stacks the same dense row model rather than simplifying it. Refs: [style.css:1947](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1947), [style.css:1956](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1956)

Direction:
Collapse secondary actions earlier, keep concise helper text, and shift dense multi-control rows into progressive disclosure on mobile.

## Accessibility + Interaction Polish That Should Be Part of the Redesign

- Admin still has unlabeled inline controls and placeholder-only auth fields in places where manager is stronger. Refs: [app.js:4836](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4836), [app.js:4855](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4855), [admin/index.html:283](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L283), [admin/index.html:286](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L286)
- Manager and admin section navigation behave differently. Manager uses anchors; admin uses buttons inside nav. Refs: [manager/index.html:115](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/manager/index.html#L115), [admin/index.html:56](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/admin/index.html#L56), [app.js:2801](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L2801)
- Autocomplete remains mouse-first and non-semantic. Refs: [app.js:4104](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4104), [app.js:4123](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/app.js#L4123)
- Several shared controls still use `transition: all`, and motion does not have a reduced-motion branch. Refs: [style.css:772](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L772), [style.css:799](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L799), [style.css:810](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L810), [style.css:843](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L843), [style.css:868](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L868)
- Admin focus treatment is weaker than manager focus treatment. Refs: [style.css:1360](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L1360), [style.css:2186](/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/style.css#L2186)

These are not the main visual problem, but they should be corrected as part of the same cleanup so the new shells are modern in behavior as well as appearance.

## Recommended Redesign Order

1. Normalize the shared settings component language.
2. Fix manager save semantics and rebuild manager item rows.
3. Split admin notifications by scope.
4. Rebuild admin users as a lighter summary + disclosure workflow.
5. Remove implementation-language copy everywhere.
6. Fix section order, duplicate actions, and dead-end overview framing.
7. Simplify mobile and interaction polish.

## One-Sentence Design Brief

Redesign both pages as calm operational settings workspaces where every section has a clear scope, every control communicates its persistence model, dense legacy CRUD is replaced with cleaner progressive disclosure, and all user-facing copy is concise, direct, and free of implementation chatter.
