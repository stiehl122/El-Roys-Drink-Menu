import Foundation

enum JSONValue: Codable, Equatable, Hashable {
  case string(String)
  case number(Double)
  case bool(Bool)
  case object([String: JSONValue])
  case array([JSONValue])
  case null

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else {
      throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .string(let value):
      try container.encode(value)
    case .number(let value):
      try container.encode(value)
    case .bool(let value):
      try container.encode(value)
    case .object(let value):
      try container.encode(value)
    case .array(let value):
      try container.encode(value)
    case .null:
      try container.encodeNil()
    }
  }
}

enum AppEnvironmentName: String, Codable {
  case production = "Production"
  case preview = "Preview"
}

struct AppEnvironment: Equatable {
  let name: AppEnvironmentName
  let baseURL: URL
  let publicOrigin: URL
  let displayName: String

  var isProduction: Bool { name == .production }

  static func fromBundle(_ bundle: Bundle = .main) -> AppEnvironment {
    let fallbackOrigin = URL(string: "https://el-roys-drink-menu.vercel.app")!
    let rawName = String(
      bundle.object(forInfoDictionaryKey: "APPEnvironmentName") as? String
        ?? bundle.object(forInfoDictionaryKey: "AppEnvironmentName") as? String
        ?? "Preview"
    ).trimmingCharacters(in: .whitespacesAndNewlines)
    let baseURLString = String(
      bundle.object(forInfoDictionaryKey: "APPBaseURL") as? String
        ?? bundle.object(forInfoDictionaryKey: "AppBaseURL") as? String
        ?? fallbackOrigin.absoluteString
    ).trimmingCharacters(in: .whitespacesAndNewlines)
    let publicOriginString = String(
      bundle.object(forInfoDictionaryKey: "APPPublicOrigin") as? String
        ?? bundle.object(forInfoDictionaryKey: "AppPublicOrigin") as? String
        ?? baseURLString
    ).trimmingCharacters(in: .whitespacesAndNewlines)

    return AppEnvironment(
      name: AppEnvironmentName(rawValue: rawName) ?? .preview,
      baseURL: URL(string: baseURLString) ?? fallbackOrigin,
      publicOrigin: URL(string: publicOriginString) ?? fallbackOrigin,
      displayName: rawName
    )
  }
}

struct AuthSession: Codable, Equatable {
  var accessToken: String
  var refreshToken: String
  var expiresAt: Date
  var userID: String
  var email: String
  var name: String
  var role: String
  var accessibleMenuIds: [String]

  var isExpired: Bool {
    expiresAt <= Date().addingTimeInterval(120)
  }
}

struct ActorProfile: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var name: String
  var role: String
}

struct BootstrapAccess: Codable, Equatable {
  var accessibleMenuIds: [String]
  var accessibleRestaurantIds: [String]
}

struct BootstrapCapabilities: Codable, Equatable {
  var canAccessManager: Bool
  var canAccessAdmin: Bool
  var canManageAnyMenu: Bool
}

struct RestaurantRecord: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var slug: String
  var name: String
  var canAccess: Bool?
  var design: JSONValue?
  var useCustomDesign: Bool?
}

struct MenuRecord: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var slug: String
  var name: String
  var type: String
  var restaurantId: String
  var canManage: Bool?
}

struct BootstrapConfig: Codable, Equatable {
  var supabaseUrl: String
  var supabaseAnonKey: String
}

struct BootstrapReadiness: Codable, Equatable {
  var hasSupabaseConfig: Bool
  var previewAuditAvailable: Bool
}

struct LoopAuditInfo: Codable, Equatable {
  var available: Bool
  var label: String
  var mode: String
  var previewOnly: Bool
}

