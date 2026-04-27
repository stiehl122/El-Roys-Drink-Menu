import UIKit
import SwiftUI

private let homeBottomNavigationClearance: CGFloat = 132

// MARK: - Public entry points

struct RestaurantChooserView: View {
  @Bindable var model: AppModel
  private let initialRestaurantSlug: String?
  @State private var selectedRestaurantSlug: String
  @State private var expandedUpdateID: String?
  @State private var homeData = HomeDerivedData.empty
  @Namespace private var switcherNamespace
  @Namespace private var bottomNavNamespace

  private struct HomeDerivedData {
    var updates: [HomeUpdate]
    var featuredSpecials: [String]
    var drinksCount: Int?
    var foodCount: Int?
    var hasLoadedRestaurantData: Bool
    var drinksEditorDestination: AppDestination?
    var foodEditorDestination: AppDestination?

    static let empty = HomeDerivedData(
      updates: [],
      featuredSpecials: [],
      drinksCount: nil,
      foodCount: nil,
      hasLoadedRestaurantData: false,
      drinksEditorDestination: nil,
      foodEditorDestination: nil
    )
  }

  init(model: AppModel, initialRestaurantSlug: String? = nil) {
    self.model = model
    self.initialRestaurantSlug = initialRestaurantSlug
    _selectedRestaurantSlug = State(initialValue: initialRestaurantSlug ?? "leroys-lounge")
  }

  var body: some View {
    let theme = activeTheme
    let restaurant = selectedRestaurant
    let currentHomeData = homeData

    ZStack {
      HomeBackground(theme: theme)

      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: 20) {
          HomeHeader(
            theme: theme,
            environment: model.environment,
            onRequestAccountDeletion: { Task { await model.requestAccountDeletion() } },
            onSignOut: { model.signOut() }
          )

          HomeRestaurantSwitcher(
            options: restaurantSwitcherOptions,
            selectedSlug: selectedRestaurantSlug,
            theme: theme,
            namespace: switcherNamespace,
            onSelect: { slug in
              withAnimation(AppMotion.settle) {
                selectedRestaurantSlug = slug
                expandedUpdateID = nil
              }
            }
          )

          HomeRecentUpdatesCard(
            updates: currentHomeData.updates,
            expandedUpdateID: $expandedUpdateID,
            hasLoadedData: currentHomeData.hasLoadedRestaurantData,
            theme: theme
          )

          HomeEditGrid(
            theme: theme,
            drinksCount: currentHomeData.drinksCount,
            foodCount: currentHomeData.foodCount,
            drinksDestination: currentHomeData.drinksEditorDestination,
            foodDestination: currentHomeData.foodEditorDestination
          )

          HomeViewRows(restaurant: restaurant, theme: theme)

          HomeRestaurantToolsCard(
            restaurant: restaurant,
            featuredSpecials: currentHomeData.featuredSpecials,
            theme: theme
          )

          Color.clear.frame(height: homeBottomNavigationClearance)
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 16)
      }
    }
    .safeAreaInset(edge: .bottom) {
      HomeBottomNav(theme: theme, namespace: bottomNavNamespace)
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }
    .onAppear {
      if restaurantSwitcherOptions.contains(where: { $0.slug == selectedRestaurantSlug }) {
        refreshHomeData()
        return
      }
      if let bootSlug = initialRestaurantSlug,
         restaurantSwitcherOptions.contains(where: { $0.slug == bootSlug })
      {
        selectedRestaurantSlug = bootSlug
        refreshHomeData()
        return
      }
      selectedRestaurantSlug = restaurantSwitcherOptions.first?.slug ?? "leroys-lounge"
      refreshHomeData()
    }
    .onChange(of: selectedRestaurantSlug) { _, _ in
      refreshHomeData()
    }
    .onChange(of: model.homeDataVersion) { _, _ in
      refreshHomeData()
    }
    .navigationTitle("Home")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.hidden, for: .navigationBar)
    .task(id: selectedRestaurantSlug) {
      guard let restaurant = selectedRestaurant else { return }
      await model.loadRestaurantTools(for: restaurant.id)
    }
  }

  private var restaurantSwitcherOptions: [HomeRestaurantOption] {
    return [
      HomeRestaurantOption(slug: "leroys-lounge",    label: "Leroy's"),
      HomeRestaurantOption(slug: "el-roys-cantina", label: "El Roy's"),
    ]
  }

  private var activeTheme: HomeTheme {
    HomeTheme.theme(for: selectedRestaurantSlug)
  }

  private var selectedRestaurant: RestaurantRecord? {
    model.restaurants.first(where: { $0.slug == selectedRestaurantSlug })
  }

  private func activeItemCount(for restaurant: RestaurantRecord, type: String) -> Int? {
    guard let menu = model.menu(for: restaurant.id, type: type),
          let workspace = model.currentToolsMenus[menu.id] else { return nil }
    return workspace.cats.reduce(into: 0) { count, category in
      count += category.items.filter { $0.onMenu }.count
    }
  }

  private func realFeaturedSpecials(for restaurant: RestaurantRecord) -> [String]? {
    let names = restaurantMenus(for: restaurant)
      .compactMap { model.currentToolsMenus[$0.id] }
      .flatMap { workspace in
        workspace.cats.first(where: { $0.key == EditableMenuDocument.featuredSpecialsKey })?.items ?? []
      }
      .filter(\.isPubliclyVisibleFeaturedSpecial)
      .compactMap { $0.name.nilIfBlank }
    return names.isEmpty ? nil : names
  }

  private func realUpdates(for restaurant: RestaurantRecord) -> [HomeUpdate]? {
    let updates = restaurantMenus(for: restaurant)
      .compactMap { menu in
        model.currentToolsHistories[menu.id]?.logs.map { ($0, menu) }
      }
      .flatMap { $0 }
      .filter { entry, _ in
        entry.message.nilIfBlank != nil || !entry.diff.isEmpty
      }
      .map { makeHomeUpdate(entry: $0.0, fallbackMenu: $0.1) }
      .sorted { $0.sortDate > $1.sortDate }
    return updates.isEmpty ? nil : Array(updates.prefix(2))
  }

  private func restaurantMenus(for restaurant: RestaurantRecord) -> [MenuRecord] {
    ["drinks", "food"].compactMap { model.menu(for: restaurant.id, type: $0) }
  }

  private func hasLoadedToolsData(for restaurant: RestaurantRecord) -> Bool {
    let menuIds = Set(restaurantMenus(for: restaurant).map(\.id))
    return !menuIds.isDisjoint(with: Set(model.currentToolsMenus.keys))
      || !menuIds.isDisjoint(with: Set(model.currentToolsHistories.keys))
  }

  private func makeHomeUpdate(entry: HistoryLogEntry, fallbackMenu: MenuRecord) -> HomeUpdate {
    let details = historyDetailLines(from: entry)
    let summary = details.count > 1
      ? "Expand to see update"
      : details.first ?? entry.message.nilIfBlank ?? "Update saved"
    let sortDate = isoDate(entry.createdAt)
    return HomeUpdate(
      id: entry.id,
      icon: menuIcon(for: entry.menu?.type ?? fallbackMenu.type),
      summary: summary,
      whenAgo: relativeTimestamp(for: entry.createdAt, date: sortDate),
      stamp: tickerStamp(for: sortDate),
      author: entry.userName.nilIfBlank ?? "Unknown",
      details: details.isEmpty ? [entry.message.nilIfBlank ?? "Update saved"] : details,
      sortDate: sortDate
    )
  }

  private func historyDetailLines(from entry: HistoryLogEntry) -> [String] {
    let lines = entry.diff.flatMap(historySectionLines)
    if !lines.isEmpty {
      return Array(lines.prefix(4))
    }
    if let message = entry.message.nilIfBlank {
      return [message]
    }
    return []
  }

  private func historySectionLines(from value: JSONValue) -> [String] {
    guard case .object(let object) = value else { return [] }
    let labelPrefix = object["label"]?.stringValue?.nilIfBlank.map { "\($0): " } ?? ""
    var lines: [String] = []
    lines.append(contentsOf: (object["added"]?.stringArrayValue ?? []).map { "\(labelPrefix)+ \($0)" })
    lines.append(contentsOf: (object["removed"]?.stringArrayValue ?? []).map { "\(labelPrefix)- \($0)" })
    lines.append(contentsOf: (object["eightySixed"]?.stringArrayValue ?? []).map { "\(labelPrefix)86'd: \($0)" })
    lines.append(contentsOf: (object["restored"]?.stringArrayValue ?? []).map { "\(labelPrefix)Back: \($0)" })
    return lines
  }

  private func menuIcon(for type: String) -> String {
    type.lowercased() == "food" ? "fork.knife" : "wineglass.fill"
  }

  private func isoDate(_ raw: String) -> Date {
    if let date = ISO8601DateFormatter.withFractional.date(from: raw) {
      return date
    }
    if let date = ISO8601DateFormatter.basic.date(from: raw) {
      return date
    }
    return .distantPast
  }

  private func relativeTimestamp(for raw: String, date: Date) -> String {
    guard date != .distantPast else { return raw }
    return RelativeDateTimeFormatter.home.localizedString(for: date, relativeTo: .now)
  }

  private func tickerStamp(for date: Date) -> String {
    guard date != .distantPast else { return "" }
    return DateFormatter.tickerStamp.string(from: date).uppercased()
  }

  private func refreshHomeData() {
    guard let restaurant = selectedRestaurant else {
      homeData = .empty
      return
    }
    let drinksMenu = model.menu(for: restaurant.id, type: "drinks")
    let foodMenu = model.menu(for: restaurant.id, type: "food")
    homeData = HomeDerivedData(
      updates: realUpdates(for: restaurant) ?? [],
      featuredSpecials: realFeaturedSpecials(for: restaurant) ?? [],
      drinksCount: activeItemCount(for: restaurant, type: "drinks"),
      foodCount: activeItemCount(for: restaurant, type: "food"),
      hasLoadedRestaurantData: hasLoadedToolsData(for: restaurant),
      drinksEditorDestination: drinksMenu.map(AppDestination.editor),
      foodEditorDestination: foodMenu.map(AppDestination.editor)
    )
  }
}

