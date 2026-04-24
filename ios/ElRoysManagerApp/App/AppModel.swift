import Foundation
import Observation

enum AuthScreenMode: String, CaseIterable, Identifiable {
  case signIn = "Sign In"
  case signUp = "Create Account"
  case reset = "Reset Password"

  var id: String { rawValue }
}

struct FeatureNotice: Identifiable, Equatable {
  let id = UUID()
  var tone: StatusBanner.Tone
  var title: String
  var message: String

  static func success(_ title: String, _ message: String) -> FeatureNotice {
    FeatureNotice(tone: .success, title: title, message: message)
  }
}

typealias AppNotice = FeatureNotice

enum EditorRefreshStrategy {
  case keepLocalDrafts
  case updateDrafts
}

enum RemoteMenuUpdateKind: Equatable {
  case queueState
  case liveMenu
  case liveAndQueue

  var title: String {
    switch self {
    case .queueState:
      return "Unsent Queue Updated"
    case .liveMenu:
      return "Live Menu Updated"
    case .liveAndQueue:
      return "Live Menu And Queue Updated"
    }
  }
}

struct EditorRefreshRequirement: Equatable {
  var kind: RemoteMenuUpdateKind
  var localDraft: LocalDraftEnvelope?
  var mergeBaseDocument: EditableMenuDocument?
  var remoteWorkspace: MenuWorkspacePayload
  var remoteHistory: HistoryPayload?
  var overlappingLabels: [String]
  var usesLegacyFallback: Bool

  var hasLocalDrafts: Bool { localDraft != nil }
  var hasOverlap: Bool { !overlappingLabels.isEmpty || usesLegacyFallback }
}

struct AppServices {
  var bootstrap: any BootstrapClienting
  var auth: any AuthClienting
  var workspace: any WorkspaceClienting
  var publicMenu: any PublicMenuClienting
  var draft: any DraftClienting
  var liveSave: any LiveSaveClienting
  var publish: any PublishClienting
  var history: any HistoryClienting
  var preview: any PreviewClienting
  var productLookup: any ProductLookupClienting

  static func live(environment: AppEnvironment) -> AppServices {
    AppServices(
      bootstrap: BootstrapClient(environment: environment),
      auth: AuthClient(environment: environment),
      workspace: WorkspaceClient(environment: environment),
      publicMenu: PublicMenuClient(environment: environment),
      draft: DraftClient(environment: environment),
      liveSave: LiveSaveClient(environment: environment),
      publish: PublishClient(environment: environment),
      history: HistoryClient(environment: environment),
      preview: PreviewClient(environment: environment),
      productLookup: ProductLookupClient(environment: environment)
    )
  }
}

@MainActor
@Observable
final class AppModel {
  let environment: AppEnvironment

  var isLaunching = true
  var isWorking = false
  var authMode: AuthScreenMode = .signIn
  var email = ""
  var password = ""
  var displayName = ""
  var notice: AppNotice?

  var bootstrap: SessionBootstrapPayload?
  var authSession: AuthSession?

  var currentPublicMenu: PublicMenuPayload?
  var currentEditorWorkspace: MenuWorkspacePayload?
  var currentEditorHistory: HistoryPayload?
  var currentEditorDocument: EditableMenuDocument?
  var currentEditorPreview: MenuPreviewPayload?
  var currentToolsMenus: [String: MenuWorkspacePayload] = [:]
  var currentToolsHistories: [String: HistoryPayload] = [:]
  var homeDataVersion = 0

  var currentMenuId: String?
  var selectedPreviewChangeIDs: Set<String> = []
  var editorRefreshRequirement: EditorRefreshRequirement?
  var editorHasServerUnsentChanges = false
  var editorDirty = false
  var editorHasLiveChanges = false

  @ObservationIgnored private let services: AppServices
  @ObservationIgnored private let sessionStore: any SessionStoring
  @ObservationIgnored private let offlineDraftStore: any OfflineDraftStoring
  @ObservationIgnored private var draftBaselineDocumentData: Data?
  @ObservationIgnored private var liveBaselineDocumentData: Data?
  @ObservationIgnored private let encoder = JSONEncoder()
  @ObservationIgnored private var editorSessionsByMenuID: [String: MenuEditorSession] = [:]
  @ObservationIgnored private var publicMenuSessionsByMenuID: [String: PublicMenuSession] = [:]
  @ObservationIgnored private var restaurantToolsSessionsByRestaurantID: [String: RestaurantToolsSession] = [:]

  init(
    environment: AppEnvironment = .fromBundle(),
    services: AppServices? = nil,
    sessionStore: any SessionStoring = SessionStore(),
    offlineDraftStore: any OfflineDraftStoring = OfflineDraftStore()
  ) {
    self.environment = environment
    self.services = services ?? .live(environment: environment)
    self.sessionStore = sessionStore
    self.offlineDraftStore = offlineDraftStore
    encoder.outputFormatting = [.sortedKeys]
  }

  var restaurants: [RestaurantRecord] {
    (bootstrap?.restaurants ?? []).filter { authSession == nil || $0.canAccess != false || isAdmin }
  }

  var isAuthenticated: Bool { authSession != nil }
  var isAdmin: Bool { authSession?.role == "admin" }
  var accessibleMenus: [MenuRecord] {
    (bootstrap?.menus ?? []).filter { authSession == nil || $0.canManage != false || isAdmin }
  }

  var currentMenuRecord: MenuRecord? {
    guard let currentMenuId else { return nil }
    return bootstrap?.menus.first(where: { $0.id == currentMenuId })
  }

  var currentRestaurantRecord: RestaurantRecord? {
    guard let restaurantId = currentMenuRecord?.restaurantId else { return nil }
    return bootstrap?.restaurants.first(where: { $0.id == restaurantId })
  }

  var canEditCategories: Bool {
    currentEditorWorkspace?.workspace.permissions.canAdmin ?? false
  }

  private var editorCapabilities: WorkspaceCapabilities? {
    currentEditorWorkspace?.workspace.capabilities
  }

  var hasLocalDraftChanges: Bool { editorDirty }

  var hasLiveMenuChanges: Bool { editorHasLiveChanges }

  var hasServerUnsentChanges: Bool { editorHasServerUnsentChanges }

  var menuStatusLabel: String {
    if hasLocalDraftChanges {
      return "Drafting"
    }
    return "Live"
  }

  var canMutateRemoteEditorState: Bool {
    isAuthenticated && currentEditorWorkspace != nil && editorRefreshRequirement == nil
  }

  var canDiscardLocalDraft: Bool {
    canMutateRemoteEditorState && hasLocalDraftChanges
  }

  var canSaveLiveRemotely: Bool {
    canMutateRemoteEditorState &&
      (editorCapabilities?.canSaveLiveMenu ?? false) &&
      hasLiveMenuChanges
  }

  var canLoadPublishPreview: Bool {
    canMutateRemoteEditorState &&
      (editorCapabilities?.canPublishUpdates ?? false) &&
      (hasLiveMenuChanges || hasServerUnsentChanges)
  }

  var canPublishRemotely: Bool {
    canMutateRemoteEditorState &&
      (editorCapabilities?.canPublishUpdates ?? false) &&
      currentEditorPreview != nil &&
      (hasLiveMenuChanges || hasServerUnsentChanges)
  }

  func start() async {
    guard isLaunching else { return }
    do {
      let anonymousBootstrap = try await services.bootstrap.fetch(accessToken: nil)
      bootstrap = anonymousBootstrap
      homeDataVersion += 1
      await restoreSession()
    } catch {
      notice = AppNotice(tone: .danger, title: "Bootstrap Failed", message: error.localizedDescription)
    }
    isLaunching = false
  }

