const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createElement,
  getState,
  loadSandboxWithScripts,
  setState,
} = require('./helpers/runtime.cjs');

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
  const navHtml = sandbox.document.getElementById('manager-cockpit-nav').innerHTML;
  ['Overview', 'Edit Items', 'Featured', 'Activity', 'Database'].forEach(label => {
    assert.match(navHtml, new RegExp(label));
  });
});

test('createManagerNotesService preserves typed text and exposes errors after save failure', async () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/notes.js',
  ]);
  const service = sandbox.__HF_UI_MODULES__.createManagerNotesService({
    saveNote: async () => {
      throw new Error('Notes unavailable');
    },
  });

  service.setInitialNote({
    note: 'Opening count complete',
    updated_at: '2026-04-29T12:00:00.000Z',
    updated_by: 'Mina',
  });
  service.setText('Need more mint');

  const result = await service.save();

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Notes unavailable');
  assert.deepEqual(JSON.parse(JSON.stringify(service.getState())), {
    text: 'Need more mint',
    savedText: 'Opening count complete',
    isSaving: false,
    error: 'Notes unavailable',
    updatedAt: '2026-04-29T12:00:00.000Z',
    updatedBy: 'Mina',
  });
});

test('createManagerActivityService normalizes quiet saves and sends', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/activity.js',
  ]);
  const service = sandbox.__HF_UI_MODULES__.createManagerActivityService();

  const entries = service.normalizeActivity([
    { event_type: 'save_quietly', user_name: 'Alex', created_at: '2026-04-29T12:00:00.000Z', source: 'web_manager' },
    { event_type: 'save_live', actor: 'Mina', time: 'Apr 29, 12:05 PM', channel: 'Manager' },
    { event_type: 'send_notification', user_name: 'Rae', created_at: '2026-04-29T12:10:00.000Z', source: 'groupme' },
    { event_type: 'publish', user_name: 'Lee', created_at: '2026-04-29T12:15:00.000Z' },
    { event_type: 'category_rename', user_name: 'Kai', created_at: '2026-04-29T12:20:00.000Z' },
  ]);

  assert.deepEqual(entries.map(entry => entry.label), [
    'Saved quietly',
    'Saved quietly',
    'Sent update',
    'Sent update',
    'Updated menu',
  ]);
  assert.equal(entries[0].actor, 'Alex');
  assert.equal(entries[0].time, '2026-04-29T12:00:00.000Z');
  assert.equal(entries[0].channel, 'web_manager');
  assert.match(service.renderActivityHtml(entries), /Saved quietly/);
  assert.match(service.renderActivityHtml(entries), /Sent update/);
});

test('createManagerRevisionDockService collapses idle state and expands for work or sync messages', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/revision-dock.js',
  ]);
  const service = sandbox.__HF_UI_MODULES__.createManagerRevisionDockService();

  assert.equal(service.getDockMode({ hasWork: false, syncMessage: '', isSaving: false }), 'collapsed');
  assert.equal(service.getDockMode({ hasWork: true, syncMessage: '', isSaving: false }), 'expanded');
  assert.equal(service.getDockMode({ hasWork: false, syncMessage: 'Cloud sync failed', isSaving: false }), 'expanded');
  assert.equal(service.getDockMode({ hasWork: false, syncMessage: '', isSaving: true }), 'expanded');
  assert.equal(service.getDockMode({ hasWork: true, syncMessage: '', isScrollCollapsed: true }), 'collapsed');
});

