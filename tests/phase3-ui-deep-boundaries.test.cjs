const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { loadSandboxWithScripts } = require('./helpers/runtime.cjs');
const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

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

test('deep ui boundaries no longer expose legacy shim fallbacks', () => {
  const app = read('app.js');
  const managerEditors = read('core/ui/manager/editors.js');
  const managerWorkspace = read('core/ui/manager/workspace.js');
  const managerSections = read('core/ui/manager/sections.js');
  const adminWorkspace = read('core/ui/admin/workspace.js');
  const adminSwitcher = read('core/ui/admin/switcher.js');
  const publicFooterActions = read('core/ui/public/footer-actions.js');
  const publicRenderer = read('core/ui/public/renderer-default.js');

  assert.doesNotMatch(app, /_managerEditorsLegacy|_adminSwitcherLegacy|_publicRendererLegacy/);
  assert.doesNotMatch(managerEditors, /createManagerEditorsServiceBoundary\s*\(\s*deps\s*=\s*\{\}\s*,\s*options/);
  assert.doesNotMatch(managerWorkspace, /createManagerWorkspaceServiceBoundary\s*\(\s*deps\s*=\s*\{\}\s*,\s*options/);
  assert.doesNotMatch(managerSections, /createManagerSectionServiceBoundary\s*\(\s*deps\s*=\s*\{\}\s*,\s*options/);
  assert.doesNotMatch(adminWorkspace, /createAdminWorkspaceServiceBoundary\s*\(\s*deps\s*=\s*\{\}\s*,\s*options/);
  assert.doesNotMatch(adminSwitcher, /createAdminSwitcherServiceBoundary\s*\(\s*deps\s*=\s*\{\}\s*,\s*options/);
  assert.doesNotMatch(publicFooterActions, /createPublicFooterActionsServiceBoundary\s*\(\s*deps\s*=\s*\{\}\s*,\s*options/);
  assert.doesNotMatch(publicRenderer, /createPublicRendererServiceBoundary\s*\(\s*deps\s*=\s*\{\}\s*,\s*options/);
  assert.doesNotMatch(managerEditors, /options\s*&&\s*typeof\s+options\.fallback/);
  assert.doesNotMatch(managerWorkspace, /options\s*&&\s*typeof\s+options\.fallback/);
  assert.doesNotMatch(managerSections, /options\s*&&\s*typeof\s+options\.fallback/);
  assert.doesNotMatch(adminWorkspace, /options\s*&&\s*typeof\s+options\.fallback/);
  assert.doesNotMatch(adminSwitcher, /options\s*&&\s*typeof\s+options\.fallback/);
  assert.doesNotMatch(publicFooterActions, /options\s*&&\s*typeof\s+options\.fallback/);
  assert.doesNotMatch(publicRenderer, /options\s*&&\s*typeof\s+options\.fallback/);
});
