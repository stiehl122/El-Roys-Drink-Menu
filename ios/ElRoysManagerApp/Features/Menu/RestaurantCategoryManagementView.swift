import SwiftUI

struct RestaurantCategoryManagementScreen: View {
  @Bindable var model: AppModel
  let menu: MenuRecord

  @State private var addCategoryName = ""
  @State private var renameTarget: MenuCategoryPayload?
  @State private var renameText = ""
  @State private var isReordering = false
  @State private var showingAddCategory = false
  @State private var showingDiscardDraftConfirm = false
  @State private var showingPreview = false

  private var accent: Color {
    menu.isFoodMenu ? AppPalette.jade : AppPalette.bloodOrange
  }

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 18) {
        AppSectionHeader(
          eyebrow: "Restaurant tools",
          title: "\(menu.displayTypeLabel) categories",
          subtitle: "Add, rename, delete, and reorder categories without leaving the staff tools flow.",
          tint: accent
        )

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        categoryActions

        if let document = model.currentEditorDocument {
          categoryList(document.visibleCategories)
        } else {
          AppLoadingCard(
            title: "Loading categories",
            subtitle: "Preparing the live workspace, local draft state, and category structure.",
            tint: accent
          )
        }
      }
      .padding(24)
    }
    .navigationTitle("\(menu.displayTypeLabel) Categories")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: menu.id) {
      await model.loadEditor(menuId: menu.id)
    }
    .sheet(isPresented: $showingPreview) {
      if let preview = model.currentEditorPreview {
        RestaurantCategoryPublishPreviewSheet(
          model: model,
          preview: preview,
          accent: accent,
          onPublish: {
            Task {
              await model.publishSelectedChanges()
              showingPreview = false
            }
          }
        )
      } else {
        ProgressView("Loading preview…")
          .presentationDetents([.medium])
      }
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
      set: { isPresented in
        if !isPresented {
          renameTarget = nil
          renameText = ""
        }
      }
    )) {
      TextField("Category name", text: $renameText)
      Button("Save") {
        if let target = renameTarget {
          model.renameCategory(key: target.key, label: renameText)
        }
        renameTarget = nil
        renameText = ""
      }
      Button("Cancel", role: .cancel) {
        renameTarget = nil
        renameText = ""
      }
    }
    .alert("Discard Local Draft?", isPresented: $showingDiscardDraftConfirm) {
      Button("Discard Draft", role: .destructive) {
        model.discardLocalDraft()
      }
      Button("Keep Editing", role: .cancel) {}
    } message: {
      Text("This only removes unsaved edits from this device and does not modify the shared server queue.")
    }
  }

  private var categoryActions: some View {
    VStack(alignment: .leading, spacing: 12) {
      Button("Add Category") {
        showingAddCategory = true
      }
      .buttonStyle(PrimaryGlassButtonStyle(accent: accent))
      .disabled(!model.canEditCategories)

      HStack(spacing: 12) {
        Button("Save Quietly") {
          Task { await model.saveLiveMenu() }
        }
        .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
        .disabled(!model.canSaveQuietlyRemotely)

        Button(model.hasLocalDraftChanges ? "Save & Send" : "Send Update") {
          Task {
            await model.loadPublishPreview()
            showingPreview = model.currentEditorPreview != nil
          }
        }
        .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
        .disabled(!model.canLoadPublishPreview)

        Button("Discard Draft") {
          showingDiscardDraftConfirm = true
        }
        .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
        .disabled(!model.canDiscardLocalDraft)
      }
    }
    .appGlassCard(tint: accent, cornerRadius: 28)
  }

  @ViewBuilder
  private func categoryList(_ categories: [MenuCategoryPayload]) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Categories")
          .font(AppTypography.display(24, weight: .bold))
          .foregroundStyle(AppPalette.ink)

        Spacer()

        if categories.count > 1 || isReordering {
          Button(isReordering ? "Done Reordering" : "Reorder Categories") {
            isReordering.toggle()
          }
          .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
          .disabled(!model.canEditCategories)
        }
      }

      List {
        ForEach(categories) { category in
          HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
              Text(category.label)
                .font(AppTypography.body(16, weight: .bold))
              Text("\(category.items.filter(\.onMenu).count) live items")
                .font(AppTypography.body(12, weight: .medium))
                .foregroundStyle(.secondary)
            }

            Spacer()

            if !isReordering {
              Button("Rename") {
                renameTarget = category
                renameText = category.label
              }
              .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
              .disabled(!model.canEditCategories)

              Button("Delete", role: .destructive) {
                model.deleteCategory(key: category.key)
              }
              .buttonStyle(SecondaryGlassButtonStyle(accent: AppPalette.danger))
              .disabled(!model.canEditCategories)
            }
          }
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .moveDisabled(!isReordering || !model.canEditCategories)
        }
        .onMove(perform: model.moveVisibleCategories)
      }
      .environment(\.editMode, .constant(isReordering ? .active : .inactive))
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .frame(height: max(CGFloat(categories.count) * 72, 88))
    }
    .appGlassCard(tint: accent, cornerRadius: 30)
  }
}

private struct RestaurantCategoryPublishPreviewSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var model: AppModel
  let preview: MenuPreviewPayload
  let accent: Color
  let onPublish: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Text(preview.patchMessage.isEmpty ? "Review the queued category changes before sending." : preview.patchMessage)
            .font(AppTypography.body(14, weight: .medium))

          ForEach(preview.sections) { section in
            VStack(alignment: .leading, spacing: 10) {
              Text(section.label)
                .font(AppTypography.body(16, weight: .bold))

              ForEach(section.changes) { change in
                Toggle(
                  isOn: Binding(
                    get: { model.selectedPreviewChangeIDs.contains(change.id) },
                    set: { model.updatePreviewSelection(change.id, selected: $0) }
                  )
                ) {
                  Text(change.text)
                }
                .tint(accent)
              }
            }
            .appFieldChrome(tint: accent, cornerRadius: 20)
          }
        }
        .padding(24)
      }
      .navigationTitle("Send Preview")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(preview.hasNotificationChanges ? "Send Update" : "Save Changes", action: onPublish)
            .disabled(!model.canPublishRemotely)
        }
      }
    }
  }
}
