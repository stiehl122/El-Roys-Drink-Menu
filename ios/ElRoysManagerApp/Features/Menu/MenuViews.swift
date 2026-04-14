import SwiftUI

struct MenuEditorScreen: View {
  @Bindable var model: AppModel
  let menu: MenuRecord
  @State private var addCategoryName = ""
  @State private var showingAddCategory = false
  @State private var editingDraft = EditableItemDraft()
  @State private var showingItemSheet = false
  @State private var renameTarget: MenuCategoryPayload?
  @State private var renameText = ""

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        header

        if let conflict = model.editorConflictState {
          VStack(alignment: .leading, spacing: 10) {
            StatusBanner(
              tone: .warning,
              title: "Local Draft Needs Reconciliation",
              message: conflict.loadedIntoEditor
                ? "This stale local draft is open for reference, but remote save and publish stay disabled until you discard it."
                : "A device-only draft was saved against older menu revisions. Review or discard it before any remote action."
            )
            HStack {
              Button(conflict.loadedIntoEditor ? "Reload Server Copy" : "Load Local Draft") {
                if conflict.loadedIntoEditor {
                  Task { await model.loadEditor(menuId: menu.id) }
                } else {
                  model.loadPendingLocalDraftIntoEditor()
                }
              }
              .buttonStyle(SecondaryGlassButtonStyle())

              Button("Discard Local Draft") {
                model.discardPendingLocalDraft()
              }
              .buttonStyle(SecondaryGlassButtonStyle())
            }
          }
        }

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        actionBar

        if let preview = model.currentEditorPreview {
          PublishPreviewCard(model: model, preview: preview)
        }

