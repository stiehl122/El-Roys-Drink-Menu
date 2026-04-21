# Ordering Consistency Server And Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make menu category and item ordering deterministic across all clients by having the server always emit a canonical order and both web and iOS consume that canonical order consistently.

**Architecture:** First, normalize ordering on the server read boundary so every payload leaves the server with explicitly sorted categories and items, including stable tie-breakers when `display_order` values collide. Next, update the web and iOS clients to hydrate from that canonical ordering instead of trusting incidental wire order or preserving stale array order. Keep the fix narrow: do not redesign drafts, persistence, or menu CRUD; only harden read ordering and client hydration around the existing menu model.

**Tech Stack:** Zero-dependency web app, Node/Vercel serverless handlers, CommonJS tests with `node:test`, Swift/iOS app models with XCTest.

---

## File Structure

- Modify: `server/_menu-read.js`
  Responsibility: Canonicalize category/item ordering for workspace and public payloads before any client sees the data.
- Modify: `tests/phase7-server-read-boundaries.test.cjs`
  Responsibility: Lock server payload ordering so regressions are caught in JS tests.
- Modify: `app.js`
  Responsibility: Make web hydration paths consume server-canonical ordering with a shared deterministic comparator instead of ad hoc sorts.
- Modify: `ios/ElRoysManagerApp/Models/AppModels.swift`
  Responsibility: Normalize decoded workspace/public categories and items into canonical display order on iOS.
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`
  Responsibility: Prove iOS applies canonical ordering from payloads, including stable tie-break behavior.

## Ordering Rules To Implement

- Categories sort by `display_order` ascending.
- Regular categories sort ahead of `__uncategorized__`.
- Item arrays sort by `display_order` ascending.
- When `display_order` ties, use a stable secondary key:
  - categories: `key`, then `id`
  - items: `id`, then `name`
- Server-side read models are the source of truth for this ordering.
- Web and iOS should still normalize payloads defensively using the same ordering rules so stale or partially ordered payloads cannot reintroduce divergence.

### Task 1: Canonicalize Server Ordering At The Read Boundary

**Files:**
- Modify: `server/_menu-read.js`
- Test: `tests/phase7-server-read-boundaries.test.cjs`

- [ ] **Step 1: Write the failing server boundary test**

Add this test near the existing `createPublicMenuPayload` assertions in `tests/phase7-server-read-boundaries.test.cjs`:

```js
test('createPublicMenuPayload canonicalizes category and item ordering', () => {
  const payload = helper.createPublicMenuPayload({
    menu: {
      id: 'menu-1',
      slug: 'drinks',
      name: 'Drinks',
      type: 'drinks',
      restaurantId: 'rest-1',
    },
    cats: [
      {
        id: 'cat-z',
        menu_id: 'menu-1',
        key: 'wine',
        label: 'Wine',
        display_order: 2,
        items: [
          { id: 'item-b', name: 'Bordeaux', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'item-a', name: 'Albarino', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'item-c', name: 'Chianti', display_order: 0, on_menu: true, visibility: 'public' },
        ],
      },
      {
        id: 'cat-u',
        menu_id: 'menu-1',
        key: '__uncategorized__',
        label: 'Uncategorized',
        display_order: 0,
        items: [
          { id: 'hidden-1', name: 'Hidden', display_order: 0, on_menu: false, visibility: 'off_menu' },
        ],
      },
      {
        id: 'cat-a',
        menu_id: 'menu-1',
        key: 'beer',
        label: 'Beer',
        display_order: 0,
        items: [
          { id: 'beer-2', name: 'Z Lager', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'beer-1', name: 'A Lager', display_order: 1, on_menu: true, visibility: 'public' },
        ],
      },
    ],
    meta: {},
    restaurant: null,
  });

  assert.deepEqual(payload.cats.map(category => category.key), ['beer', 'wine']);
  assert.deepEqual(payload.cats[0].items.map(item => item.id), ['beer-1', 'beer-2']);
  assert.deepEqual(payload.cats[1].items.map(item => item.id), ['item-c', 'item-a', 'item-b']);
});
```

- [ ] **Step 2: Run the server test to verify it fails**

Run: `node --test tests/phase7-server-read-boundaries.test.cjs`
Expected: FAIL on category and/or item ordering because `createPublicMenuPayload()` currently forwards nested item arrays without canonical sorting.

- [ ] **Step 3: Write the minimal server implementation**

Update `server/_menu-read.js` by adding shared comparators and applying them inside `sanitizePublicCategory()` and `readMenuStateBundle()` normalization:

```js
function numericDisplayOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function compareText(left = '', right = '') {
  return String(left || '').localeCompare(String(right || ''));
}

