import { createHash } from 'node:crypto';

import '../core/domain/featured-specials.js';

const featuredSpecials = (globalThis.__HF_FEATURED_SPECIALS__ && typeof globalThis.__HF_FEATURED_SPECIALS__ === 'object')
  ? globalThis.__HF_FEATURED_SPECIALS__
  : {};
const ensureFeaturedSpecialsCategory = typeof featuredSpecials.ensureFeaturedSpecialsCategory === 'function'
  ? featuredSpecials.ensureFeaturedSpecialsCategory
  : (categories => Array.isArray(categories) ? categories.slice() : []);
const isFeaturedSpecialsCategory = typeof featuredSpecials.isFeaturedSpecialsCategory === 'function'
  ? featuredSpecials.isFeaturedSpecialsCategory
  : (categoryOrKey => String(categoryOrKey?.key || categoryOrKey || '').trim() === 'featured_specials');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createDeterministicUuid(seed = '') {
  const hex = createHash('sha1')
    .update(String(seed || ''))
    .digest('hex')
    .slice(0, 32)
    .padEnd(32, '0');
  const chars = hex.split('');
  chars[12] = '5';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = chars.join('');
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join('-');
}

function createFeaturedSpecialCloneId({ menuId = '', itemId = '', itemName = '' } = {}) {
  return createDeterministicUuid([
    'featured-specials',
    String(menuId || '').trim(),
    String(itemId || '').trim(),
    String(itemName || '').trim().toLowerCase(),
  ].join('::'));
}

export function prepareFeaturedCategoriesForPersistence(categories = [], {
  menuId = '',
  menuType = 'drinks',
} = {}) {
  const hasFeaturedCategory = asArray(categories).some(category => isFeaturedSpecialsCategory(category));
  const canonicalCategories = hasFeaturedCategory
    ? ensureFeaturedSpecialsCategory(categories, { menuId, menuType })
    : asArray(categories).slice();
  const nonFeaturedItemIds = new Set();

  canonicalCategories.forEach(category => {
    if (isFeaturedSpecialsCategory(category)) return;
    asArray(category?.items).forEach(item => {
      const itemId = String(item?.id || '').trim();
      if (itemId) nonFeaturedItemIds.add(itemId);
    });
  });

  const cloneIdMap = new Map();
  const preparedCategories = canonicalCategories.map(category => {
    if (!isFeaturedSpecialsCategory(category)) return category;
    return {
      ...category,
      items: asArray(category?.items).map(item => {
        const itemId = String(item?.id || '').trim();
        if (!itemId || !nonFeaturedItemIds.has(itemId)) return item;
        const cloneId = cloneIdMap.get(itemId) || createFeaturedSpecialCloneId({
          menuId,
          itemId,
          itemName: item?.name || '',
        });
        cloneIdMap.set(itemId, cloneId);
        return {
          ...item,
          id: cloneId,
        };
      }),
    };
  });

  return {
    categories: preparedCategories,
    cloneIdMap,
  };
}

export function remapFeaturedSpecialsLastSentState(lastSentState = {}, cloneIdMap = new Map()) {
  if (!lastSentState || typeof lastSentState !== 'object' || Array.isArray(lastSentState)) return {};
  const normalizedState = Object.fromEntries(Object.entries(lastSentState).map(([key, items]) => [
    key,
    asArray(items).map(item => ({ ...item })),
  ]));
  if (!(cloneIdMap instanceof Map) || !cloneIdMap.size) return normalizedState;

  Object.keys(normalizedState).forEach(key => {
    if (!isFeaturedSpecialsCategory(key)) return;
    normalizedState[key] = asArray(normalizedState[key]).map(item => {
      const cloneId = cloneIdMap.get(String(item?.id || '').trim());
      return cloneId
        ? { ...item, id: cloneId }
        : item;
    });
  });

  return normalizedState;
}
