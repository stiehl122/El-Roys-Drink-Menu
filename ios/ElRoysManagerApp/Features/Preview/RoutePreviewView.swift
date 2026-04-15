import SwiftUI
import WebKit

struct RoutePreviewScreen: View {
  @Bindable var model: AppModel
  let menu: MenuRecord

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text("Exact Route Preview")
            .font(.headline)
          Text(model.exactRoutePreviewURL(for: menu).absoluteString)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        Spacer()
      }
      .padding(16)
      .background(.thinMaterial)

      WebPreview(url: model.exactRoutePreviewURL(for: menu))
    }
    .navigationTitle(menu.displayTypeLabel)
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct WebPreview: UIViewRepresentable {
  let url: URL

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.load(URLRequest(url: url))
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    if webView.url != url {
      webView.load(URLRequest(url: url))
    }
  }
}
