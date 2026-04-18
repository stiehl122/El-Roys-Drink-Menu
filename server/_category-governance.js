import { readMenuStateBundle } from './_menu-read.js';

const UNCATEGORIZED_ID = '__uncategorized__';
const GOVERNED_FIELDS = [
  'key',
  'label',
  'icon',
  'color',
  'sub',
  'placeholder',
  'display_order',
  'untappd_enabled',
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDisplayOrder(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeGovernedCategory(category = {}, fallbackIndex = 0) {
  const key = asString(category?.key);
  if (!key || key === UNCATEGORIZED_ID) return null;
  return {
    key,
    label: asString(category?.label) || key,
    icon: asString(category?.icon),
    color: asString(category?.color),
    sub: asString(category?.sub),
    placeholder: asString(category?.placeholder),
    display_order: normalizeDisplayOrder(category?.display_order, fallbackIndex),
    untappd_enabled: category?.untappd_enabled === true || category?.untappdEnabled === true,
  };
}

function buildGovernedCategoryMap(categories = []) {
  const map = new Map();
  asArray(categories).forEach((category, index) => {
    const normalized = normalizeGovernedCategory(category, index);
    if (!normalized || map.has(normalized.key)) return;
    map.set(normalized.key, normalized);
  });
  return map;
}

function categoriesDiffer(left = null, right = null) {
  if (!left || !right) return true;
  return GOVERNED_FIELDS.some(field => {
    if (field === 'untappd_enabled') return !!left[field] !== !!right[field];
    return left[field] !== right[field];
  });
}

function createAllowedResult() {
  return {
    allowed: true,
    changed_categories: [],
  };
}

function readGovernanceBaselineCategories(bundle = {}) {
  const draftCategories = bundle?.meta?.draft_state?.cats;
  if (Array.isArray(draftCategories)) return draftCategories;
  return asArray(bundle?.cats);
}

export function detectForbiddenCategoryMutations({
  actor = null,
  currentCategories = [],
  nextCategories = [],
} = {}) {
  if (actor?.role === 'admin') return createAllowedResult();

  const nextCategoryArray = asArray(nextCategories);
  if (!nextCategoryArray.length) return createAllowedResult();

  const currentMap = buildGovernedCategoryMap(currentCategories);
  const nextMap = buildGovernedCategoryMap(nextCategoryArray);
  const changedCategoryKeys = [];
  const observedKeys = new Set();

  [...currentMap.keys(), ...nextMap.keys()].forEach(key => {
    if (!key || observedKeys.has(key)) return;
    observedKeys.add(key);
    const currentCategory = currentMap.get(key) || null;
    const nextCategory = nextMap.get(key) || null;
    if (categoriesDiffer(currentCategory, nextCategory)) {
      changedCategoryKeys.push(key);
    }
  });

  if (!changedCategoryKeys.length) return createAllowedResult();
  return {
    allowed: false,
    changed_categories: changedCategoryKeys,
  };
}

export function buildCategoryGovernanceError(result = null) {
  return {
    status: 403,
    message: 'Category changes are admin-only.',
    body: {
      ok: false,
      status: 'category_governance_denied',
      code: 'category_governance_denied',
      error: 'Category changes are admin-only.',
      changed_categories: Array.isArray(result?.changed_categories) ? result.changed_categories : [],
    },
  };
}

export async function assertCategoryGovernanceAllowed({
  actor = null,
  menuId = '',
  snapshot = {},
} = {}) {
  if (actor?.role === 'admin') return createAllowedResult();
  const nextCategories = asArray(snapshot?.cats);
  if (!menuId || !nextCategories.length) return createAllowedResult();

  const liveBundle = await readMenuStateBundle(menuId);
  const result = detectForbiddenCategoryMutations({
    actor,
    currentCategories: readGovernanceBaselineCategories(liveBundle),
    nextCategories,
  });
  if (!result.allowed) {
    throw buildCategoryGovernanceError(result);
  }
  return result;
}