struct SessionBootstrapPayload: Codable, Equatable {
  var actor: ActorProfile?
  var appVersion: String
  var defaultMenuId: String?
  var capabilities: BootstrapCapabilities
  var menus: [MenuRecord]
  var restaurants: [RestaurantRecord]
  var access: BootstrapAccess
  var config: BootstrapConfig?
  var readiness: BootstrapReadiness?
  var loopAudit: LoopAuditInfo?
}

struct SharedDraftSavedBy: Codable, Equatable, Hashable {
  var id: String
  var name: String
}

struct SharedDraftInfo: Codable, Equatable {
  var exists: Bool
  var savedAt: Int?
  var savedBy: SharedDraftSavedBy?
  var source: String
}

struct WorkspacePermissions: Codable, Equatable {
  var canManage: Bool
  var canAdmin: Bool
  var canEditRestaurantSpecials: Bool
  var canReadRestaurantTools: Bool
}

struct WorkspaceCapabilities: Codable, Equatable {
  var canSaveDraft: Bool
  var canSaveLiveMenu: Bool
  var canPublishUpdates: Bool
  var canManageRestaurantSpecials: Bool
  var canReadRestaurantTools: Bool
  var canManageAdminSettings: Bool
  var includesDraftAuthorship: Bool
  var includesRestaurantTools: Bool
}

struct WorkspaceRevisions: Codable, Equatable {
  var liveRevision: Int?
  var draftRevision: Int?
  var lastSentRevision: Int?
}

struct WorkspaceState: Codable, Equatable {
  var actor: ActorProfile?
  var accessibleMenuIds: [String]
  var hasSharedDraft: Bool
  var sharedDraft: SharedDraftInfo
  var permissions: WorkspacePermissions
  var capabilities: WorkspaceCapabilities
  var revisions: WorkspaceRevisions
}

struct MenuContext: Codable, Equatable {
  var kind: String
  var menu: MenuRecord?
}

struct ItemUpcharge: Codable, Equatable, Hashable, Identifiable {
  var id: UUID = UUID()
  var label: String
  var price: String

  enum CodingKeys: String, CodingKey {
    case label
    case price
  }
}

struct MenuItemPayload: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var name: String
  var desc: String
  var recipe: [String]
  var price: String
  var isEightySixed: Bool
  var displayOrder: Int
  var onMenu: Bool
  var visibility: String
  var upcharges: [ItemUpcharge]
  var showDescription: Bool
  var showRecipe: Bool
}

struct MenuCategoryPayload: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var menuId: String?
  var key: String
  var label: String
  var icon: String
  var color: String
  var sub: String
  var placeholder: String
  var displayOrder: Int
  var items: [MenuItemPayload]
}

struct MenuMetaPayload: Codable, Equatable {
  var botId: String?
  var notifications: JSONValue?
  var notificationMenuLink: String?
  var lastUpdatedTs: Int?
  var lastSentTs: Int?
  var lastSentState: JSONValue?
  var lastSentCategories: [String]
  var lastSentFeatured: [String]
  var draftState: JSONValue?
  var draftSavedTs: Int?
  var draftSavedByUserId: String?
  var draftSavedByName: String?
  var draftSavedSource: String?

  init(
    botId: String? = nil,
    notifications: JSONValue? = nil,
    notificationMenuLink: String? = nil,
    lastUpdatedTs: Int? = nil,
    lastSentTs: Int? = nil,
    lastSentState: JSONValue? = nil,
    lastSentCategories: [String] = [],
    lastSentFeatured: [String] = [],
    draftState: JSONValue? = nil,
    draftSavedTs: Int? = nil,
    draftSavedByUserId: String? = nil,
    draftSavedByName: String? = nil,
    draftSavedSource: String? = nil
  ) {
    self.botId = botId
    self.notifications = notifications
    self.notificationMenuLink = notificationMenuLink
    self.lastUpdatedTs = lastUpdatedTs
    self.lastSentTs = lastSentTs
    self.lastSentState = lastSentState
    self.lastSentCategories = lastSentCategories
    self.lastSentFeatured = lastSentFeatured
    self.draftState = draftState
    self.draftSavedTs = draftSavedTs
    self.draftSavedByUserId = draftSavedByUserId
    self.draftSavedByName = draftSavedByName
    self.draftSavedSource = draftSavedSource
  }
}

