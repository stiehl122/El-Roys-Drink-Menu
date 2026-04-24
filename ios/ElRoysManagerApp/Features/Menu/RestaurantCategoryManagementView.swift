import SwiftUI

struct RestaurantCategoryManagementScreen: View {
  @Bindable var session: MenuEditorSession

  @State private var addCategoryName = ""
  @State private var renameTarget: MenuCategoryPayload?
  @State private var renameText = ""
  @State private var isReordering = false
  @State private var showingAddCategory = false
  @State private var showingDiscardDraftConfirm = false
  @State private var showingPreview = false

  private var accent: Color {
    session.menu.isFoodMenu ? AppPalette.jade : AppPalette.bloodOrange
  }

  private func isProtectedCategory(_ category: MenuCategoryPayload) -> Bool {
    category.key == EditableMenuDocument.featuredSpecialsKey
  }

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 18) {
        AppSectionHeader(
          eyebrow: "Restaurant tools",
          title: "\(session.menu.displayTypeLabel) categories",
          subtitle: "Add and organize categories here. Featured Specials stays pinned first and is edited from the menu item flow.",
          tint: accent
        )

        if let notice = session.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        categoryActions

        if let document = session.document {
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
    .navigationTitle("\(session.menu.displayTypeLabel) Categories")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: session.menu.id) {
      await session.load()
    }
    .sheet(isPresented: $showingPreview) {
      if let preview = session.preview {
        RestaurantCategoryPublishPreviewSheet(
          session: session,
          preview: preview,
          accent: accent,
          onPublish: {
            Task {
              await session.publishSelectedChanges()
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
        session.addCategory(label: addCategoryName)
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
          session.renameCategory(key: target.key, label: renameText)
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
        session.discardLocalDraft()
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
      .disabled(!session.canEditCategories)

      HStack(spacing: 12) {
        Button("Save Quietly") {
          Task { await session.saveLiveMenu() }
        }
        .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
        .disabled(!session.canSaveQuietlyRemotely)

        Button(session.hasLocalDraftChanges ? "Save & Send" : "Send Update") {
          Task {
            await session.loadPublishPreview()
            showingPreview = session.preview != nil
          }
        }
        .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
        .disabled(!session.canLoadPublishPreview)

        Button("Discard Draft") {
          showingDiscardDraftConfirm = true
        }
        .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
        .disabled(!session.canDiscardLocalDraft)
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
          .disabled(!session.canEditCategories)
        }
      }

      List {
        ForEach(categories) { category in
          HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
              HStack(spacing: 8) {
                Text(category.label)
                  .font(AppTypography.body(16, weight: .bold))

                if isProtectedCategory(category) {
                  Text("Protected")
                    .font(AppTypography.body(11, weight: .bold))
                    .foregroundStyle(accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(accent.opacity(0.12), in: Capsule())
                }
              }
              Text("\(category.items.filter(\.onMenu).count) live items")
                .font(AppTypography.body(12, weight: .medium))
                .foregroundStyle(.secondary)

              if isProtectedCategory(category) {
                Text("Pinned first. Rename, delete, and reorder are disabled for this category.")
                  .font(AppTypography.body(12, weight: .medium))
                  .foregroundStyle(.secondary)
              }
            }

            Spacer()

            if !isReordering && !isProtectedCategory(category) {
              Button("Rename") {
                renameTarget = category
                renameText = category.label
              }
              .buttonStyle(SecondaryGlassButtonStyle(accent: accent))
              .disabled(!session.canEditCategories)

              Button("Delete", role: .destructive) {
                session.deleteCategory(key: category.key)
              }
              .buttonStyle(SecondaryGlassButtonStyle(accent: AppPalette.danger))
              .disabled(!session.canEditCategories)
            }
          }
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .moveDisabled(!isReordering || !session.canEditCategories || isProtectedCategory(category))
        }
        .onMove(perform: session.moveVisibleCategories)
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
  @Bindable var session: MenuEditorSession
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
                    get: { session.selectedPreviewChangeIDs.contains(change.id) },
                    set: { session.updatePreviewSelection(change.id, selected: $0) }
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
            .disabled(!session.canPublishRemotely)
        }
      }
    }
  }
}