test('createManagerRevisionDockService renders adaptive dock markup with legacy action ids', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/revision-dock.js',
  ]);
  const service = sandbox.__HF_UI_MODULES__.createManagerRevisionDockService();

  const idleHtml = service.renderDockHtml({
    summary: 'No pending changes',
    syncMessage: '',
    saveDisabled: true,
    showDiscard: false,
  });
  const workHtml = service.renderDockHtml({
    hasWork: true,
    summary: '2 pending changes. Save opens a review before anything goes live.',
    syncMessage: 'Cloud sync failed',
    syncClass: 'sync-error',
    saveDisabled: false,
    showDiscard: true,
  });
  const scrollingHtml = service.renderDockHtml({
    hasWork: true,
    isScrollCollapsed: true,
    summary: '2 pending changes. Save opens a review before anything goes live.',
    saveDisabled: false,
    showDiscard: true,
  });

  assert.match(idleHtml, /manager-cockpit-dock-inner is-collapsed/);
  assert.match(idleHtml, /id="save-btn" onclick="openPreview\(\)"/);
  assert.match(idleHtml, /id="discard-draft-btn" onclick="discardLocalDraft\(\)" hidden/);
  assert.match(idleHtml, /id="sync-status"/);
  assert.match(workHtml, /manager-cockpit-dock-inner is-expanded/);
  assert.match(workHtml, /2 pending changes/);
  assert.match(workHtml, /id="sync-status" class="sync-error"/);
  assert.match(workHtml, /Cloud sync failed/);
  assert.match(scrollingHtml, /manager-cockpit-dock-inner is-collapsed/);
});

test('updateManagerActionBar renders cockpit dock and clears legacy action ids', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/revision-dock.js',
    'app.js',
  ]);
  const dock = sandbox.document._registerElement('manager-cockpit-revision-dock', createElement('div', 'manager-cockpit-revision-dock'));
  const bar = sandbox.document._registerElement('manager-action-bar', createElement('div', 'manager-action-bar'));
  bar.innerHTML = [
    '<button id="save-btn" onclick="openPreview()">Save</button>',
    '<button id="discard-draft-btn" onclick="discardLocalDraft()">Discard Draft</button>',
    '<div id="sync-status"></div>',
  ].join('');
  sandbox.document._registerElement('manager-action-bar-summary', createElement('p', 'manager-action-bar-summary'));
  sandbox.document._registerElement('manager-primary-action-group', createElement('div', 'manager-primary-action-group'));
  sandbox.document._registerElement('save-btn', createElement('button', 'save-btn'));
  sandbox.document._registerElement('discard-draft-btn', createElement('button', 'discard-draft-btn'));
  sandbox.document._registerElement('send-btn', createElement('button', 'send-btn'));
  const syncStatus = sandbox.document._registerElement('sync-status', createElement('div', 'sync-status'));
  syncStatus.textContent = 'Cloud sync failed';
  syncStatus.className = 'sync-error';

  setState(sandbox, {
    _dirty: true,
    _draftSaveOnlyChanges: new Map([['price-format', { key: 'price-format', label: 'Updated price format' }]]),
    _serverLiveSnapshot: null,
    _localDraftBaseSnapshot: null,
  });

  getState(sandbox, 'updateManagerActionBar()');

  assert.equal(bar.hidden, true);
  assert.equal(bar.innerHTML, '');
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-expanded/);
  assert.equal((dock.innerHTML.match(/id="save-btn"/g) || []).length, 1);
  assert.equal((dock.innerHTML.match(/id="discard-draft-btn"/g) || []).length, 1);
  assert.equal((dock.innerHTML.match(/id="sync-status"/g) || []).length, 1);
  assert.match(dock.innerHTML, /Cloud sync failed/);
});

