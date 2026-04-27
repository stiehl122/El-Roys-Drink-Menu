# Production UX Audit Skill Design

## Purpose

Create a reusable project skill that runs an aggressive pre-rollout production
UX audit for El Roy's Drink Menu across the public website, manager/admin web
workspaces, iOS app, and Vercel-backed APIs.

The audit is not primarily a code audit. It uses code and docs to understand
the product, but the main evidence must come from using the website and iOS app
like real people will use them before the restaurants rely on the system.

The skill should find bugs, first-time-user confusion, visual polish gaps,
redesign candidates, loading/empty/error weaknesses, accessibility risks,
cross-platform inconsistencies, and anything that makes the product feel less
trustworthy or impressive.

## Audit Stance

The skill is allowed to mutate production menu data and trigger real production
notifications. This is intentional because the current launch stage has one
active staff user, and the goal is to prove the real production experience
before restaurant rollout.

The audit should behave like three users:

- A first-time staff user who needs to understand what the product is and what
  to do next.
- A motivated operator trying to complete service-critical work quickly.
- A skeptical owner or launch reviewer deciding whether the product feels
  polished enough to hand to real staff.

## Credential Model

The skill should use the dedicated local audit account documented in
`CLAUDE.local.md`.

If credentials are missing, invalid, or lack needed access, the skill must pause
and ask the project owner to sign in, grant access, or approve a reduced-scope
run. It must not invent credentials or bypass authentication.

The skill should never print passwords in its report.

## Production Mutation Safety

The audit should leave a clear audit trail rather than silently erasing every
trace of its work.

Every audit-created production artifact should use a run marker:

```text
AUDIT YYYY-MM-DD HHMM <surface-or-menu>
```

Examples:

```text
AUDIT 2026-04-27 1322 Web Leroy Drinks
AUDIT 2026-04-27 1322 iOS El Roy Food
```

Rules:

- Prefer mutating audit-created items, categories, featured specials, and
  descriptions.
- Do not delete or permanently alter real user-created production data unless
  that exact destructive behavior is the thing being tested.
- When testing 86/restore or removal behavior on an existing real item, restore
  the public-facing state before finishing unless the user explicitly asks to
  leave it changed.
- Do not change admin roles, notification credential mappings, legal/support
  pages, or account deletion state unless the run explicitly asks for those
  mutations.
- List every production mutation in the final report.
- List every notification-triggering action in the final report.

## Save And Notification Model

The current product has a unified Save review flow. It is not a separate
"Save quietly" and "Send Update" button model.

The skill must test both modes of the unified save flow:

- Save with notifications off.
- Save with notifications on for at least one controlled audit change.

When notifications are on, the skill should expect real production channels to
fire. If configured delivery fails, classify it as a launch-readiness finding.

## Preflight Phase

Before hands-on testing, the skill should inspect enough context to know the
current product shape:

- `CLAUDE.md`
- `CLAUDE.local.md`
- `README.md`
- `docs/FEATURES.md`
- `docs/launch/`
- `docs/design/`
- `docs/architecture/`
- the relevant web route, manager/admin, server, and iOS files

It should also:

- Confirm the production URL.
- Confirm the current app version.
- Check `git status --short`.
- Start a run marker and testing log.
- Confirm or discover the available iOS simulator devices.
- Check `/api/health`, `/api/auth?mode=bootstrap`, and public menu API basics.

## Website Audit Flow

The website audit must use browser/computer interaction wherever possible.

### Public And Unauthenticated

Test:

- `/`
- `/leroyslounge`
- `/elroyscantina`
- legacy `?menu=el-roys`
- invalid routes and 404 behavior
- `privacy.html`
- `terms.html`

Evaluate:

- first impression and above-the-fold clarity
- route-first boot
- loading, empty, and error states
- restaurant and menu switching
- footer version and last-updated metadata
- staff footer actions
- mobile, desktop, and narrow layouts
- keyboard/focus behavior where practical
- console errors and visible broken assets

### Authenticated Manager/Admin

Sign in with the audit account, then test:

- direct `/manager` and `/admin` loads
- public footer entry into staff surfaces
- URL/content alignment
- session persistence
- user menu and logout
- manager menu switching
- admin landing-page draft vs publish separation
- users/access visibility
- notification settings visibility without mutating credential mappings

For each of the four menus where access allows it:

