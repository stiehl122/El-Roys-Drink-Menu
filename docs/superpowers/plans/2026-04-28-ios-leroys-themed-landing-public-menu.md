# iOS Leroy's Themed Landing And Public Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Leroy's-only native iOS redesign for the landing/home screen and native public menu, while keeping staff/editor surfaces generic and replacing exact route preview with an in-app Safari sheet.

**Architecture:** Add a focused restaurant presentation resolver in the existing iOS design layer, then let `HomeViews.swift` and `PublicMenuViews.swift` consume that resolver. Keep live menu content as native SwiftUI text, promote only the Leroy's sign/background raster assets, and replace the embedded route preview WKWebView with `SFSafariViewController`.

**Tech Stack:** SwiftUI, UIKit interop, SafariServices, Xcode asset catalogs, Node source-contract tests, XCTest build verification.

---

## File Structure

- Modify `ios/ElRoysManagerApp/Design/Glass.swift`
  - Add `RestaurantPresentation`, Leroy's tokens, resolver helpers, and small reusable Leroy's surface modifiers/views.
  - Keep this in the existing design file to avoid project-file churn for a small theme seam.

- Modify `ios/ElRoysManagerApp/Features/Home/HomeViews.swift`
  - Resolve `RestaurantPresentation` from the selected restaurant.
  - Remove the bottom dock/QR.
  - Apply the Leroy's sign/background and food-first shortcut ordering only for Leroy's.
  - Leave El Roy's existing theme behavior intact.

- Modify `ios/ElRoysManagerApp/Features/Public/PublicMenuViews.swift`
  - Resolve `RestaurantPresentation` from the `RestaurantRecord`.
  - Keep the existing standard public menu path for El Roy's.
  - Add a Leroy's posted-card/chalkboard public menu path.
  - Show food-only specials and public `Sold Out` copy for Leroy's.

- Modify `ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift`
  - Replace the embedded WKWebView preview with an `SFSafariViewController` representable.

- Modify `ios/ElRoysManagerApp/App/ElRoysManagerApp.swift`
  - Present route previews as a Safari sheet destination, or keep the destination while `RoutePreviewScreen` itself presents Safari.

- Create asset catalog folders:
  - `ios/ElRoysManagerApp/Assets.xcassets/LeroysHeroSign.imageset/`
  - `ios/ElRoysManagerApp/Assets.xcassets/LeroysWallBackground.imageset/`

- Modify `tests/ios-source-contracts.test.cjs`
  - Add source-shape assertions for the resolver, Leroy's public-menu rules, dock removal, and Safari preview.

---

## Task 1: Add Source-Contract Tests For The New Behavior

**Files:**
- Modify: `tests/ios-source-contracts.test.cjs`

- [ ] **Step 1: Add failing source-contract tests**

Append these tests to `tests/ios-source-contracts.test.cjs`:

```js
test('iOS Leroy theme resolver owns restaurant-specific public presentation rules', () => {
  const design = read('ios/ElRoysManagerApp/Design/Glass.swift');

  assert.match(design, /enum RestaurantPresentation/);
  assert.match(design, /case leroys/);
  assert.match(design, /case standard/);
  assert.match(design, /static func resolve\(restaurant:/);
  assert.match(design, /static func resolve\(menu:/);
  assert.match(design, /var publicSoldOutLabel: String/);
  assert.match(design, /return "Sold Out"/);
  assert.match(design, /func showsFeaturedSpecials\(selectedType: String\) -> Bool/);
  assert.match(design, /selectedType\.lowercased\(\) == "food"/);
  assert.match(design, /var orderedMenuTypes: \[String\]/);
  assert.match(design, /\["food", "drinks"\]/);
});

test('iOS Leroy home removes decorative dock and uses hero sign background assets', () => {
  const homeViews = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');

  assert.doesNotMatch(homeViews, /\.safeAreaInset\(edge:\s*\.bottom\)\s*\{\s*HomeBottomNav/);
  assert.doesNotMatch(homeViews, /private struct HomeBottomNav/);
  assert.doesNotMatch(homeViews, /qrcode\.viewfinder/);
  assert.match(homeViews, /Image\("LeroysHeroSign"\)/);
  assert.match(homeViews, /Image\("LeroysWallBackground"\)/);
  assert.match(homeViews, /RestaurantPresentation\.resolve\(restaurant:/);
  assert.match(homeViews, /presentation\.orderedMenuTypes/);
});

test('iOS Leroy public menu is themed, food-first, and uses guest sold-out language', () => {
  const publicViews = read('ios/ElRoysManagerApp/Features/Public/PublicMenuViews.swift');

  assert.match(publicViews, /RestaurantPresentation\.resolve\(restaurant:\s*restaurant\)/);
  assert.match(publicViews, /LeroysPublicMenuView/);
  assert.match(publicViews, /LeroysSpecialsSlip/);
  assert.match(publicViews, /presentation\.showsFeaturedSpecials\(selectedType:/);
  assert.match(publicViews, /presentation\.publicSoldOutLabel/);
  assert.doesNotMatch(publicViews, /Text\("86'D"\)/);
});

test('iOS exact route preview uses SFSafariViewController instead of embedded WKWebView', () => {
  const routePreview = read('ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift');

  assert.match(routePreview, /import SafariServices/);
  assert.match(routePreview, /SFSafariViewController/);
  assert.doesNotMatch(routePreview, /import WebKit/);
  assert.doesNotMatch(routePreview, /WKWebView/);
});
```

