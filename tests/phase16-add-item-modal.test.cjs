const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createElement,
  getState,
  loadAppSandbox,
  setState,
} = require('./helpers/runtime.cjs');

function setupManagerAddItemDom(sandbox) {
  const doc = sandbox.document;
  const categories = doc._registerElement('manager-items-categories', createElement('div', 'manager-items-categories'));
  const addButton = doc._registerElement('manager-add-item-btn', createElement('button', 'manager-add-item-btn'));
  const modalHost = doc._registerElement('manager-add-item-modal-host', createElement('div', 'manager-add-item-modal-host'));
  const saveBtn = doc._registerElement('save-btn', createElement('button', 'save-btn'));
  const sendBtn = doc._registerElement('send-btn', createElement('button', 'send-btn'));
  const syncStatus = doc._registerElement('sync-status', createElement('div', 'sync-status'));
  const actionBar = doc._registerElement('manager-action-bar', createElement('div', 'manager-action-bar'));
  const actionGroup = doc._registerElement('manager-primary-action-group', createElement('div', 'manager-primary-action-group'));
  const summary = doc._registerElement('manager-action-bar-summary', createElement('div', 'manager-action-bar-summary'));
  const footer = doc._registerElement('manager-footer-version', createElement('div', 'manager-footer-version'));

  categories.closest = () => null;
  syncStatus.closest = () => ({ hidden: false });
  actionBar.classList = {
    toggle() {},
  };
  footer.innerHTML = '';

  return {
    categories,
    addButton,
    modalHost,
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
  assert.equal(getState(sandbox, '_addItemModalState.fields.name'), '');
  assert.equal(getState(sandbox, '_addItemModalState.fields.categoryId'), 'cocktails');
  assert.match(modalHost.innerHTML, /Confirm &amp; Add More/);
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

test('food menus hide the recipe editor in the add-item modal', () => {
  const sandbox = loadAppSandbox();
  const { modalHost } = setupManagerAddItemDom(sandbox);
  seedManagerMenuState(sandbox, { MENU_TYPE: 'food' });

  sandbox.openAddItemModal();

  assert.doesNotMatch(modalHost.innerHTML, /Recipe/i);
  assert.match(modalHost.innerHTML, /Description/i);
  assert.match(modalHost.innerHTML, /Price/i);
});
