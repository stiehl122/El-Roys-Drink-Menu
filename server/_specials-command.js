import {
  getRestaurantSpecialConfig,
  requireRestaurantSpecialsAccess,
} from './_auth.js';
import {
  getApiErrorMessage,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';

function parseBody(req) {
  const body = req?.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_) {
      return {};
    }
  }
  if (typeof body === 'object') return body;
  return {};
}

function isMissingColumnIssue(payload, columnName) {
  const message = `${payload?.error || payload?.message || payload?.hint || payload?.details || ''}`.toLowerCase();
  return message.includes(columnName.toLowerCase()) &&
    (message.includes('column') || message.includes('schema cache'));
}

function isOnConflictConstraintIssue(payload) {
  const message = `${payload?.error || payload?.message || payload?.hint || payload?.details || ''}`.toLowerCase();
  return message.includes('on conflict') ||
    message.includes('unique or exclusion constraint');
}

async function itemBelongsToRestaurantMenus(sbUrl, menuIds, itemId) {
  const categoriesRes = await fetch(
    `${sbUrl}/rest/v1/categories?menu_id=in.(${menuIds.join(',')})&select=items(id)`,
    { headers: serviceHeaders() }
  );
  if (!categoriesRes.ok) throw new Error('Failed to validate special item');
  const categories = await categoriesRes.json();
  return categories.some(category => (category.items || []).some(item => item.id === itemId));
}

async function fetchRestaurantSpecialGroup(sbUrl, restaurantId, options = {}) {
  const { createIfMissing = false } = options;
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!config?.canonicalId) return null;
  let supportsCanonicalId = true;

  const selectGroup = async () => {
    if (supportsCanonicalId && config.canonicalId) {
      const groupRes = await fetch(
        `${sbUrl}/rest/v1/featured_groups?canonical_id=eq.${encodeURIComponent(config.canonicalId)}&select=id,name,canonical_id&limit=1`,
        { headers: serviceHeaders() }
      );
      if (groupRes.ok) {
        const groups = await groupRes.json();
        if (groups?.[0]) return groups[0];
      } else {
        const payload = await readJsonSafe(groupRes);
        if (isMissingColumnIssue(payload, 'canonical_id')) {
          supportsCanonicalId = false;
        } else {
          throw new Error(getApiErrorMessage(payload, 'Failed to load specials group'));
        }
      }
    }

    if (config.name) {
      const selectFields = supportsCanonicalId ? 'id,name,canonical_id' : 'id,name';
      const groupRes = await fetch(
        `${sbUrl}/rest/v1/featured_groups?name=eq.${encodeURIComponent(config.name)}&select=${selectFields}&limit=1`,
        { headers: serviceHeaders() }
      );
      if (!groupRes.ok) {
        const payload = await readJsonSafe(groupRes);
        throw new Error(getApiErrorMessage(payload, 'Failed to load specials group'));
      }
      const groups = await groupRes.json();
      if (groups?.[0]) {
        if (supportsCanonicalId && config.canonicalId && !groups[0].canonical_id) {
          const patchRes = await fetch(`${sbUrl}/rest/v1/featured_groups?id=eq.${groups[0].id}`, {
            method: 'PATCH',
            headers: serviceHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
            body: JSON.stringify({ canonical_id: config.canonicalId }),
          });
          if (!patchRes.ok) {
            const payload = await readJsonSafe(patchRes);
            if (isMissingColumnIssue(payload, 'canonical_id')) {
              supportsCanonicalId = false;
            } else {
              throw new Error(getApiErrorMessage(payload, 'Failed to update specials group'));
            }
          }
        }
        return groups[0];
      }
    }
    return null;
  };

  if (!createIfMissing) return selectGroup();

  let group = await selectGroup();
  if (group?.id) return group;

  let useCanonicalId = supportsCanonicalId && !!config.canonicalId;
  let useOnConflict = true;
  let lastCreateError = 'Failed to upsert specials group';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const selectFields = useCanonicalId ? 'id,name,canonical_id' : 'id,name';
    const createUrl = `${sbUrl}/rest/v1/featured_groups${useOnConflict ? '?on_conflict=name&' : '?'}select=${selectFields}`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: serviceHeaders({
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      }),
      body: JSON.stringify(useCanonicalId
        ? { name: config.name, canonical_id: config.canonicalId }
        : { name: config.name }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      group = created?.[0] || null;
      if (group?.id) return group;
      group = await selectGroup();
      if (group?.id) return group;
      lastCreateError = 'Failed to resolve specials group';
      break;
    }

    const payload = await readJsonSafe(createRes);
    lastCreateError = getApiErrorMessage(payload, lastCreateError);

    group = await selectGroup();
    if (group?.id) return group;

    if (useCanonicalId && isMissingColumnIssue(payload, 'canonical_id')) {
      useCanonicalId = false;
      supportsCanonicalId = false;
      continue;
    }
    if (useOnConflict && isOnConflictConstraintIssue(payload)) {
      useOnConflict = false;
      continue;
    }
    break;
  }

  group = await selectGroup();
  if (!group?.id) throw new Error(lastCreateError || 'Failed to resolve specials group');
  return group;
}

