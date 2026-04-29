import Foundation
@testable import ElRoysManagerApp

func routeStateMakeMenuRecord(id: String, type: String, restaurantId: String = "leroys-lounge") -> MenuRecord {
  MenuRecord(
    id: id,
    slug: type,
    name: type.capitalized,
    type: type,
    restaurantId: restaurantId,
    canManage: true
  )
}

func routeStateMakeRestaurantRecord(id: String, slug: String) -> RestaurantRecord {
  RestaurantRecord(
    id: id,
    slug: slug,
    name: "Leroy's Lounge",
    canAccess: true,
    design: nil,
    useCustomDesign: nil
  )
}

func routeStateMakeItem(
  id: String = "item-1",
  name: String = "House Margarita",
  desc: String = "",
  recipe: [String] = [],
  price: String = "$12",
  isEightySixed: Bool = false,
  displayOrder: Int = 0,
  onMenu: Bool = true,
  visibility: String = "public",
  upcharges: [ItemUpcharge] = [],
  showDescription: Bool = true,
  showRecipe: Bool = false,
  featuredEnabled: Bool = false
) -> MenuItemPayload {
  MenuItemPayload(
    id: id,
    name: name,
    desc: desc,
    recipe: recipe,
    price: price,
    isEightySixed: isEightySixed,
    displayOrder: displayOrder,
    onMenu: onMenu,
    visibility: visibility,
    upcharges: upcharges,
    showDescription: showDescription,
    showRecipe: showRecipe,
    featuredEnabled: featuredEnabled
  )
}

func routeStateMakeCategory(
  id: String = "cat-1",
  menuId: String? = "menu-drinks",
  key: String = "beer",
  label: String = "Beer",
  displayOrder: Int = 0,
  items: [MenuItemPayload] = []
) -> MenuCategoryPayload {
  MenuCategoryPayload(
    id: id,
    menuId: menuId,
    key: key,
    label: label,
    icon: "",
    color: "",
    sub: "",
    placeholder: "",
    displayOrder: displayOrder,
    items: items
  )
}

func routeStateMakeWorkspace(
  menuId: String = "menu-drinks",
  type: String = "drinks",
  restaurantId: String = "leroys-lounge",
  categories: [MenuCategoryPayload] = [],
  meta: MenuMetaPayload = MenuMetaPayload(
    botId: nil,
    notifications: nil,
    notificationMenuLink: nil,
    lastUpdatedTs: 10,
    lastSentTs: 10,
    lastSentState: nil,
    lastSentCategories: [],
    lastSentFeatured: [],
    draftState: nil,
    draftSavedTs: nil,
    draftSavedByUserId: nil,
    draftSavedByName: nil,
    draftSavedSource: nil
  ),
  restaurant: RestaurantRecord? = nil,
  restaurantTools: RestaurantToolsPayload? = nil,
  revisions: WorkspaceRevisions = WorkspaceRevisions(
    liveRevision: 10,
    draftRevision: nil,
    lastSentRevision: 10,
    notificationBaselineRevision: 10
  ),
  menuStatus: String = "",
  hasUnsentChanges: Bool? = nil,
  permissions: WorkspacePermissions = WorkspacePermissions(
    canManage: true,
    canAdmin: true,
    canEditRestaurantSpecials: false,
    canReadRestaurantTools: false
  ),
  capabilities: WorkspaceCapabilities = WorkspaceCapabilities(
    canSaveDraft: true,
    canSaveLiveMenu: true,
    canPublishUpdates: true,
    canManageRestaurantSpecials: false,
    canReadRestaurantTools: false,
    canManageAdminSettings: false,
    includesDraftAuthorship: true,
    includesRestaurantTools: false
  )
) -> MenuWorkspacePayload {
  let menu = routeStateMakeMenuRecord(id: menuId, type: type, restaurantId: restaurantId)
  let resolvedRestaurant = restaurant ?? routeStateMakeRestaurantRecord(id: restaurantId, slug: restaurantId)
  let resolvedSharedDraft = SharedDraftInfo(
    exists: false,
    savedAt: revisions.draftRevision,
    savedBy: nil,
    source: ""
  )
  return MenuWorkspacePayload(
    cats: categories,
    meta: meta,
    restaurant: resolvedRestaurant,
    restaurantTools: restaurantTools,
    context: MenuContext(kind: "menu-workspace", menu: menu),
    workspace: WorkspaceState(
      actor: ActorProfile(id: "staff-1", name: "Alex", role: "manager"),
      accessibleMenuIds: [menuId],
      hasSharedDraft: resolvedSharedDraft.exists,
      sharedDraft: resolvedSharedDraft,
      menuStatus: menuStatus,
      hasUnsentChanges: hasUnsentChanges,
      permissions: permissions,
      capabilities: capabilities,
      revisions: revisions
    ),
    capabilities: nil
  )
}

