const assert = require('node:assert/strict');
const fs = require('node:fs');
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

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

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

test('category governance compares managers against shared-draft categories when present', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const governance = await importApiModule('server/_category-governance.js');
  const originalFetch = global.fetch;

  global.fetch = async url => {
    const href = String(url);

    if (href.includes('/menus?id=eq.00000000-0000-0000-0000-000000000020')) {
      return {
        ok: true,
        async json() {
          return [{
            id: '00000000-0000-0000-0000-000000000020',
            name: "Leroy's Lounge Drinks",
            slug: 'leroys-lounge-drinks',
            type: 'drinks',
            restaurant_id: '00000000-0000-0000-0000-000000000010',
          }];
        },
      };
    }

    if (href.includes('/categories?menu_id=eq.00000000-0000-0000-0000-000000000020')) {
      return {
        ok: true,
        async json() {
          return [{
            id: 'cat-1',
            menu_id: '00000000-0000-0000-0000-000000000020',
            key: 'beer',
            label: 'Beer',
            icon: '🍺',
            color: '',
            sub: '',
            placeholder: 'Add beer…',
            display_order: 0,
            items: [{ id: 'beer-1', name: 'Pilsner' }],
          }];
        },
      };
    }

    if (href.includes('/menu_meta?menu_id=eq.00000000-0000-0000-0000-000000000020')) {
      return {
        ok: true,
        async json() {
          return [{
            draft_state: {
              cats: [{
                id: 'cat-1',
                key: 'beer',
                label: 'Draft Beer',
                icon: '🍺',
                color: '',
                sub: '',
                placeholder: 'Add beer…',
                display_order: 0,
                untappd_enabled: false,
                items: [{ id: 'beer-1', name: 'Pilsner' }],
              }],
            },
          }];
        },
      };
    }

    if (href.includes('/restaurants?id=eq.00000000-0000-0000-0000-000000000010')) {
      return {
        ok: true,
        async json() {
          return [{
            id: '00000000-0000-0000-0000-000000000010',
            name: "Leroy's Lounge",
            slug: 'leroyslounge',
            design: {},
            use_custom_design: true,
          }];
        },
      };
    }

    if (href.includes('/featured_groups?')) {
      return {
        ok: true,
        async json() {
          return [];
        },
      };
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    await assert.doesNotReject(() => governance.assertCategoryGovernanceAllowed({
      actor: { role: 'manager' },
      menuId: '00000000-0000-0000-0000-000000000020',
      snapshot: {
        cats: [{
          key: 'beer',
          label: 'Draft Beer',
          icon: '🍺',
          color: '',
          sub: '',
          placeholder: 'Add beer…',
          display_order: 0,
          untappd_enabled: false,
          items: [{ id: 'beer-1', name: 'Fresh Pilsner' }],
        }],
      },
    }));
  } finally {
    global.fetch = originalFetch;
  }
});

test('category governance can require an explicit cats payload before live or publish writes', async () => {
  const governance = await importApiModule('server/_category-governance.js');
  let fetchCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      async json() {
        return [];
      },
    };
  };

  try {
    await assert.rejects(
      () => governance.assertCategoryGovernanceAllowed({
        actor: { role: 'manager' },
        menuId: '00000000-0000-0000-0000-000000000020',
        snapshot: {},
        requireCategorySnapshot: true,
      }),
      error => error?.status === 400 && /cats\[\]/i.test(error?.message || '')
    );
    assert.equal(fetchCount, 0);
  } finally {
    global.fetch = originalFetch;
  }
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

test('canceling the add-category form resets the Untappd toggle to its default state', () => {
  const sandbox = loadAppSandbox();
  const { addForm, addButton, untappdCheckbox } = setupCategoryManagerDom(sandbox);
  seedCategorySandbox(sandbox, {
    currentUser: {
      role: 'admin',
      name: 'Alex',
      accessibleMenuIds: ['00000000-0000-0000-0000-000000000020'],
    },
  });

  addForm.style.display = '';
  addButton.textContent = '− Cancel';
  untappdCheckbox.checked = true;

  sandbox.cancelAddCategoryForm();

  assert.equal(addForm.style.display, 'none');
  assert.equal(addButton.textContent, '+ Add Category');
  assert.equal(untappdCheckbox.checked, false);
});

test('category governance blocks rename, move, and delete for featured_specials', () => {
  const source = read('app.js');
  assert.match(source, /function isProtectedSystemCategory\(/);
  assert.match(source, /catId === FEATURED_SPECIALS_CATEGORY_ID/);
});

test('local diffing counts featured_specials through featured diff only once', () => {
  const sandbox = loadAppSandbox();
  setState(sandbox, {
    CATEGORY_DEFS: [
      {
        id: 'featured_specials',
        title: 'Featured Specials',
        label: 'Featured Specials',
        icon: '⭐',
        color: '',
        sub: '',
        placeholder: '',
      },
      {
        id: 'cocktails',
        title: 'Cocktails',
        label: 'Cocktails',
        icon: '🍹',
        color: '',
        sub: '',
        placeholder: '',
      },
    ],
    menuState: {
      featured_specials: {
        items: [{
          id: 'special-1',
          name: 'House Margarita',
          desc: '',
          recipe: [],
          price: '$12',
          eightySixed: false,
          onMenu: true,
          visibility: 'public',
          upcharges: [],
          showDescription: true,
          showRecipe: false,
          featuredEnabled: true,
        }],
        lastSent: [],
      },
      cocktails: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
      _meta: {},
    },
    RESTAURANT_ID: '00000000-0000-0000-0000-000000000010',
  });

  const diffIds = Array.from(getState(sandbox, 'computeDiff().map(section => section.id)'));
  assert.equal(diffIds.join(','), '__featured__');
});
