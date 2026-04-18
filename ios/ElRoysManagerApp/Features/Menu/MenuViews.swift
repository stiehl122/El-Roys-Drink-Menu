import SwiftUI

private enum MenuEditorSheet: String, Identifiable {
  case itemEditor
  case publishPreview

  var id: String { rawValue }
}

struct MenuEditorScreen: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var model: AppModel
  let menu: MenuRecord
  @State private var addCategoryName = ""
  @State private var showingAddCategory = false
  @State private var editingDraft = EditableItemDraft()
  @State private var activeSheet: MenuEditorSheet?
  @State private var renameTarget: MenuCategoryPayload?
  @State private var renameText = ""
  @State private var showingDiscardDraftConfirm = false
  @State private var reorderingCategoryKey: String?

  private var theme: MenuEditorTheme {
    .theme(for: menu)
  }

  private var menuAccent: Color {
    menu.isFoodMenu ? theme.foodAccent : theme.drinkAccent
  }

  private var canEditCategories: Bool {
    model.canEditCategories
  }

  var body: some View {
    ZStack {
      MenuEditorBackground(theme: theme)

      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          MenuEditorHeaderCard(
            menu: menu,
            theme: theme,
            menuAccent: menuAccent,
            hasLocalDraftChanges: model.hasLocalDraftChanges,
            hasLiveMenuChanges: model.hasLiveMenuChanges,
            hasServerUnsentChanges: model.hasServerUnsentChanges,
            menuStatusLabel: model.menuStatusLabel
          )

          if let notice = model.notice {
            StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
          }

          MenuEditorActionPanel(
            model: model,
            menu: menu,
            theme: theme,
            menuAccent: menuAccent,
            onAddItem: presentNewItem,
            onSaveQuietly: saveQuietly,
            onSendUpdate: loadSendPreview,
            onDiscardDraft: { showingDiscardDraftConfirm = true }
          )

          if let document = model.currentEditorDocument {
            MenuEditorCategoriesHeader(
              theme: theme,
              menuAccent: menuAccent,
              canEditCategories: canEditCategories,
              onAddCategory: { showingAddCategory = true }
            )
            ForEach(document.visibleCategories) { category in
              MenuEditorCategoryCard(
                menu: menu,
                category: category,
                theme: theme,
                menuAccent: menuAccent,
                canEditCategories: canEditCategories,
                onRename: {
                  renameTarget = category
                  renameText = category.label
                },
                onDelete: {
                  model.deleteCategory(key: category.key)
                },
                onSelectItem: { item in
                  reorderingCategoryKey = nil
                  editingDraft = EditableItemDraft(item: item, categoryKey: category.key, isFoodMenu: menu.isFoodMenu)
                  activeSheet = .itemEditor
                },
                onToggleEightySix: { item in
                  model.setItemEightySixed(
                    itemID: item.id,
                    categoryKey: category.key,
                    isEightySixed: !item.isEightySixed
                  )
                },
                isReordering: reorderingCategoryKey == category.key,
                onToggleReorder: {
                  reorderingCategoryKey = reorderingCategoryKey == category.key ? nil : category.key
                },
                onMoveVisibleItems: { source, destination in
                  model.moveVisibleItems(in: category.key, from: source, to: destination)
                }
              )
            }

            if !document.uncategorizedItems.isEmpty {
              MenuEditorOffMenuRecoveryCard(
                items: document.uncategorizedItems,
                categories: document.visibleCategories,
                theme: theme,
                onRestore: { item, category in
                  model.restoreItemFromOffMenu(itemID: item.id, to: category.key)
                },
                onDelete: { item in
                  model.deleteItem(itemID: item.id, categoryKey: EditableMenuDocument.uncategorizedKey)
                }
              )
            }
          } else {
            MenuEditorLoadingCard(theme: theme)
          }
        }
        .padding(24)
      }
      .disabled(model.editorRefreshRequirement != nil)
      .blur(radius: model.editorRefreshRequirement == nil ? 0 : 2)

      if let requirement = model.editorRefreshRequirement {
        Color.black.opacity(0.22)
          .ignoresSafeArea()
        MenuEditorRefreshOverlay(
          requirement: requirement,
          theme: theme,
          onKeepLocalDrafts: { Task { await model.refreshEditorAfterRemoteUpdate(strategy: .keepLocalDrafts) } },
          onUpdateDrafts: { Task { await model.refreshEditorAfterRemoteUpdate(strategy: .updateDrafts) } }
        )
          .padding(24)
      }
    }
    .navigationTitle(menu.displayTypeLabel)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        NavigationLink(value: AppDestination.routePreview(menu)) {
          Image(systemName: "safari")
        }
        .accessibilityLabel("Exact Route Preview")
      }
    }
    .task(id: menu.id) {
      await model.loadEditor(menuId: menu.id)
    }
    .task(id: menu.id) {
      await model.monitorEditorRemoteChanges(for: menu.id)
    }
    .task(id: model.notice?.id) {
      guard let notice = model.notice else { return }
      try? await Task.sleep(for: .seconds(4))
      guard model.notice?.id == notice.id else { return }
      model.notice = nil
    }
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active else { return }
      Task { await model.checkForRemoteMenuUpdate(menuId: menu.id, force: true) }
    }
    .onChange(of: model.editorRefreshRequirement != nil) { _, required in
      guard required else { return }
      activeSheet = nil
      showingAddCategory = false
      renameTarget = nil
      reorderingCategoryKey = nil
    }
    .sheet(item: Binding(
      get: { model.editorRefreshRequirement == nil ? activeSheet : nil },
      set: { activeSheet = $0 }
    )) { sheet in
      switch sheet {
      case .itemEditor:
        ItemEditorSheet(model: model, menu: menu, draft: $editingDraft)
      case .publishPreview:
        if let preview = model.currentEditorPreview {
          PublishPreviewSheet(
            model: model,
            preview: preview,
            theme: theme,
            menuAccent: menuAccent,
            onPublish: publishChanges
          )
        } else {
          ProgressView("Loading preview…")
            .presentationDetents([.medium])
        }
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
    .alert("Discard Local Draft?", isPresented: $showingDiscardDraftConfirm) {
      Button("Discard Draft", role: .destructive) {
        model.discardLocalDraft()
      }
      Button("Keep Editing", role: .cancel) {}
    } message: {
      Text("This only removes unsaved edits from this device and does not modify the shared server queue.")
    }
  }

  private func presentNewItem() {
    if let firstCategoryKey = model.currentEditorDocument?.visibleCategories.first?.key {
      editingDraft = EditableItemDraft(categoryKey: firstCategoryKey, isFoodMenu: menu.isFoodMenu)
      activeSheet = .itemEditor
    } else {
      model.notice = AppNotice(
        tone: .warning,
        title: "Add A Category First",
        message: "Create at least one category before adding menu items."
      )
    }
  }

  private func saveQuietly() {
    Task { await model.saveLiveMenu() }
  }

  private func loadSendPreview() {
    Task {
      await model.loadPublishPreview()
      activeSheet = model.currentEditorPreview == nil ? nil : .publishPreview
    }
  }

  private func publishChanges() {
    Task {
      await model.publishSelectedChanges()
      activeSheet = nil
    }
  }
}

