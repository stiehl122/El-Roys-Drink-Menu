import {
  getRestaurantSpecialConfig,
  requireRestaurantSpecialsAccess,
  requireRole,
} from './_auth.js';

function serviceHeaders(extra = {}) {
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: sbService,
    Authorization: `Bearer ${sbService}`,
    ...extra,
  };
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

async function fetchLegacyRestaurantSeedRows(sbUrl, menuIds) {
  const menuGroupsRes = await fetch(
    `${sbUrl}/rest/v1/menu_featured_groups?menu_id=in.(${menuIds.join(',')})&select=menu_id,display_order,featured_groups(id)&order=display_order.asc`,
    { headers: serviceHeaders() }
  );
  if (!menuGroupsRes.ok) throw new Error('Failed to load legacy specials');
  const menuGroups = await menuGroupsRes.json();
  if (!menuGroups.length) return [];

  const groupIds = [...new Set(menuGroups.map(group => group.featured_groups?.id).filter(Boolean))];
  if (!groupIds.length) return [];

  const slotsRes = await fetch(
    `${sbUrl}/rest/v1/featured_slots?featured_group_id=in.(${groupIds.join(',')})&select=featured_group_id,item_id,sell_note,display_order&order=display_order.asc`,
    { headers: serviceHeaders() }
  );
  if (!slotsRes.ok) throw new Error('Failed to load legacy special slots');
  const slots = await slotsRes.json();
  const menuIndex = new Map(menuIds.map((menuId, index) => [menuId, index]));
  const groupIndex = new Map(menuGroups.map(group => [group.featured_groups.id, group]));
  const seenItemIds = new Set();

  return slots
    .sort((a, b) => {
      const groupA = groupIndex.get(a.featured_group_id);
      const groupB = groupIndex.get(b.featured_group_id);
      const menuDiff = (menuIndex.get(groupA?.menu_id) || 0) - (menuIndex.get(groupB?.menu_id) || 0);
      if (menuDiff !== 0) return menuDiff;
      const groupDiff = (groupA?.display_order || 0) - (groupB?.display_order || 0);
      if (groupDiff !== 0) return groupDiff;
      return (a.display_order || 0) - (b.display_order || 0);
    })
    .filter(slot => {
      if (seenItemIds.has(slot.item_id)) return false;
      seenItemIds.add(slot.item_id);
      return true;
    })
    .slice(0, 5)
    .map((slot, index) => ({
      item_id: slot.item_id,
      sell_note: slot.sell_note || '',
      display_order: index,
    }));
}

async function seedRestaurantSpecialGroupFromLegacy(sbUrl, restaurantId, groupId) {
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!config?.menuIds?.length) return;
  const seedRows = await fetchLegacyRestaurantSeedRows(sbUrl, config.menuIds);
  if (!seedRows.length) return;
  const insertRes = await fetch(`${sbUrl}/rest/v1/featured_slots`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }),
    body: JSON.stringify(seedRows.map(row => ({
      featured_group_id: groupId,
      item_id: row.item_id,
      sell_note: row.sell_note,
      display_order: row.display_order,
    }))),
  });
  if (!insertRes.ok) throw new Error('Failed to seed specials');
}

