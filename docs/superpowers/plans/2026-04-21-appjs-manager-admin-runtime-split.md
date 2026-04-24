# App.js Manager/Admin Runtime Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the manager/admin editing runtime out of `app.js` and into deeper `core/ui/manager/*` and `core/ui/admin/*` modules so `app.js` becomes browser wiring plus compact delegation.

**Architecture:** Keep `app.js` as the owner of browser globals, startup order, shared mutable runtime state, and module lookup/port construction. Move the large manager/admin UI bodies into cohesive boundaries: manager item editors in `core/ui/manager/editors.js`, manager workspace/section orchestration in `core/ui/manager/workspace.js` and `core/ui/manager/sections.js`, featured-item editing in a focused `core/ui/manager/featured.js`, and admin user/switcher/workspace behavior in `core/ui/admin/*`. Preserve current behavior by adding boundary tests before each extraction and by keeping inline handler names stable through thin delegate bindings.

**Tech Stack:** Plain browser JavaScript, HTML script tags, Node test runner (`node --test`), no bundler, no dependencies.

---

## File Structure

- `app.js`
  Keep browser-owned state, module getters, and a compact `bindUiDelegates()` table. Delete the moved manager/admin function bodies after the shared modules own them.
- `core/ui/manager/editors.js`
  Own the item/category/pricing/description runtime: `renderManagerCategories()`, `renderManagerItems()`, `renderPricingSection()`, `renderDescriptionSection()`, add-item autocomplete, 86 toggles, swipe behavior, upcharges, recipe helpers, and related stale-section updates.
- `core/ui/manager/workspace.js`
  Own manager shell orchestration: `renderManagerWorkspace()`, `refreshManagerViews()`, `saveMenu()`, action-bar state syncing, overview stats, and `renderRecentChanges()`.
- `core/ui/manager/sections.js`
  Own active manager section state, stale-section invalidation, and `switchManagerTab()`.
- `core/ui/manager/featured.js`
  Own `renderFeaturedTab()` and the featured-item picker/edit flows so restaurant-special behavior is not buried in the workspace shell.
- `core/ui/admin/workspace.js`
  Own `renderAdminWorkspace()`, `renderMenusPanel()`, and `switchAdminTab()` while composing the users and switcher services.
- `core/ui/admin/users.js`
  Own `loadUsers()`, `renderUsersTab()`, `buildMenuAccessHTML()`, `renderMenuAccessForUser()`, `saveUserRole()`, `saveMenuAccess()`, and `saveUserName()`.
- `core/ui/admin/switcher.js`
  Own `loadAdminSwitcherData()`, `initAdminSwitcherTab()`, `onAdminSwitcherRestaurantChange()`, and `onAdminSwitcherMenuChange()`.
- `index.html`
  Load the new shared manager/admin module scripts before `app.js`.
- `manager/index.html`
  Load the new shared manager/admin module scripts before `app.js`.
- `admin/index.html`
  Load the new shared manager/admin module scripts before `app.js`.
- `leroyslounge/index.html`
  Load the new shared manager/admin module scripts before `routes/shared/public-route-core.js` and `app.js`.
- `elroyscantina/index.html`
  Load the new shared manager/admin module scripts before `routes/shared/public-route-core.js` and `app.js`.
- `scripts/check-html-script-order.cjs`
  Lock the shared runtime script order so the new modules always load before `app.js`.
- `tests/helpers/runtime.cjs`
  Mirror the HTML runtime script order inside the sandbox loader.
- `tests/phase3-ui-boundaries.test.cjs`
  App-to-boundary delegation coverage for manager/admin UI surfaces.
- `tests/phase3-ui-deep-boundaries.test.cjs`
  Deep-module behavior coverage for manager/admin services.
- `tests/phase18-menu-history-boundaries.test.cjs`
  Keep recent-changes history wiring pinned to the shared manager workspace boundary instead of `app.js`.
- `tests/phase22-category-governance.test.cjs`
  Regression guard for category/item editing behavior while the manager editor cluster moves.

### Task 1: Create The New Module Loading Skeleton And Lock Boundary Contracts

**Files:**
- Create: `core/ui/manager/featured.js`
- Create: `core/ui/admin/users.js`
- Modify: `index.html`
- Modify: `manager/index.html`
- Modify: `admin/index.html`
- Modify: `leroyslounge/index.html`
- Modify: `elroyscantina/index.html`
- Modify: `scripts/check-html-script-order.cjs`
- Modify: `tests/helpers/runtime.cjs`
- Modify: `tests/phase3-ui-boundaries.test.cjs`
- Modify: `tests/phase3-ui-deep-boundaries.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/phase3-ui-deep-boundaries.test.cjs`

- [ ] **Step 1: Add failing boundary tests for the new manager/admin module surface**

```js
test('ui module scripts register featured and admin-users factories', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
    'core/ui/manager/sections.js',
    'core/ui/manager/editors.js',
    'core/ui/manager/featured.js',
    'core/ui/admin/workspace.js',
    'core/ui/admin/users.js',
    'core/ui/admin/switcher.js',
  ]);

  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerFeaturedService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createAdminUsersService, 'function');
});

test('app manager/admin helpers delegate through shared ui module boundaries', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createManagerWorkspaceService: () => ({
        saveMenu: async () => calls.push('saveMenu'),
        renderManagerWorkspace: () => calls.push('renderManagerWorkspace'),
        renderRecentChanges: async () => calls.push('renderRecentChanges'),
      }),
      createManagerSectionService: () => ({
        switchManagerTab: name => calls.push(['switchManagerTab', name]),
      }),
      createManagerFeaturedService: () => ({
        renderFeaturedTab: () => calls.push('renderFeaturedTab'),
      }),
      createAdminWorkspaceService: () => ({
        renderAdminWorkspace: () => calls.push('renderAdminWorkspace'),
        renderMenusPanel: async () => calls.push('renderMenusPanel'),
        switchAdminTab: name => calls.push(['switchAdminTab', name]),
      }),
      createAdminUsersService: () => ({
        loadUsers: async () => calls.push('loadUsers'),
      }),
    },
  });

  await sandbox.saveMenu();
  await sandbox.renderRecentChanges();
  sandbox.renderFeaturedTab();
  sandbox.switchManagerTab('edit-pricing');
  await sandbox.renderMenusPanel();
  await sandbox.loadUsers();
  sandbox.switchAdminTab('admin-users');

  assert.deepEqual(calls, [
    'saveMenu',
    'renderRecentChanges',
    'renderFeaturedTab',
    ['switchManagerTab', 'edit-pricing'],
    'renderMenusPanel',
    'loadUsers',
    ['switchAdminTab', 'admin-users'],
  ]);
});
```