struct FeaturedSlot: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var itemId: String
  var sellNote: String
  var displayOrder: Int
  var confirmedAt: String?
  var confirmedBy: String?
  var item: MenuItemPayload?
}

extension MenuRecord {
  var isFoodMenu: Bool { type.lowercased() == "food" }
  var displayTypeLabel: String { isFoodMenu ? "Food" : "Drinks" }
}

extension RestaurantRecord {
  var routePath: String {
    slug == "leroyslounge" ? "/leroyslounge" : "/elroyscantina"
  }
}

extension MenuWorkspacePayload {
  var menu: MenuRecord? { context.menu }
}

extension PublicMenuPayload {
  var menu: MenuRecord? { context.menu }
}

extension HistoryPayload {
  var menu: MenuRecord? { context.menu }
}

struct FeaturedGroup: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var name: String
  var displayOrder: Int
  var slots: [FeaturedSlot]
}

struct SiblingCatalogItem: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var name: String
  var cat: String
  var menuId: String
  var menuLabel: String
  var onMenu: Bool
  var visibility: String
}

struct RestaurantToolsCompatibility: Codable, Equatable {
  var contract: String?
  var featuredSource: String?
}

struct RestaurantToolsPayload: Codable, Equatable {
  var restaurantId: String
  var featuredGroups: [FeaturedGroup]
  var siblingCatalog: [SiblingCatalogItem]
  var compatibility: RestaurantToolsCompatibility?
}

struct MenuWorkspacePayload: Codable, Equatable {
  var cats: [MenuCategoryPayload]
  var meta: MenuMetaPayload
  var restaurant: RestaurantRecord?
  var restaurantTools: RestaurantToolsPayload?
  var context: MenuContext
  var workspace: WorkspaceState
  var capabilities: WorkspaceCapabilities?
}

struct PublicMenuCapabilities: Codable, Equatable {
  var guestReadable: Bool
  var requiresAuth: Bool
  var includesDraftState: Bool
  var includesNotificationConfig: Bool
}

struct PublicMenuPayload: Codable, Equatable {
  var cats: [MenuCategoryPayload]
  var meta: MenuMetaPayload
  var restaurant: RestaurantRecord?
  var featuredGroups: [FeaturedGroup]
  var context: MenuContext
  var capabilities: PublicMenuCapabilities
}

struct HistoryContext: Codable, Equatable {
  var kind: String
  var menu: MenuRecord?
  var restaurant: RestaurantRecord?
}

struct HistorySummary: Codable, Equatable {
  var days: Int
  var limit: Int
  var count: Int
  var scope: String
  var partial: Bool
}

struct HistoryCapabilities: Codable, Equatable {
  var canReadHistory: Bool
  var includesMessage: Bool
  var includesSource: Bool
}

struct HistoryLogEntry: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var menuId: String
  var userId: String
  var userName: String
  var diff: [JSONValue]
  var message: String
  var source: String
  var createdAt: String
  var menu: MenuRecord?
}

struct HistoryPayload: Codable, Equatable {
  var logs: [HistoryLogEntry]
  var context: HistoryContext
  var actor: ActorProfile?
  var history: HistorySummary
  var capabilities: HistoryCapabilities
}

struct SaveOnlyChange: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var label: String
  var message: String
}

struct PreviewDiffSection: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var icon: String
  var label: String
  var added: [String]
  var removed: [String]
  var eightySixed: [String]
  var restored: [String]
  var displayOrder: Int
}

struct PreviewChange: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var kind: String
  var text: String
  var name: String
  var sectionId: String
  var sectionLabel: String
  var icon: String
}

