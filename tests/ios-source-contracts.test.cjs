const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

test('iOS source-shape contracts are repo-level checks, not app-hosted XCTest file reads', () => {
  const testsSource = read('ios/ElRoysManagerAppTests/MenuDocumentTests.swift');

  assert.doesNotMatch(testsSource, /String\(contentsOf:\s*\w+SourceURL\(\)/);
  assert.doesNotMatch(testsSource, /resolveSourceFileURL/);
  assert.doesNotMatch(testsSource, /Unable to locate/);
});

test('iOS menu editor keeps list-backed trailing swipe and visible reorder controls', () => {
  const menuViews = read('ios/ElRoysManagerApp/Features/Menu/MenuViews.swift');
  const categoryCard = sourceBetween(
    menuViews,
    'private struct MenuEditorCategoryCard',
    'private struct MenuEditorSwipeList'
  );
  const swipeList = sourceBetween(
    menuViews,
    'private struct MenuEditorSwipeList',
    'private struct MenuEditorOffMenuRecoveryCard'
  );
  assert.match(categoryCard, /Button\(action:\s*onToggleReorder\)/);
  assert.match(categoryCard, /Done Reordering/);
  assert.doesNotMatch(categoryCard, /Menu\s*\{/);
  assert.doesNotMatch(categoryCard, /ellipsis\.circle\.fill/);

  assert.match(menuViews, /private struct MenuEditorRowHeightPreferenceKey/);
  assert.match(swipeList, /List\s*\{/);
  assert.match(swipeList, /\.swipeActions\(edge:\s*\.trailing,\s*allowsFullSwipe:\s*true\)/);
  assert.doesNotMatch(swipeList, /\.swipeActions\(edge:\s*\.leading/);
  assert.doesNotMatch(swipeList, /Label\("Off Menu"/);
  assert.match(swipeList, /\.onMove/);
  assert.doesNotMatch(swipeList, /\.frame\(height:\s*estimatedListHeight\)/);

  assert.match(menuViews, /Move To Off Menu/);
});

test('iOS restaurant tools expose category management entry point', () => {
  const toolsView = read('ios/ElRoysManagerApp/Features/RestaurantTools/RestaurantToolsView.swift');
  const appEntry = read('ios/ElRoysManagerApp/App/ElRoysManagerApp.swift');

  assert.match(toolsView, /Manage Categories/);
  assert.match(toolsView, /Edit Menu Items/);
  assert.match(appEntry, /case categoryTools\(MenuRecord\)/);
  assert.match(appEntry, /RestaurantCategoryManagementScreen/);
});

test('iOS source contracts preserve reorder mutation and account deletion copy', () => {
  const appModels = read('ios/ElRoysManagerApp/Models/AppModels.swift');
  const appModel = read('ios/ElRoysManagerApp/App/AppModel.swift');
  const homeViews = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');

  assert.match(appModels, /mutating func moveVisibleItems\(in categoryKey: String, from source: IndexSet, to destination: Int\)/);
  assert.match(appModel, /within 30 days/);
  assert.match(homeViews, /Account Deletion Details/);
});

test('iOS Leroy theme resolver owns restaurant-specific public presentation rules', () => {
  const design = read('ios/ElRoysManagerApp/Design/Glass.swift');

  assert.match(design, /enum RestaurantPresentation/);
  assert.match(design, /case leroys/);
  assert.match(design, /case standard/);
  assert.match(design, /static func resolve\(restaurant:/);
  assert.match(design, /static func resolve\(menu:/);
  assert.match(design, /var publicSoldOutLabel: String/);
  assert.match(design, /return "Sold Out"/);
  assert.match(design, /func showsFeaturedSpecials\(selectedType: String\) -> Bool/);
  assert.match(design, /selectedType\.lowercased\(\) == "food"/);
  assert.match(design, /var orderedMenuTypes: \[String\]/);
  assert.match(design, /\["food", "drinks"\]/);
});

test('iOS Leroy home removes decorative dock and uses hero sign background assets', () => {
  const homeViews = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');

  assert.doesNotMatch(homeViews, /\.safeAreaInset\(edge:\s*\.bottom\)\s*\{\s*HomeBottomNav/);
  assert.doesNotMatch(homeViews, /private struct HomeBottomNav/);
  assert.doesNotMatch(homeViews, /qrcode\.viewfinder/);
  assert.match(homeViews, /Image\("LeroysHeroSign"\)/);
  assert.match(homeViews, /Image\("LeroysWallBackground"\)/);
  assert.match(homeViews, /RestaurantPresentation\.resolve\(restaurant:/);
  assert.match(homeViews, /presentation\.orderedMenuTypes/);
});

test('iOS Leroy public menu is themed, food-first, and uses guest sold-out language', () => {
  const publicViews = read('ios/ElRoysManagerApp/Features/Public/PublicMenuViews.swift');

  assert.match(publicViews, /RestaurantPresentation\.resolve\(restaurant:\s*restaurant\)/);
  assert.match(publicViews, /LeroysPublicMenuView/);
  assert.match(publicViews, /LeroysSpecialsSlip/);
  assert.match(publicViews, /presentation\.showsFeaturedSpecials\(selectedType:/);
  assert.match(publicViews, /presentation\.publicSoldOutLabel/);
  assert.doesNotMatch(publicViews, /Text\("86'D"\)/);
});

test('iOS Leroy public menu hero centers sign and uses guest-facing preview copy', () => {
  const publicViews = read('ios/ElRoysManagerApp/Features/Public/PublicMenuViews.swift');
  const hero = sourceBetween(
    publicViews,
    'private struct LeroysPublicMenuHero',
    'private struct LeroysSpecialsSlip'
  );

  assert.match(hero, /Image\("LeroysHeroSign"\)/);
  assert.match(hero, /\.frame\(maxWidth:\s*\.infinity,\s*alignment:\s*\.center\)/);
  assert.match(hero, /LeroysLiveMenuPreviewButton/);
  assert.match(hero, /Open Live Menu/);
  assert.match(hero, /See it just like guests do\./);
  assert.doesNotMatch(hero, /Open exact route preview/);
  assert.doesNotMatch(hero, /deployed route/);
});

test('iOS exact route preview uses SFSafariViewController instead of embedded WKWebView', () => {
  const routePreview = read('ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift');

  assert.match(routePreview, /import SafariServices/);
  assert.match(routePreview, /SFSafariViewController/);
  assert.doesNotMatch(routePreview, /import WebKit/);
  assert.doesNotMatch(routePreview, /WKWebView/);
});

test('iOS login screen does not show demo credentials in production copy', () => {
  const source = read('ios/ElRoysManagerApp/Features/Auth/AuthViews.swift');
  assert.doesNotMatch(source, /manager@elroys\.example/);
  assert.doesNotMatch(source, /••••••••/);
  assert.match(source, /TextField\("Email", text: \$model\.email\)/);
  assert.match(source, /SecureField\("Password", text: \$model\.password\)/);
});

test('iOS launch smoke test uses deterministic anonymous bootstrap', () => {
  const appModel = read('ios/ElRoysManagerApp/App/AppModel.swift');
  const uiTest = read('ios/ElRoysManagerAppUITests/ElRoysManagerAppUITests.swift');

  assert.match(uiTest, /app\.launchArguments\.append\("--ui-testing"\)/);
  assert.match(appModel, /ProcessInfo\.processInfo\.arguments\.contains\("--ui-testing"\)/);
  assert.match(appModel, /bootstrap = \.uiTestingAnonymous/);
  assert.match(appModel, /isLaunching = false/);
});

test('iOS product lookup sends current menu id with barcode requests', () => {
  const backendClients = read('ios/ElRoysManagerApp/Clients/BackendClients.swift');
  const appModel = read('ios/ElRoysManagerApp/App/AppModel.swift');

  assert.match(backendClients, /protocol ProductLookupClienting\s*\{[\s\S]*func lookup\(upc: String, menuId: String, accessToken: String\)/);
  assert.match(backendClients, /private struct ProductLookupRequest: Encodable\s*\{[\s\S]*var menuId: String/);
  assert.match(backendClients, /ProductLookupRequest\(action: "product_lookup", barcode: trimmed, menuId: menuId\)/);
  assert.match(appModel, /guard let currentMenuId else \{\s*throw BackendError\.server\(message: "Select a menu before scanning\."\)\s*\}/);
  assert.match(appModel, /services\.productLookup\.lookup\(upc: barcode, menuId: currentMenuId, accessToken: accessToken\)/);
});

test('iOS backend client exposes string public menu revision fetch', () => {
  const source = read('ios/ElRoysManagerApp/Clients/BackendClients.swift');

  assert.match(source, /protocol PublicMenuRevisionClienting\s*\{[\s\S]*func fetchRevision\(menuId: String\) async throws -> MenuRevisionPayload/);
  assert.match(source, /struct MenuRevisionPayload: Decodable\s*\{[\s\S]*let menuId: String/);
  assert.match(source, /struct MenuRevisionPayload: Decodable\s*\{[\s\S]*let revision: String\?/);
  assert.match(source, /struct MenuRevisionPayload: Decodable\s*\{[\s\S]*let lastUpdatedTs: Int\?/);
  assert.match(source, /struct MenuRevisionPayload: Decodable\s*\{[\s\S]*let lastSentTs: Int\?/);
  assert.doesNotMatch(source, /let revision: Int64\?/);
  assert.match(source, /final class PublicMenuRevisionClient: PublicMenuRevisionClienting/);
  assert.match(source, /URLQueryItem\(name: "action", value: "revision"\)/);
  assert.match(source, /URLQueryItem\(name: "menu_id", value: menuId\)/);
});

test('iOS editor monitor gates public revision before fetching full workspace', () => {
  const source = read('ios/ElRoysManagerApp/App/AppModel.swift');
  const body = sourceBetween(
    source,
    'func checkForRemoteMenuUpdate(menuId: String, force: Bool = false) async',
    'func loadRestaurantTools'
  );

  const revisionFetchIndex = body.indexOf('services.publicMenuRevision.fetchRevision(menuId: menuId)');
  const workspaceFetchIndex = body.indexOf('services.workspace.fetch(menuId: menuId');
  assert.notEqual(revisionFetchIndex, -1, 'missing public revision fetch in remote update monitor');
  assert.notEqual(workspaceFetchIndex, -1, 'missing workspace fetch in remote update monitor');
  assert.ok(
    body.indexOf('if !force') < revisionFetchIndex,
    'revision fetch should be guarded by force == false'
  );
  assert.match(
    body,
    /if !force,\s*let currentWorkspace = currentEditorWorkspace,\s*canUsePublicRevisionPrecheck\(currentWorkspace\) \{/,
    'public revision fetch should only run for eligible non-draft-sensitive workspaces'
  );
  assert.ok(
    revisionFetchIndex < workspaceFetchIndex,
    'revision fetch must happen before full workspace fetch'
  );
  assert.match(body, /publicRevisionPrecheckProvesUnchanged|publicRevisionPayloadMatchesCurrentWorkspace/);
  assert.match(source, /private func canUsePublicRevisionPrecheck\(_ workspace: MenuWorkspacePayload\) -> Bool/);
  assert.match(source, /return !state\.capabilities\.canSaveDraft && !hasWorkspaceDraft && !hasMetaDraft/);
});

test('iOS home screen reserves explicit clearance for bottom navigation', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  assert.match(source, /private let homeBottomNavigationClearance: CGFloat = 132/);
  assert.match(source, /Color\.clear\.frame\(height: homeBottomNavigationClearance\)/);
});

test('iOS home recent updates empty state reflects the programmed entry limit', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  const recentUpdates = sourceBetween(
    source,
    'private struct HomeRecentUpdatesCard',
    'private struct HomeUpdateRow'
  );

  assert.match(source, /private let homeRecentUpdatesLimit = 2/);
  assert.match(source, /Array\(updates\.prefix\(homeRecentUpdatesLimit\)\)/);
  assert.match(recentUpdates, /No updates in the last \\\(homeRecentUpdatesLimit\) entries\./);
  assert.doesNotMatch(recentUpdates, /No sent updates yet\./);
});

test('iOS home edit tiles stay constrained to the viewport', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  const editGrid = sourceBetween(
    source,
    'private struct HomeEditGrid',
    'private struct HomeEditTile'
  );

  assert.match(editGrid, /GeometryReader\s*\{\s*geometry\s+in/);
  assert.match(editGrid, /let tileWidth = Swift\.max\(0,\s*\(geometry\.size\.width - 12\) \/ 2\)/);
  assert.match(editGrid, /\.frame\(width:\s*tileWidth\)/);
  assert.match(editGrid, /\.frame\(width:\s*geometry\.size\.width,\s*alignment:\s*\.leading\)/);
});

test('iOS Leroy home edit tiles use Leroy-specific panels and volume order', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  const editGrid = sourceBetween(
    source,
    'private struct HomeEditGrid',
    'private struct HomeViewRows'
  );

  assert.match(editGrid, /chapter:\s*presentation\.isLeroys \? "VOL\. 02" : "VOL\. 01"/);
  assert.match(editGrid, /chapter:\s*presentation\.isLeroys \? "VOL\. 01" : "VOL\. 02"/);
  assert.match(editGrid, /private var leroysBody/);
  assert.match(editGrid, /Image\(menuType == "food" \? "LeroysFoodGhostArt" : "LeroysDrinksGhostArt"\)/);
  assert.match(editGrid, /\.blendMode\(\.screen\)/);
  assert.match(editGrid, /if !presentation\.isLeroys \{/);
});

test('iOS Leroy home scroll content is pinned to the device width', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  const chooser = sourceBetween(
    source,
    'struct RestaurantChooserView',
    'private var restaurantSwitcherOptions'
  );

  assert.match(chooser, /GeometryReader\s*\{\s*geometry\s+in/);
  assert.match(chooser, /\.frame\(width:\s*geometry\.size\.width,\s*alignment:\s*\.leading\)/);
});

test('iOS Leroy home header and background cannot force page overflow', () => {
  const homeViews = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  const glass = read('ios/ElRoysManagerApp/Design/Glass.swift');
  const header = sourceBetween(
    homeViews,
    'private struct HomeHeader',
    'private var accountDeletionURL'
  );
  const background = sourceBetween(
    glass,
    'struct LeroysWallBackground',
    'struct LeroysChalkboardBackground'
  );

  assert.match(header, /let availableSignWidth = geometry\.size\.width - horizontalPadding - accountWidth - headerGap/);
  assert.match(header, /let signWidth = min\(275,\s*max\(190,\s*availableSignWidth\)\)/);
  assert.match(header, /\.frame\(width:\s*signWidth\)/);
  assert.match(header, /HomeStatusPaperBanner\(theme:\s*theme,\s*environment:\s*environment\)/);
  assert.match(header, /\.frame\(height:\s*presentation\.isLeroys \? 126 : 76\)/);
  assert.match(background, /\.frame\(width:\s*geometry\.size\.width,\s*height:\s*geometry\.size\.height\)/);
  assert.match(background, /\.clipped\(\)/);
});

test('iOS restaurant switcher preserves both restaurant identities', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  const switcher = sourceBetween(
    source,
    'private struct HomeRestaurantSwitcher',
    'private struct HomeRecentUpdatesCard'
  );

  assert.match(switcher, /HomeRestaurantIdentitySwitcherSegment/);
  assert.match(switcher, /RestaurantSwitcherIdentity\.resolve\(slug:\s*option\.slug\)/);
  assert.match(switcher, /case leroys/);
  assert.match(switcher, /case elRoys/);
  assert.match(switcher, /LeroysPalette\.boardLift/);
  assert.match(switcher, /AppPalette\.parchment/);
  assert.match(switcher, /CantinaEdgePattern/);
  assert.match(switcher, /matchedGeometryEffect\(id:\s*"restaurant-switcher-selected"/);
});

test('iOS home menu review reminders use EventKit with permission fallbacks', () => {
  const service = read('ios/ElRoysManagerApp/Features/Home/CalendarReminderService.swift');
  const homeViews = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  const plist = read('ios/ElRoysManagerApp/Info.plist');

  assert.match(service, /import EventKit/);
  assert.match(service, /requestFullAccessToEvents/);
  assert.doesNotMatch(service, /requestAccess\(to: \.event\)/);
  assert.match(service, /CalendarReminderError\.accessDenied|case accessDenied/);
  assert.match(service, /defaultCalendarForNewEvents/);
  assert.match(service, /eventStore\.save/);

  assert.match(homeViews, /HomeCalendarReminderCard/);
  assert.match(homeViews, /calendar\.badge\.clock/);
  assert.match(homeViews, /Add menu review calendar reminder/);

  assert.match(plist, /NSCalendarsFullAccessUsageDescription/);
  assert.match(plist, /NSCalendarsUsageDescription/);
});