- [ ] **Step 2: Run the source-contract tests and confirm failure**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: FAIL. The new tests should complain about missing `RestaurantPresentation`, missing Leroy's assets in home, missing `LeroysPublicMenuView`, and remaining `WKWebView`.

- [ ] **Step 3: Commit the failing tests**

Run:

```bash
git add tests/ios-source-contracts.test.cjs
git commit -m "test: add iOS Leroy theme contracts"
```

---

## Task 2: Add Leroy's iOS Asset Catalog Images

**Files:**
- Create: `ios/ElRoysManagerApp/Assets.xcassets/LeroysHeroSign.imageset/Contents.json`
- Create: `ios/ElRoysManagerApp/Assets.xcassets/LeroysHeroSign.imageset/leroys-horizontal-wood-sign.png`
- Create: `ios/ElRoysManagerApp/Assets.xcassets/LeroysWallBackground.imageset/Contents.json`
- Create: `ios/ElRoysManagerApp/Assets.xcassets/LeroysWallBackground.imageset/leroys-wall-background-ios.png`

- [ ] **Step 1: Copy the hero sign into the asset catalog**

Run:

```bash
mkdir -p ios/ElRoysManagerApp/Assets.xcassets/LeroysHeroSign.imageset
cp prototypes/leroyslounge-wall-test/assets/leroys-horizontal-wood-sign.png \
  ios/ElRoysManagerApp/Assets.xcassets/LeroysHeroSign.imageset/leroys-horizontal-wood-sign.png
```

- [ ] **Step 2: Create the hero sign Contents.json**

Create `ios/ElRoysManagerApp/Assets.xcassets/LeroysHeroSign.imageset/Contents.json` with:

```json
{
  "images": [
    {
      "filename": "leroys-horizontal-wood-sign.png",
      "idiom": "universal",
      "scale": "1x"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

- [ ] **Step 3: Create an iOS-optimized background crop**

Run:

```bash
mkdir -p ios/ElRoysManagerApp/Assets.xcassets/LeroysWallBackground.imageset
sips prototypes/leroyslounge-wall-test/assets/leroys-wall-background.png \
  --cropToHeightWidth 916 916 \
  --resampleWidth 1170 \
  --out ios/ElRoysManagerApp/Assets.xcassets/LeroysWallBackground.imageset/leroys-wall-background-ios.png
