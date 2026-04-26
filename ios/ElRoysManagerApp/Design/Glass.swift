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

  // Brand texture palette
  static let brass = Color(red: 0.757, green: 0.604, blue: 0.286)
  static let ember = Color(red: 0.910, green: 0.381, blue: 0.164)
  static let oxblood = Color(red: 0.478, green: 0.114, blue: 0.133)
  static let charcoal = Color(red: 0.051, green: 0.043, blue: 0.043)
  static let ivory = Color(red: 0.949, green: 0.913, blue: 0.847)
  static let cobalt = Color(red: 0.118, green: 0.302, blue: 0.549)
  static let marigold = Color(red: 0.910, green: 0.639, blue: 0.090)
  static let jade = Color(red: 0.122, green: 0.373, blue: 0.227)
  static let terracotta = Color(red: 0.788, green: 0.416, blue: 0.231)
  static let bloodOrange = Color(red: 0.780, green: 0.243, blue: 0.114)
  static let sage = Color(red: 0.478, green: 0.545, blue: 0.431)
  static let espresso = Color(red: 0.188, green: 0.137, blue: 0.110)
  static let parchment = Color(red: 0.992, green: 0.972, blue: 0.936)
  static let alabaster = Color(red: 0.978, green: 0.957, blue: 0.918)
  static let linen = Color(red: 0.956, green: 0.921, blue: 0.862)
}

enum AppMotion {
  static let reveal = Animation.timingCurve(0.32, 0.72, 0.0, 1.0, duration: 0.82)
  static let settle = Animation.timingCurve(0.22, 0.86, 0.18, 1.0, duration: 0.62)
  static let snap = Animation.timingCurve(0.32, 0.72, 0.0, 1.0, duration: 0.38)
  static let press = Animation.interpolatingSpring(stiffness: 290, damping: 25)
}

enum AppTypography {
  static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
    .system(size: size, weight: weight, design: .rounded)
  }

  static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight, design: .rounded)
  }

  static func micro(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
    .system(size: size, weight: weight, design: .monospaced)
  }
}

struct AppGlassEffectContainer<Content: View>: View {
  private let spacing: CGFloat
  private let content: () -> Content

  init(spacing: CGFloat, @ViewBuilder content: @escaping () -> Content) {
    self.spacing = spacing
    self.content = content
  }

  var body: some View {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      GlassEffectContainer(spacing: spacing) {
        content()
      }
    } else {
      content()
    }
    #else
    content()
    #endif
  }
}

struct AppBackground: View {
  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          AppPalette.parchment,
          AppPalette.alabaster,
          AppPalette.canvasBottom,
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      Circle()
        .fill(AppPalette.brand.opacity(0.12))
        .frame(width: 320, height: 320)
        .blur(radius: 24)
        .offset(x: 128, y: -180)

      Circle()
        .fill(AppPalette.sage.opacity(0.10))
        .frame(width: 360, height: 360)
        .blur(radius: 34)
        .offset(x: -160, y: 190)

      Circle()
        .fill(AppPalette.brass.opacity(0.10))
        .frame(width: 260, height: 260)
        .blur(radius: 22)
        .offset(x: -120, y: -240)

      FilmGrain(intensity: 0.055, seed: 117)
        .opacity(0.26)
    }
    .ignoresSafeArea()
  }
}

struct GlassCardModifier: ViewModifier {
  var tint: Color
  var cornerRadius: CGFloat

