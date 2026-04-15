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

private extension KeyedDecodingContainer {
  func decodeString(forKey key: Key) throws -> String {
    try decodeIfPresent(String.self, forKey: key) ?? ""
  }

  func decodeBool(forKey key: Key, default defaultValue: Bool = false) throws -> Bool {
    try decodeIfPresent(Bool.self, forKey: key) ?? defaultValue
  }

  func decodeInt(forKey key: Key, default defaultValue: Int = 0) throws -> Int {
    try decodeIfPresent(Int.self, forKey: key) ?? defaultValue
  }

  func decodeArray<T: Decodable>(_ type: [T].Type = [T].self, forKey key: Key) throws -> [T] {
    try decodeIfPresent(type, forKey: key) ?? []
  }

  func decodeLossyStringArray(forKey key: Key) throws -> [String] {
    if let values = try? decode([String].self, forKey: key) {
      return values
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    }
    if let value = try? decode(String.self, forKey: key) {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? [] : [trimmed]
    }
    return []
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

  enum CodingKeys: String, CodingKey {
    case id
    case name
  }

  init(id: String, name: String) {
    self.id = id
    self.name = name
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decodeString(forKey: .id)
    self.name = try container.decodeString(forKey: .name)
  }
}

struct SharedDraftInfo: Codable, Equatable {
  var exists: Bool
  var savedAt: Int?
  var savedBy: SharedDraftSavedBy?
  var source: String

  enum CodingKeys: String, CodingKey {
    case exists
    case savedAt
    case savedBy
    case source
  }

  init(exists: Bool, savedAt: Int?, savedBy: SharedDraftSavedBy?, source: String) {
    self.exists = exists
    self.savedAt = savedAt
    self.savedBy = savedBy
    self.source = source
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.exists = try container.decodeBool(forKey: .exists)
    self.savedAt = try container.decodeIfPresent(Int.self, forKey: .savedAt)
    self.savedBy = try container.decodeIfPresent(SharedDraftSavedBy.self, forKey: .savedBy)
    self.source = try container.decodeString(forKey: .source)
  }
}

struct WorkspacePermissions: Codable, Equatable {
  var canManage: Bool
  var canAdmin: Bool
  var canEditRestaurantSpecials: Bool
  var canReadRestaurantTools: Bool

  enum CodingKeys: String, CodingKey {
    case canManage
    case canAdmin
    case canEditRestaurantSpecials
    case canReadRestaurantTools
  }

  init(canManage: Bool, canAdmin: Bool, canEditRestaurantSpecials: Bool, canReadRestaurantTools: Bool) {
    self.canManage = canManage
    self.canAdmin = canAdmin
    self.canEditRestaurantSpecials = canEditRestaurantSpecials
    self.canReadRestaurantTools = canReadRestaurantTools
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.canManage = try container.decodeBool(forKey: .canManage)
    self.canAdmin = try container.decodeBool(forKey: .canAdmin)
    self.canEditRestaurantSpecials = try container.decodeBool(forKey: .canEditRestaurantSpecials)
    self.canReadRestaurantTools = try container.decodeBool(forKey: .canReadRestaurantTools)
  }
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

  enum CodingKeys: String, CodingKey {
    case canSaveDraft
    case canSaveLiveMenu
    case canPublishUpdates
    case canManageRestaurantSpecials
    case canReadRestaurantTools
    case canManageAdminSettings
    case includesDraftAuthorship
    case includesRestaurantTools
  }

