(function bootstrapElRoysRoute() {
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

  function itemUpcharges(upcharges) {
    if (!Array.isArray(upcharges)) return [];
    return upcharges
      .filter(entry => entry && (entry.label || entry.price))
      .map(entry => ({
        label: String(entry.label || '').trim(),
        price: String(entry.price || '').trim(),
      }))
      .filter(entry => entry.label || entry.price);
  }

  function recipeParts(recipe) {
    if (Array.isArray(recipe)) return recipe.filter(Boolean).map(part => String(part).trim()).filter(Boolean);
    if (typeof recipe === 'string' && recipe.trim()) return [recipe.trim()];
    return [];
  }

  function buildItemHtml(item, options = {}) {
    const is86 = !!item?.eightySixed;
    const desc = item?.showDescription === false ? '' : String(item?.desc || '').trim();
    const recipe = item?.showRecipe ? recipeParts(item?.recipe) : [];
    const upcharges = itemUpcharges(item?.upcharges);
    const badge = options.badgeText
      ? `<span class="erc-badge erc-badge--special">${esc(options.badgeText)}</span>`
      : (is86 ? `<span class="erc-badge erc-badge--86d">86'D</span>` : '');
    const recipeHtml = recipe.length ? `<p class="erc-item-desc erc-item-desc--recipe">Recipe: ${esc(recipe.join(', '))}</p>` : '';
    const upchargesHtml = upcharges.length
      ? `<div class="erc-item-upcharges">${upcharges.map(upcharge => `<span class="erc-upcharge-chip">${esc(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>+${esc(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
      : '';

    return `<article class="erc-item${is86 ? ' is-86d' : ''}">
      <div class="erc-item-row">
        <h4 class="erc-item-title">${esc(item?.name)}${badge}</h4>
        ${item?.price ? `<span class="erc-item-price">${esc(item.price)}</span>` : ''}
      </div>
      ${desc ? `<p class="erc-item-desc">${esc(desc)}</p>` : ''}
      ${recipeHtml}
      ${upchargesHtml}
    </article>`;
  }

  function buildFeaturedHtml(sharedState) {
    const featuredItems = Array.isArray(sharedState.featuredItems)
      ? sharedState.featuredItems.slice(0, 5)
      : [];
    if (!featuredItems.length) return '<p class="erc-route-empty">Nothing featured right now.</p>';

    return featuredItems.map((item, index) => buildItemHtml(item, {
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

  function buildMenuSwitchPlaceholder() {
    return `
      <section class="erc-section erc-route-switch-section" aria-hidden="true">
        <div class="erc-section-head">
          <h3 class="erc-section-title">Loading menu</h3>
          <div class="erc-section-line"></div>
        </div>
        <div class="erc-route-boot-rows erc-route-switch-rows">
          <span class="erc-route-boot-line erc-route-boot-line--wide"></span>
          <span class="erc-route-boot-line erc-route-boot-line--mid"></span>
          <span class="erc-route-boot-line erc-route-boot-line--narrow"></span>
        </div>
      </section>
    `;
  }

  const routeBoundary = (window.__HF_ROUTE_MODULES__ && typeof window.__HF_ROUTE_MODULES__ === 'object')
    ? window.__HF_ROUTE_MODULES__
    : null;

  if (typeof routeBoundary?.createPublicRouteCore !== 'function') {
    console.warn('Shared public route core not found for El Roy\'s route.');
    return;
  }

  routeBoundary.createPublicRouteCore({
    esc,
    mobileBreakpointPx: 820,
    restaurantId: '00000000-0000-0000-0000-000000000001',
    templateId: 'elroy-route-template',
    pageSelector: '.erc-page',
    mainId: 'erc-route-main',
    sectionsId: 'erc-route-sections',
    statusTimestampId: 'erc-route-status-timestamp',
    footerTimestampId: 'erc-route-footer-timestamp',
    footerVersionId: 'erc-route-footer-version',
    specialsId: 'erc-route-specials',
    settingsDropdownId: 'erc-settings-dropdown',
    settingsOptionClass: 'erc-dropdown-option',
    settingsLabelClass: 'erc-dropdown-label',
    settingsIconClass: 'material-symbols-outlined',
    emptyCategoriesHtml: '<p class="erc-route-empty">Nothing on the menu yet.</p>',
    loadingSpecialsHtml: '<p class="erc-route-boot-copy">Loading specials…</p>',
    buildMenuSwitchPlaceholder,
    buildFeaturedHtml,
    buildCategoryHtml,
    shouldRender: sharedState => sharedState.siteRestaurant?.id === '00000000-0000-0000-0000-000000000001',
  });
})();
