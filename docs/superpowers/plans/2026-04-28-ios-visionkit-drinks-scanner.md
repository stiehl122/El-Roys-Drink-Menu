# iOS VisionKit Drinks Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native iOS camera workflow where barcode scans auto-run product lookup and drinks labels can be captured into an Apple-native Live Text selection screen before applying selected text into an add-item draft.

**Architecture:** Keep the existing barcode scanner and `/api/manager` product lookup path, but split scanner behavior into pure normalization helpers, existing barcode capture, and a new still-image label capture flow. Drinks label capture uses AVFoundation to take a photo, VisionKit `ImageAnalyzer` to analyze text, and `ImageAnalysisInteraction` to let staff swipe-select text on the captured image. The item editor applies scanner patches only to the local draft; saving and notification behavior remain unchanged.

**Tech Stack:** SwiftUI, VisionKit (`ImageAnalyzer`, `ImageAnalysisInteraction`), AVFoundation (`AVCaptureSession`, `AVCapturePhotoOutput`), XCTest, `xcodebuild`, Ruby Xcode project generation.

---

## Update Notes From The Old Plan

- The item editor owns lookup through `MenuEditorSession.lookupBarcode(_:)`, not `model.lookupBarcode(_:)`.
- Project generation currently writes both `ios/ElRoysManagerApp/Info.plist` and build settings, so the camera usage copy must change in both generated places.
- `ruby ios/scripts/generate_project.rb` exits quietly in this repo; do not expect a printed "Generated ..." line.
- Commits should happen after each task is green, not after failing-test-only checkpoints.
- The implementation should keep the current zero-dependency iOS project generator and plain Swift source layout.

## File Map

- Create: `ios/ElRoysManagerApp/Features/Scanner/ScannerModels.swift`
  - Pure scanner-domain types for text-selection actions, selected text, draft patches, and drinks-only label policy.
- Create: `ios/ElRoysManagerApp/Features/Scanner/ScannerResultNormalizer.swift`
  - Pure normalization helpers for barcode payloads, selected OCR text, text apply actions, and product lookup results.
- Create: `ios/ElRoysManagerApp/Features/Scanner/LabelTextCaptureSheet.swift`
  - SwiftUI sheet backed by AVFoundation still-image capture for drinks labels.
- Create: `ios/ElRoysManagerApp/Features/Scanner/ImageTextSelectionSheet.swift`
  - Captured-image review screen using `ImageAnalyzer` and `ImageAnalysisInteraction` for Apple-native text selection.
- Modify: `ios/ElRoysManagerApp/Features/Menu/MenuViews.swift`
  - Replace one scanner state with separate barcode and drinks-label state, auto-run lookup for scanned barcodes, and apply selected text through a confirmation dialog.
- Modify: `ios/scripts/generate_project.rb`
  - Update `NSCameraUsageDescription` in both the generated plist template and build setting.
- Generated/modify after project generation: `ios/ElRoysManagerApp/Info.plist`
  - Generated camera usage copy should match the new drinks barcode and label capture wording.
- Generated/modify after project generation: `ios/ElRoysManagerApp.xcodeproj`
  - Include new app and test sources.
- Create: `ios/ElRoysManagerAppTests/ScannerResultNormalizerTests.swift`
  - Unit tests for pure scanner normalization and policy.
- Create: `ios/ElRoysManagerAppTests/LabelTextScannerSourceTests.swift`
  - Source-contract tests for capture, Live Text selection, and camera usage copy.
- Create: `ios/ElRoysManagerAppTests/ItemEditorScannerSourceTests.swift`
  - Source-contract tests for item-editor scanner integration and docs parity copy.
- Modify: `docs/FEATURES.md`
  - Update the barcode/product-lookup row to mention iOS drinks-only captured-image label selection.

## Locked Decisions

- Barcode scans auto-run existing product lookup after filling the UPC field.
- Drinks label text uses Apple-native swipe selection on a captured still image in this version.
- Label text remains drinks-only in V1. Food menus keep barcode scanning and manual lookup only.
- Still-image OCR fallback outside the in-app capture flow is deferred.
- The add-item sheet keeps manual UPC entry and manual lookup as fallbacks.
- Product lookup continues to replace `Name` and only fill `Description` when the draft description is empty.
- Scanner actions mutate only the local add-item draft. They do not save, publish, send notifications, or update public timestamps.

