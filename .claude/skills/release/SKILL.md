---
name: release
description: Ensure APP_VERSION matches the branch, commit, push, and open a PR with release notes. Invoke with /release.
disable-model-invocation: true
---

Steps:
1. Read the current branch name via `git branch --show-current`.
2. Read `APP_VERSION` from line 2 of `app.js`.
3. If `APP_VERSION` already matches the branch name, skip to step 6. Otherwise, update `APP_VERSION` on line 2 of `app.js` to match the branch name.
4. Run `node --check app.js` to confirm no syntax errors.
5. Stage and commit: `git add app.js && git commit -m "chore(release): bump APP_VERSION to <version>"`
6. Push: `git push`
7. Collect the full commit log since main: `git log main..HEAD --oneline`
8. Search commit messages for GitHub issue references (e.g. `#123`). Also check the diff for any issue references: `git diff main..HEAD`.
9. Create PR with `gh pr create`. The PR body must include:
   - A **Summary** section with bullet points from the commit log.
   - A **Issues Addressed** section listing any referenced issues as `Closes #N` or `Fixes #N`. If no issues are referenced, write "None" in this section.
   - A **Test plan** section with a checklist for verifying the release.
10. Report the PR URL.
