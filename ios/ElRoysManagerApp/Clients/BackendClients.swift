import Foundation

struct BackendErrorPayload: Decodable {
  var error: String?
  var message: String?
  var details: String?
}

enum BackendError: LocalizedError {
  case invalidBaseURL
  case unauthorized
  case server(message: String)
  case transport(message: String)
  case invalidResponse
  case decoding(message: String)

  var errorDescription: String? {
    switch self {
    case .invalidBaseURL:
      return "The app environment is missing a valid API base URL."
    case .unauthorized:
      return "Your session no longer has access for this action."
    case .server(let message):
      return message
    case .transport(let message):
      return message
    case .invalidResponse:
      return "The server returned an unexpected response."
    case .decoding(let message):
      return message
    }
  }
}

protocol BootstrapClienting {
  func fetch(accessToken: String?) async throws -> SessionBootstrapPayload
}

protocol AuthClienting {
  func signIn(email: String, password: String) async throws -> AuthSession
  func signUp(email: String, password: String, name: String) async throws -> AuthSession
  func refresh(session: AuthSession) async throws -> AuthSession
  func sendReset(email: String, redirectTo: URL) async throws
  func requestAccountDeletion(accessToken: String) async throws
}

protocol WorkspaceClienting {
  func fetch(menuId: String, accessToken: String) async throws -> MenuWorkspacePayload
}

protocol PublicMenuClienting {
  func fetch(menuId: String, accessToken: String?) async throws -> PublicMenuPayload
}

protocol DraftClienting {
  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse
  func clear(menuId: String, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse
}

protocol LiveSaveClienting {
  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String) async throws -> PublishResponse
}

protocol PublishClienting {
  func preview(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, expectedNotificationRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse
  func publish(menuId: String, snapshot: MenuSnapshotPayload, selectedChangeIds: [String], expectedLiveRevision: Int?, expectedDraftRevision: Int?, expectedNotificationRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse
}

protocol HistoryClienting {
  func fetch(menuId: String, accessToken: String) async throws -> HistoryPayload
}

protocol PreviewClienting {
  func exactRouteURL(for menu: MenuRecord) -> URL
}

protocol ProductLookupClienting {
  func lookup(upc: String, menuId: String, accessToken: String) async throws -> ProductLookupResult
}

private struct EmptyBody: Encodable {}

private struct EmptyResponse: Decodable {}

private struct SupabaseAuthResponse: Decodable {
  struct UserRecord: Decodable {
    var id: String
    var email: String?
    var userMetadata: UserMetadata?

    struct UserMetadata: Decodable {
      var name: String?
    }
  }

  var accessToken: String
  var refreshToken: String
  var expiresIn: Int
  var user: UserRecord?
}

private struct AuthRequest: Encodable {
  var email: String
  var password: String
}

private struct AuthActionRequest: Encodable {
  var action: String
  var email: String?
  var password: String?
  var name: String?
  var refreshToken: String?
  var redirectTo: String?
  var newPassword: String?
}

private struct AuthResetResponse: Decodable {
  var ok: Bool?
}

private struct AccountDeletionRequestResponse: Decodable {
  var ok: Bool?
  var requestedAt: String?
  var status: String?
}

private struct SignUpRequest: Encodable {
  var email: String
  var password: String
  var data: UserData

  struct UserData: Encodable {
    var name: String
  }
}

private struct RefreshRequest: Encodable {
  var refreshToken: String
}

private struct ResetRequest: Encodable {
  var email: String
  var redirectTo: String
}

private struct DraftSaveRequest: Encodable {
  var action: String
  var menuId: String
  var snapshot: MenuSnapshotPayload
  var expectedDraftRevision: Int?
  var savedAt: Int?
  var source: String
}

private struct DraftClearRequest: Encodable {
  var action: String
  var menuId: String
  var snapshot: [String: String]
  var expectedDraftRevision: Int?
  var source: String
}

private struct LiveSaveRequest: Encodable {
  var action: String
  var menuId: String
  var snapshot: MenuSnapshotPayload
  var expectedLiveRevision: Int?
  var expectedDraftRevision: Int?
}

private struct PublishRequest: Encodable {
  var action: String
  var menuId: String
  var snapshot: MenuSnapshotPayload
  var source: String
  var selectedChangeIds: [String]?
  var expectedLiveRevision: Int?
  var expectedDraftRevision: Int?
  var expectedNotificationRevision: Int?
}

private struct ProductLookupRequest: Encodable {
  var action: String
  var barcode: String
  var menuId: String
}

private enum HTTPMethod: String {
  case get = "GET"
  case post = "POST"
}

private final class HTTPService {
  let environment: AppEnvironment
  let session: URLSession
  let decoder: JSONDecoder
  let encoder: JSONEncoder

  init(environment: AppEnvironment, session: URLSession = .shared) {
    self.environment = environment
    self.session = session
    decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
  }

  func request<Response: Decodable>(
    path: String,
    method: HTTPMethod = .get,
    queryItems: [URLQueryItem] = [],
    accessToken: String? = nil
  ) async throws -> Response {
    try await request(path: path, method: method, queryItems: queryItems, accessToken: accessToken, body: Optional<EmptyBody>.none)
  }

  func request<Body: Encodable, Response: Decodable>(
    path: String,
    method: HTTPMethod = .post,
    queryItems: [URLQueryItem] = [],
    accessToken: String? = nil,
    body: Body?
  ) async throws -> Response {
    guard var components = URLComponents(url: environment.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
      throw BackendError.invalidBaseURL
    }
    if !queryItems.isEmpty {
      components.queryItems = queryItems
    }
    guard let url = components.url else { throw BackendError.invalidBaseURL }

    var request = URLRequest(url: url)
    request.httpMethod = method.rawValue
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let accessToken, !accessToken.isEmpty {
      request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    }
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try encoder.encode(body)
    }

    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await session.data(for: request)
    } catch {
      throw BackendError.transport(message: error.localizedDescription)
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw BackendError.invalidResponse
    }

    if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
      throw BackendError.unauthorized
    }