private struct EditorItemRow: View {
  let item: MenuItemPayload
  let theme: MenuEditorTheme

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: item.showRecipe ? "wineglass.fill" : "fork.knife")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(theme.iconTint)
        .frame(width: 32, height: 32)
        .background(theme.iconTint.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

      VStack(alignment: .leading, spacing: 6) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(item.name)
            .font(EditorTypography.display(18, weight: .bold))
            .foregroundStyle(theme.titleText)
          if item.isEightySixed {
            Text("86'D")
              .font(EditorTypography.body(11, weight: .bold))
              .padding(.vertical, 4)
              .padding(.horizontal, 8)
              .background(theme.warningAccent.opacity(0.18), in: Capsule())
              .foregroundStyle(theme.warningAccent)
          }
        }

        if item.showDescription, !item.desc.isEmpty {
          Text(item.desc)
            .font(EditorTypography.body(13))
            .foregroundStyle(theme.subtleText)
            .fixedSize(horizontal: false, vertical: true)
        }

        if item.showRecipe, !item.recipe.isEmpty {
          Text(item.recipe.joined(separator: " • "))
            .font(EditorTypography.body(12, weight: .medium))
            .foregroundStyle(theme.recipeText)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      Spacer()
      Text(item.price.isEmpty ? "--" : item.price)
        .font(EditorTypography.body(14, weight: .bold))
        .foregroundStyle(theme.titleText)
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(theme.priceFill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
    .padding(12)
    .background(theme.itemRowFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(theme.itemRowBorder, lineWidth: 1)
    }
  }
}

struct PublishPreviewSummary: Equatable {
  struct NotificationChange: Identifiable, Equatable {
    let id: String
    let sectionLabel: String
    let text: String

    var displayText: String {
      "\(sectionLabel): \(text)"
    }
  }

  var selectedNotificationChanges: [NotificationChange]
  var clearedNotificationChanges: [NotificationChange]
  var saveOnlyChanges: [SaveOnlyChange]

  init(preview: MenuPreviewPayload, selectedChangeIDs: Set<String>) {
    let notificationChanges = preview.sections
      .flatMap(\.changes)
      .map {
        NotificationChange(
          id: $0.id,
          sectionLabel: $0.sectionLabel,
          text: $0.text
        )
      }
    self.selectedNotificationChanges = notificationChanges.filter { selectedChangeIDs.contains($0.id) }
    self.clearedNotificationChanges = notificationChanges.filter { !selectedChangeIDs.contains($0.id) }
    self.saveOnlyChanges = preview.saveOnlyChanges
  }
}

