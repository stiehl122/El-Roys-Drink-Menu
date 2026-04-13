---
name: recursive-bug-squash
description: Run an unattended multi-pass El Roy's bug sweep in a disposable worktree, fix one root-cause bug cluster per pass, carry DEFCON-ranked issues forward, and open a draft PR. Use when the user asks for a recursive bug squash, search-and-destroy bug sweep, autonomous bug pass, or wants to walk away and come back to a better pre-launch build.
---

# Recursive Bug Squash

Use this skill for repo-specific, pre-launch bug hunting on El Roy's. This
skill is bug-first, not design-polish-first, and it should not silently expand
into schema work, destructive git, or open-ended redesign.

## Invocation

On every run:

1. Print the full effective config sheet before doing any work:

   ```bash
   python3 .agents/skills/recursive-bug-squash/scripts/render_config.py [flags...]
   ```

2. If the user invoked the skill without flags, show the config sheet, then ask
   which overrides to apply. Do not start the run until the user confirms the
   config.
3. If the user already supplied flags, still print the config sheet and state
   the effective values before starting.

The startup config must always show:

- pass count
- surface filters
- auth coverage state
- preview policy
- send policy
- browser mode
- DEFCON filters
- worktree / branch strategy
- whether `LOOP_ADMIN_*` and `LOOP_MANAGER_*` credentials are configured

## Supported Overrides

- `--passes N`
  Default: `10`
- `--surface <name>`
  Repeatable. Supported names: `picker`, `leroyslounge`, `elroyscantina`,
  `public-footer`, `auth`, `manager`, `admin`, `runtime`, `api`
- `--public-only`
  Shortcut for public surfaces only; disables authenticated coverage
- `--no-auth`
  Disable authenticated coverage even when `LOOP_*` credentials exist
- `--no-preview`
  Disable preview/browser verification; quarantine bugs that cannot be proven
  without it
- `--allow-send`
  Permit `Send Update` and outbound notification side effects
- `--headed`
  Run browser verification visibly instead of headless
- `--min-defcon N`
  Limit work to issues at or above the supplied severity
- `--max-defcon N`
  Limit work to issues at or below the supplied severity

When the user says "just run it" or gives only the skill name, treat that as
"print the config sheet, ask for overrides, then start."

## Defaults

- run in a disposable git worktree
- create a fresh `codex/recursive-bug-squash-YYYYMMDD-HHMMSS` branch
- stay single-threaded
- target the whole app unless surfaces are narrowed
- use headless browser verification by default
- use code/tests first; use preview/browser verification only when code/tests
  cannot fully prove the behavior
- allow real menu mutations when needed for verification, but clean up
  incidental test data afterward
- block `Send Update` unless `--allow-send` is set
- commit one successful pass at a time
- open a draft PR at the end

## Required Preflight

Before the run starts:

1. Require a clean source checkout. If the current checkout is dirty, stop and
   ask the user to clean or commit it first.
2. Self-heal lightweight user-scoped tooling when safe:
   - Playwright CLI via the shared wrapper skill
   - other non-destructive user-scoped utilities
3. Stop on unrecoverable auth / platform blockers:
   - missing `gh` auth when PR creation is required
   - missing Vercel access when preview verification is required
4. Create a disposable worktree based on the current committed `HEAD`.
5. Bootstrap `bug-loop/issues.md` if it does not yet exist:

   ```bash
   python3 .agents/skills/recursive-bug-squash/scripts/issue_ledger.py ensure
   ```

## Shared Secrets

This skill may use these optional shared env vars for authenticated coverage:

- `LOOP_ADMIN_EMAIL`
- `LOOP_ADMIN_PASSWORD`
- `LOOP_MANAGER_EMAIL`
- `LOOP_MANAGER_PASSWORD`

Rules:

- never print the secret values
- it is fine to print whether each role is configured
- admin and manager coverage are both useful; degrade gracefully if only one is
  configured
- if neither role is configured, continue with public-only coverage unless the
  user explicitly asked for auth coverage

## Persistent State

All recursive bug-squash memory lives under `bug-loop/`:

- `bug-loop/issues.md`
  Committed. Canonical unresolved/resolved issue ledger.
- `bug-loop/log.md`
  Gitignored. Append-only run log.
- `bug-loop/artifacts/`
  Gitignored. Screenshots and other captured evidence.

Before every run:

1. Import carryover from the newest open bug-squash PR or branch first, when
   one exists.