struct PreviewSection: Codable, Equatable, Hashable, Identifiable {
  var id: String
  var icon: String
  var label: String
  var changes: [PreviewChange]
}

struct PreviewMetadata: Codable, Equatable {
  var serverOwned: Bool
  var contract: String
  var currentFeaturedIds: [String]
}

struct MenuPreviewPayload: Codable, Equatable {
  var mode: String
  var hasChanges: Bool
  var hasLocalDraft: Bool
  var hasSharedDraft: Bool
  var hasNotificationChanges: Bool
  var hasSaveOnlyChanges: Bool
  var diff: [PreviewDiffSection]
  var sections: [PreviewSection]
  var notificationChanges: [PreviewChange]
  var saveOnlyChanges: [SaveOnlyChange]
  var patchMessage: String
  var truncated: Bool
  var selectionDefaults: [String]
  var metadata: PreviewMetadata
}

struct NotificationStatus: Codable, Equatable {
  var ok: Bool
  var skipped: Bool?
  var partial: Bool?
  var statusCode: Int?
  var summary: JSONValue?
  var results: JSONValue?
}

struct PublishResponse: Codable, Equatable {
  var ok: Bool
  var action: String?
  var ts: Int?
  var preview: MenuPreviewPayload?
  var currentRevisions: WorkspaceRevisions?
  var notificationStatus: NotificationStatus?
  var warnings: [String]?
  var warningMessage: String?
  var successMessage: String?
  var selectedChangeIds: [String]?
}

struct DraftCommandResponse: Codable, Equatable {
  var ok: Bool
  var status: String
  var menuId: String
  var savedAt: Int?
  var hasSharedDraft: Bool
  var sharedDraft: SharedDraftInfo?
}

struct ProductLookupResult: Codable, Equatable {
  var barcode: String
  var name: String
  var description: String
}

struct MenuSnapshotContext: Codable, Equatable {
  var menuId: String
  var restaurantId: String
  var menuType: String
}

struct SnapshotPreviewContext: Codable, Equatable {
  var dirty: Bool
  var hasSharedDraft: Bool
  var saveOnlyChanges: [SaveOnlyChange]
}

struct MenuSnapshotPayload: Codable, Equatable {
  var context: MenuSnapshotContext
  var cats: [MenuCategoryPayload]
  var meta: MenuMetaPayload
  var restaurant: RestaurantRecord?
  var featuredGroups: [FeaturedGroup]
  var saveOnlyChanges: [SaveOnlyChange]
  var previewContext: SnapshotPreviewContext
}

struct LocalDraftEnvelope: Codable, Equatable, Identifiable {
  var userId: String
  var menuId: String
  var restaurantId: String
  var menuName: String
  var savedAt: Date
  var baseLiveRevision: Int?
  var baseDraftRevision: Int?
  var document: EditableMenuDocument

  var id: String {
    "\(userId)::\(menuId)"
  }
}

struct EditableMenuDocument: Codable, Equatable {
  static let uncategorizedKey = "__uncategorized__"

  var context: MenuSnapshotContext
  var cats: [MenuCategoryPayload]
  var meta: MenuMetaPayload
  var restaurant: RestaurantRecord?
  var featuredGroups: [FeaturedGroup]

  init(workspace: MenuWorkspacePayload) {
    context = MenuSnapshotContext(
      menuId: workspace.context.menu?.id ?? "",
      restaurantId: workspace.context.menu?.restaurantId ?? "",
      menuType: workspace.context.menu?.type ?? "drinks"
    )
    cats = workspace.cats.sorted { $0.displayOrder < $1.displayOrder }
    meta = workspace.meta
    restaurant = workspace.restaurant
    featuredGroups = workspace.restaurantTools?.featuredGroups ?? []
  }

  var menuId: String { context.menuId }
  var restaurantId: String { context.restaurantId }
  var isFoodMenu: Bool { context.menuType.lowercased() == "food" }