  func signIn() async {
    guard !email.isEmpty, !password.isEmpty else {
      notice = AppNotice(tone: .warning, title: "Missing Fields", message: "Email and password are required.")
      return
    }
    await run("Signing In") { model in
      let session = try await model.services.auth.signIn(email: model.email, password: model.password)
      try model.persistSession(session)
      try await model.refreshAuthenticatedBootstrap(accessToken: session.accessToken, adoptedSession: session)
      model.password = ""
      model.notice = AppNotice(tone: .success, title: "Welcome Back", message: "Your manager session is ready.")
    }
  }

  func signUp() async {
    guard !email.isEmpty, !password.isEmpty, !displayName.isEmpty else {
      notice = AppNotice(tone: .warning, title: "Missing Fields", message: "Name, email, and password are required.")
      return
    }
    await run("Creating Account") { model in
      let session = try await model.services.auth.signUp(email: model.email, password: model.password, name: model.displayName)
      try model.persistSession(session)
      try await model.refreshAuthenticatedBootstrap(accessToken: session.accessToken, adoptedSession: session)
      model.password = ""
      model.notice = AppNotice(tone: .success, title: "Account Created", message: "The native manager is ready to use.")
    }
  }

  func sendPasswordReset() async {
    guard !email.isEmpty else {
      notice = AppNotice(tone: .warning, title: "Email Required", message: "Enter the staff email you want to reset.")
      return
    }
    await run("Requesting Reset") { model in
      let redirect = model.environment.publicOrigin.appendingPathComponent("manager")
      try await model.services.auth.sendReset(email: model.email, redirectTo: redirect)
      model.notice = AppNotice(
        tone: .success,
        title: "Reset Sent",
        message: "Check your inbox for the recovery link. It currently returns through the web manager."
      )
    }
  }

  func signOut() {
    do {
      try sessionStore.clearSession()
    } catch {
      // Ignore keychain cleanup errors on sign-out.
    }
    authSession = nil
    currentPublicMenu = nil
    currentEditorWorkspace = nil
    currentEditorHistory = nil
    currentEditorDocument = nil
    currentEditorPreview = nil
    currentToolsMenus = [:]
    currentToolsHistories = [:]
    homeDataVersion += 1
    currentMenuId = nil
    editorRefreshRequirement = nil
    editorHasServerUnsentChanges = false
    editorDirty = false
    editorHasLiveChanges = false
    draftBaselineDocumentData = nil
    liveBaselineDocumentData = nil
    editorSessionsByMenuID = [:]
    publicMenuSessionsByMenuID = [:]
    restaurantToolsSessionsByRestaurantID = [:]
    notice = AppNotice(tone: .neutral, title: "Signed Out", message: "The stored device session has been cleared.")
  }

  func menu(for restaurantId: String, type: String) -> MenuRecord? {
    accessibleMenus.first { $0.restaurantId == restaurantId && $0.type.lowercased() == type.lowercased() }
  }

  func editorSession(for menu: MenuRecord) -> MenuEditorSession {
    if let session = editorSessionsByMenuID[menu.id] {
      return session
    }
    let session = MenuEditorSession(menu: menu, appModel: self)
    editorSessionsByMenuID[menu.id] = session
    return session
  }

  func publicMenuSession(for menu: MenuRecord) -> PublicMenuSession {
    if let session = publicMenuSessionsByMenuID[menu.id] {
      return session
    }
    let session = PublicMenuSession(menu: menu, appModel: self)
    publicMenuSessionsByMenuID[menu.id] = session
    return session
  }

  func restaurantToolsSession(for restaurant: RestaurantRecord) -> RestaurantToolsSession {
    if let session = restaurantToolsSessionsByRestaurantID[restaurant.id] {
      return session
    }
    let session = RestaurantToolsSession(restaurant: restaurant, appModel: self)
    restaurantToolsSessionsByRestaurantID[restaurant.id] = session
    return session
  }

  func loadWorkspace(menuId: String) async throws -> MenuWorkspacePayload {
    guard let accessToken = authSession?.accessToken else {
      throw BackendError.unauthorized
    }
    return try await services.workspace.fetch(menuId: menuId, accessToken: accessToken)
  }

  func loadHistory(menuId: String) async throws -> HistoryPayload {
    guard let accessToken = authSession?.accessToken else {
      throw BackendError.unauthorized
    }
    return try await services.history.fetch(menuId: menuId, accessToken: accessToken)
  }

  func loadPublicMenuPayload(menuId: String) async throws -> PublicMenuPayload {
    try await services.publicMenu.fetch(menuId: menuId, accessToken: authSession?.accessToken)
  }

  func loadRestaurantToolsPayloads(
    for restaurantId: String
  ) async throws -> (menus: [String: MenuWorkspacePayload], histories: [String: HistoryPayload]) {
    guard let accessToken = authSession?.accessToken else {
      throw BackendError.unauthorized
    }
    let workspaceClient = services.workspace
    let historyClient = services.history
    let menuIds = accessibleMenus.filter { $0.restaurantId == restaurantId }.map(\.id)
    guard !menuIds.isEmpty else {
      return (menus: [:], histories: [:])
    }

    var menus: [String: MenuWorkspacePayload] = [:]
    var histories: [String: HistoryPayload] = [:]
    try await withThrowingTaskGroup(of: (String, MenuWorkspacePayload, HistoryPayload?).self) { group in
      for menuId in menuIds {
        group.addTask {
          let workspace = try await workspaceClient.fetch(menuId: menuId, accessToken: accessToken)
          let history: HistoryPayload?
          do {
            history = try await historyClient.fetch(menuId: menuId, accessToken: accessToken)
          } catch {
            history = nil
            #if DEBUG
              print("Restaurant tools history unavailable for \(menuId): \(error)")
            #endif
          }
          return (menuId, workspace, history)
        }
      }
      for try await (menuId, workspace, history) in group {
        menus[menuId] = workspace
        if let history {
          histories[menuId] = history
        }
      }
    }
    return (menus: menus, histories: histories)
  }

  func loadPublicMenu(menuId: String) async {
    guard bootstrap?.menus.contains(where: { $0.id == menuId }) == true else { return }
    currentMenuId = menuId
    await run("Loading Public Menu") { model in
      let payload = try await model.loadPublicMenuPayload(menuId: menuId)
      guard model.currentMenuId == menuId else { return }
      model.currentPublicMenu = payload
    }
  }

  func loadEditor(menuId: String) async {
    guard authSession?.accessToken != nil else {
      notice = AppNotice(tone: .warning, title: "Sign In Required", message: "Editing is only available to authenticated staff.")
      return
    }
    currentMenuId = menuId
    await run("Loading Editor") { model in
      let workspace = try await model.loadWorkspace(menuId: menuId)
      let history: HistoryPayload?
      do {
        history = try await model.loadHistory(menuId: menuId)
      } catch {
        history = nil
        #if DEBUG
          print("Menu editor history unavailable for \(menuId): \(error)")
        #endif
      }

      try model.adoptEditorWorkspace(workspace, history: history)

      try model.restoreOfflineDraftIfNeeded()
    }
  }

  func monitorEditorRemoteChanges(for menuId: String) async {
    while !Task.isCancelled {
      do {
        try await Task.sleep(for: .seconds(12))
      } catch {
        return
      }
      if Task.isCancelled {
        return
      }
      await checkForRemoteMenuUpdate(menuId: menuId)
    }
  }