## Task 1: Add Pure Scanner Domain Normalization

**Files:**
- Create: `ios/ElRoysManagerAppTests/ScannerResultNormalizerTests.swift`
- Create: `ios/ElRoysManagerApp/Features/Scanner/ScannerModels.swift`
- Create: `ios/ElRoysManagerApp/Features/Scanner/ScannerResultNormalizer.swift`
- Modify/generated: `ios/ElRoysManagerApp.xcodeproj`
- Modify/generated: `ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme`

- [ ] **Step 1: Create failing scanner-domain tests**

Create `ios/ElRoysManagerAppTests/ScannerResultNormalizerTests.swift` with this exact content:

```swift
import XCTest
@testable import ElRoysManagerApp

final class ScannerResultNormalizerTests: XCTestCase {
  func testBarcodeSelectionCreatesAutoLookupPatch() {
    let patch = ScannerResultNormalizer.barcodeSelection(payload: "012345678905")

    XCTAssertEqual(patch.barcode, "012345678905")
    XCTAssertTrue(patch.shouldAutoLookupBarcode)
    XCTAssertNil(patch.name)
    XCTAssertNil(patch.description)
  }

  func testBlankBarcodeSelectionDoesNotAutoLookup() {
    let patch = ScannerResultNormalizer.barcodeSelection(payload: "   \n")

    XCTAssertNil(patch.barcode)
    XCTAssertFalse(patch.shouldAutoLookupBarcode)
  }

  func testSelectedTextSelectionNormalizesWhitespaceAndBlankLines() {
    let selection = ScannerResultNormalizer.selectedTextSelection(
      "  Bell's Two Hearted  \n\nAmerican IPA\n 7.0% ABV "
    )

    XCTAssertEqual(selection?.text, "Bell's Two Hearted\nAmerican IPA\n7.0% ABV")
    XCTAssertEqual(selection?.lines, ["Bell's Two Hearted", "American IPA", "7.0% ABV"])
  }

  func testBlankSelectedTextReturnsNil() {
    XCTAssertNil(ScannerResultNormalizer.selectedTextSelection(" \n \n "))
  }

  func testUseAsNameUsesSelectedTextFirstLine() {
    let selection = ScannerTextSelection(text: "Bell's Two Hearted\nAmerican IPA")

    let patch = ScannerResultNormalizer.textSelection(
      selection,
      action: .useAsName,
      existingDescription: ""
    )

    XCTAssertEqual(patch.name, "Bell's Two Hearted")
    XCTAssertNil(patch.description)
  }

  func testAppendDescriptionKeepsExistingDescription() {
    let selection = ScannerTextSelection(text: "American IPA\n7.0% ABV")

    let patch = ScannerResultNormalizer.textSelection(
      selection,
      action: .appendDescription,
      existingDescription: "Seasonal tap"
    )

    XCTAssertEqual(patch.description, "Seasonal tap\nAmerican IPA\n7.0% ABV")
  }

  func testUseBothUsesFirstLineAsNameAndRestAsDescription() {
    let selection = ScannerTextSelection(text: "Bell's Two Hearted\nAmerican IPA\n7.0% ABV")

    let patch = ScannerResultNormalizer.textSelection(
      selection,
      action: .useBoth,
      existingDescription: ""
    )

    XCTAssertEqual(patch.name, "Bell's Two Hearted")
    XCTAssertEqual(patch.description, "American IPA\n7.0% ABV")
  }

  func testUseBothWithOneLineDoesNotClearExistingDescription() {
    let selection = ScannerTextSelection(text: "Bell's Two Hearted")

    let patch = ScannerResultNormalizer.textSelection(
      selection,
      action: .useBoth,
      existingDescription: "Seasonal tap"
    )

    XCTAssertEqual(patch.name, "Bell's Two Hearted")
    XCTAssertNil(patch.description)
  }

  func testProductLookupPatchPreservesTypedDescription() {
    let result = ProductLookupResult(
      barcode: "012345678905",
      name: "Two Hearted",
      description: "American IPA"
    )

    let patch = ScannerResultNormalizer.productLookupPatch(
      result: result,
      existingDescription: "Seasonal tap"
    )

    XCTAssertEqual(patch.name, "Two Hearted")
    XCTAssertNil(patch.description)
  }

  func testProductLookupPatchFillsDescriptionWhenEmpty() {
    let result = ProductLookupResult(
      barcode: "012345678905",
      name: "Two Hearted",
      description: "American IPA"
    )

    let patch = ScannerResultNormalizer.productLookupPatch(
      result: result,
      existingDescription: ""
    )

    XCTAssertEqual(patch.description, "American IPA")
  }

  func testDrinksSupportLabelTextButFoodDoesNot() {
    XCTAssertTrue(MenuCameraFeaturePolicy.supportsLabelText(isFoodMenu: false))
    XCTAssertFalse(MenuCameraFeaturePolicy.supportsLabelText(isFoodMenu: true))
  }
}
```

