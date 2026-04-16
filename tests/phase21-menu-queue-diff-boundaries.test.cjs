const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?phase21=${Date.now()}-${Math.random()}`);
}

test('queue diff derives rename as one grouped change on stable item id', async () => {
  const queue = await importApiModule('server/_menu-queue.js');
  const state = queue.buildCategoryQueueState({
    snapshot: {
      cats: [{
        key: 'beer',
        label: 'Beer',
        icon: '🍺',
        items: [{
          id: 'item-1',
          name: 'After Name',
          price: '$11',
          desc: 'quiet field change',
          on_menu: true,
          visibility: 'public',
          is_eighty_sixed: false,
        }],
      }],
    },
    lastSentState: {
      beer: [{
        id: 'item-1',
        name: 'Before Name',
        onMenu: true,
        visibility: 'public',
        eightySixed: false,
      }],
    },
  });

  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].kind, 'rename');
  assert.equal(state.groups[0].lines.length, 2);
  assert.deepEqual(
    state.groups[0].lines.map(line => line.text),
    ['Removed Before Name', 'Added After Name']
  );
  assert.deepEqual(state.unsentItemIds, ['item-1']);
});

test('queue diff excludes quiet-only field changes from notification lines', async () => {
  const queue = await importApiModule('server/_menu-queue.js');
  const state = queue.buildCategoryQueueState({
    snapshot: {
      cats: [{
        key: 'beer',
        label: 'Beer',
        icon: '🍺',
        items: [{
          id: 'item-1',
          name: 'Quiet Lager',
          price: '$11',
          desc: 'new details',
          recipe: ['quiet'],
          on_menu: true,
          visibility: 'public',
          is_eighty_sixed: false,
        }],
      }],
    },
    lastSentState: {
      beer: [{
        id: 'item-1',
        name: 'Quiet Lager',
        price: '$9',
        desc: 'old details',
        recipe: [],
        onMenu: true,
        visibility: 'public',
        eightySixed: false,
      }],
    },
  });

  assert.equal(state.hasNotificationChanges, false);
  assert.equal(state.groups.length, 0);
  assert.deepEqual(state.diff, []);
});

test('queue diff preserves net final state for 86/restore and add/remove transitions', async () => {
  const queue = await importApiModule('server/_menu-queue.js');
  const state = queue.buildCategoryQueueState({
    snapshot: {
      cats: [{
        key: 'beer',
        label: 'Beer',
        icon: '🍺',
        items: [
          { id: 'item-stable', name: 'Stable Lager', on_menu: true, visibility: 'public', is_eighty_sixed: false },
          { id: 'item-added', name: 'Fresh Add', on_menu: true, visibility: 'public', is_eighty_sixed: false },
        ],
      }],
    },
    lastSentState: {
      beer: [
        { id: 'item-stable', name: 'Stable Lager', onMenu: true, visibility: 'public', eightySixed: false },
        { id: 'item-removed', name: 'Old Remove', onMenu: true, visibility: 'public', eightySixed: false },
      ],
    },
  });

  assert.equal(state.groups.length, 2);
  const kinds = state.groups.map(group => group.kind).sort();
  assert.deepEqual(kinds, ['added', 'removed']);
  assert.deepEqual(state.unsentItemIds, ['item-added']);
});