  init(
    canSaveDraft: Bool,
    canSaveLiveMenu: Bool,
    canPublishUpdates: Bool,
    canManageRestaurantSpecials: Bool,
    canReadRestaurantTools: Bool,
    canManageAdminSettings: Bool,
    includesDraftAuthorship: Bool,
    includesRestaurantTools: Bool
  ) {
    self.canSaveDraft = canSaveDraft
    self.canSaveLiveMenu = canSaveLiveMenu
    self.canPublishUpdates = canPublishUpdates
    self.canManageRestaurantSpecials = canManageRestaurantSpecials
    self.canReadRestaurantTools = canReadRestaurantTools
    self.canManageAdminSettings = canManageAdminSettings
    self.includesDraftAuthorship = includesDraftAuthorship
    self.includesRestaurantTools = includesRestaurantTools
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.canSaveDraft = try container.decodeBool(forKey: .canSaveDraft)
    self.canSaveLiveMenu = try container.decodeBool(forKey: .canSaveLiveMenu)
    self.canPublishUpdates = try container.decodeBool(forKey: .canPublishUpdates)
    self.canManageRestaurantSpecials = try container.decodeBool(forKey: .canManageRestaurantSpecials)
    self.canReadRestaurantTools = try container.decodeBool(forKey: .canReadRestaurantTools)
    self.canManageAdminSettings = try container.decodeBool(forKey: .canManageAdminSettings)
    self.includesDraftAuthorship = try container.decodeBool(forKey: .includesDraftAuthorship)
    self.includesRestaurantTools = try container.decodeBool(forKey: .includesRestaurantTools)
  }
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

  enum CodingKeys: String, CodingKey {
    case actor
    case accessibleMenuIds
    case hasSharedDraft
    case sharedDraft
    case permissions
    case capabilities
    case revisions
  }

  init(
    actor: ActorProfile?,
    accessibleMenuIds: [String],
    hasSharedDraft: Bool,
    sharedDraft: SharedDraftInfo,
    permissions: WorkspacePermissions,
    capabilities: WorkspaceCapabilities,
    revisions: WorkspaceRevisions
  ) {
    self.actor = actor
    self.accessibleMenuIds = accessibleMenuIds
    self.hasSharedDraft = hasSharedDraft
    self.sharedDraft = sharedDraft
    self.permissions = permissions
    self.capabilities = capabilities
    self.revisions = revisions
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let sharedDraft = try container.decodeIfPresent(
      SharedDraftInfo.self,
      forKey: .sharedDraft
    ) ?? SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: "")
    self.actor = try container.decodeIfPresent(ActorProfile.self, forKey: .actor)
    self.accessibleMenuIds = (try? container.decode([String].self, forKey: .accessibleMenuIds)) ?? []
    self.hasSharedDraft = try container.decodeIfPresent(Bool.self, forKey: .hasSharedDraft) ?? sharedDraft.exists
    self.sharedDraft = sharedDraft
    self.permissions = try container.decodeIfPresent(
      WorkspacePermissions.self,
      forKey: .permissions
    ) ?? WorkspacePermissions(
      canManage: false,
      canAdmin: false,
      canEditRestaurantSpecials: false,
      canReadRestaurantTools: false
    )
    self.capabilities = try container.decodeIfPresent(
      WorkspaceCapabilities.self,
      forKey: .capabilities
    ) ?? WorkspaceCapabilities(
      canSaveDraft: false,
      canSaveLiveMenu: false,
      canPublishUpdates: false,
      canManageRestaurantSpecials: false,
      canReadRestaurantTools: false,
      canManageAdminSettings: false,
      includesDraftAuthorship: false,
      includesRestaurantTools: false
    )
    self.revisions = try container.decodeIfPresent(WorkspaceRevisions.self, forKey: .revisions)
      ?? WorkspaceRevisions(liveRevision: nil, draftRevision: nil, lastSentRevision: nil)
  }
}

struct MenuContext: Codable, Equatable {
  var kind: String
  var menu: MenuRecord?

  enum CodingKeys: String, CodingKey {
    case kind
    case menu
  }

  init(kind: String, menu: MenuRecord?) {
    self.kind = kind
    self.menu = menu
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decodeString(forKey: .kind)
    self.menu = try container.decodeIfPresent(MenuRecord.self, forKey: .menu)
  }
}

struct ItemUpcharge: Codable, Equatable, Hashable, Identifiable {
  var id: UUID = UUID()
  var label: String
  var price: String

  enum CodingKeys: String, CodingKey {
    case label
    case price
  }

