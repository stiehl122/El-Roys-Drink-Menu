# El Roy's Manager iOS App

Native SwiftUI staff manager for exactly two restaurants:

- Leroy's Lounge
- El Roy's Cantina

The app lives in-repo so backend contracts, parity tracking, and native client behavior evolve together.

## Structure

- `ElRoysManagerApp/`
  - `App/` root app flow and state machine
  - `Clients/` URLSession boundary clients for existing web APIs
  - `Features/` auth, home, menu editing, public menu, preview, restaurant tools, barcode scanning
  - `Models/` wire-friendly payloads and editable menu document helpers
  - `Storage/` Keychain session storage and per-user/per-menu offline drafts
  - `Design/` shared SwiftUI styling and iOS 26+ Liquid Glass fallbacks
- `ElRoysManagerAppTests/` unit tests
- `ElRoysManagerAppUITests/` UI smoke tests
- `scripts/generate_project.rb` regenerates the Xcode project and shared scheme

## Product Defaults

- Minimum OS: `iOS 18`
- Preferred visual layer: Liquid Glass on `iOS 26+`, non-glass fallbacks on earlier supported versions
- Native menu rendering first, embedded `WKWebView` exact-route preview second
- Offline drafts are editor-only and keyed by `userId + menuId`
- Admin remains web-only

## Backend Contracts

The app consumes the consolidated shared server boundaries and does not talk to Supabase or third-party services directly:

- `/api/auth`
- `/api/public`
- `/api/manager`
- `/api/admin`

Supabase auth remains the source of truth, but only the server talks to it; iOS persists sessions in Keychain-backed storage.

## Regenerate The Project

```bash
ruby ios/scripts/generate_project.rb
```

## Build Targets

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/ElRoysManagerApp.xcodeproj -target ElRoysManagerApp -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/ElRoysManagerApp.xcodeproj -target ElRoysManagerAppTests -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios/ElRoysManagerApp.xcodeproj -target ElRoysManagerAppUITests -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```