function compareCategoryOrder(left = {}, right = {}) {
  const leftIsUncategorized = left?.key === '__uncategorized__';
  const rightIsUncategorized = right?.key === '__uncategorized__';
  if (leftIsUncategorized !== rightIsUncategorized) return leftIsUncategorized ? 1 : -1;

  const displayDelta = numericDisplayOrder(left?.display_order) - numericDisplayOrder(right?.display_order);
  if (displayDelta !== 0) return displayDelta;

  const keyDelta = compareText(left?.key, right?.key);
  if (keyDelta !== 0) return keyDelta;

  return compareText(left?.id, right?.id);
}

function compareItemOrder(left = {}, right = {}) {
  const displayDelta = numericDisplayOrder(left?.display_order) - numericDisplayOrder(right?.display_order);
  if (displayDelta !== 0) return displayDelta;

  const idDelta = compareText(left?.id, right?.id);
  if (idDelta !== 0) return idDelta;

  return compareText(left?.name, right?.name);
}

function sortCategoryItems(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort(compareItemOrder);
}

function sortCategories(categories = []) {
  return (Array.isArray(categories) ? categories : []).slice().sort(compareCategoryOrder);
}

function sanitizePublicCategory(category = {}) {
  return {
    id: category.id || '',
    menu_id: category.menu_id || '',
    key: category.key || '',
    label: category.label || '',
    icon: category.icon || '',
    color: category.color || '',
    sub: category.sub || '',
    placeholder: category.placeholder || '',
    display_order: Number.isFinite(Number(category.display_order)) ? Number(category.display_order) : 0,
    items: sortCategoryItems(category.items)
      .filter(isGuestVisibleItem)
      .map(sanitizePublicItem),
  };
}

export async function readMenuStateBundle(menuId) {
  // existing fetches...

  return {
    menu: {
      id: menuRow.id,
      slug: menuRow.slug || '',
      name: menuRow.name || '',
      type: menuRow.type || 'drinks',
      restaurantId: menuRow.restaurant_id || '',
    },
    cats: sortCategories(cats).map(category => ({
      ...category,
      items: sortCategoryItems(category?.items),
    })),
    meta: metaRows?.[0] || {},
    restaurant: restaurantRows?.[0] || null,
    featuredCurrentIds,
  };
}
```

- [ ] **Step 4: Run the server test to verify it passes**

Run: `node --test tests/phase7-server-read-boundaries.test.cjs`
Expected: PASS, including the new canonical ordering assertion.

- [ ] **Step 5: Commit**

```bash
git add server/_menu-read.js tests/phase7-server-read-boundaries.test.cjs
git commit -m "fix: canonicalize menu ordering on server reads"
```

### Task 2: Make Web Hydration Follow Canonical Server Ordering

**Files:**
- Modify: `app.js`
- Test: `tests/manager-item-reorder-draft-state.test.cjs`

- [ ] **Step 1: Write the failing web hydration test**

Add this test to `tests/manager-item-reorder-draft-state.test.cjs`:

```js
test('hydrateState canonicalizes item ties by id after display order', () => {
  const sandbox = loadAppSandbox();

  setState(sandbox, {
    CATEGORY_DEFS: [],
    menuState: {},
  });

  getState(sandbox, `
    hydrateState({
      cats: [{
        id: 'cat-1',
        key: 'beer',
        label: 'Beer',
        display_order: 0,
        items: [
          { id: 'beer-b', name: 'Beta', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'beer-a', name: 'Alpha', display_order: 1, on_menu: true, visibility: 'public' },
          { id: 'beer-c', name: 'Gamma', display_order: 0, on_menu: true, visibility: 'public' }
        ]
      }],
      meta: {},
      restaurant: null
    });
  `);

  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(menuState.beer.items.map(item => item.id)))'),
    ['beer-c', 'beer-a', 'beer-b'],
  );
});
```

- [ ] **Step 2: Run the web test to verify it fails**

Run: `node --test tests/manager-item-reorder-draft-state.test.cjs`
Expected: FAIL because the existing sort only compares `display_order`.

- [ ] **Step 3: Write the minimal web implementation**

Add a shared canonical comparator in `app.js` near the existing menu-state helpers, then use it in both `hydrateState()` and `applyPersistedDraftState()`:

```js
function compareCanonicalText(left = '', right = '') {
  return String(left || '').localeCompare(String(right || ''));
}