  init(label: String, price: String) {
    self.label = label
    self.price = price
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.label = try container.decodeString(forKey: .label)
    self.price = try container.decodeString(forKey: .price)
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

  enum CodingKeys: String, CodingKey {
    case id
    case name
    case desc
    case recipe
    case price
    case isEightySixed
    case eightySixed
    case displayOrder
    case onMenu
    case visibility
    case upcharges
    case showDescription
    case showRecipe
  }

  init(
    id: String,
    name: String,
    desc: String,
    recipe: [String],
    price: String,
    isEightySixed: Bool,
    displayOrder: Int,
    onMenu: Bool,
    visibility: String,
    upcharges: [ItemUpcharge],
    showDescription: Bool,
    showRecipe: Bool
  ) {
    self.id = id
    self.name = name
    self.desc = desc
    self.recipe = recipe
    self.price = price
    self.isEightySixed = isEightySixed
    self.displayOrder = displayOrder
    self.onMenu = onMenu
    self.visibility = visibility
    self.upcharges = upcharges
    self.showDescription = showDescription
    self.showRecipe = showRecipe
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)

    let visibility = try container.decodeIfPresent(String.self, forKey: .visibility) ?? "public"
    let explicitOnMenu = try container.decodeIfPresent(Bool.self, forKey: .onMenu)
    let serverIsEightySixed = try container.decodeIfPresent(Bool.self, forKey: .isEightySixed)
    let compactIsEightySixed = try container.decodeIfPresent(Bool.self, forKey: .eightySixed)

    self.id = try container.decode(String.self, forKey: .id)
    self.name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
    self.desc = try container.decodeIfPresent(String.self, forKey: .desc) ?? ""
    self.recipe = try container.decodeLossyStringArray(forKey: .recipe)
    self.price = try container.decodeIfPresent(String.self, forKey: .price) ?? ""
    self.isEightySixed = serverIsEightySixed ?? compactIsEightySixed ?? false
    self.displayOrder = try container.decodeIfPresent(Int.self, forKey: .displayOrder) ?? 0
    self.onMenu = explicitOnMenu ?? (visibility != "off_menu")
    self.visibility = visibility
    self.upcharges = (try? container.decode([ItemUpcharge].self, forKey: .upcharges)) ?? []
    self.showDescription = try container.decodeIfPresent(Bool.self, forKey: .showDescription) ?? true
    self.showRecipe = try container.decodeIfPresent(Bool.self, forKey: .showRecipe) ?? false
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(name, forKey: .name)
    try container.encode(desc, forKey: .desc)
    try container.encode(recipe, forKey: .recipe)
    try container.encode(price, forKey: .price)
    try container.encode(isEightySixed, forKey: .isEightySixed)
    try container.encode(displayOrder, forKey: .displayOrder)
    try container.encode(onMenu, forKey: .onMenu)
    try container.encode(visibility, forKey: .visibility)
    try container.encode(upcharges, forKey: .upcharges)
    try container.encode(showDescription, forKey: .showDescription)
    try container.encode(showRecipe, forKey: .showRecipe)
  }
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

  enum CodingKeys: String, CodingKey {
    case id
    case menuId
    case key
    case label
    case icon
    case color
    case sub
    case placeholder
    case displayOrder
    case items
  }

  init(
    id: String,
    menuId: String?,
    key: String,
    label: String,
    icon: String,
    color: String,
    sub: String,
    placeholder: String,
    displayOrder: Int,
    items: [MenuItemPayload]
  ) {
    self.id = id
    self.menuId = menuId
    self.key = key
    self.label = label
    self.icon = icon
    self.color = color
    self.sub = sub
    self.placeholder = placeholder
    self.displayOrder = displayOrder
    self.items = items
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decodeString(forKey: .id)
    self.menuId = try container.decodeIfPresent(String.self, forKey: .menuId)
    self.key = try container.decodeString(forKey: .key)
    self.label = try container.decodeString(forKey: .label)
    self.icon = try container.decodeString(forKey: .icon)
    self.color = try container.decodeString(forKey: .color)
    self.sub = try container.decodeString(forKey: .sub)
    self.placeholder = try container.decodeString(forKey: .placeholder)
    self.displayOrder = try container.decodeInt(forKey: .displayOrder)
    self.items = (try? container.decode([MenuItemPayload].self, forKey: .items)) ?? []
  }
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