- [ ] **Step 2: Regenerate the Xcode project so the new test file is included**

Run:

```bash
ruby ios/scripts/generate_project.rb
```

Expected: command exits `0` and updates `ios/ElRoysManagerApp.xcodeproj` with the new test source.

- [ ] **Step 3: Run the focused tests and verify the contract fails**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/ScannerResultNormalizerTests
```

Expected: build fails because the scanner domain types do not exist yet. The output should include unresolved symbols such as:

```text
cannot find 'ScannerResultNormalizer' in scope
cannot find type 'ScannerTextSelection' in scope
cannot find 'MenuCameraFeaturePolicy' in scope
```

- [ ] **Step 4: Create the scanner model types**

Create `ios/ElRoysManagerApp/Features/Scanner/ScannerModels.swift` with this exact content:

```swift
import Foundation

enum TextScanApplyAction: String, CaseIterable, Equatable, Identifiable {
  case useAsName = "Use as Name"
  case appendDescription = "Append to Description"
  case useBoth = "Use Both"

  var id: String { rawValue }
}

struct ScannerTextSelection: Equatable {
  var text: String

  var lines: [String] {
    text
      .split(whereSeparator: \.isNewline)
      .map(String.init)
  }

  var suggestedName: String {
    lines.first ?? ""
  }

  var suggestedDescription: String {
    Array(lines.dropFirst()).joined(separator: "\n")
  }
}

struct ScannerDraftPatch: Equatable {
  var barcode: String?
  var name: String?
  var description: String?
  var shouldAutoLookupBarcode: Bool

  init(
    barcode: String? = nil,
    name: String? = nil,
    description: String? = nil,
    shouldAutoLookupBarcode: Bool = false
  ) {
    self.barcode = barcode
    self.name = name
    self.description = description
    self.shouldAutoLookupBarcode = shouldAutoLookupBarcode
  }
}

enum MenuCameraFeaturePolicy {
  static func supportsLabelText(isFoodMenu: Bool) -> Bool {
    !isFoodMenu
  }
}
```

- [ ] **Step 5: Create the scanner normalization helpers**

Create `ios/ElRoysManagerApp/Features/Scanner/ScannerResultNormalizer.swift` with this exact content:

```swift
import Foundation

enum ScannerResultNormalizer {
  static func barcodeSelection(payload: String) -> ScannerDraftPatch {
    let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
    return ScannerDraftPatch(
      barcode: trimmed.isEmpty ? nil : trimmed,
      shouldAutoLookupBarcode: !trimmed.isEmpty
    )
  }

  static func selectedTextSelection(_ rawText: String) -> ScannerTextSelection? {
    let lines = rawText
      .components(separatedBy: .newlines)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }

    guard !lines.isEmpty else { return nil }
    return ScannerTextSelection(text: lines.joined(separator: "\n"))
  }

  static func textSelection(
    _ selection: ScannerTextSelection,
    action: TextScanApplyAction,
    existingDescription: String
  ) -> ScannerDraftPatch {
    switch action {
    case .useAsName:
      return ScannerDraftPatch(name: selection.suggestedName)
    case .appendDescription:
      let existing = existingDescription.trimmingCharacters(in: .whitespacesAndNewlines)
      let next = selection.text
      let description = existing.isEmpty ? next : "\(existing)\n\(next)"
      return ScannerDraftPatch(description: description)
    case .useBoth:
      let description = selection.suggestedDescription.isEmpty ? nil : selection.suggestedDescription
      return ScannerDraftPatch(
        name: selection.suggestedName,
        description: description
      )
    }
  }

  static func productLookupPatch(
    result: ProductLookupResult,
    existingDescription: String
  ) -> ScannerDraftPatch {
    let existing = existingDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    return ScannerDraftPatch(
      name: result.name,
      description: existing.isEmpty ? result.description : nil
    )
  }
}
```

- [ ] **Step 6: Regenerate the Xcode project**

Run:

```bash
ruby ios/scripts/generate_project.rb
```

Expected: command exits `0` and adds `ScannerModels.swift` and `ScannerResultNormalizer.swift` to the app target.

- [ ] **Step 7: Run the domain tests and verify they pass**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/ScannerResultNormalizerTests
```

