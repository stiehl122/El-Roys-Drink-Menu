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

struct EditorConflictState: Equatable {
  var envelope: LocalDraftEnvelope
  var loadedIntoEditor: Bool = false
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
      productLookup: ProductLookupClient()
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
  var editorConflictState: EditorConflictState?
  var editorHasSharedDraft = false
  var editorDirty = false

  @ObservationIgnored private let services: AppServices
  @ObservationIgnored private let sessionStore: any SessionStoring
  @ObservationIgnored private let offlineDraftStore: any OfflineDraftStoring
  @ObservationIgnored private var baselineDocumentData: Data?
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

  var canMutateRemoteEditorState: Bool {
    isAuthenticated && currentEditorWorkspace != nil && editorConflictState == nil
  }

  var canSaveDraftRemotely: Bool {
    canMutateRemoteEditorState && (editorCapabilities?.canSaveDraft ?? false)
  }

  var canSaveLiveRemotely: Bool {
    canMutateRemoteEditorState && (editorCapabilities?.canSaveLiveMenu ?? false)
  }

  var canLoadPublishPreview: Bool {
    canMutateRemoteEditorState && (editorCapabilities?.canPublishUpdates ?? false)
  }

  var canPublishRemotely: Bool {
    canLoadPublishPreview
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
    editorHasSharedDraft && !editorDirty
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
      notice = AppNotice(tone: .danger, title: "Unavailable", message: "Supabase config is missing from bootstrap.")
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
      notice = AppNotice(tone: .danger, title: "Unavailable", message: "Supabase config is missing from bootstrap.")
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
      notice = AppNotice(tone: .danger, title: "Unavailable", message: "Supabase config is missing from bootstrap.")
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
    editorConflictState = nil
    editorHasSharedDraft = false
    editorDirty = false
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
      async let workspaceResult = model.services.workspace.fetch(menuId: menuId, accessToken: accessToken)
      async let historyResult = model.services.history.fetch(menuId: menuId, accessToken: accessToken)
      let workspace = try await workspaceResult
      let history = try await historyResult

      model.currentEditorWorkspace = workspace
      model.currentEditorHistory = history
      model.currentEditorDocument = EditableMenuDocument(workspace: workspace)
      model.baselineDocumentData = try model.documentData(for: EditableMenuDocument(workspace: workspace))
      model.currentEditorPreview = nil
      model.selectedPreviewChangeIDs = []
      model.editorHasSharedDraft = workspace.workspace.hasSharedDraft
      model.editorDirty = false
      model.editorConflictState = nil
      model.currentPublicMenu = nil

      try model.restoreOfflineDraftIfNeeded()
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
      try await withThrowingTaskGroup(of: (String, MenuWorkspacePayload, HistoryPayload).self) { group in
        for menuId in menuIds {
          group.addTask {
            async let workspace = model.services.workspace.fetch(menuId: menuId, accessToken: accessToken)
            async let history = model.services.history.fetch(menuId: menuId, accessToken: accessToken)
            return try await (menuId, workspace, history)
          }
        }
        for try await (menuId, workspace, history) in group {
          menus[menuId] = workspace
          histories[menuId] = history
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

      model.currentEditorWorkspace?.workspace.hasSharedDraft = response.hasSharedDraft
      model.currentEditorWorkspace?.workspace.sharedDraft = response.sharedDraft ?? SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: "")
      model.currentEditorWorkspace?.workspace.revisions.draftRevision = response.savedAt
      model.editorHasSharedDraft = response.hasSharedDraft
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
      _ = try await model.services.liveSave.save(
        menuId: menuId,
        snapshot: snapshot,
        expectedLiveRevision: workspace.workspace.revisions.liveRevision,
        expectedDraftRevision: workspace.workspace.revisions.draftRevision,
        accessToken: accessToken
      )
      model.notice = AppNotice(tone: .success, title: "Live Menu Saved", message: "The live menu now matches the current native editor state.")
      await model.loadEditor(menuId: menuId)
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

  func loadPendingLocalDraftIntoEditor() {
    guard let envelope = editorConflictState?.envelope else { return }
    currentEditorDocument = envelope.document
    editorConflictState?.loadedIntoEditor = true
    editorDirty = true
  }

  func discardPendingLocalDraft() {
    guard let envelope = editorConflictState?.envelope ?? localDraftEnvelope else { return }
    try? offlineDraftStore.removeDraft(userId: envelope.userId, menuId: envelope.menuId)
    if let baseline = try? baselineEditorDocument() {
      currentEditorDocument = baseline
      editorDirty = false
    }
    editorConflictState = nil
  }

  var localDraftEnvelope: LocalDraftEnvelope? {
    editorConflictState?.envelope
  }

  func exactRoutePreviewURL(for menu: MenuRecord) -> URL {
    services.preview.exactRouteURL(for: menu)
  }

  func lookupBarcode(_ barcode: String) async throws -> ProductLookupResult {
    try await services.productLookup.lookup(upc: barcode)
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
    guard var document = currentEditorDocument else { return }
    change(&document)
    currentEditorDocument = document
    editorDirty = isDocumentDirty(document)
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

    let maybeEnvelope = try offlineDraftStore.loadDraft(userId: session.userID, menuId: document.menuId)
    guard let envelope = maybeEnvelope else { return }

    let revisions = workspace.workspace.revisions
    let matchesServer = envelope.baseLiveRevision == revisions.liveRevision &&
      envelope.baseDraftRevision == revisions.draftRevision

    if matchesServer {
      currentEditorDocument = envelope.document
      editorDirty = isDocumentDirty(envelope.document)
      editorConflictState = EditorConflictState(envelope: envelope, loadedIntoEditor: true)
      notice = AppNotice(tone: .neutral, title: "Local Draft Restored", message: "This editor reopened with the last device-only draft for this menu.")
    } else {
      editorConflictState = EditorConflictState(envelope: envelope, loadedIntoEditor: false)
      editorDirty = false
      notice = AppNotice(
        tone: .warning,
        title: "Reconciliation Required",
        message: "A local draft exists from older menu revisions. Review it before any remote save or publish."
      )
    }
  }

  private func persistOfflineDraftIfNeeded() {
    guard let session = authSession,
          let workspace = currentEditorWorkspace,
          let document = currentEditorDocument else { return }

    if editorDirty {
      let envelope = LocalDraftEnvelope(
        userId: session.userID,
        menuId: document.menuId,
        restaurantId: document.restaurantId,
        menuName: currentMenuRecord?.name ?? document.context.menuType.capitalized,
        savedAt: .now,
        baseLiveRevision: workspace.workspace.revisions.liveRevision,
        baseDraftRevision: workspace.workspace.revisions.draftRevision,
        document: document
      )
      try? offlineDraftStore.saveDraft(envelope)
      if editorConflictState != nil {
        editorConflictState?.envelope = envelope
      }
    } else {
      try? offlineDraftStore.removeDraft(userId: session.userID, menuId: document.menuId)
      if editorConflictState?.loadedIntoEditor == true {
        editorConflictState = nil
      }
    }
  }

  private func baselineEditorDocument() throws -> EditableMenuDocument? {
    guard let baselineDocumentData else { return nil }
    return try JSONDecoder().decode(EditableMenuDocument.self, from: baselineDocumentData)
  }

  private func isDocumentDirty(_ document: EditableMenuDocument) -> Bool {
    guard let baselineDocumentData else { return true }
    guard let current = try? documentData(for: document) else { return true }
    return current != baselineDocumentData
  }

  private func documentData(for document: EditableMenuDocument) throws -> Data {
    try encoder.encode(document)
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

private extension String {
  var nilIfBlank: String? {
    let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
