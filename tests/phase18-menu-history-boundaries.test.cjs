const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function sliceFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing signature: ${signature}`);
  const end = nextSignature ? source.indexOf(nextSignature, start) : -1;
  return end === -1 ? source.slice(start) : source.slice(start, end);
}

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?phase18=${Date.now()}-${Math.random()}`);
}

test('manager route delegates history reads through the shared menu history helper', () => {
  const routeSource = read('api/manager.js');

  assert.match(routeSource, /from '\.\.\/server\/_menu-history\.js'/);
  assert.match(routeSource, /readMenuHistoryForRequest/);
});

test('shared menu history helper exposes stable contract helpers', async () => {
  const helper = await importApiModule('server/_menu-history.js');

  assert.equal(typeof helper.parseMenuHistoryRequest, 'function');
  assert.equal(typeof helper.normalizeHistoryDays, 'function');
  assert.equal(typeof helper.normalizeHistoryLimit, 'function');
  assert.equal(typeof helper.normalizeHistoryLogEntry, 'function');
  assert.equal(typeof helper.createMenuHistoryPayload, 'function');
  assert.equal(typeof helper.readMenuHistoryForRequest, 'function');
});

test('menu history payload preserves diff and message fields for manager consumers', async () => {
  const helper = await importApiModule('server/_menu-history.js');
  const payload = helper.createMenuHistoryPayload({
    actor: { id: 'user-1', name: 'Alex', role: 'manager' },
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      slug: 'leroys-lounge-drinks',
      name: "Leroy's Lounge Drinks",
      type: 'drinks',
      restaurantId: '00000000-0000-0000-0000-000000000010',
    },
    logs: [{
      id: 'log-1',
      menu_id: '00000000-0000-0000-0000-000000000020',
      user_id: 'user-1',
      user_name: 'Alex',
      diff: [{ id: 'beer', label: 'Beer', added: ['Lager'] }],
      message: 'Heads up: taps moved.',
      source: 'web_manager',
      created_at: '2026-04-13T12:00:00.000Z',
    }],
    days: 7,
    limit: 25,
    includesSource: true,
  });

  assert.equal(payload.context.kind, 'menu-history');
  assert.equal(payload.logs.length, 1);
  assert.equal(payload.logs[0].message, 'Heads up: taps moved.');
   assert.equal(payload.logs[0].source, 'web_manager');
  assert.deepEqual(payload.logs[0].diff, [{ id: 'beer', label: 'Beer', added: ['Lager'] }]);
  assert.equal(payload.capabilities.canReadHistory, true);
  assert.equal(payload.capabilities.includesMessage, true);
  assert.equal(payload.capabilities.includesSource, true);
  assert.equal(payload.history.scope, 'menu');
  assert.equal(payload.compatibility.contract, 'menu-history.v2');
});

test('restaurant history payload adds menu metadata while preserving flat log rows', async () => {
  const helper = await importApiModule('server/_menu-history.js');
  const payload = helper.createMenuHistoryPayload({
    actor: { id: 'user-1', name: 'Alex', role: 'manager' },
    menu: {
      id: '00000000-0000-0000-0000-000000000020',
      slug: 'leroys-lounge-drinks',
      name: "Leroy's Lounge Drinks",
      type: 'drinks',
      restaurantId: '00000000-0000-0000-0000-000000000010',
    },
    restaurant: {
      id: '00000000-0000-0000-0000-000000000010',
      slug: 'leroys-lounge',
      name: "Leroy's Lounge",
    },
    logs: [{
      id: 'log-1',
      menu_id: '00000000-0000-0000-0000-000000000020',
      user_id: 'user-1',
      user_name: 'Alex',
      diff: [{ id: 'beer', label: 'Beer', added: ['Lager'] }],
      message: 'Heads up: taps moved.',
      source: 'web_manager',
      created_at: '2026-04-13T12:00:00.000Z',
      menu: {
        id: '00000000-0000-0000-0000-000000000020',
        slug: 'leroys-lounge-drinks',
        name: "Leroy's Lounge Drinks",
        type: 'drinks',
        restaurantId: '00000000-0000-0000-0000-000000000010',
      },
    }],
    days: 7,
    limit: 25,
    scope: 'restaurant',
    includesSource: true,
  });

  assert.equal(payload.context.kind, 'restaurant-history');
  assert.equal(payload.context.restaurant.name, "Leroy's Lounge");
  assert.equal(payload.history.scope, 'restaurant');
  assert.equal(payload.logs[0].menu.slug, 'leroys-lounge-drinks');
  assert.equal(payload.logs[0].source, 'web_manager');
});

test('app runtime routes recent changes through the consolidated manager endpoint', () => {
  const source = read('app.js');
  const readHistorySource = sliceFunction(
    source,
    'async function readMenuHistoryThroughApi(',
    'async function saveDraftThroughApi('
  );
  const renderRecentSource = sliceFunction(
    source,
    'async function renderRecentChanges() {',
    'function renderUsersTab('
  );

  assert.match(readHistorySource, /\/api\/manager\?/);
  assert.match(readHistorySource, /getAuthorizedApiHeaders\(\)/);
  assert.match(renderRecentSource, /readMenuHistoryThroughApi/);
  assert.doesNotMatch(renderRecentSource, /rest\/v1\/update_log/);
});