  func checkForRemoteMenuUpdate(menuId: String, force: Bool = false) async {
    guard let accessToken = authSession?.accessToken,
          currentMenuId == menuId,
          currentEditorWorkspace != nil,
          currentEditorDocument != nil,
          editorRefreshRequirement == nil else { return }
    if isWorking && !force {
      return
    }

    do {
      let fetchedWorkspace = try await services.workspace.fetch(menuId: menuId, accessToken: accessToken)
      let workspace = normalizedEditorWorkspace(fetchedWorkspace)
      guard let currentWorkspace = currentEditorWorkspace else { return }
      guard workspace.workspace.revisions != currentWorkspace.workspace.revisions else { return }
      let history: HistoryPayload?
      do {
        history = try await services.history.fetch(menuId: menuId, accessToken: accessToken)
      } catch {
        history = nil
      }
      editorRefreshRequirement = makeRefreshRequirement(
        currentWorkspace: currentWorkspace,
        freshWorkspace: workspace,
        freshHistory: history,
        localDraft: currentLocalDraftEnvelope(),
        mergeBaseDocument: try? draftBaselineEditorDocument()
      )
      currentEditorPreview = nil
      selectedPreviewChangeIDs = []
    } catch {
      if force {
        notice = AppNotice(
          tone: .danger,
          title: "Refresh Check Failed",
          message: error.localizedDescription
        )
      }
    }
  }

  func loadRestaurantTools(for restaurantId: String) async {
    guard authSession?.accessToken != nil else {
      notice = AppNotice(tone: .warning, title: "Sign In Required", message: "Restaurant tools require an authenticated staff session.")
      return
    }
    let menuIds = accessibleMenus.filter { $0.restaurantId == restaurantId }.map(\.id)
    guard !menuIds.isEmpty else { return }
    await run("Loading Restaurant Tools") { model in
      let payloads = try await model.loadRestaurantToolsPayloads(for: restaurantId)
      model.syncHomeRestaurantToolsCache(menus: payloads.menus, histories: payloads.histories)
      if model.currentMenuId == nil || !menuIds.contains(model.currentMenuId ?? "") {
        model.currentMenuId = menuIds.first
      }
    }
  }

  func loadPublishPreview() async {
    guard canLoadPublishPreview,
          let menuId = currentMenuId,
          let accessToken = authSession?.accessToken,
          let workspace = currentEditorWorkspace,
          let snapshot = editorSnapshot() else { return }

    let operationLabel = "Building Save Preview"
    await run(operationLabel) { model in
      let expectedDraftRevision = model.expectedDraftRevision(for: workspace)
      let expectedNotificationRevision = model.expectedNotificationBaselineRevision(for: workspace)
      let response = try await model.services.publish.preview(
        menuId: menuId,
        snapshot: snapshot,
        expectedLiveRevision: workspace.workspace.revisions.liveRevision,
        expectedDraftRevision: expectedDraftRevision,
        expectedNotificationRevision: expectedNotificationRevision,
        accessToken: accessToken,
        source: "ios_app"
      )
      let preview = response.preview
      model.currentEditorPreview = preview
      model.selectedPreviewChangeIDs = model.defaultPreviewSelection(for: preview)
    }
  }

  func publishSelectedChanges(shouldNotify: Bool = true) async {
    guard canPublishRemotely,
          let menuId = currentMenuId,
          let accessToken = authSession?.accessToken,
          let workspace = currentEditorWorkspace,
          let snapshot = editorSnapshot() else { return }

    let operationLabel = "Saving"
    await run(operationLabel) { model in
      let expectedDraftRevision = model.expectedDraftRevision(for: workspace)
      let expectedNotificationRevision = model.expectedNotificationBaselineRevision(for: workspace)
      let preview: MenuPreviewPayload?
      if let existing = model.currentEditorPreview {
        preview = existing
      } else {
        preview = try await model.services.publish.preview(
          menuId: menuId,
          snapshot: snapshot,
          expectedLiveRevision: workspace.workspace.revisions.liveRevision,
          expectedDraftRevision: expectedDraftRevision,
          expectedNotificationRevision: expectedNotificationRevision,
          accessToken: accessToken,
          source: "ios_app"
        ).preview
        model.currentEditorPreview = preview
        if model.selectedPreviewChangeIDs.isEmpty {
          model.selectedPreviewChangeIDs = model.defaultPreviewSelection(for: preview)
        }
      }

      let selection = shouldNotify ? Array(model.selectedPreviewChangeIDs) : []
      let response = try await model.services.publish.publish(
        menuId: menuId,
        snapshot: snapshot,
        selectedChangeIds: selection,
        expectedLiveRevision: workspace.workspace.revisions.liveRevision,
        expectedDraftRevision: expectedDraftRevision,
        expectedNotificationRevision: expectedNotificationRevision,
        accessToken: accessToken,
        source: "ios_app"
      )
      let hasNotificationChanges = preview?.hasNotificationChanges ?? false
      var title = "Saved"
      var message = "The live menu was saved without sending notifications."
      if hasNotificationChanges {
        if !shouldNotify {
          message = "Notification-ready changes were saved live and cleared without sending."
        } else if selection.isEmpty {
          message = "Unchecked notification rows were saved live without sending."
        } else {
          title = "Saved And Sent"
          message = "Selected notification rows were sent. Unchecked rows were saved without notification."
        }
      }
      if let successMessage = response.successMessage?.nilIfBlank {
        message = successMessage
      }
      let currentDocument = try model.requireCurrentEditorDocument()
      model.applyPublishResponseLocally(
        response,
        preview: preview,
        previousWorkspace: workspace,
        currentDocument: currentDocument
      )
      model.notice = AppNotice(tone: .success, title: title, message: message)
    }
  }

  func discardLocalDraft() {
    guard canDiscardLocalDraft else { return }
    guard let baselineDocument = (try? draftBaselineEditorDocument()) ?? (try? currentLiveBaselineDocument()) else {
      return
    }
    var restored = baselineDocument
    restored.normalizeIdentifiersForRuntime()
    currentEditorDocument = restored
    updateEditorStateFlags(for: restored)
    currentEditorPreview = nil
    selectedPreviewChangeIDs = []
    persistOfflineDraftIfNeeded()
    notice = AppNotice(
      tone: .neutral,
      title: "Draft Discarded",
      message: "Local edits on this device were removed. The shared server queue was not changed."
    )
  }