function compareCanonicalDisplayOrder(left = {}, right = {}, { keyField = 'id', fallbackField = 'name' } = {}) {
  const displayDelta = Number(left?.display_order || 0) - Number(right?.display_order || 0);
  if (displayDelta !== 0) return displayDelta;

  const keyDelta = compareCanonicalText(left?.[keyField], right?.[keyField]);
  if (keyDelta !== 0) return keyDelta;

  return compareCanonicalText(left?.[fallbackField], right?.[fallbackField]);
}

function sortCanonicalWorkspaceItems(items = []) {
  return (Array.isArray(items) ? items : []).slice().sort((left, right) => (
    compareCanonicalDisplayOrder(left, right, { keyField: 'id', fallbackField: 'name' })
  ));
}

function sortCanonicalWorkspaceCategories(categories = []) {
  return (Array.isArray(categories) ? categories : []).slice().sort((left, right) => {
    const leftIsUncategorized = left?.key === UNCATEGORIZED_ID;
    const rightIsUncategorized = right?.key === UNCATEGORIZED_ID;
    if (leftIsUncategorized !== rightIsUncategorized) return leftIsUncategorized ? 1 : -1;

    return compareCanonicalDisplayOrder(left, right, { keyField: 'key', fallbackField: 'id' });
  });
}

function hydrateState({ cats, meta, restaurant }) {
  const orderedCats = sortCanonicalWorkspaceCategories(cats || []);
  const realCats = orderedCats.filter(c => c.key !== UNCATEGORIZED_ID);
  const uncatCat = orderedCats.find(c => c.key === UNCATEGORIZED_ID);

  // existing category setup...

  realCats.forEach(c => {
    const items = sortCanonicalWorkspaceItems(c.items || [])
      .map(i => hydrateMenuItem(i));
    // existing assignment...
  });

  if (uncatCat) {
    menuState[UNCATEGORIZED_ID] = {
      items: sortCanonicalWorkspaceItems(uncatCat.items || []).map(i => hydrateMenuItem(i, { onMenu: false })),
      lastSent: [],
    };
  }
}

function applyPersistedDraftState(draftState = {}) {
  const cats = sortCanonicalWorkspaceCategories(Array.isArray(draftState?.cats) ? draftState.cats : []);
  if (!cats.length) return false;

  // existing category setup...

  realCats.forEach(cat => {
    menuState[cat.key] = {
      items: sortCanonicalWorkspaceItems(cat.items || []).map(item => hydrateMenuItem(item)),
      lastSent: liveLastSentState[cat.key] || [],
    };
  });

  if (uncatCat) {
    menuState[UNCATEGORIZED_ID] = {
      items: sortCanonicalWorkspaceItems(uncatCat.items || []).map(item => hydrateMenuItem(item, { onMenu: false })),
      lastSent: [],
    };
  }

  return true;
}
```

- [ ] **Step 4: Run the web test to verify it passes**

Run: `node --test tests/manager-item-reorder-draft-state.test.cjs`
Expected: PASS, including the new hydrate canonicalization assertion.

- [ ] **Step 5: Commit**

```bash
git add app.js tests/manager-item-reorder-draft-state.test.cjs
git commit -m "fix: normalize web menu hydration ordering"
```

### Task 3: Make iOS Normalize Server Ordering For Workspace And Public Payloads

**Files:**
- Modify: `ios/ElRoysManagerApp/Models/AppModels.swift`
- Test: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Write the failing iOS tests**

Add these tests to `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`:

```swift
func testEditableMenuDocumentNormalizesItemOrderFromWorkspacePayload() throws {
  let workspace = MenuWorkspacePayload(
    cats: [
      MenuCategoryPayload(
        id: "cat-1",
        menuId: "menu-1",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [
          MenuItemPayload(id: "beer-b", name: "Beta", desc: "", recipe: [], price: "", isEightySixed: false, onMenu: true, visibility: "public", displayOrder: 1, upcharges: [], showDescription: true, showRecipe: false),
          MenuItemPayload(id: "beer-a", name: "Alpha", desc: "", recipe: [], price: "", isEightySixed: false, onMenu: true, visibility: "public", displayOrder: 1, upcharges: [], showDescription: true, showRecipe: false),
          MenuItemPayload(id: "beer-c", name: "Gamma", desc: "", recipe: [], price: "", isEightySixed: false, onMenu: true, visibility: "public", displayOrder: 0, upcharges: [], showDescription: true, showRecipe: false),
        ]
      )
    ],
    meta: MenuMetaPayload(),
    restaurant: nil,
    context: MenuContext(kind: "menu-workspace", menu: MenuRecord(id: "menu-1", slug: "drinks", name: "Drinks", type: "drinks", restaurantId: "rest-1")),
    workspace: MenuWorkspace(),
    capabilities: WorkspaceCapabilities(),
    compatibility: nil,
    restaurantTools: nil
  )

  let document = EditableMenuDocument(workspace: workspace)

  XCTAssertEqual(document.category(for: "beer")?.items.map(\.id), ["beer-c", "beer-a", "beer-b"])
}