```

Expected: `sips` writes a square background image. The crop intentionally keeps the generated wood-wall material while making it safer for portrait iPhone use.

- [ ] **Step 4: Create the wall background Contents.json**

Create `ios/ElRoysManagerApp/Assets.xcassets/LeroysWallBackground.imageset/Contents.json` with:

```json
{
  "images": [
    {
      "filename": "leroys-wall-background-ios.png",
      "idiom": "universal",
      "scale": "1x"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

- [ ] **Step 5: Verify asset files exist**

Run:

```bash
find ios/ElRoysManagerApp/Assets.xcassets -maxdepth 2 -type f | rg 'Leroys(HeroSign|WallBackground)'
```

Expected output includes all four files created in this task.

- [ ] **Step 6: Commit assets**

Run:

```bash
git add ios/ElRoysManagerApp/Assets.xcassets/LeroysHeroSign.imageset \
  ios/ElRoysManagerApp/Assets.xcassets/LeroysWallBackground.imageset
git commit -m "feat: add Leroy iOS visual assets"
```

---

## Task 3: Add Focused Restaurant Presentation Tokens

**Files:**
- Modify: `ios/ElRoysManagerApp/Design/Glass.swift`

- [ ] **Step 1: Add presentation resolver and tokens**

In `ios/ElRoysManagerApp/Design/Glass.swift`, after `enum AppTypography`, add:

```swift
enum RestaurantPresentation: Equatable {
  case leroys
  case standard

  static func resolve(restaurant: RestaurantRecord?) -> RestaurantPresentation {
    guard let restaurant else { return .standard }
    return resolve(slug: restaurant.slug, id: restaurant.id)
  }

  static func resolve(menu: MenuRecord, restaurants: [RestaurantRecord] = []) -> RestaurantPresentation {
    if let restaurant = restaurants.first(where: { $0.id == menu.restaurantId }) {
      return resolve(restaurant: restaurant)
    }
    return resolve(slug: menu.slug, id: menu.restaurantId)
  }

  private static func resolve(slug: String, id: String) -> RestaurantPresentation {
    let normalizedSlug = slug.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let normalizedID = id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let leroysTokens = Set([
      "leroys-lounge",
      "leroyslounge",
      "leroys_lounge",
      "00000000-0000-0000-0000-000000000002"
    ])

    if leroysTokens.contains(normalizedSlug) || leroysTokens.contains(normalizedID) {
      return .leroys
    }
    return .standard
  }

  var isLeroys: Bool {
    self == .leroys
  }

  var orderedMenuTypes: [String] {
    switch self {
    case .leroys:
      return ["food", "drinks"]
    case .standard:
      return ["drinks", "food"]
    }
  }

  var publicSoldOutLabel: String {
    switch self {
    case .leroys:
      return "Sold Out"
    case .standard:
      return "86'D"
    }
  }

  func showsFeaturedSpecials(selectedType: String) -> Bool {
    switch self {
    case .leroys:
      return selectedType.lowercased() == "food"
    case .standard:
      return true
    }
  }
}

enum LeroysPalette {
  static let walnut = Color(red: 0.105, green: 0.067, blue: 0.039)
  static let deepWalnut = Color(red: 0.044, green: 0.031, blue: 0.022)
  static let board = Color(red: 0.075, green: 0.067, blue: 0.052)
  static let boardLift = Color(red: 0.145, green: 0.106, blue: 0.070)
  static let nicotineCream = Color(red: 0.925, green: 0.842, blue: 0.650)
  static let chalkCream = Color(red: 0.945, green: 0.886, blue: 0.730)
  static let brass = Color(red: 0.730, green: 0.510, blue: 0.210)
  static let fadedBeerRed = Color(red: 0.520, green: 0.165, blue: 0.115)
  static let tvBlue = Color(red: 0.145, green: 0.275, blue: 0.405)
  static let paper = Color(red: 0.890, green: 0.795, blue: 0.570)
  static let paperInk = Color(red: 0.160, green: 0.095, blue: 0.060)
}
```

- [ ] **Step 2: Add Leroy's reusable surface helpers**

Still in `Glass.swift`, after `struct AppBackground`, add:

```swift
struct LeroysWallBackground: View {
  var body: some View {
    ZStack {
      Image("LeroysWallBackground")
        .resizable()
        .scaledToFill()
        .overlay(LeroysPalette.deepWalnut.opacity(0.36))

      LinearGradient(
        colors: [
          .black.opacity(0.42),
          LeroysPalette.walnut.opacity(0.12),
          .black.opacity(0.58)
        ],
        startPoint: .top,
        endPoint: .bottom
      )

      FilmGrain(intensity: 0.065, seed: 241)
        .opacity(0.22)
    }
    .ignoresSafeArea()
  }
}

struct LeroysChalkboardBackground: View {
  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          LeroysPalette.boardLift,
          LeroysPalette.board,
          LeroysPalette.deepWalnut
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      RadialGradient(
        colors: [
          LeroysPalette.chalkCream.opacity(0.10),
          .clear
        ],
        center: .topLeading,
        startRadius: 20,
        endRadius: 360
      )

      FilmGrain(intensity: 0.075, seed: 304)
        .opacity(0.30)
    }
    .ignoresSafeArea()
  }
}

struct LeroysPostedCardModifier: ViewModifier {
  var borderOpacity: Double = 0.46

  func body(content: Content) -> some View {
    content
      .padding(18)
      .background(
        LinearGradient(
          colors: [
            LeroysPalette.boardLift.opacity(0.96),
            LeroysPalette.board.opacity(0.98)
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ),
        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(LeroysPalette.brass.opacity(borderOpacity), lineWidth: 1)
      }
      .shadow(color: .black.opacity(0.30), radius: 18, y: 10)
  }
}

extension View {
  func leroysPostedCard(borderOpacity: Double = 0.46) -> some View {
    modifier(LeroysPostedCardModifier(borderOpacity: borderOpacity))
  }
}
```

- [ ] **Step 3: Run source-contract tests**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: still FAIL, but failures for `RestaurantPresentation`, `publicSoldOutLabel`, `orderedMenuTypes`, and design tokens should be resolved.

- [ ] **Step 4: Commit the theme primitives**

Run:

```bash
git add ios/ElRoysManagerApp/Design/Glass.swift
git commit -m "feat: add iOS restaurant presentation tokens"
```

---

## Task 4: Replace Exact Route Preview With In-App Safari

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift`

- [ ] **Step 1: Replace WKWebView implementation**

Replace the full contents of `ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift` with:

```swift
import SafariServices
import SwiftUI

struct RoutePreviewScreen: View {
  let menu: MenuRecord
  let url: URL
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    SafariRoutePreview(url: url)
      .ignoresSafeArea()
      .navigationTitle(menu.displayTypeLabel)
      .navigationBarTitleDisplayMode(.inline)
  }
}

private struct SafariRoutePreview: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    let controller = SFSafariViewController(url: url)
    controller.dismissButtonStyle = .done
    return controller
  }

  func updateUIViewController(_ controller: SFSafariViewController, context: Context) {
  }
}
```

- [ ] **Step 2: Run source-contract tests**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: still FAIL only on home/public-menu contracts. The Safari route-preview contract should pass.

- [ ] **Step 3: Commit Safari route preview**

Run:

```bash
git add ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift
git commit -m "feat: open exact route previews in Safari sheet"
```

---

## Task 5: Apply Leroy's Landing/Home Treatment

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Home/HomeViews.swift`

