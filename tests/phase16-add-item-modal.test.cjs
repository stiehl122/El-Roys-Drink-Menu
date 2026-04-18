const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createElement,
  getState,
  loadAppSandbox,
  setState,
} = require('./helpers/runtime.cjs');

async function flushAsync() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

function setupManagerAddItemDom(sandbox) {
  const doc = sandbox.document;
  const categories = doc._registerElement('manager-items-categories', createElement('div', 'manager-items-categories'));
  const addButton = doc._registerElement('manager-add-item-btn', createElement('button', 'manager-add-item-btn'));
  const modalHost = doc._registerElement('manager-add-item-modal-host', createElement('div', 'manager-add-item-modal-host'));
  const drawerAddButton = doc._registerElement('drawer-add-item-btn', createElement('button', 'drawer-add-item-btn'));
  const drawerSwitchButton = doc._registerElement('drawer-switch-menu-btn', createElement('button', 'drawer-switch-menu-btn'));
  const drawerAdminButton = doc._registerElement('admin-btn-drawer', createElement('button', 'admin-btn-drawer'));
  const drawerReturnButton = doc._registerElement('drawer-return-btn', createElement('button', 'drawer-return-btn'));
  const drawer = doc._registerElement('manager-settings-rail', createElement('aside', 'manager-settings-rail'));
  const backdrop = doc._registerElement('settings-drawer-backdrop', createElement('div', 'settings-drawer-backdrop'));
  const toggle = doc._registerElement('settings-drawer-toggle', createElement('button', 'settings-drawer-toggle'));
  const mobileTrigger = doc._registerElement('manager-mobile-drawer-trigger', createElement('button', 'manager-mobile-drawer-trigger'));
  const topbar = createElement('header', 'manager-shell-topbar');
  topbar.getBoundingClientRect = () => ({ bottom: 120 });
  doc._registerSelector('#app-shell > header.manager-shell-topbar', topbar);
  const saveBtn = doc._registerElement('save-btn', createElement('button', 'save-btn'));
  const sendBtn = doc._registerElement('send-btn', createElement('button', 'send-btn'));
  const syncStatus = doc._registerElement('sync-status', createElement('div', 'sync-status'));
  const actionBar = doc._registerElement('manager-action-bar', createElement('div', 'manager-action-bar'));
  const actionGroup = doc._registerElement('manager-primary-action-group', createElement('div', 'manager-primary-action-group'));
  const summary = doc._registerElement('manager-action-bar-summary', createElement('div', 'manager-action-bar-summary'));
  const footer = doc._registerElement('manager-footer-version', createElement('div', 'manager-footer-version'));

  categories.closest = () => null;
  syncStatus.closest = () => ({ hidden: false });
  drawer.classList = {
    contains() { return false; },
    toggle() {},
  };
  drawer.querySelector = () => null;
  actionBar.classList = {
    toggle() {},
  };
  footer.innerHTML = '';

  return {
    categories,
    addButton,
    modalHost,
    drawerAddButton,
    drawerSwitchButton,
    drawerAdminButton,
    drawerReturnButton,
    drawer,
    backdrop,
    toggle,
    mobileTrigger,
    topbar,
    saveBtn,
    sendBtn,
    syncStatus,
    actionBar,
    actionGroup,
    summary,
    footer,
  };
}

