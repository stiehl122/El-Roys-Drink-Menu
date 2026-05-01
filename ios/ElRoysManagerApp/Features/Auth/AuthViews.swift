import AuthenticationServices
import CryptoKit
import Security
import SwiftUI

struct AuthGateView: View {
  @Bindable var model: AppModel
  @State private var currentAppleNonce: String?

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 22) {
        heroCard
          .appEntryReveal()

        AppSegmentedControl(
          options: AuthScreenMode.allCases,
          selection: $model.authMode,
          accent: AppPalette.brand,
          title: { $0.rawValue }
        )
        .appEntryReveal(delay: 0.05)

        credentialsCard
          .appEntryReveal(delay: 0.10)

        appleSignInCard
          .appEntryReveal(delay: 0.14)

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.16)
        }

        AppIslandActionButton(
          title: primaryButtonTitle,
          subtitle: primaryButtonSubtitle,
          systemImage: primaryButtonSymbol,
          accent: AppPalette.brand,
          isEnabled: !model.isWorking,
          action: submit
        )
        .appEntryReveal(delay: 0.20)

        biometricCard
          .appEntryReveal(delay: 0.24)

        Color.clear.frame(height: 22)
      }
      .padding(.horizontal, 24)
      .padding(.top, 34)
      .padding(.bottom, 20)
    }
    .scrollBounceBehavior(.basedOnSize)
  }

  private var heroCard: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack {
        EnvironmentBadge(environment: model.environment)
        Spacer(minLength: 16)
        AppEyebrow(title: "Unified staff auth", tint: AppPalette.sage)
      }

      AppSectionHeader(
        eyebrow: "Staff access",
        title: "One staff pass\nfor both menus.",
        subtitle: "Use Apple or your staff password to open the same Supabase-backed manager workspace used on the web. Sessions stay in Keychain and can be gated by Face ID or passcode.",
        tint: AppPalette.brass
      )

      Group {
        if #available(iOS 26.0, *) {
          GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
              detailPill(title: "Keychain session", tint: AppPalette.cobalt)
              detailPill(title: "Apple sign-in", tint: AppPalette.charcoal)
              detailPill(title: "Menu access", tint: AppPalette.brand)
            }
          }
        } else {
          HStack(spacing: 10) {
            detailPill(title: "Keychain session", tint: AppPalette.cobalt)
            detailPill(title: "Apple sign-in", tint: AppPalette.charcoal)
            detailPill(title: "Menu access", tint: AppPalette.brand)
          }
        }
      }
    }
    .appGlassCard(tint: AppPalette.brass, cornerRadius: 38)
  }

  private var credentialsCard: some View {
    VStack(alignment: .leading, spacing: 16) {
      AppEyebrow(title: "Staff password", tint: AppPalette.cobalt)

      fieldGroup(title: "Staff email", systemImage: "envelope.open") {
        TextField("Email", text: $model.email)
          .keyboardType(.emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .font(AppTypography.body(16, weight: .medium))
          .foregroundStyle(AppPalette.ink)
          .padding(.horizontal, 16)
          .padding(.vertical, 16)
          .appFieldChrome(tint: AppPalette.cobalt)
      }

      if model.authMode != .reset {
        fieldGroup(title: "Password", systemImage: "lock") {
          SecureField("Password", text: $model.password)
            .font(AppTypography.body(16, weight: .medium))
            .foregroundStyle(AppPalette.ink)
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .appFieldChrome(tint: AppPalette.brand)
        }
      }

      if model.authMode == .signUp {
        fieldGroup(title: "Display name", systemImage: "person.text.rectangle") {
          TextField("Name used on edits and history", text: $model.displayName)
            .font(AppTypography.body(16, weight: .medium))
            .foregroundStyle(AppPalette.ink)
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .appFieldChrome(tint: AppPalette.sage)
        }
      }
    }
    .appGlassCard(tint: AppPalette.sage, cornerRadius: 34)
  }

  private var appleSignInCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 10) {
        Image(systemName: "apple.logo")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(AppPalette.charcoal)
        VStack(alignment: .leading, spacing: 3) {
          Text("Continue with Apple")
            .font(AppTypography.body(17, weight: .bold))
            .foregroundStyle(AppPalette.ink)
          Text("Recommended for approved staff accounts.")
            .font(AppTypography.body(13, weight: .medium))
            .foregroundStyle(AppPalette.espresso.opacity(0.72))
        }
        Spacer(minLength: 10)
      }

      SignInWithAppleButton(.continue) { request in
        let nonce = randomNonceString()
        currentAppleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)
      } onCompletion: { result in
        handleAppleAuthorization(result)
      }
      .signInWithAppleButtonStyle(.black)
      .frame(height: 50)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .disabled(model.isWorking)
      .accessibilityLabel("Continue with Apple")
    }
    .appGlassCard(tint: AppPalette.charcoal, cornerRadius: 30)
  }

  private var biometricCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      AppEyebrow(title: "Device protection", tint: AppPalette.warning)
      Text("Require Face ID or passcode before restoring the saved session.")
        .font(AppTypography.body(15, weight: .medium))
        .foregroundStyle(AppPalette.espresso)
      Toggle(
        "Biometric unlock",
        isOn: Binding(
          get: { SessionStore().biometricUnlockEnabled },
          set: { SessionStore().biometricUnlockEnabled = $0 }
        )
      )
      .tint(AppPalette.brand)
      .font(AppTypography.body(15, weight: .semibold))
      .foregroundStyle(AppPalette.ink)
    }
    .appGlassCard(tint: AppPalette.warning, cornerRadius: 30)
  }

  @ViewBuilder
  private func fieldGroup<Content: View>(title: String, systemImage: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: systemImage)
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(AppPalette.brand)
        Text(title.uppercased())
          .font(AppTypography.micro(10, weight: .bold))
          .tracking(1.8)
          .foregroundStyle(AppPalette.espresso.opacity(0.76))
      }
      content()
    }
  }

  private func detailPill(title: String, tint: Color) -> some View {
    Text(title.uppercased())
      .font(AppTypography.micro(9, weight: .bold))
      .tracking(1.6)
      .padding(.vertical, 8)
      .padding(.horizontal, 10)
      .background(tint.opacity(0.12), in: Capsule(style: .continuous))
      .overlay {
        Capsule(style: .continuous)
          .stroke(tint.opacity(0.22), lineWidth: 0.7)
      }
      .foregroundStyle(tint)
  }

  private var primaryButtonTitle: String {
    switch model.authMode {
    case .signIn:
      return "Sign In"
    case .signUp:
      return "Create Account"
    case .reset:
      return "Send Reset Link"
    }
  }

  private var primaryButtonSubtitle: String {
    switch model.authMode {
    case .signIn:
      return "Restore the saved manager session and load the live workspace."
    case .signUp:
      return "Create a staff account and move straight into the native manager."
    case .reset:
      return "Send the recovery link to the staff email on file."
    }
  }

  private var primaryButtonSymbol: String {
    switch model.authMode {
    case .signIn:
      return "arrow.up.right"
    case .signUp:
      return "plus"
    case .reset:
      return "paperplane"
    }
  }

  private func submit() {
    Task {
      switch model.authMode {
      case .signIn:
        await model.signIn()
      case .signUp:
        await model.signUp()
      case .reset:
        await model.sendPasswordReset()
      }
    }
  }

  private func handleAppleAuthorization(_ result: Result<ASAuthorization, Error>) {
    switch result {
    case .success(let authorization):
      guard
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
        let identityTokenData = credential.identityToken,
        let identityToken = String(data: identityTokenData, encoding: .utf8),
        let nonce = currentAppleNonce
      else {
        model.notice = AppNotice(tone: .warning, title: "Apple Sign-In Failed", message: "Apple did not return a valid identity token.")
        return
      }
      let fullName = PersonNameComponentsFormatter().string(from: credential.fullName ?? PersonNameComponents()).trimmingCharacters(in: .whitespacesAndNewlines)
      Task {
        await model.signInWithApple(identityToken: identityToken, nonce: nonce, fullName: fullName.isEmpty ? nil : fullName)
      }
    case .failure(let error):
      model.notice = AppNotice(tone: .warning, title: "Apple Sign-In Cancelled", message: error.localizedDescription)
    }
  }

  private func randomNonceString(length: Int = 32) -> String {
    precondition(length > 0)
    let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remainingLength = length

    while remainingLength > 0 {
      var randoms = [UInt8](repeating: 0, count: 16)
      let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
      if status != errSecSuccess {
        fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(status)")
      }

      randoms.forEach { random in
        if remainingLength == 0 { return }
        if random < UInt8(charset.count) {
          result.append(charset[Int(random)])
          remainingLength -= 1
        }
      }
    }
    return result
  }

  private func sha256(_ input: String) -> String {
    let inputData = Data(input.utf8)
    let hashedData = SHA256.hash(data: inputData)
    return hashedData.map { String(format: "%02x", $0) }.joined()
  }
}
