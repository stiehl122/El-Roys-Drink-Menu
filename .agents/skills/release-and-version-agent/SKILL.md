---
name: release-and-version-agent
description: Handle release hygiene around `APP_VERSION`, footer version output, and preview-badge behavior. Use when preparing a release or patch, checking version drift, or validating shared footer metadata before deploy.
---

# Release And Version Agent

Use this skill when the user asks to cut a release, bump a patch version, or
verify footer/version correctness.

## Ownership

- `APP_VERSION` in `core/domain/constants.js`
- shared footer version output in root `app.js`
- shared route footer version output in `routes/shared/public-route-core.js`
- preview badge behavior

## Core Rules

- treat version drift as a real bug
- keep release-prep edits surgical
- do not create commits, tags, releases, or deploys unless asked
- check both shared shell and shared-route footer paths

## Workflow

1. Inspect `APP_VERSION` in `core/domain/constants.js`.
2. Trace every code path that surfaces version and preview metadata.
3. Confirm whether the requested release scope implies a version bump.
4. If changing versioning, verify the shared shell and shared-route renderer
   still agree.
5. Call out docs or release-note drift if present.

## Output

Report:
- the version target or mismatch handled
- the files touched
- whether footer and preview rendering now agree
- any remaining deploy or release step the user still needs to run