struct RestaurantHubView: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord

  var body: some View {
    RestaurantChooserView(model: model, initialRestaurantSlug: restaurant.slug)
      .navigationBarTitleDisplayMode(.inline)
  }
}

// MARK: - Header

private struct HomeHeader: View {
  let theme: HomeTheme
  let environment: AppEnvironment
  let onRequestAccountDeletion: () -> Void
  let onSignOut: () -> Void

  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      HomeEmblem(theme: theme)

      VStack(alignment: .leading, spacing: 4) {
        Text("201 SOUTH LEROY")
          .font(theme.display(19, weight: .bold))
          .tracking(theme.motif == .chevron ? 1.4 : 0.8)
          .foregroundStyle(theme.headerText)
          .lineLimit(1)
          .minimumScaleFactor(0.7)

        HomeLiveStrip(
          theme: theme,
          environment: environment
        )
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      Menu {
        Button("Request Account Deletion") {
          onRequestAccountDeletion()
        }
        .accessibilityHint("Submits an account deletion request for your staff account.")

        Button("Account Deletion Details") {
          UIApplication.shared.open(accountDeletionURL)
        }
        .accessibilityHint("Opens account deletion instructions for your staff account.")

        Button(role: .destructive) {
          onSignOut()
        } label: {
          Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
        }
      } label: {
        ZStack {
          Circle()
            .stroke(theme.accent.opacity(0.5), lineWidth: 1)
            .frame(width: 36, height: 36)
          Image(systemName: "person.crop.circle")
            .font(.system(size: 20, weight: .light))
            .foregroundStyle(theme.headerText)
        }
      }
      .contentShape(Circle())
      .accessibilityLabel("Account")
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .homeGlassChrome(tint: theme.chromeTint, cornerRadius: 20)
  }

  private var accountDeletionURL: URL {
    var components = URLComponents(
      url: environment.publicOrigin.appendingPathComponent("privacy.html"),
      resolvingAgainstBaseURL: false
    )
    components?.fragment = "account-deletion"
    return components?.url ?? environment.publicOrigin
  }
}

private struct HomeEmblem: View {
  let theme: HomeTheme

