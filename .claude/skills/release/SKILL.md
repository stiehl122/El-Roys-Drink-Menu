---
name: release
description: Ensure `APP_VERSION` matches the release branch, then commit, push, and open a PR with release notes. Use when the user asks to cut a release or run the old `/release` workflow.
---

# Release

Follow this workflow:

1. Read the current branch with `git branch --show-current`.
2. Read `APP_VERSION` from `app.js`.
3. If the branch name is the target release version and `APP_VERSION` does not match it, update `APP_VERSION` to match.
4. Run `node --check app.js`.
5. Stage and commit the version bump with `chore(release): bump APP_VERSION to <version>` if a bump was needed.
6. Push the branch.
7. Collect the commit log since `main` with `git log main..HEAD --oneline`.
8. Check the commit log and diff for GitHub issue references.
9. Create a PR whose body includes:
   - `Summary`
   - `Issues Addressed`
   - `Test plan`
10. Report the PR URL.

If the branch is not a release branch, stop and say so before mutating files.
