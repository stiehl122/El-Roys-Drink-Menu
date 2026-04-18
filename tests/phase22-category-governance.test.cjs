const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const {
  createElement,
  getState,
  loadAppSandbox,
  setState,
} = require('./helpers/runtime.cjs');

const ROOT = path.join(__dirname, '..');

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?phase22=${Date.now()}-${Math.random()}`);
}

function setupCategoryManagerDom(sandbox) {
  const doc = sandbox.document;
  const list = doc._registerElement('catmgr-list', createElement('div', 'catmgr-list'));
  const addForm = doc._registerElement('catmgr-add-form', createElement('div', 'catmgr-add-form'));
  const addButton = doc._registerElement('show-add-cat-btn', createElement('button', 'show-add-cat-btn'));
  const context = doc._registerElement('categories-menu-context', createElement('div', 'categories-menu-context'));
  const untappdRow = doc._registerElement('new-cat-untappd-row', createElement('label', 'new-cat-untappd-row'));
  const untappdCheckbox = doc._registerElement('new-cat-untappd-enabled', createElement('input', 'new-cat-untappd-enabled'));
  addForm.style.display = 'none';
  addButton.style.display = '';
  addButton.hidden = false;
  untappdRow.style.display = 'none';
  untappdCheckbox.checked = false;
  return { list, addForm, addButton, context, untappdRow, untappdCheckbox };
}

function seedCategorySandbox(sandbox, overrides = {}) {
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
        title: 'Beer',
        label: 'Beer',
        icon: '🍺',
        color: 'rgba(245,210,66,0.22)',
        sub: 'Drafts and cans',
        placeholder: 'Add beer…',
      },
      {
        id: 'cocktails',
        title: 'Cocktails',
        label: 'Cocktails',
        icon: '🍹',
        color: 'rgba(180,100,220,0.15)',
        sub: 'Classics and house drinks',
        placeholder: 'Add cocktail…',
        untappdEnabled: true,
      },
    ],
    menuState: {
      beer: { items: [], lastSent: [] },
      cocktails: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
      _meta: {},
    },
    ...overrides,
  });
}

test('workspace payload defaults untappd_enabled to false and preserves explicit values', async () => {
  const menuRead = await importApiModule('server/_menu-read.js');
  const payload = menuRead.createMenuWorkspacePayload({
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      restaurantId: '00000000-0000-0000-0000-000000000010',
      type: 'drinks',
      name: "Leroy's Lounge Drinks",
      slug: 'leroys-lounge-drinks',
    },
    cats: [
      {
        id: 'cat-1',
        key: 'beer',
        label: 'Beer',
        icon: '🍺',
        color: '',
        sub: '',
        placeholder: 'Add beer…',
        display_order: 0,
        items: [],
      },
      {
        id: 'cat-2',
        key: 'canned',
        label: 'Canned',
        icon: '🍻',
        color: '',
        sub: '',
        placeholder: 'Add canned…',
        display_order: 1,
        untappd_enabled: true,
        items: [],
      },
    ],
    meta: {},
    restaurant: null,
  }, {
    actor: {
      id: 'user-1',
      role: 'admin',
      name: 'Alex',
      accessibleMenuIds: [],
    },
  });

  assert.equal(payload.cats[0].untappd_enabled, false);
  assert.equal(payload.cats[1].untappd_enabled, true);
});

test('web menu cache snapshot includes untappd_enabled and defaults missing values to false', () => {
  const sandbox = loadAppSandbox();
  seedCategorySandbox(sandbox);

  const snapshot = sandbox.buildMenuCacheSnapshot();

  assert.equal(snapshot.cats[0].untappd_enabled, false);
  assert.equal(snapshot.cats[1].untappd_enabled, true);
});

test('category governance helper flags non-admin category mutations and ignores item-only changes', async () => {
  const governance = await importApiModule('server/_category-governance.js');
  const result = governance.detectForbiddenCategoryMutations({
    actor: { role: 'manager' },
    currentCategories: [
      {
        key: 'beer',
        label: 'Beer',
        icon: '🍺',
        color: 'rgba(1,2,3,0.1)',
        sub: '',
        placeholder: 'Add beer…',
        display_order: 0,
        untappd_enabled: false,
        items: [{ id: 'beer-1', name: 'Pilsner' }],
      },
    ],
    nextCategories: [
      {
        key: 'beer',
        label: 'Draft Beer',
        icon: '🍺',
        color: 'rgba(1,2,3,0.1)',
        sub: '',
        placeholder: 'Add beer…',
        display_order: 0,
        untappd_enabled: true,
        items: [{ id: 'beer-1', name: 'Renamed Pilsner' }],
      },
    ],
  });

  assert.equal(result.allowed, false);
  assert.deepEqual(result.changed_categories, ['beer']);

  const itemOnly = governance.detectForbiddenCategoryMutations({
    actor: { role: 'manager' },
    currentCategories: [
      {
        key: 'beer',
        label: 'Beer',
        icon: '🍺',
        color: 'rgba(1,2,3,0.1)',
        sub: '',
        placeholder: 'Add beer…',
        display_order: 0,
        untappd_enabled: false,
        items: [{ id: 'beer-1', name: 'Pilsner' }],
      },
    ],
    nextCategories: [
      {
        key: 'beer',
        label: 'Beer',
        icon: '🍺',
        color: 'rgba(1,2,3,0.1)',
        sub: '',
        placeholder: 'Add beer…',
        display_order: 0,
        untappd_enabled: false,
        items: [{ id: 'beer-1', name: 'Renamed Pilsner' }],
      },
    ],
  });

  assert.equal(itemOnly.allowed, true);
  assert.deepEqual(itemOnly.changed_categories, []);
});

test('manager categories section stays visible but read-only', () => {
  const sandbox = loadAppSandbox();
  const { list, addButton } = setupCategoryManagerDom(sandbox);
  seedCategorySandbox(sandbox);

  sandbox.renderCategoriesTab();
  const renderedHtml = list.children.map(child => child.innerHTML || '').join('\n');

  assert.match(renderedHtml, /admin-managed/i);
  assert.doesNotMatch(renderedHtml, /moveCategoryUp/);
  assert.doesNotMatch(renderedHtml, /toggleCategoryEdit/);
  assert.doesNotMatch(renderedHtml, /deleteCategory/);
  assert.equal(addButton.style.display, 'none');
  assert.equal(getState(sandbox, 'getAddItemModalCategoryDefs().length > 1'), true);
});

test('admin drinks categories expose the Untappd toggle', () => {
  const sandbox = loadAppSandbox();
  const { list, addButton, untappdRow } = setupCategoryManagerDom(sandbox);
  seedCategorySandbox(sandbox, {
    currentUser: {
      role: 'admin',
      name: 'Alex',
      accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
    },
  });

  sandbox.renderCategoriesTab();
  const renderedHtml = list.children.map(child => child.innerHTML || '').join('\n');

  assert.match(renderedHtml, /Enable Untappd import for this category/);
  assert.match(renderedHtml, /ce-untappd-beer/);
  assert.equal(addButton.style.display, '');
  assert.equal(untappdRow.style.display, '');
});

test('food menus hide Untappd category controls', () => {
  const sandbox = loadAppSandbox();
  const { list, untappdRow } = setupCategoryManagerDom(sandbox);
  seedCategorySandbox(sandbox, {
    MENU_TYPE: 'food',
    currentUser: {
      role: 'admin',
      name: 'Alex',
      accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
    },
  });

  sandbox.renderCategoriesTab();
  const renderedHtml = list.children.map(child => child.innerHTML || '').join('\n');

  assert.doesNotMatch(renderedHtml, /Enable Untappd import for this category/);
  assert.equal(untappdRow.style.display, 'none');
});
