# iOS Category Tools And Reorder Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move category add/rename/delete/reorder work out of the main menu editor and into restaurant tools, while making the item-level `Reorder` / `Done Reordering` control directly visible on each menu category card.

**Architecture:** Keep all category mutations on the existing editor draft/save/send pipeline instead of inventing a second persistence flow. Add a dedicated category-management screen that is launched from restaurant tools for the currently selected drinks or food menu, then simplify the standard menu editor so it focuses on item editing and exposes item reordering with a visible button instead of an overflow menu.

**Tech Stack:** SwiftUI, Observation (`@Observable`, `@Bindable`), XCTest, `xcodebuild`.

---

## File Map

- Modify: `ios/ElRoysManagerApp/App/ElRoysManagerApp.swift`
  - Add a new navigation destination for category management under restaurant tools.
- Modify: `ios/ElRoysManagerApp/App/AppModel.swift`
  - Expose a public wrapper for visible category reordering so the new screen can reuse the existing editable document mutations.
- Create: `ios/ElRoysManagerApp/Features/Menu/RestaurantCategoryManagementView.swift`
  - Add a dedicated category-management screen that loads the selected menu into the existing editor pipeline and provides add/rename/delete/reorder plus save/send/discard actions.
- Modify: `ios/ElRoysManagerApp/Features/RestaurantTools/RestaurantToolsView.swift`
  - Add the visible entry point that launches category management for the segmented drinks/food menu.
- Modify: `ios/ElRoysManagerApp/Features/Menu/MenuViews.swift`
  - Remove category-management affordances from the standard editor and replace the overflow-only reorder action with a visible button.
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`
  - Lock the new route entry point, category reorder mutation, and visible reorder affordance with focused tests and source assertions.
- Create: `docs/superpowers/plans/2026-04-20-ios-category-tools-and-reorder-controls.md`
  - This implementation plan.

## Task 1: Lock The New UX Contract With Failing Tests

**Files:**
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`
- Test: `ios/ElRoysManagerApp/App/ElRoysManagerApp.swift`
- Test: `ios/ElRoysManagerApp/Features/RestaurantTools/RestaurantToolsView.swift`
- Test: `ios/ElRoysManagerApp/Features/Menu/MenuViews.swift`

- [ ] **Step 1: Add the focused tests and helper source URLs**

Add these tests near the existing menu-editor source assertions, then add the two helper URL functions alongside the other `*SourceURL()` helpers at the bottom of the file.

```swift
  func testEditableDocumentMovesVisibleCategoriesAndKeepsRecoveryBucketLast() {
    let workspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      ),
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 1,
        items: [makeItem(id: "item-2", name: "Orange Wine")]
      ),
      MenuCategoryPayload(
        id: "uncategorized",
        menuId: "menu",
        key: EditableMenuDocument.uncategorizedKey,
        label: "Uncategorized",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 2,
        items: []
      )
    ])

    var document = EditableMenuDocument(workspace: workspace)
    document.moveVisibleCategories(from: IndexSet(integer: 0), to: 2)

    XCTAssertEqual(document.visibleCategories.map(\.key), ["wine", "beer"])
    XCTAssertEqual(document.visibleCategories.map(\.displayOrder), [0, 1])
    XCTAssertEqual(document.cats.last?.key, EditableMenuDocument.uncategorizedKey)
  }

  func testRestaurantToolsProvidesCategoryManagementEntryPoint() throws {
    let toolsSource = try String(contentsOf: restaurantToolsSourceURL(), encoding: .utf8)
    let appSource = try String(contentsOf: appEntrySourceURL(), encoding: .utf8)

    XCTAssertTrue(toolsSource.contains("Manage Categories"))
    XCTAssertTrue(appSource.contains("case categoryTools(MenuRecord)"))
    XCTAssertTrue(appSource.contains("RestaurantCategoryManagementScreen"))
  }

  func testMenuEditorCategoryCardUsesVisibleReorderButtonInsteadOfOverflowMenu() throws {
    let source = try String(contentsOf: menuViewsSourceURL(), encoding: .utf8)
    let cardRange = try XCTUnwrap(source.range(of: "private struct MenuEditorCategoryCard"))
    let swipeRange = try XCTUnwrap(source.range(of: "private struct MenuEditorSwipeList"))
    let cardSource = String(source[cardRange.lowerBound..<swipeRange.lowerBound])

    XCTAssertTrue(cardSource.contains("Button(action: onToggleReorder)"))
    XCTAssertTrue(cardSource.contains("Done Reordering"))
    XCTAssertFalse(cardSource.contains("Menu {"))
    XCTAssertFalse(cardSource.contains("ellipsis.circle.fill"))
  }
```