  enum CodingKeys: String, CodingKey {
    case botId
    case notifications
    case notificationMenuLink
    case lastUpdatedTs
    case lastSentTs
    case lastSentState
    case lastSentCategories
    case lastSentFeatured
    case draftState
    case draftSavedTs
    case draftSavedByUserId
    case draftSavedByName
    case draftSavedSource
  }

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

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.botId = try container.decodeIfPresent(String.self, forKey: .botId)
    self.notifications = try container.decodeIfPresent(JSONValue.self, forKey: .notifications)
    self.notificationMenuLink = try container.decodeIfPresent(String.self, forKey: .notificationMenuLink)
    self.lastUpdatedTs = try container.decodeIfPresent(Int.self, forKey: .lastUpdatedTs)
    self.lastSentTs = try container.decodeIfPresent(Int.self, forKey: .lastSentTs)
    self.lastSentState = try container.decodeIfPresent(JSONValue.self, forKey: .lastSentState)
    self.lastSentCategories = (try? container.decode([String].self, forKey: .lastSentCategories)) ?? []
    self.lastSentFeatured = (try? container.decode([String].self, forKey: .lastSentFeatured)) ?? []
    self.draftState = try container.decodeIfPresent(JSONValue.self, forKey: .draftState)
    self.draftSavedTs = try container.decodeIfPresent(Int.self, forKey: .draftSavedTs)
    self.draftSavedByUserId = try container.decodeIfPresent(String.self, forKey: .draftSavedByUserId)
    self.draftSavedByName = try container.decodeIfPresent(String.self, forKey: .draftSavedByName)
    self.draftSavedSource = try container.decodeIfPresent(String.self, forKey: .draftSavedSource)
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

  enum CodingKeys: String, CodingKey {
    case id
    case itemId
    case sellNote
    case displayOrder
    case confirmedAt
    case confirmedBy
    case item
  }

  init(
    id: String,
    itemId: String,
    sellNote: String,
    displayOrder: Int,
    confirmedAt: String?,
    confirmedBy: String?,
    item: MenuItemPayload?
  ) {
    self.id = id
    self.itemId = itemId
    self.sellNote = sellNote
    self.displayOrder = displayOrder
    self.confirmedAt = confirmedAt
    self.confirmedBy = confirmedBy
    self.item = item
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decodeString(forKey: .id)
    self.itemId = try container.decodeString(forKey: .itemId)
    self.sellNote = try container.decodeString(forKey: .sellNote)
    self.displayOrder = try container.decodeInt(forKey: .displayOrder)
    self.confirmedAt = try container.decodeIfPresent(String.self, forKey: .confirmedAt)
    self.confirmedBy = try container.decodeIfPresent(String.self, forKey: .confirmedBy)
    self.item = try container.decodeIfPresent(MenuItemPayload.self, forKey: .item)
  }
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

  enum CodingKeys: String, CodingKey {
    case id
    case name
    case displayOrder
    case slots
  }

  init(id: String, name: String, displayOrder: Int, slots: [FeaturedSlot]) {
    self.id = id
    self.name = name
    self.displayOrder = displayOrder
    self.slots = slots
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decodeString(forKey: .id)
    self.name = try container.decodeString(forKey: .name)
    self.displayOrder = try container.decodeInt(forKey: .displayOrder)
    self.slots = (try? container.decode([FeaturedSlot].self, forKey: .slots)) ?? []
  }
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

  enum CodingKeys: String, CodingKey {
    case contract
    case featuredSource
  }

  init(contract: String?, featuredSource: String?) {
    self.contract = contract
    self.featuredSource = featuredSource
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.contract = try container.decodeIfPresent(String.self, forKey: .contract)
    self.featuredSource = try container.decodeIfPresent(String.self, forKey: .featuredSource)
  }
}

struct RestaurantToolsPayload: Codable, Equatable {
  var restaurantId: String
  var featuredGroups: [FeaturedGroup]
  var siblingCatalog: [SiblingCatalogItem]
  var compatibility: RestaurantToolsCompatibility?

  enum CodingKeys: String, CodingKey {
    case restaurantId
    case featuredGroups
    case siblingCatalog
    case compatibility
  }

