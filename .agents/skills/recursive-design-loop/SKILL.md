---
name: recursive-design-loop
description: Run an aggressive recursive design and front-end performance improvement loop against a specific screen on the deployed Vercel build that matches the current worktree commit. Handles protected deployments, manager/admin sign-in, and menu-context bootstrapping before auditing. Requires a target screen argument (e.g. /leroyslounge, /manager, /elroyscantina). Use when the user asks for repeated design polish passes, deployed-screen audits, recursive UX/performance iteration, or to keep improving a specific page until diminishing returns.
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

- inspect the deployed Vercel build that matches the current worktree commit
  exactly; prefer Preview, but do not guess by branch name alone
- never use localhost, a local dev server, a local build, or any locally run
  copy of the site for Playwright inspection
- start with `git rev-parse HEAD`, then resolve deployments by commit metadata:
  first look for a Ready Preview deployment whose commit SHA matches `HEAD`;
  if none exists, look for a Ready deployment whose commit SHA matches `HEAD`
  even if that deployment is Production (common on `main`)
- if the current worktree is detached or `vercel ls` is ambiguous, use Vercel
  deployment metadata (`githubCommitSha`, `gitCommitSha`, `githubCommitRef`,
  `gitCommitRef`) to match the exact commit rather than assuming the latest
  Preview is correct
- only fall back to "latest ready Preview for the current branch" when an
  exact-commit match does not exist and the user explicitly wants branch-level
  inspection instead of exact-commit inspection
- each pass is incomplete until you inspect the matched deployed build,
  implement the pass, run `deploy`, poll until the new deployment is Ready,
  and inspect the updated deployment again
- if no Ready deployment exists for the current commit, surface that clearly
  and stop; do not silently inspect some other branch's deployment
- if the matched deployment is still building, wait and poll; if it errored,
  surface the error message to the user; never fall back to localhost

## Protected Deployments

- assume Vercel Authentication may protect Preview and even Production URLs
- before launching Playwright, verify whether the deployment can be opened
  directly; if it redirects to Vercel login or returns 401/403, generate a
  temporary share URL with the Vercel access helper and use that share URL for
  browser inspection
- keep the underlying canonical deployment URL in the log, but record that a
  temporary share URL was used to reach it
- if browser access still fails after generating a share URL, stop and surface
  that as a deployment-access issue rather than treating it as a product bug

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

## Settings Route Readiness

For `/manager` and `/admin`, do not treat the route as audit-ready just because
the page loaded.

1. Reach the deployed route with browser access solved first
   (share URL if needed).
2. Check whether the route is showing an auth overlay, a redirect prompt, a
   site picker, or a "No menu context" shell.
3. If auth is required, ask the user for credentials or permission to use an
   existing authenticated session. Do not audit only the auth overlay unless
   the user explicitly wants auth-flow work.
4. After sign-in, verify the route has a real menu context:
   - if `?menu=` is missing or the shell says `No menu selected`, select an
     accessible menu through the built-in picker or navigate to the same route
     with an explicit allowed `?menu=<slug>`
   - if the route redirects toward the restaurant selector, follow that path,
     choose a real menu, then return to the settings screen in-context
5. Only begin the substantive audit once the settings workspace shows a real
   active menu and its actual sections/items are loaded.
6. Audit auth-only, no-menu, and redirect states as secondary edge states after
   the in-context manager/admin workspace has been inspected.

## Pass Audit

### Pass 1 (Audit — no code changes)

1. Resolve the exact deployed build for `git rev-parse HEAD` using deployment
   metadata, preferring a Ready Preview deployment when one exists.
2. If the deployment is protected, generate a temporary share URL and use it
   for browser access.
3. Launch Playwright headed (visible browser) so the user can watch live.
   Use headless only if the user has opted out of watching or the environment
   has no display.
4. If the target is `/manager` or `/admin`, complete the Settings Route
   Readiness checklist before judging the screen.
5. Inspect the target screen in all four mode combinations:
   - desktop light mode
   - desktop dark mode
   - mobile light mode
   - mobile dark mode
6. **Scroll the full page in every mode.** Scroll in viewport-height increments
   from top to bottom, pausing to screenshot and evaluate every section. Never
   rely on the initial viewport alone — do not move on until you have seen
   every pixel of the page.
7. Interact with every reachable state: navigation, modals, forms, menus, tabs,
   drawers, hover, focus, active, disabled, loading, empty, and error states.
8. Apply the Creative Evaluation Lens (see below) in full.
9. Document every issue found. Tag `[CRITICAL]` where appropriate.
10. Write `docs/design/<screen>/design-loop-issues.md` (merge with any existing issues).
11. Append the audit report to `docs/design/<screen>/design-loop-log.md`.
12. Propose what the first code-changing pass will tackle.
13. In pause-after-every-pass mode: ask for approval before proceeding.
    With `--passes N`: proceed automatically.

### Code-Changing Passes (Pass 2+)

1. Re-resolve the new deployment for the just-pushed commit by exact commit
   metadata, not by assuming the newest Preview row belongs to this work.
2. If the deployment is protected, generate a fresh temporary share URL before
   browser inspection.
3. If the target is `/manager` or `/admin`, restore authenticated, in-context
   menu state before judging the result of the pass.
4. Re-inspect only the modes and states relevant to what this pass will change.
   Scroll in viewport-height increments — screenshot every section.
5. Before editing, state:
   - what you found
   - what you are changing
   - why the current state falls short and what the change does for the
     experience
6. Make the changes.
7. Run `deploy`. Use commit message format:
   `design(<screen>): pass N — <one-line summary>`
8. Poll until the new matched deployment status is Ready.
9. Reinspect the affected modes and states. Compare before vs after.
10. Confirm the pass improved the experience and did not introduce regressions.
11. Run `menu-regression-reviewer` if the pass touched any behavioral code.
12. Update `docs/design/<screen>/design-loop-issues.md`: remove issues that are now fixed.
13. Append the pass report to `docs/design/<screen>/design-loop-log.md`.
14. Plan the next pass based on current state — one pass at a time, never
    plan all passes upfront.
15. In pause-after-every-pass mode: ask whether to continue.
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
- deployment resolution notes (exact commit matched, preview vs production,
  protected URL vs share URL)
- highest-leverage issues found
- changes made (or issues documented, for audit pass)
- why the pass mattered — what shifted in the experience
- deployment URL inspected
- validation and regression results
- what the next pass would tackle