  func body(content: Content) -> some View {
    let innerRadius = max(18, cornerRadius - 7)

    content
      .padding(22)
      .background {
        ZStack {
          #if compiler(>=6.2)
          if #available(iOS 26.0, *) {
            Color.clear
              .glassEffect(
                .regular.tint(tint.opacity(0.12)),
                in: .rect(cornerRadius: cornerRadius)
              )
          }
          #endif

          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(tint.opacity(0.07))

          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(.white.opacity(0.18))
            .padding(0.75)

          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .stroke(tint.opacity(0.18), lineWidth: 0.9)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .fill(
              LinearGradient(
                colors: [
                  AppPalette.parchment.opacity(0.98),
                  AppPalette.linen.opacity(0.94),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .padding(6)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .stroke(.white.opacity(0.78), lineWidth: 0.75)
            .padding(6)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .stroke(tint.opacity(0.14), lineWidth: 0.9)
            .padding(6)
        }
        .shadow(color: AppPalette.espresso.opacity(0.10), radius: 22, y: 14)
        .shadow(color: tint.opacity(0.08), radius: 26, y: 16)
      }
  }
}

struct FieldChromeModifier: ViewModifier {
  var tint: Color
  var cornerRadius: CGFloat

  func body(content: Content) -> some View {
    let innerRadius = max(14, cornerRadius - 6)

    content
      .background {
        ZStack {
          #if compiler(>=6.2)
          if #available(iOS 26.0, *) {
            Color.clear
              .glassEffect(
                .regular.tint(tint.opacity(0.08)),
                in: .rect(cornerRadius: cornerRadius)
              )
          }
          #endif

          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(tint.opacity(0.08))

          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .stroke(tint.opacity(0.18), lineWidth: 0.9)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .fill(
              LinearGradient(
                colors: [
                  .white.opacity(0.88),
                  AppPalette.parchment.opacity(0.92),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .padding(5)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .stroke(.white.opacity(0.66), lineWidth: 0.7)
            .padding(5)
        }
      }
  }
}

struct AppPillChromeModifier: ViewModifier {
  var accent: Color
  var filled: Bool

  func body(content: Content) -> some View {
    content
      .background {
        let shell = Capsule()
        let inner = Capsule()

        ZStack {
          shell
            .fill(filled ? accent.opacity(0.16) : accent.opacity(0.08))
          shell
            .stroke(accent.opacity(filled ? 0.22 : 0.18), lineWidth: 0.9)
          inner
            .fill(
              LinearGradient(
                colors: filled
                  ? [accent.opacity(0.72), accent.opacity(0.48)]
                  : [.white.opacity(0.82), AppPalette.parchment.opacity(0.90)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .padding(5)
          inner
            .stroke(filled ? .white.opacity(0.24) : .white.opacity(0.64), lineWidth: 0.7)
            .padding(5)
        }
        .shadow(color: accent.opacity(filled ? 0.18 : 0.08), radius: 18, y: 10)
      }
  }
}

extension View {
  func appGlassCard(tint: Color = AppPalette.brand, cornerRadius: CGFloat = 30) -> some View {
    modifier(GlassCardModifier(tint: tint, cornerRadius: cornerRadius))
  }

  func appFieldChrome(tint: Color = AppPalette.brass, cornerRadius: CGFloat = 22) -> some View {
    modifier(FieldChromeModifier(tint: tint, cornerRadius: cornerRadius))
  }

  func appPillChrome(accent: Color = AppPalette.brand, filled: Bool = false) -> some View {
    modifier(AppPillChromeModifier(accent: accent, filled: filled))
  }
}

struct PrimaryGlassButtonStyle: ButtonStyle {
  var accent: Color = AppPalette.brand

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .foregroundStyle(.white)
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .opacity(configuration.isPressed ? 0.94 : 1)
      .animation(AppMotion.press, value: configuration.isPressed)
      .appPillChrome(accent: accent, filled: true)
  }
}

struct SecondaryGlassButtonStyle: ButtonStyle {
  var accent: Color = AppPalette.brass

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .foregroundStyle(AppPalette.ink)
      .scaleEffect(configuration.isPressed ? 0.988 : 1)
      .opacity(configuration.isPressed ? 0.9 : 1)
      .animation(AppMotion.press, value: configuration.isPressed)
      .appPillChrome(accent: accent, filled: false)
  }
}

struct AppEyebrow: View {
  let title: String
  var tint: Color = AppPalette.brass

  var body: some View {
    Text(title.uppercased())
      .font(AppTypography.micro(10, weight: .bold))
      .tracking(2.2)
      .padding(.vertical, 8)
      .padding(.horizontal, 12)
      .background(tint.opacity(0.12), in: Capsule())
      .overlay {
        Capsule()
          .stroke(tint.opacity(0.24), lineWidth: 0.8)
      }
      .foregroundStyle(tint)
  }
}

struct AppIslandButtonLabel: View {
  let title: String
  var subtitle: String? = nil
  let systemImage: String

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: subtitle == nil ? 0 : 5) {
        Text(title)
          .font(AppTypography.body(16, weight: .bold))
          .foregroundStyle(.white)
        if let subtitle, !subtitle.isEmpty {
          Text(subtitle)
            .font(AppTypography.body(12, weight: .medium))
            .foregroundStyle(.white.opacity(0.82))
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      Spacer(minLength: 12)

      ZStack {
        Circle()
          .fill(.white.opacity(0.16))
        Circle()
          .stroke(.white.opacity(0.30), lineWidth: 0.8)
        Image(systemName: systemImage)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(.white)
      }
      .frame(width: 36, height: 36)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 15)
    .frame(maxWidth: .infinity)
  }
}

struct AppIslandActionButton: View {
  let title: String
  var subtitle: String? = nil
  let systemImage: String
  var accent: Color = AppPalette.brand
  var isEnabled: Bool = true
  let action: () -> Void

  var body: some View {
    Group {
      #if compiler(>=6.2)
      if #available(iOS 26.0, *) {
        Button(action: action) {
          AppIslandButtonLabel(
            title: title,
            subtitle: subtitle,
            systemImage: systemImage
          )
        }
        .buttonStyle(.glassProminent)
        .tint(accent)
      } else {
        fallbackButton
      }
      #else
      fallbackButton
      #endif
    }
    .disabled(!isEnabled)
    .opacity(isEnabled ? 1 : 0.55)
    .scaleEffect(isEnabled ? 1 : 0.992)
    .animation(AppMotion.snap, value: isEnabled)
  }

  private var fallbackButton: some View {
    Button(action: action) {
      AppIslandButtonLabel(
        title: title,
        subtitle: subtitle,
        systemImage: systemImage
      )
    }
    .buttonStyle(.plain)
    .appPillChrome(accent: accent, filled: true)
  }
}

struct AppSectionHeader: View {
  let eyebrow: String
  let title: String
  var subtitle: String? = nil
  var tint: Color = AppPalette.brand

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      AppEyebrow(title: eyebrow, tint: tint)
      Text(title)
        .font(AppTypography.display(28, weight: .bold))
        .foregroundStyle(AppPalette.espresso)
      if let subtitle, !subtitle.isEmpty {
        Text(subtitle)
          .font(AppTypography.body(15, weight: .medium))
          .foregroundStyle(AppPalette.espresso.opacity(0.72))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }
}

struct AppMetricPill: View {
  let title: String
  let value: String
  var accent: Color = AppPalette.brand

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(title.uppercased())
        .font(AppTypography.micro(9, weight: .bold))
        .tracking(1.6)
        .foregroundStyle(accent)
      Text(value)
        .font(AppTypography.display(18, weight: .bold))
        .foregroundStyle(AppPalette.espresso)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .appFieldChrome(tint: accent, cornerRadius: 20)
  }
}

struct AppLoadingCard: View {
  let title: String
  var subtitle: String? = nil
  var tint: Color = AppPalette.brand
  var titleColor: Color = AppPalette.espresso
  var subtitleColor: Color = AppPalette.espresso.opacity(0.68)

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(spacing: 12) {
        AppSkeletonBlock(width: 42, height: 42, cornerRadius: 14, tint: tint)
        VStack(alignment: .leading, spacing: 8) {
          Text(title)
            .font(AppTypography.body(16, weight: .bold))
            .foregroundStyle(titleColor)
          if let subtitle, !subtitle.isEmpty {
            Text(subtitle)
              .font(AppTypography.body(13, weight: .medium))
              .foregroundStyle(subtitleColor)
          }
        }
      }

      VStack(alignment: .leading, spacing: 10) {
        AppSkeletonBlock(width: nil, height: 14, cornerRadius: 8, tint: tint.opacity(0.7))
        AppSkeletonBlock(width: nil, height: 14, cornerRadius: 8, tint: tint.opacity(0.52))
        AppSkeletonBlock(width: 180, height: 14, cornerRadius: 8, tint: tint.opacity(0.40))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .appGlassCard(tint: tint, cornerRadius: 32)
  }
}

struct AppSkeletonBlock: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  var width: CGFloat?
  var height: CGFloat
  var cornerRadius: CGFloat
  var tint: Color

  var body: some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
      .fill(
        LinearGradient(
          colors: [
            tint.opacity(0.20),
            .white.opacity(0.82),
            tint.opacity(0.16),
          ],
          startPoint: .leading,
          endPoint: .trailing
        )
      )
      .frame(maxWidth: width == nil ? .infinity : width, minHeight: height, maxHeight: height)
      .opacity(reduceMotion ? 0.82 : 1)
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(.white.opacity(0.45), lineWidth: 0.7)
      }
  }
}

