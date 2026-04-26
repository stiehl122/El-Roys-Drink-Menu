const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getState,
  loadAppSandbox,
  setState,
} = require('./helpers/runtime.cjs');

function createMenuItem(id, name) {
  return {
    id,
    name,
    desc: '',
    recipe: [],
    price: '',
    eightySixed: false,
    onMenu: true,
    visibility: 'public',
    upcharges: [],
    showDescription: true,
    showRecipe: false,
  };
}

function createPersistedDraftItem(id, name, displayOrder) {
  return {
    id,
    name,
    desc: '',
    recipe: [],
    price: '',
    is_eighty_sixed: false,
    on_menu: true,
    visibility: 'public',
    upcharges: [],
    show_description: true,
    show_recipe: false,
    display_order: displayOrder,
  };
}

function createCamelPersistedDraftItem(id, name, displayOrder) {
  const item = createPersistedDraftItem(id, name, displayOrder);
  delete item.display_order;
  item.displayOrder = displayOrder;
  return item;
}

test('reordering manager items creates a saveable quiet draft change', () => {
  const sandbox = loadAppSandbox();
  const alpha = createMenuItem('alpha', 'Alpha');
  const bravo = createMenuItem('bravo', 'Bravo');

  setState(sandbox, {
    CATEGORY_DEFS: [{
      id: 'beer',
      title: 'Beer',
      icon: '',
      color: '',
      sub: '',
      placeholder: '',
      _uuid: 'cat-beer',
    }],
    menuState: {
      beer: {
        items: [alpha, bravo],
        lastSent: [{ ...alpha }, { ...bravo }],
      },
      _meta: {
        lastUpdatedTs: '1',
        lastSentTs: '1',
        lastSentCategories: [],
      },
    },
    currentUser: { uid: 'manager-1' },
    MENU_ID: 'menu-1',
    renderManagerItems: () => {},
    markSectionsStale: () => {},
    updateDraftIndicator: () => {},
    renderManagerOverviewStats: () => {},
    showToast: () => {},
    _activeManagerSection: 'manager-edit-section',
    _managerDraggedCatId: 'beer',
    _managerDraggedItemId: 'alpha',
  });

  getState(sandbox, 'setLocalDraftBaseSnapshot(buildPersistedDraftStateSnapshot(1000));');
  getState(sandbox, 'handleManagerItemDrop({ preventDefault() {} }, "beer", "bravo");');

  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(menuState.beer.items.map(item => item.id)))'),
    ['bravo', 'alpha'],
  );
  assert.equal(getState(sandbox, 'getDraftSaveOnlyChanges().length'), 1);
  assert.equal(getState(sandbox, 'getDraftChangeCount()'), 1);
  assert.equal(getState(sandbox, 'getMenuActionState().saveDisabled'), false);
});

test('hydrateState canonicalizes item ties by id after display order', () => {
  const sandbox = loadAppSandbox();

  setState(sandbox, {
    CATEGORY_DEFS: [],
    menuState: {},
  });

  getState(sandbox, `
    hydrateState({
      cats: [{
        id: 'cat-beer',
        key: 'beer',
        label: 'Beer',
        display_order: 0,
        items: [
          { id: 'item-b', name: 'Bordeaux', display_order: 1, onMenu: true, visibility: 'public' },
          { id: 'item-a', name: 'Albarino', display_order: 1, onMenu: true, visibility: 'public' },
          { id: 'item-c', name: 'Chianti', display_order: 0, onMenu: true, visibility: 'public' },
        ],
      }],
      meta: {},
      restaurant: null,
    })
  `);

  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(menuState.beer.items.map(item => item.id)))'),
    ['item-c', 'item-a', 'item-b'],
  );
});

test('hydrateState does not treat camel-case displayOrder as live ordering input', () => {
  const sandbox = loadAppSandbox();

  setState(sandbox, {
    CATEGORY_DEFS: [],
    menuState: {},
  });

  getState(sandbox, `
    hydrateState({
      cats: [{
        id: 'cat-beer',
        key: 'beer',
        label: 'Beer',
        display_order: 0,
        items: [
          { id: 'item-b', name: 'Bordeaux', displayOrder: 0, onMenu: true, visibility: 'public' },
          { id: 'item-a', name: 'Albarino', displayOrder: 1, onMenu: true, visibility: 'public' },
        ],
      }],
      meta: {},
      restaurant: null,
    })
  `);

  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(menuState.beer.items.map(item => item.id)))'),
    ['item-a', 'item-b'],
  );
});

