(function bootstrapPublicRouteCore(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_ROUTE_MODULES__ && typeof globalScope.__HF_ROUTE_MODULES__ === 'object')
    ? globalScope.__HF_ROUTE_MODULES__
    : {};

  function fallbackEsc(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function createPublicRouteCore(adapter = {}) {
    const windowRef = adapter.window || globalScope.window || globalScope;
    const documentRef = adapter.document || windowRef.document || globalScope.document;
    if (!windowRef || !documentRef) return null;

    const esc = typeof adapter.esc === 'function' ? adapter.esc : fallbackEsc;
    const mobileBreakpointPx = Number(adapter.mobileBreakpointPx) || 820;
    const containerId = adapter.containerId || 'restaurant-site-wrapper';
    const templateId = adapter.templateId || '';
    const pageSelector = adapter.pageSelector || '.route-page';
    const mainId = adapter.mainId || '';
    const sectionsId = adapter.sectionsId || '';
    const statusTimestampId = adapter.statusTimestampId || '';
    const footerTimestampId = adapter.footerTimestampId || '';
    const footerVersionId = adapter.footerVersionId || '';
    const specialsId = adapter.specialsId || '';
    const menuNameId = adapter.menuNameId || '';
    const menuNameFallback = adapter.menuNameFallback || '';
    const settingsDropdownId = adapter.settingsDropdownId || '';
    const settingsWrapperSelector = adapter.settingsWrapperSelector || '[data-route-settings]';
    const userChipSelector = adapter.userChipSelector || '[data-route-user-chip]';
    const emptyCategoriesHtml = adapter.emptyCategoriesHtml || '<p>Nothing on the menu yet.</p>';
    const loadingSpecialsHtml = adapter.loadingSpecialsHtml || '<p>Loading specials…</p>';

    let teardownMobileHeader = null;

    function getMenusForRoute(sharedState) {
      const restaurantId = sharedState.siteRestaurant?.id || sharedState.restaurantId || '';
      return (sharedState.knownMenus || [])
        .filter(menu => menu.restaurantId === restaurantId)
        .sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          if (a.type === 'food') return -1;
          if (b.type === 'food') return 1;
          return a.type.localeCompare(b.type);
        });
    }

    function buildMenuSwitchPlaceholder(sharedState) {
      if (typeof adapter.buildMenuSwitchPlaceholder === 'function') {
        return adapter.buildMenuSwitchPlaceholder(sharedState);
      }
      return '<section aria-hidden="true"><p>Loading menu…</p></section>';
    }

    function setRouteMenuSwitchState(sharedState, targetType) {
      const page = documentRef.querySelector(pageSelector);
      const main = mainId ? documentRef.getElementById(mainId) : null;
      const sections = sectionsId ? documentRef.getElementById(sectionsId) : null;
      const targetMenuType = String(targetType || '').toLowerCase();

      if (page) {
        page.classList.add('is-menu-switching');
        page.dataset.routeSwitchingMenu = targetMenuType;
      }
      if (main) main.setAttribute('aria-busy', 'true');

      documentRef.querySelectorAll('[data-route-menu-toggle]').forEach(button => {
        const isActive = button.getAttribute('data-route-menu-toggle') === targetMenuType;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      if (sections) sections.innerHTML = buildMenuSwitchPlaceholder(sharedState);
    }

    function clearRouteMenuSwitchState() {
      const page = documentRef.querySelector(pageSelector);
      const main = mainId ? documentRef.getElementById(mainId) : null;
      if (page) {
        page.classList.remove('is-menu-switching');
        delete page.dataset.routeSwitchingMenu;
      }
      if (main) main.removeAttribute('aria-busy');
    }

    function resetRouteScrollPosition() {
      const main = mainId ? documentRef.getElementById(mainId) : null;
      if (main) main.scrollTop = 0;
      windowRef.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
    }

    async function switchRouteMenu(contract, menu) {
      if (!menu?.id) return { ok: false, userHandled: true };
      setRouteMenuSwitchState(contract.snapshot, menu.type);
      resetRouteScrollPosition();
      try {
        return await contract.actions.switchMenu(menu);
      } catch (error) {
        clearRouteMenuSwitchState();
        renderRoute(contract);
        throw error;
      }
    }

    function updateToggleState(sharedState) {
      documentRef.querySelectorAll('[data-route-menu-toggle]').forEach(button => {
        const isActive = button.getAttribute('data-route-menu-toggle') === sharedState.menuType;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    function renderSettingsDropdown(contract) {
      if (!settingsDropdownId) return;
      const sharedState = contract.snapshot;
      const wrapper = documentRef.querySelector(settingsWrapperSelector);
      const dropdown = documentRef.getElementById(settingsDropdownId);
      if (!wrapper || !dropdown) return;

      const role = sharedState.currentUser?.role || 'none';
      const canManageCurrentMenu = contract.actions.canManageMenu(sharedState.menuId, sharedState.currentUser);
      const options = [];

      if (canManageCurrentMenu) {
        options.push({ label: 'Manager', icon: 'tune', onClick: () => contract.actions.openManager?.() });
      }
      if (role === 'admin') {
        options.push({ label: 'Admin', icon: 'shield_person', onClick: () => contract.actions.openAdmin?.() });
      }

      wrapper.style.display = options.length ? '' : 'none';
      const optionClass = adapter.settingsOptionClass || 'route-option';
      const labelClass = adapter.settingsLabelClass || 'route-option-label';
      const iconClass = adapter.settingsIconClass || 'material-symbols-outlined';
      dropdown.innerHTML = options.map(option => `
        <button class="${optionClass}" type="button" data-route-settings-option="${esc(option.label)}">
          <span class="${labelClass}">${esc(option.label)}</span>
          <span class="${iconClass}" aria-hidden="true">${esc(option.icon)}</span>
        </button>
      `).join('');

      dropdown.querySelectorAll('[data-route-settings-option]').forEach((button, index) => {
        button.onclick = () => {
          contract.actions.closeDropdowns?.();
          options[index]?.onClick?.();
        };
      });
    }

    function renderSwapDropdown(contract) {
      if (typeof adapter.renderSwapDropdown !== 'function') return;
      const sharedState = contract.snapshot;
      const menus = getMenusForRoute(sharedState);
      adapter.renderSwapDropdown({
        contract,
        sharedState,
        menus,
        esc,
        switchRouteMenu,
      });
    }

    function bindMenuToggles(contract) {
      const sharedState = contract.snapshot;
      const menus = getMenusForRoute(sharedState);
      documentRef.querySelectorAll('[data-route-menu-toggle]').forEach(button => {
        button.onclick = async () => {
          const targetType = button.getAttribute('data-route-menu-toggle');
          const menu = menus.find(entry => entry.type === targetType);
          if (!menu || menu.id === sharedState.menuId) return;
          await switchRouteMenu(contract, menu);
        };
      });

      updateToggleState(sharedState);
    }

    function renderHeaderState(sharedState) {
      const userChip = documentRef.querySelector(userChipSelector);
      if (userChip) userChip.style.display = sharedState.currentUser ? '' : 'none';
    }

    function addMediaListener(mql, handler) {
      if (!mql) return () => {};
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
      }
      if (typeof mql.addListener === 'function') {
        mql.addListener(handler);
        return () => mql.removeListener(handler);
      }
      return () => {};
    }

    function bindMobileHeader(page) {
      teardownMobileHeader?.();
      if (!page) return;

      const mql = windowRef.matchMedia(`(max-width: ${mobileBreakpointPx}px)`);
      let lastY = Math.max(windowRef.scrollY || 0, 0);
      let isCompact = false;
      let ticking = false;

      function applyState(nextCompact, nearTop) {
        page.classList.toggle('is-mobile-compact', !!nextCompact);
        page.classList.toggle('is-mobile-expanded', !nextCompact);
        page.classList.toggle('is-near-top', !!nearTop);
      }

      function evaluate() {
        const currentY = Math.max(windowRef.scrollY || 0, 0);
        const nearTop = currentY <= 8;
        const isMobile = mql.matches;

        if (!isMobile) {
          isCompact = false;
          applyState(false, true);
          lastY = currentY;
          return;
        }

        if (nearTop || currentY < 18) {
          isCompact = false;
        } else if (isCompact) {
          if (currentY < lastY - 36) isCompact = false;
        } else if (currentY > lastY + 6 && currentY > 24) {
          isCompact = true;
        }

        applyState(isCompact, nearTop);
        lastY = currentY;
      }

      function requestEvaluate() {
        if (ticking) return;
        ticking = true;
        windowRef.requestAnimationFrame(() => {
          ticking = false;
          evaluate();
        });
      }

      const onScroll = () => requestEvaluate();
      const onResize = () => requestEvaluate();
      const removeMediaListener = addMediaListener(mql, requestEvaluate);

      windowRef.addEventListener('scroll', onScroll, { passive: true });
      windowRef.addEventListener('resize', onResize);
      requestEvaluate();

      teardownMobileHeader = () => {
        removeMediaListener();
        windowRef.removeEventListener('scroll', onScroll);
        windowRef.removeEventListener('resize', onResize);
        page.classList.remove('is-mobile-compact', 'is-mobile-expanded', 'is-near-top');
      };
    }

    function renderBootShell() {
      if (!templateId) return false;
      const template = documentRef.getElementById(templateId);
      const container = documentRef.getElementById(containerId);
      if (!template || !container) return false;

      container.innerHTML = '';
      container.appendChild(template.content.cloneNode(true));

      const statusTsEl = statusTimestampId ? documentRef.getElementById(statusTimestampId) : null;
      if (statusTsEl) statusTsEl.textContent = 'Loading live menu…';

      const footerTsEl = footerTimestampId ? documentRef.getElementById(footerTimestampId) : null;
      if (footerTsEl) footerTsEl.textContent = 'Loading live menu…';

      const featuredWrap = specialsId ? documentRef.getElementById(specialsId) : null;
      if (featuredWrap) featuredWrap.innerHTML = loadingSpecialsHtml;

      const categoryWrap = sectionsId ? documentRef.getElementById(sectionsId) : null;
      if (categoryWrap) categoryWrap.innerHTML = buildMenuSwitchPlaceholder({});

      bindMobileHeader(container.querySelector(pageSelector));
      return true;
    }

    function renderRoute(contract) {
      if (!templateId) return false;
      if (!contract?.snapshot || !contract?.actions) return false;
      const sharedState = contract.snapshot;

      if (typeof adapter.shouldRender === 'function' && adapter.shouldRender(sharedState) === false) {
        return false;
      }

      const template = documentRef.getElementById(templateId);
      const container = documentRef.getElementById(containerId);
      if (!template || !container) return false;

      container.innerHTML = '';
      container.appendChild(template.content.cloneNode(true));

      const timestamp = sharedState.lastUpdatedTs
        ? (contract.helpers.formatUpdatedAt?.(sharedState.lastUpdatedTs, '') || '')
        : 'Awaiting first update';

      if (menuNameId) {
        const menuNameEl = documentRef.getElementById(menuNameId);
        if (menuNameEl) menuNameEl.textContent = sharedState.activeMenuName || menuNameFallback;
      }

      const statusTsEl = statusTimestampId ? documentRef.getElementById(statusTimestampId) : null;
      if (statusTsEl) statusTsEl.textContent = timestamp;

      const footerTsEl = footerTimestampId ? documentRef.getElementById(footerTimestampId) : null;
      if (footerTsEl) footerTsEl.textContent = timestamp;

      const footerVersionEl = footerVersionId ? documentRef.getElementById(footerVersionId) : null;
      if (footerVersionEl) {
        footerVersionEl.innerHTML = `${sharedState.appVersion || ''}${sharedState.isPreview ? ' <span class="footer-preview-badge">PREVIEW</span>' : ''}`;
      }

      const featuredWrap = specialsId ? documentRef.getElementById(specialsId) : null;
      if (featuredWrap && typeof adapter.buildFeaturedHtml === 'function') {
        featuredWrap.innerHTML = adapter.buildFeaturedHtml(sharedState);
      }

      const categoryWrap = sectionsId ? documentRef.getElementById(sectionsId) : null;
      if (categoryWrap && typeof adapter.buildCategoryHtml === 'function') {
        const categoriesHtml = (sharedState.categoryDefs || [])
          .filter(category => category.id !== 'special')
          .map(category => adapter.buildCategoryHtml(sharedState, category))
          .filter(Boolean)
          .join('');
        categoryWrap.innerHTML = categoriesHtml || emptyCategoriesHtml;
      }

      clearRouteMenuSwitchState();
      renderHeaderState(sharedState);
      renderSwapDropdown(contract);
      renderSettingsDropdown(contract);
      bindMenuToggles(contract);
      windowRef.syncPublicStaffFooterActions?.(sharedState.publicFooter);
      bindMobileHeader(container.querySelector(pageSelector));

      return true;
    }

    const renderer = {
      restaurantId: adapter.restaurantId || '',
      boot: renderBootShell,
      render: renderRoute,
    };

    if (typeof windowRef.registerPublicRouteRenderer === 'function') {
      windowRef.registerPublicRouteRenderer(renderer);
    } else {
      windowRef.__pendingPublicRouteRenderer = renderer;
    }

    return renderer;
  }

  modules.createPublicRouteCore = createPublicRouteCore;
  globalScope.__HF_ROUTE_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
