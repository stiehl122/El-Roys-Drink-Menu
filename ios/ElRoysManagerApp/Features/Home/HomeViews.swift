import SwiftUI

struct RestaurantChooserView: View {
  @Bindable var model: AppModel

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        HStack {
          VStack(alignment: .leading, spacing: 8) {
            EnvironmentBadge(environment: model.environment)
            Text("Choose A Place")
              .font(.system(size: 34, weight: .bold, design: .rounded))
              .foregroundStyle(AppPalette.ink)
            Text("The native manager stays fixed to exactly two restaurants and four menus, matching the backend registry.")
              .font(.title3)
              .foregroundStyle(.secondary)
          }
          Spacer()
          Button("Sign Out") {
            model.signOut()
          }
          .buttonStyle(SecondaryGlassButtonStyle())
          .frame(maxWidth: 140)
        }

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        ForEach(model.restaurants) { restaurant in
          NavigationLink(value: AppDestination.restaurantHub(restaurant)) {
            VStack(alignment: .leading, spacing: 8) {
              Text(restaurant.name)
                .font(.title2.weight(.bold))
              Text(restaurant.slug == "leroyslounge" ? "Warm lounge service, drinks-first flow, and food as a second fixed menu." : "Cantina service, food and drinks parity, and restaurant-wide featured tools.")
                .font(.body)
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .appGlassCard(tint: restaurant.slug == "leroyslounge" ? AppPalette.accent : AppPalette.brand)
          }
          .buttonStyle(.plain)
        }
      }
      .padding(24)
    }
    .navigationTitle("Restaurants")
  }
}

struct RestaurantHubView: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        Text(restaurant.name)
          .font(.system(size: 32, weight: .bold, design: .rounded))
          .foregroundStyle(AppPalette.ink)

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        NavigationLink(value: AppDestination.publicMenu(restaurant)) {
          HubCard(title: "View Public Menu", subtitle: "Native menu rendering with a switch to exact route preview.", symbol: "menucard.fill")
        }
        .buttonStyle(.plain)

        if let drinks = model.menu(for: restaurant.id, type: "drinks") {
          NavigationLink(value: AppDestination.editor(drinks)) {
            HubCard(title: "Edit Drinks", subtitle: "Drafts, live save, send preview, off-menu recovery, and barcode lookup.", symbol: "wineglass.fill")
          }
          .buttonStyle(.plain)
        }

        if let food = model.menu(for: restaurant.id, type: "food") {
          NavigationLink(value: AppDestination.editor(food)) {
            HubCard(title: "Edit Food", subtitle: "Food-first editor semantics with recipe controls hidden by default.", symbol: "fork.knife")
          }
          .buttonStyle(.plain)
        }

        NavigationLink(value: AppDestination.restaurantTools(restaurant)) {
          HubCard(title: "Restaurant Tools", subtitle: "Featured items plus per-menu recent history for this location.", symbol: "star.circle.fill")
        }
        .buttonStyle(.plain)
      }
      .padding(24)
    }
    .navigationTitle(restaurant.name)
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct HubCard: View {
  let title: String
  let subtitle: String
  let symbol: String

  var body: some View {
    HStack(alignment: .top, spacing: 16) {
      Image(systemName: symbol)
        .font(.system(size: 24, weight: .semibold))
        .foregroundStyle(AppPalette.brand)
        .frame(width: 40, height: 40)
        .background(AppPalette.brand.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      VStack(alignment: .leading, spacing: 6) {
        Text(title)
          .font(.title3.weight(.semibold))
          .foregroundStyle(AppPalette.ink)
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      Spacer()
      Image(systemName: "chevron.right")
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .appGlassCard(tint: AppPalette.brand)
  }
}
