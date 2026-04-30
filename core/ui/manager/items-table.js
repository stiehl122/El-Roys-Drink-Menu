(function bootstrapManagerItemsTableUi(globalScope) {
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

  function normalizeItem(item = {}) {
    return {
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      eightySixed: !!(item.eightySixed ?? item.is_eighty_sixed),
      onMenu: item.onMenu !== false && item.on_menu !== false,
      visibility: String(item.visibility ?? ''),
      featuredEnabled: item.featuredEnabled === true || item.featured_enabled === true,
    };
  }

  function buildStatus(item) {
    if (item.eightySixed) {
      return {
        className: 'manager-cockpit-status-pill manager-cockpit-status-pill--86',
        label: "86'd",
      };
    }
    if (item.onMenu === false || item.visibility === 'off_menu') {
      return {
        className: 'manager-cockpit-status-pill manager-cockpit-status-pill--off',
        label: 'Off Menu',
      };
    }
    return {
      className: 'manager-cockpit-status-pill manager-cockpit-status-pill--on',
      label: 'On Menu',
    };
  }

  function createManagerItemsTableServiceImpl(deps = {}) {
    const onEditItem = typeof deps.onEditItem === 'function' ? deps.onEditItem : (() => {});
    const onToggle86 = typeof deps.onToggle86 === 'function' ? deps.onToggle86 : (() => {});
    const onToggleFeatured = typeof deps.onToggleFeatured === 'function' ? deps.onToggleFeatured : (() => {});
    const onDragStart = typeof deps.onDragStart === 'function' ? deps.onDragStart : (() => {});
    const onDragOver = typeof deps.onDragOver === 'function' ? deps.onDragOver : (() => {});
    const onDrop = typeof deps.onDrop === 'function' ? deps.onDrop : (() => {});
    const onDragEnd = typeof deps.onDragEnd === 'function' ? deps.onDragEnd : (() => {});

    function buildTableState({ categories = [], menuState = {} } = {}) {
      return categories.map(category => {
        const categoryItems = menuState[category.id]?.items;
        return {
          id: String(category.id ?? ''),
          title: String(category.title ?? category.label ?? ''),
          icon: String(category.icon ?? ''),
          isFeaturedSpecials: category.isFeaturedSpecials === true || String(category.id ?? '') === 'featured_specials',
          items: (Array.isArray(categoryItems) ? categoryItems : []).map(normalizeItem),
        };
      });
    }

    function renderStatusCell(category, item, status, itemLabel) {
      if (!category.isFeaturedSpecials) {
        return `<span class="${status.className}">${escHtml(status.label)}</span>`;
      }
      return `
        <label class="manager-cockpit-featured-toggle">
          <input
            type="checkbox"
            data-item-action="toggle-featured"
            ${item.featuredEnabled ? 'checked' : ''}
            aria-label="Show ${escHtml(itemLabel)} in Featured Preview"
          >
          <span>Show in Featured Preview</span>
        </label>
        <span class="${status.className}">${escHtml(status.label)}</span>`;
    }

    function renderItemRow(category, item, itemIndex) {
      const status = buildStatus(item);
      const itemLabel = item.name || 'Untitled Item';
      const toggleLabel = item.eightySixed ? 'Undo' : '86';
      const rowClass = [
        'manager-cockpit-item-row',
        'item-wrapper',
        item.eightySixed ? 'is-eighty-sixed' : '',
        item.onMenu === false || item.visibility === 'off_menu' ? 'is-off-menu' : '',
      ].filter(Boolean).join(' ');

      return `
        <div class="${rowClass}" id="wrapper-${escHtml(item.id)}" role="row" data-category-id="${escHtml(category.id)}" data-item-id="${escHtml(item.id)}">
          <div class="manager-cockpit-item-cell manager-cockpit-item-cell--order" role="cell" data-label="Order">
            <button class="manager-cockpit-row-btn manager-cockpit-drag-btn" type="button" draggable="true" data-item-drag="true" aria-label="Drag to reorder ${escHtml(itemLabel)}">::</button>
            <span class="manager-cockpit-order-index">${escHtml(itemIndex + 1)}</span>
          </div>
          <div class="manager-cockpit-item-cell manager-cockpit-item-cell--name" role="cell" data-label="Item Name">
            <button class="manager-cockpit-item-name" type="button" data-item-action="edit">${escHtml(itemLabel)}</button>
          </div>
          <div class="manager-cockpit-item-cell manager-cockpit-item-cell--status" role="cell" data-label="Status">
            ${renderStatusCell(category, item, status, itemLabel)}
          </div>
          <div class="manager-cockpit-item-cell manager-cockpit-item-cell--edit" role="cell" data-label="Edit">
            <button class="manager-cockpit-row-btn" type="button" data-item-action="edit" aria-label="Edit ${escHtml(itemLabel)}">Edit</button>
          </div>
          <div class="manager-cockpit-item-cell manager-cockpit-item-cell--86" role="cell" data-label="86">
            <button class="manager-cockpit-row-btn manager-cockpit-row-btn--86" type="button" data-item-action="toggle-86" aria-label="${item.eightySixed ? `Restore ${escHtml(itemLabel)}` : `Mark ${escHtml(itemLabel)} 86'd`}">${escHtml(toggleLabel)}</button>
          </div>
        </div>`;
    }

    function renderTableHtml(tableState = []) {
      const categories = Array.isArray(tableState) ? tableState : [];
      if (!categories.length) {
        return '<p class="db-empty">No menu categories are ready yet.</p>';
      }

      return categories.map(category => {
        const featuredCount = category.isFeaturedSpecials
          ? category.items.filter(item => item.featuredEnabled && item.onMenu !== false && item.visibility !== 'off_menu').length
          : 0;
        const categoryMeta = category.isFeaturedSpecials
          ? `<span class="manager-cockpit-item-group-meta">${escHtml(featuredCount)} / 5 previewed</span>`
          : '';
        const rows = category.items.length
          ? category.items.map((item, index) => renderItemRow(category, item, index)).join('')
          : '<div class="manager-cockpit-item-empty" role="row"><span role="cell">No items in this category.</span></div>';
        return `
          <section class="manager-cockpit-item-group" data-category-id="${escHtml(category.id)}">
            <header class="manager-cockpit-item-group-head">
              <span class="manager-cockpit-kicker">${escHtml(category.icon || 'Items')}</span>
              <h2>${escHtml(category.title || 'Menu Items')}</h2>
              ${categoryMeta}
            </header>
            <div class="manager-cockpit-item-table" role="table" aria-label="${escHtml(category.title || 'Menu')} items">
              <div class="manager-cockpit-item-head" role="row">
                <span role="columnheader">Order</span>
                <span role="columnheader">Item Name</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Edit</span>
                <span role="columnheader">86</span>
              </div>
              ${rows}
            </div>
          </section>`;
      }).join('');
    }

    function resolveRow(target) {
      return target?.closest?.('[data-category-id][data-item-id]') || null;
    }

    function bindTable(container) {
      if (!container || container.dataset.managerItemsTableBound === 'true') return false;
      container.dataset.managerItemsTableBound = 'true';
      container.addEventListener('click', event => {
        const actionEl = event.target?.closest?.('[data-item-action]');
        if (!actionEl) return;
        const row = resolveRow(actionEl);
        if (!row) return;
        const categoryId = row.dataset.categoryId || '';
        const itemId = row.dataset.itemId || '';
        if (actionEl.dataset.itemAction === 'edit') {
          onEditItem(categoryId, itemId, event);
          return;
        }
        if (actionEl.dataset.itemAction === 'toggle-86') {
          onToggle86(categoryId, itemId, event);
          return;
        }
        if (actionEl.dataset.itemAction === 'toggle-featured') {
          onToggleFeatured(categoryId, itemId, actionEl.checked === true, event);
        }
      });
      container.addEventListener('dragstart', event => {
        const handle = event.target?.closest?.('[data-item-drag]');
        if (!handle) return;
        const row = resolveRow(handle);
        if (!row) return;
        onDragStart(event, row.dataset.categoryId || '', row.dataset.itemId || '');
      });
      container.addEventListener('dragover', event => {
        const row = resolveRow(event.target);
        if (!row) return;
        onDragOver(event, row.dataset.categoryId || '', row.dataset.itemId || '');
      });
      container.addEventListener('drop', event => {
        const row = resolveRow(event.target);
        if (!row) return;
        onDrop(event, row.dataset.categoryId || '', row.dataset.itemId || '');
      });
      container.addEventListener('dragend', event => {
        onDragEnd(event);
      });
      return true;
    }

    return {
      buildTableState,
      renderTableHtml,
      bindTable,
    };
  }

  modules.createManagerItemsTableService = function createManagerItemsTableServiceBoundary(deps = {}) {
    return createManagerItemsTableServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
