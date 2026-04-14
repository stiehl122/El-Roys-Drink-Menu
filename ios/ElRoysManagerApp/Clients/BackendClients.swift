import Foundation

struct BackendErrorPayload: Decodable {
  var error: String?
  var message: String?
  var details: String?
}

enum BackendError: LocalizedError {
  case invalidBaseURL
  case missingSupabaseConfig
  case unauthorized
  case server(message: String)
  case transport(message: String)
  case invalidResponse

  var errorDescription: String? {
    switch self {
    case .invalidBaseURL:
      return "The app environment is missing a valid API base URL."
    case .missingSupabaseConfig:
      return "Supabase config is unavailable from bootstrap."
    case .unauthorized:
      return "Your session no longer has access for this action."
    case .server(let message):
      return message
    case .transport(let message):
      return message
    case .invalidResponse:
      return "The server returned an unexpected response."
    }
  }
}

protocol BootstrapClienting {
  func fetch(accessToken: String?) async throws -> SessionBootstrapPayload
}

protocol AuthClienting {
  func signIn(config: BootstrapConfig, email: String, password: String) async throws -> AuthSession
  func signUp(config: BootstrapConfig, email: String, password: String, name: String) async throws -> AuthSession
  func refresh(config: BootstrapConfig, session: AuthSession) async throws -> AuthSession
  func sendReset(config: BootstrapConfig, email: String, redirectTo: URL) async throws
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
  func preview(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse
  func publish(menuId: String, snapshot: MenuSnapshotPayload, selectedChangeIds: [String], expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse
}

protocol HistoryClienting {
  func fetch(menuId: String, accessToken: String) async throws -> HistoryPayload
}

protocol FeaturedToolsClienting {
  func mutate(action: String, restaurantId: String, itemId: String?, slotId: String?, note: String?, direction: Int?, accessToken: String) async throws
}

protocol PreviewClienting {
  func exactRouteURL(for menu: MenuRecord) -> URL
}

protocol ProductLookupClienting {
  func lookup(upc: String) async throws -> ProductLookupResult
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
  var menuId: String
  var snapshot: MenuSnapshotPayload
  var expectedDraftRevision: Int?
  var savedAt: Int?
  var source: String
}

private struct DraftClearRequest: Encodable {
  var menuId: String
  var snapshot: [String: String]
  var expectedDraftRevision: Int?
  var source: String
}

private struct LiveSaveRequest: Encodable {
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
}

private struct SpecialsRequest: Encodable {
  var action: String
  var restaurantId: String
  var itemId: String?
  var slotId: String?
  var note: String?
  var direction: Int?
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
    return try decoder.decode(Response.self, from: data)
  }

  func requestVoid<Body: Encodable>(
    path: String,
    method: HTTPMethod = .post,
    accessToken: String? = nil,
    body: Body?
  ) async throws {
    let _: EmptyResponse = try await request(path: path, method: method, accessToken: accessToken, body: body)
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
    try await http.request(path: "api/session-bootstrap", method: .get, accessToken: accessToken)
  }
}

final class AuthClient: AuthClienting {
  private let environment: AppEnvironment
  private let session: URLSession

  init(environment: AppEnvironment, session: URLSession = .shared) {
    self.environment = environment
    self.session = session
  }

  func signIn(config: BootstrapConfig, email: String, password: String) async throws -> AuthSession {
    let auth = try await supabaseAuth(
      url: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      path: "auth/v1/token?grant_type=password",
      body: AuthRequest(email: email, password: password)
    )
    let bootstrap = try await BootstrapClient(environment: environment, session: session).fetch(accessToken: auth.accessToken)
    return makeAuthSession(from: auth, bootstrap: bootstrap)
  }

  func signUp(config: BootstrapConfig, email: String, password: String, name: String) async throws -> AuthSession {
    let auth = try await supabaseAuth(
      url: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      path: "auth/v1/signup",
      body: SignUpRequest(email: email, password: password, data: .init(name: name))
    )
    let bootstrap = try await BootstrapClient(environment: environment, session: session).fetch(accessToken: auth.accessToken)
    return makeAuthSession(from: auth, bootstrap: bootstrap)
  }

  func refresh(config: BootstrapConfig, session authSession: AuthSession) async throws -> AuthSession {
    let auth = try await supabaseAuth(
      url: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      path: "auth/v1/token?grant_type=refresh_token",
      body: RefreshRequest(refreshToken: authSession.refreshToken)
    )
    let bootstrap = try await BootstrapClient(environment: environment, session: session).fetch(accessToken: auth.accessToken)
    return makeAuthSession(from: auth, bootstrap: bootstrap)
  }

  func sendReset(config: BootstrapConfig, email: String, redirectTo: URL) async throws {
    let url = try authURL(base: config.supabaseUrl, path: "auth/v1/recover")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder.snakeCase.encode(ResetRequest(email: email, redirectTo: redirectTo.absoluteString))
    let (_, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
      throw BackendError.server(message: "Password reset could not be requested.")
    }
  }