private struct PublishPreviewSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var model: AppModel
  let preview: MenuPreviewPayload
  let theme: MenuEditorTheme
  let menuAccent: Color
  let onPublish: () -> Void

  private var summary: PublishPreviewSummary {
    PublishPreviewSummary(
      preview: preview,
      selectedChangeIDs: model.selectedPreviewChangeIDs
    )
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          if !preview.patchMessage.isEmpty {
            Text(preview.patchMessage)
              .font(EditorTypography.body(14))
              .foregroundStyle(theme.subtleText)
              .padding(.horizontal, 2)
          }

          if preview.hasNotificationChanges {
            VStack(alignment: .leading, spacing: 10) {
              Text("Notification Toggles")
                .font(EditorTypography.body(15, weight: .bold))
                .foregroundStyle(theme.titleText)
              ForEach(preview.sections) { section in
                VStack(alignment: .leading, spacing: 8) {
                  Text(section.label)
                    .font(EditorTypography.body(13, weight: .semibold))
                    .foregroundStyle(theme.subtleText)
                  ForEach(section.changes) { change in
                    Toggle(isOn: Binding(
                      get: { model.selectedPreviewChangeIDs.contains(change.id) },
                      set: { model.updatePreviewSelection(change.id, selected: $0) }
                    )) {
                      Text(change.text)
                        .font(EditorTypography.body(13))
                        .foregroundStyle(theme.bodyText)
                    }
                    .tint(menuAccent)
                  }
                }
              }
            }
            .menuEditorSurface(colors: [theme.previewTop, theme.previewBottom], border: theme.previewBorder)
          }

          if !summary.selectedNotificationChanges.isEmpty {
            PublishPreviewSummaryCard(
              title: "Changes To Send In Notification",
              items: summary.selectedNotificationChanges.map(\.displayText),
              theme: theme
            )
          }

          if !summary.clearedNotificationChanges.isEmpty {
            PublishPreviewSummaryCard(
              title: "Changes To Clear",
              items: summary.clearedNotificationChanges.map(\.displayText),
              theme: theme
            )
          }

          if !summary.saveOnlyChanges.isEmpty {
            PublishPreviewSummaryCard(
              title: "Save Only Changes",
              items: summary.saveOnlyChanges.map { $0.label.nilIfBlank ?? $0.message },
              theme: theme
            )
          }
        }
        .padding(24)
      }
      .background {
        MenuEditorBackground(theme: theme)
          .ignoresSafeArea()
      }
      .safeAreaInset(edge: .bottom) {
        PublishPreviewActionButton(
          title: actionButtonTitle,
          subtitle: actionButtonSubtitle,
          icon: actionButtonIcon,
          accent: menuAccent,
          theme: theme,
          enabled: model.canPublishRemotely,
          action: onPublish
        )
        .padding(.horizontal, 24)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .background(.ultraThinMaterial)
      }
      .navigationTitle(screenTitle)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") {
            dismiss()
          }
        }
      }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
  }

  private var screenTitle: String {
    preview.hasNotificationChanges ? "Send Notification" : "Save Changes"
  }

  private var actionButtonTitle: String {
    if !preview.hasNotificationChanges {
      return "Save"
    }
    return model.hasLocalDraftChanges ? "Save & Send" : "Send"
  }

  private var actionButtonSubtitle: String {
    if !preview.hasNotificationChanges {
      return "Save live without sending notifications."
    }
    if model.hasLocalDraftChanges {
      return "Checked rows send now, unchecked rows clear quietly."
    }
    return "Send checked queue rows now."
  }

  private var actionButtonIcon: String {
    preview.hasNotificationChanges ? "paperplane.fill" : "square.and.arrow.down.fill"
  }
}

private struct PublishPreviewSummaryCard: View {
  let title: String
  let items: [String]
  let theme: MenuEditorTheme

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(EditorTypography.body(15, weight: .bold))
        .foregroundStyle(theme.titleText)
      ForEach(Array(items.enumerated()), id: \.offset) { _, item in
        Text(item)
          .font(EditorTypography.body(13))
          .foregroundStyle(theme.bodyText)
      }
    }
    .menuEditorSurface(colors: [theme.panelTop, theme.panelBottom], border: theme.panelBorder)
  }
}

private struct PublishPreviewActionButton: View {
  let title: String
  let subtitle: String
  let icon: String
  let accent: Color
  let theme: MenuEditorTheme
  let enabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 5) {
          Text(title)
            .font(EditorTypography.body(16, weight: .bold))
            .foregroundStyle(theme.titleText)
          Text(subtitle)
            .font(EditorTypography.body(12, weight: .medium))
            .foregroundStyle(theme.subtleText)
        }

        Spacer()

        Image(systemName: icon)
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(theme.titleText)
          .frame(width: 46, height: 46)
          .background(.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
          .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .stroke(.white.opacity(0.22), lineWidth: 1)
          }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 16)
      .frame(maxWidth: .infinity)
      .background {
        let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
        shape
          .fill(.thinMaterial)
          .overlay {
            LinearGradient(
              colors: [
                accent.opacity(0.42),
                accent.opacity(0.22),
                accent.opacity(0.12)
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
            .clipShape(shape)
          }
      }
      .overlay {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(accent.opacity(0.36), lineWidth: 1)
      }
      .shadow(color: accent.opacity(0.2), radius: 18, y: 10)
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.5)
    .scaleEffect(enabled ? 1 : 0.98)
    .animation(.easeOut(duration: 0.16), value: enabled)
  }
}