    guard (200...299).contains(httpResponse.statusCode) else {
      if let payload = try? decoder.decode(BackendErrorPayload.self, from: data) {
        throw BackendError.server(
          message: payload.error ?? payload.message ?? payload.details ?? "The request failed."
        )
      }
      throw BackendError.server(message: HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode))
    }

    if Response.self == EmptyResponse.self && data.isEmpty {
      return EmptyResponse() as! Response
    }
    if data.isEmpty {
      throw BackendError.invalidResponse
    }
    do {
      return try decoder.decode(Response.self, from: data)
    } catch let error as DecodingError {
      throw BackendError.decoding(message: describeDecodingError(error, endpoint: path))
    } catch {
      throw error
    }
  }

  func requestVoid<Body: Encodable>(
    path: String,
    method: HTTPMethod = .post,
    accessToken: String? = nil,
    body: Body?
  ) async throws {
    let _: EmptyResponse = try await request(path: path, method: method, accessToken: accessToken, body: body)
  }

  private func describeDecodingError(_ error: DecodingError, endpoint: String) -> String {
    switch error {
    case .keyNotFound(let key, let context):
      let path = describeCodingPath(context.codingPath + [key])
      return "The \(endpoint) response is missing `\(path)`."
    case .valueNotFound(_, let context):
      let path = describeCodingPath(context.codingPath)
      return "The \(endpoint) response is missing a value near `\(path)`."
    case .typeMismatch(_, let context):
      let path = describeCodingPath(context.codingPath)
      return "The \(endpoint) response changed shape near `\(path)`."
    case .dataCorrupted(let context):
      let path = describeCodingPath(context.codingPath)
      return "The \(endpoint) response contains unreadable data near `\(path)`."
    @unknown default:
      return "The \(endpoint) response could not be decoded."
    }
  }

  private func describeCodingPath(_ path: [CodingKey]) -> String {
    let value = path
      .map { key in
        if let intValue = key.intValue {
          return "[\(intValue)]"
        }
        return key.stringValue
      }
      .joined(separator: ".")
    return value.isEmpty ? "root" : value
  }
}

private func makeAuthSession(from response: SupabaseAuthResponse, bootstrap: SessionBootstrapPayload) -> AuthSession {
  let actor = bootstrap.actor
  return AuthSession(
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: Date().addingTimeInterval(TimeInterval(response.expiresIn)),
    userID: response.user?.id ?? actor?.id ?? "",
    email: response.user?.email ?? "",
    name: actor?.name ?? response.user?.userMetadata?.name ?? "",
    role: actor?.role ?? "none",
    accessibleMenuIds: bootstrap.access.accessibleMenuIds
  )
}