- [ ] **Step 1: Add presentation resolution in `RestaurantChooserView.body`**

In `RestaurantChooserView.body`, after `let currentHomeData = homeData`, add:

```swift
let presentation = RestaurantPresentation.resolve(restaurant: restaurant)
```

Then replace:

```swift
HomeBackground(theme: theme)
```

with:

```swift
if presentation.isLeroys {
  LeroysWallBackground()
} else {
  HomeBackground(theme: theme)
}
```

- [ ] **Step 2: Pass presentation into home subviews**

Update the calls in `RestaurantChooserView.body` so the affected subviews receive `presentation`:

```swift
HomeHeader(
  theme: theme,
  presentation: presentation,
  environment: model.environment,
  onRequestAccountDeletion: { Task { await model.requestAccountDeletion() } },
  onSignOut: { model.signOut() }
)

HomeRestaurantSwitcher(
  options: restaurantSwitcherOptions,
  selectedSlug: selectedRestaurantSlug,
  theme: theme,
  presentation: presentation,
  namespace: switcherNamespace,
  onSelect: { slug in
    withAnimation(AppMotion.settle) {
      selectedRestaurantSlug = slug
      expandedUpdateID = nil
    }
  }
)

HomeEditGrid(
  theme: theme,
  presentation: presentation,
  drinksCount: currentHomeData.drinksCount,
  foodCount: currentHomeData.foodCount,
  drinksDestination: currentHomeData.drinksEditorDestination,
  foodDestination: currentHomeData.foodEditorDestination
)

HomeViewRows(
  restaurant: restaurant,
  theme: theme,
  presentation: presentation
)
```