Expected:

```text
Test Suite 'ScannerResultNormalizerTests' passed
Executed 11 tests, with 0 failures
```

- [ ] **Step 8: Commit the scanner domain layer**

Run:

```bash
git add ios/ElRoysManagerApp/Features/Scanner/ScannerModels.swift ios/ElRoysManagerApp/Features/Scanner/ScannerResultNormalizer.swift ios/ElRoysManagerAppTests/ScannerResultNormalizerTests.swift ios/ElRoysManagerApp.xcodeproj ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme
git commit -m "feat: add scanner normalization layer"
```

Expected: commit succeeds after the focused tests are green.

## Task 2: Add Drinks Label Capture And Live Text Selection

**Files:**
- Create: `ios/ElRoysManagerAppTests/LabelTextScannerSourceTests.swift`
- Create: `ios/ElRoysManagerApp/Features/Scanner/LabelTextCaptureSheet.swift`
- Create: `ios/ElRoysManagerApp/Features/Scanner/ImageTextSelectionSheet.swift`
- Modify: `ios/scripts/generate_project.rb`
- Modify/generated: `ios/ElRoysManagerApp/Info.plist`
- Modify/generated: `ios/ElRoysManagerApp.xcodeproj`
- Modify/generated: `ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme`

- [ ] **Step 1: Create failing label-capture source-contract tests**

Create `ios/ElRoysManagerAppTests/LabelTextScannerSourceTests.swift` with this exact content:

```swift
import XCTest

final class LabelTextScannerSourceTests: XCTestCase {
  func testLabelTextCaptureSheetDefinesStillImageCaptureFlow() throws {
    let source = try String(contentsOf: labelCaptureSourceURL(), encoding: .utf8)

    XCTAssertTrue(source.contains("struct LabelTextCaptureSheet"))
    XCTAssertTrue(source.contains("AVCaptureSession"))
    XCTAssertTrue(source.contains("AVCapturePhotoOutput"))
    XCTAssertTrue(source.contains("Button(\"Capture Label\")"))
    XCTAssertTrue(source.contains("ImageTextSelectionSheet("))
    XCTAssertTrue(source.contains("Frame the drink label"))
  }

  func testImageTextSelectionSheetUsesImageAnalysisInteraction() throws {
    let source = try String(contentsOf: imageSelectionSourceURL(), encoding: .utf8)

    XCTAssertTrue(source.contains("struct ImageTextSelectionSheet"))
    XCTAssertTrue(source.contains("ImageAnalyzer.isSupported"))
    XCTAssertTrue(source.contains("ImageAnalyzer"))
    XCTAssertTrue(source.contains("ImageAnalysisInteraction"))
    XCTAssertTrue(source.contains("textSelectionDidChange"))
    XCTAssertTrue(source.contains("selectedText"))
    XCTAssertTrue(source.contains("Button(\"Use Selected Text\")"))
    XCTAssertTrue(source.contains("Swipe over the captured image to select text."))
  }

  func testProjectGeneratorCameraUsageMentionsDrinkLabelText() throws {
    let source = try String(contentsOf: projectGeneratorSourceURL(), encoding: .utf8)
    let copy = "Scan drink item barcodes and capture drink label text to prefill add-item fields."

    XCTAssertTrue(source.contains("<string>\(copy)</string>"))
    XCTAssertTrue(source.contains("settings['INFOPLIST_KEY_NSCameraUsageDescription'] = '\(copy)'"))
  }
}

private func labelCaptureSourceURL(filePath: StaticString = #filePath) -> URL {
  URL(fileURLWithPath: "\(filePath)")
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("ElRoysManagerApp/Features/Scanner/LabelTextCaptureSheet.swift")
}

private func imageSelectionSourceURL(filePath: StaticString = #filePath) -> URL {
  URL(fileURLWithPath: "\(filePath)")
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("ElRoysManagerApp/Features/Scanner/ImageTextSelectionSheet.swift")
}

private func projectGeneratorSourceURL(filePath: StaticString = #filePath) -> URL {
  URL(fileURLWithPath: "\(filePath)")
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("ios/scripts/generate_project.rb")
}
```

