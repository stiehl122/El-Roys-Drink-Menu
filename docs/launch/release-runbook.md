# Release Runbook

## Pre-Release

1. Confirm `git status --short` is clean.
2. Run `node --check app.js`.
3. Run `node scripts/check-html-script-order.cjs`.
4. Run `node --test tests/*.test.cjs tests/boundaries/*.test.cjs`.
5. Confirm the latest Xcode Cloud workflow for `ElRoysManagerApp` is green on the release branch or commit.
6. If Xcode Cloud is unavailable, run iOS simulator tests locally before releasing:
   `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO test`.
7. Confirm Supabase migrations planned for this release are applied to staging/preview first.
8. Confirm every production migration is backward-compatible with the currently deployed production code. If not, split the work into expand/deploy/contract phases.
9. Confirm backup exists before applying production migrations.

## CI Gates

Before release, confirm the `Launch Gates` GitHub Actions workflow is green for the release branch or pull request. The workflow runs the web/server syntax, HTML script order, and Node test gates on Ubuntu with Node 24.

Repository owners must enable GitHub Actions for the repo before relying on this gate. Owners should also decide whether branch protection should require `Web and server checks` before merging to `main` or `launch-readiness`.

iOS CI is owned by Xcode Cloud. Before merging or distributing a TestFlight build, confirm the Xcode Cloud workflow in `docs/launch/xcode-cloud.md` is green for the same branch or commit.

## Deploy

1. Deploy to Vercel preview.
2. Run `docs/launch/smoke-test-checklist.md` against preview.
3. Apply only backward-compatible Supabase production migrations.
4. Deploy to production.
5. Run the same smoke checklist against production.
6. Apply contract migrations only after the production deployment no longer depends on the old schema.

## Post-Deploy Monitoring

1. Confirm `/api/health` returns HTTP 200 after preview and production deploys.
2. Treat `/api/health` returning HTTP 503 as a launch blocker until required Supabase env config and Supabase REST readiness are restored.
3. Watch Vercel function logs for repeated health failures or Supabase readiness errors during the first post-deploy traffic window.

## Rollback

1. Revert the Vercel deployment to the previous production deployment.
2. If a migration is not backward-compatible, stop and use the documented database restore process instead of guessing.
3. Verify public routes, manager login, Save, and Send Update after rollback.

## Backup And Restore

1. Before launch-day migrations, create a Supabase backup or confirm the latest automatic backup is restorable.
2. Record backup timestamp in release notes.
3. Perform a restore rehearsal before public launch and after any schema migration that changes menu/access tables.
