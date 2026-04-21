import XCTest
@testable import ElRoysManagerApp

@MainActor
final class RouteStateIsolationTests: XCTestCase {
  func testEditorAndPublicSessionsDoNotOverwriteEachOtherOrLeaveGlobalRouteStateInstalled() async throws {
    let services = routeStateMakeServices(
      workspaceClient: RouteStateStubWorkspaceClient(payloads: [routeStateMakeWorkspace(menuId: "menu-drinks")]),
      publicMenuClient: RouteStateStubPublicMenuClient(payload: routeStateMakePublicMenuPayload(menuId: "menu-food")),
      historyClient: RouteStateStubHistoryClient(payload: routeStateMakeHistoryPayload())
    )

    let appModel = AppModel(
      services: services,
      sessionStore: RouteStateTestSessionStore(),
      offlineDraftStore: RouteStateTestOfflineDraftStore()
    )
    appModel.authSession = routeStateMakeAuthSession()

    let editorSession = appModel.editorSession(for: routeStateMakeMenuRecord(id: "menu-drinks", type: "drinks"))
    let publicSession = appModel.publicMenuSession(for: routeStateMakeMenuRecord(id: "menu-food", type: "food"))

    await editorSession.load()
    await publicSession.load()

    XCTAssertEqual(editorSession.menu.id, "menu-drinks")
    XCTAssertEqual(editorSession.document?.menuId, "menu-drinks")
    XCTAssertEqual(publicSession.menu.id, "menu-food")
    XCTAssertEqual(publicSession.payload?.context.menu?.id, "menu-food")
    XCTAssertNil(appModel.currentEditorDocument)
    XCTAssertNil(appModel.currentPublicMenu)
    XCTAssertNil(appModel.currentMenuId)
  }

  func testRestaurantToolsSessionLoadDoesNotWriteGlobalRestaurantToolsState() async throws {
    let services = routeStateMakeServices()
    let appModel = AppModel(
      services: services,
      sessionStore: RouteStateTestSessionStore(),
      offlineDraftStore: RouteStateTestOfflineDraftStore()
    )
    appModel.authSession = routeStateMakeAuthSession()
    appModel.bootstrap = try await services.bootstrap.fetch(accessToken: nil)

    let restaurant = routeStateMakeRestaurantRecord(id: "leroys-lounge", slug: "leroyslounge")
    let session = appModel.restaurantToolsSession(for: restaurant)

    await session.load()

    XCTAssertFalse(session.toolsMenus.isEmpty)
    XCTAssertTrue(appModel.currentToolsMenus.isEmpty)
    XCTAssertTrue(appModel.currentToolsHistories.isEmpty)
    XCTAssertNil(appModel.notice)
    XCTAssertFalse(appModel.isWorking)
  }

  func testEditorSessionFactoryReusesSessionForSharedMenuRoutes() {
    let appModel = AppModel(
      services: routeStateMakeServices(),
      sessionStore: RouteStateTestSessionStore(),
      offlineDraftStore: RouteStateTestOfflineDraftStore()
    )

    let menu = routeStateMakeMenuRecord(id: "menu-drinks", type: "drinks")

    XCTAssertTrue(appModel.editorSession(for: menu) === appModel.editorSession(for: menu))
  }
}

@MainActor
final class UpchargeEditorTests: XCTestCase {
  func testEditingItemPreservesExistingUpcharges() async throws {
    let preservedUpcharge = ItemUpcharge(label: "Tallboy", price: "+$2")
    let category = routeStateMakeCategory(
      key: "beer",
      label: "Beer",
      items: [
        routeStateMakeItem(
          id: "item-1",
          name: "Bloody Mary",
          upcharges: [preservedUpcharge]
        )
      ]
    )
    let services = routeStateMakeServices(
      workspaceClient: RouteStateStubWorkspaceClient(
        payloads: [
          routeStateMakeWorkspace(
            menuId: "menu-drinks",
            categories: [category]
          )
        ]
      ),
      historyClient: RouteStateStubHistoryClient(payload: routeStateMakeHistoryPayload())
    )

    let appModel = AppModel(
      services: services,
      sessionStore: RouteStateTestSessionStore(),
      offlineDraftStore: RouteStateTestOfflineDraftStore()
    )
    appModel.authSession = routeStateMakeAuthSession()

    let session = appModel.editorSession(for: routeStateMakeMenuRecord(id: "menu-drinks", type: "drinks"))
    await session.load()

    guard let item = session.document?.itemRecord(for: "item-1")?.item else {
      return XCTFail("Expected seeded menu item")
    }

    var draft = EditableItemDraft(item: item, categoryKey: "beer", isFoodMenu: false)
    draft.name = "Bloody Mary Deluxe"
    let editedItem = draft.makeMenuItem(categoryKey: "beer")
    session.upsertItem(editedItem, categoryKey: "beer", originalCategoryKey: "beer")

    let saved = session.document?.itemRecord(for: "item-1")?.item
    XCTAssertEqual(saved?.name, "Bloody Mary Deluxe")
    XCTAssertEqual(saved?.upcharges.count, 1)
    XCTAssertEqual(saved?.upcharges.first?.id, preservedUpcharge.id)
    XCTAssertEqual(saved?.upcharges.first?.label, "Tallboy")
    XCTAssertEqual(saved?.upcharges.first?.price, "+$2")
  }