func routeStateMakePublicMenuPayload(menuId: String, type: String = "food") -> PublicMenuPayload {
  PublicMenuPayload(
    cats: [],
    meta: routeStateMakeWorkspace(menuId: menuId, type: type).meta,
    restaurant: routeStateMakeRestaurantRecord(id: "rest-1", slug: "leroys-lounge"),
    featuredItems: [],
    context: MenuContext(kind: "public-menu", menu: routeStateMakeMenuRecord(id: menuId, type: type)),
    capabilities: PublicMenuCapabilities(
      guestReadable: true,
      requiresAuth: false,
      includesDraftState: false,
      includesNotificationConfig: true
    )
  )
}

func routeStateMakeHistoryPayload(menuId: String = "menu-drinks", type: String = "drinks") -> HistoryPayload {
  HistoryPayload(
    logs: [],
    context: HistoryContext(
      kind: "menu-history",
      menu: routeStateMakeMenuRecord(id: menuId, type: type),
      restaurant: routeStateMakeRestaurantRecord(id: "rest-1", slug: "leroys-lounge")
    ),
    actor: ActorProfile(id: "staff-1", name: "Alex", role: "manager"),
    history: HistorySummary(days: 7, limit: 25, count: 0, scope: "menu", partial: false),
    capabilities: HistoryCapabilities(canReadHistory: true, includesMessage: true, includesSource: true)
  )
}

func routeStateMakeAuthSession() -> AuthSession {
  AuthSession(
    accessToken: "token",
    refreshToken: "refresh",
    expiresAt: Date().addingTimeInterval(3600),
    userID: "staff-1",
    email: "staff@example.com",
    name: "Alex",
    role: "manager",
    accessibleMenuIds: ["menu-drinks", "menu-food"]
  )
}

func routeStateMakeServices(
  workspaceClient: WorkspaceClienting = RouteStateStubWorkspaceClient(payloads: [routeStateMakeWorkspace(menuId: "menu-drinks")]),
  publicMenuClient: PublicMenuClienting = RouteStateStubPublicMenuClient(payload: routeStateMakePublicMenuPayload(menuId: "menu-food")),
  publicMenuRevisionClient: PublicMenuRevisionClienting = RouteStateStubPublicMenuRevisionClient(payload: MenuRevisionPayload(menuId: "menu-drinks", revision: nil, lastUpdatedTs: 10, lastSentTs: 10)),
  historyClient: HistoryClienting = RouteStateStubHistoryClient(payload: routeStateMakeHistoryPayload()),
  liveSaveClient: LiveSaveClienting? = nil
) -> AppServices {
  let resolvedLiveSaveClient = liveSaveClient
    ?? RouteStateStubLiveSaveClient(workspaceClient: workspaceClient as? RouteStateStubWorkspaceClient)
  return AppServices(
    bootstrap: RouteStateStubBootstrapClient(),
    auth: RouteStateStubAuthClient(),
    workspace: workspaceClient,
    publicMenu: publicMenuClient,
    publicMenuRevision: publicMenuRevisionClient,
    draft: RouteStateStubDraftClient(),
    liveSave: resolvedLiveSaveClient,
    publish: RouteStateStubPublishClient(),
    history: historyClient,
    preview: RouteStateStubPreviewClient(),
    productLookup: RouteStateStubProductLookupClient()
  )
}

