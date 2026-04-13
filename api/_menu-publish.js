import { getRestaurantSpecialConfig } from './_auth.js';
import { truncateNotificationText } from './_notification-gateway.js';
import { deliverMenuNotification } from './_notification-delivery.js';
import {
  assertExpectedRevision,
  insertUpdateLog,
  patchMenuMetaForMenu,
  readMenuMeta,
  readRevisionState,
  saveLiveMenuForMenu,
} from './_menu-write.js';
import {
  getSupabaseServerConfig,
  serviceHeaders,
} from './_supabase.js';
import { getKnownMenuById } from './_menu-read.js';

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

export async function publishMenuUpdateForMenu({
  actor,
  menuId,
  mode,
  snapshot = {},
  selectedSections = [],
  patchMessage = '',
  previewDiff = [],
  expectedLiveRevision = null,
  expectedDraftRevision = null,
}) {
  const knownMenu = getKnownMenuById(menuId);
  if (!knownMenu) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }

  const meta = await readMenuMeta(menuId);
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

  const publishMode = ['save', 'save-and-update', 'update-only'].includes(mode) ? mode : 'save-and-update';
  const shouldPersistLive = publishMode !== 'update-only';
  const shouldNotify = (publishMode === 'save-and-update' || publishMode === 'update-only') && selectedSections.length > 0;
  const liveTs = Date.now();

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
      preview: null,
      notificationStatus,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: `✅ ${knownMenu.name || 'Menu'} saved live. Update still needs attention.`,
    };
  }

  if (shouldNotify && !notificationStatus.ok) {
    warnings.push('Update could not be sent.');
    return {
      ok: true,
      ts: liveTs,
      preview: null,
      notificationStatus,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: `✅ ${knownMenu.name || 'Menu'} saved live. Update still needs to be sent.`,
    };
  }

  warnings.push(...collectNotificationWarnings(notificationStatus.summary));

  const ts = liveTs;
  const currentFeaturedIds = await readCurrentFeaturedIdsForRestaurant(knownMenu.restaurantId);
  const siblingMenuIds = (getRestaurantSpecialConfig(knownMenu.restaurantId)?.menuIds || [])
    .filter(candidateId => candidateId && candidateId !== menuId);
  const lastSentState = snapshotLastSentState(snapshot);

  if (publishMode === 'save') {
    await patchMenuMetaForMenu(menuId, {
      last_updated_ts: ts,
      draft_state: {},
      draft_saved_ts: null,
    });
    return {
      ok: true,
      ts,
      notificationStatus: null,
      warnings,
      warningMessage: warnings[0] || '',
      successMessage: `✅ ${knownMenu.name || 'Menu'} saved to the live menu.`,
    };
  }

  await Promise.all([
    patchMenuMetaForMenu(menuId, {
      last_updated_ts: ts,
      last_sent_ts: ts,
      last_sent_state: lastSentState,
      last_sent_categories: Array.isArray(previewDiff) ? previewDiff.map(section => section.id).filter(Boolean) : [],
      last_sent_featured: currentFeaturedIds,
      draft_state: shouldPersistLive ? {} : meta?.draft_state || {},
      draft_saved_ts: shouldPersistLive ? null : meta?.draft_saved_ts || null,
    }),
    ...siblingMenuIds.map(candidateId => patchMenuMetaForMenu(candidateId, {
      last_sent_featured: currentFeaturedIds,
    })),
  ]);

  if (patchMessage) {
    await insertUpdateLog({
      menuId,
      actor,
      diff: selectedSections,
      message: patchMessage,
    });
  }

  return {
    ok: true,
    ts,
    notificationStatus: shouldNotify ? notificationStatus : null,
    warnings,
    warningMessage: warnings[0] || '',
    successMessage: shouldNotify
      ? `✅ ${knownMenu.name || 'Menu'} saved and sent!`
      : `✅ ${knownMenu.name || 'Menu'} update list cleared without notifying channels.`,
  };
}
