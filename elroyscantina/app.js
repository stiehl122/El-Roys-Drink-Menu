(function() {
  const MOBILE_BREAKPOINT_PX = 820;
  let teardownMobileHeader = null;

  function esc(value) {
    if (typeof window.escHtml === 'function') return window.escHtml(value || '');
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function getVisibleItems(menuState, categoryId) {
    const state = menuState?.[categoryId] || { items: [] };
    return (state.items || []).filter(item => item.onMenu !== false && item.visibility !== 'off_menu');
  }

  function buildItemHtml(item, options = {}) {
    const is86 = !!item?.eightySixed;
    const desc = String(item?.desc || '').trim();
    const badge = options.badgeText
      ? `<span class="erc-badge erc-badge--special">${esc(options.badgeText)}</span>`
      : (is86 ? `<span class="erc-badge erc-badge--86d">86'D</span>` : '');

    return `<article class="erc-item${is86 ? ' is-86d' : ''}">
      <div class="erc-item-row">
        <h4 class="erc-item-title">${esc(item?.name)}${badge}</h4>
        ${item?.price ? `<span class="erc-item-price">${esc(item.price)}</span>` : ''}
      </div>
      ${desc ? `<p class="erc-item-desc">${esc(desc)}</p>` : ''}
    </article>`;
  }

  function buildFeaturedHtml(sharedState) {
    const featuredSlots = (sharedState.featuredGroups || []).flatMap(group => group.slots || []).filter(slot => slot.item);
    if (!featuredSlots.length) {
      const fallbackItems = getVisibleItems(sharedState.menuState, 'special').slice(0, 3);
      if (!fallbackItems.length) return '<p class="erc-route-empty">Nothing featured right now.</p>';
      return fallbackItems.map((item, index) => buildItemHtml(item, { badgeText: index === 0 ? "Chef's Choice" : '' })).join('');
    }

    return featuredSlots.slice(0, 3).map((slot, index) => buildItemHtml(slot.item, {
      badgeText: index === 0 ? "Chef's Choice" : '',
    })).join('');
  }

  function buildCategoryHtml(sharedState, category) {
    const items = getVisibleItems(sharedState.menuState, category.id);
    if (!items.length) return '';
    return `<section class="erc-section menu-category" data-category="${esc(category.id)}">
      <div class="erc-section-head">
        <h3 class="erc-section-title">${esc(category.title)}</h3>
        <div class="erc-section-line" aria-hidden="true"></div>
      </div>
      <div class="erc-items">${items.map(item => buildItemHtml(item)).join('')}</div>
    </section>`;
  }

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

  function updateToggleState(sharedState) {
    document.querySelectorAll('[data-route-menu-toggle]').forEach(button => {
      const isActive = button.getAttribute('data-route-menu-toggle') === sharedState.menuType;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function renderSettingsDropdown(sharedState) {
    const wrapper = document.querySelector('[data-route-settings]');
    const dropdown = document.getElementById('erc-settings-dropdown');
    if (!wrapper || !dropdown) return;

    const role = sharedState.currentUser?.role || 'none';
    const canManageCurrentMenu = typeof window.currentUserCanManageMenu === 'function'
      ? window.currentUserCanManageMenu(sharedState.menuId, sharedState.currentUser)
      : (role === 'admin');
    const options = [];

    if (canManageCurrentMenu) {
      options.push({ label: 'Manager', icon: 'tune', onClick: () => window.onActionBtnClick?.() });
    }
    if (role === 'admin') {
      options.push({ label: 'Admin', icon: 'shield_person', onClick: () => window.onAdminBtnClick?.() });
    }

    wrapper.style.display = options.length ? '' : 'none';
    dropdown.innerHTML = options.map(option => `
      <button class="erc-dropdown-option" type="button" data-route-settings-option="${esc(option.label)}">
        <span class="erc-dropdown-label">${esc(option.label)}</span>
        <span class="material-symbols-outlined" aria-hidden="true">${esc(option.icon)}</span>
      </button>
    `).join('');

    dropdown.querySelectorAll('[data-route-settings-option]').forEach((button, index) => {
      button.onclick = () => {
        window.closeRouteDropdowns?.();
        options[index]?.onClick?.();
      };
    });
  }

  function bindMenuToggles(sharedState) {
    const menus = getMenusForRoute(sharedState);
    document.querySelectorAll('[data-route-menu-toggle]').forEach(button => {
      button.onclick = async () => {
        const targetType = button.getAttribute('data-route-menu-toggle');
        const menu = menus.find(entry => entry.type === targetType);
        if (!menu || menu.id === sharedState.menuId) return;

        window.selectMenu?.(menu.id, menu.slug, menu.name, menu.type, menu.restaurantId);
        const targetHref = window.getPublicHrefForCurrentMenu?.();
        const currentHref = `${window.location.pathname}${window.location.search}`;
        if (targetHref && targetHref !== currentHref) {
          window.navigateToPage?.(targetHref);
          return;
        }

        await window.loadActiveMenuState?.();
        window.applyDesign?.(typeof currentDesign !== 'undefined' ? currentDesign : null);
        window.renderPublicViews?.();
      };
    });

    updateToggleState(sharedState);
  }

  function renderHeaderState(sharedState) {
    const signInButton = document.querySelector('[data-route-signin]');
    const userChip = document.querySelector('[data-route-user-chip]');
    const isAuthed = !!sharedState.currentUser;

    if (signInButton) signInButton.style.display = isAuthed ? 'none' : '';
    if (userChip) userChip.style.display = isAuthed ? '' : 'none';
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

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    let lastY = Math.max(window.scrollY || 0, 0);
    let isCompact = false;
    let ticking = false;

    function applyState(nextCompact, nearTop) {
      page.classList.toggle('is-mobile-compact', !!nextCompact);
      page.classList.toggle('is-mobile-expanded', !nextCompact);
      page.classList.toggle('is-near-top', !!nearTop);
    }

    function evaluate() {
      const currentY = Math.max(window.scrollY || 0, 0);
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
      window.requestAnimationFrame(() => {
        ticking = false;
        evaluate();
      });
    }

    const onScroll = () => requestEvaluate();
    const onResize = () => requestEvaluate();
    const removeMediaListener = addMediaListener(mql, requestEvaluate);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    requestEvaluate();

    teardownMobileHeader = () => {
      removeMediaListener();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      page.classList.remove('is-mobile-compact', 'is-mobile-expanded', 'is-near-top');
    };
  }

  function renderBootShell() {
    const template = document.getElementById('elroy-route-template');
    const container = document.getElementById('restaurant-site-wrapper');
    if (!template || !container) return false;

    container.innerHTML = '';
    container.appendChild(template.content.cloneNode(true));

    const statusTsEl = document.getElementById('erc-route-status-timestamp');
    if (statusTsEl) statusTsEl.textContent = 'Loading live menu…';

    const footerTsEl = document.getElementById('erc-route-footer-timestamp');
    if (footerTsEl) footerTsEl.textContent = 'Loading live menu…';

    const featuredWrap = document.getElementById('erc-route-specials');
    if (featuredWrap) {
      featuredWrap.innerHTML = '<p class="erc-route-boot-copy">Loading specials…</p>';
    }

    const categoryWrap = document.getElementById('erc-route-sections');
    if (categoryWrap) {
      categoryWrap.innerHTML = `
        <section class="erc-section erc-route-boot-section" aria-hidden="true">
          <div class="erc-section-head">
            <h3 class="erc-section-title">Preparing The Menu</h3>
            <div class="erc-section-line"></div>
          </div>
          <div class="erc-route-boot-rows">
            <span class="erc-route-boot-line erc-route-boot-line--wide"></span>
            <span class="erc-route-boot-line erc-route-boot-line--mid"></span>
            <span class="erc-route-boot-line erc-route-boot-line--narrow"></span>
          </div>
        </section>
      `;
    }

    bindMobileHeader(container.querySelector('.erc-page'));
    return true;
  }

  window.renderRouteBootShell = renderBootShell;

  window.initializeRoute = function initializeRoute(menuState, authState) {
    const template = document.getElementById('elroy-route-template');
    const container = document.getElementById('restaurant-site-wrapper');
    if (!template || !container) return false;

    const sharedState = {
      menuState,
      ...authState,
    };

    if (sharedState.siteRestaurant?.id !== '00000000-0000-0000-0000-000000000001') return false;

    container.innerHTML = '';
    container.appendChild(template.content.cloneNode(true));

    const timestamp = sharedState.lastUpdatedTs
      ? (window.formatUpdatedAt?.(sharedState.lastUpdatedTs, '') || '')
      : 'Awaiting first update';

    const statusTsEl = document.getElementById('erc-route-status-timestamp');
    if (statusTsEl) statusTsEl.textContent = timestamp;

    const footerTsEl = document.getElementById('erc-route-footer-timestamp');
    if (footerTsEl) footerTsEl.textContent = timestamp;

    const footerVersionEl = document.getElementById('erc-route-footer-version');
    if (footerVersionEl) {
      footerVersionEl.innerHTML = `${sharedState.appVersion || ''}${sharedState.isPreview ? ' <span class="footer-preview-badge">PREVIEW</span>' : ''}`;
    }

    const featuredWrap = document.getElementById('erc-route-specials');
    if (featuredWrap) featuredWrap.innerHTML = buildFeaturedHtml(sharedState);

    const categoryWrap = document.getElementById('erc-route-sections');
    if (categoryWrap) {
      const categoriesHtml = (sharedState.categoryDefs || [])
        .filter(category => category.id !== 'special')
        .map(category => buildCategoryHtml(sharedState, category))
        .filter(Boolean)
        .join('');
      categoryWrap.innerHTML = categoriesHtml || '<p class="erc-route-empty">Nothing on the menu yet.</p>';
    }

    renderHeaderState(sharedState);
    renderSettingsDropdown(sharedState);
    bindMenuToggles(sharedState);
    bindMobileHeader(container.querySelector('.erc-page'));
    return true;
  };
})();