- [ ] **Step 3: Remove the bottom dock and QR**

Delete this modifier from `RestaurantChooserView.body`:

```swift
.safeAreaInset(edge: .bottom) {
  HomeBottomNav(theme: theme, namespace: bottomNavNamespace)
    .padding(.horizontal, 16)
    .padding(.bottom, 12)
}
```

Delete these declarations:

```swift
@Namespace private var bottomNavNamespace
```

and the full bottom-nav section:

```swift
// MARK: - Bottom nav
private struct HomeBottomNav: View { ... }
private struct HomeMedallionBorder: View { ... }
private enum HomeBottomTab: String, CaseIterable, Identifiable { ... }
private struct HomeBottomBarClusterModifier: ViewModifier { ... }
private struct HomeDetachedQRButtonModifier: ViewModifier { ... }
```

Keep unrelated glass modifiers that are used elsewhere.

- [ ] **Step 4: Update `HomeHeader` for Leroy's sign**

Change `HomeHeader` to accept presentation:

```swift
private struct HomeHeader: View {
  let theme: HomeTheme
  let presentation: RestaurantPresentation
  let environment: AppEnvironment
  let onRequestAccountDeletion: () -> Void
  let onSignOut: () -> Void
```

Inside its main `HStack`, replace the existing `HomeEmblem(theme: theme)` plus title block with a conditional:

```swift
if presentation.isLeroys {
  Image("LeroysHeroSign")
    .resizable()
    .scaledToFit()
    .frame(maxWidth: 255)
    .accessibilityLabel("Leroy's Lounge")
} else {
  HomeEmblem(theme: theme)
    .accessibilityHidden(true)

  VStack(alignment: .leading, spacing: 4) {
    Text("201 SOUTH LEROY")
      .font(theme.display(19, weight: .bold))
      .tracking(theme.motif == .chevron ? 1.4 : 0.8)
      .foregroundStyle(theme.headerText)
      .lineLimit(1)
      .minimumScaleFactor(0.7)

    HomeLiveStrip(
      theme: theme,
      environment: environment
    )
  }
  .frame(maxWidth: .infinity, alignment: .leading)
}
```

For Leroy's, keep `HomeLiveStrip` below the image in the header if space allows:

```swift
if presentation.isLeroys {
  VStack(alignment: .leading, spacing: 8) {
    Image("LeroysHeroSign")
      .resizable()
      .scaledToFit()
      .frame(maxWidth: 255)
      .accessibilityLabel("Leroy's Lounge")
    HomeLiveStrip(theme: theme, environment: environment)
  }
  .frame(maxWidth: .infinity, alignment: .leading)
} else {
  ...
}
```

- [ ] **Step 5: Make the switcher 50/50 with a Leroy's-styled half**

Update `HomeRestaurantSwitcher` signature:

```swift
let presentation: RestaurantPresentation
```

Inside each option button, derive whether the option is Leroy's:

```swift
let optionPresentation = RestaurantPresentation.resolve(
  restaurant: RestaurantRecord(id: option.slug, slug: option.slug, name: option.label, canAccess: nil, design: nil, useCustomDesign: nil)
)
```

For the label background, wrap the existing label in:

```swift
.background {
  if optionPresentation.isLeroys {
    RoundedRectangle(cornerRadius: 14, style: .continuous)
      .fill(LeroysPalette.board.opacity(isSelected ? 0.72 : 0.34))
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(LeroysPalette.brass.opacity(isSelected ? 0.58 : 0.22), lineWidth: 1)
      }
  }
}
```

Keep the El Roy's half using existing text and divider treatment. Do not redesign El Roy's.

- [ ] **Step 6: Make Leroy's home shortcuts food-first**

In `HomeEditGrid`, add:

```swift
let presentation: RestaurantPresentation
```

Replace the hard-coded `HStack` tile order with:

```swift
let tiles: [(type: String, destination: AppDestination?, tile: HomeEditTile)] = [
  (
    "drinks",
    drinksDestination,
    HomeEditTile(
      chapter: "VOL. 01",
      kind: presentation.isLeroys ? "DRINKS" : (theme.motif == .chevron ? "LIQUID" : "BEBIDAS"),
      title: "Edit Drinks",
      countLabel: countLabel(for: drinksCount),
      icon: "wineglass.fill",
      theme: theme
    )
  ),
  (
    "food",
    foodDestination,
    HomeEditTile(
      chapter: "VOL. 02",
      kind: presentation.isLeroys ? "FOOD" : (theme.motif == .chevron ? "PLATES" : "COCINA"),
      title: "Edit Food",
      countLabel: countLabel(for: foodCount),
      icon: "fork.knife",
      theme: theme
    )
  )
].sorted { lhs, rhs in
  presentation.orderedMenuTypes.firstIndex(of: lhs.type) ?? 99 <
    presentation.orderedMenuTypes.firstIndex(of: rhs.type) ?? 99
}

HStack(spacing: 12) {
  ForEach(tiles, id: \.type) { entry in
    editTile(action: entry.destination, tile: entry.tile)
  }
}
```

In `HomeViewRows`, add `presentation` and render rows by `presentation.orderedMenuTypes`:

```swift
ForEach(presentation.orderedMenuTypes, id: \.self) { type in
  row(
    destination: restaurant.map { AppDestination.publicMenu($0, initialType: type) },
    label: type == "food" ? "View Food" : "View Drinks",
    icon: type == "food" ? "fork.knife" : "wineglass"
  )
}
```

- [ ] **Step 7: Run source-contract tests**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: still FAIL only on public-menu contracts. Home contracts should pass.

- [ ] **Step 8: Commit home changes**

Run:

```bash
git add ios/ElRoysManagerApp/Features/Home/HomeViews.swift
git commit -m "feat: theme Leroy iOS home"
```

---

## Task 6: Add Leroy's Native Public Menu View

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Public/PublicMenuViews.swift`

- [ ] **Step 1: Resolve presentation and branch the public menu body**

In `PublicMenuScreen.body`, add:

```swift
let presentation = RestaurantPresentation.resolve(restaurant: restaurant)
```

Then wrap the existing `ScrollView` body:

```swift
Group {
  if presentation.isLeroys {
    LeroysPublicMenuView(
      restaurant: restaurant,
      selectedType: $selectedType,
      menuForType: menuForType,
      sessionForMenu: sessionForMenu,
      presentation: presentation
    )
  } else {
    standardBody
  }
}
.navigationTitle(restaurant.name)
.navigationBarTitleDisplayMode(.inline)
.task(id: session?.menu.id) {
  guard let session else { return }
  await session.load()
}
```

Move the existing `ScrollView` into a private computed property named `standardBody`.

- [ ] **Step 2: Make menu type options presentation-aware**

Add this helper inside `PublicMenuScreen`:

```swift
private var menuTypeOptions: [String] {
  RestaurantPresentation.resolve(restaurant: restaurant).orderedMenuTypes
}
```

Use `menuTypeOptions` for Leroy's segmented controls and keep the current `["drinks", "food"]` behavior in `standardBody` if needed for El Roy's.

- [ ] **Step 3: Add the Leroy's public menu wrapper**

Append this private view to `PublicMenuViews.swift`:

```swift
private struct LeroysPublicMenuView: View {
  let restaurant: RestaurantRecord
  @Binding var selectedType: String
  let menuForType: (String) -> MenuRecord?
  let sessionForMenu: (MenuRecord) -> PublicMenuSession
  let presentation: RestaurantPresentation

  private var selectedMenu: MenuRecord? {
    menuForType(selectedType)
  }

  private var selectedSession: PublicMenuSession? {
    selectedMenu.map(sessionForMenu)
  }

