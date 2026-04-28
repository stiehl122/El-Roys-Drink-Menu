import SwiftUI

struct PublicMenuScreen: View {
  let restaurant: RestaurantRecord
  let menuForType: (String) -> MenuRecord?
  let sessionForMenu: (MenuRecord) -> PublicMenuSession
  @State private var selectedType: String

  init(
    restaurant: RestaurantRecord,
    initialType: String = "drinks",
    menuForType: @escaping (String) -> MenuRecord?,
    sessionForMenu: @escaping (MenuRecord) -> PublicMenuSession
  ) {
    self.restaurant = restaurant
    self.menuForType = menuForType
    self.sessionForMenu = sessionForMenu
    _selectedType = State(initialValue: initialType)
  }

  var body: some View {
    let presentation = RestaurantPresentation.resolve(restaurant: restaurant)
    let session = selectedSession

    Group {
      if presentation.isLeroys {
        LeroysPublicMenuView(
          restaurant: restaurant,
          selectedType: $selectedType,
          menuForType: menuForType,
          sessionForMenu: sessionForMenu,
          presentation: presentation,
          options: menuTypeOptions
        )
      } else {
        standardBody
      }
    }
    .navigationTitle(restaurant.name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: session?.menu.id) {
      guard let session else { return }
      await session.load()
    }
  }

  private var standardBody: some View {
    let session = selectedSession

    return ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 22) {
        heroCard
          .appEntryReveal()

        if let notice = session?.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.05)
        }

        if let payload = session?.payload {
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
    menuForType(selectedType)
  }

  private var selectedSession: PublicMenuSession? {
    selectedMenu.map(sessionForMenu)
  }

  private var menuTypeOptions: [String] {
    RestaurantPresentation.resolve(restaurant: restaurant).orderedMenuTypes
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
              Text(RestaurantPresentation.standard.publicSoldOutLabel)
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

private struct LeroysPublicMenuView: View {
  let restaurant: RestaurantRecord
  @Binding var selectedType: String
  let menuForType: (String) -> MenuRecord?
  let sessionForMenu: (MenuRecord) -> PublicMenuSession
  let presentation: RestaurantPresentation
  let options: [String]

  private var selectedMenu: MenuRecord? {
    menuForType(selectedType)
  }

  private var selectedSession: PublicMenuSession? {
    selectedMenu.map(sessionForMenu)
  }

  var body: some View {
    let session = selectedSession

    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 18) {
        LeroysPublicMenuHero(
          selectedType: $selectedType,
          options: options
        )
        .appEntryReveal()

        if let notice = session?.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
            .appEntryReveal(delay: 0.05)
        }

        if let payload = session?.payload {
          if presentation.showsFeaturedSpecials(selectedType: selectedType),
             !payload.featuredItems.isEmpty {
            LeroysSpecialsSlip(
              items: payload.featuredItems,
              soldOutLabel: presentation.publicSoldOutLabel
            )
              .appEntryReveal(delay: 0.08)
          }

          ForEach(Array(payload.cats.enumerated()), id: \.element.id) { index, category in
            LeroysMenuCategoryCard(
              category: category,
              soldOutLabel: presentation.publicSoldOutLabel
            )
            .appEntryReveal(delay: 0.12 + (Double(index) * 0.035))
          }
        } else {
          AppLoadingCard(
            title: "Loading Leroy's menu",
            subtitle: "Pulling the latest posted board.",
            tint: LeroysPalette.brass
          )
          .appEntryReveal(delay: 0.08)
        }

        Color.clear.frame(height: 24)
      }
      .padding(.horizontal, 20)
      .padding(.top, 20)
      .padding(.bottom, 24)
    }
    .background {
      LeroysChalkboardBackground()
    }
  }
}

private struct LeroysPublicMenuHero: View {
  @Binding var selectedType: String
  let options: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Image("LeroysHeroSign")
        .resizable()
        .scaledToFit()
        .frame(maxWidth: 280)
        .accessibilityLabel("Leroy's Lounge")

      HStack(spacing: 8) {
        ForEach(options, id: \.self) { type in
          let isSelected = selectedType == type
          Button {
            withAnimation(AppMotion.snap) {
              selectedType = type
            }
          } label: {
            Text(type.uppercased())
              .font(.system(size: 13, weight: .bold, design: .monospaced))
              .tracking(2.2)
              .foregroundStyle(isSelected ? LeroysPalette.deepWalnut : LeroysPalette.chalkCream)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 13)
              .background(
                isSelected ? LeroysPalette.nicotineCream : LeroysPalette.board,
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
              )
              .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                  .stroke(LeroysPalette.brass.opacity(isSelected ? 0.72 : 0.34), lineWidth: 1)
              }
          }
          .buttonStyle(.plain)
          .accessibilityLabel("\(type.capitalized) menu")
          .accessibilityValue(isSelected ? "Selected" : "Not selected")
          .accessibilityAddTraits(isSelected ? .isSelected : [])
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .leroysPostedCard(borderOpacity: 0.52)
  }
}

