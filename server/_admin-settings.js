import { readProfile, requireRole } from './_auth.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';
import {
  getKnownMenuById,
  getKnownRestaurants,
  isSupportedMenuId,
} from './_menu-read.js';

const SUPPORTED_ADMIN_ACTIONS = [
  'save_notifications',
  'save_notification_credential_keys',
  'save_menu_url',
  'save_restaurant_design',
];

function isKnownRestaurantId(restaurantId = '') {
  return getKnownRestaurants().some(restaurant => restaurant.id === restaurantId);
}

async function fetchJsonOrThrow(url, fallbackMessage) {
  const response = await fetch(url, { headers: serviceHeaders() });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

async function patchJsonOrThrow(url, body, fallbackMessage) {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify(body || {}),
  });
  if (response.ok) return response;
  const payload = await readJsonSafe(response);
  throw new Error(getApiErrorMessage(payload, fallbackMessage));
}

async function readMenuNotifications(menuId) {
  const { sbUrl } = getSupabaseServerConfig();
  const rows = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}&select=notifications&limit=1`,
    'Failed to load menu notifications'
  );
  return rows?.[0]?.notifications || {};
}

async function patchMenuNotifications(menuId, notifications = {}) {
  const { sbUrl } = getSupabaseServerConfig();
  await patchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_meta?menu_id=eq.${menuId}`,
    { notifications },
    'Failed to save menu notifications'
  );
  return notifications;
}

async function saveMenuNotifications({ menuId, notifications = {} }) {
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }
  const normalized = {};
  ['groupme', 'sms', 'discord', 'webhook'].forEach(channel => {
    normalized[channel] = { enabled: !!notifications?.[channel]?.enabled };
  });
  await patchMenuNotifications(menuId, normalized);
  return {
    action: 'save_notifications',
    menu_id: menuId,
    notifications: normalized,
  };
}

async function saveRestaurantNotificationCredentialKeys({ restaurantId, notificationsConfig = {} }) {
  if (!isKnownRestaurantId(restaurantId)) {
    throw { status: 400, message: 'Unsupported restaurant_id' };
  }
  const { sbUrl } = getSupabaseServerConfig();
  await patchJsonOrThrow(
    `${sbUrl}/rest/v1/restaurants?id=eq.${restaurantId}`,
    { notifications_config: notificationsConfig || {} },
    'Failed to save notification credential keys'
  );
  return {
    action: 'save_notification_credential_keys',
    restaurant_id: restaurantId,
    notifications_config: notificationsConfig || {},
  };
}

async function saveMenuUrl({ menuId, menuUrl = '' }) {
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }
  const notifications = { ...(await readMenuNotifications(menuId)) };
  if (menuUrl) notifications.menu_url = String(menuUrl);
  else delete notifications.menu_url;
  await patchMenuNotifications(menuId, notifications);
  return {
    action: 'save_menu_url',
    menu_id: menuId,
    menu_url: menuUrl || '',
    notifications,
  };
}

async function saveRestaurantDesign({ restaurantId, design = {} }) {
  if (!isKnownRestaurantId(restaurantId)) {
    throw { status: 400, message: 'Unsupported restaurant_id' };
  }
  const { sbUrl } = getSupabaseServerConfig();
  await patchJsonOrThrow(
    `${sbUrl}/rest/v1/restaurants?id=eq.${restaurantId}`,
    {
      design: design || {},
      use_custom_design: true,
    },
    'Failed to save restaurant design'
  );
  return {
    action: 'save_restaurant_design',
    restaurant_id: restaurantId,
    design: design || {},
  };
}

export async function authorizeAdminSettingsRequest(req) {
  const actor = await requireRole(req, 'admin');
  const profile = await readProfile(actor.uid, { select: 'name' });
  return {
    id: actor.uid || '',
    role: actor.role || 'none',
    name: profile?.name || '',
  };
}

function attachAdminActionMetadata(result = {}, action, actor = null) {
  const normalizedActor = actor
    ? {
        id: actor.id || actor.uid || '',
        role: actor.role || 'none',
        name: actor.name || '',
      }
    : null;
  return {
    ok: true,
    ...result,
    command: 'admin-settings.v1',
    capabilities: {
      canAccessAdmin: normalizedActor?.role === 'admin',
      canManageSettings: normalizedActor?.role === 'admin',
      supportedActions: SUPPORTED_ADMIN_ACTIONS.slice(),
    },
    compatibility: {
      ...(result.compatibility && typeof result.compatibility === 'object' ? result.compatibility : {}),
      serverOwned: true,
      action,
      actorStamped: !!normalizedActor?.id,
      acceptedLegacyPayload: true,
      capabilityShape: 'admin-settings.capabilities.v1',
      auditShape: 'admin-settings.audit.v1',
    },
    audit: normalizedActor
      ? {
          actor_id: normalizedActor.id,
          actor_role: normalizedActor.role,
          actor_name: normalizedActor.name,
          stamped_at: Date.now(),
          source: 'api/admin-settings',
          target_menu_id: result?.menu_id || '',
          target_restaurant_id: result?.restaurant_id || '',
        }
      : null,
  };
}

export async function executeAdminSettingsAction(action, payload = {}, options = {}) {
  const actor = options?.actor || null;
  let result;
  switch (action) {
    case 'save_notifications':
      result = await saveMenuNotifications({
        menuId: String(payload.menu_id || '').trim(),
        notifications: payload.notifications || {},
      });
      break;
    case 'save_notification_credential_keys':
      result = await saveRestaurantNotificationCredentialKeys({
        restaurantId: String(payload.restaurant_id || '').trim(),
        notificationsConfig: payload.notifications_config || {},
      });
      break;
    case 'save_menu_url':
      result = await saveMenuUrl({
        menuId: String(payload.menu_id || '').trim(),
        menuUrl: String(payload.menu_url || '').trim(),
      });
      break;
    case 'save_restaurant_design':
      result = await saveRestaurantDesign({
        restaurantId: String(payload.restaurant_id || '').trim() || getKnownMenuById(String(payload.menu_id || '').trim())?.restaurantId || '',
        design: payload.design && typeof payload.design === 'object' ? payload.design : {},
      });
      break;
    default:
      throw {
        status: 400,
        message: 'Unsupported action',
        compatibility: {
          command: 'admin-settings.v1',
          supportedActions: SUPPORTED_ADMIN_ACTIONS.slice(),
        },
      };
  }
  return attachAdminActionMetadata(result, action, actor);
}
