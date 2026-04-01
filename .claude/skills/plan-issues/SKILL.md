---
name: plan-issues
description: Plan and create GitHub issues for large-scale El Roy's features. Use this skill whenever a version milestone is being scoped, a multi-part feature is being planned, or the user asks to break work into issues, track a new version, create a roadmap, or organize upcoming changes. Also trigger when the user describes a feature and you need to decompose it into units before starting work.
disable-model-invocation: true
---

Arguments: $ARGUMENTS (optional — target version and/or feature summary, e.g. "v0.8 barcode scanner")

## Purpose

Break large planned changes into well-structured GitHub issues for `stiehl122/El-Roys-Drink-Menu`, following the project's established issue conventions. Issues are the source of truth for planned work — each one should be small enough to implement in a focused session and clearly tied to a version milestone.

Current numbering reminder: **v0.8.x work uses Unit 3.x**.

## Step 1 — Gather scope

Parse $ARGUMENTS for a version (e.g. `v0.8`) and a feature description.

If the version is missing, ask the user.
If the feature scope is vague or not provided, ask the user to describe:
- What the feature does (from a user/staff perspective)
- Any known sub-problems or constraints
- Whether it has sub-milestones (e.g. foundation now, polish later)

Don't proceed to planning until you have enough to write meaningful issue bodies.

## Step 2 — Check existing state

Before proposing anything, run these two commands in parallel:

```bash
gh -R stiehl122/El-Roys-Drink-Menu issue list --state open --label "<major-version>" --limit 50
gh -R stiehl122/El-Roys-Drink-Menu label list
```

Use the first to understand what unit numbers are already taken for this version — new units must continue the sequence, not restart or collide.

Use the second to know which labels already exist. You'll need to create missing labels before assigning them.

## Step 3 — Propose the issue plan

Break the feature into subversions and units. Present a numbered plan to the user before creating anything. Format it clearly:

```
v0.8.1 — Barcode Foundation
  Unit 3.1: Browser Barcode Detection (BarcodeDetector API + fallback)  [research]
  Unit 3.2: Camera Viewfinder Overlay  [enhancement]
  Unit 3.3: /api/barcode-lookup Endpoint (UPC → product name)  [enhancement]

v0.8.2 — Manager Integration
  Unit 3.4: Scan Button in Add-Item Area  [enhancement]
  Unit 3.5: Auto-fill Name + Category from Scan Result  [enhancement]
  Unit 3.6: UPC Field on Item Model  [enhancement, schema]
```

Each unit should cover one coherent concern — a single component, API endpoint, UI area, or data model change. If you're unsure how to split something, err toward smaller units.

Wait for the user to approve, request changes, or ask to merge/split units before proceeding.

## Step 4 — Create labels if needed

For any label in your plan that doesn't exist yet, create it first:

```bash
gh -R stiehl122/El-Roys-Drink-Menu label create "<label>" --color "<hex>" --description "<short desc>"
```

Common colors to reuse: `#a2eeef` (enhancement), `#d73a4a` (bug), `#e4e669` (research/schema), `#f9d0c4` (design), `#0075ca` (new version milestones).

## Step 5 — Create the issues

For each approved unit, create the issue:

```bash
gh -R stiehl122/El-Roys-Drink-Menu issue create \
  --title "v{subversion} — Unit {N}: {Feature Name}" \
  --label "<major-version>,<subversion>,<type>" \
  --body "$(cat <<'EOF'
## Summary

{1–2 sentence description of what this unit covers and why it matters.}

## Tasks

- [ ] {concrete implementation step}
- [ ] {concrete implementation step}
- [ ] {concrete implementation step}

## Dependencies

{List any issues this blocks or is blocked by, e.g. "Blocked by: #101" — or "None" if standalone.}

## Size / Milestone

**{Small / Small-Medium / Medium / Large}** | **{subversion}** | Blocks: {next unit or "none"}
EOF
)"
```

Apply labels for:
- The **major version** (e.g. `v0.8`) — ties to the overarching milestone
- The **subversion** (e.g. `v0.8.1`) — ties to the delivery chunk
- The **type** (e.g. `enhancement`, `bug`, `research`, `design`, `schema`) — describes the nature of the work

## Step 6 — Report results

After all issues are created, print a summary table:

```
Created 6 issues for v0.8:

v0.8.1
  #183 — Unit 3.1: Browser Barcode Detection
  #184 — Unit 3.2: Camera Viewfinder Overlay
  #185 — Unit 3.3: /api/barcode-lookup Endpoint

v0.8.2
  #186 — Unit 3.4: Scan Button in Add-Item Area
  #187 — Unit 3.5: Auto-fill Name + Category from Scan Result
  #188 — Unit 3.6: UPC Field on Item Model
```

## Conventions to preserve

- **Unit numbers are global per major version** — if v0.7 already has Units 2.1–2.7, the next v0.7.x unit is 2.8, not 3.1.
- **Unit prefix = major version number** — v0.7.x uses "Unit 2.x", v0.8.x uses "Unit 3.x", v0.9.x uses "Unit 4.x", and so on (major minor version digit → unit series).
- **Em dash in title** — use `—` (U+2014), not a hyphen, between the version and unit name.
- **Never create a duplicate unit number.** Always check existing issues first (Step 2).
