import Observation

@MainActor
@Observable
final class RestaurantToolsSession {
  let restaurant: RestaurantRecord
  private unowned let appModel: AppModel

  var isWorking = false
  var notice: FeatureNotice?
  var toolsMenus: [String: MenuWorkspacePayload] = [:]
  var toolsHistories: [String: HistoryPayload] = [:]

  init(restaurant: RestaurantRecord, appModel: AppModel) {
    self.restaurant = restaurant
    self.appModel = appModel
  }

  func load() async {
    isWorking = true
    defer { isWorking = false }

    do {
      let payloads = try await appModel.loadRestaurantToolsPayloads(for: restaurant.id)
      toolsMenus = payloads.menus
      toolsHistories = payloads.histories
    } catch {
      notice = FeatureNotice(
        tone: .danger,
        title: "Load Failed",
        message: error.localizedDescription
      )
    }
  }
}