async function fetchRestaurantSpecialGroup(sbUrl, restaurantId, options = {}) {
  const { createIfMissing = false } = options;
  const config = getRestaurantSpecialConfig(restaurantId);
  if (!config?.name) return null;

  const groupRes = await fetch(
    `${sbUrl}/rest/v1/featured_groups?name=eq.${encodeURIComponent(config.name)}&select=id,name&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!groupRes.ok) throw new Error('Failed to load specials group');
  const groups = await groupRes.json();
  if (groups?.[0]) return groups[0];
  if (!createIfMissing) return null;

  const createRes = await fetch(`${sbUrl}/rest/v1/featured_groups`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({ name: config.name }),
  });
  if (!createRes.ok) throw new Error('Failed to create specials group');
  const created = await createRes.json();
  const group = created?.[0] || null;
  if (group?.id) await seedRestaurantSpecialGroupFromLegacy(sbUrl, restaurantId, group.id);
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let caller;
  try {
    caller = await requireRole(req, 'manager', 'admin');
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const sbUrl = process.env.SUPABASE_URL;
  const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbService) return res.status(500).json({ error: 'Server misconfigured' });

  const { action, direction, itemId, note, restaurantId, slotId } = req.body || {};
  if (!restaurantId) return res.status(400).json({ error: 'Missing restaurantId' });
  if (!action) return res.status(400).json({ error: 'Missing action' });

  let config;
  try {
    config = await requireRestaurantSpecialsAccess(caller.uid, caller.role, restaurantId);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  try {
    if (action === 'ensure') {
      await fetchRestaurantSpecialGroup(sbUrl, restaurantId, { createIfMissing: true });
      return res.status(204).end();
    }

    if (action === 'add') {
      if (!itemId) return res.status(400).json({ error: 'Missing itemId' });
      if (!(await itemBelongsToRestaurantMenus(sbUrl, config.menuIds, itemId))) {
        return res.status(403).json({ error: 'Item is not part of this restaurant.' });
      }
      const group = await fetchRestaurantSpecialGroup(sbUrl, restaurantId, { createIfMissing: true });
      if (!group?.id) throw new Error('Missing specials group');
      const slots = await fetchGroupSlots(sbUrl, group.id);
      if (slots.length >= 5) return res.status(400).json({ error: 'Max 5 specials per restaurant.' });
      if (slots.some(slot => slot.item_id === itemId)) {
        return res.status(409).json({ error: 'That item is already in specials.' });
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
      return res.status(204).end();
    }

    const group = await fetchRestaurantSpecialGroup(sbUrl, restaurantId, { createIfMissing: true });
    if (!group?.id) return res.status(404).json({ error: `${config.name} does not exist yet.` });

    if (action === 'remove') {
      if (!slotId) return res.status(400).json({ error: 'Missing slotId' });
      const slot = await fetchSlot(sbUrl, slotId);
      if (!slot || slot.featured_group_id !== group.id) return res.status(404).json({ error: 'Special not found' });
      const deleteRes = await fetch(`${sbUrl}/rest/v1/featured_slots?id=eq.${slotId}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
      });
      if (!deleteRes.ok) throw new Error('Failed to remove special');
      return res.status(204).end();
    }

    if (action === 'move') {
      if (!slotId || ![-1, 1].includes(Number(direction))) {
        return res.status(400).json({ error: 'Invalid move request' });
      }
      const slots = await fetchGroupSlots(sbUrl, group.id);
      const idx = slots.findIndex(slot => slot.id === slotId);
      if (idx < 0) return res.status(404).json({ error: 'Special not found' });
      const newIdx = idx + Number(direction);
      if (newIdx < 0 || newIdx >= slots.length) return res.status(204).end();
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
      return res.status(204).end();
    }

    if (action === 'note') {
      if (!slotId) return res.status(400).json({ error: 'Missing slotId' });
      const slot = await fetchSlot(sbUrl, slotId);
      if (!slot || slot.featured_group_id !== group.id) return res.status(404).json({ error: 'Special not found' });
      const patchRes = await fetch(`${sbUrl}/rest/v1/featured_slots?id=eq.${slotId}`, {
        method: 'PATCH',
        headers: serviceHeaders({
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        }),
        body: JSON.stringify({ sell_note: String(note || '') }),
      });
      if (!patchRes.ok) throw new Error('Failed to save note');
      return res.status(204).end();
    }

    if (action === 'confirm') {
      const slots = await fetchGroupSlots(sbUrl, group.id);
      if (!slots.length) return res.status(204).end();
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
      return res.status(204).end();
    }

    return res.status(400).json({ error: 'Unsupported action' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update specials' });
  }
}
