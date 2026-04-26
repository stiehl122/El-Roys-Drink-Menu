# Xcode Cloud iOS CI

Xcode Cloud owns iOS CI for `ios/ElRoysManagerApp.xcodeproj`. GitHub Actions owns only web and server launch gates.

## Required Workflow

- Product: `ElRoysManagerApp`
- Project: `ios/ElRoysManagerApp.xcodeproj`
- Scheme: `ElRoysManagerApp`
- Primary action: Test
- Distribution action: TestFlight when preparing staff builds
- Branches: `main` and active release branches such as `launch-readiness`
- Xcode version: latest stable available in Xcode Cloud, unless a release requires pinning

## Required Checks

- Unit tests pass.
- UI smoke test passes or any failure is reviewed before TestFlight distribution.
- The app builds with the Xcode Cloud-selected SDK.
- TestFlight build uses the expected bundle identifier and Apple Developer team.
- Any failure caused by SDK availability, signing, or simulator selection is fixed in Xcode Cloud configuration or app code before staff distribution.

## Release Procedure

1. Push the release branch or pull request.
2. Confirm GitHub Actions `Web and server checks` is green.
3. Confirm Xcode Cloud `ElRoysManagerApp` test workflow is green for the same commit.
4. Archive and distribute through Xcode Cloud only after tests pass.
5. Run the iOS section of `docs/launch/smoke-test-checklist.md` against the TestFlight build.

## Owner-Managed Settings

These settings live outside the repository and must be maintained by the project owner in Xcode or App Store Connect:

- Apple Developer team membership and signing certificates.
- Xcode Cloud repository access.
- Workflow branch triggers.
- TestFlight tester groups.
- Branch protection requirements that reference GitHub checks.
