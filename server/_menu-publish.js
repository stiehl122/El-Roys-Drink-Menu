import { randomUUID } from 'node:crypto';

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
import {
  getKnownMenuById,
  readCurrentFeaturedIdsForRestaurant,
} from './_menu-read.js';
import { assertCategoryGovernanceAllowed } from './_category-governance.js';
import {
  buildCategoryQueueState,
  normalizeName,
} from './_menu-queue.js';

const PREVIEW_CONTRACT = 'menu-publish-preview.v2';

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

function collectNotificationWarnings(summary = {}) {
  if (summary.allSkipped) return ['No notification channels were enabled for this menu.'];
  if (summary.anyOk && summary.anyError) {
    return [`Some notification channels failed: ${summary.failedChannels.join(', ')}.`];
  }
  return [];
}

function snapshotLastSentState(snapshot = {}) {
  const cats = Array.isArray(snapshot?.cats) ? snapshot.cats : [];
  return Object.fromEntries(cats.map(category => [
    category.key,
    (Array.isArray(category.items) ? category.items : []).map(item => ({
      id: item.id,
      name: item.name || '',
      eightySixed: !!item.is_eighty_sixed,
      onMenu: item.on_menu !== false,
      visibility: item.visibility || 'public',
    })),
  ]));
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
    hasLegacySharedDraft: !!context?.has_shared_draft,
    saveOnlyChanges,
  };
}

function groupNotificationChangesBySection(changes = []) {
  const sections = new Map();
  (changes || []).forEach(change => {
    const sectionId = String(change?.sectionId || '').trim();
    if (!sectionId) return;
    if (!sections.has(sectionId)) {
      sections.set(sectionId, {
        id: sectionId,
        icon: change.icon || '',
        label: change.sectionLabel || sectionId,
        displayOrder: Number.isFinite(Number(change?.displayOrder))
          ? Number(change.displayOrder)
          : Number.MAX_SAFE_INTEGER,
        changes: [],
      });
    }
    const section = sections.get(sectionId);
    if (Number.isFinite(Number(change?.displayOrder))) {
      section.displayOrder = Math.min(section.displayOrder, Number(change.displayOrder));
    }
    section.changes.push(change);
  });
  return Array.from(sections.values())
    .sort((a, b) => a.displayOrder - b.displayOrder || String(a.id || '').localeCompare(String(b.id || '')));
}

function serializeNotificationSectionsForLog(sections = []) {
  return (sections || []).map(section => ({
    id: section.id,
    icon: section.icon,
    label: section.label,
    displayOrder: Number.isFinite(Number(section.displayOrder)) ? Number(section.displayOrder) : 0,
    added: (section.changes || []).filter(change => change.kind === 'added').map(change => change.name),
    removed: (section.changes || []).filter(change => change.kind === 'removed').map(change => change.name),
    eightySixed: (section.changes || []).filter(change => change.kind === 'eightySixed').map(change => change.name),
    restored: (section.changes || []).filter(change => change.kind === 'restored').map(change => change.name),
  }));
}

function serializeSaveOnlyChangesForLog(saveOnlyChanges = []) {
  const names = (Array.isArray(saveOnlyChanges) ? saveOnlyChanges : [])
    .map(change => change?.label || change?.message || '')
    .map(label => String(label || '').trim())
    .filter(Boolean);
  if (!names.length) return [];
  return [{
    id: '__save_only__',
    icon: '💾',
    label: 'Will Save Only',
    added: names,
    removed: [],
    eightySixed: [],
    restored: [],
  }];
}