  func saveLiveMenu() async {
    guard canSaveLiveRemotely,
          let menuId = currentMenuId,
          let accessToken = authSession?.accessToken,
          let workspace = currentEditorWorkspace,
          let snapshot = editorSnapshot() else { return }

    await run("Saving Quietly") { model in
      var currentDocument = try model.requireCurrentEditorDocument()
      currentDocument.normalizePersistentItemIdentifiersForRuntime()
      let expectedDraftRevision = model.expectedDraftRevision(for: workspace)
      let response = try await model.services.liveSave.save(
        menuId: menuId,
        snapshot: snapshot,
        expectedLiveRevision: workspace.workspace.revisions.liveRevision,
        expectedDraftRevision: expectedDraftRevision,
        accessToken: accessToken
      )
      if let currentRevisions = response.currentRevisions {
        model.currentEditorWorkspace?.workspace.revisions = currentRevisions
      }
      if let ts = response.ts {
        currentDocument.meta.lastUpdatedTs = ts
        model.currentEditorWorkspace?.meta.lastUpdatedTs = ts
        if response.currentRevisions == nil {
          model.currentEditorWorkspace?.workspace.revisions.liveRevision = ts
        } else if model.currentEditorWorkspace?.workspace.revisions.liveRevision == nil {
          model.currentEditorWorkspace?.workspace.revisions.liveRevision = ts
        }
      }
      model.currentEditorDocument = currentDocument
      model.currentEditorWorkspace?.workspace.hasSharedDraft = false
      model.currentEditorWorkspace?.workspace.sharedDraft = SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: "")
      model.currentEditorWorkspace?.workspace.revisions.draftRevision = nil
      model.currentEditorWorkspace?.meta.draftState = nil
      model.currentEditorWorkspace?.meta.draftSavedTs = nil
      model.currentEditorWorkspace?.meta.draftSavedByUserId = nil
      model.currentEditorWorkspace?.meta.draftSavedByName = nil
      model.currentEditorWorkspace?.meta.draftSavedSource = nil
      model.rebaselineCurrentEditorToServer(
        liveDocument: currentDocument,
        serverDocument: currentDocument,
        revisions: model.currentEditorWorkspace?.workspace.revisions
      )
      model.notice = AppNotice(tone: .success, title: "Saved Quietly", message: "The live menu was updated without sending notifications.")
    }
  }

  func addCategory(label: String) {
    guard canEditCategories else { return }
    mutateEditorDocument { $0.addCategory(label: label) }
  }

  func renameCategory(key: String, label: String) {
    guard canEditCategories else { return }
    mutateEditorDocument { $0.renameCategory(key: key, label: label) }
  }

  func deleteCategory(key: String) {
    guard canEditCategories else { return }
    mutateEditorDocument { $0.deleteCategory(key: key) }
  }

  func moveItemToOffMenu(itemID: String, from categoryKey: String) {
    mutateEditorDocument { $0.removeItemToOffMenu(itemID: itemID, from: categoryKey) }
  }

  func moveItemToOffMenu(_ item: MenuItemPayload, from categoryKey: String) {
    mutateEditorDocument { $0.moveItemToOffMenu(item, from: categoryKey) }
  }

  func restoreItemFromOffMenu(itemID: String, to categoryKey: String) {
    mutateEditorDocument { $0.restoreItemFromOffMenu(itemID: itemID, to: categoryKey) }
  }

  func moveVisibleCategories(from source: IndexSet, to destination: Int) {
    guard canEditCategories else { return }
    mutateEditorDocument { $0.moveVisibleCategories(from: source, to: destination) }
  }

  func moveVisibleItems(in categoryKey: String, from source: IndexSet, to destination: Int) {
    mutateEditorDocument { $0.moveVisibleItems(in: categoryKey, from: source, to: destination) }
  }

  func deleteItem(itemID: String, categoryKey: String) {
    mutateEditorDocument { $0.deleteItem(itemID: itemID, categoryKey: categoryKey) }
  }

  func upsertItem(_ item: MenuItemPayload, categoryKey: String, originalCategoryKey: String?) {
    mutateEditorDocument { $0.upsertItem(item, categoryKey: categoryKey, originalCategoryKey: originalCategoryKey) }
  }

  func setItemEightySixed(itemID: String, categoryKey: String, isEightySixed: Bool) {
    guard var item = currentEditorDocument?.itemRecord(for: itemID)?.item else { return }
    guard item.isEightySixed != isEightySixed else { return }
    item.isEightySixed = isEightySixed
    upsertItem(item, categoryKey: categoryKey, originalCategoryKey: categoryKey)
  }

  func canUseItemName(_ name: String, in categoryKey: String, excluding itemID: String? = nil) -> Bool {
    !(currentEditorDocument?.hasDuplicate(named: name, in: categoryKey, excluding: itemID) ?? false)
  }

  func refreshEditorAfterRemoteUpdate(strategy: EditorRefreshStrategy) async {
    guard let requirement = editorRefreshRequirement,
          let accessToken = authSession?.accessToken,
          let menuId = currentMenuId else { return }

    await run("Refreshing Menu") { model in
      let freshWorkspace = try await model.services.workspace.fetch(menuId: menuId, accessToken: accessToken)
      let freshHistory: HistoryPayload?
      do {
        freshHistory = try await model.services.history.fetch(menuId: menuId, accessToken: accessToken)
      } catch {
        freshHistory = nil
      }

      let remoteLiveDocument = EditableMenuDocument(workspace: freshWorkspace)
      let remoteDocument = model.serverWorkspaceDocument(from: freshWorkspace, liveDocument: remoteLiveDocument)
      let nextDocument: EditableMenuDocument
      if let localDraft = requirement.localDraft {
        nextDocument = model.mergeLocalDraft(
          localDraft,
          into: remoteDocument,
          strategy: strategy
        )
      } else {
        nextDocument = remoteDocument
      }

      try model.adoptEditorWorkspace(
        freshWorkspace,
        history: freshHistory,
        document: nextDocument
      )
      model.persistOfflineDraftIfNeeded()
      model.notice = AppNotice(
        tone: .success,
        title: requirement.kind.title,
        message: messageForRefreshCompletion(requirement: requirement, strategy: strategy, isDirty: model.editorDirty)
      )
    }
  }

  func exactRoutePreviewURL(for menu: MenuRecord) -> URL {
    services.preview.exactRouteURL(for: menu)
  }

  func lookupBarcode(_ barcode: String) async throws -> ProductLookupResult {
    guard let accessToken = authSession?.accessToken else {
      throw BackendError.unauthorized
    }
    return try await services.productLookup.lookup(upc: barcode, accessToken: accessToken)
  }

  func updatePreviewSelection(_ id: String, selected: Bool) {
    if selected {
      selectedPreviewChangeIDs.insert(id)
    } else {
      selectedPreviewChangeIDs.remove(id)
    }
  }

  func withInstalledEditorSession<Result>(
    _ session: MenuEditorSession,
    perform operation: (AppModel) throws -> Result
  ) rethrows -> Result {
    let snapshot = captureInstalledEditorSessionState()
    installEditorSession(session)
    defer {
      syncInstalledEditorSession(into: session)
      restoreInstalledEditorSessionState(snapshot)
    }
    return try operation(self)
  }

  func withInstalledEditorSession<Result>(
    _ session: MenuEditorSession,
    perform operation: @escaping @MainActor (AppModel) async throws -> Result
  ) async rethrows -> Result {
    let snapshot = captureInstalledEditorSessionState()
    installEditorSession(session)
    defer {
      syncInstalledEditorSession(into: session)
      restoreInstalledEditorSessionState(snapshot)
    }
    return try await operation(self)
  }

  func syncHomeRestaurantToolsCache(
    menus: [String: MenuWorkspacePayload],
    histories: [String: HistoryPayload]
  ) {
    for (menuId, workspace) in menus {
      currentToolsMenus[menuId] = workspace
    }
    for (menuId, history) in histories {
      currentToolsHistories[menuId] = history
    }
    homeDataVersion += 1
  }
  private func restoreSession() async {
    do {
      var storedSession = try await sessionStore.loadSession(promptForBiometrics: true)
      if storedSession.isExpired {
        storedSession = try await services.auth.refresh(session: storedSession)
        try persistSession(storedSession)
      }
      try await refreshAuthenticatedBootstrap(accessToken: storedSession.accessToken, adoptedSession: storedSession)
    } catch {
      try? sessionStore.clearSession()
      authSession = nil
    }
  }

  private func refreshAuthenticatedBootstrap(accessToken: String, adoptedSession: AuthSession) async throws {
    let refreshed = try await services.bootstrap.fetch(accessToken: accessToken)
    bootstrap = refreshed
    homeDataVersion += 1
    let actor = refreshed.actor
    authSession = AuthSession(
      accessToken: adoptedSession.accessToken,
      refreshToken: adoptedSession.refreshToken,
      expiresAt: adoptedSession.expiresAt,
      userID: adoptedSession.userID,
      email: adoptedSession.email,
      name: actor?.name ?? adoptedSession.name,
      role: actor?.role ?? adoptedSession.role,
      accessibleMenuIds: refreshed.access.accessibleMenuIds
    )
    if let authSession {
      try persistSession(authSession)
    }
  }

  private func persistSession(_ session: AuthSession) throws {
    authSession = session
    try sessionStore.saveSession(session)
  }

  private func captureInstalledEditorSessionState() -> InstalledEditorSessionState {
    InstalledEditorSessionState(
      isWorking: isWorking,
      notice: notice,
      currentPublicMenu: currentPublicMenu,
      currentEditorWorkspace: currentEditorWorkspace,
      currentEditorHistory: currentEditorHistory,
      currentEditorDocument: currentEditorDocument,
      currentEditorPreview: currentEditorPreview,
      currentMenuId: currentMenuId,
      selectedPreviewChangeIDs: selectedPreviewChangeIDs,
      editorRefreshRequirement: editorRefreshRequirement,
      editorHasServerUnsentChanges: editorHasServerUnsentChanges,
      editorDirty: editorDirty,
      editorHasLiveChanges: editorHasLiveChanges
    )
  }

  private func installEditorSession(_ session: MenuEditorSession) {
    isWorking = session.isWorking
    notice = session.notice
    currentPublicMenu = nil
    currentEditorWorkspace = session.workspace
    currentEditorHistory = session.history
    currentEditorDocument = session.document
    currentEditorPreview = session.preview
    currentMenuId = session.menu.id
    selectedPreviewChangeIDs = session.selectedPreviewChangeIDs
    editorRefreshRequirement = session.refreshRequirement
    editorHasServerUnsentChanges = session.hasServerUnsentChanges
    editorDirty = session.hasLocalDraftChanges
    editorHasLiveChanges = session.hasLiveMenuChanges
  }

  private func syncInstalledEditorSession(into session: MenuEditorSession) {
    session.isWorking = isWorking
    session.notice = notice
    session.workspace = currentEditorWorkspace
    session.history = currentEditorHistory
    session.document = currentEditorDocument
    session.preview = currentEditorPreview
    session.selectedPreviewChangeIDs = selectedPreviewChangeIDs
    session.refreshRequirement = editorRefreshRequirement
    session.hasLocalDraftChanges = editorDirty
    session.hasLiveMenuChanges = editorHasLiveChanges
    session.hasServerUnsentChanges = editorHasServerUnsentChanges
    session.canEditCategories = canEditCategories
    session.canDiscardLocalDraft = canDiscardLocalDraft
    session.canLoadPublishPreview = canLoadPublishPreview
    session.canPublishRemotely = canPublishRemotely
    session.menuStatusLabel = menuStatusLabel
  }

  private func restoreInstalledEditorSessionState(_ state: InstalledEditorSessionState) {
    isWorking = state.isWorking
    notice = state.notice
    currentPublicMenu = state.currentPublicMenu
    currentEditorWorkspace = state.currentEditorWorkspace
    currentEditorHistory = state.currentEditorHistory
    currentEditorDocument = state.currentEditorDocument
    currentEditorPreview = state.currentEditorPreview
    currentMenuId = state.currentMenuId
    selectedPreviewChangeIDs = state.selectedPreviewChangeIDs
    editorRefreshRequirement = state.editorRefreshRequirement
    editorHasServerUnsentChanges = state.editorHasServerUnsentChanges
    editorDirty = state.editorDirty
    editorHasLiveChanges = state.editorHasLiveChanges
  }

  private func mutateEditorDocument(_ change: (inout EditableMenuDocument) -> Void) {
    guard editorRefreshRequirement == nil else { return }
    guard var document = currentEditorDocument else { return }
    change(&document)
    currentEditorDocument = document
    updateEditorStateFlags(for: document)
    currentEditorPreview = nil
    selectedPreviewChangeIDs = []
    persistOfflineDraftIfNeeded()
  }

  private func editorSnapshot() -> MenuSnapshotPayload? {
    guard let document = currentEditorDocument else { return nil }
    return document.makeSnapshot(hasUnsavedChanges: editorDirty, hasServerUnsentChanges: editorHasServerUnsentChanges)
  }

  private func restoreOfflineDraftIfNeeded() throws {
    guard let session = authSession,
          let workspace = currentEditorWorkspace,
          let document = currentEditorDocument else { return }

    let maybeEnvelope: LocalDraftEnvelope?
    do {
      maybeEnvelope = try offlineDraftStore.loadDraft(userId: session.userID, menuId: document.menuId)
    } catch {
      // A malformed local draft should never block the server-backed editor.
      try? offlineDraftStore.removeDraft(userId: session.userID, menuId: document.menuId)
      notice = AppNotice(
        tone: .warning,
        title: "Local Draft Cleared",
        message: "A saved device draft was unreadable and has been removed so the live editor can open."
      )
      return
    }
    guard let envelope = maybeEnvelope else { return }

    let revisions = workspace.workspace.revisions
    let serverBaselineRevision = expectedNotificationBaselineRevision(for: workspace)
    let localBaselineRevision = envelope.baseNotificationBaselineRevision ?? envelope.baseDraftRevision
    let matchesServer = envelope.baseLiveRevision == revisions.liveRevision &&
      localBaselineRevision == serverBaselineRevision

    if matchesServer {
      var normalized = envelope.document
      normalized.normalizeIdentifiersForRuntime()
      currentEditorDocument = normalized
      updateEditorStateFlags(for: normalized)
      editorRefreshRequirement = nil
      if editorDirty {
        notice = AppNotice(
          tone: .neutral,
          title: "Local Draft Restored",
          message: "This editor reopened with the last device-only draft for this menu."
        )
      } else {
        try? offlineDraftStore.removeDraft(userId: envelope.userId, menuId: envelope.menuId)
      }
    } else {
      editorRefreshRequirement = makeRefreshRequirement(
        currentWorkspace: MenuWorkspacePayload(
          cats: envelope.baseDocument?.cats ?? [],
          meta: envelope.baseDocument?.meta ?? workspace.meta,
          restaurant: envelope.baseDocument?.restaurant ?? workspace.restaurant,
          restaurantTools: workspace.restaurantTools,
          context: workspace.context,
          workspace: WorkspaceState(
            actor: workspace.workspace.actor,
            accessibleMenuIds: workspace.workspace.accessibleMenuIds,
            hasSharedDraft: false,
            sharedDraft: workspace.workspace.sharedDraft,
            menuStatus: workspace.workspace.menuStatus,
            hasUnsentChanges: workspace.workspace.hasUnsentChanges,
            permissions: workspace.workspace.permissions,
            capabilities: workspace.workspace.capabilities,
            revisions: WorkspaceRevisions(
              liveRevision: envelope.baseLiveRevision,
              draftRevision: envelope.baseDraftRevision,
              lastSentRevision: workspace.workspace.revisions.lastSentRevision,
              notificationBaselineRevision: localBaselineRevision
            )
          ),
          capabilities: workspace.capabilities
        ),
        freshWorkspace: workspace,
        freshHistory: currentEditorHistory,
        localDraft: envelope,
        mergeBaseDocument: envelope.baseDocument
      )
      editorDirty = false
    }
  }

  private func persistOfflineDraftIfNeeded() {
    guard let session = authSession,
          let workspace = currentEditorWorkspace,
          let document = currentEditorDocument else { return }

    if editorDirty {
      let baseDocument = try? draftBaselineEditorDocument()
      let envelope = LocalDraftEnvelope(
        userId: session.userID,
        menuId: document.menuId,
        clientScopeId: offlineDraftStore.clientScopeId,
        restaurantId: document.restaurantId,
        menuName: currentMenuRecord?.name ?? document.context.menuType.capitalized,
        savedAt: .now,
        baseLiveRevision: workspace.workspace.revisions.liveRevision,
        baseDraftRevision: workspace.workspace.revisions.draftRevision,
        baseNotificationBaselineRevision: expectedNotificationBaselineRevision(for: workspace),
        baseDocument: baseDocument,
        document: document
      )
      try? offlineDraftStore.saveDraft(envelope)
    } else {
      try? offlineDraftStore.removeDraft(userId: session.userID, menuId: document.menuId)
    }
  }

  private func currentLocalDraftEnvelope() -> LocalDraftEnvelope? {
    guard hasLocalDraftChanges,
          let session = authSession,
          let workspace = currentEditorWorkspace,
          let document = currentEditorDocument else { return nil }
    return LocalDraftEnvelope(
      userId: session.userID,
      menuId: document.menuId,
      clientScopeId: offlineDraftStore.clientScopeId,
      restaurantId: document.restaurantId,
      menuName: currentMenuRecord?.name ?? document.context.menuType.capitalized,
      savedAt: .now,
      baseLiveRevision: workspace.workspace.revisions.liveRevision,
      baseDraftRevision: workspace.workspace.revisions.draftRevision,
      baseNotificationBaselineRevision: expectedNotificationBaselineRevision(for: workspace),
      baseDocument: try? draftBaselineEditorDocument(),
      document: document
    )
  }

  private func adoptEditorWorkspace(
    _ workspace: MenuWorkspacePayload,
    history: HistoryPayload?,
    document: EditableMenuDocument? = nil
  ) throws {
    let normalizedWorkspace = normalizedEditorWorkspace(workspace)
    let liveDocument = EditableMenuDocument(workspace: normalizedWorkspace)
    let serverDocument = serverWorkspaceDocument(from: normalizedWorkspace, liveDocument: liveDocument)
    currentEditorWorkspace = normalizedWorkspace
    currentEditorHistory = history
    currentEditorDocument = document ?? serverDocument
    try setEditorBaselines(liveDocument: liveDocument, serverDocument: serverDocument)
    currentEditorPreview = nil
    selectedPreviewChangeIDs = []
    editorHasServerUnsentChanges = serverHasUnsentChanges(in: normalizedWorkspace)
    editorRefreshRequirement = nil
    currentPublicMenu = nil
    updateEditorStateFlags(for: currentEditorDocument ?? serverDocument)
  }

  private func rebaselineCurrentEditorToServer(
    liveDocument: EditableMenuDocument,
    serverDocument: EditableMenuDocument,
    revisions: WorkspaceRevisions?
  ) {
    guard let currentEditorDocument else { return }
    try? setEditorBaselines(liveDocument: liveDocument, serverDocument: serverDocument)
    if let revisions {
      if let meta = currentEditorWorkspace?.meta {
        currentEditorWorkspace?.workspace.revisions = normalizedWorkspaceRevisions(revisions, meta: meta)
      } else {
        currentEditorWorkspace?.workspace.revisions = revisions
      }
    }
    editorHasServerUnsentChanges = serverHasUnsentChanges(in: currentEditorWorkspace)
    editorRefreshRequirement = nil
    updateEditorStateFlags(for: currentEditorDocument)
    currentEditorPreview = nil
    selectedPreviewChangeIDs = []
    persistOfflineDraftIfNeeded()
  }

  private func applyPublishResponseLocally(
    _ response: PublishResponse,
    preview: MenuPreviewPayload?,
    previousWorkspace: MenuWorkspacePayload,
    currentDocument: EditableMenuDocument
  ) {
    guard var workspace = currentEditorWorkspace else { return }

    let publishMode = preview?.mode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    let didPersistLive = publishMode.isEmpty ? hasLiveMenuChanges : publishMode != "send"

    var nextDocument = currentDocument
    nextDocument.normalizePersistentItemIdentifiersForRuntime()
    var nextRevisions = normalizedWorkspaceRevisions(
      response.currentRevisions ?? workspace.workspace.revisions,
      meta: workspace.meta
    )

    if didPersistLive,
       let liveRevision = nextRevisions.liveRevision ?? response.ts {
      nextRevisions.liveRevision = liveRevision
      workspace.meta.lastUpdatedTs = liveRevision
      nextDocument.meta.lastUpdatedTs = liveRevision
    }

    if let lastSentRevision = nextRevisions.lastSentRevision {
      workspace.meta.lastSentTs = lastSentRevision
      nextDocument.meta.lastSentTs = lastSentRevision
    }

    workspace.workspace.revisions = nextRevisions
    workspace.workspace.hasSharedDraft = false
    workspace.workspace.sharedDraft = SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: "")
    workspace.workspace.revisions.draftRevision = nil
    workspace.meta.draftState = nil
    workspace.meta.draftSavedTs = nil
    workspace.meta.draftSavedByUserId = nil
    workspace.meta.draftSavedByName = nil
    workspace.meta.draftSavedSource = nil
    nextDocument.meta.draftState = nil
    nextDocument.meta.draftSavedTs = nil
    nextDocument.meta.draftSavedByUserId = nil
    nextDocument.meta.draftSavedByName = nil
    nextDocument.meta.draftSavedSource = nil

    workspace.workspace.hasUnsentChanges = false
    workspace.workspace.menuStatus = "Live"

    currentEditorWorkspace = workspace
    currentEditorDocument = nextDocument
    rebaselineCurrentEditorToServer(
      liveDocument: nextDocument,
      serverDocument: nextDocument,
      revisions: nextRevisions
    )
  }

  private func makeRefreshRequirement(
    currentWorkspace: MenuWorkspacePayload,
    freshWorkspace: MenuWorkspacePayload,
    freshHistory: HistoryPayload?,
    localDraft: LocalDraftEnvelope?,
    mergeBaseDocument: EditableMenuDocument?
  ) -> EditorRefreshRequirement {
    let remoteLiveDocument = EditableMenuDocument(workspace: freshWorkspace)
    let remoteDocument = serverWorkspaceDocument(from: freshWorkspace, liveDocument: remoteLiveDocument)
    let baseDocument = mergeBaseDocument ?? localDraft?.baseDocument
    let overlap = buildOverlapLabels(
      base: baseDocument,
      local: localDraft?.document,
      remote: remoteDocument
    )
    return EditorRefreshRequirement(
      kind: classifyRemoteUpdateKind(
        previous: currentWorkspace.workspace.revisions,
        next: freshWorkspace.workspace.revisions
      ),
      localDraft: localDraft,
      mergeBaseDocument: baseDocument,
      remoteWorkspace: freshWorkspace,
      remoteHistory: freshHistory,
      overlappingLabels: overlap.labels,
      usesLegacyFallback: overlap.usedFallback
    )
  }

  private func mergeLocalDraft(
    _ localDraft: LocalDraftEnvelope,
    into remoteDocument: EditableMenuDocument,
    strategy: EditorRefreshStrategy
  ) -> EditableMenuDocument {
    guard let baseDocument = localDraft.baseDocument ?? (try? draftBaselineEditorDocument()) else {
      var fallback = strategy == .keepLocalDrafts ? localDraft.document : remoteDocument
      fallback.context = remoteDocument.context
      fallback.meta = remoteDocument.meta
      fallback.restaurant = remoteDocument.restaurant
      return fallback
    }
    return mergeDocuments(
      base: baseDocument,
      local: localDraft.document,
      remote: remoteDocument,
      strategy: strategy
    )
  }

  private func draftBaselineEditorDocument() throws -> EditableMenuDocument? {
    guard let draftBaselineDocumentData else { return nil }
    return try JSONDecoder().decode(EditableMenuDocument.self, from: draftBaselineDocumentData)
  }

  private func currentLiveBaselineDocument() throws -> EditableMenuDocument? {
    guard let liveBaselineDocumentData else { return nil }
    return try JSONDecoder().decode(EditableMenuDocument.self, from: liveBaselineDocumentData)
  }

  private func isDocumentDirty(_ document: EditableMenuDocument) -> Bool {
    guard let draftBaselineDocumentData else { return true }
    guard let current = try? documentData(for: document) else { return true }
    return current != draftBaselineDocumentData
  }

  private func isDocumentDifferentFromLive(_ document: EditableMenuDocument) -> Bool {
    guard let liveBaselineDocumentData else { return true }
    guard let current = try? documentData(for: document) else { return true }
    return current != liveBaselineDocumentData
  }

  private func documentData(for document: EditableMenuDocument) throws -> Data {
    try encoder.encode(document)
  }

  private func requireCurrentEditorDocument() throws -> EditableMenuDocument {
    guard let currentEditorDocument else {
      throw NSError(domain: "AppModel", code: 1, userInfo: [NSLocalizedDescriptionKey: "The editor is not loaded yet."])
    }
    return currentEditorDocument
  }

  private func setEditorBaselines(liveDocument: EditableMenuDocument, serverDocument: EditableMenuDocument) throws {
    liveBaselineDocumentData = try documentData(for: liveDocument)
    draftBaselineDocumentData = try documentData(for: serverDocument)
  }

  private func serverWorkspaceDocument(from workspace: MenuWorkspacePayload, liveDocument: EditableMenuDocument) -> EditableMenuDocument {
    // Legacy fallback only while server payloads are transitioning away from shared drafts.
    guard workspace.workspace.hasSharedDraft else { return liveDocument }
    guard let draftState = workspace.meta.draftState,
          let document = decodeEditorDocument(from: draftState) else {
      return liveDocument
    }
    return document
  }

  private func decodeEditorDocument(from value: JSONValue) -> EditableMenuDocument? {
    guard let data = try? JSONEncoder().encode(value) else { return nil }
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return try? decoder.decode(EditableMenuDocument.self, from: data)
  }

  private func normalizedEditorWorkspace(_ workspace: MenuWorkspacePayload) -> MenuWorkspacePayload {
    var normalizedWorkspace = workspace
    normalizedWorkspace.workspace.revisions = normalizedWorkspaceRevisions(workspace.workspace.revisions, meta: workspace.meta)
    return normalizedWorkspace
  }

  private func normalizedWorkspaceRevisions(_ revisions: WorkspaceRevisions, meta: MenuMetaPayload) -> WorkspaceRevisions {
    var normalizedRevisions = revisions
    if normalizedRevisions.lastSentRevision == nil {
      normalizedRevisions.lastSentRevision = meta.lastSentTs
    }
    if normalizedRevisions.notificationBaselineRevision == nil {
      normalizedRevisions.notificationBaselineRevision = meta.lastSentTs
        ?? normalizedRevisions.lastSentRevision
        ?? normalizedRevisions.draftRevision
    }
    return normalizedRevisions
  }

  private func expectedNotificationBaselineRevision(for workspace: MenuWorkspacePayload) -> Int? {
    workspace.workspace.revisions.notificationBaselineRevision
      ?? workspace.workspace.revisions.lastSentRevision
      ?? workspace.meta.lastSentTs
      ?? workspace.workspace.revisions.draftRevision
  }

  private func expectedDraftRevision(for workspace: MenuWorkspacePayload) -> Int? {
    let hasSharedDraft = workspace.workspace.hasSharedDraft || workspace.workspace.sharedDraft.exists
    guard hasSharedDraft else { return nil }
    return workspace.workspace.revisions.draftRevision
      ?? workspace.workspace.sharedDraft.savedAt
      ?? workspace.meta.draftSavedTs
  }

  private func defaultPreviewSelection(for preview: MenuPreviewPayload?) -> Set<String> {
    guard let preview else { return [] }
    let notificationChangeIDs = preview.notificationChanges.map(\.id)
    if !notificationChangeIDs.isEmpty {
      return Set(notificationChangeIDs)
    }
    let sectionChangeIDs = preview.sections.flatMap(\.changes).map(\.id)
    if !sectionChangeIDs.isEmpty {
      return Set(sectionChangeIDs)
    }
    return Set(preview.selectionDefaults)
  }

  private func serverHasUnsentChanges(in workspace: MenuWorkspacePayload?) -> Bool {
    guard let workspace else { return false }
    if let hasUnsentChanges = workspace.workspace.hasUnsentChanges {
      return hasUnsentChanges
    }
    let normalizedStatus = workspace.workspace.menuStatus
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
    if normalizedStatus.contains("unsent") {
      return true
    }
    if normalizedStatus == "live" {
      return false
    }
    let liveRevision = workspace.workspace.revisions.liveRevision ?? workspace.meta.lastUpdatedTs
    let baselineRevision = expectedNotificationBaselineRevision(for: workspace)
    if let liveRevision, let baselineRevision {
      return liveRevision != baselineRevision
    }
    return workspace.workspace.hasSharedDraft
  }

  private func updateEditorStateFlags(for document: EditableMenuDocument) {
    guard let currentData = try? documentData(for: document) else {
      editorDirty = true
      editorHasLiveChanges = true
      return
    }
    editorDirty = draftBaselineDocumentData.map { currentData != $0 } ?? true
    editorHasLiveChanges = liveBaselineDocumentData.map { currentData != $0 } ?? true
  }

  private func run(_ label: String, operation: @escaping @MainActor (AppModel) async throws -> Void) async {
    isWorking = true
    defer { isWorking = false }
    do {
      try await operation(self)
    } catch {
      notice = AppNotice(tone: .danger, title: label, message: error.localizedDescription)
    }
  }
}


