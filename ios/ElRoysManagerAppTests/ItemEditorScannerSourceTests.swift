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
  try! repositoryRootURL(filePath: filePath)
    .appendingPathComponent("ios")
    .appendingPathComponent("ElRoysManagerApp/Features/Menu/MenuViews.swift")
}

private func featuresSourceURL(filePath: StaticString = #filePath) -> URL {
  try! repositoryRootURL(filePath: filePath)
    .appendingPathComponent("docs/FEATURES.md")
}

private func repositoryRootURL(filePath: StaticString = #filePath) throws -> URL {
  let fileManager = FileManager.default
  var current = URL(fileURLWithPath: "\(filePath)").deletingLastPathComponent()

  while current.path != current.deletingLastPathComponent().path {
    let generator = current.appendingPathComponent("ios/scripts/generate_project.rb")
    let features = current.appendingPathComponent("docs/FEATURES.md")
    if fileManager.fileExists(atPath: generator.path),
       fileManager.fileExists(atPath: features.path) {
      return current
    }
    current.deleteLastPathComponent()
  }

  throw CocoaError(.fileNoSuchFile)
}
