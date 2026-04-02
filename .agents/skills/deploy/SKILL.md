---
name: deploy
description: Verify app state, summarize pending changes, then commit, push, and surface the Vercel preview or PR state. Use when the user asks to deploy, push, or run the old `/deploy` workflow.
---

# Deploy

Follow this workflow:

1. Run the `verify` skill first.
2. Run `git status --short`.
3. If uncommitted changes exist, summarize them, then commit and push as part of deploy.
4. When committing:
   - stage the relevant files
   - use a conventional commit message in the form `type(scope): description`
   - if the user has already asked to deploy, treat that as confirmation to commit and push unless they explicitly say otherwise
5. Push the current branch with `git push`.
6. Tell the user Vercel should create or update the preview deployment for that branch.
7. If a PR already exists, surface it with GitHub tooling or `gh pr view`.

When the user explicitly asks to deploy, treat deploy as authorization to commit and push the current intended changes.
