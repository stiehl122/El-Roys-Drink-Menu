import AVFoundation
import SwiftUI

struct BarcodeScannerSheet: View {
  let onFound: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var scannedCode = ""

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 20) {
          VStack(alignment: .leading, spacing: 14) {
            AppEyebrow(title: "Barcode capture", tint: AppPalette.cobalt)
            Text("Scan or paste a UPC")
              .font(AppTypography.display(32, weight: .bold))
              .foregroundStyle(AppPalette.espresso)
            Text("Use the live camera feed for speed, then fall back to manual entry when a label is damaged or hard to frame.")
              .font(AppTypography.body(15, weight: .medium))
              .foregroundStyle(AppPalette.espresso.opacity(0.72))
              .fixedSize(horizontal: false, vertical: true)
          }
          .appGlassCard(tint: AppPalette.cobalt, cornerRadius: 36)
          .appEntryReveal()

          ZStack {
            BarcodeScannerCaptureView { code in
              scannedCode = code
            }
            scannerOverlay
          }
          .frame(height: 320)
          .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
          .overlay {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
              .stroke(AppPalette.cobalt.opacity(0.24), lineWidth: 1)
          }
          .appEntryReveal(delay: 0.06)

          VStack(alignment: .leading, spacing: 12) {
            Text("Manual fallback")
              .font(AppTypography.micro(10, weight: .bold))
              .tracking(1.8)
              .foregroundStyle(AppPalette.cobalt)
            TextField("Enter UPC", text: $scannedCode)
              .keyboardType(.numberPad)
              .font(AppTypography.body(16, weight: .medium))
              .padding(.horizontal, 16)
              .padding(.vertical, 16)
              .appFieldChrome(tint: AppPalette.cobalt)
          }
          .appGlassCard(tint: AppPalette.brass, cornerRadius: 30)
          .appEntryReveal(delay: 0.10)

          AppIslandActionButton(
            title: "Use this barcode",
            subtitle: "Insert the captured value into the item editor.",
            systemImage: "arrow.up.right",
            accent: AppPalette.brand,
            isEnabled: !scannedCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            action: {
              onFound(scannedCode)
              dismiss()
            }
          )
          .appEntryReveal(delay: 0.14)
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 24)
      }
      .background {
        AppBackground()
          .ignoresSafeArea()
      }
      .navigationTitle("Scan Barcode")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
      }
    }
  }

  private var scannerOverlay: some View {
    GeometryReader { proxy in
      let size = min(proxy.size.width, proxy.size.height) * 0.58
      let line: CGFloat = 26
      let stroke = AppPalette.ivory.opacity(0.92)
      let frameRect = CGRect(
        x: (proxy.size.width - size) / 2,
        y: (proxy.size.height - size) / 2,
        width: size,
        height: size
      )

      Path { path in
        path.move(to: CGPoint(x: frameRect.minX, y: frameRect.minY + line))
        path.addLine(to: CGPoint(x: frameRect.minX, y: frameRect.minY))
        path.addLine(to: CGPoint(x: frameRect.minX + line, y: frameRect.minY))

        path.move(to: CGPoint(x: frameRect.maxX - line, y: frameRect.minY))
        path.addLine(to: CGPoint(x: frameRect.maxX, y: frameRect.minY))
        path.addLine(to: CGPoint(x: frameRect.maxX, y: frameRect.minY + line))

        path.move(to: CGPoint(x: frameRect.minX, y: frameRect.maxY - line))
        path.addLine(to: CGPoint(x: frameRect.minX, y: frameRect.maxY))
        path.addLine(to: CGPoint(x: frameRect.minX + line, y: frameRect.maxY))

        path.move(to: CGPoint(x: frameRect.maxX - line, y: frameRect.maxY))
        path.addLine(to: CGPoint(x: frameRect.maxX, y: frameRect.maxY))
        path.addLine(to: CGPoint(x: frameRect.maxX, y: frameRect.maxY - line))
      }
      .stroke(stroke, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
    }
    .allowsHitTesting(false)
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
  private let sessionQueue = DispatchQueue(label: "BarcodeScanner.session")
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var hasConfiguredSession = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    layer.frame = view.bounds
    view.layer.addSublayer(layer)
    previewLayer = layer

    sessionQueue.async { [weak self] in
      self?.configureSessionIfNeeded()
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    sessionQueue.async { [weak self] in
      self?.startSessionIfNeeded()
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sessionQueue.async { [weak self] in
      self?.stopSessionIfNeeded()
    }
  }

  private func configureSessionIfNeeded() {
    guard !hasConfiguredSession else { return }
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
    hasConfiguredSession = true
  }

  private func startSessionIfNeeded() {
    configureSessionIfNeeded()
    guard hasConfiguredSession, !session.isRunning else { return }
    session.startRunning()
  }

  private func stopSessionIfNeeded() {
    guard session.isRunning else { return }
    session.stopRunning()
  }
}
