(function bootstrapManagerCockpitUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createManagerCockpitServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    const getActiveMenuName = typeof deps.getActiveMenuName === 'function' ? deps.getActiveMenuName : (() => 'Current Menu');
    const getLastUpdatedLabel = typeof deps.getLastUpdatedLabel === 'function' ? deps.getLastUpdatedLabel : (() => 'Last Updated: -');
    const getStats = typeof deps.getStats === 'function'
      ? deps.getStats
      : (() => ({ status: 'Live', statusMeta: 'Live menu is current', activeItems: 0, eightySixed: 0 }));
    const getManagerNote = typeof deps.getManagerNote === 'function' ? deps.getManagerNote : (() => ({ note: '', updated_at: '' }));
    const getActivityEntries = typeof deps.getActivityEntries === 'function' ? deps.getActivityEntries : (() => []);

    function readStats() {
      const stats = getStats() || {};
      return {
        status: stats.status || 'Live',
        statusMeta: stats.statusMeta || 'Live menu is current',
        activeItems: Number.isFinite(Number(stats.activeItems)) ? Number(stats.activeItems) : 0,
        eightySixed: Number.isFinite(Number(stats.eightySixed)) ? Number(stats.eightySixed) : 0,
      };
    }

    function renderRailMeta(container, stats) {
      if (!container) return;
      container.innerHTML = `
        <div class="manager-cockpit-rail-card">
          <span class="manager-cockpit-kicker">Current Menu</span>
          <strong>${escHtml(getActiveMenuName() || 'Select a menu')}</strong>
          <small>${escHtml(getLastUpdatedLabel() || 'Last Updated: -')}</small>
        </div>
        <div class="manager-cockpit-status-strip" aria-label="Menu status">
          <span><strong>${escHtml(stats.status)}</strong>${escHtml(stats.statusMeta)}</span>
        </div>`;
    }

    function renderNav(container) {
      if (!container) return;
      container.innerHTML = `
        <a class="manager-cockpit-nav-link is-active" href="#manager-cockpit-header">Overview</a>
        <a class="manager-cockpit-nav-link" href="#manager-cockpit-items">Edit Items</a>
        <a class="manager-cockpit-nav-link" href="#featured-mgr-wrap">Featured</a>
        <a class="manager-cockpit-nav-link" href="#recent-changes-wrap">Activity</a>
        <a class="manager-cockpit-nav-link" href="#manager-cockpit-database">Database</a>`;
    }

    function renderHeader(container, stats) {
      container.innerHTML = `
        <div class="manager-cockpit-header-copy">
          <span class="manager-cockpit-kicker">Manager Workspace</span>
          <h1>${escHtml(getActiveMenuName() || 'Current Menu')}</h1>
          <p>${escHtml(getLastUpdatedLabel() || 'Last Updated: -')}</p>
        </div>
        <div class="manager-cockpit-header-stats" aria-label="Menu snapshot">
          <div class="manager-cockpit-stat">
            <span>Status</span>
            <strong>${escHtml(stats.status)}</strong>
            <small>${escHtml(stats.statusMeta)}</small>
          </div>
          <div class="manager-cockpit-stat">
            <span>Active</span>
            <strong>${escHtml(stats.activeItems)}</strong>
            <small>${stats.activeItems === 1 ? 'active item' : 'active items'}</small>
          </div>
          <div class="manager-cockpit-stat">
            <span>86</span>
            <strong>${escHtml(stats.eightySixed)}</strong>
            <small>${stats.eightySixed === 1 ? "item 86'd" : "items 86'd"}</small>
          </div>
        </div>`;
    }

    function renderWorkbar(container) {
      container.innerHTML = `
        <button class="manager-cockpit-tool manager-cockpit-tool--primary" type="button" id="manager-add-item-btn" onclick="openAddItemModal({ mode: 'manual' })">
          <span class="manager-cockpit-tool-icon">＋</span>
          <span><strong>Add Item</strong><small>Quick add or scan</small></span>
        </button>
        <button class="manager-cockpit-tool" type="button" id="manager-bulk-actions-btn">
          <span class="manager-cockpit-tool-icon">☷</span>
          <span><strong>Bulk Actions</strong><small>86, move, copy</small></span>
        </button>
        <label class="manager-cockpit-tool manager-cockpit-tool--field" for="manager-item-search">
          <span class="manager-cockpit-tool-icon">⌕</span>
          <input id="manager-item-search" type="search" placeholder="Search..." autocomplete="off">
        </label>
        <label class="manager-cockpit-tool manager-cockpit-tool--field" for="manager-category-filter">
          <span class="manager-cockpit-tool-icon">▽</span>
          <select id="manager-category-filter"><option value="all">No Filter</option></select>
        </label>`;
    }

    function renderItemsHost(container) {
      if (!container || (container.innerHTML || '').trim()) return;
      container.innerHTML = '<p class="db-empty">Menu items will appear here after the menu loads.</p>';
    }

    function renderSide(container) {
      const note = getManagerNote() || {};
      const noteText = String(note.note ?? '');
      const noteMeta = note.updated_at ? `Updated ${new Date(note.updated_at).toLocaleString()}` : 'No note saved yet';
      const activityEntries = Array.isArray(getActivityEntries()) ? getActivityEntries() : [];
      const activityHtml = activityEntries.length
        ? activityEntries.map(entry => `
          <article class="manager-cockpit-activity-row">
            <strong>${escHtml(entry.label || 'Activity')}</strong>
            <span>${escHtml([entry.actor, entry.time].filter(Boolean).join(' • '))}</span>
            ${entry.channel ? `<small>${escHtml(entry.channel)}</small>` : ''}
          </article>`).join('')
        : '<p class="db-empty">Recent activity will appear after staff updates.</p>';

      container.innerHTML = `
        <section class="manager-cockpit-side-panel" aria-labelledby="manager-cockpit-featured-title">
          <div class="manager-cockpit-side-panel-head">
            <span class="manager-cockpit-kicker">Featured Preview</span>
            <h2 id="manager-cockpit-featured-title">Featured Preview</h2>
          </div>
          <div id="featured-mgr-wrap"></div>
        </section>
        <section class="manager-cockpit-side-panel" aria-labelledby="manager-cockpit-activity-title">
          <div class="manager-cockpit-side-panel-head">
            <span class="manager-cockpit-kicker">Recent Activity</span>
            <h2 id="manager-cockpit-activity-title">Recent Activity</h2>
          </div>
          <div id="recent-changes-wrap">${activityHtml}</div>
        </section>
        <section class="manager-cockpit-side-panel" aria-labelledby="manager-cockpit-notes-title">
          <div class="manager-cockpit-side-panel-head">
            <span class="manager-cockpit-kicker">Staff Notes</span>
            <h2 id="manager-cockpit-notes-title">Quick Notes</h2>
            <small>${escHtml(noteMeta)}</small>
          </div>
          <textarea id="manager-quick-note" rows="5" placeholder="Prep notes, counts, handoff details...">${escHtml(noteText)}</textarea>
        </section>
        <section class="manager-cockpit-side-panel" aria-labelledby="manager-cockpit-snapshot-title">
          <div class="manager-cockpit-side-panel-head">
            <span class="manager-cockpit-kicker">Menu Snapshot</span>
            <h2 id="manager-cockpit-snapshot-title">Menu Snapshot</h2>
          </div>
          <p>${escHtml(getActiveMenuName() || 'Current Menu')}</p>
        </section>`;
    }

    function renderDatabase(container) {
      if (!container) return;
      const searchHost = documentRef.getElementById('db-search');
      const tableHost = documentRef.getElementById('db-table-wrap');
      container.innerHTML = `
        <span class="manager-cockpit-kicker">Database</span>
        <h2>Audit/search lives below the editing cockpit.</h2>
        <p class="workspace-actions-sub">Use this area for database review and search. The editable item table stays in the cockpit body.</p>`;
      if (searchHost && typeof container.appendChild === 'function') {
        searchHost.hidden = true;
        container.appendChild(searchHost);
      } else {
        container.innerHTML += '<input type="search" id="db-search" hidden>';
      }
      if (tableHost && typeof container.appendChild === 'function') {
        tableHost.hidden = true;
        container.appendChild(tableHost);
      } else {
        container.innerHTML += '<div id="db-table-wrap" hidden></div>';
      }
    }

    return {
      renderCockpit() {
        const header = documentRef?.getElementById?.('manager-cockpit-header');
        const workbar = documentRef?.getElementById?.('manager-cockpit-workbar');
        const side = documentRef?.getElementById?.('manager-cockpit-side');
        if (!header || !workbar || !side) return false;

        const stats = readStats();
        renderRailMeta(documentRef.getElementById('manager-cockpit-rail-meta'), stats);
        renderNav(documentRef.getElementById('manager-cockpit-nav'));
        renderHeader(header, stats);
        renderWorkbar(workbar);
        renderItemsHost(documentRef.getElementById('manager-cockpit-items'));
        renderSide(side);
        renderDatabase(documentRef.getElementById('manager-cockpit-database'));
        return true;
      },
    };
  }

  modules.createManagerCockpitService = function createManagerCockpitServiceBoundary(deps = {}) {
    return createManagerCockpitServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