  var uncategorizedItems: [MenuItemPayload] {
    cats.first(where: { $0.key == Self.uncategorizedKey })?.items ?? []
  }

  var visibleCategories: [MenuCategoryPayload] {
    cats.filter { $0.key != Self.uncategorizedKey }
  }

  func hasDuplicate(named name: String, in categoryKey: String, excluding excludedID: String? = nil) -> Bool {
    let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalized.isEmpty else { return false }
    guard let category = cats.first(where: { $0.key == categoryKey }) else { return false }
    return category.items.contains { item in
      if let excludedID, item.id == excludedID { return false }
      let itemName = item.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard itemName == normalized else { return false }
      if categoryKey == Self.uncategorizedKey { return true }
      return item.onMenu
    }
  }

  mutating func ensureUncategorizedCategory() {
    guard !cats.contains(where: { $0.key == Self.uncategorizedKey }) else { return }
    cats.append(
      MenuCategoryPayload(
        id: "local-\(UUID().uuidString.lowercased())",
        menuId: menuId,
        key: Self.uncategorizedKey,
        label: "Uncategorized",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 9_999,
        items: []
      )
    )
  }

  mutating func addCategory(label: String, icon: String = "", color: String = "") {
    let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    let baseKey = trimmed
      .lowercased()
      .replacingOccurrences(of: "'", with: "")
      .replacingOccurrences(of: "&", with: "and")
      .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
      .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    var candidate = baseKey.isEmpty ? "category" : baseKey
    var suffix = 2
    let existingKeys = Set(cats.map(\.key))
    while existingKeys.contains(candidate) {
      candidate = "\(baseKey)-\(suffix)"
      suffix += 1
    }
    cats.append(
      MenuCategoryPayload(
        id: "local-\(UUID().uuidString.lowercased())",
        menuId: menuId,
        key: candidate,
        label: trimmed,
        icon: icon,
        color: color,
        sub: "",
        placeholder: "",
        displayOrder: visibleCategories.count,
        items: []
      )
    )
    renumberCategories()
  }

