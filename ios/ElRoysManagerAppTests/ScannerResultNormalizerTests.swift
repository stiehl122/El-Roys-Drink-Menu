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
