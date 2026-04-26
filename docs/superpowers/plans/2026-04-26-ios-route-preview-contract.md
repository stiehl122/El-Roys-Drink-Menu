# iOS Route Preview Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure iOS exact route preview opens the correct restaurant public route when server payloads contain canonical UUID restaurant IDs.

**Architecture:** Keep the route decision inside `PreviewClient`, but base it on canonical UUIDs and menu slugs instead of fake slug-shaped `restaurantId` test data. Add tests that use the same UUIDs defined in `core/domain/constants.js`.

**Tech Stack:** SwiftUI app, URLSession client layer, XCTest.

---

## Ownership

Codex can handle this entirely in code. No project-owner intervention is required unless the public route paths themselves are changing.

## File Structure

- Modify: `ios/ElRoysManagerApp/Clients/BackendClients.swift`
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`
- Optional docs: `docs/FEATURES.md` if route behavior wording changes.

### Task 1: Add Production-Shape Failing Test

**Files:**
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Replace the route-preview fixture with UUID-shaped records**

Change `testDrinksRouteUsesExplicitQueryWhileFoodUsesBasePath` to:

```swift
func testDrinksRouteUsesExplicitQueryWhileFoodUsesBasePath() {
  let preview = PreviewClient(
    environment: AppEnvironment(
      name: .preview,
      baseURL: URL(string: "https://example.com")!,
      publicOrigin: URL(string: "https://example.com")!,
      displayName: "Preview"
    )
  )
  let leroysRestaurantId = "00000000-0000-0000-0000-000000000010"
  let elroysRestaurantId = "00000000-0000-0000-0000-000000000001"
  let leroysDrinks = MenuRecord(id: "drinks", slug: "leroys-lounge-drinks", name: "Drinks", type: "drinks", restaurantId: leroysRestaurantId, canManage: true)
  let leroysFood = MenuRecord(id: "food", slug: "leroys-lounge-food", name: "Food", type: "food", restaurantId: leroysRestaurantId, canManage: true)
  let elroysDrinks = MenuRecord(id: "el-drinks", slug: "el-roys-cantina-drinks", name: "Drinks", type: "drinks", restaurantId: elroysRestaurantId, canManage: true)
  let elroysFood = MenuRecord(id: "el-food", slug: "el-roys-cantina-food", name: "Food", type: "food", restaurantId: elroysRestaurantId, canManage: true)

  XCTAssertEqual(preview.exactRouteURL(for: leroysDrinks).absoluteString, "https://example.com/leroyslounge?menu=drinks")
  XCTAssertEqual(preview.exactRouteURL(for: leroysFood).absoluteString, "https://example.com/leroyslounge")
  XCTAssertEqual(preview.exactRouteURL(for: elroysDrinks).absoluteString, "https://example.com/elroyscantina?menu=drinks")
  XCTAssertEqual(preview.exactRouteURL(for: elroysFood).absoluteString, "https://example.com/elroyscantina")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

Expected: FAIL because Leroy's UUID falls through to `/elroyscantina`.

- [ ] **Step 3: Commit failing test**

```bash
git add ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "test: cover iOS route preview with production restaurant ids"
```

### Task 2: Fix Preview Route Resolution

**Files:**
- Modify: `ios/ElRoysManagerApp/Clients/BackendClients.swift`

- [ ] **Step 1: Add canonical route constants**

Inside `PreviewClient`, before `exactRouteURL`, add:

```swift
private enum RestaurantRoute {
  static let leroysRestaurantId = "00000000-0000-0000-0000-000000000010"
  static let elroysRestaurantId = "00000000-0000-0000-0000-000000000001"

  static func path(for menu: MenuRecord) -> String {
    if menu.restaurantId == leroysRestaurantId || menu.slug.hasPrefix("leroys-lounge") {
      return "/leroyslounge"
    }
    if menu.restaurantId == elroysRestaurantId || menu.slug.hasPrefix("el-roys-cantina") {
      return "/elroyscantina"
    }
    return "/elroyscantina"
  }
}
```

- [ ] **Step 2: Use the constants in `exactRouteURL`**

Replace:

```swift
let basePath = menu.restaurantId == "leroys-lounge" ? "/leroyslounge" : "/elroyscantina"
```

with:

```swift
let basePath = RestaurantRoute.path(for: menu)
```

- [ ] **Step 3: Run iOS tests**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

Expected: PASS.

- [ ] **Step 4: Run Release simulator build**

Run:

```bash
xcodebuild build -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add ios/ElRoysManagerApp/Clients/BackendClients.swift ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "fix: resolve iOS public previews from canonical restaurant ids"
```

## Self-Review Notes

- Spec coverage: covers the observed iOS/server contract mismatch and both restaurants/menu types.
- Placeholder scan: no placeholders remain.
- Intervention scan: no owner action needed.
