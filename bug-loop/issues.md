# Recursive Bug Squash Issues

This file is maintained by `.agents/skills/recursive-bug-squash`.

## Open Queue

_No open issues._

## Resolved

### BUG-20260413-153807 — Runtime helper test assumes fixed repo folder name in worktrees
- status: fixed
- defcon: 3
- surface: runtime
- blocking: no
- fix_attempts: 1
- last_seen: 2026-04-13T15:38:22-04:00
- evidence:
  - node --test tests/runtime-helpers.test.cjs (pass)

Notes:
- Relaxed path assertion to work in disposable worktrees while still validating absolute app.js resolution.
