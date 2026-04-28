import SafariServices
import SwiftUI

struct RoutePreviewScreen: View {
  let menu: MenuRecord
  let url: URL
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    SafariRoutePreview(url: url)
      .ignoresSafeArea()
      .navigationTitle(menu.displayTypeLabel)
      .navigationBarTitleDisplayMode(.inline)
  }
}

private struct SafariRoutePreview: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    let controller = SFSafariViewController(url: url)
    controller.dismissButtonStyle = .done
    return controller
  }

  func updateUIViewController(_ controller: SFSafariViewController, context: Context) {
  }
}