test('updateManagerActionBar renders cockpit dock after workspace service delegation', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
    'core/ui/manager/revision-dock.js',
    'app.js',
  ]);
  const dock = sandbox.document._registerElement('manager-cockpit-revision-dock', createElement('div', 'manager-cockpit-revision-dock'));
  const bar = sandbox.document._registerElement('manager-action-bar', createElement('div', 'manager-action-bar'));
  sandbox.document._registerElement('manager-action-bar-summary', createElement('p', 'manager-action-bar-summary'));
  sandbox.document._registerElement('manager-primary-action-group', createElement('div', 'manager-primary-action-group'));
  sandbox.document._registerElement('save-btn', createElement('button', 'save-btn'));
  sandbox.document._registerElement('discard-draft-btn', createElement('button', 'discard-draft-btn'));
  sandbox.document._registerElement('send-btn', createElement('button', 'send-btn'));
  const syncStatus = sandbox.document._registerElement('sync-status', createElement('div', 'sync-status'));
  syncStatus.textContent = 'Cloud sync failed';
  syncStatus.className = 'sync-error';

  setState(sandbox, {
    _dirty: true,
    _draftSaveOnlyChanges: new Map([['featured-special', { key: 'featured-special', label: 'Updated featured special' }]]),
    _serverLiveSnapshot: null,
    _localDraftBaseSnapshot: null,
  });

  getState(sandbox, 'updateManagerActionBar()');

  assert.equal(bar.hidden, true);
  assert.equal(bar.innerHTML, '');
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-expanded/);
  assert.equal((dock.innerHTML.match(/id="save-btn"/g) || []).length, 1);
  assert.equal((dock.innerHTML.match(/id="discard-draft-btn"/g) || []).length, 1);
  assert.equal((dock.innerHTML.match(/id="sync-status"/g) || []).length, 1);
  assert.match(dock.innerHTML, /Cloud sync failed/);
});

test('manager revision dock collapses while scrolling and re-expands after idle', async () => {
  const listeners = {};
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
    'core/ui/manager/revision-dock.js',
    'app.js',
  ], {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  });
  const dock = sandbox.document._registerElement('manager-cockpit-revision-dock', createElement('div', 'manager-cockpit-revision-dock'));
  sandbox.document._registerElement('manager-action-bar', createElement('div', 'manager-action-bar'));
  sandbox.document._registerElement('manager-action-bar-summary', createElement('p', 'manager-action-bar-summary'));
  sandbox.document._registerElement('manager-primary-action-group', createElement('div', 'manager-primary-action-group'));
  sandbox.document._registerElement('save-btn', createElement('button', 'save-btn'));
  sandbox.document._registerElement('discard-draft-btn', createElement('button', 'discard-draft-btn'));
  sandbox.document._registerElement('send-btn', createElement('button', 'send-btn'));
  sandbox.document._registerElement('sync-status', createElement('div', 'sync-status'));

  setState(sandbox, {
    _dirty: true,
    _draftSaveOnlyChanges: new Map([['featured-special', { key: 'featured-special', label: 'Updated featured special' }]]),
    _serverLiveSnapshot: null,
    _localDraftBaseSnapshot: null,
  });

  getState(sandbox, 'updateManagerActionBar()');
  assert.equal(typeof listeners.scroll, 'function');
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-expanded/);

  listeners.scroll();
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-collapsed/);

  await new Promise(resolve => setTimeout(resolve, 260));
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-expanded/);
});

test('syncManagerActionBarStatus refreshes cockpit dock mode for sync-only changes', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
    'core/ui/manager/revision-dock.js',
    'app.js',
  ]);
  const dock = sandbox.document._registerElement('manager-cockpit-revision-dock', createElement('div', 'manager-cockpit-revision-dock'));
  sandbox.document._registerElement('manager-action-bar', createElement('div', 'manager-action-bar'));
  sandbox.document._registerElement('manager-action-bar-summary', createElement('p', 'manager-action-bar-summary'));
  sandbox.document._registerElement('manager-primary-action-group', createElement('div', 'manager-primary-action-group'));
  sandbox.document._registerElement('save-btn', createElement('button', 'save-btn'));
  sandbox.document._registerElement('discard-draft-btn', createElement('button', 'discard-draft-btn'));
  sandbox.document._registerElement('send-btn', createElement('button', 'send-btn'));
  const syncStatus = sandbox.document._registerElement('sync-status', createElement('div', 'sync-status'));

  setState(sandbox, {
    _dirty: false,
    _draftSaveOnlyChanges: new Map(),
    _serverLiveSnapshot: null,
    _localDraftBaseSnapshot: null,
  });

  getState(sandbox, 'updateManagerActionBar()');
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-collapsed/);

  syncStatus.textContent = 'Cloud sync failed';
  syncStatus.className = 'sync-error';
  sandbox.__testSyncEl = syncStatus;
  getState(sandbox, 'syncManagerActionBarStatus(globalThis.__testSyncEl)');
  delete sandbox.__testSyncEl;
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-expanded/);
  assert.match(dock.innerHTML, /id="sync-status" class="sync-error"/);
  assert.match(dock.innerHTML, /Cloud sync failed/);

  syncStatus.textContent = '';
  syncStatus.className = '';
  sandbox.__testSyncEl = syncStatus;
  getState(sandbox, 'syncManagerActionBarStatus(globalThis.__testSyncEl)');
  delete sandbox.__testSyncEl;
  assert.match(dock.innerHTML, /manager-cockpit-dock-inner is-collapsed/);
});