private struct MenuEditorHeaderCard: View {
  let menu: MenuRecord
  let theme: MenuEditorTheme
  let menuAccent: Color
  let hasLocalDraftChanges: Bool
  let hasLiveMenuChanges: Bool
  let hasServerUnsentChanges: Bool
  let menuStatusLabel: String

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(theme.restaurantLabel.uppercased())
        .font(EditorTypography.body(11, weight: .bold))
        .tracking(1.1)
        .foregroundStyle(theme.subtleText)

      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 6) {
          Text(menu.name)
            .font(EditorTypography.display(30, weight: .bold))
            .foregroundStyle(theme.titleText)
          Text(menu.isFoodMenu ? "Kitchen edit deck" : "Bar edit deck")
          .font(EditorTypography.body(14, weight: .medium))
          .foregroundStyle(theme.subtleText)
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 10) {
          Text(menu.displayTypeLabel)
            .font(EditorTypography.body(12, weight: .bold))
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(menuAccent.opacity(0.18), in: Capsule())
            .foregroundStyle(menuAccent)
          MenuEditorBadge(
            label: menuStatusLabel.uppercased(),
            fill: statusFill,
            text: statusText
          )
        }
      }
    }
    .menuEditorSurface(colors: [theme.headerTop, theme.headerBottom], border: theme.headerBorder)
  }

  private var statusFill: Color {
    if hasLocalDraftChanges {
      return theme.warningAccent.opacity(0.18)
    }
    if hasServerUnsentChanges || hasLiveMenuChanges {
      return menuAccent.opacity(0.16)
    }
    return theme.successAccent.opacity(0.18)
  }

  private var statusText: Color {
    if hasLocalDraftChanges {
      return theme.warningAccent
    }
    if hasServerUnsentChanges || hasLiveMenuChanges {
      return menuAccent
    }
    return theme.successAccent
  }
}

private struct MenuEditorBadge: View {
  let label: String
  let fill: Color
  let text: Color

  var body: some View {
    Text(label)
      .font(EditorTypography.body(11, weight: .bold))
      .padding(.vertical, 6)
      .padding(.horizontal, 10)
      .background(fill, in: Capsule())
      .foregroundStyle(text)
  }
}

private struct MenuEditorActionPanel: View {
  @Bindable var model: AppModel
  let menu: MenuRecord
  let theme: MenuEditorTheme
  let menuAccent: Color
  let onAddItem: () -> Void
  let onSaveQuietly: () -> Void
  let onSendUpdate: () -> Void
  let onDiscardDraft: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Actions")
        .font(EditorTypography.display(20, weight: .bold))
        .foregroundStyle(theme.titleText)

      HStack(spacing: 12) {
        Button(action: onAddItem) {
          MenuEditorActionLabel(title: "Add Item", subtitle: "Create a new menu item", icon: "plus.circle.fill", accent: menuAccent)
        }
        .buttonStyle(.plain)
        Button(action: onSaveQuietly) {
          MenuEditorActionLabel(
            title: "Save Quietly",
            subtitle: model.hasLiveMenuChanges ? "Save live without sending notifications" : "Live menu already matches",
            icon: "checkmark.seal.fill",
            accent: theme.successAccent
          )
        }
        .buttonStyle(.plain)
        .disabled(!model.canSaveQuietlyRemotely)
      }

      HStack(spacing: 12) {
        Button(action: onSendUpdate) {
          MenuEditorActionLabel(
            title: model.hasLocalDraftChanges ? "Save & Send" : "Send",
            subtitle: model.currentEditorPreview == nil
              ? (model.hasLocalDraftChanges
                  ? "Save live, then choose what to send or clear"
                  : "Choose which unsent queue groups to send or clear")
              : "Review the current send plan",
            icon: "paperplane.fill",
            accent: menuAccent
          )
        }
        .buttonStyle(.plain)
        .disabled(!model.canLoadPublishPreview)
      }

      HStack(spacing: 12) {
        Button(action: onDiscardDraft) {
          MenuEditorActionLabel(
            title: "Discard Draft",
            subtitle: model.hasLocalDraftChanges ? "Remove local edits on this device" : "No local draft to discard",
            icon: "trash.fill",
            accent: theme.warningAccent
          )
        }
        .buttonStyle(.plain)
        .disabled(!model.canDiscardLocalDraft)
      }
    }
    .menuEditorSurface(colors: [theme.panelTop, theme.panelBottom], border: theme.panelBorder)
  }
}

private struct MenuEditorCategoriesHeader: View {
  let theme: MenuEditorTheme
  let menuAccent: Color
  let canEditCategories: Bool
  let onAddCategory: () -> Void

  var body: some View {
    HStack(alignment: .center) {
      Text("Categories")
        .font(EditorTypography.display(20, weight: .bold))
        .foregroundStyle(theme.titleText)
      Spacer()
      if canEditCategories {
        Button(action: onAddCategory) {
          Label("Add Category", systemImage: "square.split.1x2.fill")
        }
        .buttonStyle(SecondaryGlassButtonStyle())
        .tint(menuAccent)
      } else {
        Text("Admin managed")
          .font(EditorTypography.body(12, weight: .semibold))
          .foregroundStyle(theme.subtleText)
      }
    }
  }
}

private struct MenuEditorActionLabel: View {
  let title: String
  let subtitle: String
  let icon: String
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Image(systemName: icon)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(accent)
        .frame(width: 34, height: 34)
        .background(accent.opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      Text(title)
        .font(EditorTypography.body(15, weight: .bold))
      Text(subtitle)
        .font(EditorTypography.body(12))
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
    .padding(14)
    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(accent.opacity(0.18), lineWidth: 1)
    }
  }
}