function seedManagerMenuState(sandbox, overrides = {}) {
  setState(sandbox, {
    MENU_ID: '00000000-0000-0000-0000-000000000020',
    MENU_TYPE: 'drinks',
    currentUser: {
      role: 'manager',
      name: 'Taylor',
      accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
    },
    CATEGORY_DEFS: [
      {
        id: 'beer',
        label: 'Beer',
        title: 'Beer',
        icon: '🍺',
        color: 'rgba(245,210,66,0.22)',
        sub: 'Drafts and cans',
        placeholder: 'Add beer…',
      },
      {
        id: 'cocktails',
        label: 'Cocktails',
        title: 'Cocktails',
        icon: '🍹',
        color: 'rgba(180,100,220,0.15)',
        sub: 'Classics and house drinks',
        placeholder: 'Add cocktail…',
      },
    ],
    menuState: {
      beer: { items: [], lastSent: [] },
      cocktails: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
    renderManagerOverviewStats: () => {},
    renderFooter: () => {},
    updateSaveBtn: () => {},
    updateManagerActionBar: () => {},
    updateDraftIndicator: () => {},
    markSectionsStale: () => {},
    showToast: () => {},
    ...overrides,
  });
}

test('manager items section uses one writable add-item launcher and removes inline add controls', () => {
  const sandbox = loadAppSandbox();
  const { categories, addButton } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  sandbox.renderManagerCategories();

  assert.equal(addButton.style.display, '');
  assert.match(addButton.textContent, /Add Item\(s\)/);
  assert.doesNotMatch(categories.innerHTML, /add-item-input/);
  assert.doesNotMatch(categories.innerHTML, /add-item-btn/);

  setState(sandbox, {
    MENU_ID: '',
    currentUser: {
      role: 'manager',
      name: 'Taylor',
      accessibleMenuIds: [],
    },
  });

  sandbox.renderManagerCategories();
  assert.equal(addButton.style.display, 'none');
});

test('confirm adds a new item to the selected category and closes the modal', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  sandbox.openAddItemModal();
  sandbox.updateAddItemModalField('name', 'Modelo Especial');
  sandbox.updateAddItemModalField('categoryId', 'beer');
  sandbox.updateAddItemModalField('desc', 'Crisp lager');
  sandbox.updateAddItemModalField('price', '$6');
  sandbox.addAddItemModalRecipeIngredient('Lime');
  sandbox.addAddItemModalUpcharge('Michelada', '+$2');

  const result = sandbox.confirmAddItemModal();
  const added = getState(sandbox, 'menuState.beer.items[0]');

  assert.equal(result.ok, true);
  assert.equal(added.name, 'Modelo Especial');
  assert.equal(added.desc, 'Crisp lager');
  assert.equal(added.price, '$6');
  assert.equal(JSON.stringify(added.recipe), JSON.stringify(['Lime']));
  assert.equal(JSON.stringify(added.upcharges), JSON.stringify([{ label: 'Michelada', price: '+$2' }]));
  assert.equal(added.onMenu, true);
  assert.equal(added.eightySixed, false);
  assert.equal(getState(sandbox, '_addItemModalState.isOpen'), false);
  assert.equal(modalHost.innerHTML.includes('Add Item(s)'), false);
});

test('confirm and add more keeps the modal open, resets the draft, and remembers the last category', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  sandbox.openAddItemModal();
  sandbox.updateAddItemModalField('name', 'House Margarita');
  sandbox.updateAddItemModalField('categoryId', 'cocktails');

  const result = sandbox.confirmAddItemModal({ addMore: true });

  assert.equal(result.ok, true);
  assert.equal(getState(sandbox, 'menuState.cocktails.items[0].name'), 'House Margarita');
  assert.equal(getState(sandbox, '_addItemModalState.isOpen'), true);
  assert.equal(getState(sandbox, '_addItemModalState.mode'), 'manual');
  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), '');
  assert.equal(getState(sandbox, '_addItemModalState.fields.categoryId'), 'cocktails');
  assert.match(modalHost.innerHTML, /Confirm &amp; Add More/);
});

test('add item modal takes over manager chrome while open and releases it on close', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  sandbox.openAddItemModal();

  assert.equal(sandbox.document.body.classList.contains('add-item-modal-open'), true);
  assert.match(modalHost.innerHTML, /manager-add-item-overlay/);

  sandbox.closeAddItemModal();

  assert.equal(sandbox.document.body.classList.contains('add-item-modal-open'), false);
  assert.equal(modalHost.innerHTML, '');
});

