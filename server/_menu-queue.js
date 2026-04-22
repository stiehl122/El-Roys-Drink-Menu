import '../core/domain/featured-specials.js';

const UNCATEGORIZED_KEY = '__uncategorized__';
const featuredSpecials = (globalThis.__HF_FEATURED_SPECIALS__ && typeof globalThis.__HF_FEATURED_SPECIALS__ === 'object')
  ? globalThis.__HF_FEATURED_SPECIALS__
  : {};
const isFeaturedSpecialsCategory = typeof featuredSpecials.isFeaturedSpecialsCategory === 'function'
  ? featuredSpecials.isFeaturedSpecialsCategory
  : (categoryOrKey => String(categoryOrKey?.key || categoryOrKey || '').trim() === 'featured_specials');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeName(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

export function isVisibleItem(item = {}) {
  const onMenu = item?.on_menu !== false && item?.onMenu !== false;
  const visibility = String(item?.visibility || 'public').trim().toLowerCase();
  return onMenu && visibility !== 'off_menu';
}

export function isEightySixed(item = {}) {
  return !!(item?.is_eighty_sixed ?? item?.eightySixed);
}

function classifyItem(item = null) {
  if (!item || !item.visible) return 'hidden';
  return item.eightySixed ? 'eighty' : 'active';
}

function toNormalizedQueueItem(item = {}, {
  categoryKey = '',
  index = 0,
  fallbackPrefix = 'item',
} = {}) {
  const name = normalizeName(item?.name);
  if (!name) return null;

  const rawId = String(item?.id || '').trim();
  const fallbackId = `${fallbackPrefix}:${categoryKey}:${index}:${name.toLowerCase()}`;
  return {
    id: rawId || fallbackId,
    name,
    nameKey: name.toLowerCase(),
    visible: isVisibleItem(item),
    eightySixed: isEightySixed(item),
    featuredEnabled: item?.featured_enabled === true || item?.featuredEnabled === true,
  };
}

function readCategoryDisplayOrder(category = {}, fallback) {
  const numeric = Number(category?.display_order);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

function readCategoryItems(category = {}) {
  return asArray(category?.items);
}

export function readSnapshotCategories(snapshot = {}) {
  const cats = Array.isArray(snapshot) ? snapshot : asArray(snapshot?.cats);
  return cats
    .map((category, categoryIndex) => ({
      key: String(category?.key || '').trim(),
      label: String(category?.label || '').trim(),
      icon: String(category?.icon || ''),
      displayOrder: readCategoryDisplayOrder(category, categoryIndex),
      items: readCategoryItems(category),
    }))
    .filter(category => category.key && category.key !== UNCATEGORIZED_KEY);
}

function createSectionState(category = {}, fallbackOrder = Number.MAX_SAFE_INTEGER) {
  return {
    id: category.key,
    icon: category.icon || '',
    label: category.label || category.key,
    displayOrder: Number.isFinite(Number(category.displayOrder))
      ? Number(category.displayOrder)
      : fallbackOrder,
  };
}

function createGroupId(sectionId, kind, itemId) {
  return `${sectionId}::${kind}::${encodeURIComponent(String(itemId || '').trim())}`;
}

function createChangeLine(groupId, section, {
  kind,
  name,
  itemId,
}) {
  const normalizedName = normalizeName(name);
  let text = '';
  if (kind === 'added') text = `Added ${normalizedName}`;
  if (kind === 'removed') text = `Removed ${normalizedName}`;
  if (kind === 'eightySixed') text = `86'd ${normalizedName}`;
  if (kind === 'restored') {
    const restoreLabel = String(section?.label || '').toLowerCase().includes('tap')
      ? 'Back on Tap'
      : 'Back in Stock';
    text = `${restoreLabel}: ${normalizedName}`;
  }
  return {
    id: `${groupId}::${kind}::${encodeURIComponent(normalizedName.toLowerCase())}`,
    groupId,
    kind,
    text,
    name: normalizedName,
    itemId: String(itemId || ''),
    sectionId: section.id,
    sectionLabel: section.label,
    icon: section.icon,
    displayOrder: section.displayOrder,
  };
}

function toSectionsFromGroups(groups = []) {
  const sections = new Map();
  groups.forEach(group => {
    const sectionId = String(group?.sectionId || '');
    if (!sectionId) return;
    if (!sections.has(sectionId)) {
      sections.set(sectionId, {
        id: sectionId,
        icon: String(group?.icon || ''),
        label: String(group?.sectionLabel || ''),
        displayOrder: Number.isFinite(Number(group?.displayOrder))
          ? Number(group.displayOrder)
          : Number.MAX_SAFE_INTEGER,
        changes: [],
      });
    }
    const section = sections.get(sectionId);
    section.changes.push(...asArray(group.lines));
  });
  return Array.from(sections.values())
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(section => ({
      id: section.id,
      icon: section.icon,
      label: section.label,
      displayOrder: section.displayOrder,
      changes: section.changes,
    }));
}

function toLegacyDiff(sections = []) {
  return sections.map(section => ({
    id: section.id,
    icon: section.icon,
    label: section.label,
    displayOrder: Number.isFinite(Number(section.displayOrder)) ? Number(section.displayOrder) : 0,
    added: section.changes.filter(change => change.kind === 'added').map(change => change.name),
    removed: section.changes.filter(change => change.kind === 'removed').map(change => change.name),
    eightySixed: section.changes.filter(change => change.kind === 'eightySixed').map(change => change.name),
    restored: section.changes.filter(change => change.kind === 'restored').map(change => change.name),
  })).filter(section => (
    section.added.length ||
    section.removed.length ||
    section.eightySixed.length ||
    section.restored.length
  ));
}

function normalizeBaselineCategoryItems(lastSentState = {}, categoryKey = '') {
  const items = asArray(lastSentState?.[categoryKey]);
  return items
    .map((item, itemIndex) => toNormalizedQueueItem(item, {
      categoryKey,
      index: itemIndex,
      fallbackPrefix: 'baseline',
    }))
    .filter(Boolean);
}

function normalizeCurrentCategoryItems(category = {}) {
  return asArray(category?.items)
    .map((item, itemIndex) => toNormalizedQueueItem(item, {
      categoryKey: category.key,
      index: itemIndex,
      fallbackPrefix: 'live',
    }))
    .filter(Boolean);
}

function buildCategoryGroupChanges(section, currentItems = [], previousItems = []) {
  const currentById = new Map(currentItems.map(item => [item.id, item]));
  const previousById = new Map(previousItems.map(item => [item.id, item]));
  const orderedIds = [];

  currentItems.forEach(item => {
    if (!orderedIds.includes(item.id)) orderedIds.push(item.id);
  });
  previousItems.forEach(item => {
    if (!orderedIds.includes(item.id)) orderedIds.push(item.id);
  });

  const groups = [];
  const unsentCurrentItemIds = new Set();

  orderedIds.forEach(itemId => {
    const current = currentById.get(itemId) || null;
    const previous = previousById.get(itemId) || null;
    const currentState = classifyItem(current);
    const previousState = classifyItem(previous);

    if (previousState === 'active' && currentState === 'active' && previous?.nameKey !== current?.nameKey) {
      const groupId = createGroupId(section.id, 'rename', itemId);
      groups.push({
        id: groupId,
        kind: 'rename',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [
          createChangeLine(groupId, section, { kind: 'removed', name: previous?.name, itemId }),
          createChangeLine(groupId, section, { kind: 'added', name: current?.name, itemId }),
        ],
      });
      unsentCurrentItemIds.add(itemId);
      return;
    }

    if (previousState === 'active' && currentState === 'eighty') {
      const groupId = createGroupId(section.id, 'eightySixed', itemId);
      groups.push({
        id: groupId,
        kind: 'eightySixed',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [createChangeLine(groupId, section, { kind: 'eightySixed', name: current?.name, itemId })],
      });
      unsentCurrentItemIds.add(itemId);
      return;
    }

    if (previousState === 'eighty' && currentState === 'active') {
      const groupId = createGroupId(section.id, 'restored', itemId);
      groups.push({
        id: groupId,
        kind: 'restored',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [createChangeLine(groupId, section, { kind: 'restored', name: current?.name, itemId })],
      });
      unsentCurrentItemIds.add(itemId);
      return;
    }

    if (previousState === 'active' && currentState === 'hidden') {
      const groupId = createGroupId(section.id, 'removed', itemId);
      groups.push({
        id: groupId,
        kind: 'removed',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [createChangeLine(groupId, section, { kind: 'removed', name: previous?.name, itemId })],
      });
      return;
    }

    if (previousState === 'eighty' && currentState === 'hidden') {
      const groupId = createGroupId(section.id, 'removed', itemId);
      groups.push({
        id: groupId,
        kind: 'removed',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [createChangeLine(groupId, section, { kind: 'removed', name: previous?.name, itemId })],
      });
      return;
    }

    if (previousState === 'hidden' && currentState === 'active') {
      const groupId = createGroupId(section.id, 'added', itemId);
      groups.push({
        id: groupId,
        kind: 'added',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [createChangeLine(groupId, section, { kind: 'added', name: current?.name, itemId })],
      });
      unsentCurrentItemIds.add(itemId);
    }
  });

  return {
    groups,
    unsentCurrentItemIds: Array.from(unsentCurrentItemIds),
  };
}

function buildFeaturedSpecialGroupChanges(section, currentItems = [], previousItems = []) {
  const currentById = new Map(currentItems.map(item => [item.id, item]));
  const previousById = new Map(previousItems.map(item => [item.id, item]));
  const orderedIds = Array.from(new Set([
    ...currentItems.map(item => item.id),
    ...previousItems.map(item => item.id),
  ]));
  const groups = [];
  const unsentCurrentItemIds = new Set();

  orderedIds.forEach(itemId => {
    const current = currentById.get(itemId) || null;
    const previous = previousById.get(itemId) || null;
    const currentEnabled = current?.featuredEnabled === true && current?.visible;
    const previousEnabled = previous?.featuredEnabled === true && previous?.visible;

    if (!previousEnabled && currentEnabled) {
      const groupId = createGroupId(section.id, 'added', itemId);
      groups.push({
        id: groupId,
        kind: 'added',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [createChangeLine(groupId, section, { kind: 'added', name: current?.name, itemId })],
      });
      unsentCurrentItemIds.add(itemId);
      return;
    }

    if (previousEnabled && !currentEnabled) {
      const groupId = createGroupId(section.id, 'removed', itemId);
      groups.push({
        id: groupId,
        kind: 'removed',
        selectable: true,
        sectionId: section.id,
        sectionLabel: section.label,
        icon: section.icon,
        displayOrder: section.displayOrder,
        itemId: String(itemId || ''),
        lines: [createChangeLine(groupId, section, { kind: 'removed', name: previous?.name, itemId })],
      });
    }
  });

  return {
    groups,
    unsentCurrentItemIds: Array.from(unsentCurrentItemIds),
  };
}

export function buildCategoryQueueState({
  snapshot = {},
  lastSentState = {},
} = {}) {
  const categories = readSnapshotCategories(snapshot);
  const categoriesByKey = new Map(categories.map(category => [category.key, category]));
  const sectionKeys = Array.from(new Set([
    ...categories.map(category => category.key),
    ...Object.keys(lastSentState || {}).filter(Boolean),
  ]))
    .filter(categoryKey => categoryKey !== UNCATEGORIZED_KEY);

  const groups = [];
  const unsentItemIds = new Set();

  sectionKeys.forEach((sectionKey, sectionIndex) => {
    const category = categoriesByKey.get(sectionKey) || {
      key: sectionKey,
      label: sectionKey,
      icon: '',
      displayOrder: Number.MAX_SAFE_INTEGER - 1000 + sectionIndex,
      items: [],
    };
    const section = createSectionState(category, Number.MAX_SAFE_INTEGER - 1000 + sectionIndex);
    const currentItems = normalizeCurrentCategoryItems(category);
    const previousItems = normalizeBaselineCategoryItems(lastSentState, sectionKey);
    const result = isFeaturedSpecialsCategory(section)
      ? buildFeaturedSpecialGroupChanges(section, currentItems, previousItems)
      : buildCategoryGroupChanges(section, currentItems, previousItems);
    result.groups.forEach(group => groups.push(group));
    result.unsentCurrentItemIds.forEach(itemId => {
      if (itemId) unsentItemIds.add(String(itemId));
    });
  });

  const orderedGroups = groups.slice().sort((a, b) => {
    const sectionOrder = Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
    if (sectionOrder !== 0) return sectionOrder;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const sections = toSectionsFromGroups(orderedGroups);
  const notificationChanges = sections.flatMap(section => section.changes);
  const diff = toLegacyDiff(sections);

  return {
    groups: orderedGroups,
    sections,
    notificationChanges,
    diff,
    unsentItemIds: Array.from(unsentItemIds),
    hasNotificationChanges: orderedGroups.length > 0,
  };
}