private struct MenuEditorCategoryCard: View {
  let menu: MenuRecord
  let category: MenuCategoryPayload
  let theme: MenuEditorTheme
  let menuAccent: Color
  let canEditCategories: Bool
  let onRename: () -> Void
  let onDelete: () -> Void
  let onSelectItem: (MenuItemPayload) -> Void
  let onToggleEightySix: (MenuItemPayload) -> Void
  let isReordering: Bool
  let onToggleReorder: () -> Void
  let onMoveVisibleItems: (IndexSet, Int) -> Void

  private var visibleItems: [MenuItemPayload] {
    category.items.filter(\.onMenu)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Text(category.label)
            .font(EditorTypography.display(22, weight: .bold))
            .foregroundStyle(theme.titleText)
          if !category.sub.isEmpty {
            Text(category.sub)
              .font(EditorTypography.body(13))
              .foregroundStyle(theme.subtleText)
          }
        }
        Spacer()
        Text("\(visibleItems.count)")
          .font(EditorTypography.body(12, weight: .bold))
          .padding(.vertical, 6)
          .padding(.horizontal, 8)
          .background(menuAccent.opacity(0.15), in: Capsule())
          .foregroundStyle(menuAccent)
        if canEditCategories || visibleItems.count > 1 || isReordering {
          Menu {
            Button(isReordering ? "Done Reordering" : "Reorder Items", action: onToggleReorder)
              .disabled(visibleItems.count < 2 && !isReordering)
            if canEditCategories {
              Button("Rename", action: onRename)
              Button("Delete Category", role: .destructive, action: onDelete)
            }
          } label: {
            Image(systemName: "ellipsis.circle.fill")
              .font(.system(size: 20))
              .foregroundStyle(theme.subtleText)
          }
        }
      }

      if visibleItems.isEmpty {
        Text("No menu items yet.")
          .font(EditorTypography.body(14, weight: .medium))
          .foregroundStyle(theme.subtleText)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.vertical, 6)
      } else {
        MenuEditorSwipeList(
          items: visibleItems,
          theme: theme,
          isReordering: isReordering,
          onSelectItem: onSelectItem,
          onToggleEightySix: onToggleEightySix,
          onMoveVisibleItems: onMoveVisibleItems
        )
      }
    }
    .menuEditorSurface(colors: [theme.categoryTop, theme.categoryBottom], border: theme.categoryBorder)
  }
}

private struct MenuEditorSwipeList: View {
  @State private var measuredRowHeights: [String: CGFloat] = [:]
  let items: [MenuItemPayload]
  let theme: MenuEditorTheme
  let isReordering: Bool
  let onSelectItem: (MenuItemPayload) -> Void
  let onToggleEightySix: (MenuItemPayload) -> Void
  let onMoveVisibleItems: (IndexSet, Int) -> Void

  var body: some View {
    List {
      ForEach(items, id: \.id) { item in
        row(for: item)
        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .background {
          GeometryReader { proxy in
            Color.clear
              .preference(key: MenuEditorRowHeightPreferenceKey.self, value: [item.id: proxy.size.height])
          }
        }
        .moveDisabled(!isReordering || items.count < 2)
      }
      .onMove(perform: onMoveVisibleItems)
    }
    .environment(\.editMode, .constant(isReordering ? .active : .inactive))
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .scrollDisabled(true)
    .environment(\.defaultMinListRowHeight, 1)
    .onPreferenceChange(MenuEditorRowHeightPreferenceKey.self) { measuredRowHeights = $0 }
    .frame(height: listHeight)
  }

  @ViewBuilder
  private func row(for item: MenuItemPayload) -> some View {
    if isReordering {
      EditorItemRow(item: item, theme: theme)
        .contentShape(Rectangle())
    } else {
      Button {
        onSelectItem(item)
      } label: {
        EditorItemRow(item: item, theme: theme)
      }
      .buttonStyle(.plain)
      .swipeActions(edge: .trailing, allowsFullSwipe: true) {
        Button {
          onToggleEightySix(item)
        } label: {
          Label(item.isEightySixed ? "Restore" : "86", systemImage: item.isEightySixed ? "arrow.uturn.backward.circle.fill" : "nosign.app.fill")
        }
        .tint(item.isEightySixed ? theme.successAccent : theme.warningAccent)
      }
    }
  }

  private var listHeight: CGFloat {
    max(estimatedListHeight, measuredListHeight)
  }

  private var measuredListHeight: CGFloat {
    let heights = items.compactMap { measuredRowHeights[$0.id] }
    guard heights.count == items.count else { return 0 }
    return max(heights.reduce(CGFloat.zero, +), 44)
  }

  private var estimatedListHeight: CGFloat {
    max(items.reduce(CGFloat.zero) { partialResult, item in
      partialResult + estimatedRowHeight(for: item)
    }, 44)
  }