- [ ] **Step 2: Run the boundary tests and confirm they fail before adding the new modules**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs`
Expected: FAIL because `core/ui/manager/featured.js` and `core/ui/admin/users.js` do not exist yet, and `app.js` does not delegate `saveMenu()`, `renderRecentChanges()`, `renderFeaturedTab()`, `switchManagerTab()`, `renderMenusPanel()`, `loadUsers()`, or `switchAdminTab()` through shared UI services.

- [ ] **Step 3: Add the new runtime skeleton files and wire them into script loading**

Create `core/ui/manager/featured.js`:

```js
(function bootstrapManagerFeaturedUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerFeaturedServiceImpl(deps = {}) {
    const renderFeaturedTab = typeof deps.renderFeaturedTab === 'function' ? deps.renderFeaturedTab : (() => {});
    const filterFeaturedPicker = typeof deps.filterFeaturedPicker === 'function' ? deps.filterFeaturedPicker : (() => {});
    const handleFeaturedAddKeydown = typeof deps.handleFeaturedAddKeydown === 'function' ? deps.handleFeaturedAddKeydown : (() => {});
    const addFeaturedSlotFromInput = typeof deps.addFeaturedSlotFromInput === 'function' ? deps.addFeaturedSlotFromInput : (async () => {});
    const addFeaturedSlot = typeof deps.addFeaturedSlot === 'function' ? deps.addFeaturedSlot : (async () => {});
    const removeFeaturedSlot = typeof deps.removeFeaturedSlot === 'function' ? deps.removeFeaturedSlot : (async () => {});
    const saveFeaturedSellNote = typeof deps.saveFeaturedSellNote === 'function' ? deps.saveFeaturedSellNote : (async () => {});
    const moveFeaturedSlot = typeof deps.moveFeaturedSlot === 'function' ? deps.moveFeaturedSlot : (async () => {});
    const focusFeaturedManagerCard = typeof deps.focusFeaturedManagerCard === 'function' ? deps.focusFeaturedManagerCard : (() => {});

    return {
      renderFeaturedTab,
      filterFeaturedPicker,
      handleFeaturedAddKeydown,
      addFeaturedSlotFromInput,
      addFeaturedSlot,
      removeFeaturedSlot,
      saveFeaturedSellNote,
      moveFeaturedSlot,
      focusFeaturedManagerCard,
    };
  }

  modules.createManagerFeaturedService = function createManagerFeaturedServiceBoundary(deps = {}) {
    return createManagerFeaturedServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Create `core/ui/admin/users.js`:

```js
(function bootstrapAdminUsersUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createAdminUsersServiceImpl(deps = {}) {
    const loadUsers = typeof deps.loadUsers === 'function' ? deps.loadUsers : (async () => {});
    const renderUsersTab = typeof deps.renderUsersTab === 'function' ? deps.renderUsersTab : (() => {});
    const buildMenuAccessHTML = typeof deps.buildMenuAccessHTML === 'function' ? deps.buildMenuAccessHTML : (() => '');
    const renderMenuAccessForUser = typeof deps.renderMenuAccessForUser === 'function' ? deps.renderMenuAccessForUser : (() => {});
    const saveUserRole = typeof deps.saveUserRole === 'function' ? deps.saveUserRole : (async () => {});
    const saveMenuAccess = typeof deps.saveMenuAccess === 'function' ? deps.saveMenuAccess : (async () => {});
    const saveUserName = typeof deps.saveUserName === 'function' ? deps.saveUserName : (async () => {});

    return {
      loadUsers,
      renderUsersTab,
      buildMenuAccessHTML,
      renderMenuAccessForUser,
      saveUserRole,
      saveMenuAccess,
      saveUserName,
    };
  }

  modules.createAdminUsersService = function createAdminUsersServiceBoundary(deps = {}) {
    return createAdminUsersServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Update the shared script lists in both runtime guardrails:

```js
const SHARED_RUNTIME_SCRIPTS = [
  '/core/domain/constants.js',
  '/core/domain/category-defaults.js',
  '/core/auth/auth-api.js',
  '/core/auth/auth-session-service.js',
  '/core/auth/auth-overlay-template.js',
  '/core/auth/auth-overlay-controller.js',
  '/core/ui/manager/workspace.js',
  '/core/ui/manager/sections.js',
  '/core/ui/manager/editors.js',
  '/core/ui/manager/featured.js',
  '/core/ui/admin/workspace.js',
  '/core/ui/admin/users.js',
  '/core/ui/admin/switcher.js',
  '/core/ui/public/footer-actions.js',
  '/core/ui/public/renderer-default.js',
  '/core/session/publish-service.js',
  '/core/session/menu-session.js',
  '/core/data/menu-state-loader.js',
  '/core/session/poll-scheduler.js',
];
```

Insert the new script tags in every HTML shell immediately after the existing manager/admin UI tags:

```html
<script src="/core/ui/manager/workspace.js"></script>
<script src="/core/ui/manager/sections.js"></script>
<script src="/core/ui/manager/editors.js"></script>
<script src="/core/ui/manager/featured.js"></script>
<script src="/core/ui/admin/workspace.js"></script>
<script src="/core/ui/admin/users.js"></script>
<script src="/core/ui/admin/switcher.js"></script>
```

- [ ] **Step 4: Re-run the boundary tests and script-order check**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs`
Expected: PASS

Run: `node scripts/check-html-script-order.cjs`
Expected: `HTML script order check passed.`

- [ ] **Step 5: Commit the scaffolding**

```bash
git add core/ui/manager/featured.js core/ui/admin/users.js index.html manager/index.html admin/index.html leroyslounge/index.html elroyscantina/index.html scripts/check-html-script-order.cjs tests/helpers/runtime.cjs tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs
git commit -m "test: lock manager admin ui module skeleton"
```

### Task 2: Move The Item/Pricing/Description Runtime Into `core/ui/manager/editors.js`

**Files:**
- Modify: `app.js:10999-12009`
- Modify: `core/ui/manager/editors.js`
- Modify: `tests/phase3-ui-deep-boundaries.test.cjs`
- Test: `tests/phase3-ui-deep-boundaries.test.cjs`
- Test: `tests/phase22-category-governance.test.cjs`

- [ ] **Step 1: Add failing deep tests for the manager editor behaviors**

```js
test('manager editors service owns add-item, autocomplete, 86, pricing, and description flows', async () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/editors.js']);
  const calls = [];
  const menuState = {
    beer: { items: [], lastSent: [] },
    __uncategorized__: {
      items: [{ id: 'pool-1', name: 'Pool Lager', onMenu: false, desc: '', recipe: [], price: '', upcharges: [], showDescription: true, showRecipe: false, eightySixed: false }],
      lastSent: [],
    },
    _meta: {},
  };

  const service = sandbox.__HF_UI_MODULES__.createManagerEditorsService({
    document: {
      getElementById(id) {
        if (id === 'new-input-beer') return { value: 'Pool Lager', focus() {}, blur() {} };
        if (id === 'ac-beer') return { classList: { add() {}, remove() {} }, innerHTML: '' };
        return null;
      },
      createElement() {
        return {
          className: '',
          id: '',
          dataset: {},
          innerHTML: '',
          appendChild() {},
          querySelector() { return null; },
          closest() { return null; },
          addEventListener() {},
        };
      },
    },
    MENU_TYPE: 'drinks',
    UNCATEGORIZED_ID: '__uncategorized__',
    getMenuState: () => menuState,
    getManagedCategoryDefs: () => [{ id: 'beer', title: 'Beer', icon: '🍺', color: '#eee', sub: '', placeholder: 'Add beer…' }],
    getUncategorizedCategoryDef: () => ({ id: '__uncategorized__', title: 'Uncategorized', icon: '📦', color: '#ddd', sub: 'Pool', placeholder: '' }),
    getRenderableCategoryItems: catId => (menuState[catId]?.items || []).filter(item => item.onMenu !== false),
    findItem: (catId, itemId) => (menuState[catId]?.items || []).find(item => item.id === itemId) || null,
    invalidateDiff: () => calls.push('invalidateDiff'),
    updateDraftIndicator: () => calls.push('updateDraftIndicator'),
    markSectionsStale: sectionId => calls.push(['markSectionsStale', sectionId]),
    showToast: message => calls.push(['showToast', message]),
  });

  service.addItem('beer');
  service.toggle86('beer', 'pool-1');

  assert.equal(typeof service.renderPricingSection, 'function');
  assert.equal(typeof service.renderDescriptionSection, 'function');
  assert.equal(menuState.beer.items.length, 1);
  assert.equal(menuState.__uncategorized__.items.length, 0);
  assert.equal(menuState.beer.items[0].eightySixed, true);
  assert.deepEqual(calls, [
    'invalidateDiff',
    ['markSectionsStale', undefined],
    'updateDraftIndicator',
    'invalidateDiff',
    ['markSectionsStale', undefined],
    'updateDraftIndicator',
    ['showToast', "🚫 Marked 86'd — use Save & Send to notify channels"],
  ]);
});

test('manager editors service hides recipe controls on food menus', () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/editors.js']);
  const service = sandbox.__HF_UI_MODULES__.createManagerEditorsService({
    MENU_TYPE: 'food',
    getManagedCategoryDefs: () => [{ id: 'snacks', title: 'Snacks', icon: '🍟', color: '#eee', sub: '' }],
    getRenderableCategoryItems: () => [{
      id: 'fries-1',
      name: 'Fries',
      desc: 'Crispy fries',
      recipe: ['Salt'],
      upcharges: [],
      eightySixed: false,
      showDescription: true,
      showRecipe: false,
    }],
    document: {
      getElementById() { return { innerHTML: '' }; },
      createElement() { return { className: '', id: '', innerHTML: '', appendChild() {} }; },
    },
  });

  const html = service.buildDescriptionRowHtml({
    id: 'fries-1',
    name: 'Fries',
    desc: 'Crispy fries',
    recipe: ['Salt'],
    upcharges: [],
    eightySixed: false,
    showDescription: true,
    showRecipe: false,
  }, 'snacks');

  assert.doesNotMatch(html, /Recipe<\/label>/);
  assert.doesNotMatch(html, /add-ingredient-btn/);
});
```

- [ ] **Step 2: Run the manager editor tests and confirm they fail**

Run: `node --test tests/phase3-ui-deep-boundaries.test.cjs tests/phase22-category-governance.test.cjs`
Expected: FAIL because `createManagerEditorsService()` is still a shallow wrapper and does not own add-item, 86, autocomplete, pricing, or description behavior.

- [ ] **Step 3: Deepen `core/ui/manager/editors.js` and replace the `app.js` item-editor bodies with service calls**

Use `core/ui/manager/editors.js` as the owner of the moved code. Keep the existing factory name and add the concrete runtime methods:

```js
function createManagerEditorsServiceImpl(deps = {}) {
  const documentRef = deps.document || globalScope.document;
  const getMenuState = typeof deps.getMenuState === 'function' ? deps.getMenuState : (() => globalScope.menuState || {});
  const getManagedCategoryDefs = typeof deps.getManagedCategoryDefs === 'function' ? deps.getManagedCategoryDefs : (() => globalScope.getManagedCategoryDefs?.() || []);
  const getUncategorizedCategoryDef = typeof deps.getUncategorizedCategoryDef === 'function' ? deps.getUncategorizedCategoryDef : (() => globalScope.getUncategorizedCategoryDef?.());
  const getRenderableCategoryItems = typeof deps.getRenderableCategoryItems === 'function' ? deps.getRenderableCategoryItems : (catId => globalScope.getRenderableCategoryItems?.(catId) || []);
  const findItem = typeof deps.findItem === 'function' ? deps.findItem : ((catId, itemId) => globalScope.findItem?.(catId, itemId));
  const invalidateDiff = typeof deps.invalidateDiff === 'function' ? deps.invalidateDiff : (() => globalScope.invalidateDiff?.());
  const updateDraftIndicator = typeof deps.updateDraftIndicator === 'function' ? deps.updateDraftIndicator : (() => globalScope.updateDraftIndicator?.());
  const markSectionsStale = typeof deps.markSectionsStale === 'function' ? deps.markSectionsStale : (sectionId => globalScope.markSectionsStale?.(sectionId));
  const showToast = typeof deps.showToast === 'function' ? deps.showToast : ((message, tone) => globalScope.showToast?.(message, tone));
  const MENU_TYPE = deps.MENU_TYPE || globalScope.MENU_TYPE || 'drinks';
  const UNCATEGORIZED_ID = deps.UNCATEGORIZED_ID || globalScope.UNCATEGORIZED_ID || '__uncategorized__';

  function recipeArray(recipe) {
    if (Array.isArray(recipe)) return recipe.filter(Boolean);
    if (typeof recipe === 'string' && recipe.trim()) return [recipe.trim()];
    return [];
  }

  function itemUpchargeArray(upcharges) {
    if (!Array.isArray(upcharges)) return [];
    return upcharges
      .filter(entry => entry && (entry.label || entry.price))
      .map(entry => ({ label: String(entry.label || '').trim(), price: String(entry.price || '').trim() || '+$0' }));
  }

  function addItem(catId) {
    const input = documentRef.getElementById('new-input-' + catId);
    if (!input) return;
    const name = String(input.value || '').trim();
    if (!name) return;
    const menuState = getMenuState();
    if (!menuState[catId]) menuState[catId] = { items: [], lastSent: [] };

    const pool = menuState[UNCATEGORIZED_ID]?.items || [];
    const pooledIndex = pool.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
    if (pooledIndex !== -1 && catId !== UNCATEGORIZED_ID) {
      const [pooledItem] = pool.splice(pooledIndex, 1);
      menuState[catId].items.push({ ...pooledItem, onMenu: true });
    } else {
      menuState[catId].items.push({
        id: globalScope.uid(),
        name,
        desc: '',
        recipe: [],
        price: '',
        eightySixed: false,
        onMenu: catId !== UNCATEGORIZED_ID,
        upcharges: [],
        showDescription: true,
        showRecipe: false,
      });
    }

    input.value = '';
    hideAutocomplete(catId);
    invalidateDiff();
    renderManagerItems(catId);
    if (catId !== UNCATEGORIZED_ID) renderManagerItems(UNCATEGORIZED_ID);
    markSectionsStale(globalScope._activeManagerSection);
    updateDraftIndicator();
    input.focus();
  }

  function toggle86(catId, itemId) {
    const item = findItem(catId, itemId);
    if (!item) return;
    item.eightySixed = !item.eightySixed;
    invalidateDiff();
    renderManagerItems(catId);
    markSectionsStale(globalScope._activeManagerSection);
    updateDraftIndicator();
    showToast(item.eightySixed ? "🚫 Marked 86'd — use Save & Send to notify channels" : `↩ Marked ${globalScope.restoreLabel(catId)} — use Save & Send to notify channels`, 'info');
  }

  function renderPricingSection() { /* move app.js:11251-11285 here unchanged except for injected deps */ }
  function renderDescriptionSection() { /* move app.js:11288-11322 here unchanged except for injected deps */ }
  function renderManagerCategories() { /* move app.js:11000-11053 here unchanged except for injected deps */ }
  function renderManagerItems(catId) { /* move app.js:11213-11248 here unchanged except for injected deps */ }
  function showAutocomplete(catId) { /* move app.js:11538-11558 here unchanged */ }
  function hideAutocomplete(catId) { /* move app.js:11560-11564 here unchanged */ }
  function selectAutocomplete(event, catId, name) { /* move app.js:11566-11571 here unchanged */ }
  function handleAddItemKeydown(event, catId) { /* move app.js:11573-11594 here unchanged */ }
  function toggleUpcharges(catId, itemId) { /* move app.js:11616-11625 here unchanged */ }
  function addUpcharge(catId, itemId) { /* move app.js:11627-11644 here unchanged */ }
  function updateUpcharge(catId, itemId, index, field, value) { /* move app.js:11646-11653 here unchanged */ }
  function removeUpcharge(catId, itemId, index) { /* move app.js:11655-11663 here unchanged */ }
  function toggleDescriptionEditor(itemId) { /* move app.js:11797-11807 here unchanged */ }
  function renderRecipeIngredients(catId, itemId) { /* move app.js:11846-11854 here unchanged */ }
  async function addIngredient(catId, itemId) { /* move app.js:11856-11879 here unchanged */ }
  async function removeIngredient(catId, itemId, index) { /* move app.js:11881-11898 here unchanged */ }
  function handleIngredientKeydown(event, catId, itemId) { /* move app.js:11900-11902 here unchanged */ }
  async function saveDesc(catId, itemId, value) { /* move app.js:11904-11927 here unchanged */ }

  return {
    recipeArray,
    itemUpchargeArray,
    renderManagerCategories,
    renderManagerItems,
    renderPricingSection,
    renderDescriptionSection,
    buildDescriptionRowHtml,
    addItem,
    showAutocomplete,
    hideAutocomplete,
    selectAutocomplete,
    handleAddItemKeydown,
    toggle86,
    toggleUpcharges,
    addUpcharge,
    updateUpcharge,
    removeUpcharge,
    toggleDescriptionEditor,
    renderRecipeIngredients,
    addIngredient,
    removeIngredient,
    handleIngredientKeydown,
    saveDesc,
  };
}
```

In `app.js`, replace the moved bodies with delegation entries inside the deep UI shim install:

```js
const MANAGER_EDITOR_METHODS = [
  'renderManagerCategories',
  'renderManagerItems',
  'renderPricingSection',
  'renderDescriptionSection',
  'addItem',
  'showAutocomplete',
  'hideAutocomplete',
  'selectAutocomplete',
  'handleAddItemKeydown',
  'toggle86',
  'toggleUpcharges',
  'addUpcharge',
  'updateUpcharge',
  'removeUpcharge',
  'toggleDescriptionEditor',
  'renderRecipeIngredients',
  'addIngredient',
  'removeIngredient',
  'handleIngredientKeydown',
  'saveDesc',
];
```

- [ ] **Step 4: Run the deep manager tests and the category-governance regression**

Run: `node --test tests/phase3-ui-deep-boundaries.test.cjs tests/phase22-category-governance.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit the manager-editor extraction**

```bash
git add app.js core/ui/manager/editors.js tests/phase3-ui-deep-boundaries.test.cjs
git commit -m "refactor: deepen manager editor runtime"
```

### Task 3: Move Manager Workspace/Sections/Featured Ownership Out Of `app.js`

**Files:**
- Modify: `app.js:7598-7660`
- Modify: `app.js:11423-11433`
- Modify: `app.js:12545-13093`
- Modify: `core/ui/manager/workspace.js`
- Modify: `core/ui/manager/sections.js`
- Modify: `core/ui/manager/featured.js`
- Modify: `tests/phase3-ui-boundaries.test.cjs`
- Modify: `tests/phase18-menu-history-boundaries.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/phase18-menu-history-boundaries.test.cjs`

- [ ] **Step 1: Add failing tests for manager workspace and section ownership**

```js
test('manager workspace boundary owns saveMenu, renderRecentChanges, and renderFeaturedTab', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
    'core/ui/manager/featured.js',
  ]);

  const calls = [];
  const workspace = sandbox.__HF_UI_MODULES__.createManagerWorkspaceService({
    flushFocusedManagerEditor: async () => calls.push('flushFocusedManagerEditor'),
    getMenuActionState: () => ({ hasLocalDraft: true, hasPendingServerQueue: false }),
    sendUpdate: async options => calls.push(['sendUpdate', options]),
    readMenuHistoryThroughApi: async () => ({ history: { scope: 'menu' }, logs: [] }),
    document: {
      getElementById(id) {
        if (id === 'recent-changes-wrap') return { innerHTML: '' };
        return null;
      },
    },
  });

  await workspace.saveMenu();
  await workspace.renderRecentChanges();

  assert.deepEqual(calls, [
    'flushFocusedManagerEditor',
    ['sendUpdate', { notify: false }],
  ]);
});