- [ ] **Step 2: Regenerate the Xcode project so the new test file is included**

Run:

```bash
ruby ios/scripts/generate_project.rb
```

Expected: command exits `0` and includes `LabelTextScannerSourceTests.swift` in the test target.

- [ ] **Step 3: Run the source tests and verify the capture contract fails**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/LabelTextScannerSourceTests
```

Expected: tests fail because the capture and image-selection files do not exist and the camera usage copy is still barcode-only.

- [ ] **Step 4: Create the captured-image Live Text selection screen**

Create `ios/ElRoysManagerApp/Features/Scanner/ImageTextSelectionSheet.swift` with this exact content:

```swift
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
    Task {
      await context.coordinator.analyze(image)
    }

    return imageView
  }

  func updateUIView(_ uiView: UIImageView, context: Context) {}

  @MainActor
  final class Coordinator: NSObject, ImageAnalysisInteractionDelegate {
    private let analyzer = ImageAnalyzer()
    private let onSelectedTextChange: (String) -> Void
    private let onAnalysisMessageChange: (String?) -> Void
    weak var interaction: ImageAnalysisInteraction?

    init(
      onSelectedTextChange: @escaping (String) -> Void,
      onAnalysisMessageChange: @escaping (String?) -> Void
    ) {
      self.onSelectedTextChange = onSelectedTextChange
      self.onAnalysisMessageChange = onAnalysisMessageChange
    }

    func analyze(_ image: UIImage) async {
      let configuration = ImageAnalyzer.Configuration([.text])
      do {
        let analysis = try await analyzer.analyze(image, configuration: configuration)
        interaction?.analysis = analysis
        onAnalysisMessageChange(nil)
      } catch {
        onSelectedTextChange("")
        onAnalysisMessageChange("Live Text could not read this image. Capture the label again with clearer lighting.")
      }
    }

    func textSelectionDidChange(_ interaction: ImageAnalysisInteraction) {
      onSelectedTextChange(interaction.selectedText)
    }
  }
}
```

- [ ] **Step 5: Create the drinks label capture sheet**

Create `ios/ElRoysManagerApp/Features/Scanner/LabelTextCaptureSheet.swift` with this exact content:

```swift
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
```

- [ ] **Step 6: Update generated camera usage copy in the project generator**

In `ios/scripts/generate_project.rb`, replace the `NSCameraUsageDescription` string inside `INFO_PLIST_CONTENT`:

```xml
<string>Scan drink and food item barcodes to prefill add-item fields.</string>
```

with:

```xml
<string>Scan drink item barcodes and capture drink label text to prefill add-item fields.</string>
```

In the same file, replace:

```ruby
settings['INFOPLIST_KEY_NSCameraUsageDescription'] = 'Scan drink and food item barcodes to prefill add-item fields.'
```

with:

```ruby
settings['INFOPLIST_KEY_NSCameraUsageDescription'] = 'Scan drink item barcodes and capture drink label text to prefill add-item fields.'
```

- [ ] **Step 7: Regenerate the Xcode project and generated plist**

Run:

```bash
ruby ios/scripts/generate_project.rb
```

Expected: command exits `0`, adds the new scanner source files to the app target, and updates `ios/ElRoysManagerApp/Info.plist` with the new camera usage copy.

- [ ] **Step 8: Run the capture-selection source tests**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/LabelTextScannerSourceTests
```

Expected:

```text
Test Suite 'LabelTextScannerSourceTests' passed
Executed 3 tests, with 0 failures
```

- [ ] **Step 9: Build the app target to catch VisionKit and AVFoundation compile errors**

Run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'generic/platform=iOS Simulator' build
```

Expected:

```text
BUILD SUCCEEDED
```

- [ ] **Step 10: Commit the label capture and Live Text selection flow**

Run:

```bash
git add ios/ElRoysManagerApp/Features/Scanner/LabelTextCaptureSheet.swift ios/ElRoysManagerApp/Features/Scanner/ImageTextSelectionSheet.swift ios/ElRoysManagerAppTests/LabelTextScannerSourceTests.swift ios/scripts/generate_project.rb ios/ElRoysManagerApp/Info.plist ios/ElRoysManagerApp.xcodeproj ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme
git commit -m "feat: add drinks label capture and selection"
```

Expected: commit succeeds after the source tests and build are green.

## Task 3: Integrate Scanner Flows Into The Item Editor

**Files:**
- Create: `ios/ElRoysManagerAppTests/ItemEditorScannerSourceTests.swift`
- Modify: `ios/ElRoysManagerApp/Features/Menu/MenuViews.swift`
- Modify: `docs/FEATURES.md`
- Modify/generated: `ios/ElRoysManagerApp.xcodeproj`
- Modify/generated: `ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme`

- [ ] **Step 1: Create failing item-editor integration source-contract tests**

Create `ios/ElRoysManagerAppTests/ItemEditorScannerSourceTests.swift` with this exact content:

```swift
import XCTest

