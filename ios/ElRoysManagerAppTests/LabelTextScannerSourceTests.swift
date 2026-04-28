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