  mutating func renameCategory(key: String, label: String) {
    guard let index = cats.firstIndex(where: { $0.key == key }) else { return }
    cats[index].label = label.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  mutating func moveVisibleCategories(from source: IndexSet, to destination: Int) {
    var regular = visibleCategories
    regular.move(fromOffsets: source, toOffset: destination)
    let uncategorized = cats.first(where: { $0.key == Self.uncategorizedKey })
    cats = regular + (uncategorized.map { [$0] } ?? [])
    renumberCategories()
  }

  mutating func deleteCategory(key: String) {
    guard key != Self.uncategorizedKey else { return }
    guard let index = cats.firstIndex(where: { $0.key == key }) else { return }
    ensureUncategorizedCategory()
    let removed = cats.remove(at: index)
    if let uncatIndex = cats.firstIndex(where: { $0.key == Self.uncategorizedKey }) {
      let migrated = removed.items.map { item in
        var next = item
        next.onMenu = false
        next.displayOrder = cats[uncatIndex].items.count
        return next
      }
      cats[uncatIndex].items.append(contentsOf: migrated)
      renumberItems(for: cats[uncatIndex].key)
    }
    renumberCategories()
  }

  mutating func removeItemToOffMenu(itemID: String, from categoryKey: String) {
    guard categoryKey != Self.uncategorizedKey else { return }
    guard let categoryIndex = cats.firstIndex(where: { $0.key == categoryKey }) else { return }
    guard let itemIndex = cats[categoryIndex].items.firstIndex(where: { $0.id == itemID }) else { return }
    ensureUncategorizedCategory()
    var item = cats[categoryIndex].items.remove(at: itemIndex)
    item.onMenu = false
    let uncategorizedIndex = cats.firstIndex(where: { $0.key == Self.uncategorizedKey })!
    cats[uncategorizedIndex].items.append(item)
    renumberItems(for: categoryKey)
    renumberItems(for: Self.uncategorizedKey)
  }

  mutating func restoreItemFromOffMenu(itemID: String, to categoryKey: String) {
    guard categoryKey != Self.uncategorizedKey else { return }
    guard let sourceIndex = cats.firstIndex(where: { $0.key == Self.uncategorizedKey }) else { return }
    guard let itemIndex = cats[sourceIndex].items.firstIndex(where: { $0.id == itemID }) else { return }
    guard let targetIndex = cats.firstIndex(where: { $0.key == categoryKey }) else { return }
    var item = cats[sourceIndex].items.remove(at: itemIndex)
    item.onMenu = true
    cats[targetIndex].items.append(item)
    renumberItems(for: categoryKey)
    renumberItems(for: Self.uncategorizedKey)
  }

  mutating func upsertItem(_ item: MenuItemPayload, categoryKey: String, originalCategoryKey: String? = nil) {
    if let originalCategoryKey, let sourceIndex = cats.firstIndex(where: { $0.key == originalCategoryKey }) {
      cats[sourceIndex].items.removeAll { $0.id == item.id }
      renumberItems(for: originalCategoryKey)
    }

    if !cats.contains(where: { $0.key == categoryKey }) {
      addCategory(label: categoryKey.capitalized)
    }
    guard let targetIndex = cats.firstIndex(where: { $0.key == categoryKey }) else { return }
    var next = item
    next.onMenu = categoryKey != Self.uncategorizedKey
    if let existingIndex = cats[targetIndex].items.firstIndex(where: { $0.id == item.id }) {
      cats[targetIndex].items[existingIndex] = next
    } else {
      cats[targetIndex].items.append(next)
    }
    renumberItems(for: categoryKey)
  }

  mutating func deleteItem(itemID: String, categoryKey: String) {
    guard let index = cats.firstIndex(where: { $0.key == categoryKey }) else { return }
    cats[index].items.removeAll { $0.id == itemID }
    renumberItems(for: categoryKey)
  }

  func makeSnapshot(hasUnsavedChanges: Bool, hasSharedDraft: Bool) -> MenuSnapshotPayload {
    MenuSnapshotPayload(
      context: context,
      cats: orderedSnapshotCategories(),
      meta: meta,
      restaurant: restaurant,
      featuredGroups: featuredGroups,
      saveOnlyChanges: [],
      previewContext: SnapshotPreviewContext(
        dirty: hasUnsavedChanges,
        hasSharedDraft: hasSharedDraft,
        saveOnlyChanges: []
      )
    )
  }

  private func orderedSnapshotCategories() -> [MenuCategoryPayload] {
    cats.enumerated().map { index, category in
      var next = category
      next.menuId = menuId
      if next.key == Self.uncategorizedKey {
        next.displayOrder = 9_999
      } else {
        next.displayOrder = index
      }
      next.items = next.items.enumerated().map { itemIndex, item in
        var nextItem = item
        nextItem.displayOrder = itemIndex
        nextItem.onMenu = next.key != Self.uncategorizedKey ? item.onMenu : false
        return nextItem
      }
      return next
    }
  }

  private mutating func renumberCategories() {
    var nextRegular = 0
    for index in cats.indices {
      if cats[index].key == Self.uncategorizedKey {
        cats[index].displayOrder = 9_999
      } else {
        cats[index].displayOrder = nextRegular
        nextRegular += 1
      }
    }
  }

  private mutating func renumberItems(for categoryKey: String) {
    guard let index = cats.firstIndex(where: { $0.key == categoryKey }) else { return }
    cats[index].items = cats[index].items.enumerated().map { itemIndex, item in
      var next = item
      next.displayOrder = itemIndex
      next.onMenu = categoryKey != Self.uncategorizedKey ? item.onMenu : false
      return next
    }
  }
}
