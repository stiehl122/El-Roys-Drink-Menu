import SafariServices
import SwiftUI

struct RoutePreviewScreen: View {
  let menu: MenuRecord
  let url: URL
  @Environment(\.dismiss) private var dismiss
  @State private var isPresentingSafari = false

  var body: some View {
    VStack(spacing: 14) {
      ProgressView()
        .tint(AppPalette.brand)
      Text("Opening exact route preview")
        .font(AppTypography.body(15, weight: .semibold))
        .foregroundStyle(AppPalette.espresso)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(AppBackground())
    .onAppear {
      isPresentingSafari = true
    }
    .sheet(isPresented: $isPresentingSafari, onDismiss: {
      dismiss()
    }) {
      SafariRoutePreview(url: url)
        .ignoresSafeArea()
    }
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
