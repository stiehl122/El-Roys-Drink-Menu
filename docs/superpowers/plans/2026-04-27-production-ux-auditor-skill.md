# Production UX Auditor Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable project skill that runs an aggressive production UX audit across the website, iOS app, and server-backed workflows.

**Architecture:** Add one focused project skill at `.agents/skills/production-ux-auditor/SKILL.md`. The skill is a procedural workflow, not runtime code, and it will reference the approved design spec while giving future agents concrete execution rules, report shape, mutation safety rules, and verification commands.

**Tech Stack:** Codex project skills, Markdown, Browser Use, Computer Use, Xcode/simulator tooling, Vercel production APIs, existing zero-dependency web/iOS repo.

---

## File Structure

- Create: `.agents/skills/production-ux-auditor/SKILL.md`
  - Responsibility: reusable project skill instructions for aggressive production UX audits.
  - Boundaries: describes workflow only; does not include credentials or generated passwords.
- Reference only: `docs/superpowers/specs/2026-04-27-production-ux-audit-skill-design.md`
  - Responsibility: approved design source for the skill.
- Do not stage: `CLAUDE.local.md`
  - Responsibility: local-only credentials and workflow notes.

## Task 1: Create Production UX Auditor Skill

**Files:**
- Create: `.agents/skills/production-ux-auditor/SKILL.md`
- Reference: `docs/superpowers/specs/2026-04-27-production-ux-audit-skill-design.md`

- [ ] **Step 1: Create the skill directory**

Run:

```bash
mkdir -p .agents/skills/production-ux-auditor
```

Expected: directory exists and no output is required.

- [ ] **Step 2: Write the skill file**

Create `.agents/skills/production-ux-auditor/SKILL.md` with this exact content:

````markdown
---
name: production-ux-auditor
description: Run an aggressive production UX audit across the public website, authenticated web manager/admin, iOS simulator app, and production APIs. Use when asked to perform launch-readiness, first-time-user, staff workflow, cross-platform, or production mutation audits before restaurant rollout.
---

# Production UX Auditor

Run an aggressive, hands-on production UX audit for El Roy's Drink Menu.

This skill is for pre-rollout product hardening. It is intentionally more
aggressive than a normal smoke test: it may mutate production menu data and
trigger real production notifications when the user has asked for this audit.

## Source Of Truth

Before auditing, read:

- `CLAUDE.md`
- `CLAUDE.local.md`
- `README.md`
- `docs/FEATURES.md`
- `docs/launch/`
- `docs/design/`
- `docs/architecture/`
- `docs/superpowers/specs/2026-04-27-production-ux-audit-skill-design.md`

Then inspect the smallest relevant code areas:

- public route folders
- `app.js`
- `core/`
- `api/`
- `server/`
- `ios/`
- `tests/`

## Required Stance

This is not primarily a code audit. Use code to understand the product, but
base findings on hands-on usage through browser and simulator interaction.

Act as:

- a first-time staff user
- a motivated operator working under service pressure
- a skeptical owner deciding whether the product feels polished enough for real
  restaurant staff

Look for:

- broken flows
- first-time-user confusion
- missing feedback
- visual polish gaps
- redesign candidates
- loading, empty, and error-state weakness
- accessibility risks
- trust/safety issues
- operational risks
- web/iOS consistency failures
- anything that feels fake, generic, unfinished, embarrassing, or not yet
  impressive

## Credential And Auth Rules

Use the dedicated audit account from `CLAUDE.local.md` when available.

Never print passwords in the final report.

If credentials are missing, invalid, or lack access, pause and ask the project
owner to sign in, grant access, provide test credentials, or approve a
reduced-scope run. Do not bypass authentication or invent credentials.

## Production Mutation Rules

Production menu mutation and real notification delivery are allowed for this
skill when the user asks for the production audit.

Every audit-created artifact must use a run marker:

```text
AUDIT YYYY-MM-DD HHMM <surface-or-menu>
```

Examples:

```text
AUDIT 2026-04-27 1322 Web Leroy Drinks
AUDIT 2026-04-27 1322 iOS El Roy Food
```

Mutation boundaries:

- Prefer mutating audit-created items, categories, featured specials, and
  descriptions.
- Do not permanently alter real user-created production data unless that exact
  behavior is being tested.
- When testing 86/restore or removal on an existing real item, restore the
  public-facing state before finishing unless the user explicitly asks to leave
  it changed.
- Do not change user roles, notification credential mappings, legal/support
  pages, or account deletion state unless the run explicitly asks for those
  mutations.
- List every production mutation in the final report.
- List every notification-triggering action in the final report.

## Current Save Model

The current product uses a unified Save review flow. There is no separate
"Save quietly" and "Send Update" button model.

Test both:

- Save with notifications off.
- Save with notifications on for at least one controlled audit change.

When notifications are on, expect real production channels to fire. If delivery
appears configured but fails, report it as a launch-readiness finding.

## Preflight

