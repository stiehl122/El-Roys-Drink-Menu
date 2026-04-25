# Release Runbook

## Pre-Release

1. Confirm `git status --short` is clean.
2. Run `node --check app.js`.
3. Run `node scripts/check-html-script-order.cjs`.
4. Run `node --test tests/*.test.cjs tests/boundaries/*.test.cjs`.
5. Run iOS simulator tests:
   `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO test`.
6. Confirm Supabase migrations planned for this release are applied to staging/preview first.
7. Confirm every production migration is backward-compatible with the currently deployed production code. If not, split the work into expand/deploy/contract phases.
8. Confirm backup exists before applying production migrations.

## Deploy

1. Deploy to Vercel preview.
2. Run `docs/launch/smoke-test-checklist.md` against preview.
3. Apply only backward-compatible Supabase production migrations.
4. Deploy to production.
5. Run the same smoke checklist against production.
6. Apply contract migrations only after the production deployment no longer depends on the old schema.

## Rollback

1. Revert the Vercel deployment to the previous production deployment.
2. If a migration is not backward-compatible, stop and use the documented database restore process instead of guessing.
3. Verify public routes, manager login, Save, and Send Update after rollback.

## Backup And Restore

1. Before launch-day migrations, create a Supabase backup or confirm the latest automatic backup is restorable.
2. Record backup timestamp in release notes.
3. Perform a restore rehearsal before public launch and after any schema migration that changes menu/access tables.
