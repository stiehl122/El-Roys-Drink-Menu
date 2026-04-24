import SwiftUI

struct PublicMenuScreen: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord
  @State private var selectedType: String

  init(model: AppModel, restaurant: RestaurantRecord, initialType: String = "drinks") {
    self.model = model
    self.restaurant = restaurant
    _selectedType = State(initialValue: initialType)
  }

  var body: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 22) {
        heroCard
          .appEntryReveal()

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.05)
        }

        if let payload = model.currentPublicMenu {
          summaryStrip(payload: payload)
            .appEntryReveal(delay: 0.08)

          if !payload.featuredItems.isEmpty {
            FeaturedItemsSection(items: payload.featuredItems, accent: accent)
              .appEntryReveal(delay: 0.12)
          }

          ForEach(Array(payload.cats.enumerated()), id: \.element.id) { index, category in
            PublicMenuCategoryCard(category: category, accent: accent)
              .appEntryReveal(delay: 0.16 + (Double(index) * 0.04))
          }
        } else {
          loadingCard
            .appEntryReveal(delay: 0.10)
        }

        Color.clear.frame(height: 28)
      }
      .padding(.horizontal, 24)
      .padding(.top, 24)
      .padding(.bottom, 24)
    }
    .navigationTitle(restaurant.name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: selectedType) {
      await reload()
    }
  }

  private var accent: Color {
    selectedType == "food" ? AppPalette.jade : AppPalette.bloodOrange
  }

  private var heroCard: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .top) {
        AppSectionHeader(
          eyebrow: "Public menu preview",
          title: restaurant.name,
          subtitle: selectedType == "food"
            ? "Review the guest-facing food presentation with the same editorial spacing and hierarchy customers will see."
            : "Review the guest-facing drinks presentation with premium card rhythm, featured highlights, and live menu structure.",
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
        NavigationLink(value: AppDestination.routePreview(menu)) {
          AppIslandButtonLabel(
            title: "Open exact route preview",
            subtitle: "Verify the deployed path before publishing or sharing.",
            systemImage: "arrow.up.right"
          )
        }
        .buttonStyle(.plain)
        .appPillChrome(accent: accent, filled: true)
      }
    }
    .appGlassCard(tint: accent, cornerRadius: 38)
  }

  private func summaryStrip(payload: PublicMenuPayload) -> some View {
    let itemCount = payload.cats.reduce(into: 0) { partialResult, category in
      partialResult += category.items.filter(\.onMenu).count
    }

    return HStack(spacing: 10) {
      metricPill(title: "sections", value: "\(payload.cats.count)")
      metricPill(title: "items", value: "\(itemCount)")
      metricPill(title: "featured", value: "\(payload.featuredItems.count)")
    }
  }

  private func metricPill(title: String, value: String) -> some View {
    AppMetricPill(title: title, value: value, accent: accent)
  }

  private var loadingCard: some View {
    AppLoadingCard(
      title: "Loading public menu",
      subtitle: "Pulling the live guest-facing sections, featured specials, and pricing.",
      tint: accent
    )
  }

  private var selectedMenu: MenuRecord? {
    model.menu(for: restaurant.id, type: selectedType)
  }

  private func reload() async {
    if let menu = selectedMenu {
      await model.loadPublicMenu(menuId: menu.id)
    }
  }
}

private struct FeaturedItemsSection: View {
  let items: [MenuItemPayload]
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        AppSectionHeader(
          eyebrow: "Featured",
          title: "Current specials",
          tint: accent
        )
        Spacer(minLength: 16)
      }

      ForEach(items) { item in
        VStack(alignment: .leading, spacing: 10) {
          PublicMenuItemRow(item: item, accent: accent)
        }
        .appGlassCard(tint: accent, cornerRadius: 30)
      }
    }
  }
}

private struct PublicMenuCategoryCard: View {
  let category: MenuCategoryPayload
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 6) {
        AppEyebrow(title: category.label, tint: accent)
        if !category.sub.isEmpty {
          Text(category.sub)
            .font(AppTypography.body(14, weight: .medium))
            .foregroundStyle(AppPalette.espresso.opacity(0.72))
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      ForEach(category.items.filter(\.onMenu)) { item in
        PublicMenuItemRow(item: item, accent: accent)
      }
    }
    .appGlassCard(tint: accent, cornerRadius: 34)
  }
}

private struct PublicMenuItemRow: View {
  let item: MenuItemPayload
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 8) {
            Text(item.name)
              .font(AppTypography.body(16, weight: .bold))
              .foregroundStyle(AppPalette.ink)
              .strikethrough(item.isEightySixed)
            if item.isEightySixed {
              Text("86'D")
                .font(AppTypography.micro(9, weight: .bold))
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
              .foregroundStyle(AppPalette.espresso.opacity(0.70))
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer(minLength: 12)
        Text(item.price.isEmpty ? "—" : item.price)
          .font(AppTypography.body(13, weight: .bold))
          .foregroundStyle(accent)
          .padding(.vertical, 7)
          .padding(.horizontal, 10)
          .background(accent.opacity(0.10), in: Capsule(style: .continuous))
      }

      if item.showRecipe, !item.recipe.isEmpty {
        Text(item.recipe.joined(separator: " • "))
          .font(AppTypography.body(12, weight: .semibold))
          .foregroundStyle(accent.opacity(0.86))
      }
    }
    .padding(15)
    .appFieldChrome(tint: accent, cornerRadius: 22)
  }
}