  var body: some View {
    ZStack {
      Circle()
        .stroke(theme.accent.opacity(0.75), lineWidth: 1.2)
      Circle()
        .stroke(theme.accent.opacity(0.35), lineWidth: 0.5)
        .padding(4)
      VStack(spacing: -2) {
        Text("201")
          .font(theme.display(18, weight: .bold))
          .foregroundStyle(theme.accent)
        Text(theme.motif == .chevron ? "S·LEROY" : "CANTINA")
          .font(.system(size: 6.5, weight: .bold, design: .monospaced))
          .tracking(1.2)
          .foregroundStyle(theme.accent.opacity(0.85))
      }
    }
    .frame(width: 48, height: 48)
  }
}

private struct HomeLiveStrip: View {
  let theme: HomeTheme
  let environment: AppEnvironment

  var body: some View {
    TimelineView(.periodic(from: .now, by: 30)) { context in
      HStack(spacing: 8) {
        HStack(spacing: 5) {
          PulsingDot(color: theme.liveDot)
          Text(environment.isProduction ? "LIVE" : environment.displayName.uppercased())
            .font(.system(size: 9.5, weight: .bold, design: .monospaced))
            .tracking(1.3)
            .foregroundStyle(theme.liveDot)
        }
        ruleSegment
        Text(DateFormatter.headerStamp.string(from: context.date).uppercased())
          .font(.system(size: 9.5, weight: .semibold, design: .monospaced))
          .tracking(1.2)
          .foregroundStyle(theme.subtleText)
          .lineLimit(1)
      }
    }
  }

  private var ruleSegment: some View {
    Rectangle()
      .fill(theme.subtleText.opacity(0.45))
      .frame(width: 10, height: 0.5)
  }
}

private struct PulsingDot: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  let color: Color

  var body: some View {
    Group {
      if reduceMotion || scenePhase != .active {
        dot(phase: 0.5)
      } else {
        TimelineView(.periodic(from: .now, by: 1.0 / 6.0)) { context in
          let t = context.date.timeIntervalSinceReferenceDate
          dot(phase: (sin(t * 2.6) + 1) / 2)
        }
      }
    }
    .frame(width: 12, height: 12)
  }

  @ViewBuilder
  private func dot(phase: Double) -> some View {
    ZStack {
      Circle()
        .fill(color.opacity(0.25 + 0.35 * phase))
        .frame(width: 12, height: 12)
        .blur(radius: 3)
      Circle()
        .fill(color)
        .frame(width: 5.5, height: 5.5)
    }
  }
}

// MARK: - Restaurant switcher

private struct HomeRestaurantSwitcher: View {
  let options: [HomeRestaurantOption]
  let selectedSlug: String
  let theme: HomeTheme
  let namespace: Namespace.ID
  let onSelect: (String) -> Void

  var body: some View {
    HStack(spacing: 0) {
      ForEach(options) { option in
        let isSelected = option.slug == selectedSlug
        Button {
          onSelect(option.slug)
        } label: {
          VStack(spacing: 6) {
            Text(option.label.uppercased())
              .font(theme.display(16, weight: .bold))
              .tracking(theme.motif == .chevron ? 2.0 : 1.2)
              .foregroundStyle(isSelected ? theme.switcherSelectedText : theme.switcherText)

            ZStack {
              Rectangle()
                .fill(theme.subtleText.opacity(0.18))
                .frame(height: 1)
              if isSelected {
                LinearGradient(
                  colors: [theme.accent.opacity(0), theme.accent, theme.accentHot, theme.accent.opacity(0)],
                  startPoint: .leading,
                  endPoint: .trailing
                )
                .frame(height: 2)
                .matchedGeometryEffect(id: "switcher-underline", in: namespace)
              }
            }
            .frame(height: 2)
            .padding(.horizontal, 18)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        if option.id != options.last?.id {
          Rectangle()
            .fill(theme.accent.opacity(0.35))
            .frame(width: 0.6, height: 36)
        }
      }
    }
    .padding(.horizontal, 4)
    .padding(.vertical, 4)
    .homeGlassChrome(tint: theme.chromeTint, cornerRadius: 18)
  }
}

// MARK: - Recent updates (telegram ticker)

private struct HomeRecentUpdatesCard: View {
  let updates: [HomeUpdate]
  @Binding var expandedUpdateID: String?
  let hasLoadedData: Bool
  let theme: HomeTheme

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 10) {
        Text("RECENT UPDATES")
          .font(.system(size: 10.5, weight: .bold, design: .monospaced))
          .tracking(2.0)
          .foregroundStyle(theme.accent)
        BrassRule(color: theme.accent)
          .frame(maxWidth: .infinity)
        Text("TICKER")
          .font(.system(size: 8.5, weight: .bold, design: .monospaced))
          .tracking(1.8)
          .foregroundStyle(theme.subtleText)
      }

      if updates.isEmpty {
        HStack(spacing: 10) {
          Image(systemName: hasLoadedData ? "tray" : "hourglass")
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(theme.subtleText)
          Text(hasLoadedData ? "No sent updates yet." : "Loading recent updates…")
            .font(theme.body(14, weight: .medium, italic: true))
            .foregroundStyle(theme.subtleText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
      } else {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(Array(updates.prefix(2).enumerated()), id: \.element.id) { index, update in
            if index > 0 {
              motifDivider
            }
            HomeUpdateRow(
              update: update,
              isExpanded: expandedUpdateID == update.id,
              theme: theme,
              onToggle: {
                withAnimation(AppMotion.snap) {
                  expandedUpdateID = expandedUpdateID == update.id ? nil : update.id
                }
              }
            )
          }
        }
      }
    }
    .padding(18)
    .background(theme.updatesSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(theme.updatesBorder, lineWidth: 1)
    }
    .shadow(color: theme.shadowTint.opacity(0.12), radius: 18, y: 8)
  }

  @ViewBuilder
  private var motifDivider: some View {
    if theme.motif == .chevron {
      BrassRule(color: theme.accent.opacity(0.5))
    } else {
      RicRacRule(color: theme.accent.opacity(0.55))
    }
  }
}

private struct HomeUpdateRow: View {
  let update: HomeUpdate
  let isExpanded: Bool
  let theme: HomeTheme
  let onToggle: () -> Void