  var body: some View {
    let session = selectedSession

    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 18) {
        LeroysPublicMenuHero(
          selectedType: $selectedType,
          options: presentation.orderedMenuTypes
        )
        .appEntryReveal()

        if let notice = session?.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.05)
        }

        if let payload = session?.payload {
          if presentation.showsFeaturedSpecials(selectedType: selectedType),
             !payload.featuredItems.isEmpty {
            LeroysSpecialsSlip(items: payload.featuredItems)
              .appEntryReveal(delay: 0.08)
          }

          ForEach(Array(payload.cats.enumerated()), id: \.element.id) { index, category in
            LeroysMenuCategoryCard(
              category: category,
              soldOutLabel: presentation.publicSoldOutLabel
            )
            .appEntryReveal(delay: 0.12 + (Double(index) * 0.035))
          }
        } else {
          AppLoadingCard(
            title: "Loading Leroy's menu",
            subtitle: "Pulling the latest posted board.",
            tint: LeroysPalette.brass
          )
          .appEntryReveal(delay: 0.08)
        }

        Color.clear.frame(height: 24)
      }
      .padding(.horizontal, 20)
      .padding(.top, 20)
      .padding(.bottom, 24)
    }
    .background {
      LeroysChalkboardBackground()
    }
  }
}
```

- [ ] **Step 4: Add Leroy's hero/segmented control**

Append:

```swift
private struct LeroysPublicMenuHero: View {
  @Binding var selectedType: String
  let options: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Image("LeroysHeroSign")
        .resizable()
        .scaledToFit()
        .frame(maxWidth: 280)
        .accessibilityLabel("Leroy's Lounge")

      HStack(spacing: 8) {
        ForEach(options, id: \.self) { type in
          let isSelected = selectedType == type
          Button {
            withAnimation(AppMotion.snap) {
              selectedType = type
            }
          } label: {
            Text(type.uppercased())
              .font(.system(size: 13, weight: .bold, design: .monospaced))
              .tracking(2.2)
              .foregroundStyle(isSelected ? LeroysPalette.deepWalnut : LeroysPalette.chalkCream)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 13)
              .background(
                isSelected ? LeroysPalette.nicotineCream : LeroysPalette.board,
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                  .stroke(LeroysPalette.brass.opacity(isSelected ? 0.72 : 0.34), lineWidth: 1)
              }
          }
          .buttonStyle(.plain)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .leroysPostedCard(borderOpacity: 0.52)
  }
}
```

- [ ] **Step 5: Add food-only specials slip**

Append:

```swift
private struct LeroysSpecialsSlip: View {
  let items: [MenuItemPayload]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("TONIGHT'S SPECIAL")
        .font(.system(size: 11, weight: .black, design: .monospaced))
        .tracking(2.1)
        .foregroundStyle(LeroysPalette.paperInk.opacity(0.78))

      ForEach(items.prefix(2)) { item in
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          Text(item.name)
            .font(.system(size: 18, weight: .black, design: .serif))
            .foregroundStyle(LeroysPalette.paperInk)
            .strikethrough(item.isEightySixed)
          Spacer(minLength: 10)
          if !item.price.isEmpty {
            Text(item.price)
              .font(.system(size: 15, weight: .bold, design: .serif))
              .foregroundStyle(LeroysPalette.paperInk)
          }
        }
        if item.showDescription, !item.desc.isEmpty {
          Text(item.desc)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(LeroysPalette.paperInk.opacity(0.72))
        }
      }
    }
    .padding(16)
    .background(LeroysPalette.paper, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .rotationEffect(.degrees(-0.6))
    .shadow(color: .black.opacity(0.22), radius: 12, y: 6)
  }
}
```

- [ ] **Step 6: Add Leroy's category and item rows**

Append:

```swift
private struct LeroysMenuCategoryCard: View {
  let category: MenuCategoryPayload
  let soldOutLabel: String

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 5) {
        Text(category.label.uppercased())
          .font(.system(size: 23, weight: .black, design: .serif))
          .tracking(1.2)
          .foregroundStyle(LeroysPalette.brass)
        if !category.sub.isEmpty {
          Text(category.sub)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(LeroysPalette.chalkCream.opacity(0.72))
        }
      }

      Rectangle()
        .fill(LeroysPalette.brass.opacity(0.55))
        .frame(height: 1.5)

      ForEach(category.items.filter(\.onMenu)) { item in
        LeroysMenuItemRow(item: item, soldOutLabel: soldOutLabel)
      }
    }
    .leroysPostedCard()
  }
}

