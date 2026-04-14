import { getRestaurantSpecialConfig } from './_auth.js';
import {
  MAX_NOTIFICATION_TEXT_LENGTH,
  truncateNotificationText,
} from './_notification-gateway.js';
import { deliverMenuNotification } from './_notification-delivery.js';
import {
  assertExpectedRevision,
  inferAuditSource,
  insertUpdateLog,
  patchMenuMetaForMenu,
  patchMenuMetaForMenuWithCompatibility,
  readMenuMeta,
  readRevisionState,
  saveLiveMenuForMenu,
} from './_menu-write.js';
import {
  getSupabaseServerConfig,
  serviceHeaders,
} from './_supabase.js';
import { getKnownMenuById } from './_menu-read.js';

const PREVIEW_CONTRACT = 'menu-publish-preview.v1';

function summarizeSkippedNotification() {
  return {
    results: {},
    okChannels: [],
    skippedChannels: [],
    failedChannels: [],
    anyOk: false,
    anyError: false,
    allSkipped: false,
  };
}

function createNotificationStatus(delivery, shouldNotify) {
  if (!shouldNotify) {
    return {
      ok: true,
      skipped: true,
      partial: false,
      statusCode: null,
      summary: summarizeSkippedNotification(),
      results: {},
    };
  }

  return {
    ok: delivery.status < 400,
    skipped: false,
    partial: delivery.status === 207,
    statusCode: delivery.status,
    summary: delivery.summary,
    results: delivery.results,
  };
}

function snapshotLastSentState(snapshot = {}) {
  const cats = Array.isArray(snapshot?.cats) ? snapshot.cats : [];
  return Object.fromEntries(cats.map(category => [
    category.key,
    (Array.isArray(category.items) ? category.items : []).map(item => ({
      id: item.id,
      name: item.name || '',
      desc: item.desc || '',
      recipe: Array.isArray(item.recipe) ? item.recipe : [],
      price: item.price || '',
      eightySixed: !!item.is_eighty_sixed,
      onMenu: item.on_menu !== false,
      visibility: item.visibility || 'public',
      upcharges: Array.isArray(item.upcharges) ? item.upcharges : [],
      showDescription: item.show_description !== false,
      showRecipe: !!item.show_recipe,
    })),
  ]));
}