        if let document = model.currentEditorDocument {
          ForEach(document.visibleCategories) { category in
            VStack(alignment: .leading, spacing: 10) {
              HStack {
                VStack(alignment: .leading, spacing: 4) {
                  Text(category.label)
                    .font(.headline)
                  if !category.sub.isEmpty {
                    Text(category.sub)
                      .font(.caption)
                      .foregroundStyle(.secondary)
                  }
                }
                Spacer()
                Menu {
                  Button("Rename") {
                    renameTarget = category
                    renameText = category.label
                  }
                  Button("Delete Category", role: .destructive) {
                    model.deleteCategory(key: category.key)
                  }
                } label: {
                  Image(systemName: "ellipsis.circle")
                }
              }

              ForEach(category.items.filter { $0.onMenu }) { item in
                Button {
                  editingDraft = EditableItemDraft(item: item, categoryKey: category.key, isFoodMenu: menu.isFoodMenu)
                  showingItemSheet = true
                } label: {
                  EditorItemRow(item: item)
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .trailing) {
                  Button(role: .destructive) {
                    model.moveItemToOffMenu(itemID: item.id, from: category.key)
                  } label: {
                    Label("Off Menu", systemImage: "tray.and.arrow.down.fill")
                  }
                }
              }
            }
            .appGlassCard(tint: AppPalette.brand)
          }

          if !document.uncategorizedItems.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
              Text("Off Menu Recovery")
                .font(.headline)
              ForEach(document.uncategorizedItems) { item in
                VStack(alignment: .leading, spacing: 8) {
                  EditorItemRow(item: item)
                  HStack {
                    ForEach(document.visibleCategories) { category in
                      Button(category.label) {
                        model.restoreItemFromOffMenu(itemID: item.id, to: category.key)
                      }
                      .buttonStyle(SecondaryGlassButtonStyle())
                    }
                    Button("Delete", role: .destructive) {
                      model.deleteItem(itemID: item.id, categoryKey: EditableMenuDocument.uncategorizedKey)
                    }
                    .buttonStyle(SecondaryGlassButtonStyle())
                  }
                }
                .padding(.vertical, 4)
              }
            }
            .appGlassCard(tint: AppPalette.warning)
          }
        } else {
          ProgressView("Loading editor...")
            .frame(maxWidth: .infinity)
            .padding()
        }
      }
      .padding(24)
    }
    .navigationTitle(menu.displayTypeLabel)
    .navigationBarTitleDisplayMode(.inline)
    .task {
      await model.loadEditor(menuId: menu.id)
    }
    .sheet(isPresented: $showingItemSheet) {
      ItemEditorSheet(model: model, menu: menu, draft: $editingDraft)
    }
    .alert("Add Category", isPresented: $showingAddCategory) {
      TextField("Category name", text: $addCategoryName)
      Button("Add") {
        model.addCategory(label: addCategoryName)
        addCategoryName = ""
      }
      Button("Cancel", role: .cancel) {
        addCategoryName = ""
      }
    }
    .alert("Rename Category", isPresented: Binding(
      get: { renameTarget != nil },
      set: { if !$0 { renameTarget = nil } }
    )) {
      TextField("Category name", text: $renameText)
      Button("Save") {
        if let target = renameTarget {
          model.renameCategory(key: target.key, label: renameText)
        }
      }
      Button("Cancel", role: .cancel) {}
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(menu.name)
        .font(.system(size: 30, weight: .bold, design: .rounded))
      HStack {
        Text(model.editorDirty ? "Unsaved local edits" : "Aligned with live menu")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(model.editorDirty ? AppPalette.warning : AppPalette.success)
        if model.editorHasSharedDraft {
          VStack(alignment: .leading, spacing: 6) {
            Text("Shared draft on server")
              .font(.footnote.weight(.semibold))
              .padding(.vertical, 5)
              .padding(.horizontal, 8)
              .background(AppPalette.brand.opacity(0.12), in: Capsule())
            if let summary = model.editorSharedDraftSummary {
              Text(summary)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        }
        Spacer()
      }
    }
    .appGlassCard(tint: menu.isFoodMenu ? AppPalette.success : AppPalette.brand)
  }

  private var actionBar: some View {
    VStack(spacing: 12) {
      HStack {
        Button("Add Item") {
          editingDraft = EditableItemDraft(categoryKey: model.currentEditorDocument?.visibleCategories.first?.key ?? "", isFoodMenu: menu.isFoodMenu)
          showingItemSheet = true
        }
        .buttonStyle(SecondaryGlassButtonStyle())

        Button("Add Category") {
          showingAddCategory = true
        }
        .buttonStyle(SecondaryGlassButtonStyle())
      }

      HStack {
        Button(model.showClearSharedDraft ? "Clear Shared Draft" : "Save Draft") {
          Task { await model.saveRemoteDraft() }
        }
        .buttonStyle(SecondaryGlassButtonStyle())
        .disabled(!model.canSaveDraftRemotely || (!model.editorDirty && !model.showClearSharedDraft))

        Button("Save Live") {
          Task { await model.saveLiveMenu() }
        }
        .buttonStyle(SecondaryGlassButtonStyle())
        .disabled(!model.canSaveLiveRemotely || !model.editorDirty)
      }

      HStack {
        Button("Load Send Preview") {
          Task { await model.loadPublishPreview() }
        }
        .buttonStyle(SecondaryGlassButtonStyle())
        .disabled(!model.canLoadPublishPreview || !model.editorDirty)

        NavigationLink(value: AppDestination.routePreview(menu)) {
          Label("Exact Route", systemImage: "safari")
            .font(.headline)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(SecondaryGlassButtonStyle())
      }
    }
    .appGlassCard(tint: AppPalette.accent)
  }
}

private struct EditorItemRow: View {
  let item: MenuItemPayload

  var body: some View {
    HStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 4) {
        Text(item.name)
          .font(.headline)
        if item.showDescription, !item.desc.isEmpty {
          Text(item.desc)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      Spacer()
      Text(item.price)
        .font(.subheadline.monospacedDigit())
    }
    .padding(.vertical, 6)
  }
}

private struct PublishPreviewCard: View {
  @Bindable var model: AppModel
  let preview: MenuPreviewPayload

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Send Update Preview")
        .font(.headline)
      if !preview.patchMessage.isEmpty {
        Text(preview.patchMessage)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      ForEach(preview.sections) { section in
        VStack(alignment: .leading, spacing: 6) {
          Text(section.label)
            .font(.subheadline.weight(.semibold))
          ForEach(section.changes) { change in
            Toggle(isOn: Binding(
              get: { model.selectedPreviewChangeIDs.contains(change.id) },
              set: { model.updatePreviewSelection(change.id, selected: $0) }
            )) {
              Text(change.text)
                .font(.footnote)
            }
          }
        }
      }
      Button("Save And Send") {
        Task { await model.publishSelectedChanges() }
      }
      .buttonStyle(PrimaryGlassButtonStyle())
      .disabled(!model.canPublishRemotely)
    }
    .appGlassCard(tint: AppPalette.warning)
  }
}

private struct EditableItemDraft: Equatable {
  var itemID: String?
  var originalCategoryKey: String?
  var categoryKey: String = ""
  var name = ""
  var description = ""
  var price = ""
  var recipeText = ""
  var isEightySixed = false
  var showDescription = true
  var showRecipe = false
  var barcode = ""
  var keepAdding = false
  var isFoodMenu = false

