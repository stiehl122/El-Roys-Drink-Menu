---
name: release
description: Bump APP_VERSION in app.js, commit, push, and open a PR with release notes. Invoke with /release <new-version> (e.g., /release v0.5.6).
disable-model-invocation: true
---

Arguments: $ARGUMENTS (the target version, e.g. "v0.5.6")

Steps:
1. Parse the target version from $ARGUMENTS. If none provided, ask the user.
2. Run /verify to confirm the current state is clean (syntax pass, version noted).
3. Update `APP_VERSION` on line 2 of `app.js` to the new version string.
4. Run `node --check app.js` to confirm no syntax errors were introduced.
5. Stage: `git add app.js`
6. Commit: `git commit -m "chore(release): bump APP_VERSION to <version>"`
7. Push: `git push`
8. Create PR: `gh pr create --title "release: <version>" --body "$(git log main..HEAD --oneline | sed 's/^/- /')"` — summarize commits as bullet points.
9. Report the PR URL for review and merge.