private struct InstalledEditorSessionState {
  var isWorking: Bool
  var notice: AppNotice?
  var currentPublicMenu: PublicMenuPayload?
  var currentEditorWorkspace: MenuWorkspacePayload?
  var currentEditorHistory: HistoryPayload?
  var currentEditorDocument: EditableMenuDocument?
  var currentEditorPreview: MenuPreviewPayload?
  var currentMenuId: String?
  var selectedPreviewChangeIDs: Set<String>
  var editorRefreshRequirement: EditorRefreshRequirement?
  var editorHasServerUnsentChanges: Bool
  var editorDirty: Bool
  var editorHasLiveChanges: Bool
}

private struct ItemDocumentState: Equatable {
  var item: MenuItemPayload
  var categoryKey: String
}

private struct ItemDocumentChange: Equatable {
  var state: ItemDocumentState?
  var relatedCategoryKeys: Set<String>
}

private struct CategoryStructureState: Equatable {
  var category: MenuCategoryPayload?
}

private struct DocumentDelta {
  var itemChanges: [String: ItemDocumentChange]
  var categoryChanges: [String: CategoryStructureState]
}

private struct OverlapSummary {
  var labels: [String]
  var usedFallback: Bool
}

private func messageForRefreshCompletion(
  requirement: EditorRefreshRequirement,
  strategy: EditorRefreshStrategy,
  isDirty: Bool
) -> String {
  if !requirement.hasLocalDrafts {
    return "The latest server version is loaded. You can continue editing."
  }
  switch strategy {
  case .keepLocalDrafts:
    return isDirty
      ? "The menu refreshed and your local drafts were reapplied on top of the latest server data."
      : "The menu refreshed and your local drafts already matched the latest server data."
  case .updateDrafts:
    return isDirty
      ? "The menu refreshed, overlapping drafts were updated from the server, and your non-overlapping local drafts were kept."
      : "The menu refreshed and the incoming server changes replaced the overlapping local drafts."
  }
}