final class ItemEditorScannerSourceTests: XCTestCase {
  func testItemEditorShowsSeparateBarcodeAndLabelActions() throws {
    let source = try String(contentsOf: menuViewsSourceURL(), encoding: .utf8)

    XCTAssertTrue(source.contains("Section(\"Scan + Lookup\")"))
    XCTAssertTrue(source.contains("Button(\"Scan Barcode\")"))
    XCTAssertTrue(source.contains("Button(\"Scan Label Text\")"))
    XCTAssertTrue(source.contains("showingBarcodeScanner"))
    XCTAssertTrue(source.contains("showingLabelTextScanner"))
    XCTAssertTrue(source.contains("LabelTextCaptureSheet("))
    XCTAssertTrue(source.contains("MenuCameraFeaturePolicy.supportsLabelText(isFoodMenu: session.menu.isFoodMenu)"))
  }

  func testItemEditorAutoLooksUpScannedBarcodes() throws {
    let source = try String(contentsOf: menuViewsSourceURL(), encoding: .utf8)

    XCTAssertTrue(source.contains("private func applyScannedBarcode(_ barcode: String)"))
    XCTAssertTrue(source.contains("ScannerResultNormalizer.barcodeSelection(payload: barcode)"))
    XCTAssertTrue(source.contains("try await session.lookupBarcode(normalizedBarcode)"))
    XCTAssertTrue(source.contains("ScannerResultNormalizer.productLookupPatch"))
    XCTAssertTrue(source.contains("scannerLookupInFlight"))
  }

  func testItemEditorUsesConfirmationDialogForSelectedText() throws {
    let source = try String(contentsOf: menuViewsSourceURL(), encoding: .utf8)

    XCTAssertTrue(source.contains("confirmationDialog(\"Use Scanned Text\""))
    XCTAssertTrue(source.contains("TextScanApplyAction.useAsName"))
    XCTAssertTrue(source.contains("TextScanApplyAction.appendDescription"))
    XCTAssertTrue(source.contains("TextScanApplyAction.useBoth"))
    XCTAssertTrue(source.contains("ScannerResultNormalizer.textSelection"))
  }

  func testFeatureCatalogDocumentsDrinksOnlyLabelSelection() throws {
    let source = try String(contentsOf: featuresSourceURL(), encoding: .utf8)

    XCTAssertTrue(source.contains("Barcode scan and product lookup"))
    XCTAssertTrue(source.contains("iOS additionally supports drinks-only captured-image label selection"))
    XCTAssertTrue(source.contains("Apple-native swipe text selection"))
  }
}

private func menuViewsSourceURL(filePath: StaticString = #filePath) -> URL {
  URL(fileURLWithPath: "\(filePath)")
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("ElRoysManagerApp/Features/Menu/MenuViews.swift")
}

private func featuresSourceURL(filePath: StaticString = #filePath) -> URL {
  URL(fileURLWithPath: "\(filePath)")
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .appendingPathComponent("docs/FEATURES.md")
}
```

- [ ] **Step 2: Regenerate the Xcode project so the new test file is included**

Run:

```bash
ruby ios/scripts/generate_project.rb
```

Expected: command exits `0` and includes `ItemEditorScannerSourceTests.swift` in the test target.

- [ ] **Step 3: Run the source tests and verify the integration contract fails**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/ItemEditorScannerSourceTests
```

Expected: tests fail because the item editor still has a single barcode scanner path and the feature catalog row has not been updated.

- [ ] **Step 4: Replace the current scanner state in `ItemEditorSheet`**

In `ios/ElRoysManagerApp/Features/Menu/MenuViews.swift`, inside `private struct ItemEditorSheet`, replace:

```swift
  @State private var showingScanner = false
```