  init() {}

  init(categoryKey: String, isFoodMenu: Bool) {
    self.categoryKey = categoryKey
    self.isFoodMenu = isFoodMenu
  }

  init(item: MenuItemPayload, categoryKey: String, isFoodMenu: Bool) {
    itemID = item.id
    originalCategoryKey = categoryKey
    self.categoryKey = categoryKey
    name = item.name
    description = item.desc
    price = item.price
    recipeText = item.recipe.joined(separator: "\n")
    isEightySixed = item.isEightySixed
    showDescription = item.showDescription
    showRecipe = item.showRecipe
    self.isFoodMenu = isFoodMenu
  }
}

private struct ItemEditorSheet: View {
  @Bindable var model: AppModel
  let menu: MenuRecord
  @Binding var draft: EditableItemDraft
  @Environment(\.dismiss) private var dismiss
  @State private var showingScanner = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Item") {
          TextField("Name", text: $draft.name)
          TextField("Description", text: $draft.description, axis: .vertical)
          TextField("Price", text: $draft.price)
            .keyboardType(.decimalPad)
          Picker("Category", selection: $draft.categoryKey) {
            ForEach(model.currentEditorDocument?.visibleCategories ?? []) { category in
              Text(category.label).tag(category.key)
            }
            if !(model.currentEditorDocument?.visibleCategories.contains(where: { $0.key == draft.categoryKey }) ?? true) {
              Text("Off Menu").tag(EditableMenuDocument.uncategorizedKey)
            }
          }
        }

        Section("Visibility") {
          Toggle("Show Description", isOn: $draft.showDescription)
          Toggle("86'd", isOn: $draft.isEightySixed)
          if !menu.isFoodMenu {
            Toggle("Show Recipe", isOn: $draft.showRecipe)
            TextField("Recipe", text: $draft.recipeText, axis: .vertical)
          }
        }

        Section("Barcode + Lookup") {
          TextField("UPC", text: $draft.barcode)
            .keyboardType(.numberPad)
          Button("Scan Barcode") {
            showingScanner = true
          }
          Button("Lookup Product") {
            Task {
              do {
                let result = try await model.lookupBarcode(draft.barcode)
                draft.name = result.name
                if draft.description.isEmpty {
                  draft.description = result.description
                }
              } catch {
                model.notice = AppNotice(tone: .warning, title: "Lookup Failed", message: error.localizedDescription)
              }
            }
          }
        }

        Section {
          Toggle("Keep modal open after saving", isOn: $draft.keepAdding)
        }
      }
      .navigationTitle(draft.itemID == nil ? "Add Item" : "Edit Item")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") { save() }
        }
      }
    }
    .sheet(isPresented: $showingScanner) {
      BarcodeScannerSheet { code in
        draft.barcode = code
      }
    }
  }

  private func save() {
    let trimmedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedName.isEmpty else {
      model.notice = AppNotice(tone: .warning, title: "Name Required", message: "Every menu item needs a non-empty name.")
      return
    }
    guard model.canUseItemName(trimmedName, in: draft.categoryKey, excluding: draft.itemID) else {
      model.notice = AppNotice(tone: .warning, title: "Duplicate Item", message: "That category already has an item with the same name.")
      return
    }

    let recipe = draft.isFoodMenu ? [] : draft.recipeText
      .split(separator: "\n")
      .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }

    let item = MenuItemPayload(
      id: draft.itemID ?? "local-\(UUID().uuidString.lowercased())",
      name: trimmedName,
      desc: draft.description.trimmingCharacters(in: .whitespacesAndNewlines),
      recipe: recipe,
      price: draft.price.trimmingCharacters(in: .whitespacesAndNewlines),
      isEightySixed: draft.isEightySixed,
      displayOrder: 0,
      onMenu: draft.categoryKey != EditableMenuDocument.uncategorizedKey,
      visibility: draft.categoryKey == EditableMenuDocument.uncategorizedKey ? "off_menu" : "public",
      upcharges: [],
      showDescription: draft.showDescription,
      showRecipe: draft.isFoodMenu ? false : draft.showRecipe
    )
    model.upsertItem(item, categoryKey: draft.categoryKey, originalCategoryKey: draft.originalCategoryKey)

    if draft.keepAdding {
      let preservedCategory = draft.categoryKey
      let isFood = draft.isFoodMenu
      draft = EditableItemDraft()
      draft.categoryKey = preservedCategory
      draft.isFoodMenu = isFood
    } else {
      dismiss()
    }
  }
}
