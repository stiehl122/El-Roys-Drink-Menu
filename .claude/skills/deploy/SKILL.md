---
name: deploy
description: Verify app state, commit any pending changes, push branch, and confirm the Vercel preview URL.
disable-model-invocation: true
---

Steps:
1. Run /verify to confirm app.js passes syntax check and APP_VERSION is correct.
2. Run `git status` — if uncommitted changes exist, summarize them and ask whether to commit before pushing.
3. If committing: stage relevant files (`git add index.html app.js style.css api/`), draft a commit message in conventional commits format (`type(scope): description`), confirm with the user, then commit.
4. Push: `git push`
5. Remind the user that Vercel auto-creates a preview URL for this branch. Find it in the Vercel dashboard or GitHub PR checks.
6. If a PR already exists for this branch, run `gh pr view --web` to open it.