  private func supabaseAuth<Body: Encodable>(url: String, anonKey: String, path: String, body: Body) async throws -> SupabaseAuthResponse {
    let targetURL = try authURL(base: url, path: path)
    var request = URLRequest(url: targetURL)
    request.httpMethod = "POST"
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.httpBody = try JSONEncoder.snakeCase.encode(body)
    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await session.data(for: request)
    } catch {
      throw BackendError.transport(message: error.localizedDescription)
    }
    guard let httpResponse = response as? HTTPURLResponse else {
      throw BackendError.invalidResponse
    }
    guard (200...299).contains(httpResponse.statusCode) else {
      let payload = try? JSONDecoder.backend.decode(BackendErrorPayload.self, from: data)
      throw BackendError.server(message: payload?.error ?? payload?.message ?? "Authentication failed.")
    }
    return try JSONDecoder.backend.decode(SupabaseAuthResponse.self, from: data)
  }

  private func authURL(base: String, path: String) throws -> URL {
    guard var components = URLComponents(string: base) else { throw BackendError.invalidBaseURL }
    let split = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
    let pathComponent = split.first.map(String.init) ?? path
    components.path = (components.path + "/" + pathComponent).replacingOccurrences(of: "//", with: "/")
    if split.count > 1 {
      components.percentEncodedQuery = String(split[1])
    }
    guard let url = components.url else { throw BackendError.invalidBaseURL }
    return url
  }
}

final class WorkspaceClient: WorkspaceClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func fetch(menuId: String, accessToken: String) async throws -> MenuWorkspacePayload {
    try await http.request(
      path: "api/menu-workspace",
      method: .get,
      queryItems: [
        URLQueryItem(name: "menu_id", value: menuId),
        URLQueryItem(name: "include", value: "restaurant-tools"),
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
      path: "api/menu-public",
      method: .get,
      queryItems: [URLQueryItem(name: "menu_id", value: menuId)],
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
      path: "api/menu-draft",
      method: .post,
      accessToken: accessToken,
      body: DraftSaveRequest(
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
      path: "api/menu-draft",
      method: .post,
      accessToken: accessToken,
      body: DraftClearRequest(
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
      path: "api/menu-live",
      method: .post,
      accessToken: accessToken,
      body: LiveSaveRequest(
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

  func preview(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    try await http.request(
      path: "api/menu-publish",
      method: .post,
      accessToken: accessToken,
      body: PublishRequest(
        action: "preview",
        menuId: menuId,
        snapshot: snapshot,
        source: source,
        selectedChangeIds: nil,
        expectedLiveRevision: expectedLiveRevision,
        expectedDraftRevision: expectedDraftRevision
      )
    )
  }

  func publish(menuId: String, snapshot: MenuSnapshotPayload, selectedChangeIds: [String], expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    try await http.request(
      path: "api/menu-publish",
      method: .post,
      accessToken: accessToken,
      body: PublishRequest(
        action: "publish",
        menuId: menuId,
        snapshot: snapshot,
        source: source,
        selectedChangeIds: selectedChangeIds,
        expectedLiveRevision: expectedLiveRevision,
        expectedDraftRevision: expectedDraftRevision
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
      path: "api/menu-history",
      method: .get,
      queryItems: [URLQueryItem(name: "menu_id", value: menuId)],
      accessToken: accessToken
    )
  }
}

final class FeaturedToolsClient: FeaturedToolsClienting {
  private let http: HTTPService

  init(environment: AppEnvironment, session: URLSession = .shared) {
    http = HTTPService(environment: environment, session: session)
  }

  func mutate(action: String, restaurantId: String, itemId: String?, slotId: String?, note: String?, direction: Int?, accessToken: String) async throws {
    try await http.requestVoid(
      path: "api/specials",
      method: .post,
      accessToken: accessToken,
      body: SpecialsRequest(
        action: action,
        restaurantId: restaurantId,
        itemId: itemId,
        slotId: slotId,
        note: note,
        direction: direction
      )
    )
  }
}

final class PreviewClient: PreviewClienting {
  private let environment: AppEnvironment

  init(environment: AppEnvironment) {
    self.environment = environment
  }

  func exactRouteURL(for menu: MenuRecord) -> URL {
    let basePath = menu.restaurantId == "leroys-lounge" ? "/leroyslounge" : "/elroyscantina"
    guard var components = URLComponents(url: environment.publicOrigin.appendingPathComponent(basePath), resolvingAgainstBaseURL: false) else {
      return environment.publicOrigin
    }
    if menu.type.lowercased() != "food" {
      components.queryItems = [URLQueryItem(name: "menu", value: "drinks")]
    }
    return components.url ?? environment.publicOrigin
  }
}

final class ProductLookupClient: ProductLookupClienting {
  private let session: URLSession
  private let decoder = JSONDecoder.backend

  init(session: URLSession = .shared) {
    self.session = session
  }

  func lookup(upc: String) async throws -> ProductLookupResult {
    let trimmed = upc.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw BackendError.server(message: "Enter a barcode first.")
    }
    let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(trimmed).json")!
    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await session.data(from: url)
    } catch {
      throw BackendError.transport(message: error.localizedDescription)
    }
    guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
      throw BackendError.server(message: "Open Food Facts is unavailable right now.")
    }

    struct OFFPayload: Decodable {
      struct Product: Decodable {
        var productName: String?
        var genericName: String?
        var brands: String?
      }
      var product: Product?
      var status: Int?
    }

    let payload = try decoder.decode(OFFPayload.self, from: data)
    guard payload.status == 1, let product = payload.product else {
      throw BackendError.server(message: "No product was found for that barcode.")
    }
    let name = [product.productName, product.brands]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .first(where: { !$0.isEmpty }) ?? "Scanned Item"
    let description = product.genericName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return ProductLookupResult(barcode: trimmed, name: name, description: description)
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