  init(
    restaurantId: String,
    featuredGroups: [FeaturedGroup],
    siblingCatalog: [SiblingCatalogItem],
    compatibility: RestaurantToolsCompatibility?
  ) {
    self.restaurantId = restaurantId
    self.featuredGroups = featuredGroups
    self.siblingCatalog = siblingCatalog
    self.compatibility = compatibility
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.restaurantId = try container.decodeString(forKey: .restaurantId)
    self.featuredGroups = (try? container.decode([FeaturedGroup].self, forKey: .featuredGroups)) ?? []
    self.siblingCatalog = (try? container.decode([SiblingCatalogItem].self, forKey: .siblingCatalog)) ?? []
    self.compatibility = try container.decodeIfPresent(RestaurantToolsCompatibility.self, forKey: .compatibility)
  }
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

  enum CodingKeys: String, CodingKey {
    case kind
    case menu
    case restaurant
  }

  init(kind: String, menu: MenuRecord?, restaurant: RestaurantRecord?) {
    self.kind = kind
    self.menu = menu
    self.restaurant = restaurant
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decodeString(forKey: .kind)
    self.menu = try container.decodeIfPresent(MenuRecord.self, forKey: .menu)
    self.restaurant = try container.decodeIfPresent(RestaurantRecord.self, forKey: .restaurant)
  }
}

struct HistorySummary: Codable, Equatable {
  var days: Int
  var limit: Int
  var count: Int
  var scope: String
  var partial: Bool

  enum CodingKeys: String, CodingKey {
    case days
    case limit
    case count
    case scope
    case partial
  }

  init(days: Int, limit: Int, count: Int, scope: String, partial: Bool) {
    self.days = days
    self.limit = limit
    self.count = count
    self.scope = scope
    self.partial = partial
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.days = try container.decodeInt(forKey: .days, default: 7)
    self.limit = try container.decodeInt(forKey: .limit, default: 25)
    self.count = try container.decodeInt(forKey: .count)
    self.scope = try container.decodeString(forKey: .scope)
    self.partial = try container.decodeBool(forKey: .partial)
  }
}

struct HistoryCapabilities: Codable, Equatable {
  var canReadHistory: Bool
  var includesMessage: Bool
  var includesSource: Bool

  enum CodingKeys: String, CodingKey {
    case canReadHistory
    case includesMessage
    case includesSource
  }

  init(canReadHistory: Bool, includesMessage: Bool, includesSource: Bool) {
    self.canReadHistory = canReadHistory
    self.includesMessage = includesMessage
    self.includesSource = includesSource
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.canReadHistory = try container.decodeBool(forKey: .canReadHistory)
    self.includesMessage = try container.decodeBool(forKey: .includesMessage, default: true)
    self.includesSource = try container.decodeBool(forKey: .includesSource)
  }
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

  enum CodingKeys: String, CodingKey {
    case id
    case menuId
    case userId
    case userName
    case diff
    case message
    case source
    case createdAt
    case menu
  }