async function fetchGroupSlots(sbUrl, groupId) {
  const slotsRes = await fetch(
    `${sbUrl}/rest/v1/featured_slots?featured_group_id=eq.${groupId}&select=id,item_id,display_order&order=display_order.asc`,
    { headers: serviceHeaders() }
  );
  if (!slotsRes.ok) throw new Error('Failed to load specials slots');
  return slotsRes.json();
}

async function fetchSlot(sbUrl, slotId) {
  const slotRes = await fetch(
    `${sbUrl}/rest/v1/featured_slots?id=eq.${slotId}&select=id,featured_group_id,display_order&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!slotRes.ok) throw new Error('Failed to load special slot');
  const slots = await slotRes.json();
  return slots?.[0] || null;
}

export function parseSpecialsCommand(req) {
  const body = parseBody(req);
  return {
    action: body?.action,
    direction: body?.direction,
    itemId: body?.itemId,
    note: body?.note,
    restaurantId: body?.restaurantId,
    slotId: body?.slotId,
  };
}

export function createRestaurantSpecialsMutationService({ sbUrl, caller, config }) {
  return {
    async ensureForRestaurant(restaurantId) {
      const group = await fetchRestaurantSpecialGroup(sbUrl, restaurantId);
      return { status: group ? 204 : 404 };
    },

    async add({ restaurantId, itemId }) {
      if (!itemId) return { status: 400, body: { error: 'Missing itemId' } };
      if (!(await itemBelongsToRestaurantMenus(sbUrl, config.menuIds, itemId))) {
        return { status: 403, body: { error: 'Item is not part of this restaurant.' } };
      }
      const group = await fetchRestaurantSpecialGroup(sbUrl, restaurantId, { createIfMissing: true });
      if (!group?.id) throw new Error('Missing specials group');
      const slots = await fetchGroupSlots(sbUrl, group.id);
      if (slots.length >= 5) return { status: 400, body: { error: 'Max 5 specials per restaurant.' } };
      if (slots.some(slot => slot.item_id === itemId)) {
        return { status: 409, body: { error: 'That item is already in specials.' } };
      }
      const insertRes = await fetch(`${sbUrl}/rest/v1/featured_slots`, {
        method: 'POST',
        headers: serviceHeaders({
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        }),
        body: JSON.stringify({
          featured_group_id: group.id,
          item_id: itemId,
          display_order: slots.length,
        }),
      });
      if (!insertRes.ok) throw new Error('Failed to add special');
      return { status: 204 };
    },

    async remove({ groupId, slotId }) {
      if (!slotId) return { status: 400, body: { error: 'Missing slotId' } };
      const slot = await fetchSlot(sbUrl, slotId);
      if (!slot || slot.featured_group_id !== groupId) return { status: 404, body: { error: 'Special not found' } };
      const deleteRes = await fetch(`${sbUrl}/rest/v1/featured_slots?id=eq.${slotId}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
      });
      if (!deleteRes.ok) throw new Error('Failed to remove special');
      return { status: 204 };
    },

    async move({ groupId, slotId, direction }) {
      if (!slotId || ![-1, 1].includes(Number(direction))) {
        return { status: 400, body: { error: 'Invalid move request' } };
      }
      const slots = await fetchGroupSlots(sbUrl, groupId);
      const idx = slots.findIndex(slot => slot.id === slotId);
      if (idx < 0) return { status: 404, body: { error: 'Special not found' } };
      const newIdx = idx + Number(direction);
      if (newIdx < 0 || newIdx >= slots.length) return { status: 204 };
      const current = slots[idx];
      const target = slots[newIdx];
      const [patchA, patchB] = await Promise.all([
        fetch(`${sbUrl}/rest/v1/featured_slots?id=eq.${current.id}`, {
          method: 'PATCH',
          headers: serviceHeaders({
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          }),
          body: JSON.stringify({ display_order: target.display_order }),
        }),
        fetch(`${sbUrl}/rest/v1/featured_slots?id=eq.${target.id}`, {
          method: 'PATCH',
          headers: serviceHeaders({
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          }),
          body: JSON.stringify({ display_order: current.display_order }),
        }),
      ]);
      if (!patchA.ok || !patchB.ok) throw new Error('Failed to reorder specials');
      return { status: 204 };
    },

    async note({ groupId, slotId, note }) {
      if (!slotId) return { status: 400, body: { error: 'Missing slotId' } };
      const slot = await fetchSlot(sbUrl, slotId);
      if (!slot || slot.featured_group_id !== groupId) return { status: 404, body: { error: 'Special not found' } };
      const patchRes = await fetch(`${sbUrl}/rest/v1/featured_slots?id=eq.${slotId}`, {
        method: 'PATCH',
        headers: serviceHeaders({
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        }),
        body: JSON.stringify({ sell_note: String(note || '') }),
      });
      if (!patchRes.ok) throw new Error('Failed to save note');
      return { status: 204 };
    },

    async confirm({ groupId }) {
      const slots = await fetchGroupSlots(sbUrl, groupId);
      if (!slots.length) return { status: 204 };
      const confirmedAt = new Date().toISOString();
      const results = await Promise.all(
        slots.map(slot =>
          fetch(`${sbUrl}/rest/v1/featured_slots?id=eq.${slot.id}`, {
            method: 'PATCH',
            headers: serviceHeaders({
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            }),
            body: JSON.stringify({
              confirmed_at: confirmedAt,
              confirmed_by: caller.uid,
            }),
          })
        )
      );
      if (results.some(result => !result.ok)) throw new Error('Failed to confirm specials');
      return { status: 204 };
    },
  };
}

