import Observation

struct RestaurantInventoryRow: Identifiable, Equatable {
  var id: String
  var menuID: String
  var menuType: String
  var categoryKey: String
  var categoryLabel: String
  var name: String
  var price: String
  var onMenu: Bool
  var menuVisibility: String
  var isEightySixed: Bool
}

@MainActor
@Observable
final class RestaurantToolsSession {
  let restaurant: RestaurantRecord
  private unowned let appModel: AppModel

  var isWorking = false
  var notice: FeatureNotice?
  var toolsMenus: [String: MenuWorkspacePayload] = [:]
  var toolsHistories: [String: HistoryPayload] = [:]

  var inventoryRows: [RestaurantInventoryRow] {
    toolsMenus.values
      .sorted {
        let lhsType = $0.context.menu?.type ?? ""
        let rhsType = $1.context.menu?.type ?? ""
        if lhsType == rhsType {
          return ($0.context.menu?.id ?? "") < ($1.context.menu?.id ?? "")
        }
        return lhsType < rhsType
      }
      .flatMap { workspace in
        workspace.cats.flatMap { category in
          category.items.map { item in
            RestaurantInventoryRow(
              id: item.id,
              menuID: workspace.context.menu?.id ?? "",
              menuType: workspace.context.menu?.type ?? "",
              categoryKey: category.key,
              categoryLabel: category.label,
              name: item.name,
              price: item.price,
              onMenu: item.onMenu,
              menuVisibility: item.visibility,
              isEightySixed: item.isEightySixed
            )
          }
        }
      }
  }

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

  func prune(itemID: String, fromMenuID menuID: String, categoryKey: String) {
    guard var workspace = toolsMenus[menuID] else { return }
    var document = EditableMenuDocument(workspace: workspace)
    document.deleteItem(itemID: itemID, categoryKey: categoryKey)
    workspace.cats = document.cats
    toolsMenus[menuID] = workspace
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
