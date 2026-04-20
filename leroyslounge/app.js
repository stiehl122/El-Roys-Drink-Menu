(function bootstrapLeroysRoute() {
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

  function buildItemHtml(item, badgeText = '') {
    const is86 = !!item?.eightySixed;
    const desc = item?.showDescription === false ? '' : String(item?.desc || '').trim();
    const recipe = item?.showRecipe ? recipeParts(item?.recipe) : [];
    const upcharges = itemUpcharges(item?.upcharges);
    const hasDesc = !!desc;
    const hasRecipe = recipe.length > 0;
    const hasDetail = hasDesc || hasRecipe;
    const toggleHandler = hasDetail ? ' onclick="togglePublicDesc(this.closest(\'.menu-item\'))"' : '';
    const expandIcon = hasDetail
      ? `<span class="material-symbols-outlined item-expand-icon ll-board-expand" role="button" tabindex="0" aria-label="Show description" aria-expanded="false" onclick="event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))}">expand_more</span>`
      : '';
    const detailSections = [
      hasDesc ? `<div class="ll-board-detail-group"><div class="ll-board-detail-label">Description</div><p class="ll-board-item-desc menu-item-desc">${esc(desc)}</p></div>` : '',
      hasRecipe ? `<div class="ll-board-detail-group ll-board-detail-group--recipe"><div class="ll-board-detail-label">Recipe</div><p class="ll-board-item-desc menu-item-desc">${esc(recipe.join(', '))}</p></div>` : '',
    ].join('');
    const upchargesHtml = upcharges.length
      ? `<div class="ll-board-upcharges">${upcharges.map(upcharge => `<span class="ll-board-upcharge">${esc(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${esc(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
      : '';

    return `<article class="ll-board-item menu-item${hasDetail ? ' has-detail' : ''}${is86 ? ' menu-item-86d ll-board-item--sold' : ''}">
      <div class="ll-board-row${hasDetail ? ' ll-board-row--expandable' : ''}${is86 ? ' ll-board-row--sold' : ''}"${toggleHandler}>
        ${is86 ? '<span class="ll-board-strike" aria-hidden="true"></span>' : ''}
        <div class="ll-board-item-main">
          <div class="ll-board-item-name-wrap">
            <h3 class="ll-board-item-name menu-item-name">${esc(item?.name)}</h3>
            ${badgeText ? `<span class="ll-board-chip">${esc(badgeText)}</span>` : ''}
          </div>
          ${upchargesHtml}
        </div>
        <div class="ll-board-item-side">
          ${is86 ? '<span class="ll-board-stamp">Sold Out</span>' : ''}
          ${item?.price ? `<span class="ll-board-price menu-item-price">${esc(item.price)}</span>` : ''}
          ${expandIcon}
        </div>
      </div>
      ${hasDetail ? `<div class="ll-board-detail item-detail-panel"><div class="ll-board-row ll-board-row--desc"><div class="ll-board-detail-copy">${detailSections}</div></div></div>` : ''}
      <div class="ll-board-row-spacer" aria-hidden="true"></div>
    </article>`;
  }

  function buildFeaturedHtml(sharedState) {
    const featuredSlots = (sharedState.restaurantSpecials?.slots || [])
      .filter(slot => slot.item)
      .slice(0, 5);
    if (!featuredSlots.length) return '<p class="ll-route-empty">Nothing featured right now.</p>';
    return featuredSlots.slice(0, 5).map((slot, index) => buildItemHtml(slot.item, index === 0 ? "Chef's Choice" : '')).join('');
  }

  function buildCategoryHtml(sharedState, category) {
    const items = getVisibleItems(sharedState.menuState, category.id);
    if (!items.length) return '';
    return `<section class="ll-slat-section menu-category" data-category="${esc(category.id)}">
      <div class="ll-slat-section-head">
        <h2 class="ll-slat-section-title">${esc(category.title)}</h2>
      </div>
      <div class="ll-board-rows">${items.map(item => buildItemHtml(item)).join('')}</div>
    </section>`;
  }

  function buildMenuSwitchPlaceholder() {
    return `
      <section class="ll-slat-section ll-route-switch-section" aria-hidden="true">
        <div class="ll-route-boot-rows ll-route-switch-rows">
          <span class="ll-route-boot-line ll-route-boot-line--wide"></span>
          <span class="ll-route-boot-line ll-route-boot-line--mid"></span>
          <span class="ll-route-boot-line ll-route-boot-line--narrow"></span>
          <span class="ll-route-boot-line ll-route-boot-line--mid"></span>
        </div>
      </section>
      <section class="ll-slat-section ll-route-switch-section" aria-hidden="true">
        <div class="ll-route-boot-rows ll-route-switch-rows">
          <span class="ll-route-boot-line ll-route-boot-line--wide"></span>
          <span class="ll-route-boot-line ll-route-boot-line--mid"></span>
          <span class="ll-route-boot-line ll-route-boot-line--narrow"></span>
        </div>
      </section>
    `;
  }

  const routeBoundary = (window.__HF_ROUTE_MODULES__ && typeof window.__HF_ROUTE_MODULES__ === 'object')
    ? window.__HF_ROUTE_MODULES__
    : null;

  if (typeof routeBoundary?.createPublicRouteCore !== 'function') {
    console.warn('Shared public route core not found for Leroy\'s route.');
    return;
  }

  routeBoundary.createPublicRouteCore({
    esc,
    mobileBreakpointPx: 820,
    restaurantId: '00000000-0000-0000-0000-000000000010',
    templateId: 'leroy-route-template',
    pageSelector: '.ll-board-page',
    mainId: 'll-route-main',
    sectionsId: 'll-route-sections',
    statusTimestampId: 'll-route-status-timestamp',
    footerTimestampId: 'll-route-footer-timestamp',
    footerVersionId: 'll-route-footer-version',
    specialsId: 'll-route-specials',
    menuNameId: 'll-route-menu-name',
    menuNameFallback: "Leroy's Lounge",
    settingsDropdownId: 'll-route-settings-dropdown',
    settingsOptionClass: 'll-board-route-option',
    settingsLabelClass: 'll-board-route-option-label',
    settingsIconClass: 'material-symbols-outlined ll-board-route-option-icon',
    emptyCategoriesHtml: '<p class="ll-route-empty">Nothing on the board right now.</p>',
    loadingSpecialsHtml: '<p class="ll-route-boot-copy">Lighting the board…</p>',
    buildMenuSwitchPlaceholder,
    buildFeaturedHtml,
    buildCategoryHtml,
  });
})();
