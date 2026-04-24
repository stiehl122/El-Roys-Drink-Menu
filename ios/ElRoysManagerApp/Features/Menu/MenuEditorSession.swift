import Foundation
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
  var hasLocalDraftChanges = false
  var hasLiveMenuChanges = false
  var hasServerUnsentChanges = false
  var canEditCategories = false
  var canDiscardLocalDraft = false
  var canSaveQuietlyRemotely = false
  var canLoadPublishPreview = false
  var canPublishRemotely = false
  var menuStatusLabel = "Live"

  init(menu: MenuRecord, appModel: AppModel) {
    self.menu = menu
    self.appModel = appModel
  }

  func load() async {
    isWorking = true
    defer { isWorking = false }
    await appModel.withInstalledEditorSession(self) { model in
      await model.loadEditor(menuId: self.menu.id)
    }
  }

  func monitorRemoteChanges() async {
    while !Task.isCancelled {
      do {
        try await Task.sleep(for: .seconds(12))
      } catch {
        return
      }
      if Task.isCancelled {
        return
      }
      await checkForRemoteUpdate()
    }
  }

  func checkForRemoteUpdate(force: Bool = false) async {
    await appModel.withInstalledEditorSession(self) { model in
      await model.checkForRemoteMenuUpdate(menuId: self.menu.id, force: force)
    }
  }

  func clearNotice() {
    notice = nil
  }

  func discardLocalDraft() {
    appModel.withInstalledEditorSession(self) { model in
      model.discardLocalDraft()
    }
  }

  func saveLiveMenu() async {
    await appModel.withInstalledEditorSession(self) { model in
      await model.saveLiveMenu()
    }
  }

  func loadPublishPreview() async {
    await appModel.withInstalledEditorSession(self) { model in
      await model.loadPublishPreview()
    }
  }

  func publishSelectedChanges() async {
    await appModel.withInstalledEditorSession(self) { model in
      await model.publishSelectedChanges()
    }
  }

  func refreshAfterRemoteUpdate(strategy: EditorRefreshStrategy) async {
    await appModel.withInstalledEditorSession(self) { model in
      await model.refreshEditorAfterRemoteUpdate(strategy: strategy)
    }
  }

  func addCategory(label: String) {
    appModel.withInstalledEditorSession(self) { model in
      model.addCategory(label: label)
    }
  }

  func renameCategory(key: String, label: String) {
    appModel.withInstalledEditorSession(self) { model in
      model.renameCategory(key: key, label: label)
    }
  }

  func deleteCategory(key: String) {
    appModel.withInstalledEditorSession(self) { model in
      model.deleteCategory(key: key)
    }
  }

  func moveVisibleCategories(from source: IndexSet, to destination: Int) {
    appModel.withInstalledEditorSession(self) { model in
      model.moveVisibleCategories(from: source, to: destination)
    }
  }

  func moveItemToOffMenu(_ item: MenuItemPayload, from categoryKey: String) {
    appModel.withInstalledEditorSession(self) { model in
      model.moveItemToOffMenu(item, from: categoryKey)
    }
  }

  func restoreItemFromOffMenu(itemID: String, to categoryKey: String) {
    appModel.withInstalledEditorSession(self) { model in
      model.restoreItemFromOffMenu(itemID: itemID, to: categoryKey)
    }
  }

  func moveVisibleItems(in categoryKey: String, from source: IndexSet, to destination: Int) {
    appModel.withInstalledEditorSession(self) { model in
      model.moveVisibleItems(in: categoryKey, from: source, to: destination)
    }
  }

  func deleteItem(itemID: String, categoryKey: String) {
    appModel.withInstalledEditorSession(self) { model in
      model.deleteItem(itemID: itemID, categoryKey: categoryKey)
    }
  }

  func upsertItem(_ item: MenuItemPayload, categoryKey: String, originalCategoryKey: String?) {
    appModel.withInstalledEditorSession(self) { model in
      model.upsertItem(item, categoryKey: categoryKey, originalCategoryKey: originalCategoryKey)
    }
  }

  func setItemEightySixed(itemID: String, categoryKey: String, isEightySixed: Bool) {
    appModel.withInstalledEditorSession(self) { model in
      model.setItemEightySixed(itemID: itemID, categoryKey: categoryKey, isEightySixed: isEightySixed)
    }
  }

  func canUseItemName(_ name: String, in categoryKey: String, excluding itemID: String? = nil) -> Bool {
    !(document?.hasDuplicate(named: name, in: categoryKey, excluding: itemID) ?? false)
  }

  func lookupBarcode(_ barcode: String) async throws -> ProductLookupResult {
    try await appModel.lookupBarcode(barcode)
  }

  func updatePreviewSelection(_ id: String, selected: Bool) {
    if selected {
      selectedPreviewChangeIDs.insert(id)
    } else {
      selectedPreviewChangeIDs.remove(id)
    }
  }
}
