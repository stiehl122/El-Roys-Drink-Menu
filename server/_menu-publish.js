import { randomUUID } from 'node:crypto';

import '../core/session/menu-publish-workflow.js';

import {
  MAX_NOTIFICATION_TEXT_LENGTH,
  truncateNotificationText,
} from './_notification-gateway.js';
import { deliverMenuNotification } from './_notification-delivery.js';
import {
  assertExpectedRevision,
  inferAuditSource,
  insertUpdateLog,
  normalizePersistentItemId,
  patchMenuMetaForMenuWithCompatibility,
  readMenuMeta,
  readRevisionState,
  saveLiveMenuForMenu,
} from './_menu-write.js';
import { getKnownMenuById } from './_menu-read.js';
import { assertCategoryGovernanceAllowed } from './_category-governance.js';
import {
  buildCategoryQueueState,
  normalizeLegacyFeaturedBaseline,
  normalizeName,
} from './_menu-queue.js';
import {
  prepareFeaturedCategoriesForPersistence,
  remapFeaturedSpecialsLastSentState,
} from './_featured-specials-persistence.js';

const PREVIEW_CONTRACT = 'menu-publish-preview.v2';

function isFeaturedSpecialsSectionKey(sectionKey = '') {
  const normalized = String(sectionKey || '').trim();
  return normalized === 'featured_specials' || normalized === 'special';
}

function createMenuPublishError(status, message, extras = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extras);
  return error;
}

function normalizeRevision(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function assertNoDraftRevisionConflict(currentRevisions, expectedDraftRevision, options = {}) {
  assertExpectedRevision(expectedDraftRevision, currentRevisions?.draft_revision ?? null, 'draft_revision', options);
}

function assertNoNotificationRevisionConflict(currentRevisions, expectedNotificationRevision, options = {}) {
  assertExpectedRevision(expectedNotificationRevision, currentRevisions?.last_sent_revision ?? null, 'notification_revision', options);
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
      id: normalizePersistentItemId(item?.id),
      name: item.name || '',
      eightySixed: !!item.is_eighty_sixed,
      onMenu: item.on_menu !== false,
      visibility: item.visibility || 'public',
      featuredEnabled: item.featured_enabled === true || item.featuredEnabled === true,
    })),
  ]));
}