final class BootstrapClient: BootstrapClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func fetch(accessToken: String?) async throws -> SessionBootstrapPayload {
    try await http.request(
      path: "api/auth",
      method: .get,
      queryItems: [URLQueryItem(name: "mode", value: "bootstrap")],
      accessToken: accessToken
    )
  }
}

final class AuthClient: AuthClienting {
  private let http: HTTPService
  private let environment: AppEnvironment
  private let session: URLSession

  init(environment: AppEnvironment, session: URLSession = .shared) {
    self.http = HTTPService(environment: environment, session: session)
    self.environment = environment
    self.session = session
  }

  func signIn(email: String, password: String) async throws -> AuthSession {
    let auth: SupabaseAuthResponse = try await http.request(
      path: "api/auth",
      method: .post,
      body: AuthActionRequest(action: "sign_in", email: email, password: password, name: nil, refreshToken: nil, redirectTo: nil, newPassword: nil)
    )
    let bootstrap = try await BootstrapClient(environment: environment, session: session).fetch(accessToken: auth.accessToken)
    return makeAuthSession(from: auth, bootstrap: bootstrap)
  }

  func signUp(email: String, password: String, name: String) async throws -> AuthSession {
    let auth: SupabaseAuthResponse = try await http.request(
      path: "api/auth",
      method: .post,
      body: AuthActionRequest(action: "sign_up", email: email, password: password, name: name, refreshToken: nil, redirectTo: nil, newPassword: nil)
    )
    let bootstrap = try await BootstrapClient(environment: environment, session: session).fetch(accessToken: auth.accessToken)
    return makeAuthSession(from: auth, bootstrap: bootstrap)
  }

  func refresh(session authSession: AuthSession) async throws -> AuthSession {
    let auth: SupabaseAuthResponse = try await http.request(
      path: "api/auth",
      method: .post,
      body: AuthActionRequest(action: "refresh", email: nil, password: nil, name: nil, refreshToken: authSession.refreshToken, redirectTo: nil, newPassword: nil)
    )
    let bootstrap = try await BootstrapClient(environment: environment, session: session).fetch(accessToken: auth.accessToken)
    return makeAuthSession(from: auth, bootstrap: bootstrap)
  }

  func sendReset(email: String, redirectTo: URL) async throws {
    let _: AuthResetResponse = try await http.request(
      path: "api/auth",
      method: .post,
      body: AuthActionRequest(action: "reset_password", email: email, password: nil, name: nil, refreshToken: nil, redirectTo: redirectTo.absoluteString, newPassword: nil)
    )
  }

  func requestAccountDeletion(accessToken: String) async throws {
    let _: AccountDeletionRequestResponse = try await http.request(
      path: "api/auth",
      method: .post,
      accessToken: accessToken,
      body: AuthActionRequest(action: "request_account_deletion", email: nil, password: nil, name: nil, refreshToken: nil, redirectTo: nil, newPassword: nil)
    )
  }
}

final class WorkspaceClient: WorkspaceClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func fetch(menuId: String, accessToken: String) async throws -> MenuWorkspacePayload {
    try await http.request(
      path: "api/manager",
      method: .get,
      queryItems: [
        URLQueryItem(name: "action", value: "workspace"),
        URLQueryItem(name: "menu_id", value: menuId),
      ],
      accessToken: accessToken
    )
  }
}

final class PublicMenuClient: PublicMenuClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func fetch(menuId: String, accessToken: String?) async throws -> PublicMenuPayload {
    try await http.request(
      path: "api/public",
      method: .get,
      queryItems: [
        URLQueryItem(name: "action", value: "menu"),
        URLQueryItem(name: "menu_id", value: menuId),
      ],
      accessToken: accessToken
    )
  }
}

final class DraftClient: DraftClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse {
    try await http.request(
      path: "api/manager",
      method: .post,
      accessToken: accessToken,
      body: DraftSaveRequest(
        action: "save_draft",
        menuId: menuId,
        snapshot: snapshot,
        expectedDraftRevision: expectedDraftRevision,
        savedAt: Int(Date().timeIntervalSince1970 * 1000),
        source: source
      )
    )
  }

  func clear(menuId: String, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse {
    try await http.request(
      path: "api/manager",
      method: .post,
      accessToken: accessToken,
      body: DraftClearRequest(
        action: "clear_draft",
        menuId: menuId,
        snapshot: [:],
        expectedDraftRevision: expectedDraftRevision,
        source: source
      )
    )
  }
}