  var body: some View {
    Button(action: onToggle) {
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .top, spacing: 12) {
          VStack(spacing: 2) {
            Text(update.stamp.isEmpty ? update.whenAgo.uppercased() : update.stamp)
              .font(.system(size: 9.5, weight: .bold, design: .monospaced))
              .tracking(1.2)
              .foregroundStyle(theme.accent)
              .lineLimit(1)
            Image(systemName: update.icon)
              .font(.system(size: 14, weight: .semibold))
              .foregroundStyle(theme.updateIconTint)
              .frame(width: 28, height: 28)
              .background(theme.updateIconTint.opacity(0.14), in: Circle())
              .overlay(
                Circle().stroke(theme.updateIconTint.opacity(0.35), lineWidth: 0.6)
              )
          }
          .frame(width: 64, alignment: .leading)

          VStack(alignment: .leading, spacing: 3) {
            Text(update.summary)
              .font(theme.body(15, weight: .semibold))
              .multilineTextAlignment(.leading)
              .foregroundStyle(theme.surfaceBodyText)
            Text("\(update.whenAgo.uppercased()) · BY \(update.author.uppercased())")
              .font(.system(size: 9.5, weight: .semibold, design: .monospaced))
              .tracking(1.0)
              .foregroundStyle(theme.subtleText)
          }
          .frame(maxWidth: .infinity, alignment: .leading)

          Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(theme.accent)
            .rotationEffect(.degrees(isExpanded ? 90 : 0))
        }

        if isExpanded {
          VStack(alignment: .leading, spacing: 5) {
            ForEach(update.details, id: \.self) { detail in
              HomeDiffLine(text: detail, theme: theme)
            }
          }
          .padding(.leading, 64)
          .padding(.top, 2)
          .transition(.opacity.combined(with: .move(edge: .top)))
        }
      }
      .padding(.vertical, 6)
    }
    .buttonStyle(.plain)
  }
}

private struct HomeDiffLine: View {
  let text: String
  let theme: HomeTheme

  var body: some View {
    let (prefix, body, color) = parse()
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(prefix)
        .font(.system(size: 11, weight: .bold, design: .monospaced))
        .foregroundStyle(color)
        .frame(width: 18, alignment: .leading)
      Text(body)
        .font(theme.body(13, italic: true))
        .foregroundStyle(theme.neutralInfoText)
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func parse() -> (String, String, Color) {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    if let range = trimmed.range(of: ": ") {
      let label = String(trimmed[..<range.lowerBound])
      let rest = String(trimmed[range.upperBound...])
      let (pfx, body, color) = classify(rest)
      return (pfx, "\(label) · \(body)", color)
    }
    return classify(trimmed)
  }

  private func classify(_ s: String) -> (String, String, Color) {
    if s.hasPrefix("+ ") {
      return ("+", String(s.dropFirst(2)), theme.accentHot)
    } else if s.hasPrefix("- ") {
      return ("−", String(s.dropFirst(2)), theme.accentCool)
    } else if s.hasPrefix("86'd: ") {
      return ("✕", String(s.dropFirst(6)), theme.accentCool)
    } else if s.hasPrefix("Back: ") {
      return ("↺", String(s.dropFirst(6)), theme.accent)
    }
    return ("•", s, theme.accent)
  }
}

// MARK: - Edit tiles

private struct HomeEditGrid: View {
  let theme: HomeTheme
  let drinksCount: Int?
  let foodCount: Int?
  let drinksDestination: AppDestination?
  let foodDestination: AppDestination?

  var body: some View {
    HStack(spacing: 12) {
      editTile(
        action: drinksDestination,
        tile: HomeEditTile(
          chapter: "VOL. 01",
          kind: theme.motif == .chevron ? "LIQUID" : "BEBIDAS",
          title: "Edit Drinks",
          countLabel: countLabel(for: drinksCount),
          icon: "wineglass.fill",
          theme: theme
        )
      )
      editTile(
        action: foodDestination,
        tile: HomeEditTile(
          chapter: "VOL. 02",
          kind: theme.motif == .chevron ? "PLATES" : "COCINA",
          title: "Edit Food",
          countLabel: countLabel(for: foodCount),
          icon: "fork.knife",
          theme: theme
        )
      )
    }
  }

  @ViewBuilder
  private func editTile(action: AppDestination?, tile: HomeEditTile) -> some View {
    if let action {
      NavigationLink(value: action) { tile }
        .buttonStyle(.plain)
    } else {
      tile
    }
  }

  private func countLabel(for count: Int?) -> String {
    if let count {
      return "\(count) ACTIVE"
    }
    return "LOADING…"
  }
}

private struct HomeEditTile: View {
  let chapter: String
  let kind: String
  let title: String
  let countLabel: String
  let icon: String
  let theme: HomeTheme

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 2) {
          Text(chapter)
            .font(.system(size: 9.5, weight: .bold, design: .monospaced))
            .tracking(1.6)
            .foregroundStyle(theme.tileKickerTint)
          Text(kind)
            .font(theme.display(11, weight: .bold))
            .tracking(2.2)
            .foregroundStyle(theme.tileKickerTint.opacity(0.85))
        }
        Spacer()
        Image(systemName: icon)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(theme.tileIconTint)
          .frame(width: 30, height: 30)
          .background(theme.tileIconTint.opacity(0.16), in: Circle())
          .overlay(Circle().stroke(theme.tileIconTint.opacity(0.40), lineWidth: 0.6))
      }

      Spacer(minLength: 4)

      Text(title)
        .font(theme.display(24, weight: .bold))
        .tracking(theme.motif == .chevron ? 0.5 : 0.0)
        .foregroundStyle(theme.tileTitleText)
        .lineLimit(1)
        .minimumScaleFactor(0.7)

      BrassRule(color: theme.tileIconTint.opacity(0.6))
        .frame(maxWidth: 52)

      Text(countLabel)
        .font(.system(size: 9.5, weight: .bold, design: .monospaced))
        .tracking(1.6)
        .foregroundStyle(theme.tileSubtleText)
    }
    .frame(maxWidth: .infinity, minHeight: 158, alignment: .topLeading)
    .padding(16)
    .background(
      LinearGradient(
        colors: [theme.tileSurfaceTop, theme.tileSurfaceBottom],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      ),
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay(alignment: .bottomTrailing) {
      tileMotifWash
        .frame(width: 120, height: 90)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .allowsHitTesting(false)
    }
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(theme.tileBorder, lineWidth: 1)
    }
    .shadow(color: theme.shadowTint.opacity(0.25), radius: 18, y: 10)
  }

  @ViewBuilder
  private var tileMotifWash: some View {
    switch theme.motif {
    case .chevron:
      ArtDecoChevronPattern(color: theme.tileIconTint.opacity(0.18), spacing: 22, lineWidth: 0.5)
    case .diamond:
      PunchedTinDiamondPattern(color: theme.tileIconTint.opacity(0.25), spacing: 20, lineWidth: 0.4)
    }
  }
}