test('renderRecentChanges clears cached manager activity when history is empty', async () => {
  const sandbox = loadSandboxWithScripts(['app.js']);
  const wrap = sandbox.document._registerElement('recent-changes-wrap', createElement('div', 'recent-changes-wrap'));
  setState(sandbox, {
    MENU_ID: '00000000-0000-0000-0000-000000000020',
    currentUser: { accessToken: 'token' },
    _managerActivityEntries: [{ event_type: 'send_notification', user_name: 'Old', created_at: '2026-04-28T12:00:00.000Z' }],
    readMenuHistoryThroughApi: async () => ({
      history: { scope: 'menu' },
      logs: [],
    }),
  });

  await getState(sandbox, 'renderRecentChanges()');

  assert.deepEqual(JSON.parse(getState(sandbox, 'JSON.stringify(_managerActivityEntries)')), []);
  assert.match(wrap.innerHTML, /No sent updates for this menu/);
});

test('createManagerCockpitService renders quick notes save control and status', () => {
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

  const notesService = sandbox.__HF_UI_MODULES__.createManagerNotesService();
  notesService.setInitialNote({
    note: 'Prep mint',
    updated_at: '2026-04-29T12:00:00.000Z',
    updated_by: 'Mina',
  });
  const service = sandbox.__HF_UI_MODULES__.createManagerCockpitService({
    document: sandbox.document,
    notesService,
    activityService: sandbox.__HF_UI_MODULES__.createManagerActivityService(),
  });

  assert.equal(service.renderCockpit(), true);
  const html = sandbox.document.getElementById('manager-cockpit-side').innerHTML;
  assert.match(html, /id="manager-quick-note"/);
  assert.match(html, /id="manager-quick-note-save"/);
  assert.match(html, /manager-quick-note-status/);
  assert.match(html, /Saved Apr 29, 2026/);
});

test('createManagerItemsTableService renders cockpit item table actions without inline or swipe controls', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/items-table.js',
  ]);
  const service = sandbox.__HF_UI_MODULES__.createManagerItemsTableService();
  const tableState = service.buildTableState({
    categories: [{ id: 'cocktails', title: 'Cocktails', icon: 'C' }],
    menuState: {
      cocktails: {
        items: [{
          id: 'marg',
          name: 'House Margarita',
          eightySixed: false,
          onMenu: true,
        }],
      },
    },
  });

  const html = service.renderTableHtml(tableState);

  ['Order', 'Item Name', 'Status', 'Edit', '86'].forEach(label => {
    assert.match(html, new RegExp(label));
  });
  assert.match(html, /data-item-action="edit"/);
  assert.doesNotMatch(html, /<input\b/);
  assert.doesNotMatch(html, />Delete</);
  assert.doesNotMatch(html, /item-swipeable/);
  assert.doesNotMatch(html, /swipe-action/);
});