test('manager section boundary owns switchManagerTab and updates the active edit section', () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/sections.js']);
  const calls = [];
  const service = sandbox.__HF_UI_MODULES__.createManagerSectionService({
    renderManagerCategories: () => calls.push('renderManagerCategories'),
    renderPricingSection: () => calls.push('renderPricingSection'),
    renderDescriptionSection: () => calls.push('renderDescriptionSection'),
    renderCategoriesTab: () => calls.push('renderCategoriesTab'),
    renderDatabaseTab: () => calls.push('renderDatabaseTab'),
    renderPruneSection: () => calls.push('renderPruneSection'),
    updateManagerToolsContext: () => calls.push('updateManagerToolsContext'),
    focusSettingsSection: sectionId => calls.push(['focusSettingsSection', sectionId]),
  });

  service.switchManagerTab('edit-description');
  service.switchManagerTab('database');

  assert.deepEqual(calls, [
    'renderDescriptionSection',
    ['focusSettingsSection', 'manager-description-section'],
    'renderDatabaseTab',
    'renderPruneSection',
    ['focusSettingsSection', 'manager-database-section'],
  ]);
});
```

Update `tests/phase18-menu-history-boundaries.test.cjs` so the source assertion follows the moved code:

```js
test('manager workspace boundary routes recent changes through the consolidated manager endpoint', () => {
  const source = read('core/ui/manager/workspace.js');

  assert.match(source, /readMenuHistoryThroughApi/);
  assert.match(source, /\/api\/manager\?/);
  assert.doesNotMatch(source, /rest\/v1\/update_log/);
});
```

- [ ] **Step 2: Run the manager workspace tests and confirm they fail**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/phase18-menu-history-boundaries.test.cjs`
Expected: FAIL because `saveMenu()`, `renderRecentChanges()`, `renderFeaturedTab()`, and `switchManagerTab()` are still owned by `app.js`.