// MARK: - View rows

private struct HomeViewRows: View {
  let restaurant: RestaurantRecord?
  let theme: HomeTheme

  var body: some View {
    VStack(spacing: 10) {
      row(destination: restaurant.map { AppDestination.publicMenu($0, initialType: "drinks") },
          label: "View Drinks",
          icon: "wineglass")
      row(destination: restaurant.map { AppDestination.publicMenu($0, initialType: "food") },
          label: "View Food",
          icon: "fork.knife")
    }
  }

  @ViewBuilder
  private func row(destination: AppDestination?, label: String, icon: String) -> some View {
    if let destination {
      NavigationLink(value: destination) {
        HomeViewRow(label: label, icon: icon, theme: theme)
      }
      .buttonStyle(.plain)
    } else {
      HomeViewRow(label: label, icon: icon, theme: theme)
    }
  }
}

private struct HomeViewRow: View {
  let label: String
  let icon: String
  let theme: HomeTheme

  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: icon)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(theme.accent)
        .frame(width: 30, height: 30)
        .background(theme.accent.opacity(0.10), in: Circle())
        .overlay(Circle().stroke(theme.accent.opacity(0.30), lineWidth: 0.6))

      Text(label)
        .font(theme.body(16, weight: .semibold))
        .foregroundStyle(theme.surfaceBodyText)

      Spacer()

      Image(systemName: "arrow.up.right")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(theme.accent.opacity(0.85))
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .background(theme.rowSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(theme.rowBorder, lineWidth: 1)
    }
  }
}

// MARK: - Tools card

private struct HomeRestaurantToolsCard: View {
  let restaurant: RestaurantRecord?
  let featuredSpecials: [String]
  let theme: HomeTheme

  var body: some View {
    Group {
      if let restaurant {
        NavigationLink(value: AppDestination.restaurantTools(restaurant)) {
          cardBody
        }
        .buttonStyle(.plain)
      } else {
        cardBody
      }
    }
  }

  private var cardBody: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 10) {
        Image(systemName: "star.circle.fill")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(theme.toolsIconTint)
          .frame(width: 30, height: 30)
          .background(theme.toolsIconTint.opacity(0.18), in: Circle())
          .overlay(Circle().stroke(theme.toolsIconTint.opacity(0.45), lineWidth: 0.6))

        VStack(alignment: .leading, spacing: 1) {
          Text("RESTAURANT TOOLS")
            .font(.system(size: 9.5, weight: .bold, design: .monospaced))
            .tracking(1.8)
            .foregroundStyle(theme.toolsIconTint)
          Text("Featured Specials")
            .font(theme.display(20, weight: .bold))
            .foregroundStyle(theme.tileTitleText)
        }

        Spacer()

        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(theme.toolsIconTint)
      }

      BrassRule(color: theme.toolsIconTint.opacity(0.6))

      let previewItems = featuredSpecials.count <= 3 ? featuredSpecials : Array(featuredSpecials.prefix(2))
      if previewItems.isEmpty {
        Text("No featured specials yet.")
          .font(theme.body(14, italic: true))
          .foregroundStyle(theme.tileSubtleText)
      } else {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(Array(previewItems.enumerated()), id: \.element) { index, name in
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              Text(String(format: "%02d", index + 1))
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .tracking(0.8)
                .foregroundStyle(theme.toolsIconTint)
                .frame(width: 20, alignment: .leading)
              Text(name)
                .font(theme.body(14, weight: .semibold))
                .foregroundStyle(theme.surfaceBodyText)
                .lineLimit(1)
            }
          }
          if featuredSpecials.count > 3 {
            Text("+ \(featuredSpecials.count - 2) MORE")
              .font(.system(size: 9.5, weight: .bold, design: .monospaced))
              .tracking(1.4)
              .foregroundStyle(theme.tileSubtleText)
              .padding(.top, 2)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(18)
    .background(
      LinearGradient(
        colors: [theme.toolsSurfaceTop, theme.toolsSurfaceBottom],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      ),
      in: RoundedRectangle(cornerRadius: 20, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(theme.toolsBorder, lineWidth: 1)
    }
    .shadow(color: theme.shadowTint.opacity(0.22), radius: 16, y: 8)
  }
}

// MARK: - Bottom nav

private struct HomeBottomNav: View {
  let theme: HomeTheme
  let namespace: Namespace.ID

  private let activeTab: HomeBottomTab = .home

  var body: some View {
    bottomBarLayout
      .shadow(color: theme.shadowTint.opacity(0.16), radius: 24, y: 14)
  }