```swift
private func restaurantToolsSourceURL(filePath: StaticString = #filePath) -> URL {
  URL(fileURLWithPath: "\(filePath)")
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("ElRoysManagerApp/Features/RestaurantTools/RestaurantToolsView.swift")
}

private func appEntrySourceURL(filePath: StaticString = #filePath) -> URL {
  URL(fileURLWithPath: "\(filePath)")
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("ElRoysManagerApp/App/ElRoysManagerApp.swift")
}
```

- [ ] **Step 2: Run the focused tests to confirm the new source assertions fail**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testEditableDocumentMovesVisibleCategoriesAndKeepsRecoveryBucketLast -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testRestaurantToolsProvidesCategoryManagementEntryPoint -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testMenuEditorCategoryCardUsesVisibleReorderButtonInsteadOfOverflowMenu
```

Expected:

```text
testEditableDocumentMovesVisibleCategoriesAndKeepsRecoveryBucketLast ... passed
testRestaurantToolsProvidesCategoryManagementEntryPoint ... failed
testMenuEditorCategoryCardUsesVisibleReorderButtonInsteadOfOverflowMenu ... failed
```

- [ ] **Step 3: Commit the failing contract tests**

```bash
git add ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "test: lock iOS category tools UX contract"
```

## Task 2: Add The Category-Tools Route And Category Reorder Hook

**Files:**
- Modify: `ios/ElRoysManagerApp/App/ElRoysManagerApp.swift`
- Modify: `ios/ElRoysManagerApp/App/AppModel.swift`
- Create: `ios/ElRoysManagerApp/Features/Menu/RestaurantCategoryManagementView.swift`
- Test: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Create a compileable category-management screen stub**

Start with a minimal screen so the new destination can compile before the UI is fleshed out.

```swift
import SwiftUI

struct RestaurantCategoryManagementScreen: View {
  @Bindable var model: AppModel
  let menu: MenuRecord

  var body: some View {
    Text("\(menu.displayTypeLabel) Categories")
      .font(.title.weight(.bold))
      .padding()
  }
}
```

- [ ] **Step 2: Add the new app destination and route it to the screen**

Update the destination enum and navigation switch.

```swift
enum AppDestination: Hashable {
  case restaurantHub(RestaurantRecord)
  case publicMenu(RestaurantRecord, initialType: String)
  case editor(MenuRecord)
  case restaurantTools(RestaurantRecord)
  case categoryTools(MenuRecord)
  case routePreview(MenuRecord)
}
```

```swift
              case .categoryTools(let menu):
                RestaurantCategoryManagementScreen(model: model, menu: menu)
```

- [ ] **Step 3: Expose the visible-category reorder mutation through `AppModel`**

Add the public wrapper next to the existing item-reorder method so the new screen does not reach into `EditableMenuDocument` directly.

```swift
  func moveVisibleCategories(from source: IndexSet, to destination: Int) {
    guard canEditCategories else { return }
    mutateEditorDocument { $0.moveVisibleCategories(from: source, to: destination) }
  }
```

- [ ] **Step 4: Build to verify the new route and stub compile**

Run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'generic/platform=iOS Simulator' build
```

Expected:

```text
** BUILD SUCCEEDED **
```

