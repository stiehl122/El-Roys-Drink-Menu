import SwiftUI

struct AuthGateView: View {
  @Bindable var model: AppModel

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

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.14)
        }

        AppIslandActionButton(
          title: primaryButtonTitle,
          subtitle: primaryButtonSubtitle,
          systemImage: primaryButtonSymbol,
          accent: AppPalette.brand,
          isEnabled: !model.isWorking,
          action: submit
        )
        .appEntryReveal(delay: 0.18)

        biometricCard
          .appEntryReveal(delay: 0.22)

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
        AppEyebrow(title: model.authMode.rawValue, tint: AppPalette.sage)
      }

      AppSectionHeader(
        eyebrow: "Staff access",
        title: "Manager access\nwith floor-ready chrome.",
        subtitle: "Sign in with the same Supabase-backed staff account used on the web manager. Sessions stay on device in Keychain and can be gated by Face ID or passcode.",
        tint: AppPalette.brass
      )

      Group {
        AppGlassEffectContainer(spacing: 10) {
          HStack(spacing: 10) {
            detailPill(title: "Keychain session", tint: AppPalette.cobalt)
            detailPill(title: "Native editor", tint: AppPalette.brass)
            detailPill(title: "Live preview", tint: AppPalette.brand)
          }
        }
      }
    }
    .appGlassCard(tint: AppPalette.brass, cornerRadius: 38)
  }

  private var credentialsCard: some View {
    VStack(alignment: .leading, spacing: 16) {
      AppEyebrow(title: "Credentials", tint: AppPalette.cobalt)

      fieldGroup(title: "Staff email", systemImage: "envelope.open") {
        TextField("manager@elroys.example", text: $model.email)
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
          SecureField("••••••••", text: $model.password)
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
}