with:

```swift
  @State private var showingBarcodeScanner = false
  @State private var showingLabelTextScanner = false
  @State private var pendingTextSelection: ScannerTextSelection?
  @State private var showingTextApplyDialog = false
  @State private var scannerLookupInFlight = false

  private var supportsLabelText: Bool {
    MenuCameraFeaturePolicy.supportsLabelText(isFoodMenu: session.menu.isFoodMenu)
  }
```

- [ ] **Step 5: Replace the barcode section in `ItemEditorSheet.body`**

In the same file, replace the current `Section("Barcode + Lookup")` block:

```swift
        Section("Barcode + Lookup") {
          TextField("UPC", text: $draft.barcode)
            .keyboardType(.numberPad)
          Button("Scan Barcode") {
            showingScanner = true
          }
          Button("Lookup Product") {
            Task {
              do {
                let result = try await session.lookupBarcode(draft.barcode)
                draft.name = result.name
                if draft.description.isEmpty {
                  draft.description = result.description
                }
              } catch {
                session.notice = AppNotice(tone: .warning, title: "Lookup Failed", message: error.localizedDescription)
              }
            }
          }
        }
```

with:

```swift
        Section("Scan + Lookup") {
          TextField("UPC", text: $draft.barcode)
            .keyboardType(.numberPad)

          Button("Scan Barcode") {
            showingBarcodeScanner = true
          }

          if supportsLabelText {
            Button("Scan Label Text") {
              showingLabelTextScanner = true
            }

            Text("Capture the label, then swipe-select the exact text you want to apply.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }

          if scannerLookupInFlight {
            ProgressView("Looking up product...")
          }

          Button("Lookup Product") {
            Task { @MainActor in
              await lookupBarcode(draft.barcode)
            }
          }
        }
```

- [ ] **Step 6: Replace the scanner sheet wiring**

In the same file, replace the current sheet modifier:

```swift
    .sheet(isPresented: $showingScanner) {
      BarcodeScannerSheet { code in
        draft.barcode = code
      }
    }
```

with:

```swift
    .sheet(isPresented: $showingBarcodeScanner) {
      BarcodeScannerSheet { code in
        applyScannedBarcode(code)
      }
    }
    .sheet(isPresented: $showingLabelTextScanner) {
      LabelTextCaptureSheet { selection in
        pendingTextSelection = selection
        showingTextApplyDialog = true
      }
    }
    .confirmationDialog(
      "Use Scanned Text",
      isPresented: $showingTextApplyDialog,
      presenting: pendingTextSelection
    ) { selection in
      Button(TextScanApplyAction.useAsName.rawValue) {
        applyTextSelection(.useAsName, selection: selection)
      }
      Button(TextScanApplyAction.appendDescription.rawValue) {
        applyTextSelection(.appendDescription, selection: selection)
      }
      Button(TextScanApplyAction.useBoth.rawValue) {
        applyTextSelection(.useBoth, selection: selection)
      }
      Button("Cancel", role: .cancel) {
        pendingTextSelection = nil
      }
    } message: { selection in
      Text(selection.text)
    }
```

- [ ] **Step 7: Add scanner helper methods to `ItemEditorSheet`**

In the same file, add these helper methods below `moveToOffMenu()` and above `makeItem(categoryKey:validateDuplicateName:)`:

```swift
  private func applyScannedBarcode(_ barcode: String) {
    let patch = ScannerResultNormalizer.barcodeSelection(payload: barcode)
    applyPatch(patch)

    guard patch.shouldAutoLookupBarcode, let normalizedBarcode = patch.barcode else { return }

    Task { @MainActor in
      await lookupBarcode(normalizedBarcode)
    }
  }

  @MainActor
  private func lookupBarcode(_ barcode: String) async {
    let normalizedBarcode = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedBarcode.isEmpty else {
      session.notice = AppNotice(
        tone: .warning,
        title: "Barcode Required",
        message: "Enter or scan a UPC before looking up a product."
      )
      return
    }

    scannerLookupInFlight = true
    defer { scannerLookupInFlight = false }

    do {
      let result = try await session.lookupBarcode(normalizedBarcode)
      let lookupPatch = ScannerResultNormalizer.productLookupPatch(
        result: result,
        existingDescription: draft.description
      )
      applyPatch(lookupPatch)
    } catch {
      session.notice = AppNotice(
        tone: .warning,
        title: "Lookup Failed",
        message: error.localizedDescription
      )
    }
  }

  private func applyTextSelection(
    _ action: TextScanApplyAction,
    selection: ScannerTextSelection
  ) {
    let patch = ScannerResultNormalizer.textSelection(
      selection,
      action: action,
      existingDescription: draft.description
    )
    applyPatch(patch)
    pendingTextSelection = nil
  }

  private func applyPatch(_ patch: ScannerDraftPatch) {
    if let barcode = patch.barcode {
      draft.barcode = barcode
    }
    if let name = patch.name {
      draft.name = name
    }
    if let description = patch.description {
      draft.description = description
    }
  }
```

