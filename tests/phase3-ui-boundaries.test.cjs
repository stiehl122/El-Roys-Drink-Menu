const assert = require('node:assert/strict');
const test = require('node:test');

const { loadSandboxWithScripts } = require('./helpers/runtime.cjs');

test('ui module scripts register manager/admin/public boundary factories', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
    'core/ui/admin/workspace.js',
    'core/ui/public/footer-actions.js',
  ]);

  assert.equal(typeof sandbox.__HF_UI_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerWorkspaceService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createAdminWorkspaceService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createPublicFooterActionsService, 'function');
});

test('app manager ui functions delegate through shared ui module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createManagerWorkspaceService: () => ({
        updateManagerActionBar: () => calls.push('updateManagerActionBar'),
        syncManagerActionBarStatus: () => calls.push('syncManagerActionBarStatus'),
        renderManagerWorkspace: options => calls.push(['renderManagerWorkspace', options]),
      }),
    },
  });

  sandbox.updateManagerActionBar();
  sandbox.syncManagerActionBarStatus();
  sandbox.renderManagerWorkspace({ includeRecentChanges: false });

  assert.equal(calls[0], 'updateManagerActionBar');
  assert.equal(calls[1], 'syncManagerActionBarStatus');
  assert.deepEqual(calls[2], ['renderManagerWorkspace', { includeRecentChanges: false }]);
});

test('app admin ui functions delegate through shared ui module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createAdminWorkspaceService: () => ({
        renderAdminWorkspace: () => calls.push('renderAdminWorkspace'),
      }),
    },
  });

  sandbox.renderAdminWorkspace();
  assert.deepEqual(calls, ['renderAdminWorkspace']);
});

test('app public footer ui functions delegate through shared ui module boundary', () => {
  const calls = [];
  const expectedState = {
    signedIn: false,
    menuId: 'menu-1',
    restaurantId: 'restaurant-1',
    signIn: { key: 'signin', label: 'Staff Sign-In', href: '', action: 'openAuthOverlay' },
    links: [],
  };

  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createPublicFooterActionsService: () => ({
        buildPublicStaffFooterState: (...args) => {
          calls.push(['buildPublicStaffFooterState', args]);
          return expectedState;
        },
        syncPublicStaffFooterActions: state => {
          calls.push(['syncPublicStaffFooterActions', state]);
        },
      }),
    },
  });

  const state = sandbox.buildPublicStaffFooterState(null, { menuId: 'menu-1', restaurantId: 'restaurant-1' });
  sandbox.syncPublicStaffFooterActions(state);

  assert.deepEqual(state, expectedState);
  assert.equal(calls[0][0], 'buildPublicStaffFooterState');
  assert.equal(calls[1][0], 'syncPublicStaffFooterActions');
});
