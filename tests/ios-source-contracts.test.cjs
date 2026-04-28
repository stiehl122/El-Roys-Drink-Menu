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

test('iOS home screen reserves explicit clearance for bottom navigation', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  assert.match(source, /private let homeBottomNavigationClearance: CGFloat = 132/);
  assert.match(source, /Color\.clear\.frame\(height: homeBottomNavigationClearance\)/);
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
