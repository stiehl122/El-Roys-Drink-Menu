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
      notice = nil
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

  func clearNotice() {
    notice = nil
  }

  func menu(for type: String) -> MenuRecord? {
    appModel.menu(for: restaurant.id, type: type)
  }

  func workspace(for type: String) -> MenuWorkspacePayload? {
    guard let menu = menu(for: type) else { return nil }
    return toolsMenus[menu.id]
  }

  func history(for type: String) -> HistoryPayload? {
    guard let menu = menu(for: type) else { return nil }
    return toolsHistories[menu.id]
  }

  func saveFeaturedAction(
    action: String,
    itemId: String? = nil,
    slotId: String? = nil,
    note: String? = nil,
    direction: Int? = nil
  ) async {
    isWorking = true
    defer { isWorking = false }

    do {
      try await appModel.executeFeaturedAction(
        action: action,
        restaurantId: restaurant.id,
        currentToolsMenus: toolsMenus,
        itemId: itemId,
        slotId: slotId,
        note: note,
        direction: direction
      )
      let payloads = try await appModel.loadRestaurantToolsPayloads(for: restaurant.id)
      notice = nil
      toolsMenus = payloads.menus
      toolsHistories = payloads.histories
    } catch {
      notice = FeatureNotice(
        tone: .danger,
        title: "Updating Featured",
        message: error.localizedDescription
      )
    }
  }
}
