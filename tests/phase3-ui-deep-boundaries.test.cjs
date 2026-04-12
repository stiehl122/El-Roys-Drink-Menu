const assert = require('node:assert/strict');
const test = require('node:test');

const { loadSandboxWithScripts } = require('./helpers/runtime.cjs');

test('deep ui module scripts register manager/admin/public factories', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/editors.js',
    'core/ui/admin/switcher.js',
    'core/ui/public/renderer-default.js',
  ]);

  assert.equal(typeof sandbox.__HF_UI_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerEditorsService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createAdminSwitcherService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createPublicRendererService, 'function');
});

test('app deep ui functions delegate through shared module boundaries', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createManagerEditorsService: () => ({
        renderManagerCategories: () => calls.push('renderManagerCategories'),
        renderManagerItems: catId => calls.push(['renderManagerItems', catId]),
        renderPricingSection: () => calls.push('renderPricingSection'),
        renderDescriptionSection: () => calls.push('renderDescriptionSection'),
      }),
      createAdminSwitcherService: () => ({
        loadAdminSwitcherData: async () => {
          calls.push('loadAdminSwitcherData');
          return true;
        },
        initAdminSwitcherTab: async context => {
          calls.push(['initAdminSwitcherTab', context]);
          return true;
        },
      }),
      createPublicRendererService: () => ({
        renderPublicView: async () => {
          calls.push('renderPublicView');
          return true;
        },
        renderPublicViews: async () => {
          calls.push('renderPublicViews');
          return true;
        },
      }),
    },
  });

  sandbox.renderManagerCategories();
  sandbox.renderManagerItems('beer');
  sandbox.renderPricingSection();
  sandbox.renderDescriptionSection();
  await sandbox.loadAdminSwitcherData();
  await sandbox.initAdminSwitcherTab('notif');
  await sandbox.renderPublicView();
  await sandbox.renderPublicViews();

  assert.deepEqual(calls, [
    'renderManagerCategories',
    ['renderManagerItems', 'beer'],
    'renderPricingSection',
    'renderDescriptionSection',
    'loadAdminSwitcherData',
    ['initAdminSwitcherTab', 'notif'],
    'renderPublicView',
    'renderPublicViews',
  ]);
});