  func testAddingAndRemovingUpchargesUpdatesDraft() {
    var draft = EditableItemDraft(categoryKey: "beer", isFoodMenu: false)
    draft.addUpcharge(label: "Michelada", price: "+$2")
    draft.addUpcharge(label: "Chamoy Rim", price: "+$1")

    let removedID = draft.upcharges[0].id
    draft.removeUpcharge(id: removedID)

    XCTAssertEqual(draft.upcharges.count, 1)
    XCTAssertEqual(draft.upcharges[0].label, "Chamoy Rim")
    XCTAssertEqual(draft.upcharges[0].price, "+$1")
  }
}

@MainActor
final class RestaurantToolsInventoryTests: XCTestCase {
  func testInventoryListsOnMenuAndOffMenuItemsAcrossBothMenus() async throws {
    let drinksWorkspace = routeStateMakeWorkspace(
      menuId: "menu-drinks",
      type: "drinks",
      categories: [
        routeStateMakeCategory(
          id: "cat-drinks",
          menuId: "menu-drinks",
          key: "beer",
          label: "Beer",
          items: [routeStateMakeItem(id: "item-drink-1", name: "Pilsner")]
        )
      ],
      permissions: WorkspacePermissions(
        canManage: true,
        canAdmin: true,
        canEditRestaurantSpecials: true,
        canReadRestaurantTools: true
      ),
      capabilities: WorkspaceCapabilities(
        canSaveDraft: true,
        canSaveLiveMenu: true,
        canPublishUpdates: true,
        canManageRestaurantSpecials: true,
        canReadRestaurantTools: true,
        canManageAdminSettings: false,
        includesDraftAuthorship: true,
        includesRestaurantTools: true
      )
    )
    let foodWorkspace = routeStateMakeWorkspace(
      menuId: "menu-food",
      type: "food",
      categories: [
        routeStateMakeCategory(
          id: "cat-off-menu",
          menuId: "menu-food",
          key: EditableMenuDocument.uncategorizedKey,
          label: "Off Menu",
          items: [
            routeStateMakeItem(
              id: "item-food-1",
              name: "Secret Taco",
              onMenu: false,
              visibility: "off_menu"
            )
          ]
        )
      ],
      permissions: WorkspacePermissions(
        canManage: true,
        canAdmin: true,
        canEditRestaurantSpecials: true,
        canReadRestaurantTools: true
      ),
      capabilities: WorkspaceCapabilities(
        canSaveDraft: true,
        canSaveLiveMenu: true,
        canPublishUpdates: true,
        canManageRestaurantSpecials: true,
        canReadRestaurantTools: true,
        canManageAdminSettings: false,
        includesDraftAuthorship: true,
        includesRestaurantTools: true
      )
    )
    let services = routeStateMakeServices(
      workspaceClient: RouteStateStubWorkspaceClient(payloads: [drinksWorkspace, foodWorkspace]),
      historyClient: RouteStateStubHistoryClient(payload: routeStateMakeHistoryPayload())
    )
    let appModel = AppModel(
      services: services,
      sessionStore: RouteStateTestSessionStore(),
      offlineDraftStore: RouteStateTestOfflineDraftStore()
    )
    appModel.authSession = routeStateMakeAuthSession()
    appModel.bootstrap = try await services.bootstrap.fetch(accessToken: nil)

    let restaurant = routeStateMakeRestaurantRecord(id: "leroys-lounge", slug: "leroyslounge")
    let session = appModel.restaurantToolsSession(for: restaurant)

    await session.load()
    let inventory = session.inventoryRows

    XCTAssertFalse(inventory.isEmpty)
    XCTAssertTrue(inventory.contains(where: { $0.menuType == "drinks" }))
    XCTAssertTrue(inventory.contains(where: { !$0.onMenu || $0.menuVisibility == "off_menu" }))
  }

  func testPruneOffMenuItemDeletesItFromInventoryRows() async throws {
    let offMenuCategory = routeStateMakeCategory(
      id: "cat-off-menu",
      menuId: "menu-food",
      key: EditableMenuDocument.uncategorizedKey,
      label: "Off Menu",
      items: [
        routeStateMakeItem(
          id: "item-food-1",
          name: "Secret Taco",
          onMenu: false,
          visibility: "off_menu"
        )
      ]
    )
    let services = routeStateMakeServices(
      workspaceClient: RouteStateStubWorkspaceClient(
        payloads: [
          routeStateMakeWorkspace(
            menuId: "menu-drinks",
            type: "drinks",
            categories: [routeStateMakeCategory(id: "cat-drinks", menuId: "menu-drinks", key: "beer", label: "Beer", items: [])]
          ),
          routeStateMakeWorkspace(
            menuId: "menu-food",
            type: "food",
            categories: [offMenuCategory]
          )
        ]
      ),
      historyClient: RouteStateStubHistoryClient(payload: routeStateMakeHistoryPayload())
    )
    let appModel = AppModel(
      services: services,
      sessionStore: RouteStateTestSessionStore(),
      offlineDraftStore: RouteStateTestOfflineDraftStore()
    )
    appModel.authSession = routeStateMakeAuthSession()
    appModel.bootstrap = try await services.bootstrap.fetch(accessToken: nil)

    let restaurant = routeStateMakeRestaurantRecord(id: "leroys-lounge", slug: "leroyslounge")
    let session = appModel.restaurantToolsSession(for: restaurant)

    await session.load()
    let offMenuItem = try XCTUnwrap(session.inventoryRows.first(where: { !$0.onMenu }))

    await session.prune(
      itemID: offMenuItem.id,
      fromMenuID: offMenuItem.menuID,
      categoryKey: offMenuItem.categoryKey
    )

    XCTAssertFalse(session.inventoryRows.contains(where: { $0.id == offMenuItem.id }))
  }
}