func testPublicMenuPayloadDecodingPreservesCanonicalServerOrderAfterNormalization() throws {
  let json = """
  {
    "cats": [
      {
        "id": "cat-1",
        "menuId": "menu-1",
        "key": "beer",
        "label": "Beer",
        "displayOrder": 0,
        "items": [
          { "id": "beer-b", "name": "Beta", "displayOrder": 1, "onMenu": true, "visibility": "public" },
          { "id": "beer-a", "name": "Alpha", "displayOrder": 1, "onMenu": true, "visibility": "public" },
          { "id": "beer-c", "name": "Gamma", "displayOrder": 0, "onMenu": true, "visibility": "public" }
        ]
      }
    ],
    "meta": {},
    "restaurant": null,
    "featuredGroups": [],
    "context": { "kind": "menu-public", "menu": { "id": "menu-1", "slug": "drinks", "name": "Drinks", "type": "drinks", "restaurantId": "rest-1" } },
    "capabilities": { "guestReadable": true, "requiresAuth": false, "includesDraftState": false, "includesNotificationConfig": false }
  }
  """.data(using: .utf8)!

  let decoder = JSONDecoder()
  decoder.keyDecodingStrategy = .convertFromSnakeCase
  let payload = try decoder.decode(PublicMenuPayload.self, from: json)

  XCTAssertEqual(payload.cats.first?.items.map(\.id), ["beer-c", "beer-a", "beer-b"])
}
```

- [ ] **Step 2: Run the iOS tests to verify they fail**

Run: `xcodebuild test -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/MenuDocumentTests`
Expected: FAIL because decoded item arrays preserve payload order instead of canonical sorting.

- [ ] **Step 3: Write the minimal iOS implementation**

Add canonical ordering helpers to `ios/ElRoysManagerApp/Models/AppModels.swift` and apply them in both `EditableMenuDocument` initialization and payload decoding:

```swift
private func canonicalTextCompare(_ left: String, _ right: String) -> Bool {
  left.localizedCaseInsensitiveCompare(right) == .orderedAscending
}

private func canonicalSortedItems(_ items: [MenuItemPayload]) -> [MenuItemPayload] {
  items.sorted { lhs, rhs in
    if lhs.displayOrder != rhs.displayOrder {
      return lhs.displayOrder < rhs.displayOrder
    }
    if lhs.id != rhs.id {
      return canonicalTextCompare(lhs.id, rhs.id)
    }
    return canonicalTextCompare(lhs.name, rhs.name)
  }
}

private func canonicalSortedCategories(_ categories: [MenuCategoryPayload]) -> [MenuCategoryPayload] {
  categories.sorted { lhs, rhs in
    let lhsIsUncategorized = lhs.key == EditableMenuDocument.uncategorizedKey
    let rhsIsUncategorized = rhs.key == EditableMenuDocument.uncategorizedKey
    if lhsIsUncategorized != rhsIsUncategorized {
      return rhsIsUncategorized
    }
    if lhs.displayOrder != rhs.displayOrder {
      return lhs.displayOrder < rhs.displayOrder
    }
    if lhs.key != rhs.key {
      return canonicalTextCompare(lhs.key, rhs.key)
    }
    return canonicalTextCompare(lhs.id, rhs.id)
  }
}