function buildPatchMessage(sections = [], { menuName = '', menuLink = '', now = new Date() } = {}) {
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const menuLabel = menuName ? menuName.toUpperCase() : 'MENU';
  const lines = [`🔥 ${menuLabel} UPDATES - ${dateStr} ${timeStr}`, ''];

  (sections || []).forEach(section => {
    lines.push(`${section.icon} ${String(section.label || '').toUpperCase()}`);
    (section.changes || []).forEach(change => {
      if (change.kind === 'added') lines.push(`  ✅ Added ${normalizeName(change.name)}`);
      if (change.kind === 'removed') lines.push(`  ❌ Removed ${normalizeName(change.name)}`);
      if (change.kind === 'eightySixed') lines.push(`  🚫 86'd ${normalizeName(change.name)}`);
      if (change.kind === 'restored') lines.push(`  ✅ ${String(change.text || '').trim()}`);
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

function createFeaturedChangeLine(groupId, section, kind, itemId, name) {
  const normalizedName = normalizeName(name);
  const text = kind === 'added'
    ? `Added ${normalizedName}`
    : `Removed ${normalizedName}`;
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
    displayOrder: Number.isFinite(Number(section?.displayOrder))
      ? Number(section.displayOrder)
      : Number.MAX_SAFE_INTEGER,
  };
}

async function buildFeaturedQueueState(knownMenu = null, meta = {}) {
  const restaurantId = knownMenu?.restaurantId || '';
  if (!restaurantId) {
    return {
      currentFeaturedIds: [],
      groups: [],
      sections: [],
      notificationChanges: [],
      diff: [],
      unsentItemIds: [],
    };
  }

  const currentFeaturedIds = await readCurrentFeaturedIdsForRestaurant(restaurantId);
  const lastSentFeaturedIds = Array.isArray(meta?.last_sent_featured)
    ? meta.last_sent_featured.filter(Boolean)
    : [];
  const currentSet = new Set(currentFeaturedIds);
  const lastSet = new Set(lastSentFeaturedIds);
  const addedIds = currentFeaturedIds.filter(id => !lastSet.has(id));
  const removedIds = lastSentFeaturedIds.filter(id => !currentSet.has(id));
  if (!addedIds.length && !removedIds.length) {
    return {
      currentFeaturedIds,
      groups: [],
      sections: [],
      notificationChanges: [],
      diff: [],
      unsentItemIds: [],
    };
  }

  const config = getRestaurantSpecialConfig(restaurantId);
  const namesById = await readItemNamesByIds([...addedIds, ...removedIds]);
  const section = {
    id: '__featured__',
    icon: '⭐',
    label: String(config?.name || 'Featured'),
    displayOrder: Number.MAX_SAFE_INTEGER - 500,
  };
  const groups = [];

  addedIds.forEach(itemId => {
    const groupId = `${section.id}::added::${encodeURIComponent(String(itemId || '').trim())}`;
    groups.push({
      id: groupId,
      kind: 'added',
      selectable: true,
      sectionId: section.id,
      sectionLabel: section.label,
      icon: section.icon,
      itemId: String(itemId || ''),
      lines: [createFeaturedChangeLine(groupId, section, 'added', itemId, namesById.get(itemId) || '(featured item)')],
    });
  });
  removedIds.forEach(itemId => {
    const groupId = `${section.id}::removed::${encodeURIComponent(String(itemId || '').trim())}`;
    groups.push({
      id: groupId,
      kind: 'removed',
      selectable: true,
      sectionId: section.id,
      sectionLabel: section.label,
      icon: section.icon,
      itemId: String(itemId || ''),
      lines: [createFeaturedChangeLine(groupId, section, 'removed', itemId, namesById.get(itemId) || '(removed featured item)')],
    });
  });

  const notificationChanges = groups.flatMap(group => group.lines);
  const sections = groupNotificationChangesBySection(notificationChanges);
  const diff = serializeNotificationSectionsForLog(sections);

  return {
    currentFeaturedIds,
    groups,
    sections,
    notificationChanges,
    diff,
    unsentItemIds: [...addedIds],
  };
}

function buildSectionsByOutcome({
  preview = {},
  selectedGroupIds = [],
} = {}) {
  const selectableGroups = Array.isArray(preview?.changeGroups)
    ? preview.changeGroups.filter(group => group?.selectable)
    : [];
  const defaultIds = selectableGroups.map(group => group.id);
  const selectedIds = selectedGroupIds.length ? selectedGroupIds : defaultIds;
  const selectedSet = new Set(selectedIds.map(id => String(id || '').trim()).filter(Boolean));
  const notificationChanges = Array.isArray(preview?.notificationChanges) ? preview.notificationChanges : [];
  const selectedLines = notificationChanges.filter(change => selectedSet.has(String(change?.groupId || '').trim()));
  const clearLines = notificationChanges.filter(change => (
    !selectedSet.has(String(change?.groupId || '').trim()) &&
    defaultIds.includes(String(change?.groupId || '').trim())
  ));

  return {
    willSend: groupNotificationChangesBySection(selectedLines),
    willClearWithoutSending: groupNotificationChangesBySection(clearLines),
    willSaveOnly: Array.isArray(preview?.saveOnlyChanges) ? preview.saveOnlyChanges : [],
  };
}

function mapLegacySelectionToLineIds(legacySections = [], notificationChanges = []) {
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

function resolveSelection(preview, selectedChangeIds = null, legacySelectedSections = []) {
  const groups = Array.isArray(preview?.changeGroups) ? preview.changeGroups : [];
  const selectableGroups = groups.filter(group => group?.selectable);
  if (!selectableGroups.length) {
    return {
      selectedGroups: [],
      selectedGroupIds: [],
      selectedLines: [],
      clearGroups: [],
      clearLines: [],
    };
  }

  const groupById = new Map(selectableGroups.map(group => [String(group.id), group]));
  const lineToGroupId = new Map();
  selectableGroups.forEach(group => {
    (Array.isArray(group?.lines) ? group.lines : []).forEach(line => {
      lineToGroupId.set(String(line?.id || ''), String(group.id));
    });
  });

  let selectedSet = null;
  if (Array.isArray(selectedChangeIds)) {
    selectedSet = new Set();
    selectedChangeIds
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .forEach(id => {
        if (groupById.has(id)) {
          selectedSet.add(id);
          return;
        }
        const groupId = lineToGroupId.get(id);
        if (groupId) selectedSet.add(groupId);
      });
  } else {
    const legacyLineIds = mapLegacySelectionToLineIds(legacySelectedSections, preview?.notificationChanges || []);
    if (legacyLineIds.length) {
      selectedSet = new Set();
      legacyLineIds.forEach(lineId => {
        const groupId = lineToGroupId.get(String(lineId || '').trim());
        if (groupId) selectedSet.add(groupId);
      });
    }
  }

  if (!selectedSet) {
    selectedSet = new Set(selectableGroups.map(group => String(group.id)));
  }

  const selectedGroups = selectableGroups.filter(group => selectedSet.has(String(group.id)));
  const clearGroups = selectableGroups.filter(group => !selectedSet.has(String(group.id)));
  const selectedLines = selectedGroups.flatMap(group => group.lines || []);
  const clearLines = clearGroups.flatMap(group => group.lines || []);

  return {
    selectedGroups,
    selectedGroupIds: selectedGroups.map(group => group.id),
    selectedLines,
    clearGroups,
    clearLines,
  };
}

function mergeQueueStates(categoryState = {}, featuredState = {}) {
  const changeGroups = [
    ...(Array.isArray(categoryState?.groups) ? categoryState.groups : []),
    ...(Array.isArray(featuredState?.groups) ? featuredState.groups : []),
  ];
  const notificationChanges = changeGroups.flatMap(group => group.lines || []);
  const sections = groupNotificationChangesBySection(notificationChanges);
  const diff = serializeNotificationSectionsForLog(sections);
  const unsentItemIds = Array.from(new Set([
    ...(Array.isArray(categoryState?.unsentItemIds) ? categoryState.unsentItemIds : []),
    ...(Array.isArray(featuredState?.unsentItemIds) ? featuredState.unsentItemIds : []),
  ]));

  return {
    changeGroups,
    notificationChanges,
    sections,
    diff,
    unsentItemIds,
  };
}

async function buildCanonicalPreviewForMenu({
  snapshot = {},
  meta = {},
  knownMenu = null,
}) {
  const lastSentState = meta?.last_sent_state && typeof meta.last_sent_state === 'object'
    ? meta.last_sent_state
    : {};
  const categoryState = buildCategoryQueueState({
    snapshot,
    lastSentState,
  });
  const featuredState = await buildFeaturedQueueState(knownMenu, meta);
  const queueState = mergeQueueStates(categoryState, featuredState);
  const previewContext = readSnapshotPreviewContext(snapshot);
  const hasNotificationChanges = queueState.changeGroups.length > 0;
  const hasSaveOnlyChanges = previewContext.saveOnlyChanges.length > 0;
  const mode = previewContext.hasLocalDraft
    ? (hasNotificationChanges ? 'save-and-send' : 'save')
    : (hasNotificationChanges ? 'send' : 'save');
  const patchMessage = hasNotificationChanges
    ? buildPatchMessage(queueState.sections, {
      menuName: knownMenu?.name || '',
      menuLink: String(meta?.notifications?.menu_url || '').trim(),
    })
    : '';
  const selectionDefaults = queueState.changeGroups
    .filter(group => group?.selectable)
    .map(group => group.id);

  const preview = {
    mode,
    hasChanges: hasNotificationChanges || hasSaveOnlyChanges,
    hasLocalDraft: previewContext.hasLocalDraft,
    hasLegacySharedDraft: previewContext.hasLegacySharedDraft,
    hasNotificationChanges,
    hasSaveOnlyChanges,
    diff: queueState.diff,
    sections: queueState.sections,
    notificationChanges: queueState.notificationChanges,
    changeGroups: queueState.changeGroups,
    saveOnlyChanges: previewContext.saveOnlyChanges,
    patchMessage,
    truncated: patchMessage.length > MAX_NOTIFICATION_TEXT_LENGTH,
    selectionDefaults,
    legacySelectionDefaults: queueState.notificationChanges.map(change => change.id),
    metadata: {
      serverOwned: true,
      contract: PREVIEW_CONTRACT,
      currentFeaturedIds: featuredState.currentFeaturedIds,
      unsentItemIds: queueState.unsentItemIds,
    },
  };
  preview.sectionsByOutcome = buildSectionsByOutcome({ preview, selectedGroupIds: selectionDefaults });
  return preview;
}

function assertPublishRevisions({
  expectedLiveRevision,
  expectedDraftRevision,
  expectedNotificationRevision,
  meta,
  menuId,
}) {
  const currentRevisions = readRevisionState(meta);
  const notificationBaselineRevision = expectedNotificationRevision ?? expectedDraftRevision ?? null;
  assertExpectedRevision(expectedLiveRevision, meta?.last_updated_ts || null, 'live_revision', {
    menuId,
    command: 'menu-publish.v2',
    currentRevisions,
  });
  assertExpectedRevision(notificationBaselineRevision, meta?.last_sent_ts || null, 'notification_revision', {
    menuId,
    command: 'menu-publish.v2',
    currentRevisions,
  });
  return currentRevisions;
}

function normalizePublishMode(mode = '', previewMode = 'save') {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'save') return 'save';
  if (normalized === 'save-only') return 'save';
  if (normalized === 'save-and-send') return 'save-and-send';
  if (normalized === 'save-and-update') return 'save-and-send';
  if (normalized === 'send') return 'send';
  if (normalized === 'update-only') return 'send';
  return normalizePublishMode(previewMode || 'save', 'save');
}

function mergeDowngradedFields(...compatResults) {
  const merged = [];
  compatResults.forEach(result => {
    (Array.isArray(result?.downgradedFields) ? result.downgradedFields : []).forEach(field => {
      if (!merged.includes(field)) merged.push(field);
    });
  });
  return merged;
}

async function appendHistoryEvent({
  menuId,
  actor,
  source,
  operationId,
  eventType,
  sections = [],
  message = '',
}) {
  if (!message) return { downgradedFields: [] };
  return insertUpdateLog({
    menuId,
    actor,
    diff: serializeNotificationSectionsForLog(sections),
    message,
    source,
    operationId,
    eventType,
  });
}

export async function previewMenuUpdateForMenu({
  actor,
  menuId,
  source,
  snapshot = {},
  expectedLiveRevision = null,
  expectedDraftRevision = null,
  expectedNotificationRevision = null,
}) {
  void actor;
  void source;
  const knownMenu = getKnownMenuById(menuId);
  if (!knownMenu) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  await assertCategoryGovernanceAllowed({
    actor,
    menuId,
    snapshot,
  });

  const meta = await readMenuMeta(menuId);
  const currentRevisions = assertPublishRevisions({
    expectedLiveRevision,
    expectedDraftRevision,
    expectedNotificationRevision,
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
  expectedNotificationRevision = null,
}) {
  const knownMenu = getKnownMenuById(menuId);
  if (!knownMenu) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  await assertCategoryGovernanceAllowed({
    actor,
    menuId,
    snapshot,
  });

  const meta = await readMenuMeta(menuId);
  const currentRevisions = assertPublishRevisions({
    expectedLiveRevision,
    expectedDraftRevision,
    expectedNotificationRevision,
    meta,
    menuId,
  });
  const preview = await buildCanonicalPreviewForMenu({
    snapshot,
    meta,
    knownMenu,
  });
  const selection = resolveSelection(preview, selectedChangeIds, legacySelectedSections);
  const selectedSections = groupNotificationChangesBySection(selection.selectedLines);
  const clearSections = groupNotificationChangesBySection(selection.clearLines);
  const selectedPatchMessage = selectedSections.length
    ? buildPatchMessage(selectedSections, {
      menuName: knownMenu?.name || '',
      menuLink: String(meta?.notifications?.menu_url || '').trim(),
    })
    : '';
  const publishMode = normalizePublishMode(mode, preview.mode);
  const shouldPersistLive = publishMode !== 'send';
  const shouldNotify = (publishMode === 'save-and-send' || publishMode === 'send') && selectedSections.length > 0;
  const shouldAdvanceQueueBaseline = (publishMode === 'save-and-send' || publishMode === 'send') && (
    selectedSections.length > 0 || clearSections.length > 0
  );
  const ts = Date.now();
  const normalizedSource = inferAuditSource(actor, source);
  const operationId = randomUUID();
  const warnings = [];
  const historyCompat = [];

  if (shouldPersistLive) {
    await saveLiveMenuForMenu({
      menuId,
      snapshot,
      expectedLiveRevision,
      actor,
    });
  }

  const notificationStatus = shouldNotify
    ? createNotificationStatus(await deliverMenuNotification(menuId, truncateNotificationText(selectedPatchMessage)), true)
    : createNotificationStatus(null, false);

  if (shouldNotify && (notificationStatus.partial || !notificationStatus.ok)) {
    if (notificationStatus.partial) {
      warnings.push(...collectNotificationWarnings(notificationStatus.summary));
      warnings.push('Some channels did not receive the update. The queue was preserved so you can retry.');
    } else {
      warnings.push('Update could not be sent. The queue was preserved.');
    }

    const [metaCompatibility, failedSendCompatibility] = await Promise.all([
      patchMenuMetaForMenuWithCompatibility(menuId, {
        last_updated_ts: shouldPersistLive ? ts : (meta?.last_updated_ts || null),
        draft_state: shouldPersistLive ? {} : (meta?.draft_state || {}),
        draft_saved_ts: shouldPersistLive ? null : (meta?.draft_saved_ts || null),
        draft_saved_by_user_id: shouldPersistLive ? null : (meta?.draft_saved_by_user_id ?? undefined),
        draft_saved_by_name: shouldPersistLive ? '' : (meta?.draft_saved_by_name ?? undefined),
        draft_saved_source: shouldPersistLive ? '' : (meta?.draft_saved_source ?? undefined),
      }, {
        optionalFields: ['draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
      }),
      appendHistoryEvent({
        menuId,
        actor,
        source: normalizedSource,
        operationId,
        eventType: 'send_failed',
        sections: selectedSections,
        message: notificationStatus.partial
          ? 'Notification delivery was partially successful. Queue preserved for retry.'
          : 'Notification delivery failed. Queue preserved for retry.',
      }),
    ]);
    historyCompat.push(failedSendCompatibility);

    return {
      ok: true,
      ts,
      preview,
      sections_by_outcome: buildSectionsByOutcome({
        preview,
        selectedGroupIds: selection.selectedGroupIds,
      }),
      current_revisions: {
        ...currentRevisions,
        live_revision: shouldPersistLive ? ts : currentRevisions.live_revision,
      },
      notificationStatus,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: `✅ ${knownMenu.name || 'Menu'} saved live. Send attempt failed and the queue was preserved.`,
      selected_change_ids: selection.selectedGroupIds,
      legacy_selected_change_ids: selection.selectedLines.map(change => change.id),
      operation_id: operationId,
      compatibility: {
        contract: PREVIEW_CONTRACT,
        serverOwned: true,
        downgradedFields: mergeDowngradedFields(metaCompatibility, ...historyCompat),
        sourceStamped: !mergeDowngradedFields(...historyCompat).includes('source'),
        typedHistory: !mergeDowngradedFields(...historyCompat).includes('event_type'),
        operationGrouping: !mergeDowngradedFields(...historyCompat).includes('operation_id'),
      },
    };
  }

  warnings.push(...collectNotificationWarnings(notificationStatus.summary));
  const currentFeaturedIds = Array.isArray(preview?.metadata?.currentFeaturedIds)
    ? preview.metadata.currentFeaturedIds
    : await readCurrentFeaturedIdsForRestaurant(knownMenu.restaurantId);
  const siblingMenuIds = (getRestaurantSpecialConfig(knownMenu.restaurantId)?.menuIds || [])
    .filter(candidateId => candidateId && candidateId !== menuId);
  const lastSentState = snapshotLastSentState(snapshot);

  if (publishMode === 'save') {
    const [metaCompatibility, quietSaveCompatibility] = await Promise.all([
      patchMenuMetaForMenuWithCompatibility(menuId, {
        last_updated_ts: ts,
        draft_state: {},
        draft_saved_ts: null,
        draft_saved_by_user_id: null,
        draft_saved_by_name: '',
        draft_saved_source: '',
      }, {
        optionalFields: ['draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
      }),
      insertUpdateLog({
        menuId,
        actor,
        diff: serializeSaveOnlyChangesForLog(preview.saveOnlyChanges),
        message: preview.hasNotificationChanges
          ? 'Saved live quietly. Notification queue was preserved for later send.'
          : 'Saved live quietly.',
        source: normalizedSource,
        operationId,
        eventType: 'quiet_save',
      }),
    ]);
    historyCompat.push(quietSaveCompatibility);

    return {
      ok: true,
      ts,
      preview,
      sections_by_outcome: buildSectionsByOutcome({
        preview,
        selectedGroupIds: selection.selectedGroupIds,
      }),
      current_revisions: {
        ...currentRevisions,
        live_revision: ts,
      },
      notificationStatus: null,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: preview.hasNotificationChanges
        ? `✅ ${knownMenu.name || 'Menu'} saved live. Queue is ready to send.`
        : `✅ ${knownMenu.name || 'Menu'} saved to the live menu.`,
      selected_change_ids: selection.selectedGroupIds,
      legacy_selected_change_ids: selection.selectedLines.map(change => change.id),
      operation_id: operationId,
      compatibility: {
        contract: PREVIEW_CONTRACT,
        serverOwned: true,
        downgradedFields: mergeDowngradedFields(metaCompatibility, ...historyCompat),
        sourceStamped: !mergeDowngradedFields(...historyCompat).includes('source'),
        typedHistory: !mergeDowngradedFields(...historyCompat).includes('event_type'),
        operationGrouping: !mergeDowngradedFields(...historyCompat).includes('operation_id'),
      },
    };
  }

  const [metaCompatibility] = await Promise.all([
    patchMenuMetaForMenuWithCompatibility(menuId, {
      last_updated_ts: shouldPersistLive ? ts : (meta?.last_updated_ts || currentRevisions.live_revision || null),
      last_sent_ts: shouldAdvanceQueueBaseline ? ts : (meta?.last_sent_ts || null),
      last_sent_state: shouldAdvanceQueueBaseline ? lastSentState : (meta?.last_sent_state || {}),
      last_sent_categories: shouldAdvanceQueueBaseline
        ? (Array.isArray(preview?.diff) ? preview.diff.map(section => section.id).filter(Boolean) : [])
        : (Array.isArray(meta?.last_sent_categories) ? meta.last_sent_categories : []),
      last_sent_featured: shouldAdvanceQueueBaseline
        ? currentFeaturedIds
        : (Array.isArray(meta?.last_sent_featured) ? meta.last_sent_featured : []),
      draft_state: shouldPersistLive ? {} : (meta?.draft_state || {}),
      draft_saved_ts: shouldPersistLive ? null : (meta?.draft_saved_ts || null),
      draft_saved_by_user_id: shouldPersistLive ? null : (meta?.draft_saved_by_user_id ?? undefined),
      draft_saved_by_name: shouldPersistLive ? '' : (meta?.draft_saved_by_name ?? undefined),
      draft_saved_source: shouldPersistLive ? '' : (meta?.draft_saved_source ?? undefined),
    }, {
      optionalFields: ['last_sent_featured', 'draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
    }),
    ...(shouldAdvanceQueueBaseline
      ? siblingMenuIds.map(candidateId => patchMenuMetaForMenu(candidateId, {
          last_sent_featured: currentFeaturedIds,
        }))
      : []),
  ]);

  if (selectedSections.length > 0 && shouldNotify) {
    const sendCompatibility = await appendHistoryEvent({
      menuId,
      actor,
      source: normalizedSource,
      operationId,
      eventType: 'send_notification',
      sections: selectedSections,
      message: selectedPatchMessage || 'Sent menu update notification.',
    });
    historyCompat.push(sendCompatibility);
  }

  if (clearSections.length > 0) {
    const clearCompatibility = await appendHistoryEvent({
      menuId,
      actor,
      source: normalizedSource,
      operationId,
      eventType: 'clear_without_send',
      sections: clearSections,
      message: `Cleared ${clearSections.reduce((count, section) => count + (section.changes || []).length, 0)} queued line(s) without sending.`,
    });
    historyCompat.push(clearCompatibility);
  }

  const queueWasClearedWithoutSend = clearSections.length > 0 && !shouldNotify;
  const successMessage = shouldNotify
    ? (clearSections.length > 0
        ? `✅ ${knownMenu.name || 'Menu'} sent selected updates and cleared unchecked lines.`
        : `✅ ${knownMenu.name || 'Menu'} updates sent.`)
    : (queueWasClearedWithoutSend
        ? `✅ ${knownMenu.name || 'Menu'} update list cleared without notifying channels.`
        : `✅ ${knownMenu.name || 'Menu'} save completed.`);

  return {
    ok: true,
    ts,
    preview,
    sections_by_outcome: buildSectionsByOutcome({
      preview,
      selectedGroupIds: selection.selectedGroupIds,
    }),
    current_revisions: {
      ...currentRevisions,
      live_revision: shouldPersistLive ? ts : currentRevisions.live_revision,
      last_sent_revision: shouldAdvanceQueueBaseline ? ts : currentRevisions.last_sent_revision,
      draft_revision: shouldPersistLive ? null : currentRevisions.draft_revision,
    },
    notificationStatus: shouldNotify ? notificationStatus : null,
    warnings,
    warningMessage: warnings[0] || '',
    successMessage,
    selected_change_ids: selection.selectedGroupIds,
    legacy_selected_change_ids: selection.selectedLines.map(change => change.id),
    operation_id: operationId,
    compatibility: {
      contract: PREVIEW_CONTRACT,
      serverOwned: true,
      downgradedFields: mergeDowngradedFields(metaCompatibility, ...historyCompat),
      sourceStamped: !mergeDowngradedFields(...historyCompat).includes('source'),
      typedHistory: !mergeDowngradedFields(...historyCompat).includes('event_type'),
      operationGrouping: !mergeDowngradedFields(...historyCompat).includes('operation_id'),
    },
  };
}