  init(
    id: String,
    menuId: String,
    userId: String,
    userName: String,
    diff: [JSONValue],
    message: String,
    source: String,
    createdAt: String,
    menu: MenuRecord?
  ) {
    self.id = id
    self.menuId = menuId
    self.userId = userId
    self.userName = userName
    self.diff = diff
    self.message = message
    self.source = source
    self.createdAt = createdAt
    self.menu = menu
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decodeString(forKey: .id)
    self.menuId = try container.decodeString(forKey: .menuId)
    self.userId = try container.decodeString(forKey: .userId)
    self.userName = try container.decodeString(forKey: .userName)
    self.diff = (try? container.decode([JSONValue].self, forKey: .diff)) ?? []
    self.message = try container.decodeString(forKey: .message)
    self.source = try container.decodeString(forKey: .source)
    self.createdAt = try container.decodeString(forKey: .createdAt)
    self.menu = try container.decodeIfPresent(MenuRecord.self, forKey: .menu)
  }
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
  var baseDocument: EditableMenuDocument?
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
    cats = Self.normalizeIdentifiers(
      in: workspace.cats.sorted { $0.displayOrder < $1.displayOrder },
      menuId: workspace.context.menu?.id ?? ""
    )
    meta = workspace.meta
    restaurant = workspace.restaurant
    featuredGroups = workspace.restaurantTools?.featuredGroups ?? []
  }

  var menuId: String { context.menuId }
  var restaurantId: String { context.restaurantId }
  var isFoodMenu: Bool { context.menuType.lowercased() == "food" }

  mutating func normalizeIdentifiersForRuntime() {
    cats = Self.normalizeIdentifiers(in: cats, menuId: menuId)
  }

  var uncategorizedItems: [MenuItemPayload] {
    cats.first(where: { $0.key == Self.uncategorizedKey })?.items ?? []
  }

  var visibleCategories: [MenuCategoryPayload] {
    cats.filter { $0.key != Self.uncategorizedKey }
  }

  func category(for key: String) -> MenuCategoryPayload? {
    cats.first(where: { $0.key == key })
  }

  func categoryLabel(for key: String) -> String {
    category(for: key)?.label.nilIfBlank ?? key
  }

  func itemRecord(for itemID: String) -> (item: MenuItemPayload, categoryKey: String)? {
    for category in cats {
      if let item = category.items.first(where: { $0.id == itemID }) {
        return (item, category.key)
      }
    }
    return nil
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
    guard let uncategorizedIndex = cats.firstIndex(where: { $0.key == Self.uncategorizedKey }) else { return }
    var item = cats[categoryIndex].items.remove(at: itemIndex)
    item.onMenu = false
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

  mutating func upsertCategoryStructure(from category: MenuCategoryPayload) {
    let preservedItems = self.category(for: category.key)?.items ?? []
    var nextCategory = category
    nextCategory.menuId = menuId
    nextCategory.items = preservedItems

    if let existingIndex = cats.firstIndex(where: { $0.key == category.key }) {
      cats[existingIndex] = nextCategory
    } else {
      cats.append(nextCategory)
    }

    let regular = cats
      .filter { $0.key != Self.uncategorizedKey }
      .sorted { lhs, rhs in
        if lhs.displayOrder == rhs.displayOrder {
          return lhs.label.localizedCaseInsensitiveCompare(rhs.label) == .orderedAscending
        }
        return lhs.displayOrder < rhs.displayOrder
      }
    let uncategorized = cats.first(where: { $0.key == Self.uncategorizedKey })
    cats = regular + (uncategorized.map { [$0] } ?? [])
    renumberCategories()
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

  private static func normalizeIdentifiers(in categories: [MenuCategoryPayload], menuId: String) -> [MenuCategoryPayload] {
    var usedCategoryIDs: Set<String> = []
    var usedItemIDs: Set<String> = []
    return categories.enumerated().map { categoryIndex, category in
      var nextCategory = category
      if nextCategory.menuId == nil || nextCategory.menuId?.isEmpty == true {
        nextCategory.menuId = menuId
      }
      let categoryFallback = nextCategory.key.isEmpty ? "cat-\(categoryIndex)" : "cat-\(nextCategory.key)"
      nextCategory.id = uniqueIdentifier(
        base: normalizedBaseIdentifier(nextCategory.id, fallback: categoryFallback),
        used: &usedCategoryIDs
      )
      nextCategory.items = category.items.enumerated().map { itemIndex, item in
        var nextItem = item
        let itemFallback = "item-\(categoryIndex)-\(itemIndex)"
        nextItem.id = uniqueIdentifier(
          base: normalizedBaseIdentifier(item.id, fallback: itemFallback),
          used: &usedItemIDs
        )
        return nextItem
      }
      return nextCategory
    }
  }

  private static func normalizedBaseIdentifier(_ raw: String, fallback: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? fallback : trimmed
  }

  private static func uniqueIdentifier(base: String, used: inout Set<String>) -> String {
    let seed = base.trimmingCharacters(in: .whitespacesAndNewlines)
    let initial = seed.isEmpty ? "id" : seed
    if !used.contains(initial) {
      used.insert(initial)
      return initial
    }
    var suffix = 2
    var candidate = "\(initial)-\(suffix)"
    while used.contains(candidate) {
      suffix += 1
      candidate = "\(initial)-\(suffix)"
    }
    used.insert(candidate)
    return candidate
  }
}

private extension String {
  var nilIfBlank: String? {
    let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
