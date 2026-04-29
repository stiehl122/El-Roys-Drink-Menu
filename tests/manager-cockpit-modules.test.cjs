const assert = require('node:assert/strict');
const test = require('node:test');

const { createElement, loadSandboxWithScripts } = require('./helpers/runtime.cjs');

test('createManagerCockpitService renders manager cockpit shell regions', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/activity.js',
    'core/ui/manager/notes.js',
    'core/ui/manager/cockpit.js',
  ]);

  [
    'manager-cockpit-rail-meta',
    'manager-cockpit-nav',
    'manager-cockpit-header',
    'manager-cockpit-workbar',
    'manager-cockpit-side',
    'manager-cockpit-database',
  ].forEach(id => sandbox.document._registerElement(id, createElement('div', id)));

  const service = sandbox.__HF_UI_MODULES__.createManagerCockpitService({
    document: sandbox.document,
    getActiveMenuName: () => "Leroy's Lounge Drinks",
    getLastUpdatedLabel: () => 'Last Updated: Apr 29, 2026 12:00 PM',
    getStats: () => ({ status: 'Live', statusMeta: 'Live menu is current', activeItems: 16, eightySixed: 0 }),
    getManagerNote: () => ({ note: 'Prep mint', updated_at: '2026-04-29T12:00:00.000Z' }),
    getActivityEntries: () => [{ label: 'Saved quietly', actor: 'Luke', time: 'Apr 29, 12:00 PM', channel: 'Web Manager' }],
  });

  assert.equal(service.renderCockpit(), true);
  assert.match(sandbox.document.getElementById('manager-cockpit-header').innerHTML, /Manager Workspace/);
  assert.match(sandbox.document.getElementById('manager-cockpit-workbar').innerHTML, /Add Item/);
  assert.match(sandbox.document.getElementById('manager-cockpit-side').innerHTML, /Quick Notes/);
  assert.match(sandbox.document.getElementById('manager-cockpit-nav').innerHTML, /Activity/);
});
