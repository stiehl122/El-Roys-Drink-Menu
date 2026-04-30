const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createElement,
  loadSandboxWithScripts,
} = require('./helpers/runtime.cjs');

function setupService(options = {}) {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/item-editor-modal.js',
  ]);
  const host = sandbox.document._registerElement(
    'manager-item-editor-modal-root',
    createElement('div', 'manager-item-editor-modal-root'),
  );
  const applyCalls = [];
  const removeCalls = [];
  const confirmCalls = [];
  const item = options.item || {
    id: 'marg',
    name: 'House Margarita',
    desc: 'Lime and tequila',
    price: '$10',
    recipe: ['Tequila', 'Lime'],
    upcharges: [{ label: 'Mezcal', price: '+$2' }],
    eightySixed: false,
    onMenu: true,
    showDescription: true,
    showRecipe: false,
  };
  const service = sandbox.__HF_UI_MODULES__.createManagerItemEditorModalService({
    document: sandbox.document,
    window: {
      confirm(message) {
        confirmCalls.push(message);
        return options.confirmResult ?? true;
      },
    },
    getItem: () => item,
    getCategories: () => [
      { id: 'cocktails', title: 'Cocktails' },
      { id: 'beer', title: 'Beer' },
    ],
    menuType: options.menuType || 'drinks',
    applyItemPatch(payload) {
      applyCalls.push(payload);
      return options.applyResult || { ok: true };
    },
    removeFromMenu(payload) {
      removeCalls.push(payload);
      return options.removeResult || { ok: true };
    },
  });

  return { service, host, item, applyCalls, removeCalls, confirmCalls };
}

test('edit modal applies changed fields only on apply and not during updateField', () => {
  const { service, item, applyCalls } = setupService();

  assert.equal(service.open({
    categoryId: 'cocktails',
    itemId: 'marg',
    item,
    category: { title: 'Cocktails' },
  }), true);

  service.updateField('name', '  Skinny Margarita  ');
  service.updateField('price', '$11');

  assert.equal(item.name, 'House Margarita');
  assert.equal(item.price, '$10');
  assert.equal(applyCalls.length, 0);

  const result = service.apply();

  assert.equal(result.ok, true);
  assert.equal(applyCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(applyCalls[0])), {
    categoryId: 'cocktails',
    itemId: 'marg',
    patch: {
      name: 'Skinny Margarita',
      price: '$11',
    },
  });
});

test('empty item name validation blocks apply', () => {
  const { service, item, applyCalls, host } = setupService();

  service.open({
    categoryId: 'cocktails',
    itemId: 'marg',
    item,
    category: { title: 'Cocktails' },
  });
  service.updateField('name', '   ');

  const result = service.apply();

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Item name is required.');
  assert.equal(applyCalls.length, 0);
  assert.match(host.innerHTML, /Item name is required\./);
});

test('food menu hides recipe controls', () => {
  const { service, item, host } = setupService({ menuType: 'food' });

  service.open({
    categoryId: 'cocktails',
    itemId: 'marg',
    item,
    category: { title: 'Cocktails' },
  });

  assert.doesNotMatch(host.innerHTML, /data-manager-item-editor-field="recipe"/);
  assert.doesNotMatch(host.innerHTML, /Show recipe on menu/);
});

test('remove from menu confirms before calling dependency', () => {
  const blocked = setupService({ confirmResult: false });
  blocked.service.open({
    categoryId: 'cocktails',
    itemId: 'marg',
    item: blocked.item,
    category: { title: 'Cocktails' },
  });

  const blockedResult = blocked.service.remove();
  assert.equal(blockedResult.ok, false);
  assert.equal(blockedResult.reason, 'cancelled');
  assert.deepEqual(blocked.confirmCalls, ['Remove this item from the active menu?']);
  assert.equal(blocked.removeCalls.length, 0);

  const confirmed = setupService({ confirmResult: true });
  confirmed.service.open({
    categoryId: 'cocktails',
    itemId: 'marg',
    item: confirmed.item,
    category: { title: 'Cocktails' },
  });

  const confirmedResult = confirmed.service.remove();
  assert.equal(confirmedResult.ok, true);
  assert.deepEqual(confirmed.confirmCalls, ['Remove this item from the active menu?']);
  assert.deepEqual(JSON.parse(JSON.stringify(confirmed.removeCalls)), [{ categoryId: 'cocktails', itemId: 'marg' }]);
});
