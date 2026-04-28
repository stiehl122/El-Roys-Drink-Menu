import SwiftUI
import UIKit
import VisionKit

struct ImageTextSelectionSheet: View {
  let image: UIImage
  let onUseSelection: (ScannerTextSelection) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var selectedText = ""
  @State private var analysisMessage: String?

  private var normalizedSelection: ScannerTextSelection? {
    ScannerResultNormalizer.selectedTextSelection(selectedText)
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 16) {
        Text("Swipe over the captured image to select text.")
          .font(.subheadline)
          .foregroundStyle(.secondary)

        if ImageAnalyzer.isSupported {
          LiveTextImageView(
            image: image,
            onSelectedTextChange: { selectedText = $0 },
            onAnalysisMessageChange: { analysisMessage = $0 }
          )
          .frame(minHeight: 360)
          .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        } else {
          ContentUnavailableView(
            "Live Text Unavailable",
            systemImage: "text.viewfinder",
            description: Text("This device cannot analyze captured label text.")
          )
          .frame(minHeight: 360)
        }

        if let analysisMessage {
          Text(analysisMessage)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }

        Button("Use Selected Text") {
          guard let selection = normalizedSelection else { return }
          onUseSelection(selection)
          dismiss()
        }
        .buttonStyle(.borderedProminent)
        .disabled(normalizedSelection == nil)
      }
      .padding(20)
      .navigationTitle("Select Label Text")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
    }
  }
}

private struct LiveTextImageView: UIViewRepresentable {
  let image: UIImage
  let onSelectedTextChange: (String) -> Void
  let onAnalysisMessageChange: (String?) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(
      onSelectedTextChange: onSelectedTextChange,
      onAnalysisMessageChange: onAnalysisMessageChange
    )
  }

  func makeUIView(context: Context) -> UIImageView {
    let imageView = UIImageView(image: image)
    imageView.contentMode = .scaleAspectFit
    imageView.isUserInteractionEnabled = true
    imageView.backgroundColor = .black

    let interaction = ImageAnalysisInteraction(context.coordinator)
    interaction.preferredInteractionTypes = .textSelection
    imageView.addInteraction(interaction)

    context.coordinator.interaction = interaction
    context.coordinator.startAnalysis(image)

    return imageView
  }

  func updateUIView(_ uiView: UIImageView, context: Context) {
    guard uiView.image !== image else { return }
    uiView.image = image
    context.coordinator.startAnalysis(image)
  }

  @MainActor
  final class Coordinator: NSObject, ImageAnalysisInteractionDelegate {
    private let analyzer = ImageAnalyzer()
    private let onSelectedTextChange: (String) -> Void
    private let onAnalysisMessageChange: (String?) -> Void
    private var analysisTask: Task<Void, Never>?
    weak var interaction: ImageAnalysisInteraction?

    init(
      onSelectedTextChange: @escaping (String) -> Void,
      onAnalysisMessageChange: @escaping (String?) -> Void
    ) {
      self.onSelectedTextChange = onSelectedTextChange
      self.onAnalysisMessageChange = onAnalysisMessageChange
    }

    deinit {
      analysisTask?.cancel()
    }

    func startAnalysis(_ image: UIImage) {
      analysisTask?.cancel()
      analysisTask = Task { [weak self] in
        await self?.analyze(image)
      }
    }

    func analyze(_ image: UIImage) async {
      let configuration = ImageAnalyzer.Configuration([.text])
      do {
        let analysis = try await analyzer.analyze(image, configuration: configuration)
        guard !Task.isCancelled else { return }
        interaction?.analysis = analysis
        onAnalysisMessageChange(nil)
      } catch {
        guard !Task.isCancelled else { return }
        onSelectedTextChange("")
        onAnalysisMessageChange("Live Text could not read this image. Capture the label again with clearer lighting.")
      }
    }

    func textSelectionDidChange(_ interaction: ImageAnalysisInteraction) {
      onSelectedTextChange(interaction.selectedText)
    }
  }
}