- [ ] **Step 8: Update the iOS feature catalog row**

In `docs/FEATURES.md`, replace:

```markdown
| Barcode scan and product lookup | Full | Full | Staff editor clients | Both support barcode-driven item entry plus product lookup. |
```

with:

```markdown
| Barcode scan and product lookup | Full | Full | Staff editor clients | Both support barcode-driven item entry plus product lookup; iOS additionally supports drinks-only captured-image label selection with Apple-native swipe text selection before prefilling local add-item drafts. |
```

- [ ] **Step 9: Regenerate the project**

Run:

```bash
ruby ios/scripts/generate_project.rb
```

Expected: command exits `0` and keeps the new app/test sources in the regenerated project.

- [ ] **Step 10: Run the focused scanner test suite**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/ScannerResultNormalizerTests -only-testing:ElRoysManagerAppTests/LabelTextScannerSourceTests -only-testing:ElRoysManagerAppTests/ItemEditorScannerSourceTests
```

Expected:

```text
Test Suite 'ScannerResultNormalizerTests' passed
Test Suite 'LabelTextScannerSourceTests' passed
Test Suite 'ItemEditorScannerSourceTests' passed
```

- [ ] **Step 11: Build the app target**

Run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'generic/platform=iOS Simulator' build
```

Expected:

```text
BUILD SUCCEEDED
```

- [ ] **Step 12: Commit the item-editor integration and docs**

Run:

```bash
git add ios/ElRoysManagerApp/Features/Menu/MenuViews.swift docs/FEATURES.md ios/ElRoysManagerAppTests/ItemEditorScannerSourceTests.swift ios/ElRoysManagerApp.xcodeproj ios/ElRoysManagerApp.xcodeproj/xcshareddata/xcschemes/ElRoysManagerApp.xcscheme
git commit -m "feat: integrate drinks label selection into item editor"
```

Expected: commit succeeds after the focused scanner suite and app build are green.

## Manual QA Checklist

- [ ] Open a drinks menu add-item sheet and verify `Scan Barcode` and `Scan Label Text` both appear.
- [ ] Scan a real barcode and verify the UPC fills immediately, lookup runs automatically, `Name` updates, and `Description` only fills when blank.
- [ ] Open `Scan Label Text`, capture a bottle, can, or keg tag, and verify the captured-image screen appears.
- [ ] Swipe-select a subset of text on the captured image and verify `Use Selected Text` enables only when text is selected.
- [ ] Choose `Use as Name`, `Append to Description`, and `Use Both` in separate passes and verify draft fields update correctly.
- [ ] Open a food menu add-item sheet and verify `Scan Label Text` is not shown.
- [ ] Verify manual UPC entry plus `Lookup Product` still works.
- [ ] Verify scanner actions only edit the local draft and do not save or send by themselves.
- [ ] Verify saving the draft still uses the existing `Save` review flow.

## Self-Review

- Spec coverage: barcode auto-lookup is covered by Task 1 normalization and Task 3 item-editor integration; Apple-native swipe selection is covered by Task 2 through `ImageAnalysisInteraction`; drinks-only label text is covered by Task 1 policy and Task 3 conditional UI; manual UPC and manual lookup remain in Task 3; lookup name/description behavior is covered by Task 1 tests.
- Placeholder scan: every code-changing step includes concrete file paths, code blocks, commands, and expected results; no deferred-work markers remain.
- Type consistency: `ScannerTextSelection`, `TextScanApplyAction`, `ScannerDraftPatch`, `MenuCameraFeaturePolicy`, and `ScannerResultNormalizer` are defined in Task 1 and used with the same names in Tasks 2 and 3. Item-editor lookup consistently uses `MenuEditorSession.lookupBarcode(_:)` through the `session` property.
