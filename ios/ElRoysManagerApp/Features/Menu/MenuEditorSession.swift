import Observation

@MainActor
@Observable
final class MenuEditorSession {
  let menu: MenuRecord
  private unowned let appModel: AppModel

  var isWorking = false
  var notice: FeatureNotice?
  var workspace: MenuWorkspacePayload?
  var history: HistoryPayload?
  var document: EditableMenuDocument?
  var preview: MenuPreviewPayload?
  var refreshRequirement: EditorRefreshRequirement?
  var selectedPreviewChangeIDs: Set<String> = []

  init(menu: MenuRecord, appModel: AppModel) {
    self.menu = menu
    self.appModel = appModel
  }

  func load() async {
    isWorking = true
    defer { isWorking = false }

    do {
      let loadedWorkspace = try await appModel.loadWorkspace(menuId: menu.id)
      let loadedHistory = try? await appModel.loadHistory(menuId: menu.id)
      workspace = loadedWorkspace
      history = loadedHistory
      document = EditableMenuDocument(workspace: loadedWorkspace)
      preview = nil
      refreshRequirement = nil
      selectedPreviewChangeIDs = []
    } catch {
      notice = FeatureNotice(
        tone: .danger,
        title: "Load Failed",
        message: error.localizedDescription
      )
    }
  }
}