function collectCurrentFeaturedIds(snapshot = {}) {
  const cats = Array.isArray(snapshot?.cats) ? snapshot.cats : [];
  return cats
    .filter(category => isFeaturedSpecialsSectionKey(category?.key))
    .flatMap(category => Array.isArray(category?.items) ? category.items : [])
    .filter(item => (item?.featured_enabled === true || item?.featuredEnabled === true)
      && item?.on_menu !== false
      && item?.onMenu !== false
      && item?.visibility !== 'off_menu')
    .map(item => normalizePersistentItemId(item?.id))
    .filter(Boolean);
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

function canonicalizeLegacySelectionSectionId(sectionId = '') {
  const normalizedId = String(sectionId || '').trim();
  if (!normalizedId) return '';
  if (normalizedId === '__featured__' || normalizedId === 'special' || normalizedId === 'featured') {
    return 'featured_specials';
  }
  return normalizedId;
}

function mapLegacySelectionToLineIds(legacySections = [], notificationChanges = []) {
  const byKey = new Set();
  (Array.isArray(legacySections) ? legacySections : []).forEach(section => {
    const sectionId = canonicalizeLegacySelectionSectionId(section?.id);
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
    .filter(change => byKey.has(`${canonicalizeLegacySelectionSectionId(change.sectionId)}::${change.kind}::${String(change.name || '').trim().toLowerCase()}`))
    .map(change => change.id);
}

function resolveSelection(preview, selectedChangeIds = null, legacySelectedSections = null) {
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
  } else if (Array.isArray(legacySelectedSections)) {
    selectedSet = new Set();
    const legacyLineIds = mapLegacySelectionToLineIds(legacySelectedSections, preview?.notificationChanges || []);
    legacyLineIds.forEach(lineId => {
      const groupId = lineToGroupId.get(String(lineId || '').trim());
      if (groupId) selectedSet.add(groupId);
    });
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

async function buildCanonicalPreviewForMenu({
  snapshot = {},
  meta = {},
  knownMenu = null,
}) {
  const snapshotHasFeaturedSpecials = Array.isArray(snapshot?.cats)
    ? snapshot.cats.some(category => isFeaturedSpecialsSectionKey(category?.key))
    : false;
  const preparedSnapshotResult = prepareFeaturedCategoriesForPersistence(
    Array.isArray(snapshot?.cats) ? snapshot.cats : [],
    {
      menuId: knownMenu?.id || '',
      menuType: knownMenu?.type || 'drinks',
    }
  );
  const queueSnapshot = {
    ...snapshot,
    cats: preparedSnapshotResult.categories,
  };
  const normalizedLastSentState = remapFeaturedSpecialsLastSentState(normalizeLegacyFeaturedBaseline({
    snapshot,
    lastSentState: meta?.last_sent_state && typeof meta.last_sent_state === 'object'
      ? meta.last_sent_state
      : {},
    lastSentFeatured: Array.isArray(meta?.last_sent_featured) ? meta.last_sent_featured : [],
  }), preparedSnapshotResult.cloneIdMap);
  const preservedFeaturedState = Object.fromEntries(
    Object.entries(normalizedLastSentState).filter(([key]) => isFeaturedSpecialsSectionKey(key))
  );
  const lastSentState = snapshotHasFeaturedSpecials
    ? normalizedLastSentState
    : Object.fromEntries(
        Object.entries(normalizedLastSentState).filter(([key]) => !isFeaturedSpecialsSectionKey(key))
      );
  const categoryState = buildCategoryQueueState({
    snapshot: queueSnapshot,
    lastSentState,
  });
  const queueState = {
    changeGroups: Array.isArray(categoryState?.groups) ? categoryState.groups : [],
    notificationChanges: Array.isArray(categoryState?.notificationChanges) ? categoryState.notificationChanges : [],
    sections: Array.isArray(categoryState?.sections) ? categoryState.sections : [],
    diff: Array.isArray(categoryState?.diff) ? categoryState.diff : [],
    unsentItemIds: Array.isArray(categoryState?.unsentItemIds) ? categoryState.unsentItemIds : [],
  };
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

  return {
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
      currentFeaturedIds: collectCurrentFeaturedIds(queueSnapshot),
      unsentItemIds: queueState.unsentItemIds,
      lastSentState: snapshotHasFeaturedSpecials
        ? snapshotLastSentState(queueSnapshot)
        : {
            ...snapshotLastSentState(queueSnapshot),
            ...preservedFeaturedState,
          },
    },
  };
}

function createWorkflowPatchMessage({
  sections = [],
  menuName = '',
  menuLink = '',
}) {
  return buildPatchMessage(sections, { menuName, menuLink });
}

function createWorkflowSelection(preview, selectedChangeIds = null, legacySelectedSections = null) {
  const selection = resolveSelection(preview, selectedChangeIds, legacySelectedSections);
  return {
    selectedChangeIds: selection.selectedGroupIds,
    selectedSections: groupNotificationChangesBySection(selection.selectedLines),
    clearedChangeIds: selection.clearGroups.map(group => group.id),
    clearedSections: groupNotificationChangesBySection(selection.clearLines),
  };
}

function createServerMenuPublishPorts() {
  return {
    menus: {
      async readContext(menuId) {
        const knownMenu = getKnownMenuById(menuId);
        if (!knownMenu) {
          throw createMenuPublishError(400, 'Unsupported menu_id', { menuId });
        }
        const meta = await readMenuMeta(menuId);
        return { knownMenu, meta };
      },
      async saveLiveMenu(input) {
        return saveLiveMenuForMenu(input);
      },
      async patchMeta({ menuId, patch, optionalFields = [] }) {
        return patchMenuMetaForMenuWithCompatibility(menuId, patch, { optionalFields });
      },
    },
    governance: {
      async assertCategoryGovernanceAllowed(input) {
        return assertCategoryGovernanceAllowed({ ...input, requireCategorySnapshot: true });
      },
      assertRevisions({ menuId, meta, expectedLiveRevision, expectedDraftRevision, expectedNotificationRevision }) {
        const currentRevisions = readRevisionState(meta);
        const normalizedLiveRevision = normalizeRevision(expectedLiveRevision);
        const normalizedDraftRevision = normalizeRevision(expectedDraftRevision);
        const normalizedNotificationRevision = normalizeRevision(expectedNotificationRevision);
        const notificationBaselineRevision = normalizedNotificationRevision ?? normalizedDraftRevision;
        const conflictOptions = {
          menuId,
          command: 'menu-publish.v2',
          currentRevisions,
        };

        assertExpectedRevision(normalizedLiveRevision, currentRevisions.live_revision, 'live_revision', conflictOptions);
        assertNoDraftRevisionConflict(currentRevisions, normalizedDraftRevision, conflictOptions);
        assertNoNotificationRevisionConflict(currentRevisions, notificationBaselineRevision, conflictOptions);

        return {
          liveRevision: currentRevisions.live_revision,
          draftRevision: currentRevisions.draft_revision,
          notificationRevision: currentRevisions.last_sent_revision,
        };
      },
    },
    preview: {
      buildCanonical: buildCanonicalPreviewForMenu,
      resolveSelection({ preview, selectedChangeIds, legacySelectedSections = null }) {
        return createWorkflowSelection(preview, selectedChangeIds, legacySelectedSections);
      },
    },
    notifications: {
      async deliver({ menuId, message }) {
        const delivery = await deliverMenuNotification(menuId, truncateNotificationText(message));
        return {
          delivered: delivery.status < 400,
          partial: delivery.status === 207,
          summary: delivery.summary,
          retryable: delivery.status >= 400 || delivery.status === 207,
        };
      },
    },
    audit: {
      async append(event) {
        return insertUpdateLog({
          menuId: event.menuId,
          actor: event.actor,
          diff: serializeNotificationSectionsForLog(event.sections),
          message: event.message,
          source: inferAuditSource(event.actor, event.source),
          operationId: event.operationId,
          eventType: event.eventType,
        });
      },
    },
    clock: { now: () => Date.now() },
    ids: { operationId: () => randomUUID() },
    format: {
      patchMessage: createWorkflowPatchMessage,
      warningSummary: collectNotificationWarnings,
    },
  };
}

function getServerPublishWorkflowFactory() {
  const workflowFactory = globalThis.createMenuPublishWorkflow;
  if (typeof workflowFactory !== 'function') {
    throw createMenuPublishError(500, 'createMenuPublishWorkflow is unavailable', {
      code: 'menu_publish_workflow_unavailable',
    });
  }
  return workflowFactory;
}

function createServerPublishWorkflow() {
  const workflowFactory = getServerPublishWorkflowFactory();
  return workflowFactory({
    ports: createServerMenuPublishPorts(),
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
  const workflow = createServerPublishWorkflow();
  const result = await workflow.preview({
    menuId,
    actor,
    source,
    snapshot: snapshot || {},
    request: {
      expectedLiveRevision,
      expectedDraftRevision,
      expectedNotificationRevision,
    },
  });

  return {
    ok: true,
    action: 'preview',
    preview: result.preview,
    current_revisions: result.revisions,
    reconnect: null,
    compatibility: {
      contract: 'menu-publish-workflow.v1',
      serverOwned: true,
    },
  };
}

export async function publishMenuUpdateForMenu(input = {}) {
  const {
    actor,
    menuId,
    mode,
    source,
    snapshot = {},
    selectedChangeIds = null,
    legacySelectedSections = null,
    expectedLiveRevision = null,
    expectedDraftRevision = null,
    expectedNotificationRevision = null,
  } = input;
  const request = {
    selectedChangeIds: Array.isArray(selectedChangeIds) ? selectedChangeIds : null,
    expectedLiveRevision,
    expectedDraftRevision,
    expectedNotificationRevision,
  };
  if (Array.isArray(legacySelectedSections)) {
    request.legacySelectedSections = legacySelectedSections;
  }

  const workflow = createServerPublishWorkflow();
  const result = await workflow.execute({
    menuId,
    actor,
    source,
    intent: mode === 'save' ? 'save' : (mode === 'send' ? 'send' : 'save-and-send'),
    snapshot: snapshot || {},
    request,
  });

  return {
    ok: result.ok,
    ts: result.ts,
    preview: result.preview,
    current_revisions: result.revisions,
    notificationStatus: result.notification,
    warnings: result.userOutcome.warnings,
    warningMessage: result.userOutcome.warningMessage,
    successMessage: result.userOutcome.successMessage,
    selected_change_ids: result.queue.selectedChangeIds,
    sections_by_outcome: {
      sent: result.queue.selectedChangeIds,
      cleared: result.queue.clearedChangeIds,
    },
    operation_id: result.operationId,
    compatibility: {
      contract: 'menu-publish-workflow.v1',
      serverOwned: true,
      downgradedFields: result.compatibility.downgradedFields,
    },
  };
}