private func classifyRemoteUpdateKind(previous: WorkspaceRevisions, next: WorkspaceRevisions) -> RemoteMenuUpdateKind {
  let liveChanged = previous.liveRevision != next.liveRevision
  let queueChanged = queueRevision(for: previous) != queueRevision(for: next)
  switch (liveChanged, queueChanged) {
  case (true, true):
    return .liveAndQueue
  case (true, false):
    return .liveMenu
  case (false, true), (false, false):
    return .queueState
  }
}

private func queueRevision(for revisions: WorkspaceRevisions) -> Int? {
  revisions.notificationBaselineRevision ?? revisions.lastSentRevision ?? revisions.draftRevision
}

private func buildOverlapLabels(
  base: EditableMenuDocument?,
  local: EditableMenuDocument?,
  remote: EditableMenuDocument
) -> OverlapSummary {
  guard let local else {
    return OverlapSummary(labels: [], usedFallback: false)
  }
  guard let base else {
    return OverlapSummary(labels: [], usedFallback: true)
  }

  let localDelta = makeDocumentDelta(base: base, updated: local)
  let remoteDelta = makeDocumentDelta(base: base, updated: remote)
  let overlappingItemIDs = Set(localDelta.itemChanges.keys).intersection(remoteDelta.itemChanges.keys)
  let overlappingCategoryKeys = Set(localDelta.categoryChanges.keys).intersection(remoteDelta.categoryChanges.keys)

  var labels: [String] = []
  for itemID in overlappingItemIDs.sorted() {
    let label = local.itemRecord(for: itemID)?.item.name.nilIfBlank
      ?? remote.itemRecord(for: itemID)?.item.name.nilIfBlank
      ?? base.itemRecord(for: itemID)?.item.name.nilIfBlank
      ?? itemID
    labels.append(label)
  }
  for key in overlappingCategoryKeys.sorted() {
    let label = local.categoryLabel(for: key).nilIfBlank
      ?? remote.categoryLabel(for: key).nilIfBlank
      ?? base.categoryLabel(for: key).nilIfBlank
      ?? key
    labels.append("Category: \(label)")
  }

  return OverlapSummary(labels: Array(Set(labels)).sorted(), usedFallback: false)
}