  private func estimatedRowHeight(for item: MenuItemPayload) -> CGFloat {
    var height: CGFloat = 72
    if item.showDescription, !item.desc.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      height += estimatedTextHeight(for: item.desc, lineHeight: 17, charactersPerLine: 34)
    }
    if item.showRecipe, !item.recipe.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      height += estimatedTextHeight(for: item.recipe.joined(separator: " • "), lineHeight: 15, charactersPerLine: 38)
    }
    return height
  }

  private func estimatedTextHeight(for text: String, lineHeight: CGFloat, charactersPerLine: Int) -> CGFloat {
    let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else { return 0 }
    let lines = max(1, Int(ceil(Double(normalized.count) / Double(max(charactersPerLine, 1)))))
    return CGFloat(lines) * lineHeight
  }
}

private struct MenuEditorRowHeightPreferenceKey: PreferenceKey {
  static var defaultValue: [String: CGFloat] = [:]

  static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
    value.merge(nextValue(), uniquingKeysWith: { _, next in next })
  }
}

private struct MenuEditorOffMenuRecoveryCard: View {
  let items: [MenuItemPayload]
  let categories: [MenuCategoryPayload]
  let theme: MenuEditorTheme
  let onRestore: (MenuItemPayload, MenuCategoryPayload) -> Void
  let onDelete: (MenuItemPayload) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Off Menu Recovery")
        .font(EditorTypography.display(22, weight: .bold))
        .foregroundStyle(theme.titleText)

      ForEach(items) { item in
        VStack(alignment: .leading, spacing: 10) {
          EditorItemRow(item: item, theme: theme)
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach(categories) { category in
                Button(category.label) {
                  onRestore(item, category)
                }
                .buttonStyle(SecondaryGlassButtonStyle())
              }
              Button("Delete", role: .destructive) {
                onDelete(item)
              }
              .buttonStyle(SecondaryGlassButtonStyle())
            }
          }
        }
      }
    }
    .menuEditorSurface(colors: [theme.recoveryTop, theme.recoveryBottom], border: theme.recoveryBorder)
  }
}

private struct MenuEditorLoadingCard: View {
  let theme: MenuEditorTheme

  var body: some View {
    VStack(spacing: 12) {
      ProgressView()
      Text("Loading editor…")
        .font(EditorTypography.body(15, weight: .medium))
        .foregroundStyle(theme.subtleText)
    }
    .frame(maxWidth: .infinity)
    .menuEditorSurface(colors: [theme.panelTop, theme.panelBottom], border: theme.panelBorder)
  }
}

private struct MenuEditorRefreshOverlay: View {
  let requirement: EditorRefreshRequirement
  let theme: MenuEditorTheme
  let onKeepLocalDrafts: () -> Void
  let onUpdateDrafts: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(requirement.kind.title)
        .font(EditorTypography.display(24, weight: .bold))
        .foregroundStyle(theme.titleText)
      Text(refreshMessage)
        .font(EditorTypography.body(14))
        .foregroundStyle(theme.subtleText)
      if requirement.hasOverlap {
        VStack(alignment: .leading, spacing: 8) {
          Text("Overlapping changes")
            .font(EditorTypography.body(14, weight: .bold))
            .foregroundStyle(theme.titleText)
          if requirement.overlappingLabels.isEmpty {
            Text("This local draft was saved before exact overlap tracking was available, so refresh choices apply to the whole draft.")
              .font(EditorTypography.body(13))
              .foregroundStyle(theme.subtleText)
          } else {
            ForEach(requirement.overlappingLabels, id: \.self) { label in
              Text(label)
                .font(EditorTypography.body(13))
                .foregroundStyle(theme.bodyText)
            }
          }
        }
        .padding(.top, 4)
      }
      HStack {
        if requirement.hasLocalDrafts && requirement.hasOverlap {
          Button("Refresh And Keep My Drafts", action: onKeepLocalDrafts)
            .buttonStyle(PrimaryGlassButtonStyle())

          Button("Refresh And Update Drafts", action: onUpdateDrafts)
            .buttonStyle(SecondaryGlassButtonStyle())
        } else if requirement.hasLocalDrafts {
          Button("Refresh And Keep My Drafts", action: onKeepLocalDrafts)
            .buttonStyle(PrimaryGlassButtonStyle())
        } else {
          Button("Refresh", action: onUpdateDrafts)
            .buttonStyle(PrimaryGlassButtonStyle())
        }
      }
    }
    .frame(maxWidth: 560, alignment: .leading)
    .menuEditorSurface(colors: [theme.previewTop, theme.previewBottom], border: theme.previewBorder)
  }

  private var refreshMessage: String {
    if requirement.hasLocalDrafts {
      if requirement.hasOverlap {
        return "Another client updated this menu. Refresh is required before you continue. Choose whether overlapping drafts should keep your local versions or adopt the incoming server versions."
      }
      return "Another client updated this menu. Refresh is required before you continue. Your non-overlapping local drafts will be reapplied automatically."
    }
    return "Another client updated this menu. Refresh is required before you continue editing."
  }
}

private struct MenuEditorBackground: View {
  let theme: MenuEditorTheme

