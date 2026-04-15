import Foundation

protocol OfflineDraftStoring {
  func loadDraft(userId: String, menuId: String) throws -> LocalDraftEnvelope?
  func saveDraft(_ envelope: LocalDraftEnvelope) throws
  func removeDraft(userId: String, menuId: String) throws
  func loadAllDrafts() throws -> [LocalDraftEnvelope]
}

final class OfflineDraftStore: OfflineDraftStoring {
  private let rootURL: URL
  private let decoder = JSONDecoder()
  private let encoder = JSONEncoder()

  init(fileManager: FileManager = .default) {
    let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    self.rootURL = appSupport.appendingPathComponent("ElRoysManagerDrafts", isDirectory: true)
    decoder.dateDecodingStrategy = .iso8601
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try? fileManager.createDirectory(at: rootURL, withIntermediateDirectories: true, attributes: nil)
  }

  init(rootURL: URL, fileManager: FileManager = .default) {
    self.rootURL = rootURL
    decoder.dateDecodingStrategy = .iso8601
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try? fileManager.createDirectory(at: self.rootURL, withIntermediateDirectories: true, attributes: nil)
  }

  func loadDraft(userId: String, menuId: String) throws -> LocalDraftEnvelope? {
    let url = draftURL(userId: userId, menuId: menuId)
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    let data = try Data(contentsOf: url)
    return try decoder.decode(LocalDraftEnvelope.self, from: data)
  }

  func saveDraft(_ envelope: LocalDraftEnvelope) throws {
    let data = try encoder.encode(envelope)
    try data.write(to: draftURL(userId: envelope.userId, menuId: envelope.menuId), options: .atomic)
  }

  func removeDraft(userId: String, menuId: String) throws {
    let url = draftURL(userId: userId, menuId: menuId)
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    try FileManager.default.removeItem(at: url)
  }

  func loadAllDrafts() throws -> [LocalDraftEnvelope] {
    let urls = try FileManager.default.contentsOfDirectory(at: rootURL, includingPropertiesForKeys: nil)
    return try urls
      .filter { $0.pathExtension == "json" }
      .map { try decoder.decode(LocalDraftEnvelope.self, from: Data(contentsOf: $0)) }
      .sorted { $0.savedAt > $1.savedAt }
  }

  private func draftURL(userId: String, menuId: String) -> URL {
    rootURL.appendingPathComponent("\(sanitize(userId))__\(sanitize(menuId)).json", isDirectory: false)
  }

  private func sanitize(_ value: String) -> String {
    value.replacingOccurrences(of: "/", with: "_")
  }
}
