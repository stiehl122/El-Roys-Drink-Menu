import SwiftUI

struct MenuEditorScreen: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var model: AppModel
  let menu: MenuRecord
  @State private var addCategoryName = ""
  @State private var showingAddCategory = false
  @State private var editingDraft = EditableItemDraft()
  @State private var showingItemSheet = false
  @State private var renameTarget: MenuCategoryPayload?
  @State private var renameText = ""
  @State private var showingDiscardDraftConfirm = false

  private var theme: MenuEditorTheme {
    .theme(for: menu)
  }

  private var menuAccent: Color {
    menu.isFoodMenu ? theme.foodAccent : theme.drinkAccent
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
            onAddCategory: { showingAddCategory = true },
            onSaveQuietly: saveQuietly,
            onSendUpdate: loadSendPreview,
            onDiscardDraft: { showingDiscardDraftConfirm = true }
          )

          if let preview = model.currentEditorPreview {
            PublishPreviewCard(model: model, preview: preview, theme: theme, menuAccent: menuAccent, onPublish: publishChanges)
          }

          if let document = model.currentEditorDocument {
            ForEach(Array(document.visibleCategories.enumerated()), id: \.offset) { _, category in
              MenuEditorCategoryCard(
                menu: menu,
                category: category,
                theme: theme,
                menuAccent: menuAccent,
                onRename: {
                  renameTarget = category
                  renameText = category.label
                },
                onDelete: {
                  model.deleteCategory(key: category.key)
                },
                onSelectItem: { item in
                  editingDraft = EditableItemDraft(item: item, categoryKey: category.key, isFoodMenu: menu.isFoodMenu)
                  showingItemSheet = true
                },
                onMoveOffMenu: { item in
                  model.moveItemToOffMenu(itemID: item.id, from: category.key)
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
    .task(id: menu.id) {
      await model.loadEditor(menuId: menu.id)
    }
    .task(id: menu.id) {
      await model.monitorEditorRemoteChanges(for: menu.id)
    }
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active else { return }
      Task { await model.checkForRemoteMenuUpdate(menuId: menu.id, force: true) }
    }
    .onChange(of: model.editorRefreshRequirement != nil) { _, required in
      guard required else { return }
      showingItemSheet = false
      showingAddCategory = false
      renameTarget = nil
    }
    .sheet(isPresented: Binding(
      get: { showingItemSheet && model.editorRefreshRequirement == nil },
      set: { showingItemSheet = $0 }
    )) {
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
      showingItemSheet = true
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
    Task { await model.loadPublishPreview() }
  }

  private func publishChanges() {
    Task { await model.publishSelectedChanges() }
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

private struct PublishPreviewCard: View {
  @Bindable var model: AppModel
  let preview: MenuPreviewPayload
  let theme: MenuEditorTheme
  let menuAccent: Color
  let onPublish: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(previewTitle)
        .font(EditorTypography.display(20, weight: .bold))
        .foregroundStyle(theme.titleText)
      if !preview.patchMessage.isEmpty {
        Text(preview.patchMessage)
          .font(EditorTypography.body(14))
          .foregroundStyle(theme.subtleText)
      }

      if preview.hasNotificationChanges {
        VStack(alignment: .leading, spacing: 6) {
          Text("Will Send")
            .font(EditorTypography.body(14, weight: .bold))
            .foregroundStyle(theme.titleText)
          ForEach(Array(preview.sections.enumerated()), id: \.offset) { _, section in
            VStack(alignment: .leading, spacing: 6) {
              Text(section.label)
                .font(EditorTypography.body(13, weight: .semibold))
                .foregroundStyle(theme.subtleText)
              ForEach(Array(section.changes.enumerated()), id: \.offset) { _, change in
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
        .padding(12)
        .background(theme.itemRowFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

        if !uncheckedChanges.isEmpty {
          VStack(alignment: .leading, spacing: 6) {
            Text("Will Clear Without Sending")
              .font(EditorTypography.body(14, weight: .bold))
              .foregroundStyle(theme.titleText)
            ForEach(Array(uncheckedChanges.enumerated()), id: \.offset) { _, change in
              Text("\(change.sectionLabel): \(change.text)")
                .font(EditorTypography.body(13))
                .foregroundStyle(theme.bodyText)
            }
          }
          .padding(12)
          .background(theme.itemRowFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
      }

      if !preview.saveOnlyChanges.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Will Save Only")
            .font(EditorTypography.body(14, weight: .bold))
            .foregroundStyle(theme.titleText)
          ForEach(Array(preview.saveOnlyChanges.enumerated()), id: \.offset) { _, change in
            Text(change.label.nilIfBlank ?? change.message)
              .font(EditorTypography.body(13))
              .foregroundStyle(theme.bodyText)
          }
        }
        .padding(12)
        .background(theme.itemRowFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      }

      Button(actionButtonTitle) {
        onPublish()
      }
      .buttonStyle(PrimaryGlassButtonStyle())
      .disabled(!model.canPublishRemotely)
    }
    .menuEditorSurface(colors: [theme.previewTop, theme.previewBottom], border: theme.previewBorder)
  }

  private var previewTitle: String {
    if !preview.hasNotificationChanges {
      return "Save Preview"
    }
    return model.hasLocalDraftChanges ? "Save & Send Preview" : "Send Preview"
  }

  private var actionButtonTitle: String {
    if !preview.hasNotificationChanges {
      return "Save"
    }
    return model.hasLocalDraftChanges ? "Save & Send" : "Send"
  }

  private var uncheckedChanges: [PreviewChange] {
    preview.sections
      .flatMap(\.changes)
      .filter { !model.selectedPreviewChangeIDs.contains($0.id) }
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
        Text(menu.displayTypeLabel)
          .font(EditorTypography.body(12, weight: .bold))
          .padding(.vertical, 8)
          .padding(.horizontal, 10)
          .background(menuAccent.opacity(0.18), in: Capsule())
          .foregroundStyle(menuAccent)
      }

      HStack(alignment: .top, spacing: 10) {
        MenuEditorBadge(
          label: menuStatusLabel,
          fill: hasServerUnsentChanges ? menuAccent.opacity(0.16) : theme.successAccent.opacity(0.18),
          text: hasServerUnsentChanges ? menuAccent : theme.successAccent
        )
        MenuEditorBadge(
          label: hasLocalDraftChanges ? "Drafting locally" : "No local drafts",
          fill: hasLocalDraftChanges ? theme.warningAccent.opacity(0.18) : theme.neutralAccent.opacity(0.16),
          text: hasLocalDraftChanges ? theme.warningAccent : theme.neutralAccent
        )
        MenuEditorBadge(
          label: hasLiveMenuChanges ? "Live menu behind working copy" : "Live menu aligned",
          fill: hasLiveMenuChanges ? menuAccent.opacity(0.16) : theme.successAccent.opacity(0.18),
          text: hasLiveMenuChanges ? menuAccent : theme.successAccent
        )
      }

      Text(workflowSummary)
        .font(EditorTypography.body(13, weight: .medium))
        .foregroundStyle(theme.bodyText)
    }
    .menuEditorSurface(colors: [theme.headerTop, theme.headerBottom], border: theme.headerBorder)
  }

  private var workflowSummary: String {
    if hasLocalDraftChanges && hasServerUnsentChanges {
      return "This device has unsaved local edits, and the server queue still has unsent menu changes."
    }
    if hasLocalDraftChanges {
      return "Your draft is local to this device until you Save Quietly or Save & Send."
    }
    if hasServerUnsentChanges {
      return "The menu is live with unsent queue work. Use Send to notify channels or clear remaining queue groups."
    }
    if hasLiveMenuChanges {
      return "Your working copy differs from live. Save Quietly to stage it live without sending."
    }
    return "Live state and notification baseline are aligned."
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
  let onAddCategory: () -> Void
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

        Button(action: onAddCategory) {
          MenuEditorActionLabel(title: "Add Category", subtitle: "Create a new section", icon: "square.split.1x2.fill", accent: menuAccent)
        }
        .buttonStyle(.plain)
      }

      HStack(spacing: 12) {
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

        Button(action: onSendUpdate) {
          MenuEditorActionLabel(
            title: model.hasLocalDraftChanges ? "Save & Send" : "Send",
            subtitle: model.currentEditorPreview == nil
              ? (model.hasLocalDraftChanges
                  ? "Save live, then choose what to send or clear"
                  : "Choose which unsent queue groups to send or clear")
              : "Preview loaded below",
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

        NavigationLink(value: AppDestination.routePreview(menu)) {
          MenuEditorActionLabel(title: "Exact Route", subtitle: "See the true public route", icon: "safari.fill", accent: theme.neutralAccent)
        }
        .buttonStyle(.plain)
      }
    }
    .menuEditorSurface(colors: [theme.panelTop, theme.panelBottom], border: theme.panelBorder)
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
  let onRename: () -> Void
  let onDelete: () -> Void
  let onSelectItem: (MenuItemPayload) -> Void
  let onMoveOffMenu: (MenuItemPayload) -> Void

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
        Menu {
          Button("Rename", action: onRename)
          Button("Delete Category", role: .destructive, action: onDelete)
        } label: {
          Image(systemName: "ellipsis.circle.fill")
            .font(.system(size: 20))
            .foregroundStyle(theme.subtleText)
        }
      }

      ForEach(Array(visibleItems.enumerated()), id: \.offset) { _, item in
        Button {
          onSelectItem(item)
        } label: {
          EditorItemRow(item: item, theme: theme)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing) {
          Button(role: .destructive) {
            onMoveOffMenu(item)
          } label: {
            Label("Off Menu", systemImage: "tray.and.arrow.down.fill")
          }
        }
      }
    }
    .menuEditorSurface(colors: [theme.categoryTop, theme.categoryBottom], border: theme.categoryBorder)
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

      ForEach(Array(items.enumerated()), id: \.offset) { _, item in
        VStack(alignment: .leading, spacing: 10) {
          EditorItemRow(item: item, theme: theme)
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach(Array(categories.enumerated()), id: \.offset) { _, category in
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
            ForEach(Array((model.currentEditorDocument?.visibleCategories ?? []).enumerated()), id: \.offset) { _, category in
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
    let trimmedCategoryKey = draft.categoryKey.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedCategoryKey.isEmpty else {
      model.notice = AppNotice(
        tone: .warning,
        title: "Category Required",
        message: "Select a category for this item before saving."
      )
      return
    }
    guard !trimmedName.isEmpty else {
      model.notice = AppNotice(tone: .warning, title: "Name Required", message: "Every menu item needs a non-empty name.")
      return
    }
    guard model.canUseItemName(trimmedName, in: trimmedCategoryKey, excluding: draft.itemID) else {
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
      onMenu: trimmedCategoryKey != EditableMenuDocument.uncategorizedKey,
      visibility: trimmedCategoryKey == EditableMenuDocument.uncategorizedKey ? "off_menu" : "public",
      upcharges: [],
      showDescription: draft.showDescription,
      showRecipe: draft.isFoodMenu ? false : draft.showRecipe
    )
    model.upsertItem(item, categoryKey: trimmedCategoryKey, originalCategoryKey: draft.originalCategoryKey)

    if draft.keepAdding {
      let preservedCategory = trimmedCategoryKey
      let isFood = draft.isFoodMenu
      draft = EditableItemDraft()
      draft.categoryKey = preservedCategory
      draft.isFoodMenu = isFood
    } else {
      dismiss()
    }
  }
}