test('manager mobile drawer trigger appears after the header scrolls out and hides while the drawer is open', () => {
  const sandbox = loadAppSandbox();
  const { mobileTrigger, topbar } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  let headerBottom = 96;
  topbar.getBoundingClientRect = () => ({ bottom: headerBottom });
  sandbox.innerWidth = 390;
  sandbox.window.innerWidth = 390;

  sandbox.syncManagerMobileDrawerTrigger();
  assert.equal(sandbox.document.body.classList.contains('manager-mobile-drawer-trigger-visible'), false);
  assert.equal(mobileTrigger.hidden, true);

  headerBottom = -4;
  sandbox.syncManagerMobileDrawerTrigger();
  assert.equal(sandbox.document.body.classList.contains('manager-mobile-drawer-trigger-visible'), true);
  assert.equal(mobileTrigger.hidden, false);

  sandbox.setSettingsDrawerOpen(true);
  assert.equal(sandbox.document.body.classList.contains('manager-mobile-drawer-trigger-visible'), false);
  assert.equal(mobileTrigger.hidden, true);

  sandbox.setSettingsDrawerOpen(false, { restoreFocus: false });
  assert.equal(sandbox.document.body.classList.contains('manager-mobile-drawer-trigger-visible'), true);
  assert.equal(mobileTrigger.hidden, false);
});

test('duplicate blocking clears once the manager changes the conflicting draft', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox, {
    menuState: {
      beer: {
        items: [
          {
            id: 'beer-1',
            name: 'Modelo Especial',
            desc: '',
            recipe: [],
            price: '$6',
            eightySixed: false,
            onMenu: true,
            upcharges: [],
            showDescription: true,
            showRecipe: false,
          },
        ],
        lastSent: [],
      },
      cocktails: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
  });

  sandbox.openAddItemModal();
  sandbox.updateAddItemModalField('name', 'modelo especial');
  sandbox.updateAddItemModalField('categoryId', 'beer');

  const blocked = sandbox.confirmAddItemModal();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'duplicate');
  assert.match(modalHost.innerHTML, /already exists/i);

  sandbox.updateAddItemModalField('categoryId', 'cocktails');

  assert.doesNotMatch(modalHost.innerHTML, /already exists/i);
  assert.equal(sandbox.confirmAddItemModal().ok, true);
  assert.equal(getState(sandbox, 'menuState.cocktails.items[0].name'), 'modelo especial');
});

test('untappd import UI is gated by the selected drinks category and hidden on food menus', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox, {
    CATEGORY_DEFS: [
      {
        id: 'beer',
        label: 'Beer',
        title: 'Beer',
        icon: '🍺',
        color: 'rgba(245,210,66,0.22)',
        sub: 'Drafts and cans',
        placeholder: 'Add beer…',
        untappdEnabled: true,
      },
      {
        id: 'cocktails',
        label: 'Cocktails',
        title: 'Cocktails',
        icon: '🍹',
        color: 'rgba(180,100,220,0.15)',
        sub: 'Classics and house drinks',
        placeholder: 'Add cocktail…',
        untappdEnabled: false,
      },
    ],
  });

  sandbox.openAddItemModal();
  assert.match(modalHost.innerHTML, /Brewery \+ Beer/);
  assert.match(modalHost.innerHTML, />Untappd</);

  sandbox.updateAddItemModalField('categoryId', 'cocktails');

  assert.doesNotMatch(modalHost.innerHTML, /Brewery \+ Beer/);
  assert.doesNotMatch(modalHost.innerHTML, />Untappd</);

  const foodSandbox = loadAppSandbox();
  const { modalHost: foodModalHost } = setupManagerAddItemDom(foodSandbox);
  seedManagerMenuState(foodSandbox, {
    MENU_TYPE: 'food',
    CATEGORY_DEFS: [
      {
        id: 'starters',
        label: 'Starters',
        title: 'Starters',
        icon: '🥗',
        color: 'rgba(245,210,66,0.22)',
        sub: '',
        placeholder: 'Add starter…',
        untappdEnabled: true,
      },
    ],
    menuState: {
      starters: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
  });

  foodSandbox.openAddItemModal();

  assert.doesNotMatch(foodModalHost.innerHTML, />Untappd</);
  assert.doesNotMatch(foodModalHost.innerHTML, /Brewery \+ Beer/);
});

