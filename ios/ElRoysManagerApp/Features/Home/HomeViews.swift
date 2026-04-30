import UIKit
import SwiftUI

private let homeBottomNavigationClearance: CGFloat = 132
private let homeRecentUpdatesLimit = 2

// MARK: - Public entry points

struct RestaurantChooserView: View {
  @Bindable var model: AppModel
  private let initialRestaurantSlug: String?
  @State private var selectedRestaurantSlug: String
  @State private var expandedUpdateID: String?
  @State private var homeData = HomeDerivedData.empty
  @State private var calendarReminderMessage: String?
  @State private var isSchedulingCalendarReminder = false
  @Namespace private var switcherNamespace
  private let calendarReminderService: any CalendarReminderServicing

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
    self.calendarReminderService = EventKitCalendarReminderService()
    _selectedRestaurantSlug = State(initialValue: initialRestaurantSlug ?? "leroys-lounge")
  }

  var body: some View {
    let theme = activeTheme
    let restaurant = selectedRestaurant
    let currentHomeData = homeData
    let presentation = RestaurantPresentation.resolve(restaurant: restaurant)

    ZStack {
      if presentation.isLeroys {
        // Source contract: LeroysWallBackground renders Image("LeroysWallBackground").
        LeroysWallBackground()
          .accessibilityHidden(true)
      } else {
        HomeBackground(theme: theme)
      }

      GeometryReader { geometry in
        ScrollView(showsIndicators: false) {
          VStack(alignment: .leading, spacing: 20) {
            HomeHeader(
              theme: theme,
              presentation: presentation,
              environment: model.environment,
              onRequestAccountDeletion: { Task { await model.requestAccountDeletion() } },
              onSignOut: { model.signOut() }
            )

            HomeRestaurantSwitcher(
              options: restaurantSwitcherOptions,
              selectedSlug: selectedRestaurantSlug,
              theme: theme,
              presentation: presentation,
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
              presentation: presentation,
              drinksCount: currentHomeData.drinksCount,
              foodCount: currentHomeData.foodCount,
              drinksDestination: currentHomeData.drinksEditorDestination,
              foodDestination: currentHomeData.foodEditorDestination
            )

            HomeViewRows(
              restaurant: restaurant,
              theme: theme,
              presentation: presentation
            )

            HomeRestaurantToolsCard(
              restaurant: restaurant,
              featuredSpecials: currentHomeData.featuredSpecials,
              theme: theme
            )

            HomeCalendarReminderCard(
              restaurant: restaurant,
              theme: theme,
              isScheduling: isSchedulingCalendarReminder,
              onSchedule: scheduleCalendarReminder
            )

            Color.clear.frame(height: homeBottomNavigationClearance)
          }
          .padding(.horizontal, 20)
          .padding(.top, 14)
          .padding(.bottom, 16)
          .frame(width: geometry.size.width, alignment: .leading)
        }
      }
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
    .alert("Calendar Reminder", isPresented: Binding(
      get: { calendarReminderMessage != nil },
      set: { if !$0 { calendarReminderMessage = nil } }
    )) {
      Button("OK", role: .cancel) {
        calendarReminderMessage = nil
      }
    } message: {
      Text(calendarReminderMessage ?? "")
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
    return updates.isEmpty ? nil : Array(updates.prefix(homeRecentUpdatesLimit))
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

  private func scheduleCalendarReminder() {
    guard let restaurant = selectedRestaurant else { return }
    isSchedulingCalendarReminder = true
    Task {
      do {
        let result = try await calendarReminderService.scheduleMenuReview(for: restaurant.name)
        let date = DateFormatter.calendarReminderStamp.string(from: result.startDate)
        calendarReminderMessage = "\(result.title) was added for \(date)."
      } catch {
        calendarReminderMessage = error.localizedDescription
      }
      isSchedulingCalendarReminder = false
    }
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
  let presentation: RestaurantPresentation
  let environment: AppEnvironment
  let onRequestAccountDeletion: () -> Void
  let onSignOut: () -> Void

  var body: some View {
    GeometryReader { geometry in
      let horizontalPadding: CGFloat = 32
      let accountWidth: CGFloat = 36
      let headerGap: CGFloat = 14
      let availableSignWidth = geometry.size.width - horizontalPadding - accountWidth - headerGap
      let signWidth = min(275, max(190, availableSignWidth))

      HStack(alignment: .center, spacing: headerGap) {
        if presentation.isLeroys {
          VStack(alignment: .leading, spacing: 10) {
            Image("LeroysHeroSign")
              .resizable()
              .scaledToFit()
              .frame(width: signWidth)
              .accessibilityLabel("Leroy's Lounge")

            HomeStatusPaperBanner(theme: theme, environment: environment)
              .frame(maxWidth: min(290, availableSignWidth + 54), alignment: .leading)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          HomeEmblem(theme: theme)
            .accessibilityHidden(true)

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
        }

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
              .frame(width: accountWidth, height: accountWidth)
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
      .homeGlassChrome(
        tint: presentation.isLeroys ? LeroysPalette.brass : theme.chromeTint,
        cornerRadius: 20,
        fillOpacity: presentation.isLeroys ? 0.025 : 0.08,
        innerWhiteOpacity: presentation.isLeroys ? 0.18 : 0.82,
        innerTintOpacity: presentation.isLeroys ? 0.045 : 0.14,
        borderOpacity: presentation.isLeroys ? 0.74 : 0.20,
        highlightOpacity: presentation.isLeroys ? 0.24 : 0.66
      )
    }
    .frame(height: presentation.isLeroys ? 126 : 76)
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

private struct HomeStatusPaperBanner: View {
  let theme: HomeTheme
  let environment: AppEnvironment

  var body: some View {
    TimelineView(.periodic(from: .now, by: 30)) { context in
      HStack(spacing: 8) {
        HStack(spacing: 5) {
          PulsingDot(color: theme.liveDot)
            .frame(width: 9, height: 9)
          Text(environment.isProduction ? "LIVE" : environment.displayName.uppercased())
            .font(.system(size: 10, weight: .heavy, design: .monospaced))
            .tracking(1.8)
            .foregroundStyle(theme.liveDot)
        }

        Rectangle()
          .fill(LeroysPalette.paperInk.opacity(0.52))
          .frame(width: 13, height: 0.7)

        Text(DateFormatter.headerStamp.string(from: context.date).uppercased())
          .font(.system(size: 10, weight: .bold, design: .monospaced))
          .tracking(1.55)
          .foregroundStyle(LeroysPalette.paperInk.opacity(0.80))
          .lineLimit(1)
          .minimumScaleFactor(0.78)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        ZStack {
          PaperSlipShape()
            .fill(
              LinearGradient(
                colors: [
                  LeroysPalette.paper.opacity(0.98),
                  LeroysPalette.nicotineCream.opacity(0.94),
                  Color(red: 0.780, green: 0.665, blue: 0.465).opacity(0.95)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )

          PaperSlipShape()
            .stroke(LeroysPalette.paperInk.opacity(0.10), lineWidth: 0.7)

          FilmGrain(intensity: 0.055, seed: 715)
            .opacity(0.16)
            .clipShape(PaperSlipShape())
        }
        .shadow(color: .black.opacity(0.26), radius: 8, y: 4)
      }
      .overlay(alignment: .topLeading) {
        LeroyTape()
          .rotationEffect(.degrees(-18))
          .offset(x: -8, y: -8)
      }
      .overlay(alignment: .topTrailing) {
        LeroyTape()
          .rotationEffect(.degrees(20))
          .offset(x: 6, y: -8)
      }
      .overlay(alignment: .bottomTrailing) {
        LeroyTape(width: 26, height: 9)
          .rotationEffect(.degrees(-22))
          .offset(x: 9, y: 6)
      }
    }
  }
}

private struct PaperSlipShape: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    let tear: CGFloat = min(9, rect.height * 0.28)
    path.move(to: CGPoint(x: tear * 0.6, y: 0))
    path.addLine(to: CGPoint(x: rect.maxX - tear, y: 0))
    path.addLine(to: CGPoint(x: rect.maxX - tear * 0.35, y: rect.height * 0.23))
    path.addLine(to: CGPoint(x: rect.maxX - tear * 0.9, y: rect.height * 0.50))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.height * 0.78))
    path.addLine(to: CGPoint(x: rect.maxX - tear * 0.7, y: rect.maxY))
    path.addLine(to: CGPoint(x: tear, y: rect.maxY))
    path.addLine(to: CGPoint(x: tear * 0.25, y: rect.height * 0.76))
    path.addLine(to: CGPoint(x: tear * 0.75, y: rect.height * 0.52))
    path.addLine(to: CGPoint(x: 0, y: rect.height * 0.27))
    path.closeSubpath()
    return path
  }
}

private struct LeroyTape: View {
  var width: CGFloat = 30
  var height: CGFloat = 10

  var body: some View {
    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
      .fill(
        LinearGradient(
          colors: [
            LeroysPalette.nicotineCream.opacity(0.52),
            Color.white.opacity(0.28),
            LeroysPalette.paper.opacity(0.46)
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      )
      .overlay {
        RoundedRectangle(cornerRadius: 1.5, style: .continuous)
          .stroke(.white.opacity(0.18), lineWidth: 0.5)
      }
      .frame(width: width, height: height)
      .shadow(color: .black.opacity(0.18), radius: 2, y: 1)
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
  let presentation: RestaurantPresentation
  let namespace: Namespace.ID
  let onSelect: (String) -> Void

  var body: some View {
    ZStack {
      switcherShell

      HStack(spacing: 0) {
        ForEach(options) { option in
          let identity = RestaurantSwitcherIdentity.resolve(slug: option.slug)
          HomeRestaurantIdentitySwitcherSegment(
            option: option,
            identity: identity,
            isSelected: option.slug == selectedSlug,
            namespace: namespace,
            onSelect: onSelect
          )

          if option.id != options.last?.id {
            Rectangle()
              .fill(
                LinearGradient(
                  colors: [
                    LeroysPalette.brass.opacity(0.18),
                    AppPalette.cobalt.opacity(0.40),
                    AppPalette.terracotta.opacity(0.28)
                  ],
                  startPoint: .top,
                  endPoint: .bottom
                )
              )
              .frame(width: 1, height: 44)
              .padding(.vertical, 5)
          }
        }
      }
      .padding(5)
    }
    .frame(height: 64)
    .accessibilityElement(children: .contain)
  }

  private var switcherShell: some View {
    RoundedRectangle(cornerRadius: 23, style: .continuous)
      .fill(.white.opacity(presentation.isLeroys ? 0.060 : 0.22))
      .overlay {
        RoundedRectangle(cornerRadius: 23, style: .continuous)
          .stroke(
            LinearGradient(
              colors: [
                LeroysPalette.brass.opacity(0.90),
                AppPalette.marigold.opacity(0.72),
                AppPalette.cobalt.opacity(0.58),
                AppPalette.terracotta.opacity(0.72)
              ],
              startPoint: .leading,
              endPoint: .trailing
            ),
            lineWidth: 1.15
          )
      }
      .overlay {
        RoundedRectangle(cornerRadius: 19, style: .continuous)
          .stroke(.white.opacity(presentation.isLeroys ? 0.24 : 0.48), lineWidth: 0.75)
          .padding(4)
      }
      .shadow(color: .black.opacity(presentation.isLeroys ? 0.32 : 0.14), radius: 16, y: 8)
  }
}

private struct HomeRestaurantIdentitySwitcherSegment: View {
  let option: HomeRestaurantOption
  let identity: RestaurantSwitcherIdentity
  let isSelected: Bool
  let namespace: Namespace.ID
  let onSelect: (String) -> Void

  var body: some View {
    Button {
      onSelect(option.slug)
    } label: {
      ZStack {
        identityBase

        if isSelected {
          selectedChrome
            .matchedGeometryEffect(id: "restaurant-switcher-selected", in: namespace)
        }

        VStack(spacing: 6) {
          Text(option.label.uppercased())
            .font(identity.titleFont)
            .tracking(identity.tracking)
            .foregroundStyle(isSelected ? identity.selectedText : identity.inactiveText)
            .shadow(color: identity.textShadow.opacity(isSelected ? 0.70 : 0.22), radius: isSelected ? 5 : 2, y: 1)
            .lineLimit(1)
            .minimumScaleFactor(0.72)

          identityRule
        }
        .padding(.horizontal, 13)
      }
      .frame(maxWidth: .infinity)
      .frame(height: 54)
      .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(option.label)
    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
  }

  @ViewBuilder
  private var identityBase: some View {
    switch identity.kind {
    case .leroys:
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              LeroysPalette.boardLift.opacity(isSelected ? 0.94 : 0.62),
              LeroysPalette.board.opacity(isSelected ? 0.96 : 0.54),
              Color.black.opacity(isSelected ? 0.72 : 0.42)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
        .overlay {
          ArtDecoChevronPattern(color: LeroysPalette.brass.opacity(isSelected ? 0.10 : 0.055), spacing: 26, lineWidth: 0.55)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    case .elRoys:
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              AppPalette.parchment.opacity(isSelected ? 0.98 : 0.84),
              AppPalette.linen.opacity(isSelected ? 0.96 : 0.72),
              Color(red: 0.835, green: 0.640, blue: 0.430).opacity(isSelected ? 0.62 : 0.42)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
        .overlay {
          PunchedTinDiamondPattern(color: AppPalette.terracotta.opacity(isSelected ? 0.20 : 0.15), spacing: 19, lineWidth: 0.55)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .overlay(alignment: .top) {
          CantinaEdgePattern(color: AppPalette.terracotta.opacity(isSelected ? 0.60 : 0.44))
            .frame(height: 8)
            .padding(.horizontal, 18)
            .padding(.top, 5)
        }
        .overlay(alignment: .bottom) {
          CantinaEdgePattern(color: AppPalette.terracotta.opacity(isSelected ? 0.52 : 0.36))
            .frame(height: 8)
            .padding(.horizontal, 18)
            .padding(.bottom, 5)
        }
    }
  }

  private var selectedChrome: some View {
    RoundedRectangle(cornerRadius: 19, style: .continuous)
      .stroke(
        LinearGradient(
          colors: identity.selectedBorder,
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        ),
        lineWidth: 1.35
      )
      .background {
        RoundedRectangle(cornerRadius: 19, style: .continuous)
          .fill(identity.selectedGlow.opacity(0.12))
      }
      .shadow(color: identity.selectedGlow.opacity(0.38), radius: 12, y: 5)
      .padding(0.5)
  }

  @ViewBuilder
  private var identityRule: some View {
    switch identity.kind {
    case .leroys:
      HStack(spacing: 6) {
        Rectangle().fill(identity.ruleGradient).frame(height: 1)
        Diamond()
          .fill(LeroysPalette.brass.opacity(isSelected ? 0.98 : 0.58))
          .frame(width: 6, height: 6)
        Rectangle().fill(identity.ruleGradient).frame(height: 1)
      }
      .frame(maxWidth: 122)
    case .elRoys:
      HStack(spacing: 6) {
        Rectangle().fill(identity.ruleGradient).frame(height: 1)
        Image(systemName: "sun.max.fill")
          .font(.system(size: 7, weight: .bold))
          .foregroundStyle(AppPalette.cobalt.opacity(isSelected ? 0.92 : 0.66))
        Rectangle().fill(identity.ruleGradient).frame(height: 1)
      }
      .frame(maxWidth: 120)
    }
  }
}

private struct RestaurantSwitcherIdentity {
  enum Kind {
    case leroys
    case elRoys
  }

  let kind: Kind
  let titleFont: Font
  let tracking: CGFloat
  let selectedText: Color
  let inactiveText: Color
  let textShadow: Color
  let selectedGlow: Color
  let selectedBorder: [Color]
  let ruleGradient: LinearGradient

  static func resolve(slug: String) -> RestaurantSwitcherIdentity {
    slug == "el-roys-cantina" ? .elRoys : .leroys
  }

  static let leroys = RestaurantSwitcherIdentity(
    kind: .leroys,
    titleFont: .custom("Didot-Bold", size: 18),
    tracking: 2.1,
    selectedText: Color(red: 0.980, green: 0.945, blue: 0.890),
    inactiveText: Color(red: 0.820, green: 0.705, blue: 0.545),
    textShadow: .black,
    selectedGlow: LeroysPalette.brass,
    selectedBorder: [
      LeroysPalette.brass.opacity(0.96),
      AppPalette.marigold.opacity(0.85),
      LeroysPalette.fadedBeerRed.opacity(0.58)
    ],
    ruleGradient: LinearGradient(
      colors: [
        LeroysPalette.brass.opacity(0),
        LeroysPalette.brass.opacity(0.92),
        AppPalette.marigold.opacity(0.75),
        LeroysPalette.brass.opacity(0)
      ],
      startPoint: .leading,
      endPoint: .trailing
    )
  )

  static let elRoys = RestaurantSwitcherIdentity(
    kind: .elRoys,
    titleFont: .custom("Copperplate-Bold", size: 18),
    tracking: 1.35,
    selectedText: Color(red: 0.360, green: 0.120, blue: 0.075),
    inactiveText: Color(red: 0.560, green: 0.205, blue: 0.125),
    textShadow: .white,
    selectedGlow: AppPalette.terracotta,
    selectedBorder: [
      AppPalette.terracotta.opacity(0.92),
      AppPalette.marigold.opacity(0.64),
      AppPalette.cobalt.opacity(0.86)
    ],
    ruleGradient: LinearGradient(
      colors: [
        AppPalette.cobalt.opacity(0),
        AppPalette.cobalt.opacity(0.92),
        AppPalette.cobalt.opacity(0.92),
        AppPalette.cobalt.opacity(0)
      ],
      startPoint: .leading,
      endPoint: .trailing
    )
  )
}

private struct CantinaEdgePattern: View {
  let color: Color

  var body: some View {
    GeometryReader { geometry in
      Path { path in
        let step: CGFloat = 10
        var x: CGFloat = 0
        while x < geometry.size.width {
          path.move(to: CGPoint(x: x, y: geometry.size.height * 0.20))
          path.addLine(to: CGPoint(x: x + step * 0.35, y: geometry.size.height * 0.72))
          path.addLine(to: CGPoint(x: x + step * 0.70, y: geometry.size.height * 0.20))
          path.move(to: CGPoint(x: x + step * 0.78, y: geometry.size.height * 0.50))
          path.addLine(to: CGPoint(x: x + step, y: geometry.size.height * 0.50))
          x += step * 1.26
        }
      }
      .stroke(color, lineWidth: 1)
    }
  }
}

private struct Diamond: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.midX, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
    path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
    path.closeSubpath()
    return path
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
          Text(hasLoadedData ? "No updates in the last \(homeRecentUpdatesLimit) entries." : "Loading recent updates…")
            .font(theme.body(14, weight: .medium, italic: true))
            .foregroundStyle(theme.subtleText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
      } else {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(Array(updates.prefix(homeRecentUpdatesLimit).enumerated()), id: \.element.id) { index, update in
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
  let presentation: RestaurantPresentation
  let drinksCount: Int?
  let foodCount: Int?
  let drinksDestination: AppDestination?
  let foodDestination: AppDestination?

  var body: some View {
    let tiles: [(type: String, destination: AppDestination?, tile: HomeEditTile)] = [
      (
        "drinks",
        drinksDestination,
        HomeEditTile(
          chapter: presentation.isLeroys ? "VOL. 02" : "VOL. 01",
          kind: presentation.isLeroys ? "DRINKS" : (theme.motif == .chevron ? "LIQUID" : "BEBIDAS"),
          title: "Edit Drinks",
          countLabel: countLabel(for: drinksCount),
          icon: "wineglass.fill",
          menuType: "drinks",
          theme: theme,
          presentation: presentation
        )
      ),
      (
        "food",
        foodDestination,
        HomeEditTile(
          chapter: presentation.isLeroys ? "VOL. 01" : "VOL. 02",
          kind: presentation.isLeroys ? "FOOD" : (theme.motif == .chevron ? "PLATES" : "COCINA"),
          title: "Edit Food",
          countLabel: countLabel(for: foodCount),
          icon: "fork.knife",
          menuType: "food",
          theme: theme,
          presentation: presentation
        )
      )
    ].sorted { lhs, rhs in
      presentation.orderedMenuTypes.firstIndex(of: lhs.type) ?? 99 <
        presentation.orderedMenuTypes.firstIndex(of: rhs.type) ?? 99
    }

    GeometryReader { geometry in
      let tileWidth = Swift.max(0, (geometry.size.width - 12) / 2)

      HStack(spacing: 12) {
        ForEach(tiles, id: \.type) { entry in
          editTile(action: entry.destination, tile: entry.tile)
            .frame(width: tileWidth)
        }
      }
      .frame(width: geometry.size.width, alignment: .leading)
    }
    .frame(height: 190)
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
  let menuType: String
  let theme: HomeTheme
  let presentation: RestaurantPresentation

  var body: some View {
    if presentation.isLeroys {
      leroysBody
    } else {
      standardBody
    }
  }

  private var standardBody: some View {
    tileContent(titleFontSize: 24, titleTracking: theme.motif == .chevron ? 0.5 : 0.0)
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

  private var leroysBody: some View {
    tileContent(titleFontSize: 25, titleTracking: 0.15)
      .frame(maxWidth: .infinity, minHeight: 166, alignment: .topLeading)
      .padding(16)
      .background(leroysPanelBackground, in: RoundedRectangle(cornerRadius: 21, style: .continuous))
      .overlay {
        leroysMenuArtwork
          .clipShape(RoundedRectangle(cornerRadius: 21, style: .continuous))
          .allowsHitTesting(false)
      }
      .overlay(alignment: .top) {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 0.7)
          .padding(5)
      }
      .overlay {
        RoundedRectangle(cornerRadius: 21, style: .continuous)
          .stroke(leroysPanelBorder, lineWidth: 1.25)
      }
      .overlay(alignment: .bottom) {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(LeroysPalette.fadedBeerRed.opacity(menuType == "food" ? 0.38 : 0.20), lineWidth: 0.8)
          .padding(.horizontal, 8)
          .padding(.vertical, 7)
      }
      .shadow(color: .black.opacity(0.34), radius: 18, y: 10)
  }

  private func tileContent(titleFontSize: CGFloat, titleTracking: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: presentation.isLeroys ? 5 : 2) {
          Text(chapter)
            .font(.system(size: presentation.isLeroys ? 10.5 : 9.5, weight: .bold, design: .monospaced))
            .tracking(presentation.isLeroys ? 2.0 : 1.6)
            .foregroundStyle(presentation.isLeroys ? LeroysPalette.chalkCream.opacity(0.92) : theme.tileKickerTint)
          Text(kind)
            .font(theme.display(presentation.isLeroys ? 13 : 11, weight: .bold))
            .tracking(presentation.isLeroys ? 3.1 : 2.2)
            .foregroundStyle(presentation.isLeroys ? LeroysPalette.fadedBeerRed.opacity(0.96) : theme.tileKickerTint.opacity(0.85))
        }
        Spacer()
        if !presentation.isLeroys {
          Image(systemName: icon)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(theme.tileIconTint)
            .frame(width: 30, height: 30)
            .background(theme.tileIconTint.opacity(0.16), in: Circle())
            .overlay(Circle().stroke(theme.tileIconTint.opacity(0.40), lineWidth: 0.6))
        }
      }

      Spacer(minLength: 4)

      Text(title)
        .font(theme.display(titleFontSize, weight: .bold))
        .tracking(titleTracking)
        .foregroundStyle(presentation.isLeroys ? LeroysPalette.nicotineCream : theme.tileTitleText)
        .shadow(color: .black.opacity(presentation.isLeroys ? 0.52 : 0), radius: 4, y: 2)
        .lineLimit(1)
        .minimumScaleFactor(0.7)

      leroysOrStandardRule
        .frame(maxWidth: presentation.isLeroys ? 126 : 52)

      Text(countLabel)
        .font(.system(size: presentation.isLeroys ? 10.5 : 9.5, weight: .bold, design: .monospaced))
        .tracking(presentation.isLeroys ? 1.9 : 1.6)
        .foregroundStyle(presentation.isLeroys ? LeroysPalette.chalkCream.opacity(0.86) : theme.tileSubtleText)
    }
  }

  private var leroysPanelBackground: LinearGradient {
    LinearGradient(
      colors: menuType == "food"
        ? [
          Color(red: 0.135, green: 0.105, blue: 0.074),
          Color(red: 0.078, green: 0.061, blue: 0.046),
          Color(red: 0.045, green: 0.034, blue: 0.027)
        ]
        : [
          Color(red: 0.118, green: 0.096, blue: 0.070),
          Color(red: 0.067, green: 0.056, blue: 0.045),
          Color(red: 0.036, green: 0.030, blue: 0.026)
        ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  private var leroysPanelBorder: LinearGradient {
    LinearGradient(
      colors: [
        LeroysPalette.brass.opacity(0.88),
        LeroysPalette.chalkCream.opacity(0.38),
        LeroysPalette.fadedBeerRed.opacity(menuType == "food" ? 0.54 : 0.26),
        LeroysPalette.brass.opacity(0.70)
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  private var leroysOrStandardRule: some View {
    HStack(spacing: 8) {
      Rectangle()
        .fill(ruleGradient)
        .frame(height: 1)
      Image(systemName: "star.fill")
        .font(.system(size: 8, weight: .bold))
        .foregroundStyle(presentation.isLeroys ? LeroysPalette.tvBlue.opacity(0.95) : theme.tileIconTint.opacity(0.60))
      Rectangle()
        .fill(ruleGradient)
        .frame(height: 1)
    }
  }

  private var ruleGradient: LinearGradient {
    LinearGradient(
      colors: presentation.isLeroys
        ? [LeroysPalette.brass.opacity(0.95), LeroysPalette.brass.opacity(0.08)]
        : [theme.tileIconTint.opacity(0.6), theme.tileIconTint.opacity(0.6)],
      startPoint: .leading,
      endPoint: .trailing
    )
  }

  @ViewBuilder
  private var leroysMenuArtwork: some View {
    Image(menuType == "food" ? "LeroysFoodGhostArt" : "LeroysDrinksGhostArt")
      .resizable()
      .scaledToFit()
      .frame(width: menuType == "food" ? 154 : 162, height: menuType == "food" ? 154 : 162)
      .blendMode(.screen)
      .opacity(menuType == "food" ? 0.36 : 0.34)
      .offset(x: menuType == "food" ? 25 : 30, y: menuType == "food" ? 21 : 18)
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
  let presentation: RestaurantPresentation

  var body: some View {
    VStack(spacing: 10) {
      ForEach(presentation.orderedMenuTypes, id: \.self) { type in
        row(
          destination: restaurant.map { AppDestination.publicMenu($0, initialType: type) },
          label: type == "food" ? "View Food" : "View Drinks",
          icon: type == "food" ? "fork.knife" : "wineglass"
        )
      }
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

// MARK: - Calendar reminder

private struct HomeCalendarReminderCard: View {
  let restaurant: RestaurantRecord?
  let theme: HomeTheme
  let isScheduling: Bool
  let onSchedule: () -> Void

  var body: some View {
    Button(action: onSchedule) {
      HStack(spacing: 14) {
        Image(systemName: "calendar.badge.clock")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(theme.accentCool)
          .frame(width: 32, height: 32)
          .background(theme.accentCool.opacity(0.14), in: Circle())
          .overlay(Circle().stroke(theme.accentCool.opacity(0.35), lineWidth: 0.6))

        VStack(alignment: .leading, spacing: 3) {
          Text("MENU REVIEW")
            .font(.system(size: 9.5, weight: .bold, design: .monospaced))
            .tracking(1.7)
            .foregroundStyle(theme.accentCool)
          Text(restaurant.map { "Add calendar reminder for \($0.name)" } ?? "Add calendar reminder")
            .font(theme.body(15, weight: .semibold))
            .foregroundStyle(theme.surfaceBodyText)
            .multilineTextAlignment(.leading)
        }

        Spacer()

        if isScheduling {
          ProgressView()
            .controlSize(.small)
            .tint(theme.accentCool)
        } else {
          Image(systemName: "plus")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(theme.accentCool)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(theme.rowSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(theme.rowBorder, lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
    .disabled(restaurant == nil || isScheduling)
    .accessibilityLabel("Add menu review calendar reminder")
    .accessibilityHint("Creates a Calendar event for the selected restaurant's next menu review.")
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

private enum HomeTypography {
  enum Weight { case regular, medium, semibold, bold }
}

// MARK: - Glass modifiers

private struct HomeGlassChromeModifier: ViewModifier {
  let tint: Color
  let cornerRadius: CGFloat
  var fillOpacity: Double = 0.08
  var innerWhiteOpacity: Double = 0.82
  var innerTintOpacity: Double = 0.14
  var borderOpacity: Double = 0.20
  var highlightOpacity: Double = 0.66

  func body(content: Content) -> some View {
    let innerRadius = max(18, cornerRadius - 7)

    content
      .background {
        ZStack {
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(tint.opacity(fillOpacity))

          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .stroke(tint.opacity(borderOpacity), lineWidth: 1.15)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .fill(
              LinearGradient(
                colors: [
                  .white.opacity(innerWhiteOpacity),
                  tint.opacity(innerTintOpacity),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .padding(6)

          RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
            .stroke(.white.opacity(highlightOpacity), lineWidth: 0.7)
            .padding(6)
        }
        .shadow(color: tint.opacity(fillOpacity + 0.02), radius: 22, y: 12)
        .shadow(color: themeShadow(tint: tint), radius: 20, y: 12)
      }
  }

  private func themeShadow(tint: Color) -> Color {
    tint.opacity(0.06)
  }
}

private extension View {
  func homeGlassChrome(
    tint: Color,
    cornerRadius: CGFloat,
    fillOpacity: Double = 0.08,
    innerWhiteOpacity: Double = 0.82,
    innerTintOpacity: Double = 0.14,
    borderOpacity: Double = 0.20,
    highlightOpacity: Double = 0.66
  ) -> some View {
    modifier(HomeGlassChromeModifier(
      tint: tint,
      cornerRadius: cornerRadius,
      fillOpacity: fillOpacity,
      innerWhiteOpacity: innerWhiteOpacity,
      innerTintOpacity: innerTintOpacity,
      borderOpacity: borderOpacity,
      highlightOpacity: highlightOpacity
    ))
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

  static let calendarReminderStamp: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return formatter
  }()
}
