import AVFoundation
import SwiftUI

struct BarcodeScannerSheet: View {
  let onFound: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var scannedCode = ""

  var body: some View {
    NavigationStack {
      VStack(spacing: 18) {
        BarcodeScannerCaptureView { code in
          scannedCode = code
        }
        .frame(height: 320)
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))

        TextField("Manual UPC fallback", text: $scannedCode)
          .keyboardType(.numberPad)
          .textFieldStyle(.roundedBorder)

        Button("Use This Barcode") {
          onFound(scannedCode)
          dismiss()
        }
        .buttonStyle(PrimaryGlassButtonStyle())
        .disabled(scannedCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
      .padding(24)
      .navigationTitle("Scan Barcode")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
      }
    }
  }
}

private struct BarcodeScannerCaptureView: UIViewControllerRepresentable {
  let onFound: (String) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onFound: onFound)
  }

  func makeUIViewController(context: Context) -> ScannerViewController {
    let controller = ScannerViewController()
    controller.delegate = context.coordinator
    return controller
  }

  func updateUIViewController(_ uiViewController: ScannerViewController, context: Context) {}

  final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
    private let onFound: (String) -> Void
    private var didReport = false

    init(onFound: @escaping (String) -> Void) {
      self.onFound = onFound
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
      guard !didReport,
            let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
            let value = object.stringValue else { return }
      didReport = true
      onFound(value)
    }
  }
}

private final class ScannerViewController: UIViewController {
  var delegate: AVCaptureMetadataOutputObjectsDelegate?
  private let session = AVCaptureSession()
  private var previewLayer: AVCaptureVideoPreviewLayer?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    configureSession()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    if !session.isRunning {
      session.startRunning()
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    if session.isRunning {
      session.stopRunning()
    }
  }

  private func configureSession() {
    guard let videoDevice = AVCaptureDevice.default(for: .video),
          let input = try? AVCaptureDeviceInput(device: videoDevice),
          session.canAddInput(input) else {
      return
    }

    session.addInput(input)

    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else { return }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(delegate, queue: DispatchQueue.main)
    output.metadataObjectTypes = [.ean8, .ean13, .upce, .code128]

    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    layer.frame = view.bounds
    view.layer.addSublayer(layer)
    previewLayer = layer
  }
}
