import Foundation
import LocalAuthentication
import Security

enum SessionStoreError: LocalizedError {
  case notFound
  case biometricDenied
  case osStatus(OSStatus)

  var errorDescription: String? {
    switch self {
    case .notFound:
      return "No saved session was found on this device."
    case .biometricDenied:
      return "Biometric unlock did not complete."
    case .osStatus(let status):
      return SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error (\(status))."
    }
  }
}

protocol SessionStoring {
  func loadSession(promptForBiometrics: Bool) async throws -> AuthSession
  func saveSession(_ session: AuthSession) throws
  func clearSession() throws
  var biometricUnlockEnabled: Bool { get set }
}

struct KeychainStore {
  let service: String

  func read(account: String) throws -> Data {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status != errSecItemNotFound else { throw SessionStoreError.notFound }
    guard status == errSecSuccess else { throw SessionStoreError.osStatus(status) }
    guard let data = item as? Data else { throw SessionStoreError.notFound }
    return data
  }

  func write(_ data: Data, account: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]

    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]

    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess { return }
    if updateStatus != errSecItemNotFound {
      throw SessionStoreError.osStatus(updateStatus)
    }

    var insert = query
    attributes.forEach { insert[$0.key] = $0.value }
    let insertStatus = SecItemAdd(insert as CFDictionary, nil)
    guard insertStatus == errSecSuccess else { throw SessionStoreError.osStatus(insertStatus) }
  }

  func delete(account: String) throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw SessionStoreError.osStatus(status)
    }
  }
}

final class SessionStore: SessionStoring {
  private let keychain = KeychainStore(service: "com.stiehl122.elroys.manager.session")
  private let account = "primary"
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  var biometricUnlockEnabled: Bool {
    get { defaults.bool(forKey: "ios.biometricUnlockEnabled") }
    set { defaults.set(newValue, forKey: "ios.biometricUnlockEnabled") }
  }

  func loadSession(promptForBiometrics: Bool) async throws -> AuthSession {
    if promptForBiometrics && biometricUnlockEnabled {
      try await authenticateForUnlock()
    }
    let data = try keychain.read(account: account)
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(AuthSession.self, from: data)
  }

  func saveSession(_ session: AuthSession) throws {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    let data = try encoder.encode(session)
    try keychain.write(data, account: account)
  }

  func clearSession() throws {
    try keychain.delete(account: account)
  }

  private func authenticateForUnlock() async throws {
    let context = LAContext()
    context.localizedFallbackTitle = "Use Device Passcode"

    var error: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
      throw error ?? SessionStoreError.biometricDenied
    }

    try await withCheckedThrowingContinuation { continuation in
      context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock your saved El Roy's Manager session.") { allowed, err in
        if allowed {
          continuation.resume()
        } else if let err {
          continuation.resume(throwing: err)
        } else {
          continuation.resume(throwing: SessionStoreError.biometricDenied)
        }
      }
    }
  }
}