- [ ] **Step 5: Commit the route and model plumbing**

```bash
git add ios/ElRoysManagerApp/App/ElRoysManagerApp.swift ios/ElRoysManagerApp/App/AppModel.swift ios/ElRoysManagerApp/Features/Menu/RestaurantCategoryManagementView.swift
git commit -m "feat: add iOS category tools route"
```

## Task 3: Build The Dedicated Category-Management Screen

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Menu/RestaurantCategoryManagementView.swift`
- Test: `ios/ElRoysManagerApp/App/AppModel.swift`

- [ ] **Step 1: Replace the stub with the real screen shell and editor loading**

Use the existing editor pipeline so category edits retain draft persistence, save quietly, and send-preview behavior.

```swift
import SwiftUI

struct RestaurantCategoryManagementScreen: View {
  @Bindable var model: AppModel
  let menu: MenuRecord

  @State private var addCategoryName = ""
  @State private var renameTarget: MenuCategoryPayload?
  @State private var renameText = ""
  @State private var isReordering = false
  @State private var showingAddCategory = false
  @State private var showingDiscardDraftConfirm = false
  @State private var showingPreview = false

  private var accent: Color {
    menu.isFoodMenu ? AppPalette.jade : AppPalette.bloodOrange
  }

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 18) {
        AppSectionHeader(
          eyebrow: "Restaurant tools",
          title: "\(menu.displayTypeLabel) categories",
          subtitle: "Add, rename, delete, and reorder categories without leaving the staff tools flow.",
          tint: accent
        )

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        categoryActions

        if let document = model.currentEditorDocument {
          categoryList(document.visibleCategories)
        } else {
          AppLoadingCard(
            title: "Loading categories",
            subtitle: "Preparing the live workspace, local draft state, and category structure.",
            tint: accent
          )
        }
      }
      .padding(24)
    }
    .navigationTitle("\(menu.displayTypeLabel) Categories")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: menu.id) {
      await model.loadEditor(menuId: menu.id)
    }
```

- [ ] **Step 2: Add the category action row, alerts, and preview sheet**

Use the same `AppModel` methods the standard editor already trusts.

```swift
    .sheet(isPresented: $showingPreview) {
      if let preview = model.currentEditorPreview {
        RestaurantCategoryPublishPreviewSheet(
          model: model,
          preview: preview,
          accent: accent,
          onPublish: {
            Task {
              await model.publishSelectedChanges()
              showingPreview = false
            }
          }
        )
      } else {
        ProgressView("Loading preview…")
          .presentationDetents([.medium])
      }
    }
    .alert("Add Category", isPresented: $showingAddCategory) {
      TextField("Category name", text: $addCategoryName)
      Button("Add") {
        model.addCategory(label: addCategoryName)
        addCategoryName = ""
      }
      Button("Cancel", role: .cancel) {
        addCategoryName = ""
      }
    }
    .alert("Rename Category", isPresented: Binding(
      get: { renameTarget != nil },
      set: { if !$0 { renameTarget = nil } }
    )) {
      TextField("Category name", text: $renameText)
      Button("Save") {
        if let target = renameTarget {
          model.renameCategory(key: target.key, label: renameText)
        }
      }
      Button("Cancel", role: .cancel) {}
    }
    .alert("Discard Local Draft?", isPresented: $showingDiscardDraftConfirm) {
      Button("Discard Draft", role: .destructive) {
        model.discardLocalDraft()
      }
      Button("Keep Editing", role: .cancel) {}
    } message: {
      Text("This only removes unsaved edits from this device and does not modify the shared server queue.")
    }
  }

  private var categoryActions: some View {
    VStack(alignment: .leading, spacing: 12) {
      Button("Add Category") { showingAddCategory = true }
        .buttonStyle(PrimaryGlassButtonStyle())

      HStack(spacing: 12) {
        Button("Save Quietly") {
          Task { await model.saveLiveMenu() }
        }
        .buttonStyle(SecondaryGlassButtonStyle())
        .disabled(!model.canSaveQuietlyRemotely)

        Button(model.hasLocalDraftChanges ? "Save & Send" : "Send Update") {
          Task {
            await model.loadPublishPreview()
            showingPreview = model.currentEditorPreview != nil
          }
        }
        .buttonStyle(SecondaryGlassButtonStyle())
        .disabled(!model.canLoadPublishPreview)

        Button("Discard Draft") {
          showingDiscardDraftConfirm = true
        }
        .buttonStyle(SecondaryGlassButtonStyle())
        .disabled(!model.canDiscardLocalDraft)
      }
    }
    .appGlassCard(tint: accent, cornerRadius: 28)
  }
