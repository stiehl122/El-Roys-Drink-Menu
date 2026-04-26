import Foundation

protocol OfflineDraftStoring {
  var clientScopeId: String { get }
  func loadDraft(userId: String, menuId: String) throws -> LocalDraftEnvelope?
  func saveDraft(_ envelope: LocalDraftEnvelope) throws
  func removeDraft(userId: String, menuId: String) throws
  func loadAllDrafts() throws -> [LocalDraftEnvelope]
}

final class OfflineDraftStore: OfflineDraftStoring {
  private static let clientScopeDefaultsKey = "ElRoysManagerClientScopeID"

  private let rootURL: URL
  let clientScopeId: String
  private let decoder = JSONDecoder()
  private let encoder = JSONEncoder()

  init(
    fileManager: FileManager = .default,
    userDefaults: UserDefaults = .standard,
    clientScopeId: String? = nil
  ) {
    let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    self.rootURL = appSupport.appendingPathComponent("ElRoysManagerDrafts", isDirectory: true)
    self.clientScopeId = Self.resolveClientScopeId(userDefaults: userDefaults, explicitValue: clientScopeId)
    decoder.dateDecodingStrategy = .iso8601
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try? fileManager.createDirectory(at: rootURL, withIntermediateDirectories: true, attributes: nil)
    try? Self.protectItem(at: rootURL, fileManager: fileManager)
  }

  init(
    rootURL: URL,
    fileManager: FileManager = .default,
    userDefaults: UserDefaults = .standard,
    clientScopeId: String? = nil
  ) {
    self.rootURL = rootURL
    self.clientScopeId = Self.resolveClientScopeId(userDefaults: userDefaults, explicitValue: clientScopeId)
    decoder.dateDecodingStrategy = .iso8601
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try? fileManager.createDirectory(at: self.rootURL, withIntermediateDirectories: true, attributes: nil)
    try? Self.protectItem(at: self.rootURL, fileManager: fileManager)
  }

  func loadDraft(userId: String, menuId: String) throws -> LocalDraftEnvelope? {
    let scopedURL = draftURL(userId: userId, menuId: menuId, clientScopeId: clientScopeId)
    if FileManager.default.fileExists(atPath: scopedURL.path) {
      let data = try Data(contentsOf: scopedURL)
      var decoded = try decoder.decode(LocalDraftEnvelope.self, from: data)
      if decoded.clientScopeId != clientScopeId {
        decoded.clientScopeId = clientScopeId
        try saveDraft(decoded)
      }
      return decoded
    }

    let legacyURL = legacyDraftURL(userId: userId, menuId: menuId)
    guard FileManager.default.fileExists(atPath: legacyURL.path) else { return nil }
    let data = try Data(contentsOf: legacyURL)
    var legacyDraft = try decoder.decode(LocalDraftEnvelope.self, from: data)
    legacyDraft.clientScopeId = clientScopeId
    try saveDraft(legacyDraft)
    try? FileManager.default.removeItem(at: legacyURL)
    return legacyDraft
  }

  func saveDraft(_ envelope: LocalDraftEnvelope) throws {
    var scoped = envelope
    scoped.clientScopeId = clientScopeId
    let data = try encoder.encode(scoped)
    let fileURL = draftURL(userId: scoped.userId, menuId: scoped.menuId, clientScopeId: clientScopeId)
    try data.write(to: fileURL, options: .atomic)
    try Self.protectItem(at: fileURL)
    try? FileManager.default.removeItem(at: legacyDraftURL(userId: scoped.userId, menuId: scoped.menuId))
  }

  func removeDraft(userId: String, menuId: String) throws {
    let scopedURL = draftURL(userId: userId, menuId: menuId, clientScopeId: clientScopeId)
    if FileManager.default.fileExists(atPath: scopedURL.path) {
      try FileManager.default.removeItem(at: scopedURL)
    }
    let legacyURL = legacyDraftURL(userId: userId, menuId: menuId)
    if FileManager.default.fileExists(atPath: legacyURL.path) {
      try FileManager.default.removeItem(at: legacyURL)
    }
  }

  func loadAllDrafts() throws -> [LocalDraftEnvelope] {
    let urls = try FileManager.default.contentsOfDirectory(at: rootURL, includingPropertiesForKeys: nil)
    return try urls
      .filter { $0.pathExtension == "json" }
      .map { try decoder.decode(LocalDraftEnvelope.self, from: Data(contentsOf: $0)) }
      .sorted { $0.savedAt > $1.savedAt }
  }

  private func draftURL(userId: String, menuId: String, clientScopeId: String) -> URL {
    rootURL.appendingPathComponent("\(sanitize(userId))__\(sanitize(menuId))__\(sanitize(clientScopeId)).json", isDirectory: false)
  }

  private func legacyDraftURL(userId: String, menuId: String) -> URL {
    rootURL.appendingPathComponent("\(sanitize(userId))__\(sanitize(menuId)).json", isDirectory: false)
  }

  private func sanitize(_ value: String) -> String {
    value.replacingOccurrences(of: "/", with: "_")
  }

  private static func protectItem(at url: URL, fileManager: FileManager = .default) throws {
    try fileManager.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: url.path
    )
  }

  private static func resolveClientScopeId(
    userDefaults: UserDefaults,
    explicitValue: String?
  ) -> String {
    if let explicitValue {
      let trimmed = explicitValue.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        return trimmed
      }
    }

    if let existing = userDefaults.string(forKey: clientScopeDefaultsKey)?
      .trimmingCharacters(in: .whitespacesAndNewlines),
       !existing.isEmpty
    {
      return existing
    }

    let created = UUID().uuidString.lowercased()
    userDefaults.set(created, forKey: clientScopeDefaultsKey)
    return created
  }
}
