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
- **--passes N** (optional): run exactly N code-changing passes after the audit
  then stop. Omit to pause and ask after every pass.

If the user does not specify a screen, ask which one before proceeding.

## Source Of Truth

- inspect only the Vercel preview deployment for the current branch
- never use localhost, a local dev server, a local build, or any locally run
  copy of the site for Playwright inspection
- derive the preview URL by running `git rev-parse HEAD` to get the commit
  hash, then `vercel ls` (personal account, no `--scope` needed) and matching
  the deployment for the current branch
- each pass is incomplete until you inspect the current preview, implement the
  pass, run `deploy`, poll until the preview is ready, and inspect the updated
  preview again
- if the Vercel preview cannot be reached, check `vercel ls` for build status
  first — if still building, wait and poll; if errored, surface the error
  message to the user; only stop and ask if the deployment is ready but still
  unreachable; never fall back to localhost

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

## Persistent State

All design-loop output for a screen lives in `docs/design/<screen>/`:

- **`docs/design/<screen>/design-loop-issues.md`** — living document of open issues. Written fresh
  after each audit pass. Issues are removed once fixed. Issues are tagged
  `[CRITICAL]` when they break functionality, cause visible regressions, or
  significantly degrade the experience. This file is committed to the repo and
  read at the start of every new session.
- **`docs/design/<screen>/design-loop-log.md`** — append-only full pass report after every pass
  (audit and code-changing). Gitignored.
- **Screenshots** — saved to `docs/design/<screen>/` with descriptive names
  (e.g. `pass1-audit-desktop-light-top.png`). Gitignored.

At session start:

1. Read `docs/design/<screen>/design-loop-issues.md` if it exists.
2. If any `[CRITICAL]` issues are present → skip the audit pass and go
   straight to the first code-changing pass targeting those issues.
3. If no critical issues (or no issues file) → run a fresh audit pass and
   merge new findings into the issues file before proceeding.

## Companion Skills

- `deploy` — mandatory after every code-changing pass (handles verify, commit,
  and push)
- `menu-regression-reviewer` — mandatory after any pass that touches behavior,
  not just visuals
- `public-route-builder` for route-owned public pages
- `manager-ui-maintainer` for manager or admin UI work
- `auth-and-access-guard` for auth, recovery, role, or access changes
- `supabase-data-maintainer` for menu resolution, hydration, persistence, or
  live-update changes
- `release-and-version-agent` when footer metadata or preview badge behavior is
  in scope

## Pass Audit

### Pass 1 (Audit — no code changes)

1. Find the Vercel preview URL: run `git rev-parse HEAD`, then `vercel ls`,
   match the deployment for the current branch.
2. Launch Playwright headed (visible browser) so the user can watch live.
   Use headless only if the user has opted out of watching or the environment
   has no display.
3. Inspect the target screen in all four mode combinations:
   - desktop light mode
   - desktop dark mode
   - mobile light mode
   - mobile dark mode
4. **Scroll the full page in every mode.** Scroll in viewport-height increments
   from top to bottom, pausing to screenshot and evaluate every section. Never
   rely on the initial viewport alone — do not move on until you have seen
   every pixel of the page.
5. Interact with every reachable state: navigation, modals, forms, menus, tabs,
   drawers, hover, focus, active, disabled, loading, empty, and error states.
6. Apply the Creative Evaluation Lens (see below) in full.
7. Document every issue found. Tag `[CRITICAL]` where appropriate.
8. Write `docs/design/<screen>/design-loop-issues.md` (merge with any existing issues).
9. Append the audit report to `docs/design/<screen>/design-loop-log.md`.
10. Propose what the first code-changing pass will tackle.
11. In pause-after-every-pass mode: ask for approval before proceeding.
    With `--passes N`: proceed automatically.

### Code-Changing Passes (Pass 2+)

1. Re-inspect only the modes and states relevant to what this pass will change.
   Scroll in viewport-height increments — screenshot every section.
2. Before editing, state:
   - what you found
   - what you are changing
   - why the current state falls short and what the change does for the
     experience
3. Make the changes.
4. Run `deploy`. Use commit message format:
   `design(<screen>): pass N — <one-line summary>`
5. Poll `vercel ls` until the deployment status is Ready.
6. Reinspect the affected modes and states. Compare before vs after.
7. Confirm the pass improved the experience and did not introduce regressions.
8. Run `menu-regression-reviewer` if the pass touched any behavioral code.
9. Update `docs/design/<screen>/design-loop-issues.md`: remove issues that are now fixed.
10. Append the pass report to `docs/design/<screen>/design-loop-log.md`.
11. Plan the next pass based on current state — one pass at a time, never
    plan all passes upfront.
12. In pause-after-every-pass mode: ask whether to continue.
    With `--passes N`: continue automatically until N code-changing passes
    are complete.

## Creative Evaluation Lens

Apply in full on pass 1 and on any pass where the scope is undecided. On
targeted passes, keep it in mind — always ask whether the fix is enough or
whether a bolder move would better serve the experience. The goal is not just
to correct what is broken but to raise the bar. Suggest what the screen could
become, not just what needs patching.

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

## Priorities

- prefer moves that change how the screen feels, not just how it measures
- prefer practical, user-visible performance wins over theoretical
  micro-optimizations
- generalize repeated fixes when the same issue appears in multiple places
- don't polish what should be redesigned; don't redesign what just needs polish
- keep changes production-ready, maintainable, and aligned with repo
  conventions
- match the scale of changes to what the screen actually needs — if a large
  redesign is the right move, propose it and get approval; do not shrink scope
  just to avoid a big diff

## Output Per Pass

Append to `docs/design/<screen>/design-loop-log.md`:

- pass number and type (audit or code-changing)
- target screen and states inspected
- highest-leverage issues found
- changes made (or issues documented, for audit pass)
- why the pass mattered — what shifted in the experience
- preview URL inspected
- validation and regression results
- what the next pass would tackle
