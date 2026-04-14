import XCTest
@testable import ElRoysManagerApp

final class MenuDocumentTests: XCTestCase {
  func testDeleteCategoryMovesItemsToOffMenuRecovery() {
    let workspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [
          makeItem(id: "item-1", name: "Orange Wine")
        ]
      )
    ])

    var document = EditableMenuDocument(workspace: workspace)
    document.deleteCategory(key: "wine")

    XCTAssertTrue(document.visibleCategories.isEmpty)
    XCTAssertEqual(document.uncategorizedItems.count, 1)
    XCTAssertFalse(document.uncategorizedItems[0].onMenu)
  }

  func testDuplicateDetectionIgnoresCurrentItemButBlocksMatchingSibling() {
    let workspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [
          makeItem(id: "item-1", name: "Orange Wine"),
          makeItem(id: "item-2", name: "Red Blend")
        ]
      )
    ])

    let document = EditableMenuDocument(workspace: workspace)

    XCTAssertFalse(document.hasDuplicate(named: "Orange Wine", in: "wine", excluding: "item-1"))
    XCTAssertTrue(document.hasDuplicate(named: "Orange Wine", in: "wine"))
    XCTAssertFalse(document.hasDuplicate(named: "Orange Wine", in: EditableMenuDocument.uncategorizedKey))
  }

  func testDrinksRouteUsesExplicitQueryWhileFoodUsesBasePath() {
    let preview = PreviewClient(environment: AppEnvironment(name: .preview, baseURL: URL(string: "https://example.com")!, publicOrigin: URL(string: "https://example.com")!, displayName: "Preview"))
    let drinksMenu = MenuRecord(id: "drinks", slug: "drinks", name: "Drinks", type: "drinks", restaurantId: "leroys-lounge", canManage: true)
    let foodMenu = MenuRecord(id: "food", slug: "food", name: "Food", type: "food", restaurantId: "leroys-lounge", canManage: true)

    XCTAssertEqual(preview.exactRouteURL(for: drinksMenu).absoluteString, "https://example.com/leroyslounge?menu=drinks")
    XCTAssertEqual(preview.exactRouteURL(for: foodMenu).absoluteString, "https://example.com/leroyslounge")
  }

  func testOfflineDraftStoreRoundTripsByUserAndMenu() throws {
    let rootURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let store = OfflineDraftStore(rootURL: rootURL)
    let envelope = LocalDraftEnvelope(
      userId: "staff-1",
      menuId: "menu-drinks",
      restaurantId: "leroys-lounge",
      menuName: "Drinks",
      savedAt: Date(timeIntervalSince1970: 1234),
      baseLiveRevision: 8,
      baseDraftRevision: 9,
      document: EditableMenuDocument(workspace: makeWorkspace())
    )

    try store.saveDraft(envelope)
    let loaded = try XCTUnwrap(store.loadDraft(userId: "staff-1", menuId: "menu-drinks"))
    XCTAssertEqual(loaded, envelope)

    try store.removeDraft(userId: "staff-1", menuId: "menu-drinks")
    XCTAssertNil(try store.loadDraft(userId: "staff-1", menuId: "menu-drinks"))
  }

  private func makeWorkspace(categories: [MenuCategoryPayload] = []) -> MenuWorkspacePayload {
    MenuWorkspacePayload(
      cats: categories,
      meta: MenuMetaPayload(),
      restaurant: RestaurantRecord(id: "leroys-lounge", slug: "leroyslounge", name: "Leroy's Lounge", canAccess: true, design: nil, useCustomDesign: nil),
      restaurantTools: nil,
      context: MenuContext(kind: "menu-workspace", menu: MenuRecord(id: "menu", slug: "drinks", name: "Drinks", type: "drinks", restaurantId: "leroys-lounge", canManage: true)),
      workspace: WorkspaceState(
        actor: ActorProfile(id: "1", name: "Test", role: "manager"),
        accessibleMenuIds: ["menu"],
        hasSharedDraft: false,
        sharedDraft: SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: ""),
        permissions: WorkspacePermissions(canManage: true, canAdmin: false, canEditRestaurantSpecials: false, canReadRestaurantTools: false),
        capabilities: WorkspaceCapabilities(
          canSaveDraft: true,
          canSaveLiveMenu: true,
          canPublishUpdates: true,
          canManageRestaurantSpecials: false,
          canReadRestaurantTools: false,
          canManageAdminSettings: false,
          includesDraftAuthorship: true,
          includesRestaurantTools: false
        ),
        revisions: WorkspaceRevisions(liveRevision: 10, draftRevision: nil, lastSentRevision: 10)
      ),
      capabilities: nil
    )
  }

  private func makeItem(id: String, name: String) -> MenuItemPayload {
    MenuItemPayload(
      id: id,
      name: name,
      desc: "",
      recipe: [],
      price: "$14",
      isEightySixed: false,
      displayOrder: 0,
      onMenu: true,
      visibility: "public",
      upcharges: [],
      showDescription: true,
      showRecipe: false
    )
  }
}