test('applyPersistedDraftState canonicalizes tied draft items without false dirty state', () => {
  const sandbox = loadAppSandbox();
  const canonicalItems = [
    createPersistedDraftItem('item-c', 'Chianti', 0),
    createPersistedDraftItem('item-a', 'Albarino', 1),
    createPersistedDraftItem('item-b', 'Bordeaux', 1),
  ];
  const reversedTieItems = [
    createPersistedDraftItem('item-c', 'Chianti', 0),
    createPersistedDraftItem('item-b', 'Bordeaux', 1),
    createPersistedDraftItem('item-a', 'Albarino', 1),
  ];

  setState(sandbox, {
    CATEGORY_DEFS: [],
    menuState: {},
    currentUser: { uid: 'manager-1' },
    MENU_ID: 'menu-1',
  });

  setState(sandbox, {
    __baseDraftSnapshot: {
      cats: [{
        id: 'cat-beer',
        key: 'beer',
        label: 'Beer',
        icon: '',
        color: '',
        sub: '',
        placeholder: '',
        untappd_enabled: false,
        display_order: 0,
        items: canonicalItems,
      }],
      meta: {},
      restaurant: null,
      featured_groups: [],
      save_only_changes: [],
    },
    __resumedDraftSnapshot: {
      cats: [{
        id: 'cat-beer',
        key: 'beer',
        label: 'Beer',
        icon: '',
        color: '',
        sub: '',
        placeholder: '',
        untappd_enabled: false,
        display_order: 0,
        items: reversedTieItems,
      }],
      meta: {},
      restaurant: null,
      featured_groups: [],
      save_only_changes: [],
    },
  });

  getState(sandbox, 'setLocalDraftBaseSnapshot(__baseDraftSnapshot);');
  assert.equal(getState(sandbox, 'applyPersistedDraftState(__resumedDraftSnapshot)'), true);

  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(menuState.beer.items.map(item => item.id)))'),
    ['item-c', 'item-a', 'item-b'],
  );
  assert.equal(getState(sandbox, 'hasActualLocalDraftChanges()'), false);
});

test('dirty comparison honors camel-case displayOrder before canonical reindexing', () => {
  const sandbox = loadAppSandbox();
  const displayOrderItems = [
    createPersistedDraftItem('item-b', 'Bordeaux', 0),
    createPersistedDraftItem('item-a', 'Albarino', 1),
  ];
  const camelDisplayOrderItems = [
    createCamelPersistedDraftItem('item-a', 'Albarino', 1),
    createCamelPersistedDraftItem('item-b', 'Bordeaux', 0),
  ];

  setState(sandbox, {
    CATEGORY_DEFS: [],
    menuState: {},
    currentUser: { uid: 'manager-1' },
    MENU_ID: 'menu-1',
  });

  setState(sandbox, {
    __baseDraftSnapshot: {
      cats: [{
        id: 'cat-beer',
        key: 'beer',
        label: 'Beer',
        icon: '',
        color: '',
        sub: '',
        placeholder: '',
        untappd_enabled: false,
        display_order: 0,
        items: camelDisplayOrderItems,
      }],
      meta: {},
      restaurant: null,
      featured_groups: [],
      save_only_changes: [],
    },
    __resumedDraftSnapshot: {
      cats: [{
        id: 'cat-beer',
        key: 'beer',
        label: 'Beer',
        icon: '',
        color: '',
        sub: '',
        placeholder: '',
        untappd_enabled: false,
        display_order: 0,
        items: displayOrderItems,
      }],
      meta: {},
      restaurant: null,
      featured_groups: [],
      save_only_changes: [],
    },
  });

  getState(sandbox, 'setLocalDraftBaseSnapshot(__baseDraftSnapshot);');
  assert.equal(getState(sandbox, 'applyPersistedDraftState(__resumedDraftSnapshot)'), true);

  assert.deepEqual(
    getState(sandbox, 'JSON.parse(JSON.stringify(menuState.beer.items.map(item => item.id)))'),
    ['item-b', 'item-a'],
  );
  assert.equal(getState(sandbox, 'hasActualLocalDraftChanges()'), false);
});