private func mergeDocuments(
  base: EditableMenuDocument,
  local: EditableMenuDocument,
  remote: EditableMenuDocument,
  strategy: EditorRefreshStrategy
) -> EditableMenuDocument {
  let localDelta = makeDocumentDelta(base: base, updated: local)
  let remoteDelta = makeDocumentDelta(base: base, updated: remote)
  let remoteItemIDs = Set(remoteDelta.itemChanges.keys)
  let remoteCategoryKeys = Set(remoteDelta.categoryChanges.keys)

  var merged = remote

  for key in localDelta.categoryChanges.keys.sorted(by: { lhs, rhs in
    let lhsOrder = localDelta.categoryChanges[lhs]?.category?.displayOrder ?? Int.max
    let rhsOrder = localDelta.categoryChanges[rhs]?.category?.displayOrder ?? Int.max
    if lhsOrder == rhsOrder { return lhs < rhs }
    return lhsOrder < rhsOrder
  }) {
    guard let categoryChange = localDelta.categoryChanges[key] else { continue }
    if strategy == .updateDrafts && remoteCategoryKeys.contains(key) {
      continue
    }
    merged.applyCategoryChange(key: key, change: categoryChange)
  }

  for itemID in localDelta.itemChanges.keys.sorted() {
    guard let itemChange = localDelta.itemChanges[itemID] else { continue }
    let hasRemoteItemConflict = remoteItemIDs.contains(itemID)
    let hasRemoteCategoryConflict = !remoteCategoryKeys.isDisjoint(with: itemChange.relatedCategoryKeys)
    if strategy == .updateDrafts && (hasRemoteItemConflict || hasRemoteCategoryConflict) {
      continue
    }
    merged.applyItemChange(itemID: itemID, change: itemChange)
  }

  merged.context = remote.context
  merged.meta = remote.meta
  merged.restaurant = remote.restaurant
  merged.normalizeIdentifiersForRuntime()
  return merged
}

