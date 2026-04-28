import AVFoundation
import SwiftUI
import UIKit

struct LabelTextCaptureSheet: View {
  let onSelection: (ScannerTextSelection) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var captureToken = 0
  @State private var capturedImage: UIImage?
  @State private var cameraMessage: String?
  @State private var isCameraAvailable = true

  var body: some View {
    NavigationStack {
      ZStack(alignment: .bottom) {
        LabelTextCameraCaptureView(
          captureToken: captureToken,
          onCapture: { image in
            cameraMessage = nil
            capturedImage = image
          },
          onStatusMessageChange: { message in
            cameraMessage = message
          },
          onCameraAvailabilityChange: { isAvailable in
            isCameraAvailable = isAvailable
          }
        )
        .ignoresSafeArea(edges: .bottom)

        VStack(spacing: 12) {
          Text("Frame the drink label, then capture a still image so you can swipe-select exact text.")
            .font(.footnote)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())

          if let cameraMessage {
            Text(cameraMessage)
              .font(.footnote)
              .multilineTextAlignment(.center)
              .padding(.horizontal, 24)
              .padding(.vertical, 10)
              .background(.ultraThinMaterial, in: Capsule())
          }

          Button("Capture Label") {
            captureToken += 1
          }
          .buttonStyle(.borderedProminent)
          .disabled(!isCameraAvailable)
          .padding(.bottom, 24)
        }
      }
      .navigationTitle("Capture Label")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
      }
    }
    .sheet(
      isPresented: Binding(
        get: { capturedImage != nil },
        set: { if !$0 { capturedImage = nil } }
      )
    ) {
      if let capturedImage {
        ImageTextSelectionSheet(image: capturedImage) { selection in
          onSelection(selection)
          dismiss()
        }
      }
    }
  }
}

private struct LabelTextCameraCaptureView: UIViewControllerRepresentable {
  let captureToken: Int
  let onCapture: (UIImage) -> Void
  let onStatusMessageChange: (String?) -> Void
  let onCameraAvailabilityChange: (Bool) -> Void

  func makeUIViewController(context: Context) -> LabelTextCaptureViewController {
    let controller = LabelTextCaptureViewController()
    controller.onCapture = onCapture
    controller.onStatusMessageChange = onStatusMessageChange
    controller.onCameraAvailabilityChange = onCameraAvailabilityChange
    return controller
  }

  func updateUIViewController(_ uiViewController: LabelTextCaptureViewController, context: Context) {
    uiViewController.onCapture = onCapture
    uiViewController.onStatusMessageChange = onStatusMessageChange
    uiViewController.onCameraAvailabilityChange = onCameraAvailabilityChange
    uiViewController.updateCaptureToken(captureToken)
  }
}