async function readCurrentFeaturedIdsForRestaurant(restaurantId = '') {
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!config?.canonicalId) return [];

  const { sbUrl } = getSupabaseServerConfig();
  const groupRes = await fetch(
    `${sbUrl}/rest/v1/featured_groups?canonical_id=eq.${encodeURIComponent(config.canonicalId)}&select=id&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!groupRes.ok) return [];
  const groups = await groupRes.json();
  const groupId = groups?.[0]?.id;
  if (!groupId) return [];

  const slotsRes = await fetch(
    `${sbUrl}/rest/v1/featured_slots?featured_group_id=eq.${groupId}&select=item_id`,
    { headers: serviceHeaders() }
  );
  if (!slotsRes.ok) return [];
  const slots = await slotsRes.json();
  return (slots || []).map(slot => slot.item_id).filter(Boolean);
}

function collectNotificationWarnings(summary = {}) {
  if (summary.allSkipped) return ['No notification channels were enabled for this menu.'];
  if (summary.anyOk && summary.anyError) {
    return [`Some notification channels failed: ${summary.failedChannels.join(', ')}.`];
  }
  return [];
}

function normalizeName(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function createPreviewChangeId(sectionId, kind, name) {
  return `${sectionId}::${kind}::${encodeURIComponent(String(name || '').trim().toLowerCase())}`;
}

function readRestoreLabel(section = {}) {
  return String(section?.label || '').toLowerCase().includes('tap')
    ? 'Back on Tap'
    : 'Back in Stock';
}

function readSnapshotPreviewContext(snapshot = {}) {
  const context = snapshot?.preview_context && typeof snapshot.preview_context === 'object'
    ? snapshot.preview_context
    : {};
  const saveOnlyChanges = Array.isArray(context?.save_only_changes)
    ? context.save_only_changes
      .map((change, index) => {
        const id = String(change?.id || '').trim() || `save-only-${index + 1}`;
        const label = String(change?.label || '').trim();
        const message = String(change?.message || '').trim();
        if (!label && !message) return null;
        return { id, label, message };
      })
      .filter(Boolean)
    : [];
  return {
    hasLocalDraft: !!context?.dirty,
    hasSharedDraft: !!context?.has_shared_draft,
    saveOnlyChanges,
  };
}

function readSnapshotCategories(snapshot = {}) {
  const cats = Array.isArray(snapshot?.cats) ? snapshot.cats : [];
  return cats
    .map((category, categoryIndex) => ({
      key: String(category?.key || '').trim(),
      label: String(category?.label || '').trim(),
      icon: String(category?.icon || ''),
      displayOrder: Number.isFinite(Number(category?.display_order))
        ? Number(category.display_order)
        : categoryIndex,
      items: Array.isArray(category?.items) ? category.items : [],
    }))
    .filter(category => category.key && category.key !== '__uncategorized__');
}

function isVisibleItem(item = {}) {
  const onMenu = item?.on_menu !== false && item?.onMenu !== false;
  const visibility = String(item?.visibility || 'public');
  return onMenu && visibility !== 'off_menu';
}

function isEightySixed(item = {}) {
  return !!(item?.is_eighty_sixed ?? item?.eightySixed);
}

function buildCategoryDiff(category, lastSentItems = []) {
  const lastByName = new Map();
  const currentNames = [];
  const lastNames = [];
  const currentSet = new Set();
  const lastSet = new Set();
  const eightySixed = [];
  const restored = [];
  const eightySixedNames = new Set();
  const restoredNames = new Set();

  (Array.isArray(lastSentItems) ? lastSentItems : []).forEach(item => {
    const name = normalizeName(item?.name);
    if (!name) return;
    const key = name.toLowerCase();
    lastByName.set(key, item);
    if (isVisibleItem(item) && !isEightySixed(item)) {
      lastNames.push(name);
      lastSet.add(key);
    }
  });

  category.items.forEach(item => {
    const name = normalizeName(item?.name);
    if (!name) return;
    const key = name.toLowerCase();
    const isVisible = isVisibleItem(item);
    const previous = lastByName.get(key);

    if (isVisible && previous && isVisibleItem(previous)) {
      if (!isEightySixed(previous) && isEightySixed(item)) {
        eightySixed.push(name);
        eightySixedNames.add(key);
      }
      if (isEightySixed(previous) && !isEightySixed(item)) {
        restored.push(name);
        restoredNames.add(key);
      }
    }

    if (isVisible && !isEightySixed(item)) {
      currentNames.push(name);
      currentSet.add(key);
    }
  });

  const added = currentNames.filter(name => !lastSet.has(name.toLowerCase()) && !restoredNames.has(name.toLowerCase()));
  const removed = lastNames.filter(name => !currentSet.has(name.toLowerCase()) && !eightySixedNames.has(name.toLowerCase()));
  if (!added.length && !removed.length && !eightySixed.length && !restored.length) return null;
  return {
    id: category.key,
    icon: category.icon || '',
    label: category.label || category.key,
    added,
    removed,
    eightySixed,
    restored,
    displayOrder: category.displayOrder,
  };
}

function buildNotificationSections(diff = []) {
  return diff
    .map(section => {
      const changes = [];
      (section.added || []).forEach(name => {
        changes.push({
          id: createPreviewChangeId(section.id, 'added', name),
          kind: 'added',
          text: `+ ${name}`,
          name,
          sectionId: section.id,
          sectionLabel: section.label,
          icon: section.icon,
        });
      });
      (section.removed || []).forEach(name => {
        changes.push({
          id: createPreviewChangeId(section.id, 'removed', name),
          kind: 'removed',
          text: `- ${name}`,
          name,
          sectionId: section.id,
          sectionLabel: section.label,
          icon: section.icon,
        });
      });
      (section.eightySixed || []).forEach(name => {
        changes.push({
          id: createPreviewChangeId(section.id, 'eightySixed', name),
          kind: 'eightySixed',
          text: `86'd: ${name}`,
          name,
          sectionId: section.id,
          sectionLabel: section.label,
          icon: section.icon,
        });
      });
      (section.restored || []).forEach(name => {
        changes.push({
          id: createPreviewChangeId(section.id, 'restored', name),
          kind: 'restored',
          text: `${readRestoreLabel(section)}: ${name}`,
          name,
          sectionId: section.id,
          sectionLabel: section.label,
          icon: section.icon,
        });
      });
      return { ...section, changes };
    })
    .filter(section => section.changes.length > 0);
}

