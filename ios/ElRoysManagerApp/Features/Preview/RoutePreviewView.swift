import SwiftUI
import WebKit

struct RoutePreviewScreen: View {
  let menu: MenuRecord
  let url: URL

  var body: some View {
    VStack(spacing: 18) {
      headerCard
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .appEntryReveal()

      ZStack {
        RoundedRectangle(cornerRadius: 34, style: .continuous)
          .fill(AppPalette.parchment.opacity(0.24))
        RoundedRectangle(cornerRadius: 34, style: .continuous)
          .stroke(AppPalette.cobalt.opacity(0.16), lineWidth: 0.9)
        RoundedRectangle(cornerRadius: 28, style: .continuous)
          .fill(.white.opacity(0.55))
          .padding(6)
        WebPreview(url: url)
          .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
          .padding(6)
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 18)
      .appEntryReveal(delay: 0.08)
    }
    .background {
      AppBackground()
        .ignoresSafeArea()
    }
    .navigationTitle(menu.displayTypeLabel)
    .navigationBarTitleDisplayMode(.inline)
  }

  private var headerCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        AppEyebrow(title: "Exact route preview", tint: AppPalette.cobalt)
        Spacer(minLength: 12)
        Text(menu.displayTypeLabel.uppercased())
          .font(AppTypography.micro(9, weight: .bold))
          .tracking(1.6)
          .foregroundStyle(AppPalette.espresso.opacity(0.62))
      }

      AppSectionHeader(
        eyebrow: "Route",
        title: "Deployed guest-facing route",
        tint: AppPalette.cobalt
      )

      Text(url.absoluteString)
        .font(AppTypography.body(13, weight: .medium))
        .foregroundStyle(AppPalette.espresso.opacity(0.70))
        .textSelection(.enabled)
    }
    .appGlassCard(tint: AppPalette.cobalt, cornerRadius: 34)
  }
}

private struct WebPreview: UIViewRepresentable {
  let url: URL

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    webView.load(URLRequest(url: url))
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    if webView.url != url {
      webView.load(URLRequest(url: url))
    }
  }
}