test('blank Untappd searches show inline validation without mutating the draft fields', async () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox, {
    CATEGORY_DEFS: [
      {
        id: 'beer',
        label: 'Beer',
        title: 'Beer',
        icon: '🍺',
        color: 'rgba(245,210,66,0.22)',
        sub: 'Drafts and cans',
        placeholder: 'Add beer…',
        untappdEnabled: true,
      },
    ],
    menuState: {
      beer: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
  });

  sandbox.openAddItemModal();
  const result = await sandbox.runAddItemUntappdSearch();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'required');
  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), '');
  assert.match(modalHost.innerHTML, /Enter a beer name to search Untappd/i);
});

test('untappd chooser previews matches and apply only overwrites name and description', async () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox, {
    CATEGORY_DEFS: [
      {
        id: 'beer',
        label: 'Beer',
        title: 'Beer',
        icon: '🍺',
        color: 'rgba(245,210,66,0.22)',
        sub: 'Drafts and cans',
        placeholder: 'Add beer…',
        untappdEnabled: true,
      },
    ],
    menuState: {
      beer: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
  });
  sandbox.__HF_UI_MODULES__.searchUntappdBeers = async () => ([
    { bid: 1, name: 'All Day IPA', breweryName: 'Founders', style: 'IPA', abv: 4.7 },
    { bid: 2, name: 'Two Hearted Ale', breweryName: "Bell's", style: 'IPA', abv: 7 },
  ]);
  sandbox.__HF_UI_MODULES__.previewUntappdBeerImport = async bid => ({
    bid,
    name: 'Two Hearted Ale',
    breweryName: "Bell's",
    description: 'IPA • 7% ABV',
  });

  sandbox.openAddItemModal();
  sandbox.updateAddItemModalField('name', 'Two Hearted');
  sandbox.updateAddItemModalField('price', '$8');
  sandbox.addAddItemModalRecipeIngredient('Orange');
  sandbox.addAddItemModalUpcharge('Tallboy', '+$2');

  await sandbox.runAddItemUntappdSearch();
  assert.match(modalHost.innerHTML, /Choose an Untappd match/i);
  assert.match(modalHost.innerHTML, /All Day IPA/);
  assert.match(modalHost.innerHTML, /7% ABV/);

  await sandbox.previewAddItemUntappdSelection(2);
  assert.match(modalHost.innerHTML, /Imported name/i);
  assert.match(modalHost.innerHTML, /Two Hearted Ale/);

  sandbox.setAddItemUntappdIncludeBrewery(true);
  const applyResult = sandbox.applyAddItemUntappdImport();

  assert.equal(applyResult.ok, true);
  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), "Bell's Two Hearted Ale");
  assert.equal(getState(sandbox, '_addItemModalState.fields.desc'), 'IPA • 7% ABV');
  assert.equal(getState(sandbox, '_addItemModalState.fields.price'), '$8');
  assert.equal(JSON.stringify(getState(sandbox, '_addItemModalState.fields.recipe')), JSON.stringify(['Orange']));
  assert.equal(JSON.stringify(getState(sandbox, '_addItemModalState.fields.upcharges')), JSON.stringify([{ label: 'Tallboy', price: '+$2' }]));
  assert.equal(getState(sandbox, '_addItemModalState.untappd.preview === null'), true);
});

