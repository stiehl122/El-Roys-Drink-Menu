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

  // Cinematic additions — consumed by the Home surface, safe to reuse elsewhere.
  static let brass      = Color(red: 0.757, green: 0.604, blue: 0.286)
  static let ember      = Color(red: 0.910, green: 0.381, blue: 0.164)
  static let oxblood    = Color(red: 0.478, green: 0.114, blue: 0.133)
  static let charcoal   = Color(red: 0.051, green: 0.043, blue: 0.043)
  static let ivory      = Color(red: 0.949, green: 0.913, blue: 0.847)
  static let cobalt     = Color(red: 0.118, green: 0.302, blue: 0.549)
  static let marigold   = Color(red: 0.910, green: 0.639, blue: 0.090)
  static let jade       = Color(red: 0.122, green: 0.373, blue: 0.227)
  static let terracotta = Color(red: 0.788, green: 0.416, blue: 0.231)
  static let bloodOrange = Color(red: 0.780, green: 0.243, blue: 0.114)
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

// MARK: - Decorative atmosphere

/// Deterministic film-grain overlay. Non-interactive, renders once per size.
struct FilmGrain: View {
  var intensity: Double = 0.06
  var seed: UInt64 = 42
  var density: Double = 120

  var body: some View {
    Canvas(opaque: false, rendersAsynchronously: true) { context, size in
      var rng = SeededRNG(seed: seed)
      let w = Double(size.width)
      let h = Double(size.height)
      let count = max(1, Int((w * h) / density))
      for _ in 0..<count {
        let x = Double.random(in: 0..<w, using: &rng)
        let y = Double.random(in: 0..<h, using: &rng)
        let r = Double.random(in: 0.3...0.9, using: &rng)
        let a = Double.random(in: 0.04...max(0.05, intensity), using: &rng)
        context.fill(
          Path(ellipseIn: CGRect(x: x, y: y, width: r, height: r)),
          with: .color(.white.opacity(a))
        )
      }
    }
    .allowsHitTesting(false)
    .blendMode(.overlay)
  }
}

/// Art-deco chevron cornice. For the speakeasy theme.
struct ArtDecoChevronPattern: View {
  var color: Color
  var spacing: CGFloat = 44
  var lineWidth: CGFloat = 0.6

  var body: some View {
    Canvas { context, size in
      let h: CGFloat = 12
      var y: CGFloat = -h
      while y < size.height + h {
        var path = Path()
        var x: CGFloat = -spacing
        while x < size.width + spacing {
          path.move(to: CGPoint(x: x, y: y + h))
          path.addLine(to: CGPoint(x: x + spacing / 2, y: y))
          path.addLine(to: CGPoint(x: x + spacing, y: y + h))
          x += spacing
        }
        context.stroke(
          path,
          with: .color(color),
          style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
        )
        y += spacing * 0.72
      }
    }
    .allowsHitTesting(false)
  }
}

/// Punched-tin diamond lattice with dotted intersections. For the mercado theme.
struct PunchedTinDiamondPattern: View {
  var color: Color
  var spacing: CGFloat = 34
  var lineWidth: CGFloat = 0.5

  var body: some View {
    Canvas { context, size in
      var row = 0
      var y: CGFloat = 0
      while y < size.height + spacing {
        let offset: CGFloat = (row % 2 == 0) ? 0 : spacing / 2
        var x: CGFloat = offset - spacing
        while x < size.width + spacing {
          var diamond = Path()
          diamond.move(to: CGPoint(x: x, y: y - spacing / 2))
          diamond.addLine(to: CGPoint(x: x + spacing / 2, y: y))
          diamond.addLine(to: CGPoint(x: x, y: y + spacing / 2))
          diamond.addLine(to: CGPoint(x: x - spacing / 2, y: y))
          diamond.closeSubpath()
          context.stroke(diamond, with: .color(color), style: StrokeStyle(lineWidth: lineWidth))
          context.fill(
            Path(ellipseIn: CGRect(x: x - 1, y: y - 1, width: 2, height: 2)),
            with: .color(color)
          )
          x += spacing
        }
        y += spacing / 2
        row += 1
      }
    }
    .allowsHitTesting(false)
  }
}

/// Radiating sunburst at a corner. For El Roy's atmosphere.
struct SunburstRays: View {
  var color: Color
  var rayCount: Int = 28
  var innerRadius: CGFloat = 18
  var outerRadius: CGFloat = 160
  var lineWidth: CGFloat = 0.6

  var body: some View {
    Canvas { context, size in
      let origin = CGPoint(x: 0, y: 0)
      var path = Path()
      for i in 0..<rayCount {
        let a = (Double(i) / Double(rayCount)) * (.pi / 2)
        let x1 = origin.x + cos(a) * innerRadius
        let y1 = origin.y + sin(a) * innerRadius
        let x2 = origin.x + cos(a) * outerRadius
        let y2 = origin.y + sin(a) * outerRadius
        path.move(to: CGPoint(x: x1, y: y1))
        path.addLine(to: CGPoint(x: x2, y: y2))
      }
      context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
    }
    .allowsHitTesting(false)
  }
}

/// Fan of hairline brass rules from a corner. For Leroy's atmosphere.
struct DecoFan: View {
  var color: Color
  var rayCount: Int = 14
  var radius: CGFloat = 180
  var lineWidth: CGFloat = 0.5

  var body: some View {
    Canvas { context, size in
      let origin = CGPoint(x: size.width, y: 0)
      var path = Path()
      for i in 0..<rayCount {
        let a = Double.pi + (Double(i) / Double(rayCount - 1)) * (.pi / 2)
        let x2 = origin.x + cos(a) * radius
        let y2 = origin.y - sin(a) * radius
        path.move(to: origin)
        path.addLine(to: CGPoint(x: x2, y: y2))
      }
      context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
    }
    .allowsHitTesting(false)
  }
}

/// Hairline brass rule with faded ends.
struct BrassRule: View {
  var color: Color
  var height: CGFloat = 0.6
  var body: some View {
    LinearGradient(
      colors: [color.opacity(0), color.opacity(0.85), color.opacity(0)],
      startPoint: .leading, endPoint: .trailing
    )
    .frame(height: height)
  }
}

/// Zig-zag ric-rac rule. El Roy's decorative divider.
struct RicRacRule: View {
  var color: Color
  var amplitude: CGFloat = 3
  var step: CGFloat = 9
  var body: some View {
    Canvas { context, size in
      var path = Path()
      let mid = size.height / 2
      path.move(to: CGPoint(x: 0, y: mid))
      var x: CGFloat = 0
      var up = true
      while x <= size.width {
        x += step / 2
        path.addLine(to: CGPoint(x: x, y: mid + (up ? -amplitude : amplitude)))
        up.toggle()
      }
      context.stroke(
        path,
        with: .color(color),
        style: StrokeStyle(lineWidth: 0.9, lineCap: .round, lineJoin: .round)
      )
    }
    .frame(height: max(amplitude * 2 + 2, 8))
  }
}

/// Deterministic PRNG so grain & scattered motifs render the same each layout pass.
struct SeededRNG: RandomNumberGenerator {
  var seed: UInt64
  mutating func next() -> UInt64 {
    seed = seed &* 6364136223846793005 &+ 1442695040888963407
    return seed
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
