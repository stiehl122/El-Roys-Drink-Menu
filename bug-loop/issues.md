# Recursive Bug Squash Issues

This file is maintained by `.agents/skills/recursive-bug-squash`.

## Open Queue

_No open issues._

## Resolved

### BUG-20260413-160650 — Phase 11 runtime boundary contract regressions
- status: fixed
- defcon: 2
- surface: runtime
- blocking: yes
- fix_attempts: 1
- last_seen: 2026-04-13T16:06:50-04:00
- evidence:
  - tests/phase11-web-cutover-boundaries.test.cjs failed with 2 assertions before fix
  - Added async persistStateDirect() compatibility shim and sbPatchRestaurantDesign() API wrapper boundary in app.js
  - node --test tests/phase11-web-cutover-boundaries.test.cjs now passes

Notes:
- Root cause cluster: boundary slices captured legacy direct-write symbols after wave 5 cutover.
- Fix kept manager/admin mutations on API command paths and restored compatibility symbol expected by boundary suite.
