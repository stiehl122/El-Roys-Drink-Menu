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
      applyPayloads(payloads)
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

  func prune(itemID: String, fromMenuID menuID: String, categoryKey: String) async {
    guard let menu = toolsMenus[menuID]?.context.menu ?? accessibleMenu(for: menuID) else { return }

    isWorking = true
    defer { isWorking = false }

    let editorSession = MenuEditorSession(menu: menu, appModel: appModel)
    await editorSession.load()
    guard editorSession.document != nil else {
      notice = editorSession.notice
      return
    }
    guard editorSession.workspace?.workspace.capabilities.canSaveLiveMenu == true else {
      notice = FeatureNotice(
        tone: .warning,
        title: "Unavailable",
        message: "This staff session can review inventory but cannot prune items from the live menu."
      )
      return
    }

    editorSession.deleteItem(itemID: itemID, categoryKey: categoryKey)
    await editorSession.saveLiveMenu()
    if let editorNotice = editorSession.notice, editorNotice.tone == .danger {
      notice = editorNotice
      return
    }

    do {
      let payloads = try await appModel.loadRestaurantToolsPayloads(for: restaurant.id)
      applyPayloads(payloads, syncHomeCache: true)
      notice = FeatureNotice.success("Item Pruned", "The off-menu item was removed from the restaurant inventory.")
    } catch {
      notice = FeatureNotice(
        tone: .danger,
        title: "Refreshing Inventory",
        message: error.localizedDescription
      )
    }
  }

  private func accessibleMenu(for menuID: String) -> MenuRecord? {
    appModel.accessibleMenus.first(where: { $0.id == menuID })
  }

  private func applyPayloads(
    _ payloads: (menus: [String: MenuWorkspacePayload], histories: [String: HistoryPayload]),
    syncHomeCache: Bool = false
  ) {
    toolsMenus = payloads.menus
    toolsHistories = payloads.histories
    if syncHomeCache {
      appModel.syncHomeRestaurantToolsCache(menus: payloads.menus, histories: payloads.histories)
    }
  }
}