  var body: some View {
    LinearGradient(colors: [theme.shellTop, theme.shellBottom], startPoint: .topLeading, endPoint: .bottomTrailing)
      .overlay(alignment: .topLeading) {
        Circle()
          .fill(theme.glowPrimary.opacity(0.16))
          .frame(width: 280, height: 280)
          .blur(radius: 28)
          .offset(x: -60, y: -40)
      }
      .overlay(alignment: .bottomTrailing) {
        Circle()
          .fill(theme.glowSecondary.opacity(0.14))
          .frame(width: 240, height: 240)
          .blur(radius: 30)
          .offset(x: 70, y: 110)
      }
      .ignoresSafeArea()
  }
}

private struct MenuEditorTheme {
  let restaurantLabel: String
  let shellTop: Color
  let shellBottom: Color
  let glowPrimary: Color
  let glowSecondary: Color
  let headerTop: Color
  let headerBottom: Color
  let headerBorder: Color
  let panelTop: Color
  let panelBottom: Color
  let panelBorder: Color
  let categoryTop: Color
  let categoryBottom: Color
  let categoryBorder: Color
  let recoveryTop: Color
  let recoveryBottom: Color
  let recoveryBorder: Color
  let previewTop: Color
  let previewBottom: Color
  let previewBorder: Color
  let titleText: Color
  let bodyText: Color
  let subtleText: Color
  let iconTint: Color
  let drinkAccent: Color
  let foodAccent: Color
  let neutralAccent: Color
  let successAccent: Color
  let warningAccent: Color
  let recipeText: Color
  let itemRowFill: Color
  let itemRowBorder: Color
  let priceFill: Color

  static func theme(for menu: MenuRecord) -> MenuEditorTheme {
    if menu.slug.hasPrefix("leroys-lounge") {
      return MenuEditorTheme(
        restaurantLabel: "Leroy's Lounge",
        shellTop: AppPalette.charcoal,
        shellBottom: Color(red: 0.10, green: 0.08, blue: 0.09),
        glowPrimary: AppPalette.oxblood,
        glowSecondary: AppPalette.ember,
        headerTop: Color(red: 0.25, green: 0.15, blue: 0.12),
        headerBottom: Color(red: 0.16, green: 0.10, blue: 0.09),
        headerBorder: AppPalette.ember.opacity(0.45),
        panelTop: Color(red: 0.19, green: 0.14, blue: 0.13).opacity(0.96),
        panelBottom: Color(red: 0.13, green: 0.10, blue: 0.10).opacity(0.98),
        panelBorder: AppPalette.ember.opacity(0.26),
        categoryTop: Color(red: 0.20, green: 0.14, blue: 0.12).opacity(0.98),
        categoryBottom: Color(red: 0.13, green: 0.09, blue: 0.08).opacity(0.98),
        categoryBorder: AppPalette.oxblood.opacity(0.34),
        recoveryTop: Color(red: 0.21, green: 0.16, blue: 0.10).opacity(0.98),
        recoveryBottom: Color(red: 0.15, green: 0.11, blue: 0.08).opacity(0.98),
        recoveryBorder: AppPalette.brass.opacity(0.34),
        previewTop: Color(red: 0.25, green: 0.15, blue: 0.11).opacity(0.98),
        previewBottom: Color(red: 0.16, green: 0.10, blue: 0.08).opacity(0.98),
        previewBorder: AppPalette.brass.opacity(0.38),
        titleText: AppPalette.ivory,
        bodyText: Color(red: 0.93, green: 0.89, blue: 0.84),
        subtleText: Color(red: 0.76, green: 0.68, blue: 0.61),
        iconTint: AppPalette.ember,
        drinkAccent: AppPalette.ember,
        foodAccent: Color(red: 0.49, green: 0.64, blue: 0.37),
        neutralAccent: AppPalette.brass,
        successAccent: AppPalette.success,
        warningAccent: AppPalette.warning,
        recipeText: AppPalette.brass,
        itemRowFill: Color.white.opacity(0.05),
        itemRowBorder: Color.white.opacity(0.08),
        priceFill: AppPalette.oxblood.opacity(0.30)
      )
    }

    return MenuEditorTheme(
      restaurantLabel: "El Roy's Cantina",
      shellTop: Color(red: 0.94, green: 0.88, blue: 0.73),
      shellBottom: Color(red: 0.84, green: 0.74, blue: 0.56),
      glowPrimary: AppPalette.bloodOrange,
      glowSecondary: AppPalette.jade,
      headerTop: Color(red: 0.79, green: 0.44, blue: 0.27),
      headerBottom: Color(red: 0.61, green: 0.29, blue: 0.21),
      headerBorder: AppPalette.jade.opacity(0.45),
      panelTop: Color(red: 0.96, green: 0.90, blue: 0.80).opacity(0.96),
      panelBottom: Color(red: 0.92, green: 0.84, blue: 0.69).opacity(0.96),
      panelBorder: AppPalette.terracotta.opacity(0.24),
      categoryTop: Color(red: 0.97, green: 0.92, blue: 0.82).opacity(0.98),
      categoryBottom: Color(red: 0.90, green: 0.82, blue: 0.67).opacity(0.98),
      categoryBorder: AppPalette.terracotta.opacity(0.30),
      recoveryTop: Color(red: 0.95, green: 0.88, blue: 0.75).opacity(0.98),
      recoveryBottom: Color(red: 0.88, green: 0.79, blue: 0.62).opacity(0.98),
      recoveryBorder: AppPalette.marigold.opacity(0.40),
      previewTop: Color(red: 0.93, green: 0.85, blue: 0.72).opacity(0.98),
      previewBottom: Color(red: 0.86, green: 0.75, blue: 0.58).opacity(0.98),
      previewBorder: AppPalette.jade.opacity(0.34),
      titleText: Color(red: 0.26, green: 0.18, blue: 0.12),
      bodyText: Color(red: 0.30, green: 0.21, blue: 0.15),
      subtleText: Color(red: 0.47, green: 0.35, blue: 0.26),
      iconTint: AppPalette.jade,
      drinkAccent: AppPalette.bloodOrange,
      foodAccent: AppPalette.jade,
      neutralAccent: AppPalette.terracotta,
      successAccent: AppPalette.jade,
      warningAccent: AppPalette.marigold,
      recipeText: AppPalette.bloodOrange,
      itemRowFill: Color.white.opacity(0.34),
      itemRowBorder: Color.white.opacity(0.36),
      priceFill: AppPalette.ivory.opacity(0.72)
    )
  }
}

