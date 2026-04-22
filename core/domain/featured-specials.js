(function bootstrapFeaturedSpecials(globalScope) {
  if (!globalScope || globalScope.__HF_FEATURED_SPECIALS__) return;

  const FEATURED_SPECIALS_CATEGORY_ID = 'featured_specials';
  const LEGACY_FEATURED_SPECIAL_IDS = new Set(['special']);

  function normalizeFeaturedEnabled(item = {}) {
    return item?.featured_enabled === true || item?.featuredEnabled === true;
  }

  function normalizeFeaturedSpecialItem(item = {}) {
    return {
      ...item,
      featured_enabled: normalizeFeaturedEnabled(item),
    };
  }

  function isFeaturedSpecialsCategory(categoryOrKey = '') {
    const key = typeof categoryOrKey === 'string'
      ? categoryOrKey
      : String(categoryOrKey?.key || categoryOrKey?.id || '').trim();
    return key === FEATURED_SPECIALS_CATEGORY_ID || LEGACY_FEATURED_SPECIAL_IDS.has(key);
  }

  function createFeaturedSpecialsCategory({ menuId = '', menuType = 'drinks' } = {}) {
    return {
      id: menuId ? `featured-specials-${menuId}` : FEATURED_SPECIALS_CATEGORY_ID,
      menu_id: menuId || '',
      key: FEATURED_SPECIALS_CATEGORY_ID,
      label: 'Featured Specials',
      title: 'Featured Specials',
      icon: '⭐',
      color: 'rgba(190,67,48,0.12)',
      sub: menuType === 'food'
        ? 'Limited dishes and deal items for this menu'
        : 'Limited pours, specials, and deal items for this menu',
      placeholder: menuType === 'food'
        ? 'e.g. Taco Tuesday Plate...'
        : 'e.g. Happy Hour Margarita...',
      untappd_enabled: false,
      display_order: 0,
      items: [],
      fixed: true,
    };
  }

  function ensureFeaturedSpecialsCategory(categories = [], { menuId = '', menuType = 'drinks' } = {}) {
    const next = [];
    const collectedItems = [];

    (Array.isArray(categories) ? categories : []).forEach(category => {
      const normalized = {
        ...category,
        items: (Array.isArray(category?.items) ? category.items : []).map(normalizeFeaturedSpecialItem),
      };
      if (isFeaturedSpecialsCategory(normalized)) {
        collectedItems.push(...normalized.items);
        return;
      }
      next.push(normalized);
    });

    const fixed = createFeaturedSpecialsCategory({ menuId, menuType });
    return [{
      ...fixed,
      items: collectedItems,
    }, ...next];
  }

  function deriveFeaturedItems(categories = []) {
    const category = (Array.isArray(categories) ? categories : [])
      .find(candidate => String(candidate?.key || '').trim() === FEATURED_SPECIALS_CATEGORY_ID);
    return (Array.isArray(category?.items) ? category.items : [])
      .map(normalizeFeaturedSpecialItem)
      .filter(item => item.featured_enabled === true && item?.on_menu !== false && item?.onMenu !== false);
  }

  const api = Object.freeze({
    FEATURED_SPECIALS_CATEGORY_ID,
    isFeaturedSpecialsCategory,
    normalizeFeaturedEnabled,
    normalizeFeaturedSpecialItem,
    createFeaturedSpecialsCategory,
    ensureFeaturedSpecialsCategory,
    deriveFeaturedItems,
  });

  globalScope.__HF_FEATURED_SPECIALS__ = api;

  if (typeof exports !== 'undefined') {
    exports.FEATURED_SPECIALS_CATEGORY_ID = FEATURED_SPECIALS_CATEGORY_ID;
    exports.isFeaturedSpecialsCategory = isFeaturedSpecialsCategory;
    exports.normalizeFeaturedEnabled = normalizeFeaturedEnabled;
    exports.normalizeFeaturedSpecialItem = normalizeFeaturedSpecialItem;
    exports.createFeaturedSpecialsCategory = createFeaturedSpecialsCategory;
    exports.ensureFeaturedSpecialsCategory = ensureFeaturedSpecialsCategory;
    exports.deriveFeaturedItems = deriveFeaturedItems;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