```

- [ ] **Step 3: Add the category list, direct reorder toggle, and preview sheet view**

Keep category reorder visible on this screen too, and wire it through the new `AppModel.moveVisibleCategories(from:to:)` wrapper.

```swift
  @ViewBuilder
  private func categoryList(_ categories: [MenuCategoryPayload]) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Categories")
          .font(AppTypography.display(24, weight: .bold))
          .foregroundStyle(AppPalette.ink)

        Spacer()

        if categories.count > 1 || isReordering {
          Button(isReordering ? "Done Reordering" : "Reorder Categories") {
            isReordering.toggle()
          }
          .buttonStyle(SecondaryGlassButtonStyle())
          .tint(accent)
        }
      }

      List {
        ForEach(categories) { category in
          HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
              Text(category.label)
                .font(AppTypography.body(16, weight: .bold))
              Text("\(category.items.filter(\\.onMenu).count) live items")
                .font(AppTypography.body(12, weight: .medium))
                .foregroundStyle(.secondary)
            }

            Spacer()

            if !isReordering {
              Button("Rename") {
                renameTarget = category
                renameText = category.label
              }
              .buttonStyle(SecondaryGlassButtonStyle())

              Button("Delete", role: .destructive) {
                model.deleteCategory(key: category.key)
              }
              .buttonStyle(SecondaryGlassButtonStyle())
            }
          }
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .moveDisabled(!isReordering)
        }
        .onMove(perform: model.moveVisibleCategories)
      }
      .environment(\\.editMode, .constant(isReordering ? .active : .inactive))
      .listStyle(.plain)
      .frame(height: max(CGFloat(categories.count) * 72, 88))
    }
    .appGlassCard(tint: accent, cornerRadius: 30)
  }
}

private struct RestaurantCategoryPublishPreviewSheet: View {
  @Bindable var model: AppModel
  let preview: MenuPreviewPayload
  let accent: Color
  let onPublish: () -> Void
  @Environment(\\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Text(preview.patchMessage.isEmpty ? "Review the queued category changes before sending." : preview.patchMessage)
            .font(AppTypography.body(14, weight: .medium))

          ForEach(preview.sections) { section in
            VStack(alignment: .leading, spacing: 10) {
              Text(section.label)
                .font(AppTypography.body(16, weight: .bold))
              ForEach(section.changes) { change in
                Toggle(
                  isOn: Binding(
                    get: { model.selectedPreviewChangeIDs.contains(change.id) },
                    set: { model.updatePreviewSelection(change.id, selected: $0) }
                  )
                ) {
                  Text(change.text)
                }
                .tint(accent)
              }
            }
            .appFieldChrome(tint: accent, cornerRadius: 20)
          }
        }
        .padding(24)
      }
      .navigationTitle("Send Preview")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(preview.hasNotificationChanges ? "Send Update" : "Save Changes", action: onPublish)
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run the focused tests again**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testEditableDocumentMovesVisibleCategoriesAndKeepsRecoveryBucketLast -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testRestaurantToolsProvidesCategoryManagementEntryPoint
```

Expected:

```text
Both tests pass, but the visible reorder-button test still fails until the standard menu editor is updated.
```

- [ ] **Step 5: Commit the dedicated category-management screen**

```bash
git add ios/ElRoysManagerApp/Features/Menu/RestaurantCategoryManagementView.swift ios/ElRoysManagerApp/App/AppModel.swift ios/ElRoysManagerApp/App/ElRoysManagerApp.swift
git commit -m "feat: add iOS category management screen"
```

## Task 4: Launch Category Management From Restaurant Tools And Remove It From The Standard Editor

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/RestaurantTools/RestaurantToolsView.swift`
- Modify: `ios/ElRoysManagerApp/Features/Menu/MenuViews.swift`
- Test: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Add the visible restaurant-tools entry point for the selected menu**