  @ViewBuilder
  private var bottomBarLayout: some View {
    if #available(iOS 26.0, *) {
      GlassEffectContainer(spacing: 14) {
        HStack(spacing: 14) {
          bottomTabCluster
          qrButton
        }
      }
    } else {
      HStack(spacing: 14) {
        bottomTabCluster
        qrButton
      }
    }
  }

  private var bottomTabCluster: some View {
    HStack(spacing: 2) {
      ForEach(HomeBottomTab.allCases) { tab in
        let isActive = tab == activeTab
        Button {} label: {
          VStack(spacing: 5) {
            Image(systemName: tab.symbolName)
              .font(.system(size: 17, weight: isActive ? .semibold : .regular))
              .foregroundStyle(isActive ? theme.bottomNavActive : theme.bottomNavInactive)
            Text(tab.rawValue.uppercased())
              .font(.system(size: 9, weight: .bold, design: .monospaced))
              .tracking(1.2)
              .foregroundStyle(isActive ? theme.bottomNavActive : theme.bottomNavInactive)
            ZStack {
              if isActive {
                Circle()
                  .fill(theme.accent)
                  .frame(width: 4, height: 4)
                  .matchedGeometryEffect(id: "home-bottom-nav-gem", in: namespace)
              } else {
                Circle()
                  .fill(Color.clear)
                  .frame(width: 4, height: 4)
              }
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .modifier(HomeBottomBarClusterModifier(theme: theme))
  }

  private var qrButton: some View {
    Button {} label: {
      ZStack {
        HomeMedallionBorder(theme: theme)
        Image(systemName: "qrcode.viewfinder")
          .font(.system(size: 26, weight: .regular))
          .foregroundStyle(theme.bottomNavDetachedIcon)
      }
      .frame(width: 76, height: 76)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Scan QR")
    .modifier(HomeDetachedQRButtonModifier(theme: theme))
  }
}

/// Slowly rotating conic-gradient border — the "door token" medallion.
private struct HomeMedallionBorder: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  let theme: HomeTheme

  var body: some View {
    Group {
      if reduceMotion || scenePhase != .active {
        medallion(at: .degrees(0))
      } else {
        TimelineView(.periodic(from: .now, by: 1.0 / 6.0)) { context in
          let t = context.date.timeIntervalSinceReferenceDate
          let angle = Angle.degrees(t.truncatingRemainder(dividingBy: 12) / 12 * 360)
          medallion(at: angle)
        }
      }
    }
    .allowsHitTesting(false)
  }

  @ViewBuilder
  private func medallion(at angle: Angle) -> some View {
    Circle()
      .strokeBorder(
        AngularGradient(
          gradient: Gradient(colors: [
            theme.medallionGlowA.opacity(0.9),
            theme.medallionGlowB.opacity(0.95),
            theme.medallionGlowA.opacity(0.4),
            theme.medallionGlowB.opacity(0.85),
            theme.medallionGlowA.opacity(0.9),
          ]),
          center: .center,
          angle: angle
        ),
        lineWidth: 1.4
      )
      .blur(radius: 0.2)
  }
}

// MARK: - Background (gradient + motif + grain)

private struct HomeBackground: View {
  let theme: HomeTheme

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [theme.shellTop, theme.shellBottom],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      // Soft atmospheric glow
      Circle()
        .fill(theme.glowPrimary.opacity(0.18))
        .frame(width: 340, height: 340)
        .blur(radius: 40)
        .offset(x: -120, y: -180)

      Circle()
        .fill(theme.glowSecondary.opacity(0.14))
        .frame(width: 280, height: 280)
        .blur(radius: 50)
        .offset(x: 140, y: 240)

      // Corner emblem — different per theme
      motifCornerEmblem
        .allowsHitTesting(false)

      // Field pattern — very low opacity
      fieldMotif
        .opacity(0.06)
        .allowsHitTesting(false)

      FilmGrain(intensity: 0.07)
        .opacity(theme.motif == .chevron ? 0.35 : 0.22)
    }
    .ignoresSafeArea()
  }

  @ViewBuilder
  private var motifCornerEmblem: some View {
    switch theme.motif {
    case .chevron:
      DecoFan(color: theme.patternInk.opacity(0.35), rayCount: 13, radius: 210)
        .frame(width: 210, height: 210)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .offset(x: 45, y: -45)
    case .diamond:
      SunburstRays(color: theme.patternInk.opacity(0.55), rayCount: 30, innerRadius: 22, outerRadius: 220)
        .frame(width: 220, height: 220)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .offset(x: 70, y: -70)
    }
  }

  @ViewBuilder
  private var fieldMotif: some View {
    switch theme.motif {
    case .chevron:
      ArtDecoChevronPattern(color: theme.patternInk, spacing: 60, lineWidth: 0.45)
    case .diamond:
      PunchedTinDiamondPattern(color: theme.patternInk, spacing: 42, lineWidth: 0.4)
    }
  }
}

// MARK: - Models

private struct HomeRestaurantOption: Identifiable {
  let slug: String
  let label: String
  var id: String { slug }
}

private enum HomeMotif {
  case chevron // Leroy's — art deco
  case diamond // El Roy's — punched tin
}

private struct HomeTheme {
  let slug: String
  let motif: HomeMotif

  // Shell
  let shellTop: Color
  let shellBottom: Color
  let glowPrimary: Color
  let glowSecondary: Color
  let patternInk: Color

  // Chrome & text
  let chromeTint: Color
  let headerText: Color
  let subtleText: Color
  let surfaceTitleText: Color
  let surfaceBodyText: Color
  let neutralInfoText: Color

  // Accents
  let accent: Color
  let accentHot: Color
  let accentCool: Color
  let liveDot: Color

  // Switcher
  let switcherText: Color
  let switcherSelectedText: Color

  // Updates
  let updatesSurface: Color
  let updatesBorder: Color
  let updateIconTint: Color

  // Rows
  let rowSurface: Color
  let rowBorder: Color

  // Tiles
  let tileSurfaceTop: Color
  let tileSurfaceBottom: Color
  let tileBorder: Color
  let tileTitleText: Color
  let tileSubtleText: Color
  let tileIconTint: Color
  let tileKickerTint: Color

  // Tools
  let toolsSurfaceTop: Color
  let toolsSurfaceBottom: Color
  let toolsBorder: Color
  let toolsIconTint: Color

  // Bottom nav
  let bottomNavActive: Color
  let bottomNavInactive: Color
  let bottomNavGlassTint: Color
  let bottomNavDetachedIcon: Color
  let bottomNavSelectedBorder: Color

  // Medallion
  let medallionGlowA: Color
  let medallionGlowB: Color

  // Shadow
  let shadowTint: Color

  // Typography
  let displayFontName: String
  let displayFontNameBold: String
  let displayFontNameItalic: String
  let bodyFontName: String
  let bodyFontNameBold: String
  let bodyFontNameItalic: String

  func display(_ size: CGFloat, weight: HomeTypography.Weight = .regular, italic: Bool = false) -> Font {
    let name: String
    if italic {
      name = displayFontNameItalic
    } else if weight == .bold || weight == .semibold {
      name = displayFontNameBold
    } else {
      name = displayFontName
    }
    return .custom(name, size: size)
  }

  func body(_ size: CGFloat, weight: HomeTypography.Weight = .regular, italic: Bool = false) -> Font {
    let name: String
    if italic {
      name = bodyFontNameItalic
    } else if weight == .bold || weight == .semibold {
      name = bodyFontNameBold
    } else {
      name = bodyFontName
    }
    return .custom(name, size: size)
  }

  static func theme(for slug: String) -> HomeTheme {
    slug == "el-roys-cantina" ? .elRoys : .leroys
  }

  // MARK: - Leroy's Lounge — Brass & Ember
  static let leroys = HomeTheme(
    slug: "leroys-lounge",
    motif: .chevron,

    shellTop:      Color(red: 0.075, green: 0.058, blue: 0.058),
    shellBottom:   Color(red: 0.028, green: 0.021, blue: 0.021),
    glowPrimary:   Color(red: 0.58, green: 0.13, blue: 0.10),
    glowSecondary: Color(red: 0.76, green: 0.41, blue: 0.16),
    patternInk:    Color(red: 0.74, green: 0.58, blue: 0.29),

    chromeTint:    Color(red: 0.52, green: 0.16, blue: 0.16),
    headerText:    Color(red: 0.957, green: 0.929, blue: 0.871),
    subtleText:    Color(red: 0.68, green: 0.58, blue: 0.48),
    surfaceTitleText: Color(red: 0.957, green: 0.929, blue: 0.871),
    surfaceBodyText:  Color(red: 0.925, green: 0.886, blue: 0.827),
    neutralInfoText:  Color(red: 0.870, green: 0.831, blue: 0.773),

    accent:     Color(red: 0.800, green: 0.639, blue: 0.290),   // brass
    accentHot:  Color(red: 0.925, green: 0.392, blue: 0.165),   // ember
    accentCool: Color(red: 0.553, green: 0.137, blue: 0.153),   // oxblood
    liveDot:    Color(red: 0.925, green: 0.392, blue: 0.165),

    switcherText:         Color(red: 0.65, green: 0.54, blue: 0.45),
    switcherSelectedText: Color(red: 0.980, green: 0.945, blue: 0.890),

    updatesSurface: Color(red: 0.110, green: 0.090, blue: 0.090).opacity(0.94),
    updatesBorder:  Color(red: 0.58, green: 0.35, blue: 0.21).opacity(0.55),
    updateIconTint: Color(red: 0.800, green: 0.639, blue: 0.290),

    rowSurface: Color(red: 0.130, green: 0.105, blue: 0.105).opacity(0.90),
    rowBorder:  Color(red: 0.55, green: 0.34, blue: 0.22).opacity(0.45),

    tileSurfaceTop:    Color(red: 0.19, green: 0.11, blue: 0.10),
    tileSurfaceBottom: Color(red: 0.10, green: 0.06, blue: 0.06),
    tileBorder:        Color(red: 0.68, green: 0.41, blue: 0.24).opacity(0.55),
    tileTitleText:     Color(red: 0.980, green: 0.945, blue: 0.890),
    tileSubtleText:    Color(red: 0.78, green: 0.66, blue: 0.53),
    tileIconTint:      Color(red: 0.870, green: 0.680, blue: 0.320),
    tileKickerTint:    Color(red: 0.800, green: 0.639, blue: 0.290),

    toolsSurfaceTop:    Color(red: 0.19, green: 0.11, blue: 0.10).opacity(0.94),
    toolsSurfaceBottom: Color(red: 0.11, green: 0.07, blue: 0.06).opacity(0.96),
    toolsBorder:        Color(red: 0.62, green: 0.37, blue: 0.22).opacity(0.55),
    toolsIconTint:      Color(red: 0.870, green: 0.680, blue: 0.320),

    bottomNavActive:         Color(red: 0.28, green: 0.13, blue: 0.11),
    bottomNavInactive:       Color(red: 0.44, green: 0.31, blue: 0.24),
    bottomNavGlassTint:      Color(red: 0.96, green: 0.89, blue: 0.79),
    bottomNavDetachedIcon:   Color(red: 0.28, green: 0.13, blue: 0.11),
    bottomNavSelectedBorder: Color(red: 0.58, green: 0.46, blue: 0.38).opacity(0.75),

    medallionGlowA: Color(red: 0.870, green: 0.680, blue: 0.320),
    medallionGlowB: Color(red: 0.553, green: 0.137, blue: 0.153),

    shadowTint: .black,

    displayFontName:        "Didot",
    displayFontNameBold:    "Didot-Bold",
    displayFontNameItalic:  "Didot-Italic",
    bodyFontName:           "Avenir-Book",
    bodyFontNameBold:       "Avenir-Heavy",
    bodyFontNameItalic:     "Avenir-BookOblique"
  )

  // MARK: - El Roy's Cantina — Mercado del Sol
  static let elRoys = HomeTheme(
    slug: "el-roys-cantina",
    motif: .diamond,

    shellTop:      Color(red: 0.945, green: 0.858, blue: 0.706),
    shellBottom:   Color(red: 0.862, green: 0.745, blue: 0.560),
    glowPrimary:   Color(red: 0.85, green: 0.26, blue: 0.19),
    glowSecondary: Color(red: 0.20, green: 0.55, blue: 0.34),
    patternInk:    Color(red: 0.16, green: 0.35, blue: 0.60),

    chromeTint:    Color(red: 0.820, green: 0.310, blue: 0.220),
    headerText:    Color(red: 0.215, green: 0.140, blue: 0.090),
    subtleText:    Color(red: 0.435, green: 0.320, blue: 0.225),
    surfaceTitleText: Color(red: 0.265, green: 0.165, blue: 0.115),
    surfaceBodyText:  Color(red: 0.300, green: 0.200, blue: 0.140),
    neutralInfoText:  Color(red: 0.325, green: 0.225, blue: 0.160),

    accent:     Color(red: 0.130, green: 0.330, blue: 0.600),   // cobalt
    accentHot:  Color(red: 0.910, green: 0.639, blue: 0.090),   // marigold
    accentCool: Color(red: 0.122, green: 0.373, blue: 0.227),   // jade
    liveDot:    Color(red: 0.780, green: 0.243, blue: 0.114),   // blood orange

    switcherText:         Color(red: 0.420, green: 0.300, blue: 0.210),
    switcherSelectedText: Color(red: 0.195, green: 0.120, blue: 0.075),

    updatesSurface: Color(red: 0.965, green: 0.918, blue: 0.830).opacity(0.95),
    updatesBorder:  Color(red: 0.70, green: 0.55, blue: 0.36).opacity(0.55),
    updateIconTint: Color(red: 0.130, green: 0.330, blue: 0.600),

    rowSurface: Color(red: 0.942, green: 0.872, blue: 0.736).opacity(0.95),
    rowBorder:  Color(red: 0.72, green: 0.54, blue: 0.34).opacity(0.50),

    tileSurfaceTop:    Color(red: 0.740, green: 0.350, blue: 0.245),
    tileSurfaceBottom: Color(red: 0.520, green: 0.220, blue: 0.185),
    tileBorder:        Color(red: 0.910, green: 0.639, blue: 0.090).opacity(0.65),
    tileTitleText:     Color(red: 0.992, green: 0.957, blue: 0.890),
    tileSubtleText:    Color(red: 0.960, green: 0.865, blue: 0.690),
    tileIconTint:      Color(red: 0.910, green: 0.639, blue: 0.090),
    tileKickerTint:    Color(red: 0.990, green: 0.870, blue: 0.580),

    toolsSurfaceTop:    Color(red: 0.560, green: 0.250, blue: 0.205).opacity(0.96),
    toolsSurfaceBottom: Color(red: 0.400, green: 0.190, blue: 0.155).opacity(0.96),
    toolsBorder:        Color(red: 0.910, green: 0.639, blue: 0.090).opacity(0.55),
    toolsIconTint:      Color(red: 0.910, green: 0.639, blue: 0.090),

    bottomNavActive:         Color(red: 0.130, green: 0.330, blue: 0.600),
    bottomNavInactive:       Color(red: 0.500, green: 0.370, blue: 0.270),
    bottomNavGlassTint:      Color(red: 0.988, green: 0.955, blue: 0.870),
    bottomNavDetachedIcon:   Color(red: 0.210, green: 0.135, blue: 0.090),
    bottomNavSelectedBorder: Color(red: 0.78, green: 0.66, blue: 0.51).opacity(0.70),

    medallionGlowA: Color(red: 0.910, green: 0.639, blue: 0.090),
    medallionGlowB: Color(red: 0.780, green: 0.243, blue: 0.114),

    shadowTint: Color(red: 0.26, green: 0.18, blue: 0.12),

    displayFontName:        "Copperplate",
    displayFontNameBold:    "Copperplate-Bold",
    displayFontNameItalic:  "Copperplate-Bold",
    bodyFontName:           "Georgia",
    bodyFontNameBold:       "Georgia-Bold",
    bodyFontNameItalic:     "Georgia-Italic"
  )
}

private struct HomeUpdate: Identifiable {
  let id: String
  let icon: String
  let summary: String
  let whenAgo: String
  let stamp: String
  let author: String
  let details: [String]
  let sortDate: Date
}

private enum HomeBottomTab: String, CaseIterable, Identifiable {
  case home = "Home"
  case updates = "Updates"
  case tools = "Tools"
  case settings = "Settings"

  var id: String { rawValue }

  var symbolName: String {
    switch self {
    case .home:     return "house.fill"
    case .updates:  return "clock.arrow.circlepath"
    case .tools:    return "slider.horizontal.3"
    case .settings: return "gearshape"
    }
  }
}

private enum HomeTypography {
  enum Weight { case regular, medium, semibold, bold }
}

// MARK: - Glass modifiers

private struct HomeBottomBarClusterModifier: ViewModifier {
  let theme: HomeTheme

  func body(content: Content) -> some View {
    content
      .background {
        ZStack {
          Capsule()
            .fill(theme.bottomNavGlassTint.opacity(0.16))

          Capsule()
            .stroke(theme.bottomNavSelectedBorder.opacity(0.22), lineWidth: 0.9)

          Capsule()
            .fill(
              LinearGradient(
                colors: [
                  .white.opacity(0.82),
                  theme.bottomNavGlassTint.opacity(0.86),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .padding(5)

          Capsule()
            .stroke(.white.opacity(0.66), lineWidth: 0.7)
            .padding(5)
        }
        .shadow(color: theme.shadowTint.opacity(0.10), radius: 20, y: 12)
      }
  }
}

private struct HomeDetachedQRButtonModifier: ViewModifier {
  let theme: HomeTheme

  func body(content: Content) -> some View {
    content
      .background {
        ZStack {
          Circle()
            .fill(theme.bottomNavGlassTint.opacity(0.18))
          Circle()
            .stroke(theme.bottomNavSelectedBorder.opacity(0.22), lineWidth: 0.9)
          Circle()
            .fill(
              LinearGradient(
                colors: [
                  .white.opacity(0.88),
                  theme.bottomNavGlassTint.opacity(0.92),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .padding(5)
          Circle()
            .stroke(.white.opacity(0.64), lineWidth: 0.7)
            .padding(5)
        }
        .shadow(color: theme.shadowTint.opacity(0.10), radius: 18, y: 10)
      }
  }
}

private struct HomeGlassChromeModifier: ViewModifier {
  let tint: Color
  let cornerRadius: CGFloat

  func body(content: Content) -> some View {
    let innerRadius = max(18, cornerRadius - 7)

    content
      .background {
        ZStack {
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(tint.opacity(0.08))

          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .stroke(tint.opacity(0.20), lineWidth: 0.9)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .fill(
              LinearGradient(
                colors: [
                  .white.opacity(0.82),
                  tint.opacity(0.14),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .padding(6)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .stroke(.white.opacity(0.66), lineWidth: 0.7)
            .padding(6)
        }
        .shadow(color: tint.opacity(0.10), radius: 22, y: 12)
        .shadow(color: themeShadow(tint: tint), radius: 20, y: 12)
      }
  }

  private func themeShadow(tint: Color) -> Color {
    tint.opacity(0.06)
  }
}

private extension View {
  func homeGlassChrome(tint: Color, cornerRadius: CGFloat) -> some View {
    modifier(HomeGlassChromeModifier(tint: tint, cornerRadius: cornerRadius))
  }
}

// MARK: - Small extensions

private extension JSONValue {
  var stringValue: String? {
    if case .string(let value) = self {
      return value
    }
    return nil
  }

  var stringArrayValue: [String] {
    guard case .array(let values) = self else { return [] }
    return values.compactMap(\.stringValue).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }
}

private extension ISO8601DateFormatter {
  static let withFractional: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  static let basic: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()
}

private extension RelativeDateTimeFormatter {
  static let home: RelativeDateTimeFormatter = {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .abbreviated
    return formatter
  }()
}

private extension DateFormatter {
  /// e.g. "TUE · APR 15 · 21:34"
  static let headerStamp: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "EEE · MMM d · HH:mm"
    return f
  }()

  /// e.g. "04·15 21:34"
  static let tickerStamp: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "MM·dd HH:mm"
    return f
  }()
}