private struct LeroysSpecialsSlip: View {
  let items: [MenuItemPayload]
  let soldOutLabel: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("TONIGHT'S SPECIAL")
        .font(.system(size: 11, weight: .black, design: .monospaced))
        .tracking(2.1)
        .foregroundStyle(LeroysPalette.paperInk.opacity(0.78))

      ForEach(items) { item in
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          HStack(spacing: 8) {
            Text(item.name)
              .font(.system(size: 18, weight: .black, design: .serif))
              .foregroundStyle(LeroysPalette.paperInk)
              .strikethrough(item.isEightySixed)

            if item.isEightySixed {
              Text(soldOutLabel.uppercased())
                .font(.system(size: 8, weight: .black, design: .monospaced))
                .tracking(1.2)
                .padding(.vertical, 3)
                .padding(.horizontal, 6)
                .background(
                  LeroysPalette.fadedBeerRed.opacity(0.14),
                  in: RoundedRectangle(cornerRadius: 5, style: .continuous)
                )
                .overlay {
                  RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .stroke(LeroysPalette.fadedBeerRed.opacity(0.45), lineWidth: 1)
                }
                .foregroundStyle(LeroysPalette.fadedBeerRed)
            }
          }
          Spacer(minLength: 10)
          if !item.price.isEmpty {
            Text(item.price)
              .font(.system(size: 15, weight: .bold, design: .serif))
              .foregroundStyle(LeroysPalette.paperInk)
          }
        }
        if item.showDescription, !item.desc.isEmpty {
          Text(item.desc)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(LeroysPalette.paperInk.opacity(0.72))
        }
      }
    }
    .padding(16)
    .background(LeroysPalette.paper, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .rotationEffect(.degrees(-0.6))
    .shadow(color: .black.opacity(0.22), radius: 12, y: 6)
  }
}

private struct LeroysMenuCategoryCard: View {
  let category: MenuCategoryPayload
  let soldOutLabel: String

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 5) {
        Text(category.label.uppercased())
          .font(.system(size: 23, weight: .black, design: .serif))
          .tracking(1.2)
          .foregroundStyle(LeroysPalette.brass)
        if !category.sub.isEmpty {
          Text(category.sub)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(LeroysPalette.chalkCream.opacity(0.72))
        }
      }

      Rectangle()
        .fill(LeroysPalette.brass.opacity(0.55))
        .frame(height: 1.5)

      ForEach(category.items.filter(\.onMenu)) { item in
        LeroysMenuItemRow(item: item, soldOutLabel: soldOutLabel)
      }
    }
    .leroysPostedCard()
  }
}

private struct LeroysMenuItemRow: View {
  let item: MenuItemPayload
  let soldOutLabel: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        VStack(alignment: .leading, spacing: 5) {
          HStack(spacing: 8) {
            Text(item.name)
              .font(.system(size: 17, weight: .bold, design: .serif))
              .foregroundStyle(LeroysPalette.chalkCream)
              .strikethrough(item.isEightySixed, color: LeroysPalette.fadedBeerRed)

            if item.isEightySixed {
              Text(soldOutLabel.uppercased())
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .tracking(1.4)
                .padding(.vertical, 4)
                .padding(.horizontal, 7)
                .background(
                  LeroysPalette.fadedBeerRed.opacity(0.24),
                  in: RoundedRectangle(cornerRadius: 5, style: .continuous)
                )
                .overlay {
                  RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .stroke(LeroysPalette.fadedBeerRed.opacity(0.68), lineWidth: 1)
                }
                .foregroundStyle(LeroysPalette.chalkCream)
            }
          }

          if item.showDescription, !item.desc.isEmpty {
            Text(item.desc)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .foregroundStyle(LeroysPalette.chalkCream.opacity(0.68))
              .fixedSize(horizontal: false, vertical: true)
          }
        }

        Spacer(minLength: 12)

        Text(item.price.isEmpty ? "--" : item.price)
          .font(.system(size: 15, weight: .black, design: .serif))
          .foregroundStyle(LeroysPalette.brass)
      }

      if item.showRecipe, !item.recipe.isEmpty {
        Text(item.recipe.joined(separator: " • "))
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(LeroysPalette.brass.opacity(0.82))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(.vertical, 10)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(LeroysPalette.chalkCream.opacity(0.14))
        .frame(height: 1)
    }
  }
}