Place this directly below the drinks/food segmented control so staff can reach category management without opening a menu editor first.

```swift
      if let menu = model.menu(for: restaurant.id, type: selectedType) {
        NavigationLink(value: AppDestination.categoryTools(menu)) {
          AppIslandButtonLabel(
            title: "Manage Categories",
            subtitle: "Add, rename, delete, and reorder \(menu.displayTypeLabel.lowercased()) categories.",
            systemImage: "square.split.1x2.fill"
          )
        }
        .buttonStyle(.plain)
        .appPillChrome(accent: accent)
      }
```

- [ ] **Step 2: Remove category add/rename/delete controls from the standard menu editor**

Strip the category-management state and alerts from `MenuEditorScreen`, then turn the categories header into a read-only note.

```swift
private struct MenuEditorCategoriesHeader: View {
  let theme: MenuEditorTheme

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Menu Items")
        .font(EditorTypography.display(20, weight: .bold))
        .foregroundStyle(theme.titleText)
      Text("Categories are managed from Restaurant Tools.")
        .font(EditorTypography.body(12, weight: .medium))
        .foregroundStyle(theme.subtleText)
    }
  }
}
```

Remove these state properties and the related alert blocks from `MenuEditorScreen`:

```swift
  @State private var addCategoryName = ""
  @State private var showingAddCategory = false
  @State private var renameTarget: MenuCategoryPayload?
  @State private var renameText = ""
```

Update the category-card initializer usage so the standard editor no longer passes rename/delete closures:

```swift
              MenuEditorCategoryCard(
                menu: menu,
                category: category,
                theme: theme,
                menuAccent: menuAccent,
                onSelectItem: { item in
                  reorderingCategoryKey = nil
                  editingDraft = EditableItemDraft(item: item, categoryKey: category.key, isFoodMenu: menu.isFoodMenu)
                  activeSheet = .itemEditor
                },
                onToggleEightySix: { item in
                  model.setItemEightySixed(
                    itemID: item.id,
                    categoryKey: category.key,
                    isEightySixed: !item.isEightySixed
                  )
                },
                isReordering: reorderingCategoryKey == category.key,
                onToggleReorder: {
                  reorderingCategoryKey = reorderingCategoryKey == category.key ? nil : category.key
                },
                onMoveVisibleItems: { source, destination in
                  model.moveVisibleItems(in: category.key, from: source, to: destination)
                }
              )
```

- [ ] **Step 3: Update the no-category warning so it points staff to restaurant tools**

Keep the guard, but change the notice copy so the new workflow is discoverable.

```swift
      model.notice = AppNotice(
        tone: .warning,
        title: "Add A Category First",
        message: "Create at least one category in Restaurant Tools before adding menu items."
      )
```

