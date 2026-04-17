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