private enum EditorTypography {
  enum Weight {
    case regular
    case medium
    case semibold
    case bold
  }

  static func display(_ size: CGFloat, weight: Weight = .semibold) -> Font {
    switch weight {
    case .regular:
      return .custom("AvenirNextCondensed-Regular", size: size)
    case .medium:
      return .custom("AvenirNextCondensed-Medium", size: size)
    case .semibold:
      return .custom("AvenirNextCondensed-DemiBold", size: size)
    case .bold:
      return .custom("AvenirNextCondensed-Bold", size: size)
    }
  }

  static func body(_ size: CGFloat, weight: Weight = .regular) -> Font {
    switch weight {
    case .regular:
      return .custom("AvenirNext-Regular", size: size)
    case .medium:
      return .custom("AvenirNext-Medium", size: size)
    case .semibold:
      return .custom("AvenirNext-DemiBold", size: size)
    case .bold:
      return .custom("AvenirNext-Bold", size: size)
    }
  }
}

private struct MenuEditorSurfaceModifier: ViewModifier {
  let colors: [Color]
  let border: Color
  let radius: CGFloat

  func body(content: Content) -> some View {
    content
      .padding(18)
      .background(
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing),
        in: RoundedRectangle(cornerRadius: radius, style: .continuous)
      )
      .overlay {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
          .stroke(border, lineWidth: 1)
      }
      .shadow(color: border.opacity(0.16), radius: 18, y: 8)
  }
}

private extension View {
  func menuEditorSurface(colors: [Color], border: Color, radius: CGFloat = 26) -> some View {
    modifier(MenuEditorSurfaceModifier(colors: colors, border: border, radius: radius))
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

        if draft.itemID != nil, draft.categoryKey != EditableMenuDocument.uncategorizedKey {
          Section("Menu Placement") {
            Button("Move To Off Menu", role: .destructive) {
              moveToOffMenu()
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
    guard let item = makeItem(categoryKey: draft.categoryKey) else { return }
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

  private func moveToOffMenu() {
    let sourceCategoryKey = draft.originalCategoryKey ?? draft.categoryKey
    guard sourceCategoryKey != EditableMenuDocument.uncategorizedKey else {
      dismiss()
      return
    }
    guard let item = makeItem(categoryKey: sourceCategoryKey, validateDuplicateName: false) else { return }
    model.moveItemToOffMenu(item, from: sourceCategoryKey)
    dismiss()
  }

  private func makeItem(categoryKey: String, validateDuplicateName: Bool = true) -> MenuItemPayload? {
    let trimmedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedCategoryKey = categoryKey.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedCategoryKey.isEmpty else {
      model.notice = AppNotice(
        tone: .warning,
        title: "Category Required",
        message: "Select a category for this item before saving."
      )
      return nil
    }
    guard !trimmedName.isEmpty else {
      model.notice = AppNotice(tone: .warning, title: "Name Required", message: "Every menu item needs a non-empty name.")
      return nil
    }
    if validateDuplicateName {
      guard model.canUseItemName(trimmedName, in: trimmedCategoryKey, excluding: draft.itemID) else {
        model.notice = AppNotice(tone: .warning, title: "Duplicate Item", message: "That category already has an item with the same name.")
        return nil
      }
    }

    let recipe = draft.isFoodMenu ? [] : draft.recipeText
      .split(separator: "\n")
      .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }

    return MenuItemPayload(
      id: draft.itemID ?? "local-\(UUID().uuidString.lowercased())",
      name: trimmedName,
      desc: draft.description.trimmingCharacters(in: .whitespacesAndNewlines),
      recipe: recipe,
      price: draft.price.trimmingCharacters(in: .whitespacesAndNewlines),
      isEightySixed: draft.isEightySixed,
      displayOrder: 0,
      onMenu: trimmedCategoryKey != EditableMenuDocument.uncategorizedKey,
      visibility: trimmedCategoryKey == EditableMenuDocument.uncategorizedKey ? "off_menu" : "public",
      upcharges: [],
      showDescription: draft.showDescription,
      showRecipe: draft.isFoodMenu ? false : draft.showRecipe
    )
  }
}
