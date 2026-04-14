import SwiftUI

struct AppPalette {
  static let brand = Color(red: 0.77, green: 0.33, blue: 0.16)
  static let accent = Color(red: 0.12, green: 0.48, blue: 0.72)
  static let canvasTop = Color(red: 0.97, green: 0.94, blue: 0.89)
  static let canvasBottom = Color(red: 0.90, green: 0.86, blue: 0.80)
  static let ink = Color(red: 0.14, green: 0.12, blue: 0.10)
  static let success = Color(red: 0.17, green: 0.56, blue: 0.34)
  static let warning = Color(red: 0.74, green: 0.50, blue: 0.18)
  static let danger = Color(red: 0.71, green: 0.24, blue: 0.22)
}

struct AppBackground: View {
  var body: some View {
    LinearGradient(
      colors: [
        AppPalette.canvasTop,
        Color.white.opacity(0.95),
        AppPalette.canvasBottom,
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
    .overlay(alignment: .topTrailing) {
      Circle()
        .fill(AppPalette.brand.opacity(0.10))
        .frame(width: 240, height: 240)
        .blur(radius: 8)
        .offset(x: 80, y: -60)
    }
    .overlay(alignment: .bottomLeading) {
      Circle()
        .fill(AppPalette.accent.opacity(0.10))
        .frame(width: 300, height: 300)
        .blur(radius: 12)
        .offset(x: -90, y: 100)
    }
    .ignoresSafeArea()
  }
}

struct GlassCardModifier: ViewModifier {
  var tint: Color
  var cornerRadius: CGFloat

  func body(content: Content) -> some View {
    if #available(iOS 26.0, *) {
      content
        .padding(18)
        .glassEffect(.regular.tint(tint.opacity(0.18)), in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .stroke(tint.opacity(0.20), lineWidth: 1)
        }
        .shadow(color: tint.opacity(0.14), radius: 18, y: 8)
    } else {
      content
        .padding(18)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .stroke(tint.opacity(0.18), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.08), radius: 18, y: 8)
    }
  }
}

extension View {
  func appGlassCard(tint: Color = AppPalette.brand, cornerRadius: CGFloat = 28) -> some View {
    modifier(GlassCardModifier(tint: tint, cornerRadius: cornerRadius))
  }
}

struct PrimaryGlassButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    if #available(iOS 26.0, *) {
      configuration.label
        .buttonStyle(.glassProminent)
        .scaleEffect(configuration.isPressed ? 0.97 : 1)
        .animation(.snappy(duration: 0.14), value: configuration.isPressed)
    } else {
      configuration.label
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(AppPalette.brand, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .foregroundStyle(.white)
        .opacity(configuration.isPressed ? 0.84 : 1)
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
  }
}

struct SecondaryGlassButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    if #available(iOS 26.0, *) {
      configuration.label
        .buttonStyle(.glass)
        .scaleEffect(configuration.isPressed ? 0.97 : 1)
        .animation(.snappy(duration: 0.14), value: configuration.isPressed)
    } else {
      configuration.label
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(AppPalette.ink.opacity(0.12), lineWidth: 1)
        }
        .foregroundStyle(AppPalette.ink)
        .opacity(configuration.isPressed ? 0.84 : 1)
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
  }
}

struct EnvironmentBadge: View {
  let environment: AppEnvironment

  var body: some View {
    Text(environment.isProduction ? "PRODUCTION" : environment.displayName.uppercased())
      .font(.caption2.weight(.semibold))
      .tracking(0.8)
      .padding(.vertical, 6)
      .padding(.horizontal, 10)
      .background(environment.isProduction ? AppPalette.success.opacity(0.16) : AppPalette.warning.opacity(0.18), in: Capsule())
      .foregroundStyle(environment.isProduction ? AppPalette.success : AppPalette.warning)
  }
}

struct StatusBanner: View {
  enum Tone {
    case neutral
    case success
    case warning
    case danger

    var color: Color {
      switch self {
      case .neutral:
        return AppPalette.accent
      case .success:
        return AppPalette.success
      case .warning:
        return AppPalette.warning
      case .danger:
        return AppPalette.danger
      }
    }
  }

  let tone: Tone
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.headline)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .appGlassCard(tint: tone.color, cornerRadius: 24)
  }
}