enum RouteStateTestError: LocalizedError {
  case message(String)

  var errorDescription: String? {
    switch self {
    case .message(let value):
      return value
    }
  }
}

final class RouteStateTestSessionStore: SessionStoring {
  var biometricUnlockEnabled: Bool = false
  private var storedSession: AuthSession?

  func loadSession(promptForBiometrics: Bool) async throws -> AuthSession {
    guard let storedSession else {
      throw SessionStoreError.notFound
    }
    return storedSession
  }

  func saveSession(_ session: AuthSession) throws {
    storedSession = session
  }

  func clearSession() throws {
    storedSession = nil
  }
}

final class RouteStateTestOfflineDraftStore: OfflineDraftStoring {
  var clientScopeId: String = "test-device"
  var draft: LocalDraftEnvelope?
  var loadError: Error?
  var savedEnvelopes: [LocalDraftEnvelope] = []
  var removedDraftKeys: [String] = []

  func loadDraft(userId: String, menuId: String) throws -> LocalDraftEnvelope? {
    if let loadError {
      throw loadError
    }
    return draft
  }

  func saveDraft(_ envelope: LocalDraftEnvelope) throws {
    draft = envelope
    savedEnvelopes.append(envelope)
  }

  func removeDraft(userId: String, menuId: String) throws {
    removedDraftKeys.append("\(userId)::\(menuId)")
    if draft?.userId == userId && draft?.menuId == menuId {
      draft = nil
    }
  }

  func loadAllDrafts() throws -> [LocalDraftEnvelope] {
    draft.map { [$0] } ?? []
  }
}

final class RouteStateStubBootstrapClient: BootstrapClienting {
  func fetch(accessToken: String?) async throws -> SessionBootstrapPayload {
    SessionBootstrapPayload(
      actor: ActorProfile(id: "staff-1", name: "Alex", role: "manager"),
      appVersion: "test",
      defaultMenuId: "menu-drinks",
      capabilities: BootstrapCapabilities(canAccessManager: true, canAccessAdmin: false, canManageAnyMenu: true),
      menus: [
        routeStateMakeMenuRecord(id: "menu-drinks", type: "drinks"),
        routeStateMakeMenuRecord(id: "menu-food", type: "food")
      ],
      restaurants: [
        routeStateMakeRestaurantRecord(id: "leroys-lounge", slug: "leroyslounge")
      ],
      access: BootstrapAccess(accessibleMenuIds: ["menu-drinks", "menu-food"], accessibleRestaurantIds: ["leroys-lounge"]),
      config: nil,
      readiness: nil,
      loopAudit: nil
    )
  }
}

final class RouteStateStubAuthClient: AuthClienting {
  func signIn(email: String, password: String) async throws -> AuthSession {
    throw RouteStateTestError.message("Unused in this test")
  }

  func signUp(email: String, password: String, name: String) async throws -> AuthSession {
    throw RouteStateTestError.message("Unused in this test")
  }

  func refresh(session: AuthSession) async throws -> AuthSession {
    throw RouteStateTestError.message("Unused in this test")
  }

  func sendReset(email: String, redirectTo: URL) async throws {
    throw RouteStateTestError.message("Unused in this test")
  }

  func requestAccountDeletion(accessToken: String) async throws {
    throw RouteStateTestError.message("Unused in this test")
  }
}

final class RouteStateStubWorkspaceClient: WorkspaceClienting {
  private var payloadsByMenuID: [String: MenuWorkspacePayload]
  private let fallbackPayload: MenuWorkspacePayload?

  init(payloads: [MenuWorkspacePayload]) {
    self.payloadsByMenuID = Dictionary(
      uniqueKeysWithValues: payloads.compactMap { payload in
        guard let menuId = payload.context.menu?.id else { return nil }
        return (menuId, payload)
      }
    )
    self.fallbackPayload = payloads.first
  }

  func fetch(menuId: String, accessToken: String) async throws -> MenuWorkspacePayload {
    if let payload = payloadsByMenuID[menuId] {
      return payload
    }
    if let payload = fallbackPayload {
      return payload
    }
    throw RouteStateTestError.message("Missing workspace payload for \(menuId)")
  }

