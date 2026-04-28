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

  const LEROYS_SPECIAL_EMPTY = "Leroy doesn't have anything special cooking up this week";

  function isFoodMenu(sharedState) {
    return String(sharedState?.menuType || '').toLowerCase() === 'food';
  }

  function normalizedPrice(item) {
    const price = String(item?.price || '').trim();
    if (!price) return '';
    return price.startsWith('$') ? price : `$${price}`;
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
      ? `<span class="material-symbols-outlined item-expand-icon ll-wall-expand" role="button" tabindex="0" aria-label="Show description" aria-expanded="false" onclick="event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))}">expand_more</span>`
      : '';
    const detailSections = [
      hasDesc ? `<div class="ll-wall-detail-group"><div class="ll-wall-detail-label">Description</div><p class="ll-wall-item-desc menu-item-desc">${esc(desc)}</p></div>` : '',
      hasRecipe ? `<div class="ll-wall-detail-group ll-wall-detail-group--recipe"><div class="ll-wall-detail-label">Recipe</div><p class="ll-wall-item-desc menu-item-desc">${esc(recipe.join(', '))}</p></div>` : '',
    ].join('');
    const upchargesHtml = upcharges.length
      ? `<div class="ll-wall-upcharges">${upcharges.map(upcharge => `<span class="ll-wall-upcharge">${esc(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${esc(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
      : '';
    const price = normalizedPrice(item);

    return `<article class="ll-wall-menu-row menu-item${hasDetail ? ' has-detail' : ''}${is86 ? ' menu-item-86d is-sold-out' : ''}">
      <div class="ll-wall-row${hasDetail ? ' ll-wall-row--expandable' : ''}"${toggleHandler}>
        <div class="ll-wall-item-main">
          <div class="ll-wall-item-name-wrap">
            <h3 class="ll-wall-item-name menu-item-name">${esc(item?.name)}</h3>
            ${badgeText ? `<span class="ll-wall-chip">${esc(badgeText)}</span>` : ''}
          </div>
          ${desc ? `<p class="ll-wall-item-summary">${esc(desc)}</p>` : ''}
          ${upchargesHtml}
        </div>
        <div class="ll-wall-item-side">
          ${is86 ? '<span class="ll-wall-sold-out sold-out">Sold Out</span>' : ''}
          ${price ? `<strong class="ll-wall-price menu-item-price">${esc(price)}</strong>` : ''}
          ${expandIcon}
        </div>
      </div>
      ${hasDetail ? `<div class="ll-wall-detail item-detail-panel"><div class="ll-wall-detail-copy">${detailSections}</div></div>` : ''}
    </article>`;
  }

  function buildEmptyWeeklySpecialHtml() {
    return `<article class="ll-wall-specials-strip ll-wall-specials-strip--empty">
      <div>
        <p class="ll-wall-strip-kicker">Weekly Special</p>
        <h2>${esc(LEROYS_SPECIAL_EMPTY)}</h2>
      </div>
    </article>`;
  }

  function buildWeeklySpecialHtml(item) {
    const desc = item?.showDescription === false ? '' : String(item?.desc || '').trim();
    const price = normalizedPrice(item);
    return `<article class="ll-wall-specials-strip" aria-labelledby="ll-weekly-special-title">
      <div>
        <p class="ll-wall-strip-kicker">Weekly Special</p>
        <h2 id="ll-weekly-special-title">${esc(item?.name || LEROYS_SPECIAL_EMPTY)}</h2>
      </div>
      ${desc ? `<p>${esc(desc)}</p>` : '<p></p>'}
      ${price ? `<strong class="ll-wall-special-price">${esc(price)}</strong>` : ''}
    </article>`;
  }

  function buildFeaturedHtml(sharedState) {
    if (!isFoodMenu(sharedState)) return '';
    const featuredItems = Array.isArray(sharedState.featuredItems)
      ? sharedState.featuredItems.filter(item => item && item.onMenu !== false && item.visibility !== 'off_menu')
      : [];
    if (!featuredItems.length) return buildEmptyWeeklySpecialHtml();
    return buildWeeklySpecialHtml(featuredItems[0]);
  }

  function buildCategoryHtml(sharedState, category) {
    const items = getVisibleItems(sharedState.menuState, category.id);
    if (!items.length) return '';
    return `<section class="ll-wall-category menu-category" data-category="${esc(category.id)}">
      <div class="ll-wall-category-title">
        <h2>${esc(category.title)}</h2>
      </div>
      <div class="ll-wall-category-rows">${items.map(item => buildItemHtml(item)).join('')}</div>
    </section>`;
  }

  function buildMenuSwitchPlaceholder() {
    return `
      <section class="ll-wall-category ll-wall-route-switch-section" aria-hidden="true">
        <div class="ll-wall-category-title">
          <h2>Loading menu</h2>
        </div>
        <div class="ll-wall-boot-rows">
          <span class="ll-wall-boot-line ll-wall-boot-line--wide"></span>
          <span class="ll-wall-boot-line ll-wall-boot-line--mid"></span>
          <span class="ll-wall-boot-line ll-wall-boot-line--narrow"></span>
        </div>
      </section>
    `;
  }

  function renderSwapDropdown() {
    // The wall route uses the Food/Drinks board tabs instead of a separate swap dropdown.
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
    pageSelector: '.ll-wall-page',
    mainId: 'll-route-main',
    sectionsId: 'll-route-sections',
    statusTimestampId: '',
    footerTimestampId: 'll-route-footer-timestamp',
    footerVersionId: 'll-route-footer-version',
    specialsId: 'll-route-specials',
    menuNameId: 'll-route-menu-name',
    menuNameFallback: "Leroy's Lounge",
    settingsDropdownId: 'll-route-settings-dropdown',
    settingsOptionClass: 'll-wall-route-option',
    settingsLabelClass: 'll-wall-route-option-label',
    settingsIconClass: 'material-symbols-outlined ll-wall-route-option-icon',
    emptyCategoriesHtml: '<p class="ll-wall-empty">Nothing on the menu yet.</p>',
    loadingSpecialsHtml: '<p class="ll-wall-boot-copy">Loading specials...</p>',
    buildMenuSwitchPlaceholder,
    buildFeaturedHtml,
    buildCategoryHtml,
    renderSwapDropdown,
  });
})();