struct AppSegmentedControl<Selection: Hashable>: View {
  let options: [Selection]
  @Binding var selection: Selection
  var accent: Color = AppPalette.brand
  var title: (Selection) -> String
  @Namespace private var namespace

  var body: some View {
    HStack(spacing: 8) {
      ForEach(options, id: \.self) { option in
        let isSelected = option == selection
        Button {
          withAnimation(AppMotion.settle) {
            selection = option
          }
        } label: {
          Text(title(option).uppercased())
            .font(AppTypography.micro(10, weight: .bold))
            .tracking(1.7)
            .foregroundStyle(isSelected ? AppPalette.ink : AppPalette.espresso.opacity(0.72))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background {
              if isSelected {
                Capsule()
                  .fill(.white.opacity(0.74))
                  .matchedGeometryEffect(id: "app-segmented-selection", in: namespace)
                  .padding(3)
              }
            }
        }
        .buttonStyle(.plain)
      }
    }
    .padding(4)
    .background {
      Capsule()
        .fill(accent.opacity(0.10))
      Capsule()
        .stroke(accent.opacity(0.18), lineWidth: 0.9)
      Capsule()
        .stroke(.white.opacity(0.52), lineWidth: 0.6)
        .padding(3)
    }
  }
}

struct AppEntryRevealModifier: ViewModifier {
  let delay: Double
  @State private var isVisible = false