private struct LeroysMenuItemRow: View {
  let item: MenuItemPayload
  let soldOutLabel: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 8) {
            Text(item.name)
              .font(.system(size: 17, weight: .bold, design: .serif))
              .foregroundStyle(LeroysPalette.chalkCream)
              .strikethrough(item.isEightySixed, color: LeroysPalette.fadedBeerRed)

            if item.isEightySixed {
              Text(soldOutLabel.uppercased())
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .tracking(1.4)
                .padding(.vertical, 4)
                .padding(.horizontal, 7)
                .background(LeroysPalette.fadedBeerRed.opacity(0.24), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                .overlay {
                  RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .stroke(LeroysPalette.fadedBeerRed.opacity(0.68), lineWidth: 1)
                }
                .foregroundStyle(LeroysPalette.chalkCream)
            }
          }

          if item.showDescription, !item.desc.isEmpty {
            Text(item.desc)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .foregroundStyle(LeroysPalette.chalkCream.opacity(0.68))
              .fixedSize(horizontal: false, vertical: true)
          }
        }

        Spacer(minLength: 12)

        Text(item.price.isEmpty ? "--" : item.price)
          .font(.system(size: 15, weight: .black, design: .serif))
          .foregroundStyle(LeroysPalette.brass)
      }

      if item.showRecipe, !item.recipe.isEmpty {
        Text(item.recipe.joined(separator: " • "))
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(LeroysPalette.brass.opacity(0.82))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(.vertical, 10)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(LeroysPalette.chalkCream.opacity(0.14))
        .frame(height: 1)
    }
  }
}
```

- [ ] **Step 7: Run source-contract tests**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit public menu changes**

Run:

```bash
git add ios/ElRoysManagerApp/Features/Public/PublicMenuViews.swift
git commit -m "feat: theme Leroy public menu"
```

---

## Task 7: Build And Runtime Verification

**Files:**
- Read/verify: `ios/ElRoysManagerApp.xcodeproj`
- Read/verify: `tests/ios-source-contracts.test.cjs`

- [ ] **Step 1: Run source-contract tests**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Build the iOS app**

Run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'generic/platform=iOS Simulator' \
  build
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: If the generic simulator destination is unavailable, list destinations**

Run only if Step 2 fails because of destination selection:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -showdestinations
```

Then rerun the build with the first available iOS Simulator destination, for example:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj \
  -scheme ElRoysManagerApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  build
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Manual simulator smoke check**

Run the app in Xcode or from the built simulator target and verify:

- Leroy's home has the wood sign and wood wall background.
- Leroy's home has no bottom Home/Updates/Tools/Settings dock and no detached QR button.
- Leroy's edit/view shortcuts show Food before Drinks.
- Tapping View Food opens Food.
- Tapping View Drinks opens Drinks.
- Switching to El Roy's leaves the current El Roy's visual treatment intact.
- Leroy's native public Food menu uses chalkboard/posted-card styling.
- Leroy's native public Food can show the taped specials slip.
- Leroy's native public Drinks does not show a specials slip.
- Public sold-out Leroy's items say `Sold Out`.
- Staff editor surfaces still use existing generic styling and staff shorthand.
- Exact route preview opens the deployed route in an in-app Safari sheet with a Done button.

- [ ] **Step 5: Commit verification-only fixes if needed**

If the build or smoke check reveals minor fixes, commit them with:

```bash
git add ios/ElRoysManagerApp tests/ios-source-contracts.test.cjs
git commit -m "fix: verify Leroy iOS themed surfaces"
```

If no fixes are needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Leroy's home redesign: Task 5.
  - Leroy's native public menu redesign: Task 6.
  - Focused theme resolver: Task 3.
  - Food-first Leroy's ordering with route intent preserved: Tasks 5 and 6.
  - Public `Sold Out`: Tasks 3 and 6.
  - Food-only specials: Tasks 3 and 6.
  - `SFSafariViewController`: Task 4.
  - iOS assets: Task 2.
  - Staff/editor pages left generic: Task 7 smoke checklist.

- Placeholder scan:
  - No TBD/TODO placeholders.
  - Each implementation task includes exact files, code, commands, and expected results.

- Type consistency:
  - `RestaurantPresentation`, `LeroysPalette`, `LeroysWallBackground`, `LeroysChalkboardBackground`, and `leroysPostedCard` are introduced before use.
  - `presentation.orderedMenuTypes`, `presentation.publicSoldOutLabel`, and `presentation.showsFeaturedSpecials(selectedType:)` match the signatures introduced in Task 3.
