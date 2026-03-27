---
name: verify
description: Validate app.js syntax and confirm APP_VERSION matches the current branch before committing.
---

Run the following checks and report the results:

1. **Syntax check**: Run `node --check app.js` and report pass/fail.
2. **Version check**: Read the `APP_VERSION` constant from `app.js` (line 2). Read the current git branch with `git branch --show-current`. Check whether the version and branch match (e.g., branch `v0.5.5` should have `APP_VERSION = 'v0.5.5'`). Report any mismatch.
3. **Summary**: State whether the app is ready to commit or what needs to be fixed first.
