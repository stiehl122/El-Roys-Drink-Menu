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

  function recipeArray(recipe) {
    if (Array.isArray(recipe)) return recipe.map(entry => String(entry || '').trim()).filter(Boolean);
    if (typeof recipe === 'string' && recipe.trim()) {
      return recipe.split(/\r?\n|,/).map(entry => entry.trim()).filter(Boolean);
    }
    return [];
  }

  function upchargeArray(upcharges) {
    if (Array.isArray(upcharges)) {
      return upcharges
        .map(entry => ({
          label: String(entry?.label || entry?.name || '').trim(),
          price: String(entry?.price || entry?.amount || '').trim(),
        }))
        .filter(entry => entry.label || entry.price);
    }
    if (typeof upcharges !== 'string') return [];
    return upcharges
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.includes('|') ? line.split('|') : line.split(/\s{2,}/);
        if (parts.length > 1) {
          return { label: parts[0].trim(), price: parts.slice(1).join(' ').trim() };
        }
        return { label: line, price: '' };
      })
      .filter(entry => entry.label || entry.price);
  }

  function cloneDraft(item = {}, categoryId = '') {
    return {
      categoryId,
      name: String(item.name || '').trim(),
      desc: String(item.desc ?? item.description ?? '').trim(),
      price: String(item.price ?? item.base_price ?? '').trim(),
      recipe: recipeArray(item.recipe),
      upcharges: upchargeArray(item.upcharges),
      eightySixed: !!(item.eightySixed || item.is_eighty_sixed),
      showDescription: item.showDescription ?? item.show_description ?? true,
      showRecipe: !!(item.showRecipe ?? item.show_recipe ?? false),
    };
  }

  function normalizeDraftForPatch(draft = {}, isFood = false) {
    const normalized = {
      categoryId: String(draft.categoryId || '').trim(),
      name: String(draft.name || '').trim(),
      desc: String(draft.desc || '').trim(),
      price: String(draft.price || '').trim(),
      upcharges: upchargeArray(draft.upcharges),
      eightySixed: !!draft.eightySixed,
      showDescription: draft.showDescription !== false,
    };
    if (!isFood) {
      normalized.recipe = recipeArray(draft.recipe);
      normalized.showRecipe = !!draft.showRecipe;
    }
    return normalized;
  }

  function valuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function renderUpchargeTextareaValue(upcharges = []) {
    return upchargeArray(upcharges)
      .map(entry => `${entry.label}${entry.price ? ` | ${entry.price}` : ''}`)
      .join('\n');
  }

  function createManagerItemEditorModalServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    const windowRef = deps.window || globalScope.window || globalScope;
    const getItem = typeof deps.getItem === 'function' ? deps.getItem : (() => null);
    const getCategories = typeof deps.getCategories === 'function' ? deps.getCategories : (() => []);
    const applyItemPatch = typeof deps.applyItemPatch === 'function'
      ? deps.applyItemPatch
      : (() => ({ ok: false, error: 'Item editor is unavailable.' }));
    const removeFromMenu = typeof deps.removeFromMenu === 'function'
      ? deps.removeFromMenu
      : (() => ({ ok: false, error: 'Remove action is unavailable.' }));
    let currentHost = null;
    let previousFocus = null;
    let state = {
      isOpen: false,
      categoryId: '',
      itemId: '',
      category: {},
      original: null,
      draft: null,
      error: '',
    };

    function resolveMenuType() {
      return String(typeof deps.menuType === 'function' ? deps.menuType() : deps.menuType || '').toLowerCase();
    }

    function isFoodMenu() {
      return resolveMenuType() === 'food';
    }

    function resolveHost() {
      if (!documentRef?.getElementById) return null;
      return documentRef.getElementById('manager-item-editor-modal-root') ||
        documentRef.getElementById('manager-edit-item-modal-host');
    }

    function getLatestItem() {
      return getItem(state.categoryId, state.itemId) || null;
    }

    function close() {
      if (!currentHost) return false;
      currentHost.innerHTML = '';
      currentHost = null;
      state = {
        isOpen: false,
        categoryId: '',
        itemId: '',
        category: {},
        original: null,
        draft: null,
        error: '',
      };
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      previousFocus = null;
      return true;
    }

    function handleFieldEvent(target) {
      const field = target?.dataset?.managerItemEditorField;
      if (!field) return false;
      const value = target.type === 'checkbox' ? !!target.checked : target.value;
      return updateField(field, value);
    }

    function handleAction(action) {
      if (action === 'apply') return apply();
      if (action === 'remove') return remove();
      return null;
    }

    function bindHost(host) {
      if (!host || host.dataset.managerItemEditorBound === 'true') return;
      host.dataset.managerItemEditorBound = 'true';
      host.addEventListener('click', event => {
        const actionTarget = event.target?.closest?.('[data-manager-item-editor-action]');
        if (actionTarget) {
          event.preventDefault?.();
          handleAction(actionTarget.dataset.managerItemEditorAction);
          return;
        }
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
      host.addEventListener('input', event => {
        handleFieldEvent(event.target);
      });
      host.addEventListener('change', event => {
        handleFieldEvent(event.target);
      });
    }

    function renderHtml() {
      if (!state.isOpen || !state.draft) return '';
      const draft = state.draft;
      const item = getLatestItem() || state.original || {};
      const itemName = draft.name || item.name || 'Untitled Item';
      const categories = getCategories();
      const categoryOptions = categories.length ? categories : [
        state.category || { id: state.categoryId, title: state.categoryId || 'Current category' },
      ];
      const selectedCategory = categoryOptions.find(cat => cat.id === draft.categoryId) || state.category || {};
      const categoryLabel = selectedCategory.title || selectedCategory.label || draft.categoryId || 'Current category';
      const status = normalizeStatus({
        ...item,
        ...draft,
        onMenu: item.onMenu,
        visibility: item.visibility,
      });
      const recipeHtml = isFoodMenu()
        ? ''
        : `
              <label class="manager-item-editor-field manager-item-editor-field--full">
                <span>Recipe</span>
                <textarea rows="4" data-manager-item-editor-field="recipe" placeholder="One ingredient per line">${escHtml(recipeArray(draft.recipe).join('\n'))}</textarea>
              </label>
              <label class="manager-item-editor-check">
                <input type="checkbox" data-manager-item-editor-field="showRecipe"${draft.showRecipe ? ' checked' : ''}/>
                <span>Show recipe on menu</span>
              </label>`;
      const errorHtml = state.error
        ? `<div class="manager-item-editor-error" role="alert">${escHtml(state.error)}</div>`
        : '';

      return `
        <div class="modal-bg open manager-item-editor-backdrop" data-manager-item-editor-backdrop>
          <section
            class="modal manager-item-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-item-editor-title"
            aria-describedby="manager-item-editor-summary"
            tabindex="-1"
            data-category-id="${escHtml(state.categoryId)}"
            data-item-id="${escHtml(state.itemId)}"
          >
            <button class="modal-close manager-item-editor-close" type="button" data-manager-item-editor-close aria-label="Close item editor">Close</button>
            <div class="manager-item-editor-head">
              <span class="manager-cockpit-kicker">Item Editor</span>
              <h2 id="manager-item-editor-title">${escHtml(itemName)}</h2>
              <p id="manager-item-editor-summary">${escHtml(categoryLabel)} - ${escHtml(status)}</p>
            </div>
            ${errorHtml}
            <div class="manager-item-editor-form">
              <label class="manager-item-editor-field manager-item-editor-field--full">
                <span>Name</span>
                <input type="text" value="${escHtml(draft.name)}" data-manager-item-editor-field="name" autocomplete="off"/>
              </label>
              <label class="manager-item-editor-field">
                <span>Category</span>
                <select data-manager-item-editor-field="categoryId">
                  ${categoryOptions.map(cat => `
                    <option value="${escHtml(cat.id)}"${cat.id === draft.categoryId ? ' selected' : ''}>${escHtml(cat.title || cat.label || cat.id)}</option>
                  `).join('')}
                </select>
              </label>
              <label class="manager-item-editor-field">
                <span>Price</span>
                <input type="text" value="${escHtml(draft.price)}" data-manager-item-editor-field="price" placeholder="$0.00"/>
              </label>
              <label class="manager-item-editor-field manager-item-editor-field--full">
                <span>Description</span>
                <textarea rows="4" data-manager-item-editor-field="desc" placeholder="Describe this item for customers">${escHtml(draft.desc)}</textarea>
              </label>
              <label class="manager-item-editor-check">
                <input type="checkbox" data-manager-item-editor-field="showDescription"${draft.showDescription !== false ? ' checked' : ''}/>
                <span>Show description on menu</span>
              </label>
              <label class="manager-item-editor-check">
                <input type="checkbox" data-manager-item-editor-field="eightySixed"${draft.eightySixed ? ' checked' : ''}/>
                <span>86 this item</span>
              </label>
              <label class="manager-item-editor-field manager-item-editor-field--full">
                <span>Upcharges</span>
                <textarea rows="4" data-manager-item-editor-field="upcharges" placeholder="Label | +$0.00">${escHtml(renderUpchargeTextareaValue(draft.upcharges))}</textarea>
              </label>
              ${recipeHtml}
            </div>
            <section class="manager-item-editor-danger" aria-labelledby="manager-item-editor-danger-title">
              <div>
                <h3 id="manager-item-editor-danger-title">Danger Area</h3>
                <p>Remove this item from the active menu without deleting it from the database.</p>
              </div>
              <button class="btn-cancel manager-item-editor-remove" type="button" data-manager-item-editor-action="remove">Remove from menu</button>
            </section>
            <div class="modal-actions manager-item-editor-actions">
              <button class="btn-cancel" type="button" data-manager-item-editor-close>Cancel</button>
              <button class="btn-confirm" type="button" data-manager-item-editor-action="apply">Done</button>
            </div>
          </section>
        </div>`;
    }

    function render() {
      if (!currentHost) return false;
      currentHost.innerHTML = renderHtml();
      return true;
    }

    function open({ categoryId = '', itemId = '', item = {}, category = {} } = {}) {
      const host = resolveHost();
      if (!host || !item) return false;

      previousFocus = documentRef.activeElement || null;
      currentHost = host;
      const sourceItem = getItem(categoryId, itemId) || item;
      state = {
        isOpen: true,
        categoryId,
        itemId,
        category,
        original: cloneDraft(sourceItem, categoryId),
        draft: cloneDraft(sourceItem, categoryId),
        error: '',
      };
      bindHost(host);
      render();

      const dialog = host.querySelector?.('[role="dialog"]');
      if (dialog && typeof dialog.focus === 'function') {
        dialog.focus();
      }
      return true;
    }

    function updateField(field, value) {
      if (!state.isOpen || !state.draft) return false;
      state.error = '';
      if (field === 'recipe') {
        state.draft.recipe = recipeArray(value);
      } else if (field === 'upcharges') {
        state.draft.upcharges = upchargeArray(value);
      } else if (field === 'eightySixed' || field === 'showDescription' || field === 'showRecipe') {
        state.draft[field] = !!value;
      } else if (field === 'categoryId' || field === 'name' || field === 'price' || field === 'desc') {
        state.draft[field] = String(value ?? '');
      } else {
        return false;
      }
      return true;
    }

    function buildPatch() {
      const isFood = isFoodMenu();
      const original = normalizeDraftForPatch(state.original, isFood);
      const draft = normalizeDraftForPatch(state.draft, isFood);
      return Object.keys(draft).reduce((patch, field) => {
        if (!valuesEqual(draft[field], original[field])) {
          patch[field] = draft[field];
        }
        return patch;
      }, {});
    }

    function apply() {
      if (!state.isOpen || !state.draft) return { ok: false, error: 'Item editor is closed.' };
      const normalizedName = String(state.draft.name || '').trim();
      if (!normalizedName) {
        state.error = 'Item name is required.';
        render();
        return { ok: false, error: 'Item name is required.' };
      }
      const patch = buildPatch();
      if (!Object.keys(patch).length) {
        close();
        return { ok: true };
      }
      const result = applyItemPatch({ categoryId: state.categoryId, itemId: state.itemId, patch });
      if (result?.ok === false) {
        state.error = result.error || 'Unable to update item.';
        render();
        return { ok: false, error: state.error };
      }
      close();
      return { ok: true };
    }

    function remove() {
      if (!state.isOpen || !state.itemId) return { ok: false, reason: 'closed' };
      const confirmed = typeof windowRef?.confirm === 'function'
        ? windowRef.confirm('Remove this item from the active menu?')
        : true;
      if (!confirmed) return { ok: false, reason: 'cancelled' };
      const result = removeFromMenu({ categoryId: state.categoryId, itemId: state.itemId });
      if (result?.ok === false) {
        state.error = result.error || 'Unable to remove item from menu.';
        render();
        return { ok: false, error: state.error };
      }
      close();
      return { ok: true };
    }

    return {
      open,
      close,
      updateField,
      apply,
      remove,
      renderHtml,
    };
  }

  modules.createManagerItemEditorModalService = function createManagerItemEditorModalServiceBoundary(deps = {}) {
    return createManagerItemEditorModalServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