extension MenuCategoryPayload {
  func canonicalized() -> MenuCategoryPayload {
    var next = self
    next.items = canonicalSortedItems(items)
    return next
  }
}

extension PublicMenuPayload {
  mutating func normalizeCanonicalOrdering() {
    cats = canonicalSortedCategories(cats).map { $0.canonicalized() }
  }
}

struct PublicMenuPayload: Codable, Equatable {
  var cats: [MenuCategoryPayload]
  var meta: MenuMetaPayload
  var restaurant: RestaurantRecord?
  var featuredGroups: [FeaturedGroup]
  var context: MenuContext
  var capabilities: PublicMenuCapabilities

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.cats = try container.decodeArray([MenuCategoryPayload].self, forKey: .cats)
    self.meta = try container.decodeIfPresent(MenuMetaPayload.self, forKey: .meta) ?? MenuMetaPayload()
    self.restaurant = try container.decodeIfPresent(RestaurantRecord.self, forKey: .restaurant)
    self.featuredGroups = try container.decodeArray([FeaturedGroup].self, forKey: .featuredGroups)
    self.context = try container.decode(MenuContext.self, forKey: .context)
    self.capabilities = try container.decode(PublicMenuCapabilities.self, forKey: .capabilities)
    normalizeCanonicalOrdering()
  }
}

init(workspace: MenuWorkspacePayload) {
  context = MenuSnapshotContext(
    menuId: workspace.context.menu?.id ?? "",
    restaurantId: workspace.context.menu?.restaurantId ?? "",
    menuType: workspace.context.menu?.type ?? "drinks"
  )
  cats = Self.normalizeIdentifiers(
    in: canonicalSortedCategories(workspace.cats).map { $0.canonicalized() },
    menuId: workspace.context.menu?.id ?? ""
  )
  meta = workspace.meta
  restaurant = workspace.restaurant
  featuredGroups = workspace.restaurantTools?.featuredGroups ?? []
}
```

- [ ] **Step 4: Run the iOS tests to verify they pass**

Run: `xcodebuild test -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/MenuDocumentTests`
Expected: PASS, including both new canonical ordering tests.

- [ ] **Step 5: Commit**

```bash
git add ios/ElRoysManagerApp/Models/AppModels.swift ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "fix: normalize ios menu ordering from server payloads"
```

### Task 4: Run Cross-Surface Regression Verification

**Files:**
- Modify: `tests/phase7-server-read-boundaries.test.cjs`
- Modify: `tests/manager-item-reorder-draft-state.test.cjs`
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Run the JS regression suite**

Run:

```bash
node --test tests/phase7-server-read-boundaries.test.cjs tests/manager-item-reorder-draft-state.test.cjs
```

Expected: PASS for both files, proving server and web ordering are deterministic.

- [ ] **Step 2: Run the iOS regression suite**

Run:

```bash
xcodebuild test -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:ElRoysManagerAppTests/MenuDocumentTests
```

Expected: PASS, proving iOS document/workspace/public payload normalization matches the server ordering contract.

- [ ] **Step 3: Run one manual verification pass**

Run:

```bash
open http://localhost:3000/manager
```

Expected: In two separate browser profiles on the same menu, after a save and reload, the visible order matches exactly; ties do not flip between reloads. If a second local draft is active, it may still intentionally overlay live order, but once discarded both clients should converge to the same live ordering.

- [ ] **Step 4: Commit**

```bash
git add tests/phase7-server-read-boundaries.test.cjs tests/manager-item-reorder-draft-state.test.cjs ios/ElRoysManagerAppTests/MenuDocumentTests.swift
git commit -m "test: lock ordering consistency across server and clients"
```

## Self-Review

- Spec coverage:
  - Server-side deterministic ordering: covered by Task 1.
  - Web client reading canonical server order correctly: covered by Task 2.
  - iOS client reading canonical server order correctly: covered by Task 3.
  - End-to-end regression verification: covered by Task 4.
- Placeholder scan:
  - Removed vague language and included exact files, commands, and code for each task.
- Type consistency:
  - The plan uses `display_order` on JS/server surfaces and `displayOrder` on Swift surfaces consistently.
  - The same canonical ordering rules are applied in every task: display order first, stable tie-break second, uncategorized last.