- create an audit-marked item
- edit name, description, and price
- add/remove an upcharge where supported
- verify food menus hide recipe controls
- test recipe visibility on drinks
- test featured-specials flow
- test 86 and restore
- test category tooling with audit-created artifacts where safe
- test reorder where supported
- save with notifications off
- save with notifications on for at least one controlled audit change
- verify public route reflection, timestamp/history updates, and visible menu
  state

## iOS Audit Flow

The iOS audit must build, install, launch, and visually drive the app in the
simulator.

Test at least one common iPhone simulator size. If practical, also test a small
or large device.

### Launch And Auth

Test:

- fresh launch
- sign in with the audit account
- create-account flow when requested by the user
- no-access or pending-approval state if access is missing
- sign out and sign back in
- session persistence
- background/foreground
- relaunch
- biometric/session errors when biometric restore is disabled and enabled

### Native Staff Workflows

Test:

- Home
- Updates
- Tools
- Settings
- restaurant switching
- Drinks and Food editors
- native public menu preview
- exact route preview

For each editable menu where access allows it:

- add an audit-marked item
- edit fields
- test price, description, and recipe visibility where applicable
- verify food hides recipe controls
- 86 and restore
- reorder where supported
- open save review
- save with notifications off
- save with notifications on for at least one controlled audit change

### iOS Visual And Accessibility-Oriented UX

Check:

- light and dark mode
- safe-area overlap
- floating navigation coverage
- tappable sizes
- truncation
- keyboard avoidance
- obvious Dynamic Type risk
- VoiceOver labels where practical
- screen-reader-hostile hidden or unlabeled controls

## Web/iOS Consistency

After production mutations, compare web and iOS for:

- product and restaurant naming
- menu names
- item counts
- featured items
- 86 treatment
- timestamps and update history
- exact route preview content
- save review wording
- notification wording
- empty/error states
- account/access messaging

The iOS exact route preview must be checked against the same URL in the browser.

## Adversarial Polish Pass

After the functional pass, the skill should run a second pass with a polish and
first-time-user lens.

Ask:

- Would new staff know what to do in under five seconds?
- Does every action provide enough feedback?
- Does anything look prototype-like, fake, generic, or embarrassing?
- Does any loading state feel stuck?
- Does any copy assume developer context?
- Does any layout overlap or clip?
- Does the app feel impressive enough for a restaurant rollout?
- Are there redesign candidates that would materially improve confidence or
  usability?

## Finding Classification

Use P0/P1/P2 severity plus a finding type.

Severity:

- P0: launch blocker
- P1: important pre-rollout issue
- P2: post-launch polish

Type:

- Bug
- UX friction
- Visual polish
- Redesign candidate
- Accessibility
- Cross-platform consistency
- Trust/safety
- Operational risk

Each P0/P1 finding should include:

- title
- platform
- type
- evidence
- steps to reproduce
- actual result
- expected result
- user impact
- recommended fix or redesign direction
- estimated effort
- validation method

P2 findings can use a concise issue/evidence/recommended-fix format.

## Required Report Sections

The final report should include:

- UX launch-readiness verdict
- recommended launch type
- product and journey map
- UX scorecard
- P0 findings
- P1 findings
- P2 findings
- website UX findings
- iOS UX findings
- web/iOS consistency table
- production mutations performed
- notifications triggered
- audit trail items left behind
- auth/access limitations
- hands-on testing log
- commands run
- screenshots and artifact paths
- recommended UX launch checklist
- suggested fix/redesign plan
- cleanup or follow-up notes

The report must be specific enough for a developer to convert findings into
tickets.

## Non-Goals

The skill should not:

- Generalize the product beyond the two restaurants and four fixed menus.
- Bypass authentication or browser safety barriers.
- Mutate user roles, notification credential keys, legal pages, or account
  deletion state by default.
- Treat code inspection as a substitute for hands-on testing.
- Print passwords or other secrets in the final report.
- Hide production mutation details from the final report.
- Leave destructive real-menu changes unexplained.

## Success Criteria

The skill is successful when it can:

- run a realistic production audit across web and iOS
- mutate production in a recognizable, bounded way
- trigger real notifications when testing notification-on saves
- verify changes across public web, manager/admin, iOS native views, and iOS
  exact route previews
- surface both bugs and redesign candidates
- produce a concise but ticket-ready launch-readiness report
