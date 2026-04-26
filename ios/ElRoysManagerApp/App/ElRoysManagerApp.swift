import SwiftUI

enum AppDestination: Hashable {
  case restaurantHub(RestaurantRecord)
  case publicMenu(RestaurantRecord, initialType: String)
  case editor(MenuRecord)
  case restaurantTools(RestaurantRecord)
  case categoryTools(MenuRecord)
  case restaurantInventory(RestaurantRecord)
  case routePreview(MenuRecord)
}

@main
struct ElRoysManagerApp: App {
  @State private var model = AppModel()

  var body: some Scene {
    WindowGroup {
      RootView(model: model)
        .task { await model.start() }
    }
  }
}

private struct RootView: View {
  @Bindable var model: AppModel

  var body: some View {
    ZStack {
      AppBackground()

      if model.isLaunching {
        LaunchDeck(environment: model.environment)
          .padding(24)
      } else if model.isAuthenticated {
        NavigationStack {
          RestaurantChooserView(model: model)
            .navigationDestination(for: AppDestination.self) { destination in
              switch destination {
              case .restaurantHub(let restaurant):
                RestaurantHubView(model: model, restaurant: restaurant)
              case .publicMenu(let restaurant, let initialType):
                PublicMenuRoute(model: model, restaurant: restaurant, initialType: initialType)
              case .editor(let menu):
                MenuEditorRoute(model: model, menu: menu)
              case .restaurantTools(let restaurant):
                RestaurantToolsRoute(model: model, restaurant: restaurant)
              case .categoryTools(let menu):
                CategoryToolsRoute(model: model, menu: menu)
              case .restaurantInventory(let restaurant):
                RestaurantInventoryRoute(model: model, restaurant: restaurant)
              case .routePreview(let menu):
                RoutePreviewScreen(menu: menu, url: model.exactRoutePreviewURL(for: menu))
              }
            }
        }
        .tint(AppPalette.brand)
      } else {
        AuthGateView(model: model)
      }
    }
  }
}

private struct PublicMenuRoute: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord
  let initialType: String

  var body: some View {
    PublicMenuScreen(
      restaurant: restaurant,
      initialType: initialType,
      menuForType: { type in
        model.menu(for: restaurant.id, type: type)
      },
      sessionForMenu: { menu in
        model.publicMenuSession(for: menu)
      }
    )
  }
}

private struct MenuEditorRoute: View {
  @Bindable var model: AppModel
  let menu: MenuRecord

  var body: some View {
    MenuEditorScreen(session: model.editorSession(for: menu))
  }
}

private struct RestaurantToolsRoute: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord

  var body: some View {
    RestaurantToolsScreen(session: model.restaurantToolsSession(for: restaurant))
  }
}

private struct CategoryToolsRoute: View {
  @Bindable var model: AppModel
  let menu: MenuRecord

  var body: some View {
    RestaurantCategoryManagementScreen(session: model.editorSession(for: menu))
  }
}

private struct RestaurantInventoryRoute: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord

  var body: some View {
    RestaurantInventoryScreen(session: model.restaurantToolsSession(for: restaurant))
  }
}

private struct LaunchDeck: View {
  let environment: AppEnvironment

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      HStack(alignment: .top) {
        AppSectionHeader(
          eyebrow: "Native manager",
          title: "El Roy's\nManager",
          subtitle: "Editorial chrome, native performance, and the same live workspace pipeline used by the production manager.",
          tint: AppPalette.brass
        )
        Spacer(minLength: 16)
        VStack(alignment: .trailing, spacing: 10) {
          EnvironmentBadge(environment: environment)
          ProgressView()
            .controlSize(.large)
            .tint(AppPalette.brand)
        }
      }

      Group {
        AppGlassEffectContainer(spacing: 10) {
          HStack(spacing: 10) {
            capsule(title: "Staff sign-in", tint: AppPalette.sage)
            capsule(title: "Live menu tools", tint: AppPalette.cobalt)
            capsule(title: "Preview routes", tint: AppPalette.brand)
          }
        }
      }
    }
    .appGlassCard(tint: AppPalette.brand, cornerRadius: 38)
    .frame(maxWidth: 620)
    .appEntryReveal()
  }

  private func capsule(title: String, tint: Color) -> some View {
    Text(title.uppercased())
      .font(AppTypography.micro(9, weight: .bold))
      .tracking(1.6)
      .padding(.vertical, 8)
      .padding(.horizontal, 10)
      .background(tint.opacity(0.12), in: Capsule(style: .continuous))
      .overlay {
        Capsule(style: .continuous)
          .stroke(tint.opacity(0.24), lineWidth: 0.7)
      }
      .foregroundStyle(tint)
  }
}
