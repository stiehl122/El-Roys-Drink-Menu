import SwiftUI

struct RestaurantToolsScreen: View {
  @Bindable var session: RestaurantToolsSession
  @State private var selectedType = "drinks"
  @State private var showingCatalog = false
  @State private var noteEditingSlot: FeaturedSlot?
  @State private var noteText = ""

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 22) {
        headerCard
          .appEntryReveal()

        if let notice = session.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.05)
        }

        if let workspace = currentWorkspace {
          featuredLineupCard(workspace: workspace)
            .appEntryReveal(delay: 0.08)
        } else {
          loadingCard
            .appEntryReveal(delay: 0.08)
        }

        if let history = currentHistory, !history.logs.isEmpty {
          historyCard(history)
            .appEntryReveal(delay: 0.12)
        }

        Color.clear.frame(height: 24)
      }
      .padding(.horizontal, 24)
      .padding(.top, 24)
      .padding(.bottom, 24)
    }
    .navigationTitle(session.restaurant.name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: session.restaurant.id) {
      await session.load()
    }
    .sheet(isPresented: $showingCatalog) {
      FeaturedCatalogSheet(
        items: currentWorkspace?.restaurantTools?.siblingCatalog ?? [],
        accent: accent,
        onSelect: { item in
          Task {
            await session.saveFeaturedAction(action: "add", itemId: item.id)
            showingCatalog = false
          }
        }
      )
    }
    .alert("Edit Sell Note", isPresented: Binding(
      get: { noteEditingSlot != nil },
      set: { if !$0 { noteEditingSlot = nil } }
    )) {
      TextField("Sell note", text: $noteText)
      Button("Save") {
        if let slot = noteEditingSlot {
          Task { await session.saveFeaturedAction(action: "note", slotId: slot.id, note: noteText) }
        }
      }
      Button("Cancel", role: .cancel) {}
    }
  }

  private var accent: Color {
    selectedType == "food" ? AppPalette.jade : AppPalette.bloodOrange
  }

  private var headerCard: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .top) {
        AppSectionHeader(
          eyebrow: "Restaurant tools",
          title: "Featured lineup control",
          subtitle: "Curate the floor-facing spotlight list, manage sell notes, and confirm the final sequence before service.",
          tint: accent
        )
        Spacer(minLength: 16)
      }

      AppSegmentedControl(
        options: ["drinks", "food"],
        selection: $selectedType,
        accent: accent,
        title: { $0.capitalized }
      )

      if let menu = session.menu(for: selectedType) {
        NavigationLink(value: AppDestination.categoryTools(menu)) {
          AppIslandButtonLabel(
            title: "Manage Categories",
            subtitle: "Add, rename, delete, and reorder \(menu.displayTypeLabel.lowercased()) categories.",
            systemImage: "square.split.1x2.fill"
          )
        }
        .buttonStyle(.plain)
        .appPillChrome(accent: accent)
      }

      Button {
        showingCatalog = true
      } label: {
        AppIslandButtonLabel(
          title: "Add from catalog",
          subtitle: "Pull an item from the sibling catalog into the featured sequence.",
          systemImage: "plus"
        )
      }
      .buttonStyle(.plain)
      .appPillChrome(accent: accent, filled: true)
      .disabled(currentWorkspace == nil)
      .opacity(currentWorkspace == nil ? 0.55 : 1)
    }
    .appGlassCard(tint: accent, cornerRadius: 38)
  }

  private func featuredLineupCard(workspace: MenuWorkspacePayload) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 6) {
          AppEyebrow(title: "Featured", tint: accent)
          Text("Current lineup")
            .font(AppTypography.display(28, weight: .bold))
            .foregroundStyle(AppPalette.espresso)
        }
        Spacer(minLength: 16)
        Text("\(workspace.restaurantTools?.featuredGroups.reduce(0) { $0 + $1.slots.count } ?? 0) live slots")
          .font(AppTypography.micro(9, weight: .bold))
          .tracking(1.6)
          .padding(.vertical, 8)
          .padding(.horizontal, 10)
          .background(accent.opacity(0.10), in: Capsule(style: .continuous))
          .foregroundStyle(accent)
      }

      ForEach(workspace.restaurantTools?.featuredGroups ?? []) { group in
        VStack(alignment: .leading, spacing: 12) {
          HStack {
            Text(group.name)
              .font(AppTypography.body(18, weight: .bold))
              .foregroundStyle(AppPalette.ink)
            Spacer(minLength: 12)
            Text("\(group.slots.count) items")
              .font(AppTypography.micro(9, weight: .bold))
              .tracking(1.4)
              .foregroundStyle(AppPalette.espresso.opacity(0.68))
          }

          ForEach(group.slots) { slot in
            FeaturedSlotCard(
              slot: slot,
              accent: accent,
              onMoveUp: {
                Task { await session.saveFeaturedAction(action: "move", slotId: slot.id, direction: -1) }
              },
              onMoveDown: {
                Task { await session.saveFeaturedAction(action: "move", slotId: slot.id, direction: 1) }
              },
              onEditNote: {
                noteEditingSlot = slot
                noteText = slot.sellNote
              },
              onRemove: {
                Task { await session.saveFeaturedAction(action: "remove", slotId: slot.id) }
              }
            )
          }
        }
        .appGlassCard(tint: accent, cornerRadius: 30)
      }

      AppIslandActionButton(
        title: "Confirm featured lineup",
        subtitle: "Lock the final sell sequence for service.",
        systemImage: "checkmark",
        accent: accent,
        action: {
          Task { await session.saveFeaturedAction(action: "confirm") }
        }
      )
    }
    .appGlassCard(tint: AppPalette.brass, cornerRadius: 36)
  }

  private func historyCard(_ history: HistoryPayload) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      AppEyebrow(title: "History", tint: AppPalette.cobalt)
      Text("Recent changes")
        .font(AppTypography.display(26, weight: .bold))
        .foregroundStyle(AppPalette.espresso)

      ForEach(Array(history.logs.prefix(6).enumerated()), id: \.element.id) { index, entry in
        VStack(alignment: .leading, spacing: 6) {
          HStack(spacing: 8) {
            Text(entry.userName.nilIfBlank ?? "Unknown")
              .font(AppTypography.body(15, weight: .bold))
              .foregroundStyle(AppPalette.ink)
            Text(entry.createdAt)
              .font(AppTypography.micro(9, weight: .bold))
              .tracking(1.3)
              .foregroundStyle(AppPalette.espresso.opacity(0.58))
          }
          Text(entry.message.isEmpty ? "No message provided." : entry.message)
            .font(AppTypography.body(13, weight: .medium))
            .foregroundStyle(AppPalette.espresso.opacity(0.72))
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .appFieldChrome(tint: AppPalette.cobalt, cornerRadius: 22)

        if index < min(history.logs.count, 6) - 1 {
          Rectangle()
            .fill(AppPalette.cobalt.opacity(0.14))
            .frame(height: 1)
        }
      }
    }
    .appGlassCard(tint: AppPalette.cobalt, cornerRadius: 34)
  }

  private var loadingCard: some View {
    AppLoadingCard(
      title: "Loading restaurant tools",
      subtitle: "Fetching the featured lineup, catalog, and recent service history.",
      tint: accent
    )
  }

  private var currentWorkspace: MenuWorkspacePayload? {
    session.workspace(for: selectedType)
  }

  private var currentHistory: HistoryPayload? {
    session.history(for: selectedType)
  }
}