private final class LabelTextCaptureViewController: UIViewController, AVCapturePhotoCaptureDelegate {
  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "LabelTextCapture.session")
  private let photoOutput = AVCapturePhotoOutput()
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var configured = false
  private var isRequestingAccess = false
  private var isCapturingPhoto = false
  private var didReportCaptureFailure = false
  private var lastCaptureToken = 0

  var onCapture: ((UIImage) -> Void)?
  var onStatusMessageChange: ((String?) -> Void)?
  var onCameraAvailabilityChange: ((Bool) -> Void)?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    let previewLayer = AVCaptureVideoPreviewLayer(session: session)
    previewLayer.videoGravity = .resizeAspectFill
    previewLayer.frame = view.bounds
    view.layer.addSublayer(previewLayer)
    self.previewLayer = previewLayer

    sessionQueue.async { [weak self] in
      self?.configureSessionIfNeeded()
      self?.startSessionIfNeeded()
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    sessionQueue.async { [weak self] in
      self?.configureSessionIfNeeded()
      self?.startSessionIfNeeded()
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sessionQueue.async { [weak self] in
      self?.stopSessionIfNeeded()
    }
  }

  func updateCaptureToken(_ token: Int) {
    guard token != lastCaptureToken else { return }
    lastCaptureToken = token
    sessionQueue.async { [weak self] in
      self?.capturePhotoIfPossible()
    }
  }

  private func configureSessionIfNeeded() {
    guard !configured else { return }
    guard ensureCameraAccess() else { return }

    session.beginConfiguration()

    guard
      let device = AVCaptureDevice.default(for: .video),
      let input = makeVideoInput(for: device),
      session.canAddInput(input)
    else {
      session.commitConfiguration()
      reportCameraUnavailable("Camera is unavailable. Check camera access and try again.")
      return
    }

    guard session.canAddOutput(photoOutput) else {
      session.commitConfiguration()
      reportCameraUnavailable("Camera capture is unavailable on this device.")
      return
    }

    session.addInput(input)
    session.addOutput(photoOutput)
    session.commitConfiguration()
    configured = true
    reportCameraReady()
  }

  private func startSessionIfNeeded() {
    guard configured, !session.isRunning else { return }
    session.startRunning()
  }

  private func stopSessionIfNeeded() {
    guard session.isRunning else { return }
    session.stopRunning()
  }

  private func capturePhotoIfPossible() {
    configureSessionIfNeeded()
    startSessionIfNeeded()
    guard configured else { return }
    guard !isCapturingPhoto else { return }

    isCapturingPhoto = true
    didReportCaptureFailure = false
    let settings = AVCapturePhotoSettings()
    photoOutput.capturePhoto(with: settings, delegate: self)
  }

  private func ensureCameraAccess() -> Bool {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return true
    case .notDetermined:
      requestCameraAccessIfNeeded()
      return false
    case .denied, .restricted:
      reportCameraUnavailable("Camera access is required to capture drink label text.")
      return false
    @unknown default:
      reportCameraUnavailable("Camera access is unavailable on this device.")
      return false
    }
  }

  private func requestCameraAccessIfNeeded() {
    guard !isRequestingAccess else { return }
    isRequestingAccess = true
    reportCameraUnavailable("Waiting for camera access.")

    AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
      guard let self else { return }
      self.sessionQueue.async {
        self.isRequestingAccess = false
        if granted {
          self.configureSessionIfNeeded()
          self.startSessionIfNeeded()
        } else {
          self.reportCameraUnavailable("Camera access is required to capture drink label text.")
        }
      }
    }
  }

  private func makeVideoInput(for device: AVCaptureDevice) -> AVCaptureDeviceInput? {
    do {
      return try AVCaptureDeviceInput(device: device)
    } catch {
      reportCameraUnavailable("Camera capture could not start. Check camera access and try again.")
      return nil
    }
  }

  private func reportCameraReady() {
    DispatchQueue.main.async { [onStatusMessageChange, onCameraAvailabilityChange] in
      onStatusMessageChange?(nil)
      onCameraAvailabilityChange?(true)
    }
  }

  private func reportCameraUnavailable(_ message: String) {
    DispatchQueue.main.async { [onStatusMessageChange, onCameraAvailabilityChange] in
      onStatusMessageChange?(message)
      onCameraAvailabilityChange?(false)
    }
  }

  private func reportCaptureFailed() {
    DispatchQueue.main.async { [onStatusMessageChange, onCameraAvailabilityChange] in
      onStatusMessageChange?("Label capture failed. Try again with steadier framing and clearer lighting.")
      onCameraAvailabilityChange?(true)
    }
  }

  private func reportCaptureFailedIfNeeded() {
    guard !didReportCaptureFailure else { return }
    didReportCaptureFailure = true
    reportCaptureFailed()
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    guard
      error == nil,
      let data = photo.fileDataRepresentation(),
      let image = UIImage(data: data)
    else {
      sessionQueue.async { [weak self] in
        self?.reportCaptureFailedIfNeeded()
      }
      return
    }

    DispatchQueue.main.async { [onCapture] in
      onCapture?(image)
    }
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if error != nil {
        self.reportCaptureFailedIfNeeded()
      }
      self.isCapturingPhoto = false
    }
  }
}