- [ ] **Step 3: Deepen the manager workspace, sections, and featured modules**

Move the `app.js` bodies into the modules below and keep `app.js` as an injected-browser adapter only.

In `core/ui/manager/workspace.js`:

```js
function createManagerWorkspaceServiceImpl(deps = {}) {
  const documentRef = deps.document || globalScope.document;
  const flushFocusedManagerEditor = typeof deps.flushFocusedManagerEditor === 'function' ? deps.flushFocusedManagerEditor : (() => globalScope.flushFocusedManagerEditor?.());
  const getMenuActionState = typeof deps.getMenuActionState === 'function' ? deps.getMenuActionState : (() => globalScope.getMenuActionState?.() || {});
  const openPreview = typeof deps.openPreview === 'function' ? deps.openPreview : (() => globalScope.openPreview?.());
  const sendUpdate = typeof deps.sendUpdate === 'function' ? deps.sendUpdate : (options => globalScope.sendUpdate?.(options));
  const readMenuHistoryThroughApi = typeof deps.readMenuHistoryThroughApi === 'function' ? deps.readMenuHistoryThroughApi : (options => globalScope.readMenuHistoryThroughApi?.(options));
  const renderFeaturedTab = typeof deps.renderFeaturedTab === 'function' ? deps.renderFeaturedTab : (() => globalScope.renderFeaturedTab?.());

  async function saveMenu() {
    await flushFocusedManagerEditor();
    const actionState = getMenuActionState();
    if (!actionState.hasLocalDraft) {
      if (actionState.hasPendingServerQueue) await openPreview();
      return;
    }
    await sendUpdate({ notify: false });
  }

  function summarizeHistoryDiff(diff) { /* move app.js:12545-12556 here unchanged */ }
  function buildHistoryDetailHtml(diff) { /* move app.js:12558-12566 here unchanged */ }
  function buildHistoryMessageHtml(message) { /* move app.js:12568-12572 here unchanged */ }
  function formatHistorySourceLabel(source) { /* move app.js:12574-12583 here unchanged */ }
  function buildHistoryContextSummary(log) { /* move app.js:12585-12594 here unchanged */ }
  function buildChangeFeedHtml(logs) { /* move app.js:12596-12632 here unchanged */ }

  async function renderRecentChanges() {
    const wrap = documentRef.getElementById('recent-changes-wrap');
    if (!wrap) return;
    if (!globalScope.currentUser?.accessToken) {
      wrap.innerHTML = '<p class="db-empty">Recent changes are unavailable until you are signed in.</p>';
      return;
    }
    if (!globalScope.MENU_ID) {
      wrap.innerHTML = '<p class="db-empty">Select a menu to view recent changes.</p>';
      return;
    }

    wrap.innerHTML = '<p class="db-empty">Loading…</p>';
    const history = await readMenuHistoryThroughApi({ menuId: globalScope.MENU_ID, days: 7, limit: 25 });
    const logs = Array.isArray(history?.logs) ? history.logs : [];
    wrap.innerHTML = logs.length
      ? buildChangeFeedHtml(logs)
      : '<p class="db-empty">No sent updates for this menu in the last 7 days.</p>';
  }

  function renderManagerWorkspace(options = {}) {
    deps.renderManagerCategories?.();
    deps.renderPricingSection?.();
    deps.renderDescriptionSection?.();
    renderFeaturedTab();
    deps.renderCategoriesTab?.();
    deps.updateManagerToolsContext?.();
    deps.renderDatabaseTab?.();
    deps.renderPruneSection?.();
    deps.updateActiveMenuBar?.();
    renderManagerOverviewStats();
    if (options.includeRecentChanges !== false) renderRecentChanges();
    updateManagerActionBar();
    deps.renderFooter?.();
    deps.initManagerMobileDrawerTrigger?.();
    deps.initDrawerSwipe?.();
  }

  return {
    renderManagerOverviewStats,
    syncManagerActionBarStatus,
    updateManagerActionBar,
    renderManagerWorkspace,
    refreshManagerViews,
    saveMenu,
    renderRecentChanges,
  };
}
```