test('untappd no-match, rerun, and cancel preserve the typed draft', async () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  let searchCount = 0;
  seedManagerMenuState(sandbox, {
    CATEGORY_DEFS: [
      {
        id: 'beer',
        label: 'Beer',
        title: 'Beer',
        icon: '🍺',
        color: 'rgba(245,210,66,0.22)',
        sub: 'Drafts and cans',
        placeholder: 'Add beer…',
        untappdEnabled: true,
      },
    ],
    menuState: {
      beer: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
  });
  sandbox.__HF_UI_MODULES__.searchUntappdBeers = async query => {
    searchCount += 1;
    if (searchCount === 1) return [];
    return [
      { bid: 9, name: `${query} Lager`, breweryName: 'Example Brewery', style: 'Lager', abv: 5 },
      { bid: 10, name: `${query} Pils`, breweryName: 'Example Brewery', style: 'Pilsner', abv: 5.2 },
    ];
  };

  sandbox.openAddItemModal();
  sandbox.updateAddItemModalField('name', 'Missing Beer');
  sandbox.updateAddItemModalField('desc', 'Keep this description');
  sandbox.updateAddItemModalField('price', '$7');

  await sandbox.runAddItemUntappdSearch();
  assert.match(modalHost.innerHTML, /No Untappd matches found/i);
  assert.equal(getState(sandbox, '_addItemModalState.fields.desc'), 'Keep this description');
  assert.equal(getState(sandbox, '_addItemModalState.fields.price'), '$7');

  sandbox.updateAddItemModalField('name', 'Fresh Beer');
  await sandbox.runAddItemUntappdSearch();

  assert.match(modalHost.innerHTML, /Choose an Untappd match/i);
  assert.match(modalHost.innerHTML, /Fresh Beer Lager/);
  assert.equal(searchCount, 2);

  sandbox.cancelAddItemUntappdFlow();

  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), 'Fresh Beer');
  assert.equal(getState(sandbox, '_addItemModalState.fields.desc'), 'Keep this description');
  assert.equal(getState(sandbox, '_addItemModalState.fields.price'), '$7');
  assert.doesNotMatch(modalHost.innerHTML, /Choose an Untappd match|No Untappd matches found/i);
});

test('food menus hide the recipe editor in the add-item modal', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox, { MENU_TYPE: 'food' });

  sandbox.openAddItemModal();

  assert.doesNotMatch(modalHost.innerHTML, /Recipe/i);
  assert.match(modalHost.innerHTML, /Description/i);
  assert.match(modalHost.innerHTML, /Price/i);
});

test('add-item modal focus helpers preserve the active text input selection across rerenders', () => {
  const sandbox = loadAppSandbox();
  const doc = sandbox.document;
  const original = doc._registerElement('add-item-name-input', createElement('input', 'add-item-name-input'));
  original.selectionStart = 2;
  original.selectionEnd = 2;
  doc.activeElement = original;

  const snapshot = sandbox.captureAddItemModalFocusState();

  const replacement = doc._registerElement('add-item-name-input', createElement('input', 'add-item-name-input'));
  replacement.focus = () => {
    doc.activeElement = replacement;
  };

  sandbox.restoreAddItemModalFocusState(snapshot);

  assert.equal(snapshot.id, 'add-item-name-input');
  assert.equal(doc.activeElement, replacement);
  assert.equal(replacement.selectionStart, 2);
  assert.equal(replacement.selectionEnd, 2);
});

test('escape closes the add-item modal', () => {
  const sandbox = loadAppSandbox();
  setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  sandbox.openAddItemModal();
  sandbox.handleAddItemModalKeydown({
    key: 'Escape',
    preventDefault() {},
  });

  assert.equal(getState(sandbox, '_addItemModalState.isOpen'), false);
});

test('drawer add-item button is role-gated and ordered below switch or admin tools', () => {
  const sandbox = loadAppSandbox();
  const { drawerAddButton, drawerSwitchButton, drawerAdminButton, drawerReturnButton } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  sandbox.renderUserHeader();
  sandbox.updateActiveMenuBar();

  assert.equal(drawerAddButton.style.display, '');
  assert.equal(drawerAddButton.style.order, '3');
  assert.equal(drawerSwitchButton.style.order, '2');
  assert.equal(drawerAdminButton.style.order, '3');
  assert.equal(drawerReturnButton.style.order, '5');

  setState(sandbox, {
    currentUser: {
      role: 'admin',
      name: 'Alex',
      accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
    },
  });

  sandbox.renderUserHeader();
  sandbox.updateActiveMenuBar();

  assert.equal(drawerAddButton.style.display, '');
  assert.equal(drawerAddButton.style.order, '4');

  setState(sandbox, {
    MENU_ID: '',
    currentUser: {
      role: 'manager',
      name: 'Taylor',
      accessibleMenuIds: [],
    },
  });

  sandbox.renderUserHeader();
  sandbox.updateActiveMenuBar();

  assert.equal(drawerAddButton.style.display, 'none');
});

