import SwiftUI

struct RestaurantToolsScreen: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord
  @State private var selectedType = "drinks"

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 22) {
        headerCard
          .appEntryReveal()

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.05)
        }

        if let workspace = currentWorkspace {
          featuredGuidanceCard(workspace: workspace)
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
    .navigationTitle(restaurant.name)
    .navigationBarTitleDisplayMode(.inline)
    .task {
      await model.loadRestaurantTools(for: restaurant.id)
    }
  }

  private var accent: Color {
    selectedType == "food" ? AppPalette.jade : AppPalette.bloodOrange
  }

  private var selectedMenu: MenuRecord? {
    model.menu(for: restaurant.id, type: selectedType)
  }

  private var headerCard: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .top) {
        AppSectionHeader(
          eyebrow: "Restaurant tools",
          title: "Menu tools",
          subtitle: "Featured Specials now live inside each menu's dedicated category, so use menu editing and category management from here.",
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

      if let menu = selectedMenu {
        NavigationLink(value: AppDestination.categoryTools(menu)) {
          AppIslandButtonLabel(
            title: "Manage Categories",
            subtitle: "Open the selected menu's category management screen.",
            systemImage: "square.split.1x2.fill"
          )
        }
        .buttonStyle(.plain)
        .appPillChrome(accent: accent)

        NavigationLink(value: AppDestination.editor(menu)) {
          AppIslandButtonLabel(
            title: "Edit Menu Items",
            subtitle: "Open the selected menu editor to toggle featured specials and reorder items.",
            systemImage: "list.bullet.rectangle"
          )
        }
        .buttonStyle(.plain)
        .appPillChrome(accent: accent, filled: true)
      }
    }
    .appGlassCard(tint: accent, cornerRadius: 38)
  }

  private func featuredGuidanceCard(workspace: MenuWorkspacePayload) -> some View {
    let featuredCategory = workspace.cats.first(where: { $0.key == EditableMenuDocument.featuredSpecialsKey })
    let featuredItems = featuredCategory?.items ?? []
    let enabledItems = featuredItems.filter(\.featuredEnabled)

    return VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 6) {
          AppEyebrow(title: "Featured", tint: accent)
          Text("Current setup")
            .font(AppTypography.display(28, weight: .bold))
            .foregroundStyle(AppPalette.espresso)
        }
        Spacer(minLength: 16)
        Text("\(enabledItems.count) live items")
          .font(AppTypography.micro(9, weight: .bold))
          .tracking(1.6)
          .padding(.vertical, 8)
          .padding(.horizontal, 10)
          .background(accent.opacity(0.10), in: Capsule(style: .continuous))
          .foregroundStyle(accent)
      }

      Text("Use the Featured Specials category for this menu to store reusable deals, then turn on Show in featured strip for the items you want guests to see.")
        .font(AppTypography.body(14, weight: .medium))
        .foregroundStyle(AppPalette.espresso.opacity(0.74))
        .fixedSize(horizontal: false, vertical: true)

      if featuredItems.isEmpty {
        Text("No featured-special items exist on this menu yet.")
          .font(AppTypography.body(14, weight: .semibold))
          .foregroundStyle(AppPalette.ink)
          .padding(14)
          .appFieldChrome(tint: accent, cornerRadius: 22)
      } else {
        VStack(alignment: .leading, spacing: 12) {
          ForEach(featuredItems) { item in
            HStack(alignment: .top, spacing: 12) {
              VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                  Text(item.name)
                    .font(AppTypography.body(16, weight: .bold))
                    .foregroundStyle(AppPalette.ink)
                    .strikethrough(item.isEightySixed)

                  if item.featuredEnabled {
                    Text("LIVE")
                      .font(AppTypography.micro(8, weight: .bold))
                      .tracking(1.4)
                      .padding(.vertical, 5)
                      .padding(.horizontal, 8)
                      .background(accent.opacity(0.10), in: Capsule(style: .continuous))
                      .foregroundStyle(accent)
                  }

                  if item.isEightySixed {
                    Text("86'D")
                      .font(AppTypography.micro(8, weight: .bold))
                      .tracking(1.4)
                      .padding(.vertical, 5)
                      .padding(.horizontal, 8)
                      .background(AppPalette.danger.opacity(0.10), in: Capsule(style: .continuous))
                      .foregroundStyle(AppPalette.danger)
                  }
                }

                if item.showDescription, !item.desc.isEmpty {
                  Text(item.desc)
                    .font(AppTypography.body(13, weight: .medium))
                    .foregroundStyle(AppPalette.espresso.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
                }
              }

              Spacer(minLength: 12)

              if let price = item.price.nilIfBlank {
                Text(price)
                  .font(AppTypography.body(13, weight: .bold))
                  .foregroundStyle(accent)
                  .padding(.vertical, 7)
                  .padding(.horizontal, 10)
                  .background(accent.opacity(0.10), in: Capsule(style: .continuous))
              }
            }
            .padding(15)
            .appFieldChrome(tint: accent, cornerRadius: 22)
          }
        }
      }
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
      subtitle: "Fetching the selected menu workspace and recent history.",
      tint: accent
    )
  }

  private var currentWorkspace: MenuWorkspacePayload? {
    guard let menu = selectedMenu else { return nil }
    return model.currentToolsMenus[menu.id]
  }

  private var currentHistory: HistoryPayload? {
    guard let menu = selectedMenu else { return nil }
    return model.currentToolsHistories[menu.id]
  }
}
