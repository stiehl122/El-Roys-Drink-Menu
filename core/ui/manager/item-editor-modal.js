(function bootstrapManagerItemEditorModalUi(globalScope) {
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

  function normalizeStatus(item = {}) {
    if (item.eightySixed || item.is_eighty_sixed) return "86'd";
    if (item.onMenu === false || item.on_menu === false || item.visibility === 'off_menu') return 'Off Menu';
    return 'On Menu';
  }

  function formatPrice(item = {}) {
    const price = String(item.price ?? item.base_price ?? '').trim();
    return price || 'No price set';
  }

  function renderModifierList(item = {}) {
    const upcharges = Array.isArray(item.upcharges) ? item.upcharges : [];
    if (!upcharges.length) {
      return '<p class="manager-item-editor-empty">No modifiers saved for this item.</p>';
    }
    return `<ul class="manager-item-editor-list">
      ${upcharges.map(modifier => `
        <li>
          <span>${escHtml(modifier.label || modifier.name || 'Modifier')}</span>
          <strong>${escHtml(modifier.price || modifier.amount || '')}</strong>
        </li>`).join('')}
    </ul>`;
  }

  function createManagerItemEditorModalServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    let currentHost = null;
    let previousFocus = null;

    function resolveHost() {
      if (!documentRef?.getElementById) return null;
      return documentRef.getElementById('manager-item-editor-modal-root') ||
        documentRef.getElementById('manager-edit-item-modal-host');
    }

    function close() {
      if (!currentHost) return false;
      currentHost.innerHTML = '';
      currentHost = null;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      previousFocus = null;
      return true;
    }

    function bindHost(host) {
      if (!host || host.dataset.managerItemEditorBound === 'true') return;
      host.dataset.managerItemEditorBound = 'true';
      host.addEventListener('click', event => {
        const closeTarget = event.target?.closest?.('[data-manager-item-editor-close]');
        const backdrop = event.target?.closest?.('[data-manager-item-editor-backdrop]');
        if (closeTarget || event.target === backdrop) {
          event.preventDefault?.();
          close();
        }
      });
      host.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault?.();
          close();
        }
      });
    }

    function open({ categoryId = '', itemId = '', item = {}, category = {} } = {}) {
      const host = resolveHost();
      if (!host || !item) return false;

      const itemName = item.name || 'Untitled Item';
      const categoryLabel = category.title || category.label || categoryId || 'Current category';
      const status = normalizeStatus(item);
      const description = String(item.desc || item.description || '').trim();
      previousFocus = documentRef.activeElement || null;
      currentHost = host;
      bindHost(host);
      host.innerHTML = `
        <div class="modal-bg open manager-item-editor-backdrop" data-manager-item-editor-backdrop>
          <section
            class="modal manager-item-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-item-editor-title"
            aria-describedby="manager-item-editor-summary"
            tabindex="-1"
            data-category-id="${escHtml(categoryId)}"
            data-item-id="${escHtml(itemId)}"
          >
            <button class="modal-close manager-item-editor-close" type="button" data-manager-item-editor-close aria-label="Close item editor">Close</button>
            <div class="manager-item-editor-head">
              <span class="manager-cockpit-kicker">Item Editor</span>
              <h2 id="manager-item-editor-title">${escHtml(itemName)}</h2>
              <p id="manager-item-editor-summary">${escHtml(categoryLabel)} - ${escHtml(status)}</p>
            </div>
            <div class="manager-item-editor-grid">
              <article>
                <span>Category</span>
                <strong>${escHtml(categoryLabel)}</strong>
              </article>
              <article>
                <span>Status</span>
                <strong>${escHtml(status)}</strong>
              </article>
              <article>
                <span>Current Price</span>
                <strong>${escHtml(formatPrice(item))}</strong>
              </article>
              <article>
                <span>Item ID</span>
                <strong>${escHtml(itemId || item.id || 'Unsaved')}</strong>
              </article>
            </div>
            <section class="manager-item-editor-section" aria-labelledby="manager-item-editor-modifiers-title">
              <h3 id="manager-item-editor-modifiers-title">Modifiers</h3>
              ${renderModifierList(item)}
            </section>
            <section class="manager-item-editor-section" aria-labelledby="manager-item-editor-description-title">
              <h3 id="manager-item-editor-description-title">Description</h3>
              <p>${description ? escHtml(description) : 'No description saved for this item.'}</p>
            </section>
            <div class="modal-actions manager-item-editor-actions">
              <button class="btn-confirm" type="button" data-manager-item-editor-close>Done</button>
            </div>
          </section>
        </div>`;

      const dialog = host.querySelector?.('[role="dialog"]');
      if (dialog && typeof dialog.focus === 'function') {
        dialog.focus();
      }
      return true;
    }

    return {
      open,
      close,
    };
  }

  modules.createManagerItemEditorModalService = function createManagerItemEditorModalServiceBoundary(deps = {}) {
    return createManagerItemEditorModalServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
