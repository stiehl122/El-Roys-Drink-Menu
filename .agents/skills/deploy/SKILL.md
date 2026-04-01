---
name: deploy
description: Verify app state, summarize pending changes, then commit, push, and surface the Vercel preview or PR state. Use when the user asks to deploy, push, or run the old `/deploy` workflow.
---

# Deploy

Follow this workflow:

1. Run the `verify` skill first.
2. Run `git status --short`.
3. If uncommitted changes exist, summarize them and ask whether to commit before pushing.
4. If committing:
   - stage the relevant files
   - draft a conventional commit message in the form `type(scope): description`
   - confirm with the user before committing
5. Push the current branch with `git push`.
6. Tell the user Vercel should create or update the preview deployment for that branch.
7. If a PR already exists, surface it with GitHub tooling or `gh pr view`.

Do not auto-commit or auto-push without user confirmation when there are local changes.
