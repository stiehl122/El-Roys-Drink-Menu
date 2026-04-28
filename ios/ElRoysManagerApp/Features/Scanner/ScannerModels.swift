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