private struct FeaturedSlotCard: View {
  let slot: FeaturedSlot
  let accent: Color
  let onMoveUp: () -> Void
  let onMoveDown: () -> Void
  let onEditNote: () -> Void
  let onRemove: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 6) {
          HStack(spacing: 8) {
            Text(slot.item?.name ?? "Featured item")
              .font(AppTypography.body(16, weight: .bold))
              .foregroundStyle(AppPalette.ink)
              if let confirmedAt = slot.confirmedAt?.nilIfBlank {
              Text("CONFIRMED")
                .font(AppTypography.micro(8, weight: .bold))
                .tracking(1.4)
                .padding(.vertical, 5)
                .padding(.horizontal, 8)
                .background(AppPalette.success.opacity(0.10), in: Capsule(style: .continuous))
                .foregroundStyle(AppPalette.success)
                .help(confirmedAt)
            }
          }
          if !slot.sellNote.isEmpty {
            Text(slot.sellNote)
              .font(AppTypography.body(13, weight: .medium))
              .foregroundStyle(AppPalette.espresso.opacity(0.72))
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer(minLength: 12)
        if let price = slot.item?.price.nilIfBlank {
          Text(price)
            .font(AppTypography.body(13, weight: .bold))
            .foregroundStyle(accent)
            .padding(.vertical, 7)
            .padding(.horizontal, 10)
            .background(accent.opacity(0.10), in: Capsule(style: .continuous))
        }
      }

      HStack(spacing: 8) {
        toolButton(title: "Up", icon: "arrow.up", accent: accent, action: onMoveUp)
        toolButton(title: "Down", icon: "arrow.down", accent: accent, action: onMoveDown)
        toolButton(title: "Note", icon: "pencil", accent: AppPalette.brass, action: onEditNote)
        toolButton(title: "Remove", icon: "trash", accent: AppPalette.danger, action: onRemove)
      }
    }
    .padding(15)
    .appFieldChrome(tint: accent, cornerRadius: 22)
  }

  private func toolButton(title: String, icon: String, accent: Color, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Label(title, systemImage: icon)
        .font(AppTypography.micro(9, weight: .bold))
        .tracking(1.2)
        .padding(.horizontal, 11)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.plain)
    .foregroundStyle(accent)
    .appPillChrome(accent: accent, filled: false)
  }
}

private struct FeaturedCatalogSheet: View {
  @Environment(\.dismiss) private var dismiss
  let items: [SiblingCatalogItem]
  let accent: Color
  let onSelect: (SiblingCatalogItem) -> Void

  var body: some View {
    NavigationStack {
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(items) { item in
            Button {
              onSelect(item)
            } label: {
              HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                  Text(item.name)
                    .font(AppTypography.body(16, weight: .bold))
                    .foregroundStyle(AppPalette.ink)
                  Text("\(item.menuLabel) • \(item.cat)")
                    .font(AppTypography.body(13, weight: .medium))
                    .foregroundStyle(AppPalette.espresso.opacity(0.68))
                  if !item.onMenu {
                    Text("Off menu")
                      .font(AppTypography.micro(8, weight: .bold))
                      .tracking(1.4)
                      .foregroundStyle(AppPalette.warning)
                  }
                }
                Spacer(minLength: 12)
                Image(systemName: "arrow.up.right")
                  .font(.system(size: 14, weight: .semibold))
                  .foregroundStyle(accent)
              }
              .padding(15)
            }
            .buttonStyle(.plain)
            .appFieldChrome(tint: accent, cornerRadius: 22)
          }
        }
        .padding(24)
      }
      .background {
        AppBackground()
          .ignoresSafeArea()
      }
      .navigationTitle("Add Featured Item")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Close") { dismiss() }
        }
      }
    }
  }
}