  func applyLiveSave(menuId: String, snapshot: MenuSnapshotPayload, ts: Int?) {
    guard var payload = payloadsByMenuID[menuId] ?? fallbackPayload else { return }
    payload.cats = snapshot.cats
    payload.meta = snapshot.meta
    payload.restaurant = snapshot.restaurant
    if let ts {
      payload.meta.lastUpdatedTs = ts
      payload.workspace.revisions.liveRevision = ts
    }
    payloadsByMenuID[menuId] = payload
  }

  func applyFeaturedGroups(restaurantId: String, groups: [FeaturedGroup]) {
    let menuIDs = payloadsByMenuID.keys.sorted()
    for menuID in menuIDs {
      guard var payload = payloadsByMenuID[menuID] else { continue }
      guard payload.restaurant?.id == restaurantId else { continue }
      let existingTools = payload.restaurantTools
      payload.restaurantTools = RestaurantToolsPayload(
        restaurantId: restaurantId,
        featuredGroups: groups,
        siblingCatalog: existingTools?.siblingCatalog ?? [],
        compatibility: existingTools?.compatibility
      )
      payloadsByMenuID[menuID] = payload
    }
  }
}

final class RouteStateStubPublicMenuClient: PublicMenuClienting {
  private let payload: PublicMenuPayload

  init(payload: PublicMenuPayload) {
    self.payload = payload
  }

  func fetch(menuId: String, accessToken: String?) async throws -> PublicMenuPayload {
    payload
  }
}

final class RouteStateStubPublicMenuRevisionClient: PublicMenuRevisionClienting {
  private let payload: MenuRevisionPayload

  init(payload: MenuRevisionPayload) {
    self.payload = payload
  }

  func fetchRevision(menuId: String) async throws -> MenuRevisionPayload {
    payload
  }
}

final class RouteStateStubDraftClient: DraftClienting {
  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse {
    throw RouteStateTestError.message("Unused in this test")
  }

  func clear(menuId: String, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse {
    throw RouteStateTestError.message("Unused in this test")
  }
}

final class RouteStateStubLiveSaveClient: LiveSaveClienting {
  private let workspaceClient: RouteStateStubWorkspaceClient?
  private let ts: Int

  init(workspaceClient: RouteStateStubWorkspaceClient? = nil, ts: Int = 20) {
    self.workspaceClient = workspaceClient
    self.ts = ts
  }

  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String) async throws -> PublishResponse {
    workspaceClient?.applyLiveSave(menuId: menuId, snapshot: snapshot, ts: ts)
    return PublishResponse(
      ok: true,
      action: "save",
      ts: ts,
      preview: nil,
      currentRevisions: nil,
      notificationStatus: nil,
      warnings: nil,
      warningMessage: nil,
      successMessage: nil,
      selectedChangeIds: nil
    )
  }
}

final class RouteStateStubPublishClient: PublishClienting {
  func preview(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, expectedNotificationRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    throw RouteStateTestError.message("Unused in this test")
  }

  func publish(menuId: String, snapshot: MenuSnapshotPayload, selectedChangeIds: [String], expectedLiveRevision: Int?, expectedDraftRevision: Int?, expectedNotificationRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    throw RouteStateTestError.message("Unused in this test")
  }
}

final class RouteStateStubHistoryClient: HistoryClienting {
  let payload: HistoryPayload

  init(payload: HistoryPayload) {
    self.payload = payload
  }

  func fetch(menuId: String, accessToken: String) async throws -> HistoryPayload {
    payload
  }
}

final class RouteStateStubPreviewClient: PreviewClienting {
  func exactRouteURL(for menu: MenuRecord) -> URL {
    URL(string: "https://example.com") ?? URL(fileURLWithPath: "/")
  }
}

final class RouteStateStubProductLookupClient: ProductLookupClienting {
  func lookup(upc: String, menuId: String, accessToken: String) async throws -> ProductLookupResult {
    throw RouteStateTestError.message("Unused in this test")
  }
}