- [ ] **Step 4: Run the category-entry test to confirm the restaurant-tools route is now discoverable**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testRestaurantToolsProvidesCategoryManagementEntryPoint
```

Expected:

```text
testRestaurantToolsProvidesCategoryManagementEntryPoint ... passed
```

- [ ] **Step 5: Commit the workflow relocation**

```bash
git add ios/ElRoysManagerApp/Features/RestaurantTools/RestaurantToolsView.swift ios/ElRoysManagerApp/Features/Menu/MenuViews.swift
git commit -m "feat: move iOS category management into restaurant tools"
```

## Task 5: Make Reorder Controls Visible In The Standard Menu Editor And Verify The Feature End To End

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Menu/MenuViews.swift`
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`
- Test: `ios/ElRoysManagerApp.xcodeproj`

- [ ] **Step 1: Replace the overflow-only reorder action with a visible button**

Update the category-card header so the reorder control is always visible when it can be used. Remove the overflow menu entirely.

```swift
private struct MenuEditorCategoryCard: View {
  let menu: MenuRecord
  let category: MenuCategoryPayload
  let theme: MenuEditorTheme
  let menuAccent: Color
  let onSelectItem: (MenuItemPayload) -> Void
  let onToggleEightySix: (MenuItemPayload) -> Void
  let isReordering: Bool
  let onToggleReorder: () -> Void
  let onMoveVisibleItems: (IndexSet, Int) -> Void

  private var visibleItems: [MenuItemPayload] {
    category.items.filter(\\.onMenu)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(category.label)
            .font(EditorTypography.display(22, weight: .bold))
            .foregroundStyle(theme.titleText)
          if !category.sub.isEmpty {
            Text(category.sub)
              .font(EditorTypography.body(13))
              .foregroundStyle(theme.subtleText)
          }
        }

        Spacer()

        Text("\(visibleItems.count)")
          .font(EditorTypography.body(12, weight: .bold))
          .padding(.vertical, 6)
          .padding(.horizontal, 8)
          .background(menuAccent.opacity(0.15), in: Capsule())
          .foregroundStyle(menuAccent)

        if visibleItems.count > 1 || isReordering {
          Button(action: onToggleReorder) {
            Label(
              isReordering ? "Done Reordering" : "Reorder",
              systemImage: isReordering ? "checkmark.circle.fill" : "arrow.up.arrow.down.circle.fill"
            )
          }
          .buttonStyle(SecondaryGlassButtonStyle())
          .tint(menuAccent)
        }
      }
```

- [ ] **Step 2: Update the source assertion to match the visible-button contract**

Replace the older category-card source assertion with the final expectation.

```swift
  func testMenuEditorCategoryCardUsesVisibleReorderButtonInsteadOfOverflowMenu() throws {
    let source = try String(contentsOf: menuViewsSourceURL(), encoding: .utf8)
    let cardRange = try XCTUnwrap(source.range(of: "private struct MenuEditorCategoryCard"))
    let swipeRange = try XCTUnwrap(source.range(of: "private struct MenuEditorSwipeList"))
    let cardSource = String(source[cardRange.lowerBound..<swipeRange.lowerBound])

    XCTAssertTrue(cardSource.contains("Button(action: onToggleReorder)"))
    XCTAssertTrue(cardSource.contains("Done Reordering"))
    XCTAssertFalse(cardSource.contains("Menu {"))
    XCTAssertFalse(cardSource.contains("ellipsis.circle.fill"))
  }
```

- [ ] **Step 3: Run the focused tests and the full native build**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testEditableDocumentMovesVisibleCategoriesAndKeepsRecoveryBucketLast -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testRestaurantToolsProvidesCategoryManagementEntryPoint -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testMenuEditorCategoryCardUsesVisibleReorderButtonInsteadOfOverflowMenu
```

Expected:

```text
All three focused tests pass.
```

Run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'generic/platform=iOS Simulator' build
```

Expected:

```text
** BUILD SUCCEEDED **
```

- [ ] **Step 4: Commit the visible reorder-control update**

```bash
git add ios/ElRoysManagerApp/Features/Menu/MenuViews.swift ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "feat: expose iOS reorder controls in menu editor"
```

## Self-Review

- Spec coverage: category management relocation is handled by Tasks 2 through 4; visible `Reorder` / `Done Reordering` controls are handled by Task 5; no requested behavior is uncovered.
- Placeholder scan: no `TODO`, `TBD`, or “similar to” references remain.
- Type consistency: the plan consistently uses `AppDestination.categoryTools(MenuRecord)`, `RestaurantCategoryManagementScreen`, and `moveVisibleCategories(from:to:)`.
