---
name: verify
description: Validate app.js syntax and confirm APP_VERSION matches the current v0.8.x branch before committing.
---

Run the following checks and report the results:

1. **Syntax check**: Run `node --check app.js` and report pass/fail.
2. **Version check**: Read the `APP_VERSION` constant from `app.js` (line 2). Read the current git branch with `git branch --show-current`. On the v0.8.x release line, the branch should match the app version exactly (for example, branch `v0.8.0` should have `APP_VERSION = 'v0.8.0'`, and branch `v0.8.1` should have `APP_VERSION = 'v0.8.1'`). Report any mismatch.
3. **Summary**: State whether the app is ready to commit or what needs to be fixed first.
