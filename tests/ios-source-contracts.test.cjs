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

test('iOS login screen does not show demo credentials in production copy', () => {
  const source = read('ios/ElRoysManagerApp/Features/Auth/AuthViews.swift');
  assert.doesNotMatch(source, /manager@elroys\.example/);
  assert.doesNotMatch(source, /••••••••/);
  assert.match(source, /TextField\("Email", text: \$model\.email\)/);
  assert.match(source, /SecureField\("Password", text: \$model\.password\)/);
});

test('iOS home screen reserves explicit clearance for bottom navigation', () => {
  const source = read('ios/ElRoysManagerApp/Features/Home/HomeViews.swift');
  assert.match(source, /private let homeBottomNavigationClearance: CGFloat = 132/);
  assert.match(source, /Color\.clear\.frame\(height: homeBottomNavigationClearance\)/);
});

test('iOS exact route preview has loading and error states', () => {
  const source = read('ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift');
  assert.match(source, /enum WebPreviewLoadState/);
  assert.match(source, /ProgressView\("Loading preview"/);
  assert.match(source, /Preview unavailable/);
  assert.match(source, /makeCoordinator\(\)/);
  assert.match(source, /webView\(_ webView: WKWebView, didFail/);
});