function groupNotificationChangesBySection(changes = []) {
  const sections = new Map();
  (changes || []).forEach(change => {
    if (!sections.has(change.sectionId)) {
      sections.set(change.sectionId, {
        id: change.sectionId,
        icon: change.icon,
        label: change.sectionLabel,
        changes: [],
      });
    }
    sections.get(change.sectionId).changes.push(change);
  });
  return Array.from(sections.values());
}

function serializeNotificationSectionsForLog(sections = []) {
  return (sections || []).map(section => ({
    id: section.id,
    icon: section.icon,
    label: section.label,
    added: (section.changes || []).filter(change => change.kind === 'added').map(change => change.name),
    removed: (section.changes || []).filter(change => change.kind === 'removed').map(change => change.name),
    eightySixed: (section.changes || []).filter(change => change.kind === 'eightySixed').map(change => change.name),
    restored: (section.changes || []).filter(change => change.kind === 'restored').map(change => change.name),
  }));
}

function buildPatchMessage(sections = [], { menuName = '', menuLink = '', now = new Date() } = {}) {
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const menuLabel = menuName ? menuName.toUpperCase() : 'MENU';
  const lines = [`🔥 ${menuLabel} UPDATES - ${dateStr} ${timeStr}`, ''];

  (sections || []).forEach(section => {
    lines.push(`${section.icon} ${String(section.label || '').toUpperCase()}`);
    (section.changes || []).forEach(change => {
      const cleanName = normalizeName(change.name);
      if (change.kind === 'added') lines.push(`  ✅ + ${cleanName}`);
      if (change.kind === 'removed') lines.push(`  ❌ - ${cleanName}`);
      if (change.kind === 'eightySixed') lines.push(`  🚫 86'd: ${cleanName}`);
      if (change.kind === 'restored') lines.push(`  ✅ ${readRestoreLabel(section)}: ${cleanName}`);
    });
    lines.push('');
  });

  if (menuLink) lines.push(`📋 Full menu: ${menuLink}`);
  return lines.join('\n').trim();
}