test('drawer add-item action closes the drawer and opens the shared add-item modal', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  let closeArgs = null;
  const originalCloseSettingsDrawer = sandbox.closeSettingsDrawer;
  sandbox.closeSettingsDrawer = options => {
    closeArgs = options;
    return originalCloseSettingsDrawer(options);
  };

  const result = sandbox.onDrawerAddItemClick();

  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(closeArgs), JSON.stringify({ restoreFocus: false }));
  assert.equal(getState(sandbox, '_addItemModalState.isOpen'), true);
  assert.equal(getState(sandbox, '_addItemModalState.mode'), 'scan');
  assert.match(modalHost.innerHTML, /Add Item\(s\)/);
});

test('scan mode prefills the add-item form from a detected barcode and releases the scanner', async () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  let detectBarcode = null;
  let stopCount = 0;
  sandbox.__HF_UI_MODULES__.createBarcodeScannerService = () => ({
    async start(_videoEl, options = {}) {
      detectBarcode = options.onDetect;
      return { ok: true, mode: 'native' };
    },
    async stop() {
      stopCount += 1;
      return { ok: true };
    },
  });
  sandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct = async () => ({
    name: 'Topo Chico',
    description: 'Sparkling mineral water',
  });

  sandbox.openAddItemModal({ mode: 'scan' });
  await flushAsync();
  await detectBarcode('02113642');
  await flushAsync();

  assert.equal(getState(sandbox, '_addItemModalState.mode'), 'manual');
  assert.equal(getState(sandbox, '_addItemModalState.entryMode'), 'scan');
  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), 'Topo Chico');
  assert.equal(getState(sandbox, '_addItemModalState.fields.desc'), 'Sparkling mineral water');
  assert.ok(stopCount >= 1);
  assert.match(modalHost.innerHTML, /Sparkling mineral water/);
});

test('scan lookup resets stale manual pricing and modifier fields before prefilling', async () => {
  const sandbox = loadAppSandbox();
  setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  let detectBarcode = null;
  sandbox.__HF_UI_MODULES__.createBarcodeScannerService = () => ({
    async start(_videoEl, options = {}) {
      detectBarcode = options.onDetect;
      return { ok: true, mode: 'native' };
    },
    async stop() { return { ok: true }; },
  });
  sandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct = async () => ({
    name: 'Mineral Water',
    description: 'Glass bottle',
  });

  sandbox.openAddItemModal();
  sandbox.updateAddItemModalField('categoryId', 'cocktails');
  sandbox.updateAddItemModalField('price', '$12');
  sandbox.addAddItemModalUpcharge('Chamoy Rim', '+$2');
  sandbox.addAddItemModalRecipeIngredient('Lime');

  sandbox.setAddItemModalMode('scan');
  await flushAsync();
  await detectBarcode('02113642');
  await flushAsync();

  assert.equal(getState(sandbox, '_addItemModalState.fields.categoryId'), 'cocktails');
  assert.equal(getState(sandbox, '_addItemModalState.fields.price'), '');
  assert.equal(JSON.stringify(getState(sandbox, '_addItemModalState.fields.upcharges')), JSON.stringify([]));
  assert.equal(JSON.stringify(getState(sandbox, '_addItemModalState.fields.recipe')), JSON.stringify([]));
});