2. Fall back to the current branch's `bug-loop/issues.md`.
3. If `DEFCON 1` or `DEFCON 2` carryovers exist, work them first.
4. Only run a fresh whole-app audit after severe carryovers are fixed,
   reclassified, or quarantined.

Use the helper script for ledger maintenance:

```bash
python3 .agents/skills/recursive-bug-squash/scripts/issue_ledger.py list
python3 .agents/skills/recursive-bug-squash/scripts/issue_ledger.py upsert ...
```

## DEFCON Scale

Use real DEFCON polarity:

- `DEFCON 1`
  Stop-the-line bug. Prioritize immediately. Halt the whole run if unresolved.
- `DEFCON 2`
  Severe bug in a core flow.
- `DEFCON 3`
  Meaningful bug with workaround or narrower blast radius.
- `DEFCON 4`
  Minor non-blocking defect.
- `DEFCON 5`
  Low-priority cleanup.

## Default Surface Order

When a run is not narrowed, start here:

1. `picker` and app boot / route resolution
2. `leroyslounge`
3. `elroyscantina`
4. `public-footer`
5. `auth`
6. `manager`
7. `admin`
8. `runtime`
9. `api`

Once bugs exist in the queue, pick the next pass by:

1. DEFCON
2. blocking impact
3. whether another pass changed a dependency that just made a quarantined bug
   worth retrying

## Proof Order

For every suspected fix:

1. Prefer code reasoning and existing local checks first.
2. Run the most relevant local tests first, not the whole suite.
3. Use preview/browser verification only when code/tests cannot fully prove the
   behavior.
4. If interactive verification needs real menu mutations, keep the mutation as
   narrow as possible and clean up incidental test data before the pass ends.
5. Only use `Send Update` when `--allow-send` is set.

If `--no-preview` is active and proof would require preview/browser inspection:

- quarantine the bug
- record the reason in the ledger
- continue unless the issue is `DEFCON 1`

## Pass Rules

Every code-changing pass must target exactly one root-cause bug cluster.

For each pass:

1. Pick the next carryover or newly discovered bug cluster.
2. Investigate with code/tests first.
3. Route the pass through the relevant repo skill when the bug clearly belongs
   to a specialized area.
4. Make the smallest fix that fully addresses the root cause.
5. Small local refactors are allowed only when they directly make the fix safer
   or clearer.
6. Run targeted verification for the changed area.
7. If proof still needs preview/browser inspection, push the branch and inspect
   the relevant preview state.
8. If the fix is validated:
   - update `bug-loop/issues.md`
   - append to `bug-loop/log.md`
   - commit the pass
9. If validation is ambiguous:
   - discard the speculative code change
   - keep only the issue/log state
   - quarantine the bug

Do not batch unrelated bugs into the same pass.

## Retry Policy

- one active attempt per bug at a time
- one later retry in the same run is allowed if another landed pass changed a
  relevant dependency or verification path
- otherwise leave the bug for a later run

## Stop Conditions

Stop when any of these happen:

- the configured pass count has been reached
- a full sweep finds no actionable remaining bugs in scope
- a `DEFCON 1` issue cannot be safely resolved
- the verification environment itself is broken
- platform access required for the remaining proof path is unavailable

Continue past unresolved bugs only when they are not `DEFCON 1` and do not
poison the rest of the run.

## Verification Cadence

Per successful pass:

- run the most relevant local tests and checks first
- run only the necessary browser/preview verification
- run `menu-regression-reviewer` after high-risk behavioral fixes

At the end of the whole run:

- run the full local suite once
- confirm the ledger and branch are up to date
- push the final branch
- open a draft PR

## Git Rules

- never work directly in the user's active checkout
- never use destructive git commands
- keep one commit per successful pass
- ambiguous fix attempts do not stay on the branch
- include the updated `bug-loop/issues.md` in the branch and PR

## Out Of Bounds

- `supabase/migrations/*`
- destructive git
- open-ended design polish or brand refreshes
- adding dependencies, bundlers, or a test framework

`api/*.js` is in bounds when it is the real bug surface.

## Companion Skills

Use these serially when their domain is clearly in scope:

- `auth-and-access-guard`
- `manager-ui-maintainer`
- `public-route-builder`
- `supabase-data-maintainer`
- `menu-regression-reviewer`
- `release-and-version-agent`

This skill is the orchestrator. It owns queueing, pass control, proof strategy,
branch/worktree isolation, carryover memory, and final PR handoff.

## Output

At the end of the run, report:

- branch name
- worktree path
- passes completed
- bugs fixed
- bugs quarantined
- final verification status
- PR URL
- any blockers that still need a human decision
