const assert = require('node:assert/strict');
const test = require('node:test');

const { loadSandboxWithScripts } = require('./helpers/runtime.cjs');

test('ui module scripts register manager/admin/public boundary factories', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
    'core/ui/manager/sections.js',
    'core/ui/manager/editors.js',
    'core/ui/admin/workspace.js',
    'core/ui/admin/switcher.js',
    'core/ui/public/footer-actions.js',
    'core/ui/public/renderer-default.js',
  ]);

  assert.equal(typeof sandbox.__HF_UI_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerWorkspaceService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerSectionService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerEditorsService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createAdminWorkspaceService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createAdminSwitcherService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createPublicFooterActionsService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createPublicRendererService, 'function');
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

test('app manager section functions delegate through shared ui module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createManagerSectionService: () => ({
        markSectionsStale: except => calls.push(['markSectionsStale', except]),
        refreshStaleSection: sectionId => {
          calls.push(['refreshStaleSection', sectionId]);
          return true;
        },
        setManagerEditSectionVisibility: sectionId => calls.push(['setManagerEditSectionVisibility', sectionId]),
        renderActiveManagerSection: () => calls.push(['renderActiveManagerSection']),
        isManagerEditSection: sectionId => {
          calls.push(['isManagerEditSection', sectionId]);
          return sectionId === 'manager-items-section';
        },
      }),
    },
  });

  sandbox.markSectionsStale('manager-overview-section');
  const wasRendered = sandbox.refreshStaleManagerSection('manager-items-section');
  sandbox.setManagerEditSectionVisibility('manager-items-section');
  sandbox.renderActiveManagerSection();
  const isEdit = sandbox.isManagerEditSection('manager-items-section');

  assert.equal(wasRendered, true);
  assert.equal(isEdit, true);
  assert.deepEqual(calls, [
    ['markSectionsStale', 'manager-overview-section'],
    ['refreshStaleSection', 'manager-items-section'],
    ['setManagerEditSectionVisibility', 'manager-items-section'],
    ['renderActiveManagerSection'],
    ['isManagerEditSection', 'manager-items-section'],
  ]);
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
