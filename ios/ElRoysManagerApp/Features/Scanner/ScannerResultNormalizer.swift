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
