import SwiftUI

enum AppDestination: Hashable {
  case restaurantHub(RestaurantRecord)
  case publicMenu(RestaurantRecord, initialType: String)
  case editor(MenuRecord)
  case restaurantTools(RestaurantRecord)
  case routePreview(MenuRecord)
}

@main
struct ElRoysManagerApp: App {
  @State private var model = AppModel()

  var body: some Scene {
    WindowGroup {
      RootView(model: model)
        .task {
          await model.start()
        }
    }
  }
}

private struct RootView: View {
  @Bindable var model: AppModel

  var body: some View {
    ZStack {
      AppBackground()

      if model.isLaunching {
        VStack(spacing: 18) {
          Text("El Roy's Manager")
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .foregroundStyle(AppPalette.ink)
          Text("Native SwiftUI manager for Leroy's Lounge and El Roy's Cantina.")
            .font(.title3)
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
          ProgressView()
            .controlSize(.large)
          EnvironmentBadge(environment: model.environment)
        }
        .padding(28)
        .appGlassCard(tint: AppPalette.brand)
        .padding(24)
      } else if model.isAuthenticated {
        NavigationStack {
          RestaurantChooserView(model: model)
            .navigationDestination(for: AppDestination.self) { destination in
              switch destination {
              case .restaurantHub(let restaurant):
                RestaurantHubView(model: model, restaurant: restaurant)
              case .publicMenu(let restaurant, let initialType):
                PublicMenuScreen(model: model, restaurant: restaurant, initialType: initialType)
              case .editor(let menu):
                MenuEditorScreen(model: model, menu: menu)
              case .restaurantTools(let restaurant):
                RestaurantToolsScreen(model: model, restaurant: restaurant)
              case .routePreview(let menu):
                RoutePreviewScreen(model: model, menu: menu)
              }
            }
        }
      } else {
        AuthGateView(model: model)
      }
    }
  }
}
