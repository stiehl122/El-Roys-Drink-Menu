import AVFoundation
import SwiftUI
import UIKit

struct LabelTextCaptureSheet: View {
  let onSelection: (ScannerTextSelection) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var captureToken = 0
  @State private var capturedImage: UIImage?

  var body: some View {
    NavigationStack {
      ZStack(alignment: .bottom) {
        LabelTextCameraCaptureView(
          captureToken: captureToken,
          onCapture: { image in
            capturedImage = image
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

          Button("Capture Label") {
            captureToken += 1
          }
          .buttonStyle(.borderedProminent)
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

  func makeUIViewController(context: Context) -> LabelTextCaptureViewController {
    let controller = LabelTextCaptureViewController()
    controller.onCapture = onCapture
    return controller
  }

  func updateUIViewController(_ uiViewController: LabelTextCaptureViewController, context: Context) {
    uiViewController.onCapture = onCapture
    uiViewController.updateCaptureToken(captureToken)
  }
}

final class LabelTextCaptureViewController: UIViewController, AVCapturePhotoCaptureDelegate {
  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "LabelTextCapture.session")
  private let photoOutput = AVCapturePhotoOutput()
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var configured = false
  private var lastCaptureToken = 0

  var onCapture: ((UIImage) -> Void)?

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
    session.beginConfiguration()

    guard
      let device = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input),
      session.canAddOutput(photoOutput)
    else {
      session.commitConfiguration()
      return
    }

    session.addInput(input)
    session.addOutput(photoOutput)
    session.commitConfiguration()
    configured = true
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

    let settings = AVCapturePhotoSettings()
    photoOutput.capturePhoto(with: settings, delegate: self)
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
      return
    }

    DispatchQueue.main.async { [onCapture] in
      onCapture?(image)
    }
  }
}
