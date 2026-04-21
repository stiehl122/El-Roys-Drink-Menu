import XCTest
@testable import ElRoysManagerApp

@MainActor
final class RouteStateIsolationTests: XCTestCase {
  func testEditorAndPublicSessionsDoNotOverwriteEachOther() async throws {
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

    let editorSession = MenuEditorSession(menu: routeStateMakeMenuRecord(id: "menu-drinks", type: "drinks"), appModel: appModel)
    let publicSession = PublicMenuSession(menu: routeStateMakeMenuRecord(id: "menu-food", type: "food"), appModel: appModel)

    await editorSession.load()
    await publicSession.load()

    XCTAssertEqual(editorSession.menu.id, "menu-drinks")
    XCTAssertEqual(editorSession.document?.menuId, "menu-drinks")
    XCTAssertEqual(publicSession.menu.id, "menu-food")
    XCTAssertEqual(publicSession.payload?.context.menu?.id, "menu-food")
  }

  func testRestaurantToolsSessionKeepsItsOwnNoticeAndLoadingState() async throws {
    let services = routeStateMakeServices()
    let appModel = AppModel(
      services: services,
      sessionStore: RouteStateTestSessionStore(),
      offlineDraftStore: RouteStateTestOfflineDraftStore()
    )

    let restaurant = routeStateMakeRestaurantRecord(id: "rest-1", slug: "leroys-lounge")
    let session = RestaurantToolsSession(restaurant: restaurant, appModel: appModel)

    session.notice = FeatureNotice.success("Saved", "Featured lineup updated.")
    session.isWorking = true

    XCTAssertEqual(session.notice?.title, "Saved")
    XCTAssertTrue(session.isWorking)
    XCTAssertNil(appModel.notice)
    XCTAssertFalse(appModel.isWorking)
  }
}