final class LiveSaveClient: LiveSaveClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String) async throws -> PublishResponse {
    try await http.request(
      path: "api/manager",
      method: .post,
      accessToken: accessToken,
      body: LiveSaveRequest(
        action: "save_live",
        menuId: menuId,
        snapshot: snapshot,
        expectedLiveRevision: expectedLiveRevision,
        expectedDraftRevision: expectedDraftRevision
      )
    )
  }
}

final class PublishClient: PublishClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func preview(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, expectedNotificationRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    try await http.request(
      path: "api/manager",
      method: .post,
      accessToken: accessToken,
      body: PublishRequest(
        action: "preview_publish",
        menuId: menuId,
        snapshot: snapshot,
        source: source,
        selectedChangeIds: nil,
        expectedLiveRevision: expectedLiveRevision,
        expectedDraftRevision: expectedDraftRevision,
        expectedNotificationRevision: expectedNotificationRevision
      )
    )
  }

  func publish(menuId: String, snapshot: MenuSnapshotPayload, selectedChangeIds: [String], expectedLiveRevision: Int?, expectedDraftRevision: Int?, expectedNotificationRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    try await http.request(
      path: "api/manager",
      method: .post,
      accessToken: accessToken,
      body: PublishRequest(
        action: "publish",
        menuId: menuId,
        snapshot: snapshot,
        source: source,
        selectedChangeIds: selectedChangeIds,
        expectedLiveRevision: expectedLiveRevision,
        expectedDraftRevision: expectedDraftRevision,
        expectedNotificationRevision: expectedNotificationRevision
      )
    )
  }
}

final class HistoryClient: HistoryClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func fetch(menuId: String, accessToken: String) async throws -> HistoryPayload {
    try await http.request(
      path: "api/manager",
      method: .get,
      queryItems: [
        URLQueryItem(name: "action", value: "history"),
        URLQueryItem(name: "menu_id", value: menuId),
      ],
      accessToken: accessToken
    )
  }
}

final class PreviewClient: PreviewClienting {
  private static let leroysLoungeRestaurantID = "00000000-0000-0000-0000-000000000010"
  private static let elRoysCantinaRestaurantID = "00000000-0000-0000-0000-000000000001"

  private let environment: AppEnvironment

  init(environment: AppEnvironment) {
    self.environment = environment
  }

  func exactRouteURL(for menu: MenuRecord) -> URL {
    let basePath = Self.publicRoutePath(for: menu.restaurantId)
    guard var components = URLComponents(url: environment.publicOrigin.appendingPathComponent(basePath), resolvingAgainstBaseURL: false) else {
      return environment.publicOrigin
    }
    if menu.type.lowercased() != "food" {
      components.queryItems = [URLQueryItem(name: "menu", value: "drinks")]
    }
    return components.url ?? environment.publicOrigin
  }

  private static func publicRoutePath(for restaurantId: String) -> String {
    switch restaurantId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case leroysLoungeRestaurantID, "leroys-lounge", "leroyslounge", "leroys_lounge":
      return "/leroyslounge"
    case elRoysCantinaRestaurantID, "el-roys-cantina", "elroys-cantina", "elroyscantina", "el_roys_cantina":
      return "/elroyscantina"
    default:
      return "/elroyscantina"
    }
  }
}

final class ProductLookupClient: ProductLookupClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    self.http = HTTPService(environment: environment, session: session)
  }

  func lookup(upc: String, menuId: String, accessToken: String) async throws -> ProductLookupResult {
    let trimmed = upc.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw BackendError.server(message: "Enter a barcode first.")
    }
    let menuId = menuId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !menuId.isEmpty else {
      throw BackendError.server(message: "Select a menu before scanning.")
    }
    return try await http.request(
      path: "api/manager",
      method: .post,
      accessToken: accessToken,
      body: ProductLookupRequest(action: "product_lookup", barcode: trimmed, menuId: menuId)
    )
  }
}

extension JSONDecoder {
  static var backend: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    return decoder
  }
}

extension JSONEncoder {
  static var snakeCase: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    return encoder
  }
}