test('createManagerWorkspaceService skips legacy primary section renderers during cockpit render', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/workspace.js',
  ]);
  const renderCalls = [];
  const service = sandbox.__HF_UI_MODULES__.createManagerWorkspaceService({
    document: sandbox.document,
    window: { innerWidth: 1024 },
    renderManagerCategories: () => renderCalls.push('manager-categories'),
    renderPricingSection: () => renderCalls.push('pricing'),
    renderDescriptionSection: () => renderCalls.push('description'),
    renderFeaturedTab: () => renderCalls.push('featured'),
    renderCategoriesTab: () => renderCalls.push('categories-tab'),
    updateManagerToolsContext: () => renderCalls.push('tools-context'),
    renderDatabaseTab: () => renderCalls.push('database'),
    renderPruneSection: () => renderCalls.push('prune'),
    updateActiveMenuBar: () => renderCalls.push('active-menu-bar'),
    renderRecentChanges: () => renderCalls.push('recent'),
    updateManagerActionBar: () => renderCalls.push('action-bar'),
    renderFooter: () => renderCalls.push('footer'),
    initManagerMobileDrawerTrigger: () => renderCalls.push('mobile-drawer'),
    initDrawerSwipe: () => renderCalls.push('drawer-swipe'),
  });

  service.renderManagerWorkspace();

  assert.deepEqual(renderCalls, [
    'featured',
    'tools-context',
    'active-menu-bar',
    'recent',
    'footer',
    'mobile-drawer',
    'drawer-swipe',
  ]);
});

test('fallback renderManagerWorkspace skips legacy primary sections on cockpit route', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/cockpit.js',
    'core/ui/manager/items-table.js',
    'app.js',
  ]);
  [
    'manager-cockpit-header',
    'manager-cockpit-workbar',
    'manager-cockpit-side',
    'manager-cockpit-items',
    'manager-cockpit-database',
    'manager-cockpit-rail-meta',
    'manager-cockpit-nav',
    'manager-action-bar',
    'manager-primary-action-group',
    'manager-action-bar-summary',
    'sync-status',
    'manager-cockpit-revision-dock',
  ].forEach(id => sandbox.document._registerElement(id, createElement('div', id)));
  const renderCalls = [];
  setState(sandbox, {
    CATEGORY_DEFS: [{ id: 'beer', title: 'Beer', icon: 'B' }],
    menuState: {
      beer: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
    renderManagerCategories: () => renderCalls.push('manager-categories'),
    renderPricingSection: () => renderCalls.push('pricing'),
    renderDescriptionSection: () => renderCalls.push('description'),
    renderCategoriesTab: () => renderCalls.push('categories-tab'),
    renderDatabaseTab: () => renderCalls.push('database'),
    renderPruneSection: () => renderCalls.push('prune'),
    renderFeaturedTab: () => renderCalls.push('featured'),
    updateManagerToolsContext: () => renderCalls.push('tools-context'),
    updateActiveMenuBar: () => renderCalls.push('active-menu-bar'),
    renderRecentChanges: () => renderCalls.push('recent'),
    renderFooter: () => renderCalls.push('footer'),
    initManagerMobileDrawerTrigger: () => renderCalls.push('mobile-drawer'),
    initDrawerSwipe: () => renderCalls.push('drawer-swipe'),
  });

  getState(sandbox, 'renderManagerWorkspace()');

  assert.deepEqual(renderCalls, [
    'tools-context',
    'active-menu-bar',
    'featured',
    'recent',
    'footer',
    'mobile-drawer',
    'drawer-swipe',
  ]);
});

test('createManagerItemsTableService delegates item name and edit clicks to the edit callback', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/items-table.js',
  ]);
  const calls = [];
  const service = sandbox.__HF_UI_MODULES__.createManagerItemsTableService({
    onEditItem: (categoryId, itemId) => calls.push([categoryId, itemId]),
  });
  const listeners = {};
  const container = {
    dataset: {},
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const row = { dataset: { categoryId: 'cocktails', itemId: 'marg' } };

  service.bindTable(container);
  ['name', 'button'].forEach(() => {
    const editTarget = {
      dataset: { itemAction: 'edit' },
      closest(selector) {
        if (selector === '[data-item-action]') return editTarget;
        if (selector === '[data-category-id][data-item-id]') return row;
        return null;
      },
    };
    listeners.click({ target: editTarget });
  });

  assert.deepEqual(calls, [
    ['cocktails', 'marg'],
    ['cocktails', 'marg'],
  ]);
});

