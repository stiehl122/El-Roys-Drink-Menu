import Observation

@MainActor
@Observable
final class PublicMenuSession {
  let menu: MenuRecord
  private unowned let appModel: AppModel

  var isWorking = false
  var notice: FeatureNotice?
  var payload: PublicMenuPayload?

  init(menu: MenuRecord, appModel: AppModel) {
    self.menu = menu
    self.appModel = appModel
  }

  func load() async {
    isWorking = true
    defer { isWorking = false }

    do {
      notice = nil
      payload = try await appModel.loadPublicMenuPayload(menuId: menu.id)
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
}