In `core/ui/manager/sections.js`:

```js
function createManagerSectionServiceImpl(deps = {}) {
  const documentRef = deps.document || globalScope.document;
  const focusSettingsSection = typeof deps.focusSettingsSection === 'function' ? deps.focusSettingsSection : (sectionId => globalScope.focusSettingsSection?.(sectionId));
  const renderCategoriesTab = typeof deps.renderCategoriesTab === 'function' ? deps.renderCategoriesTab : (() => globalScope.renderCategoriesTab?.());
  const renderDatabaseTab = typeof deps.renderDatabaseTab === 'function' ? deps.renderDatabaseTab : (() => globalScope.renderDatabaseTab?.());
  const renderPruneSection = typeof deps.renderPruneSection === 'function' ? deps.renderPruneSection : (() => globalScope.renderPruneSection?.());
  const updateManagerToolsContext = typeof deps.updateManagerToolsContext === 'function' ? deps.updateManagerToolsContext : (() => globalScope.updateManagerToolsContext?.());
  let activeManagerSection = deps.initialActiveManagerSection || 'manager-items-section';

  function switchManagerTab(name) {
    if (name === 'edit-menu' || name === 'edit-items') {
      activeManagerSection = 'manager-items-section';
      renderManagerCategories();
      focusSettingsSection('manager-items-section');
      return;
    }
    if (name === 'edit-pricing') {
      activeManagerSection = 'manager-pricing-section';
      renderPricingSection();
      focusSettingsSection('manager-pricing-section');
      return;
    }
    if (name === 'edit-description') {
      activeManagerSection = 'manager-description-section';
      renderDescriptionSection();
      focusSettingsSection('manager-description-section');
      return;
    }
    if (name === 'categories') {
      renderCategoriesTab();
      updateManagerToolsContext();
      focusSettingsSection('manager-categories-section');
      return;
    }
    if (name === 'database') {
      renderDatabaseTab();
      renderPruneSection();
      focusSettingsSection('manager-database-section');
    }
  }

  return {
    isManagerEditSection,
    markSectionsStale,
    refreshStaleSection,
    setManagerEditSectionVisibility,
    renderActiveManagerSection,
    switchManagerTab,
    getActiveManagerSection: () => activeManagerSection,
  };
}
```

