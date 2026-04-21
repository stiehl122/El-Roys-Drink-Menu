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