test('scan mode shows a toast and blank form fields when a product lookup misses', async () => {
  const sandbox = loadAppSandbox();
  setupManagerAddItemDom(sandbox);
  const toasts = [];
  seedManagerMenuState(sandbox, {
    showToast: message => toasts.push(message),
  });

  let detectBarcode = null;
  sandbox.__HF_UI_MODULES__.createBarcodeScannerService = () => ({
    async start(_videoEl, options = {}) {
      detectBarcode = options.onDetect;
      return { ok: true, mode: 'native' };
    },
    async stop() { return { ok: true }; },
  });
  sandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct = async () => null;

  sandbox.openAddItemModal({ mode: 'scan' });
  await flushAsync();
  await detectBarcode('99999999');
  await flushAsync();

  assert.equal(getState(sandbox, '_addItemModalState.mode'), 'manual');
  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), '');
  assert.equal(getState(sandbox, '_addItemModalState.fields.desc'), '');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0], 'Product not found');
});

test('scan mode falls back to manual UPC input when camera startup throws', async () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  const toasts = [];
  seedManagerMenuState(sandbox, {
    showToast: message => toasts.push(message),
  });

  const deniedError = new Error('denied');
  deniedError.name = 'NotAllowedError';
  sandbox.__HF_UI_MODULES__.createBarcodeScannerService = () => ({
    async start() { throw deniedError; },
    async stop() { return { ok: true }; },
  });

  sandbox.openAddItemModal({ mode: 'scan' });
  await flushAsync();

  assert.equal(getState(sandbox, '_addItemModalState.scanState'), 'unsupported');
  assert.match(modalHost.innerHTML, /Enter barcode \/ UPC/i);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0], 'Camera permission was denied. Enter a UPC manually instead.');
});

test('unsupported scan mode falls back to manual UPC lookup inside the modal', async () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  sandbox.__HF_UI_MODULES__.createBarcodeScannerService = () => ({
    async start() { return { ok: false, reason: 'unsupported' }; },
    async stop() { return { ok: true }; },
  });
  sandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct = async barcode => ({
    name: `Scanned ${barcode}`,
    description: 'Manual UPC match',
  });

  sandbox.openAddItemModal({ mode: 'scan' });
  await flushAsync();
  sandbox.updateAddItemModalManualBarcode('750000000001');
  await sandbox.submitAddItemModalBarcodeLookup();
  await flushAsync();

  assert.equal(getState(sandbox, '_addItemModalState.mode'), 'manual');
  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), 'Scanned 750000000001');
  assert.match(modalHost.innerHTML, /Manual UPC match/);
});

test('confirm and add more after a scanned item restarts scan mode', async () => {
  const sandbox = loadAppSandbox();
  setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  let detectBarcode = null;
  let startCount = 0;
  sandbox.__HF_UI_MODULES__.createBarcodeScannerService = () => ({
    async start(_videoEl, options = {}) {
      startCount += 1;
      detectBarcode = options.onDetect;
      return { ok: true, mode: 'native' };
    },
    async stop() { return { ok: true }; },
  });
  sandbox.__HF_UI_MODULES__.lookupOpenFoodFactsProduct = async () => ({
    name: 'Jarritos',
    description: 'Mandarin soda',
  });

  sandbox.openAddItemModal({ mode: 'scan' });
  await flushAsync();
  await detectBarcode('12345678');
  await flushAsync();
  sandbox.updateAddItemModalField('categoryId', 'beer');

  const result = sandbox.confirmAddItemModal({ addMore: true });
  await flushAsync();

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'scan');
  assert.equal(getState(sandbox, '_addItemModalState.mode'), 'scan');
  assert.equal(getState(sandbox, 'menuState.beer.items[0].name'), 'Jarritos');
  assert.equal(startCount, 2);
});

test('closing the scan modal stops the active scanner session', async () => {
  const sandbox = loadAppSandbox();
  setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox);

  let stopCount = 0;
  sandbox.__HF_UI_MODULES__.createBarcodeScannerService = () => ({
    async start() { return { ok: true, mode: 'native' }; },
    async stop() {
      stopCount += 1;
      return { ok: true };
    },
  });

  sandbox.openAddItemModal({ mode: 'scan' });
  await flushAsync();
  sandbox.closeAddItemModal();
  await flushAsync();

  assert.ok(stopCount >= 1);
  assert.equal(getState(sandbox, '_addItemModalState.isOpen'), false);
});