In `core/ui/manager/featured.js`, replace the Task 1 skeleton with the full featured-item implementation moved from `app.js:12857-13064`, preserving:

- `currentUserCanEditRestaurantSpecials()` access checks
- the `Needs both menus` disabled state
- off-menu and `86'D` badges
- sell-note save behavior
- picker filtering and keyboard support
- `renderPublicView()` refreshes after add/remove/reorder

- [ ] **Step 4: Run the manager workspace/history checks**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/phase18-menu-history-boundaries.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit the manager workspace extraction**

```bash
git add app.js core/ui/manager/workspace.js core/ui/manager/sections.js core/ui/manager/featured.js tests/phase3-ui-boundaries.test.cjs tests/phase18-menu-history-boundaries.test.cjs
git commit -m "refactor: move manager workspace runtime into shared modules"
```

### Task 4: Move Admin Users/Menus/Switcher Runtime Into `core/ui/admin/*`

**Files:**
- Modify: `app.js:10794-10843`
- Modify: `app.js:12525-12823`
- Modify: `app.js:13095-13337`
- Modify: `core/ui/admin/workspace.js`
- Modify: `core/ui/admin/users.js`
- Modify: `core/ui/admin/switcher.js`
- Modify: `tests/phase3-ui-boundaries.test.cjs`
- Modify: `tests/phase3-ui-deep-boundaries.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/phase3-ui-deep-boundaries.test.cjs`

- [ ] **Step 1: Add failing admin boundary tests for workspace, users, and switcher behavior**

```js
test('admin users boundary owns user list rendering and menu-access saves', async () => {
  const sandbox = loadSandboxWithScripts(['core/ui/admin/users.js']);
  const calls = [];
  const service = sandbox.__HF_UI_MODULES__.createAdminUsersService({
    readAdminCatalogThroughApi: async () => ({ allMenus: [{ id: 'menu-1', archived: false, name: 'Drinks', type: 'drinks', restaurant_id: 'rest-1' }] }),
    fetchUsers: async () => [{ id: 'user-1', name: 'Taylor', email: 'taylor@example.com', role: 'manager', menuAccess: ['menu-1'] }],
    patchUser: async payload => calls.push(['patchUser', payload]),
    showToast: message => calls.push(['showToast', message]),
    document: {
      getElementById(id) {
        if (id === 'users-list') return { innerHTML: '' };
        if (id === 'user-role-user-1') return { value: 'admin', closest() { return { querySelector() { return { className: '', textContent: '' }; } }; } };
        if (id === 'user-name-user-1') return { value: 'Taylor A.' };
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '.user-menu-access-cb[data-user="user-1"]') {
          return [{ checked: true, dataset: { menu: 'menu-1' } }];
        }
        return [];
      },
    },
    currentUser: { uid: 'admin-1' },
  });

  await service.loadUsers();
  await service.saveUserRole('user-1');
  await service.saveMenuAccess('user-1');
  await service.saveUserName('user-1');

  assert.deepEqual(calls, [
    ['patchUser', { userId: 'user-1', role: 'admin' }],
    ['showToast', 'Role updated.'],
    ['patchUser', { userId: 'user-1', menuAccess: ['menu-1'] }],
    ['showToast', 'Menu access updated.'],
    ['patchUser', { userId: 'user-1', name: 'Taylor A.' }],
    ['showToast', 'Name updated.'],
  ]);
});

test('admin workspace boundary owns renderMenusPanel and switchAdminTab', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/admin/workspace.js',
    'core/ui/admin/users.js',
    'core/ui/admin/switcher.js',
  ]);

  const calls = [];
  const service = sandbox.__HF_UI_MODULES__.createAdminWorkspaceService({
    renderMenusPanel: async () => calls.push('renderMenusPanel'),
    renderLandingWorkspace: () => calls.push('renderLandingWorkspace'),
    initAdminSwitcherTab: async context => calls.push(['initAdminSwitcherTab', context]),
    loadUsers: async () => calls.push('loadUsers'),
    focusSettingsSection: sectionId => calls.push(['focusSettingsSection', sectionId]),
  });

  await service.renderAdminWorkspace();
  await service.switchAdminTab('admin-users');

  assert.deepEqual(calls, [
    'renderMenusPanel',
    ['initAdminSwitcherTab', 'notif'],
    'loadUsers',
    'renderLandingWorkspace',
    'loadUsers',
    ['focusSettingsSection', 'admin-users-section'],
  ]);
});
```

