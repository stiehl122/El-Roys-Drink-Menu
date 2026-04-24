(function bootstrapFeaturedSpecials(globalScope) {
  if (!globalScope || globalScope.__HF_FEATURED_SPECIALS__) return;

  const FEATURED_SPECIALS_CATEGORY_ID = 'featured_specials';
  const LEGACY_FEATURED_SPECIAL_IDS = new Set(['special']);

  function normalizeFeaturedEnabled(item = {}) {
    return item?.featured_enabled === true || item?.featuredEnabled === true;
  }

  function isLegacyFeaturedSpecialCategory(categoryOrKey = '') {
    const key = typeof categoryOrKey === 'string'
      ? categoryOrKey
      : String(categoryOrKey?.key || categoryOrKey?.id || '').trim();
    return LEGACY_FEATURED_SPECIAL_IDS.has(key);
  }

  function normalizeFeaturedSpecialItem(item = {}, { forceFeaturedEnabled = false } = {}) {
    return {
      ...item,
      featured_enabled: forceFeaturedEnabled || normalizeFeaturedEnabled(item),
    };
  }

  function getFeaturedSpecialItemIdentityKey(item = {}, fallback = '') {
    const id = String(item?.id || item?.item_id || '').trim();
    if (id) return `id:${id}`;
    const name = String(item?.name || '').trim().toLowerCase();
    if (name) return `name:${name}`;
    return `fallback:${fallback}`;
  }

  function mergeFeaturedSpecialItems(itemGroups = []) {
    const mergedItems = [];
    const seenItemKeys = new Set();

    (Array.isArray(itemGroups) ? itemGroups : []).forEach((group, groupIndex) => {
      (Array.isArray(group?.items) ? group.items : []).forEach((item, itemIndex) => {
        const itemKey = getFeaturedSpecialItemIdentityKey(item, `${groupIndex}:${itemIndex}`);
        if (seenItemKeys.has(itemKey)) return;
        seenItemKeys.add(itemKey);
        mergedItems.push(item);
      });
    });

    return mergedItems;
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
    const featuredItems = [];
    const legacyFeaturedItems = [];

    (Array.isArray(categories) ? categories : []).forEach(category => {
      if (isFeaturedSpecialsCategory(category)) {
        const forceFeaturedEnabled = isLegacyFeaturedSpecialCategory(category);
        const normalized = {
          ...category,
          items: (Array.isArray(category?.items) ? category.items : [])
            .map(item => normalizeFeaturedSpecialItem(item, { forceFeaturedEnabled })),
        };
        if (forceFeaturedEnabled) {
          legacyFeaturedItems.push(...normalized.items);
        } else {
          featuredItems.push(...normalized.items);
        }
        return;
      }
      next.push(category);
    });

    const fixed = createFeaturedSpecialsCategory({ menuId, menuType });
    return [{
      ...fixed,
      items: mergeFeaturedSpecialItems([
        { items: featuredItems },
        { items: legacyFeaturedItems },
      ]),
    }, ...next];
  }

  function normalizeFeaturedSpecialsLastSentState(lastSentState = {}) {
    if (!lastSentState || typeof lastSentState !== 'object' || Array.isArray(lastSentState)) {
      return {};
    }

    const normalizedState = {};
    const featuredItems = [];
    const legacyFeaturedItems = [];
    let hasFeaturedState = false;

    Object.entries(lastSentState).forEach(([key, items]) => {
      if (isFeaturedSpecialsCategory(key)) {
        hasFeaturedState = true;
        const forceFeaturedEnabled = isLegacyFeaturedSpecialCategory(key);
        const normalizedItems = (Array.isArray(items) ? items : [])
          .map(item => normalizeFeaturedSpecialItem(item, { forceFeaturedEnabled }));
        if (forceFeaturedEnabled) {
          legacyFeaturedItems.push(...normalizedItems);
        } else {
          featuredItems.push(...normalizedItems);
        }
        return;
      }

      normalizedState[key] = Array.isArray(items)
        ? items.map(item => ({ ...item }))
        : [];
    });

    if (hasFeaturedState) {
      normalizedState[FEATURED_SPECIALS_CATEGORY_ID] = mergeFeaturedSpecialItems([
        { items: featuredItems },
        { items: legacyFeaturedItems },
      ]);
    }
    return normalizedState;
  }

  function isPublicFeaturedSpecialItem(item = {}) {
    return item?.onMenu !== false && item?.on_menu !== false && item?.visibility !== 'off_menu';
  }

  function deriveFeaturedItems(categories = []) {
    const canonicalItems = [];
    const legacyItems = [];

    (Array.isArray(categories) ? categories : []).forEach(category => {
      if (!isFeaturedSpecialsCategory(category)) return;
      const forceFeaturedEnabled = isLegacyFeaturedSpecialCategory(category);
      const normalizedItems = (Array.isArray(category?.items) ? category.items : [])
        .map(item => normalizeFeaturedSpecialItem(item, { forceFeaturedEnabled }));
      if (forceFeaturedEnabled) {
        legacyItems.push(...normalizedItems);
      } else {
        canonicalItems.push(...normalizedItems);
      }
    });

    return mergeFeaturedSpecialItems([
      { items: canonicalItems },
      { items: legacyItems },
    ])
      .filter(item => item.featured_enabled === true && isPublicFeaturedSpecialItem(item));
  }

  const api = Object.freeze({
    FEATURED_SPECIALS_CATEGORY_ID,
    isLegacyFeaturedSpecialCategory,
    isFeaturedSpecialsCategory,
    isPublicFeaturedSpecialItem,
    normalizeFeaturedEnabled,
    normalizeFeaturedSpecialItem,
    createFeaturedSpecialsCategory,
    ensureFeaturedSpecialsCategory,
    normalizeFeaturedSpecialsLastSentState,
    deriveFeaturedItems,
  });

  globalScope.__HF_FEATURED_SPECIALS__ = api;

  if (typeof exports !== 'undefined') {
    exports.FEATURED_SPECIALS_CATEGORY_ID = FEATURED_SPECIALS_CATEGORY_ID;
    exports.isLegacyFeaturedSpecialCategory = isLegacyFeaturedSpecialCategory;
    exports.isFeaturedSpecialsCategory = isFeaturedSpecialsCategory;
    exports.isPublicFeaturedSpecialItem = isPublicFeaturedSpecialItem;
    exports.normalizeFeaturedEnabled = normalizeFeaturedEnabled;
    exports.normalizeFeaturedSpecialItem = normalizeFeaturedSpecialItem;
    exports.createFeaturedSpecialsCategory = createFeaturedSpecialsCategory;
    exports.ensureFeaturedSpecialsCategory = ensureFeaturedSpecialsCategory;
    exports.normalizeFeaturedSpecialsLastSentState = normalizeFeaturedSpecialsLastSentState;
    exports.deriveFeaturedItems = deriveFeaturedItems;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