async function readItemNamesByIds(itemIds = []) {
  const uniqueIds = Array.from(new Set((itemIds || []).filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const { sbUrl } = getSupabaseServerConfig();
  const params = new URLSearchParams();
  params.set('select', 'id,name');
  params.set('id', `in.(${uniqueIds.map(id => `"${String(id).replace(/"/g, '')}"`).join(',')})`);
  const response = await fetch(`${sbUrl}/rest/v1/items?${params.toString()}`, { headers: serviceHeaders() });
  if (!response.ok) return new Map();
  const rows = await response.json();
  return new Map((Array.isArray(rows) ? rows : []).map(row => [row.id, normalizeName(row?.name)]));
}

async function computeFeaturedDiffForMenu(knownMenu, meta = {}) {
  const restaurantId = knownMenu?.restaurantId || '';
  if (!restaurantId) return { diff: null, currentFeaturedIds: [] };

  const currentFeaturedIds = await readCurrentFeaturedIdsForRestaurant(restaurantId);
  const lastSentFeaturedIds = Array.isArray(meta?.last_sent_featured)
    ? meta.last_sent_featured.filter(Boolean)
    : [];
  const currentSet = new Set(currentFeaturedIds);
  const lastSet = new Set(lastSentFeaturedIds);
  const addedIds = currentFeaturedIds.filter(id => !lastSet.has(id));
  const removedIds = lastSentFeaturedIds.filter(id => !currentSet.has(id));
  if (!addedIds.length && !removedIds.length) {
    return { diff: null, currentFeaturedIds };
  }

  const namesById = await readItemNamesByIds([...addedIds, ...removedIds]);
  const config = getRestaurantSpecialConfig(restaurantId);
  const label = String(config?.name || 'Featured');

  return {
    currentFeaturedIds,
    diff: {
      id: '__featured__',
      icon: '⭐',
      label,
      added: addedIds.map(itemId => namesById.get(itemId) || '(featured item)'),
      removed: removedIds.map(itemId => namesById.get(itemId) || '(removed item)'),
      eightySixed: [],
      restored: [],
      displayOrder: Number.MAX_SAFE_INTEGER,
    },
  };
}

function mapLegacySelectionToIds(legacySections = [], notificationChanges = []) {
  const byKey = new Set();
  (Array.isArray(legacySections) ? legacySections : []).forEach(section => {
    const sectionId = String(section?.id || '').trim();
    if (!sectionId) return;
    (Array.isArray(section?.added) ? section.added : []).forEach(name => {
      byKey.add(`${sectionId}::added::${String(name || '').trim().toLowerCase()}`);
    });
    (Array.isArray(section?.removed) ? section.removed : []).forEach(name => {
      byKey.add(`${sectionId}::removed::${String(name || '').trim().toLowerCase()}`);
    });
    (Array.isArray(section?.eightySixed) ? section.eightySixed : []).forEach(name => {
      byKey.add(`${sectionId}::eightySixed::${String(name || '').trim().toLowerCase()}`);
    });
    (Array.isArray(section?.restored) ? section.restored : []).forEach(name => {
      byKey.add(`${sectionId}::restored::${String(name || '').trim().toLowerCase()}`);
    });
  });

  if (!byKey.size) return [];
  return (notificationChanges || [])
    .filter(change => byKey.has(`${change.sectionId}::${change.kind}::${String(change.name || '').trim().toLowerCase()}`))
    .map(change => change.id);
}

function resolveSelectedChanges(preview, selectedChangeIds = null, legacySelectedSections = []) {
  const notificationChanges = Array.isArray(preview?.notificationChanges) ? preview.notificationChanges : [];
  if (!notificationChanges.length) return [];

  if (Array.isArray(selectedChangeIds)) {
    const selectedSet = new Set(selectedChangeIds.map(changeId => String(changeId || '').trim()).filter(Boolean));
    return notificationChanges.filter(change => selectedSet.has(change.id));
  }

  const legacySelectedIds = mapLegacySelectionToIds(legacySelectedSections, notificationChanges);
  if (legacySelectedIds.length) {
    const selectedSet = new Set(legacySelectedIds);
    return notificationChanges.filter(change => selectedSet.has(change.id));
  }

  return notificationChanges.slice();
}

async function buildCanonicalPreviewForMenu({
  snapshot = {},
  meta = {},
  knownMenu = null,
}) {
  const snapshotCategories = readSnapshotCategories(snapshot);
  const lastSentState = meta?.last_sent_state && typeof meta.last_sent_state === 'object'
    ? meta.last_sent_state
    : {};
  const diff = [];

  snapshotCategories.forEach(category => {
    const sectionDiff = buildCategoryDiff(category, lastSentState[category.key] || []);
    if (sectionDiff) diff.push(sectionDiff);
  });

  const featuredResult = await computeFeaturedDiffForMenu(knownMenu, meta);
  if (featuredResult.diff) diff.push(featuredResult.diff);
  diff.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const sections = buildNotificationSections(diff);
  const notificationChanges = sections.flatMap(section => section.changes);
  const previewContext = readSnapshotPreviewContext(snapshot);
  const hasNotificationChanges = notificationChanges.length > 0;
  const hasSaveOnlyChanges = previewContext.saveOnlyChanges.length > 0;
  const mode = (previewContext.hasLocalDraft || previewContext.hasSharedDraft)
    ? 'save'
    : (hasNotificationChanges ? 'update-only' : 'save');
  const patchMessage = hasNotificationChanges
    ? buildPatchMessage(groupNotificationChangesBySection(notificationChanges), {
      menuName: knownMenu?.name || '',
      menuLink: String(meta?.notifications?.menu_url || '').trim(),
    })
    : '';

  return {
    mode,
    hasChanges: hasNotificationChanges || hasSaveOnlyChanges,
    hasLocalDraft: previewContext.hasLocalDraft,
    hasSharedDraft: previewContext.hasSharedDraft,
    hasNotificationChanges,
    hasSaveOnlyChanges,
    diff,
    sections,
    notificationChanges,
    saveOnlyChanges: previewContext.saveOnlyChanges,
    patchMessage,
    truncated: patchMessage.length > MAX_NOTIFICATION_TEXT_LENGTH,
    selectionDefaults: notificationChanges.map(change => change.id),
    metadata: {
      serverOwned: true,
      contract: PREVIEW_CONTRACT,
      currentFeaturedIds: featuredResult.currentFeaturedIds,
    },
  };
}

function assertPublishRevisions({
  expectedLiveRevision,
  expectedDraftRevision,
  meta,
  menuId,
}) {
  const currentRevisions = readRevisionState(meta);
  assertExpectedRevision(expectedLiveRevision, meta?.last_updated_ts || null, 'live_revision', {
    menuId,
    command: 'menu-publish.v1',
    currentRevisions,
  });
  assertExpectedRevision(expectedDraftRevision, meta?.draft_saved_ts || null, 'draft_revision', {
    menuId,
    command: 'menu-publish.v1',
    currentRevisions,
  });
  return currentRevisions;
}

export async function previewMenuUpdateForMenu({
  actor,
  menuId,
  source,
  snapshot = {},
  expectedLiveRevision = null,
  expectedDraftRevision = null,
}) {
  void actor;
  void source;
  const knownMenu = getKnownMenuById(menuId);
  if (!knownMenu) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const meta = await readMenuMeta(menuId);
  const currentRevisions = assertPublishRevisions({
    expectedLiveRevision,
    expectedDraftRevision,
    meta,
    menuId,
  });
  const preview = await buildCanonicalPreviewForMenu({
    snapshot,
    meta,
    knownMenu,
  });

  return {
    ok: true,
    action: 'preview',
    preview,
    current_revisions: currentRevisions,
    reconnect: null,
    compatibility: {
      contract: PREVIEW_CONTRACT,
      serverOwned: true,
    },
  };
}

export async function publishMenuUpdateForMenu({
  actor,
  menuId,
  mode,
  source,
  snapshot = {},
  selectedChangeIds = null,
  legacySelectedSections = [],
  expectedLiveRevision = null,
  expectedDraftRevision = null,
}) {
  const knownMenu = getKnownMenuById(menuId);
  if (!knownMenu) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const meta = await readMenuMeta(menuId);
  const currentRevisions = assertPublishRevisions({
    expectedLiveRevision,
    expectedDraftRevision,
    meta,
    menuId,
  });
  const preview = await buildCanonicalPreviewForMenu({
    snapshot,
    meta,
    knownMenu,
  });
  const selectedChanges = resolveSelectedChanges(preview, selectedChangeIds, legacySelectedSections);
  const selectedSections = groupNotificationChangesBySection(selectedChanges);
  const patchMessage = selectedSections.length
    ? buildPatchMessage(selectedSections, {
      menuName: knownMenu?.name || '',
      menuLink: String(meta?.notifications?.menu_url || '').trim(),
    })
    : '';

  const publishMode = ['save', 'save-and-update', 'update-only'].includes(mode) ? mode : preview.mode;
  const shouldPersistLive = publishMode !== 'update-only';
  const shouldNotify = (publishMode === 'save-and-update' || publishMode === 'update-only') && selectedSections.length > 0;
  const liveTs = Date.now();
  const normalizedSource = inferAuditSource(actor, source);

  if (shouldPersistLive) {
    await saveLiveMenuForMenu({
      menuId,
      snapshot,
      expectedLiveRevision,
      actor,
    });
  }

  const notificationStatus = shouldNotify
    ? createNotificationStatus(await deliverMenuNotification(menuId, truncateNotificationText(patchMessage)), true)
    : createNotificationStatus(null, false);

  const warnings = [];
  if (notificationStatus.partial) {
    warnings.push(...collectNotificationWarnings(notificationStatus.summary));
    warnings.push('Some channels did not receive the update. The lines remain ready to send again.');
    return {
      ok: true,
      ts: liveTs,
      preview,
      current_revisions: currentRevisions,
      notificationStatus,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: `✅ ${knownMenu.name || 'Menu'} saved live. Update still needs attention.`,
      selected_change_ids: selectedChanges.map(change => change.id),
      compatibility: {
        contract: PREVIEW_CONTRACT,
        serverOwned: true,
      },
    };
  }

  if (shouldNotify && !notificationStatus.ok) {
    warnings.push('Update could not be sent.');
    return {
      ok: true,
      ts: liveTs,
      preview,
      current_revisions: currentRevisions,
      notificationStatus,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: `✅ ${knownMenu.name || 'Menu'} saved live. Update still needs to be sent.`,
      selected_change_ids: selectedChanges.map(change => change.id),
      compatibility: {
        contract: PREVIEW_CONTRACT,
        serverOwned: true,
      },
    };
  }

  warnings.push(...collectNotificationWarnings(notificationStatus.summary));
  const ts = liveTs;
  const currentFeaturedIds = Array.isArray(preview?.metadata?.currentFeaturedIds)
    ? preview.metadata.currentFeaturedIds
    : await readCurrentFeaturedIdsForRestaurant(knownMenu.restaurantId);
  const siblingMenuIds = (getRestaurantSpecialConfig(knownMenu.restaurantId)?.menuIds || [])
    .filter(candidateId => candidateId && candidateId !== menuId);
  const lastSentState = snapshotLastSentState(snapshot);

  if (publishMode === 'save') {
    const metaCompatibility = await patchMenuMetaForMenuWithCompatibility(menuId, {
      last_updated_ts: ts,
      draft_state: {},
      draft_saved_ts: null,
      draft_saved_by_user_id: null,
      draft_saved_by_name: '',
      draft_saved_source: '',
    }, {
      optionalFields: ['draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
    });
    return {
      ok: true,
      ts,
      preview,
      current_revisions: {
        ...currentRevisions,
        live_revision: ts,
      },
      notificationStatus: null,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: `✅ ${knownMenu.name || 'Menu'} saved to the live menu.`,
      selected_change_ids: selectedChanges.map(change => change.id),
      compatibility: {
        contract: PREVIEW_CONTRACT,
        serverOwned: true,
        downgradedFields: metaCompatibility.downgradedFields,
        sourceStamped: !metaCompatibility.downgradedFields.includes('draft_saved_source'),
      },
    };
  }

  const [metaCompatibility] = await Promise.all([
    patchMenuMetaForMenuWithCompatibility(menuId, {
      last_updated_ts: ts,
      last_sent_ts: ts,
      last_sent_state: lastSentState,
      last_sent_categories: Array.isArray(preview?.diff) ? preview.diff.map(section => section.id).filter(Boolean) : [],
      last_sent_featured: currentFeaturedIds,
      draft_state: shouldPersistLive ? {} : meta?.draft_state || {},
      draft_saved_ts: shouldPersistLive ? null : meta?.draft_saved_ts || null,
      draft_saved_by_user_id: shouldPersistLive ? null : (meta?.draft_saved_by_user_id ?? undefined),
      draft_saved_by_name: shouldPersistLive ? '' : (meta?.draft_saved_by_name ?? undefined),
      draft_saved_source: shouldPersistLive ? '' : (meta?.draft_saved_source ?? undefined),
    }, {
      optionalFields: ['last_sent_featured', 'draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
    }),
    ...siblingMenuIds.map(candidateId => patchMenuMetaForMenu(candidateId, {
      last_sent_featured: currentFeaturedIds,
    })),
  ]);

  let logCompatibility = { downgradedFields: [] };
  if (patchMessage) {
    logCompatibility = await insertUpdateLog({
      menuId,
      actor,
      diff: serializeNotificationSectionsForLog(selectedSections),
      message: patchMessage,
      source: normalizedSource,
    });
  }

  return {
    ok: true,
    ts,
    preview,
    current_revisions: {
      ...currentRevisions,
      live_revision: ts,
      last_sent_revision: ts,
      draft_revision: shouldPersistLive ? null : currentRevisions.draft_revision,
    },
    notificationStatus: shouldNotify ? notificationStatus : null,
    warnings,
    warningMessage: warnings[0] || '',
    successMessage: shouldNotify
      ? `✅ ${knownMenu.name || 'Menu'} saved and sent!`
      : `✅ ${knownMenu.name || 'Menu'} update list cleared without notifying channels.`,
    selected_change_ids: selectedChanges.map(change => change.id),
    compatibility: {
      contract: PREVIEW_CONTRACT,
      serverOwned: true,
      downgradedFields: [
        ...(Array.isArray(metaCompatibility?.downgradedFields) ? metaCompatibility.downgradedFields : []),
        ...(Array.isArray(logCompatibility?.downgradedFields) ? logCompatibility.downgradedFields : []),
      ],
      sourceStamped: !Array.isArray(logCompatibility?.downgradedFields) || !logCompatibility.downgradedFields.includes('source'),
    },
  };
}
