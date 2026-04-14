import SwiftUI

struct AuthGateView: View {
  @Bindable var model: AppModel

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 10) {
          EnvironmentBadge(environment: model.environment)
          Text("Staff Manager")
            .font(.system(size: 36, weight: .bold, design: .rounded))
            .foregroundStyle(AppPalette.ink)
          Text("Sign in with the same Supabase-backed staff account used on the web manager. Sessions are stored in Keychain and can be re-opened with biometrics.")
            .font(.title3)
            .foregroundStyle(.secondary)
        }

        Picker("Mode", selection: $model.authMode) {
          ForEach(AuthScreenMode.allCases) { mode in
            Text(mode.rawValue).tag(mode)
          }
        }
        .pickerStyle(.segmented)

        VStack(spacing: 14) {
          TextField("Staff email", text: $model.email)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .textFieldStyle(.roundedBorder)

          if model.authMode != .reset {
            SecureField("Password", text: $model.password)
              .textFieldStyle(.roundedBorder)
          }

          if model.authMode == .signUp {
            TextField("Display name", text: $model.displayName)
              .textFieldStyle(.roundedBorder)
          }
        }

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        Button(action: submit) {
          Label(primaryButtonTitle, systemImage: primaryButtonSymbol)
            .font(.headline)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(PrimaryGlassButtonStyle())
        .disabled(model.isWorking)

        Toggle("Require Face ID / passcode before restoring the saved session", isOn: Binding(
          get: { SessionStore().biometricUnlockEnabled },
          set: { SessionStore().biometricUnlockEnabled = $0 }
        ))
        .font(.footnote)
        .toggleStyle(.switch)
      }
      .padding(24)
      .appGlassCard(tint: AppPalette.brand, cornerRadius: 30)
      .padding(24)
    }
    .scrollBounceBehavior(.basedOnSize)
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

  private var primaryButtonSymbol: String {
    switch model.authMode {
    case .signIn:
      return "person.crop.circle.badge.checkmark"
    case .signUp:
      return "person.crop.circle.badge.plus"
    case .reset:
      return "envelope.badge"
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