test('createManagerItemEditorModalService opens an accessible item summary modal', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/item-editor-modal.js',
  ]);
  const host = sandbox.document._registerElement(
    'manager-item-editor-modal-root',
    createElement('div', 'manager-item-editor-modal-root'),
  );
  const service = sandbox.__HF_UI_MODULES__.createManagerItemEditorModalService({
    document: sandbox.document,
  });

  assert.equal(service.open({
    categoryId: 'cocktails',
    itemId: 'marg',
    category: { title: 'Cocktails' },
    item: {
      name: 'House Margarita',
      price: '$10',
      eightySixed: true,
      upcharges: [{ label: 'Mezcal', price: '+$2' }],
    },
  }), true);

  assert.match(host.innerHTML, /role="dialog"/);
  assert.match(host.innerHTML, /aria-modal="true"/);
  assert.match(host.innerHTML, /House Margarita/);
  assert.match(host.innerHTML, /Cocktails/);
  assert.match(host.innerHTML, /86&#39;d/);
  assert.match(host.innerHTML, /\$10/);
  assert.match(host.innerHTML, /Mezcal/);
  assert.match(host.innerHTML, /Done/);
  assert.match(host.innerHTML, /Close/);
});

test('openManagerCockpitItemEditor passes the selected item to the modal service', () => {
  const modalCalls = [];
  const toastCalls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createManagerItemEditorModalService: () => ({
        open(payload) {
          modalCalls.push(payload);
          return true;
        },
      }),
    },
  });
  setState(sandbox, {
    CATEGORY_DEFS: [{ id: 'cocktails', title: 'Cocktails' }],
    menuState: {
      cocktails: {
        items: [{ id: 'marg', name: 'House Margarita', price: '$10' }],
      },
    },
    showToast: message => toastCalls.push(message),
  });

  assert.equal(getState(sandbox, 'openManagerCockpitItemEditor("cocktails", "marg")'), true);

  assert.equal(modalCalls.length, 1);
  assert.equal(modalCalls[0].categoryId, 'cocktails');
  assert.equal(modalCalls[0].itemId, 'marg');
  assert.equal(modalCalls[0].item.name, 'House Margarita');
  assert.equal(modalCalls[0].category.title, 'Cocktails');
  assert.deepEqual(toastCalls, []);
});

test('applyManagerItemPatch moves categories and updates draft views without publishing', () => {
  const renderCalls = [];
  const sandbox = loadSandboxWithScripts(['app.js']);
  setState(sandbox, {
    MENU_TYPE: 'drinks',
    CATEGORY_DEFS: [
      { id: 'cocktails', title: 'Cocktails' },
      { id: 'beer', title: 'Beer' },
    ],
    menuState: {
      cocktails: {
        items: [{ id: 'marg', name: 'House Margarita', price: '$10', onMenu: true, visibility: 'public' }],
        lastSent: [],
      },
      beer: { items: [], lastSent: [] },
      __uncategorized__: { items: [], lastSent: [] },
    },
    updateSaveBtn: () => {},
    updateDraftIndicator: () => renderCalls.push('draft'),
    renderManagerItems: catId => renderCalls.push(`items:${catId}`),
    renderPricingSection: () => renderCalls.push('pricing'),
    renderDescriptionSection: () => renderCalls.push('description'),
    markSectionsStale: section => renderCalls.push(`stale:${section}`),
    renderManagerOverviewStats: () => renderCalls.push('overview'),
    renderFeaturedTab: () => renderCalls.push('featured'),
    renderFeaturedPublicSection: () => renderCalls.push('public-featured'),
  });

  const result = getState(sandbox, `applyManagerItemPatch({
    categoryId: 'cocktails',
    itemId: 'marg',
    patch: { categoryId: 'beer', name: 'Skinny Margarita', price: '$11' }
  })`);

  assert.equal(result.ok, true);
  assert.equal(getState(sandbox, 'menuState.cocktails.items.length'), 0);
  assert.equal(getState(sandbox, 'menuState.beer.items[0].name'), 'Skinny Margarita');
  assert.equal(getState(sandbox, 'menuState.beer.items[0].price'), '$11');
  assert.equal(getState(sandbox, '_dirty'), true);
  assert.equal(renderCalls.includes('items:cocktails'), true);
  assert.equal(renderCalls.includes('items:beer'), true);
});