- [ ] **Step 2: Run the admin tests and confirm they fail**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs`
Expected: FAIL because admin users/menu/switcher behavior is still implemented directly in `app.js`.

- [ ] **Step 3: Deepen the admin modules and move the `app.js` logic into them**

Replace the Task 1 `core/ui/admin/users.js` skeleton with the full user-management implementation moved from `app.js:12525-12823`:

```js
function createAdminUsersServiceImpl(deps = {}) {
  const documentRef = deps.document || globalScope.document;
  const readAdminCatalogThroughApi = typeof deps.readAdminCatalogThroughApi === 'function' ? deps.readAdminCatalogThroughApi : (() => globalScope.readAdminCatalogThroughApi?.());
  const fetchUsers = typeof deps.fetchUsers === 'function'
    ? deps.fetchUsers
    : (async () => {
        const response = await globalScope.fetch('/api/admin?action=users', {
          headers: { Authorization: `Bearer ${globalScope.currentUser?.accessToken}` },
        });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      });
  const postApiJson = typeof deps.postApiJson === 'function' ? deps.postApiJson : ((...args) => globalScope.postApiJson(...args));
  const showToast = typeof deps.showToast === 'function' ? deps.showToast : ((message, tone) => globalScope.showToast?.(message, tone));

  async function patchUser(payload) {
    const result = await postApiJson('/api/admin', {
      action: 'update_user',
      ...payload,
    }, {
      headers: { Authorization: `Bearer ${globalScope.currentUser?.accessToken}` },
    });
    if (!result.ok) throw new Error(result.payload?.error || 'Request failed.');
    return result;
  }

  async function loadUsers() { /* move app.js:12525-12543 here unchanged except for injected deps */ }
  function renderUsersTab(users) { /* move app.js:12664-12730 here unchanged */ }
  function buildMenuAccessHTML(user) { /* move app.js:12732-12753 here unchanged */ }
  function renderMenuAccessForUser(userId) { /* move app.js:12755-12760 here unchanged */ }
  async function saveUserRole(userId) { /* move app.js:12786-12799 here unchanged */ }
  async function saveMenuAccess(userId) { /* move app.js:12801-12811 here unchanged */ }
  async function saveUserName(userId) { /* move app.js:12813-12823 here unchanged */ }

  return {
    loadUsers,
    renderUsersTab,
    buildMenuAccessHTML,
    renderMenuAccessForUser,
    saveUserRole,
    saveMenuAccess,
    saveUserName,
  };
}
```

Deepen `core/ui/admin/workspace.js` with the restaurant/menu panel and tab switching moved from `app.js:13095-13337`:

```js
function createAdminWorkspaceServiceImpl(deps = {}) {
  const documentRef = deps.document || globalScope.document;
  const readAdminCatalogThroughApi = typeof deps.readAdminCatalogThroughApi === 'function' ? deps.readAdminCatalogThroughApi : (() => globalScope.readAdminCatalogThroughApi?.());
  const sortKnownRestaurants = typeof deps.sortKnownRestaurants === 'function' ? deps.sortKnownRestaurants : (items => globalScope.sortKnownRestaurants(items));
  const sortKnownMenus = typeof deps.sortKnownMenus === 'function' ? deps.sortKnownMenus : (items => globalScope.sortKnownMenus(items));
  const knownRestaurantList = typeof deps.knownRestaurantList === 'function' ? deps.knownRestaurantList : (() => globalScope.knownRestaurantList());
  const renderLandingWorkspace = typeof deps.renderLandingWorkspace === 'function' ? deps.renderLandingWorkspace : (() => globalScope.renderLandingAdminWorkspace?.());
  const initAdminSwitcherTab = typeof deps.initAdminSwitcherTab === 'function' ? deps.initAdminSwitcherTab : (context => globalScope.initAdminSwitcherTab?.(context));
  const loadUsers = typeof deps.loadUsers === 'function' ? deps.loadUsers : (() => globalScope.loadUsers?.());
  const focusSettingsSection = typeof deps.focusSettingsSection === 'function' ? deps.focusSettingsSection : (sectionId => globalScope.focusSettingsSection?.(sectionId));

  async function fetchRestaurantMenuIndex() { /* move app.js:13271-13279 here unchanged */ }
  function groupMenusByRestaurant(allMenus) { /* move app.js:13281-13287 here unchanged */ }
  function buildMenuChipHtml(menu) { /* move app.js:13289-13295 here unchanged */ }
  function buildRestaurantRowHtml(restaurant, menus) { /* move app.js:13297-13311 here unchanged */ }
  async function renderMenusPanel() { /* move app.js:13313-13337 here unchanged */ }

  async function renderAdminWorkspace() {
    await renderMenusPanel();
    await initAdminSwitcherTab('notif');
    await loadUsers();
    renderLandingWorkspace();
  }

  async function switchAdminTab(name) {
    if (name === 'admin-restaurants') {
      await renderMenusPanel();
      focusSettingsSection('admin-restaurants-section');
      return;
    }
    if (name === 'admin-landing') {
      renderLandingWorkspace();
      focusSettingsSection('admin-landing-page-section');
      return;
    }
    if (name === 'admin-notifications') {
      await initAdminSwitcherTab('notif');
      focusSettingsSection('admin-notifications-section');
      return;
    }
    if (name === 'admin-users') {
      await loadUsers();
      focusSettingsSection('admin-users-section');
    }
  }

  return {
    renderAdminWorkspace,
    renderMenusPanel,
    switchAdminTab,
  };
}
```

Deepen `core/ui/admin/switcher.js` by moving the bodies from `app.js:10794-10843` so the switcher module owns its own data loading and select-change behavior instead of wrapping app functions.

- [ ] **Step 4: Run the admin boundary tests**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit the admin extraction**

```bash
git add app.js core/ui/admin/workspace.js core/ui/admin/users.js core/ui/admin/switcher.js tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs
git commit -m "refactor: move admin runtime into shared modules"
```

### Task 5: Thin `app.js` Down To Browser Wiring And Run Full Regression

**Files:**
- Modify: `app.js`
- Modify: `tests/phase3-ui-deep-boundaries.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/phase3-ui-deep-boundaries.test.cjs`
- Test: `tests/phase18-menu-history-boundaries.test.cjs`
- Test: `tests/phase22-category-governance.test.cjs`

- [ ] **Step 1: Add a failing guardrail test that `app.js` no longer owns the moved bodies**

```js
test('app runtime no longer carries large manager/admin shadow implementations', () => {
  const app = read('app.js');

  assert.doesNotMatch(app, /function renderManagerCategories\(\) \{/);
  assert.doesNotMatch(app, /function renderManagerItems\(\) \{/);
  assert.doesNotMatch(app, /function renderPricingSection\(\) \{/);
  assert.doesNotMatch(app, /function renderDescriptionSection\(\) \{/);
  assert.doesNotMatch(app, /async function saveMenu\(\) \{/);
  assert.doesNotMatch(app, /async function loadUsers\(\) \{/);
  assert.doesNotMatch(app, /async function renderMenusPanel\(\) \{/);
  assert.match(app, /function bindUiDelegates\(/);
  assert.match(app, /MANAGER_EDITOR_METHODS/);
  assert.match(app, /MANAGER_WORKSPACE_METHODS/);
  assert.match(app, /ADMIN_WORKSPACE_METHODS/);
});
```

- [ ] **Step 2: Run the guardrail suite and confirm it fails**

Run: `node --test tests/phase3-ui-deep-boundaries.test.cjs`
Expected: FAIL because `app.js` still contains the original function bodies.

- [ ] **Step 3: Replace the individual `app.js` bodies with table-driven delegates**

Add one shared delegate helper near the existing UI module getter logic:

```js
function bindUiDelegates(target, getService, methodNames) {
  methodNames.forEach(methodName => {
    target[methodName] = function delegatedUiMethod(...args) {
      if (_uiModuleDelegationStack.has(methodName)) return undefined;
      const service = getService();
      if (typeof service?.[methodName] !== 'function') {
        throw new Error(`UI method unavailable: ${methodName}`);
      }
      _uiModuleDelegationStack.add(methodName);
      try {
        return service[methodName](...args);
      } finally {
        _uiModuleDelegationStack.delete(methodName);
      }
    };
  });
}

const MANAGER_WORKSPACE_METHODS = [
  'renderManagerWorkspace',
  'refreshManagerViews',
  'saveMenu',
  'renderRecentChanges',
];

const MANAGER_SECTION_METHODS = [
  'isManagerEditSection',
  'markSectionsStale',
  'refreshStaleSection',
  'setManagerEditSectionVisibility',
  'renderActiveManagerSection',
  'switchManagerTab',
];

const MANAGER_FEATURED_METHODS = [
  'renderFeaturedTab',
  'filterFeaturedPicker',
  'handleFeaturedAddKeydown',
  'addFeaturedSlotFromInput',
  'addFeaturedSlot',
  'removeFeaturedSlot',
  'saveFeaturedSellNote',
  'moveFeaturedSlot',
  'focusFeaturedManagerCard',
];

const ADMIN_WORKSPACE_METHODS = [
  'renderAdminWorkspace',
  'renderMenusPanel',
  'switchAdminTab',
];

const ADMIN_USERS_METHODS = [
  'loadUsers',
  'saveUserRole',
  'saveMenuAccess',
  'saveUserName',
  'renderMenuAccessForUser',
];

function installDeepUiDelegationShims() {
  bindUiDelegates(globalThis, getManagerWorkspaceService, MANAGER_WORKSPACE_METHODS);
  bindUiDelegates(globalThis, getManagerSectionService, MANAGER_SECTION_METHODS);
  bindUiDelegates(globalThis, getManagerEditorsService, MANAGER_EDITOR_METHODS);
  bindUiDelegates(globalThis, getManagerFeaturedService, MANAGER_FEATURED_METHODS);
  bindUiDelegates(globalThis, getAdminWorkspaceService, ADMIN_WORKSPACE_METHODS);
  bindUiDelegates(globalThis, getAdminUsersService, ADMIN_USERS_METHODS);
  bindUiDelegates(globalThis, getAdminSwitcherService, [
    'loadAdminSwitcherData',
    'initAdminSwitcherTab',
    'onAdminSwitcherRestaurantChange',
    'onAdminSwitcherMenuChange',
  ]);
}
```

Delete the moved `app.js` bodies after the delegate binding is in place. Remove these exact functions from `app.js` once the delegate tables above are wired and passing tests:

```js
function renderManagerCategories() {}
function renderManagerItems() {}
function renderPricingSection() {}
function renderDescriptionSection() {}
async function saveMenu() {}
async function loadUsers() {}
async function renderMenusPanel() {}
function renderFeaturedTab() {}
function switchManagerTab() {}
function switchAdminTab() {}
```

- [ ] **Step 4: Run the full regression stack and confirm `app.js` is materially smaller**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs tests/phase18-menu-history-boundaries.test.cjs tests/phase22-category-governance.test.cjs`
Expected: PASS

Run: `node --check app.js`
Expected: no output

Run: `node scripts/check-html-script-order.cjs`
Expected: `HTML script order check passed.`

Run: `wc -l app.js core/ui/manager/workspace.js core/ui/manager/sections.js core/ui/manager/editors.js core/ui/manager/featured.js core/ui/admin/workspace.js core/ui/admin/users.js core/ui/admin/switcher.js`
Expected: `app.js` is below `11500` lines, with the removed lines now living under `core/ui/manager/*` and `core/ui/admin/*`.

- [ ] **Step 5: Commit the final `app.js` thinning pass**

```bash
git add app.js core/ui/manager/workspace.js core/ui/manager/sections.js core/ui/manager/editors.js core/ui/manager/featured.js core/ui/admin/workspace.js core/ui/admin/users.js core/ui/admin/switcher.js tests/phase3-ui-boundaries.test.cjs tests/phase3-ui-deep-boundaries.test.cjs tests/phase18-menu-history-boundaries.test.cjs tests/phase22-category-governance.test.cjs
git commit -m "refactor: thin app manager admin runtime"
```

## Self-Review

### Spec coverage

- Manager/admin runtime scope is covered: `renderManagerWorkspace()`, `renderAdminWorkspace()`, manager section tracking, `renderManagerCategories()`, `renderManagerItems()`, `renderPricingSection()`, `renderDescriptionSection()`, `saveMenu()`, autocomplete, 86 toggle, upcharge/recipe helpers, `loadUsers()`, `renderRecentChanges()`, `renderFeaturedTab()`, `renderMenusPanel()`, `switchManagerTab()`, `switchAdminTab()`, and the related helper clusters.
- Existing modules are reused first: `core/ui/manager/workspace.js`, `core/ui/manager/sections.js`, `core/ui/manager/editors.js`, `core/ui/admin/workspace.js`, and `core/ui/admin/switcher.js` are all deepened rather than replaced.
- New modules are justified and narrow: `core/ui/manager/featured.js` isolates restaurant-special editing, and `core/ui/admin/users.js` isolates user/access management.
- Required behavior is preserved in the plan: save/send distinction, per-menu manager access, featured-item behavior, food-menu recipe hiding, admin switcher behavior, and current settings-shell accessibility.
- Verification includes the requested boundary tests plus syntax and script-order checks.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task names exact files and exact commands.
- Every code-edit step includes concrete function names, factory names, and implementation shape.

### Type consistency

- Factory names are consistent throughout the plan: `createManagerWorkspaceService`, `createManagerSectionService`, `createManagerEditorsService`, `createManagerFeaturedService`, `createAdminWorkspaceService`, `createAdminUsersService`, and `createAdminSwitcherService`.
- Delegated global method names stay stable for inline HTML handlers: `addItem`, `toggle86`, `saveMenu`, `loadUsers`, `saveUserRole`, `saveMenuAccess`, `switchManagerTab`, and `switchAdminTab`.
- Manager section ids stay consistent: `manager-items-section`, `manager-pricing-section`, `manager-description-section`, `manager-categories-section`, and `manager-database-section`.
