---
name: recursive-design-loop
description: Run an aggressive recursive design and front-end performance improvement loop against a specific screen on the current branch's Vercel preview deployment. Requires a target screen argument (e.g. /leroyslounge, /manager, /elroyscantina). Use when the user asks for repeated design polish passes, preview-only Playwright audits, recursive UX/performance iteration, or to keep improving a specific page until diminishing returns.
---

# Recursive Design Loop

Use this skill when the user wants ongoing product refinement of a specific
screen rather than a single design tweak. The user must specify which screen
to target (e.g. `/leroyslounge`, `/elroyscantina`, `/manager`, `/admin`, `/`).

## Arguments

- **screen** (required): the route or page to focus on
  (e.g. `/leroyslounge`, `/elroyscantina`, `/manager`, `/admin`, `/`)

If the user does not specify a screen, ask which one before proceeding.

## Source Of Truth

- inspect only the Vercel preview deployment for the current branch or commit
- never use localhost, a local dev server, a local build, or any locally run
  copy of the site for Playwright inspection
- each pass is incomplete until you inspect the current preview, implement the
  pass, validate locally as needed, commit, push, wait for the preview update,
  and inspect the updated preview again
- if the Vercel preview cannot be accessed, loaded, or audited successfully,
  stop and ask the user; do not fall back to localhost

## Repo Guardrails

- preserve the zero-dependency architecture
- preserve the fixed two-restaurant, two-menu model
- preserve route-owned public pages and shared runtime behavior
- do not break `Save` vs `Send Update`, draft indicators, 86'd public treatment,
  footer version output, `PREVIEW` badge behavior, or route-first public boot
- ask the user before adding a new feature
- ask the user before making a major design change that materially changes
  product direction, information architecture, core workflows, or brand
  character

## Companion Skills

Use these when the affected area is clear:

- `playwright` for browser inspection and screenshots
- `deploy` and `verify` for commit, push, and preview-update workflow
- `menu-regression-reviewer` after meaningful behavior changes
- `public-route-builder` for route-owned public pages
- `manager-ui-maintainer` for manager or admin UI work
- `auth-and-access-guard` for auth, recovery, role, or access changes
- `supabase-data-maintainer` for menu resolution, hydration, persistence, or
  live-update changes
- `release-and-version-agent` when footer metadata or preview badge behavior is
  in scope

## Pass Audit

1. Find the current Vercel preview URL for the branch or commit you are about
   to improve.
2. **Always use a headed (visible) browser session** — never headless. Launch
   Playwright with `headless: false` / `browser_navigate` so the user can
   watch the audit live in a managed Chrome window. Do not use background or
   headless Playwright, even if that is the default.
3. Inspect the target screen with Playwright in:
   - desktop light mode
   - desktop dark mode
   - mobile light mode
   - mobile dark mode
4. **Scroll the full page** in each mode combination. Do not rely on the
   initial viewport alone — many issues hide below the fold. Scroll from the
   very top to the very bottom in measured increments (e.g. viewport-height
   steps), pausing to capture or evaluate each section. Take a screenshot at
   the top, middle, and bottom of the page at minimum. Only after you have
   seen every pixel of the page should you move on to interaction states.
5. Go deep on the target screen. Don't just skim — inhabit it. Interact with
   every reachable state: navigation, modals, forms, menus, tabs, drawers,
   hover, focus, active, disabled, loading, empty, and error states.
6. Capture screenshots when they help compare before vs after.
7. Rank the highest-leverage issues for this pass. Favor a few cohesive wins
   over many shallow tweaks.

## Creative Evaluation Lens

Look at the screen the way a demanding creative director would — someone who
ships world-class consumer products, not just "correct" ones. Go beyond
checklists. Ask yourself:

- **Feel**: Does this screen feel good? Is there a moment of delight, or does
  it feel utilitarian and flat? What would make someone say "nice" when they
  first see it?
- **Rhythm**: Is there a natural visual rhythm — breathing room between
  sections, a clear reading flow, a satisfying cadence of weight and
  whitespace?
- **Craft details**: Are micro-interactions polished? Do transitions feel
  intentional? Are borders, shadows, and radii consistent and purposeful, or
  scattered and arbitrary?
- **Typography**: Is the type system doing real work — establishing hierarchy,
  creating personality, guiding the eye — or is it just "text at different
  sizes"?
- **Color and contrast**: Does the palette feel cohesive and intentional in
  both light and dark modes? Are there muddy grays, clashing tones, or
  contrast dead zones?
- **Spatial logic**: Does the layout reward scanning? Can a user orient
  themselves instantly? Is information density appropriate for the context?
- **Responsiveness**: Does the mobile version feel native and considered, or
  like a desktop page that got squeezed?
- **Accessibility**: Are interactive elements discoverable by keyboard and
  screen readers? Is contrast sufficient? Are focus states visible?
- **Performance feel**: Does the page feel instant? Are there layout shifts,
  slow paints, or interactions that feel sluggish?
- **Surprise**: Is there one thing you could do that would meaningfully elevate
  the experience — something non-obvious that the user didn't ask for but
  would clearly appreciate?

Push beyond the safe, incremental fix. If the screen is fundamentally okay but
uninspired, say so and propose something bolder. If the bones are great but a
detail is off, zoom in on that detail.

## Pass Execution

1. Before editing, state briefly:
   - what you found on the target screen
   - what you are changing
   - why it matters — not just "improves spacing" but why the current state
     falls short and what the change does for the experience
2. If the pass adds a feature or creates a major design shift, stop and ask the
   user first.
3. Implement the smallest cohesive set of changes with the strongest
   user-visible ROI.
4. Run targeted validation for the changed files and flows.
5. Commit with a clear message and push the current branch.
6. Wait for the Vercel preview deployment to finish updating.
7. Reinspect the target screen in all four mode combinations.
8. Compare before vs after across all affected states.
9. Confirm the pass improved the experience and did not introduce regressions.
10. Decide whether another pass is warranted, then continue until the remaining
    gains are marginal.

## Priorities

- prefer moves that change how the screen feels, not just how it measures
- prefer practical, user-visible performance wins over theoretical
  micro-optimizations
- generalize repeated fixes when the same issue appears in multiple places
- don't polish what should be redesigned; don't redesign what just needs polish
- keep changes production-ready, maintainable, and aligned with repo
  conventions

## Output Per Pass

Report:

- target screen and states inspected
- highest-leverage issues found
- changes made
- why the pass mattered — what shifted in the experience
- preview URL inspected
- validation and regression results
- whether another pass should happen and what it would tackle