private func makeDocumentDelta(base: EditableMenuDocument, updated: EditableMenuDocument) -> DocumentDelta {
  let baseItems = itemStateMap(for: base)
  let updatedItems = itemStateMap(for: updated)
  let baseCategories = categoryStateMap(for: base)
  let updatedCategories = categoryStateMap(for: updated)

  var itemChanges: [String: ItemDocumentChange] = [:]
  let itemIDs = Set(baseItems.keys).union(updatedItems.keys)
  for itemID in itemIDs {
    let baseState = baseItems[itemID]
    let updatedState = updatedItems[itemID]
    if baseState == updatedState {
      continue
    }
    var relatedKeys: Set<String> = []
    if let baseState {
      relatedKeys.insert(baseState.categoryKey)
    }
    if let updatedState {
      relatedKeys.insert(updatedState.categoryKey)
    }
    itemChanges[itemID] = ItemDocumentChange(state: updatedState, relatedCategoryKeys: relatedKeys)
  }

  var categoryChanges: [String: CategoryStructureState] = [:]
  let categoryKeys = Set(baseCategories.keys).union(updatedCategories.keys)
  for key in categoryKeys where baseCategories[key] != updatedCategories[key] {
    categoryChanges[key] = CategoryStructureState(category: updated.category(for: key))
  }

  return DocumentDelta(itemChanges: itemChanges, categoryChanges: categoryChanges)
}

private func itemStateMap(for document: EditableMenuDocument) -> [String: ItemDocumentState] {
  var states: [String: ItemDocumentState] = [:]
  for category in document.cats {
    for item in category.items {
      states[item.id] = ItemDocumentState(item: item, categoryKey: category.key)
    }
  }
  return states
}

private func categoryStateMap(for document: EditableMenuDocument) -> [String: CategoryStructureState] {
  var states: [String: CategoryStructureState] = [:]
  for category in document.cats where category.key != EditableMenuDocument.uncategorizedKey {
    var next = category
    next.items = []
    states[category.key] = CategoryStructureState(category: next)
  }
  return states
}

private extension EditableMenuDocument {
  mutating func applyCategoryChange(key: String, change: CategoryStructureState) {
    guard let category = change.category else {
      deleteCategory(key: key)
      return
    }
    upsertCategoryStructure(from: category)
  }

  mutating func applyItemChange(itemID: String, change: ItemDocumentChange) {
    if let state = change.state {
      let originalCategoryKey = itemRecord(for: itemID)?.categoryKey
      upsertItem(state.item, categoryKey: state.categoryKey, originalCategoryKey: originalCategoryKey)
    } else if let existingCategoryKey = itemRecord(for: itemID)?.categoryKey {
      deleteItem(itemID: itemID, categoryKey: existingCategoryKey)
    }
  }
}