  func body(content: Content) -> some View {
    content
      .opacity(isVisible ? 1 : 0)
      .offset(y: isVisible ? 0 : 18)
      .scaleEffect(isVisible ? 1 : 0.985)
      .onAppear {
        guard !isVisible else { return }
        withAnimation(AppMotion.reveal.delay(delay)) {
          isVisible = true
        }
      }
  }
}

extension View {
  func appEntryReveal(delay: Double = 0) -> some View {
    modifier(AppEntryRevealModifier(delay: delay))
  }
}

struct EnvironmentBadge: View {
  let environment: AppEnvironment

  var body: some View {
    let tint = environment.isProduction ? AppPalette.success : AppPalette.warning

    return Text(environment.isProduction ? "PRODUCTION" : environment.displayName.uppercased())
      .font(AppTypography.micro(10, weight: .bold))
      .tracking(1.8)
      .padding(.vertical, 8)
      .padding(.horizontal, 12)
      .background(tint.opacity(0.12), in: Capsule())
      .overlay {
        Capsule()
          .stroke(tint.opacity(0.24), lineWidth: 0.8)
      }
      .foregroundStyle(tint)
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

    var symbol: String {
      switch self {
      case .neutral:
        return "bell.badge"
      case .success:
        return "checkmark.circle.fill"
      case .warning:
        return "exclamationmark.triangle.fill"
      case .danger:
        return "xmark.octagon.fill"
      }
    }
  }

  let tone: Tone
  let title: String
  let message: String

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: tone.symbol)
        .font(.system(size: 15, weight: .bold))
        .foregroundStyle(tone.color)
        .frame(width: 34, height: 34)
        .background(tone.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

      VStack(alignment: .leading, spacing: 5) {
        Text(title)
          .font(AppTypography.body(15, weight: .bold))
          .foregroundStyle(AppPalette.espresso)
        Text(message)
          .font(AppTypography.body(13, weight: .medium))
          .foregroundStyle(AppPalette.espresso.opacity(0.72))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .appGlassCard(tint: tone.color, cornerRadius: 24)
  }
}
