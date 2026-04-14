import SwiftUI

struct PublicMenuScreen: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord
  @State private var selectedType = "drinks"

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        header

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        if let payload = model.currentPublicMenu {
          if !payload.featuredGroups.isEmpty {
            FeaturedGroupsSection(groups: payload.featuredGroups)
          }

          ForEach(payload.cats) { category in
            VStack(alignment: .leading, spacing: 10) {
              Text(category.label)
                .font(.title3.weight(.bold))
              if !category.sub.isEmpty {
                Text(category.sub)
                  .font(.subheadline)
                  .foregroundStyle(.secondary)
              }
              ForEach(category.items) { item in
                PublicMenuItemRow(item: item)
              }
            }
            .appGlassCard(tint: AppPalette.accent)
          }
        } else {
          ProgressView("Loading menu...")
            .frame(maxWidth: .infinity)
            .padding()
        }
      }
      .padding(24)
    }
    .navigationTitle(restaurant.name)
    .navigationBarTitleDisplayMode(.inline)
    .task {
      await reload()
    }
    .onChange(of: selectedType) { _, _ in
      Task { await reload() }
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Public Menu")
        .font(.system(size: 30, weight: .bold, design: .rounded))
      Picker("Menu", selection: $selectedType) {
        Text("Drinks").tag("drinks")
        Text("Food").tag("food")
      }
      .pickerStyle(.segmented)

      if let menu = selectedMenu {
        NavigationLink(value: AppDestination.routePreview(menu)) {
          Label("Open Exact Route Preview", systemImage: "safari")
            .font(.headline)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(SecondaryGlassButtonStyle())
      }
    }
    .appGlassCard(tint: AppPalette.brand)
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

private struct FeaturedGroupsSection: View {
  let groups: [FeaturedGroup]

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Featured")
        .font(.title3.weight(.bold))
      ForEach(groups) { group in
        VStack(alignment: .leading, spacing: 10) {
          Text(group.name)
            .font(.headline)
          ForEach(group.slots) { slot in
            HStack(alignment: .top, spacing: 12) {
              VStack(alignment: .leading, spacing: 4) {
                Text(slot.item?.name ?? "Featured Item")
                  .font(.subheadline.weight(.semibold))
                if !slot.sellNote.isEmpty {
                  Text(slot.sellNote)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
              }
              Spacer()
              Text(slot.item?.price ?? "")
                .font(.subheadline.monospacedDigit())
            }
          }
        }
      }
    }
    .appGlassCard(tint: AppPalette.warning)
  }
}

private struct PublicMenuItemRow: View {
  let item: MenuItemPayload

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Text(item.name)
            .font(.headline)
            .strikethrough(item.isEightySixed)
          if item.showDescription, !item.desc.isEmpty {
            Text(item.desc)
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
        }
        Spacer()
        Text(item.price)
          .font(.headline.monospacedDigit())
      }

      if item.showRecipe, !item.recipe.isEmpty {
        Text(item.recipe.joined(separator: " • "))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      if item.isEightySixed {
        Text("86'D")
          .font(.caption2.weight(.bold))
          .padding(.vertical, 4)
          .padding(.horizontal, 8)
          .background(AppPalette.danger.opacity(0.16), in: Capsule())
          .foregroundStyle(AppPalette.danger)
      }
    }
    .padding(.vertical, 6)
  }
}
