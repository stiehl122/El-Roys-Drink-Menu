---
name: verify
description: Validate `app.js` syntax and confirm `APP_VERSION` matches the current `v0.8.x` branch before committing or releasing. Use when the user asks to verify, sanity-check, or run the old `/verify` workflow.
---

# Verify

Run these checks and report the results:

1. Run `node --check app.js` and report pass/fail.
2. Read `APP_VERSION` from `app.js`.
3. Read the current git branch with `git branch --show-current`.
4. On the `v0.8.x` release line, confirm the branch name matches `APP_VERSION` exactly.
5. State whether the app is ready to commit or what must be fixed first.

If the branch is not a `v0.8.x` release branch, say that explicitly instead of forcing a mismatch.