export async function executeRestaurantSpecialsCommand({ sbUrl, caller, command = {} }) {
  const { action, direction, itemId, note, restaurantId, slotId } = command;
  if (!restaurantId) throw { status: 400, message: 'Missing restaurantId' };
  if (!action) throw { status: 400, message: 'Missing action' };

  let config;
  try {
    config = await requireRestaurantSpecialsAccess(caller.uid, caller.role, restaurantId);
  } catch (e) {
    throw { status: e.status, message: e.message };
  }

  const service = createRestaurantSpecialsMutationService({ sbUrl, caller, config });

  if (action === 'ensure') {
    return service.ensureForRestaurant(restaurantId);
  }
  if (action === 'add') {
    return service.add({ restaurantId, itemId });
  }

  const group = await fetchRestaurantSpecialGroup(sbUrl, restaurantId, { createIfMissing: true });
  if (!group?.id) throw { status: 404, body: { error: `${config.name} does not exist yet.` } };

  if (action === 'remove') {
    return service.remove({ groupId: group.id, slotId });
  }
  if (action === 'move') {
    return service.move({ groupId: group.id, slotId, direction });
  }
  if (action === 'note') {
    return service.note({ groupId: group.id, slotId, note });
  }
  if (action === 'confirm') {
    return service.confirm({ groupId: group.id });
  }

  return { status: 400, body: { error: 'Unsupported action' } };
}

export function respondWithSpecialsResult(res, result = {}) {
  const status = Number(result.status) || 204;
  if (result.body) return res.status(status).json(result.body);
  return res.status(status).end();
}
