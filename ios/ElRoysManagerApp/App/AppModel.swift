import Foundation
import Observation

enum AuthScreenMode: String, CaseIterable, Identifiable {
  case signIn = "Sign In"
  case signUp = "Create Account"
  case reset = "Reset Password"

  var id: String { rawValue }
}

struct AppNotice: Identifiable, Equatable {
  let id = UUID()
  var tone: StatusBanner.Tone
  var title: String
  var message: String
}

enum EditorRefreshStrategy {
  case keepLocalDrafts
  case updateDrafts
}

enum RemoteMenuUpdateKind: Equatable {
  case sharedDraft
  case liveMenu
  case liveAndDraft

  var title: String {
    switch self {
    case .sharedDraft:
      return "Shared Draft Updated"
    case .liveMenu:
      return "Live Menu Updated"
    case .liveAndDraft:
      return "Live Menu And Draft Updated"
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
  var featuredTools: any FeaturedToolsClienting
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
      featuredTools: FeaturedToolsClient(environment: environment),
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

  var currentMenuId: String?
  var selectedPreviewChangeIDs: Set<String> = []
  var editorRefreshRequirement: EditorRefreshRequirement?
  var editorHasSharedDraft = false
  var editorDirty = false
  var editorHasLiveChanges = false

  @ObservationIgnored private let services: AppServices
  @ObservationIgnored private let sessionStore: any SessionStoring
  @ObservationIgnored private let offlineDraftStore: any OfflineDraftStoring
  @ObservationIgnored private var draftBaselineDocumentData: Data?
  @ObservationIgnored private var liveBaselineDocumentData: Data?
  @ObservationIgnored private let encoder = JSONEncoder()

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

  private var editorCapabilities: WorkspaceCapabilities? {
    currentEditorWorkspace?.workspace.capabilities
  }

  var hasLocalDraftChanges: Bool { editorDirty }

  var hasLiveMenuChanges: Bool { editorHasLiveChanges }

  var canMutateRemoteEditorState: Bool {
    isAuthenticated && currentEditorWorkspace != nil && editorRefreshRequirement == nil
  }

  var canSaveDraftRemotely: Bool {
    canMutateRemoteEditorState &&
      (editorCapabilities?.canSaveDraft ?? false) &&
      (hasLocalDraftChanges || showClearSharedDraft)
  }

  var canSaveLiveRemotely: Bool {
    canMutateRemoteEditorState &&
      (editorCapabilities?.canSaveLiveMenu ?? false) &&
      hasLiveMenuChanges
  }

  var canLoadPublishPreview: Bool {
    canMutateRemoteEditorState &&
      (editorCapabilities?.canPublishUpdates ?? false) &&
      hasLiveMenuChanges
  }

  var canPublishRemotely: Bool {
    canMutateRemoteEditorState &&
      (editorCapabilities?.canPublishUpdates ?? false) &&
      currentEditorPreview != nil &&
      hasLiveMenuChanges
  }

  var editorSharedDraftSummary: String? {
    guard let sharedDraft = currentEditorWorkspace?.workspace.sharedDraft, sharedDraft.exists else { return nil }
    var parts: [String] = []
    if let savedBy = sharedDraft.savedBy?.name, !savedBy.isEmpty {
      parts.append("Saved by \(savedBy)")
    }
    if let source = sharedDraft.source.nilIfBlank {
      parts.append(source == "ios_app" ? "from iOS" : "from \(source.replacingOccurrences(of: "_", with: " "))")
    }
    return parts.isEmpty ? nil : parts.joined(separator: " • ")
  }

  var showClearSharedDraft: Bool {
    editorHasSharedDraft && !hasLocalDraftChanges && !hasLiveMenuChanges
  }

  func start() async {
    guard isLaunching else { return }
    do {
      let anonymousBootstrap = try await services.bootstrap.fetch(accessToken: nil)
      bootstrap = anonymousBootstrap
      await restoreSession(using: anonymousBootstrap.config)
    } catch {
      notice = AppNotice(tone: .danger, title: "Bootstrap Failed", message: error.localizedDescription)
    }
    isLaunching = false
  }

  func signIn() async {
    guard let config = bootstrap?.config else {
      notice = AppNotice(tone: .danger, title: "Unavailable", message: "Auth bootstrap is unavailable.")
      return
    }
    guard !email.isEmpty, !password.isEmpty else {
      notice = AppNotice(tone: .warning, title: "Missing Fields", message: "Email and password are required.")
      return
    }
    await run("Signing In") { model in
      let session = try await model.services.auth.signIn(config: config, email: model.email, password: model.password)
      try model.persistSession(session)
      try await model.refreshAuthenticatedBootstrap(accessToken: session.accessToken, adoptedSession: session)
      model.password = ""
      model.notice = AppNotice(tone: .success, title: "Welcome Back", message: "Your manager session is ready.")
    }
  }

  func signUp() async {
    guard let config = bootstrap?.config else {
      notice = AppNotice(tone: .danger, title: "Unavailable", message: "Auth bootstrap is unavailable.")
      return
    }
    guard !email.isEmpty, !password.isEmpty, !displayName.isEmpty else {
      notice = AppNotice(tone: .warning, title: "Missing Fields", message: "Name, email, and password are required.")
      return
    }
    await run("Creating Account") { model in
      let session = try await model.services.auth.signUp(config: config, email: model.email, password: model.password, name: model.displayName)
      try model.persistSession(session)
      try await model.refreshAuthenticatedBootstrap(accessToken: session.accessToken, adoptedSession: session)
      model.password = ""
      model.notice = AppNotice(tone: .success, title: "Account Created", message: "The native manager is ready to use.")
    }
  }

  func sendPasswordReset() async {
    guard let config = bootstrap?.config else {
      notice = AppNotice(tone: .danger, title: "Unavailable", message: "Auth bootstrap is unavailable.")
      return
    }
    guard !email.isEmpty else {
      notice = AppNotice(tone: .warning, title: "Email Required", message: "Enter the staff email you want to reset.")
      return
    }
    await run("Requesting Reset") { model in
      let redirect = model.environment.publicOrigin.appendingPathComponent("manager")
      try await model.services.auth.sendReset(config: config, email: model.email, redirectTo: redirect)
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
    currentMenuId = nil
    editorRefreshRequirement = nil
    editorHasSharedDraft = false
    editorDirty = false
    editorHasLiveChanges = false
    draftBaselineDocumentData = nil
    liveBaselineDocumentData = nil
    notice = AppNotice(tone: .neutral, title: "Signed Out", message: "The stored device session has been cleared.")
  }

  func menu(for restaurantId: String, type: String) -> MenuRecord? {
    accessibleMenus.first { $0.restaurantId == restaurantId && $0.type.lowercased() == type.lowercased() }
  }

  func loadPublicMenu(menuId: String) async {
    guard bootstrap?.menus.contains(where: { $0.id == menuId }) == true else { return }
    currentMenuId = menuId
    await run("Loading Public Menu") { model in
      model.currentPublicMenu = try await model.services.publicMenu.fetch(menuId: menuId, accessToken: model.authSession?.accessToken)
    }
  }

  func loadEditor(menuId: String) async {
    guard let accessToken = authSession?.accessToken else {
      notice = AppNotice(tone: .warning, title: "Sign In Required", message: "Editing is only available to authenticated staff.")
      return
    }
    currentMenuId = menuId
    await run("Loading Editor") { model in
      let workspace = try await model.services.workspace.fetch(menuId: menuId, accessToken: accessToken)
      let history: HistoryPayload?
      do {
        history = try await model.services.history.fetch(menuId: menuId, accessToken: accessToken)
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
      let workspace = try await services.workspace.fetch(menuId: menuId, accessToken: accessToken)
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
    guard let accessToken = authSession?.accessToken else {
      notice = AppNotice(tone: .warning, title: "Sign In Required", message: "Restaurant tools require an authenticated staff session.")
      return
    }
    let menuIds = accessibleMenus.filter { $0.restaurantId == restaurantId }.map(\.id)
    guard !menuIds.isEmpty else { return }
    await run("Loading Restaurant Tools") { model in
      var menus: [String: MenuWorkspacePayload] = [:]
      var histories: [String: HistoryPayload] = [:]
      try await withThrowingTaskGroup(of: (String, MenuWorkspacePayload, HistoryPayload?).self) { group in
        for menuId in menuIds {
          group.addTask {
            let workspace = try await model.services.workspace.fetch(menuId: menuId, accessToken: accessToken)
            let history: HistoryPayload?
            do {
              history = try await model.services.history.fetch(menuId: menuId, accessToken: accessToken)
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
      model.currentToolsMenus = menus
      model.currentToolsHistories = histories
      model.currentMenuId = menuIds.first
    }
  }

  func loadPublishPreview() async {
    guard canLoadPublishPreview,
          let menuId = currentMenuId,
          let accessToken = authSession?.accessToken,
          let workspace = currentEditorWorkspace,
          let snapshot = editorSnapshot() else { return }

    await run("Building Preview") { model in
      let response = try await model.services.publish.preview(
        menuId: menuId,
        snapshot: snapshot,
        expectedLiveRevision: workspace.workspace.revisions.liveRevision,
        expectedDraftRevision: workspace.workspace.revisions.draftRevision,
        accessToken: accessToken,
        source: "ios_app"
      )
      let preview = response.preview
      model.currentEditorPreview = preview
      model.selectedPreviewChangeIDs = Set(preview?.selectionDefaults ?? [])
    }
  }

  func publishSelectedChanges() async {
    guard canPublishRemotely,
          let menuId = currentMenuId,
          let accessToken = authSession?.accessToken,
          let workspace = currentEditorWorkspace,
          let snapshot = editorSnapshot() else { return }

    await run("Publishing Updates") { model in
      let preview: MenuPreviewPayload?
      if let existing = model.currentEditorPreview {
        preview = existing
      } else {
        preview = try await model.services.publish.preview(
          menuId: menuId,
          snapshot: snapshot,
          expectedLiveRevision: workspace.workspace.revisions.liveRevision,
          expectedDraftRevision: workspace.workspace.revisions.draftRevision,
          accessToken: accessToken,
          source: "ios_app"
        ).preview
      }

      let selection = Array(model.selectedPreviewChangeIDs.isEmpty ? Set(preview?.selectionDefaults ?? []) : model.selectedPreviewChangeIDs)
      _ = try await model.services.publish.publish(
        menuId: menuId,
        snapshot: snapshot,
        selectedChangeIds: selection,
        expectedLiveRevision: workspace.workspace.revisions.liveRevision,
        expectedDraftRevision: workspace.workspace.revisions.draftRevision,
        accessToken: accessToken,
        source: "ios_app"
      )
      model.notice = AppNotice(tone: .success, title: "Published", message: "The live menu and notifications were updated from iOS.")
      await model.loadEditor(menuId: menuId)
    }
  }

  func saveRemoteDraft() async {
    guard canSaveDraftRemotely,
          let menuId = currentMenuId,
          let accessToken = authSession?.accessToken,
          let workspace = currentEditorWorkspace,
          let snapshot = editorSnapshot() else { return }

    await run(showClearSharedDraft ? "Clearing Draft" : "Saving Draft") { model in
      let response = model.showClearSharedDraft
        ? try await model.services.draft.clear(
            menuId: menuId,
            expectedDraftRevision: workspace.workspace.revisions.draftRevision,
            accessToken: accessToken,
            source: "ios_app"
          )
        : try await model.services.draft.save(
            menuId: menuId,
            snapshot: snapshot,
            expectedDraftRevision: workspace.workspace.revisions.draftRevision,
            accessToken: accessToken,
            source: "ios_app"
          )

      let currentDocument = try model.requireCurrentEditorDocument()
      let liveDocument = try model.currentLiveBaselineDocument() ?? currentDocument
      let nextSharedDraft = response.sharedDraft ?? SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: "")
      model.currentEditorWorkspace?.workspace.hasSharedDraft = response.hasSharedDraft
      model.currentEditorWorkspace?.workspace.sharedDraft = nextSharedDraft
      model.currentEditorWorkspace?.workspace.revisions.draftRevision = response.savedAt
      model.currentEditorWorkspace?.meta.draftState = response.hasSharedDraft ? model.jsonValue(for: currentDocument) : nil
      model.currentEditorWorkspace?.meta.draftSavedTs = response.savedAt
      model.currentEditorWorkspace?.meta.draftSavedByUserId = response.hasSharedDraft ? model.authSession?.userID : nil
      model.currentEditorWorkspace?.meta.draftSavedByName = response.hasSharedDraft ? model.authSession?.name : nil
      model.currentEditorWorkspace?.meta.draftSavedSource = response.hasSharedDraft ? "ios_app" : nil
      model.editorHasSharedDraft = response.hasSharedDraft
      model.rebaselineCurrentEditorToServer(
        liveDocument: liveDocument,
        sharedDraftDocument: response.hasSharedDraft
          ? currentDocument
          : liveDocument,
        revisions: model.currentEditorWorkspace?.workspace.revisions,
        hasSharedDraft: response.hasSharedDraft,
        sharedDraft: nextSharedDraft
      )
      model.notice = AppNotice(
        tone: .success,
        title: response.hasSharedDraft ? "Draft Saved" : "Draft Cleared",
        message: response.hasSharedDraft
          ? "The shared draft now matches your current iPhone edits."
          : "The shared draft marker has been removed from the server."
      )
    }
  }

  func saveLiveMenu() async {
    guard canSaveLiveRemotely,
          let menuId = currentMenuId,
          let accessToken = authSession?.accessToken,
          let workspace = currentEditorWorkspace,
          let snapshot = editorSnapshot() else { return }

    await run("Saving Live Menu") { model in
      var currentDocument = try model.requireCurrentEditorDocument()
      let response = try await model.services.liveSave.save(
        menuId: menuId,
        snapshot: snapshot,
        expectedLiveRevision: workspace.workspace.revisions.liveRevision,
        expectedDraftRevision: workspace.workspace.revisions.draftRevision,
        accessToken: accessToken
      )
      if model.editorHasSharedDraft {
        _ = try await model.services.draft.clear(
          menuId: menuId,
          expectedDraftRevision: workspace.workspace.revisions.draftRevision,
          accessToken: accessToken,
          source: "ios_app"
        )
      }
      if let ts = response.ts {
        currentDocument.meta.lastUpdatedTs = ts
        model.currentEditorWorkspace?.workspace.revisions.liveRevision = ts
        model.currentEditorDocument = currentDocument
        model.currentEditorWorkspace?.meta.lastUpdatedTs = ts
      }
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
        sharedDraftDocument: currentDocument,
        revisions: model.currentEditorWorkspace?.workspace.revisions,
        hasSharedDraft: false,
        sharedDraft: SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: "")
      )
      model.notice = AppNotice(tone: .success, title: "Live Menu Saved", message: "The live menu now matches the current native editor state.")
    }
  }

  func addCategory(label: String) {
    mutateEditorDocument { $0.addCategory(label: label) }
  }

  func renameCategory(key: String, label: String) {
    mutateEditorDocument { $0.renameCategory(key: key, label: label) }
  }

  func deleteCategory(key: String) {
    mutateEditorDocument { $0.deleteCategory(key: key) }
  }

  func moveItemToOffMenu(itemID: String, from categoryKey: String) {
    mutateEditorDocument { $0.removeItemToOffMenu(itemID: itemID, from: categoryKey) }
  }

  func restoreItemFromOffMenu(itemID: String, to categoryKey: String) {
    mutateEditorDocument { $0.restoreItemFromOffMenu(itemID: itemID, to: categoryKey) }
  }

  func deleteItem(itemID: String, categoryKey: String) {
    mutateEditorDocument { $0.deleteItem(itemID: itemID, categoryKey: categoryKey) }
  }

  func upsertItem(_ item: MenuItemPayload, categoryKey: String, originalCategoryKey: String?) {
    mutateEditorDocument { $0.upsertItem(item, categoryKey: categoryKey, originalCategoryKey: originalCategoryKey) }
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
      let remoteDocument = model.sharedDraftEditorDocument(from: freshWorkspace, liveDocument: remoteLiveDocument)
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

  func saveFeaturedAction(action: String, restaurantId: String, itemId: String? = nil, slotId: String? = nil, note: String? = nil, direction: Int? = nil) async {
    guard let accessToken = authSession?.accessToken else { return }
    let canEditFeatured = currentToolsMenus.values.contains {
      $0.restaurant?.id == restaurantId && ($0.workspace.capabilities.canManageRestaurantSpecials || $0.workspace.permissions.canEditRestaurantSpecials)
    }
    guard canEditFeatured else {
      notice = AppNotice(
        tone: .warning,
        title: "Unavailable",
        message: "Featured tools are not enabled for this staff session."
      )
      return
    }
    await run("Updating Featured") { model in
      try await model.services.featuredTools.mutate(
        action: action,
        restaurantId: restaurantId,
        itemId: itemId,
        slotId: slotId,
        note: note,
        direction: direction,
        accessToken: accessToken
      )
      await model.loadRestaurantTools(for: restaurantId)
    }
  }

  private func restoreSession(using config: BootstrapConfig?) async {
    guard let config else { return }
    do {
      var storedSession = try await sessionStore.loadSession(promptForBiometrics: true)
      if storedSession.isExpired {
        storedSession = try await services.auth.refresh(config: config, session: storedSession)
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
    return document.makeSnapshot(hasUnsavedChanges: editorDirty, hasSharedDraft: editorHasSharedDraft)
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
    let matchesServer = envelope.baseLiveRevision == revisions.liveRevision &&
      envelope.baseDraftRevision == revisions.draftRevision

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
            hasSharedDraft: envelope.baseDraftRevision != nil,
            sharedDraft: workspace.workspace.sharedDraft,
            permissions: workspace.workspace.permissions,
            capabilities: workspace.workspace.capabilities,
            revisions: WorkspaceRevisions(
              liveRevision: envelope.baseLiveRevision,
              draftRevision: envelope.baseDraftRevision,
              lastSentRevision: workspace.workspace.revisions.lastSentRevision
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
        restaurantId: document.restaurantId,
        menuName: currentMenuRecord?.name ?? document.context.menuType.capitalized,
        savedAt: .now,
        baseLiveRevision: workspace.workspace.revisions.liveRevision,
        baseDraftRevision: workspace.workspace.revisions.draftRevision,
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
      restaurantId: document.restaurantId,
      menuName: currentMenuRecord?.name ?? document.context.menuType.capitalized,
      savedAt: .now,
      baseLiveRevision: workspace.workspace.revisions.liveRevision,
      baseDraftRevision: workspace.workspace.revisions.draftRevision,
      baseDocument: try? draftBaselineEditorDocument(),
      document: document
    )
  }

  private func adoptEditorWorkspace(
    _ workspace: MenuWorkspacePayload,
    history: HistoryPayload?,
    document: EditableMenuDocument? = nil
  ) throws {
    let liveDocument = EditableMenuDocument(workspace: workspace)
    let sharedDraftDocument = sharedDraftEditorDocument(from: workspace, liveDocument: liveDocument)
    currentEditorWorkspace = workspace
    currentEditorHistory = history
    currentEditorDocument = document ?? sharedDraftDocument
    try setEditorBaselines(liveDocument: liveDocument, sharedDraftDocument: sharedDraftDocument)
    currentEditorPreview = nil
    selectedPreviewChangeIDs = []
    editorHasSharedDraft = workspace.workspace.hasSharedDraft
    editorRefreshRequirement = nil
    currentPublicMenu = nil
    updateEditorStateFlags(for: currentEditorDocument ?? sharedDraftDocument)
  }

  private func rebaselineCurrentEditorToServer(
    liveDocument: EditableMenuDocument,
    sharedDraftDocument: EditableMenuDocument,
    revisions: WorkspaceRevisions?,
    hasSharedDraft: Bool,
    sharedDraft: SharedDraftInfo?
  ) {
    guard let currentEditorDocument else { return }
    try? setEditorBaselines(liveDocument: liveDocument, sharedDraftDocument: sharedDraftDocument)
    if let revisions {
      currentEditorWorkspace?.workspace.revisions = revisions
    }
    currentEditorWorkspace?.workspace.hasSharedDraft = hasSharedDraft
    if let sharedDraft {
      currentEditorWorkspace?.workspace.sharedDraft = sharedDraft
    }
    editorHasSharedDraft = hasSharedDraft
    editorRefreshRequirement = nil
    updateEditorStateFlags(for: currentEditorDocument)
    currentEditorPreview = nil
    selectedPreviewChangeIDs = []
    persistOfflineDraftIfNeeded()
  }

  private func makeRefreshRequirement(
    currentWorkspace: MenuWorkspacePayload,
    freshWorkspace: MenuWorkspacePayload,
    freshHistory: HistoryPayload?,
    localDraft: LocalDraftEnvelope?,
    mergeBaseDocument: EditableMenuDocument?
  ) -> EditorRefreshRequirement {
    let remoteLiveDocument = EditableMenuDocument(workspace: freshWorkspace)
    let remoteDocument = sharedDraftEditorDocument(from: freshWorkspace, liveDocument: remoteLiveDocument)
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
      fallback.featuredGroups = remoteDocument.featuredGroups
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

  private func jsonValue(for document: EditableMenuDocument) -> JSONValue? {
    guard let data = try? documentData(for: document) else { return nil }
    return try? JSONDecoder().decode(JSONValue.self, from: data)
  }

  private func requireCurrentEditorDocument() throws -> EditableMenuDocument {
    guard let currentEditorDocument else {
      throw NSError(domain: "AppModel", code: 1, userInfo: [NSLocalizedDescriptionKey: "The editor is not loaded yet."])
    }
    return currentEditorDocument
  }

  private func setEditorBaselines(liveDocument: EditableMenuDocument, sharedDraftDocument: EditableMenuDocument) throws {
    liveBaselineDocumentData = try documentData(for: liveDocument)
    draftBaselineDocumentData = try documentData(for: sharedDraftDocument)
  }

  private func sharedDraftEditorDocument(from workspace: MenuWorkspacePayload, liveDocument: EditableMenuDocument) -> EditableMenuDocument {
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

  private func updateEditorStateFlags(for document: EditableMenuDocument) {
    editorDirty = isDocumentDirty(document)
    editorHasLiveChanges = isDocumentDifferentFromLive(document)
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
  let draftChanged = previous.draftRevision != next.draftRevision
  switch (liveChanged, draftChanged) {
  case (true, true):
    return .liveAndDraft
  case (true, false):
    return .liveMenu
  case (false, true), (false, false):
    return .sharedDraft
  }
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
  merged.featuredGroups = remote.featuredGroups
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

private extension String {
  var nilIfBlank: String? {
    let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