1. Read the source-of-truth docs listed above.
2. Run `git status --short` and note any pre-existing local changes.
3. Confirm production URL from metadata/docs.
4. Confirm current `APP_VERSION` from bootstrap or public footer.
5. Start a run marker and testing log.
6. Check production health:

```bash
curl -i -L --max-time 20 https://el-roys-drink-menu.vercel.app/api/health
curl -i -L --max-time 20 'https://el-roys-drink-menu.vercel.app/api/auth?mode=bootstrap'
```

7. Confirm iOS build environment:

```bash
xcodebuild -list -project ios/ElRoysManagerApp.xcodeproj
xcrun simctl list devices available
```

8. Build the iOS app:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

9. Keep a hands-on log from the first interaction onward.

## Website Audit

Use Browser Use or computer/browser interaction wherever possible.

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

- first impression within five seconds
- route-first boot
- menu switching
- public menu content
- footer version and last-updated metadata
- staff footer actions
- mobile, desktop, and narrow layouts
- loading, empty, and error states
- keyboard/focus behavior where practical
- visible console errors
- broken assets

Capture screenshots for every issue that has a visual component.

### Authenticated Manager/Admin

Sign in with the audit account.

Test:

- direct `/manager` and `/admin` loads
- public footer entry into staff surfaces
- URL/content alignment
- session persistence
- user menu and logout
- manager menu switching
- admin landing draft vs publish separation
- users/access visibility
- notification settings visibility without mutating credential mappings

For each accessible menu:

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

## iOS Audit

Use the simulator visually through Computer Use.

Install and launch the built app on at least one common iPhone simulator. If
practical, repeat key screens on one small or large device.

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
- Home
- Updates
- Tools
- Settings
- restaurant switching
- Drinks and Food editors
- native public menu preview
- exact route preview

For each editable menu:

- add an audit-marked item
- edit fields
- test price, description, and recipe visibility where applicable
- verify food hides recipe controls
- 86 and restore
- reorder where supported
- open save review
- save with notifications off
- save with notifications on for at least one controlled audit change

Check:

- light and dark mode
- safe-area overlap
- floating navigation coverage
- tappable sizes
- truncation
- keyboard avoidance
- obvious Dynamic Type risk
- VoiceOver labels where practical
- hidden or unlabeled controls

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

Always compare iOS exact route preview with the same URL in the browser.

## Adversarial Polish Pass

After the functional pass, run a second pass with a polish lens.

Ask:

- Would new staff know what to do in under five seconds?
- Does every action provide enough feedback?
- Does anything look prototype-like, fake, generic, or embarrassing?
- Does any loading state feel stuck?
- Does any copy assume developer context?
- Does any layout overlap or clip?
- Does the app feel impressive enough for restaurant rollout?
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

Each P0/P1 finding must include:

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

P2 findings can use concise issue/evidence/recommended-fix format.

## Required Final Report

Include:

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

The report must be specific enough to become developer tickets.

## Non-Negotiables

- Do not bypass authentication or browser safety barriers.
- Do not invent credentials.
- Do not print passwords in the report.
- Do not change user roles, notification credential mappings, legal/support
  pages, or account deletion state by default.
- Do not treat code inspection as a substitute for hands-on testing.
- Do not leave destructive real-menu changes unexplained.
````

- [ ] **Step 3: Validate the skill metadata and required phrases**

Run:

```bash
rg -n "name: production-ux-auditor|description: Run an aggressive production UX audit|Current Save Model|Production Mutation Rules|Required Final Report|Do not print passwords" .agents/skills/production-ux-auditor/SKILL.md
```

Expected: each searched phrase appears at least once.

- [ ] **Step 4: Validate that credentials were not copied into the skill**

Run:

```bash
rg -n "sparty1227@gmail.com|D5rvFpBWWSm8y|Password:" .agents/skills/production-ux-auditor/SKILL.md; test $? -eq 1
```

Expected: command exits successfully after `rg` finds no matches.

- [ ] **Step 5: Commit the skill only**

Run:

```bash
git status --short
git add .agents/skills/production-ux-auditor/SKILL.md
git commit -m "Add production UX auditor skill"
```

Expected: commit includes only `.agents/skills/production-ux-auditor/SKILL.md`. `CLAUDE.local.md` remains modified but unstaged.

## Self-Review

Spec coverage:

- Production mutation: Task 1 Step 2 includes production mutation rules.
- Real notifications: Task 1 Step 2 includes notification-on save expectations.
- Website audit: Task 1 Step 2 includes public and authenticated web flows.
- iOS audit: Task 1 Step 2 includes simulator, editor, preview, and visual checks.
- First-time-user/redesign lens: Task 1 Step 2 includes adversarial polish pass.
- Credential safety: Task 1 Steps 2 and 4 prevent password leakage into skill.
- Reporting shape: Task 1 Step 2 includes required report sections.

Placeholder scan:

- The plan has no `TBD`, `TODO`, or implementation placeholders.
- The only credential-like value appears in Step 4 as a forbidden search target
  to prevent leakage.

Scope check:

- The plan creates one skill file and does not implement the audit runner itself.
- Follow-up work can improve scripts or automation after the skill is usable.