test('applyManagerItemPatch marks price-only modal edits as save-only draft changes', () => {
  const sandbox = loadSandboxWithScripts(['app.js']);
  setState(sandbox, {
    MENU_TYPE: 'drinks',
    CATEGORY_DEFS: [{ id: 'cocktails', title: 'Cocktails' }],
    menuState: {
      cocktails: {
        items: [{ id: 'marg', name: 'House Margarita', price: '$10', onMenu: true, visibility: 'public' }],
        lastSent: [],
      },
      __uncategorized__: { items: [], lastSent: [] },
    },
    updateSaveBtn: () => {},
    updateDraftIndicator: () => {},
    renderManagerItems: () => {},
    renderPricingSection: () => {},
    renderDescriptionSection: () => {},
    markSectionsStale: () => {},
    renderManagerOverviewStats: () => {},
    renderFeaturedTab: () => {},
    renderFeaturedPublicSection: () => {},
  });

  const result = getState(sandbox, `applyManagerItemPatch({
    categoryId: 'cocktails',
    itemId: 'marg',
    patch: { price: '$11' }
  })`);
  const saveOnlyChanges = JSON.parse(getState(sandbox, 'JSON.stringify(getDraftSaveOnlyChanges())'));

  assert.equal(result.ok, true);
  assert.equal(getState(sandbox, 'menuState.cocktails.items[0].price'), '$11');
  assert.equal(saveOnlyChanges.length, 1);
  assert.deepEqual(saveOnlyChanges[0], {
    id: 'price:cocktails:marg',
    key: 'price:cocktails:marg',
    label: 'Updated price for House Margarita',
    message: 'Updated price for House Margarita',
    sectionId: 'cocktails',
    itemId: 'marg',
    kind: 'price',
  });
});

test('removeManagerItemFromMenu marks the item off-menu without deleting it', () => {
  const sandbox = loadSandboxWithScripts(['app.js']);
  setState(sandbox, {
    MENU_TYPE: 'drinks',
    CATEGORY_DEFS: [{ id: 'cocktails', title: 'Cocktails' }],
    menuState: {
      cocktails: {
        items: [{ id: 'marg', name: 'House Margarita', onMenu: true, visibility: 'public' }],
        lastSent: [],
      },
      __uncategorized__: { items: [], lastSent: [] },
    },
    updateSaveBtn: () => {},
    updateDraftIndicator: () => {},
    renderManagerItems: () => {},
    renderPricingSection: () => {},
    renderDescriptionSection: () => {},
    markSectionsStale: () => {},
    renderManagerOverviewStats: () => {},
    renderFeaturedTab: () => {},
    renderFeaturedPublicSection: () => {},
  });

  const result = getState(sandbox, "removeManagerItemFromMenu({ categoryId: 'cocktails', itemId: 'marg' })");

  assert.equal(result.ok, true);
  assert.equal(getState(sandbox, 'menuState.cocktails.items[0].onMenu'), false);
  assert.equal(getState(sandbox, 'menuState.cocktails.items[0].visibility'), 'off_menu');
  assert.deepEqual(JSON.parse(getState(sandbox, 'JSON.stringify(Array.from(_deletedItemIds))')), []);
});
