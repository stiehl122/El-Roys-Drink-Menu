#!/usr/bin/env node
/**
 * migrate-firebase-to-supabase.js
 * v0.7.0 — One-time migration: Firebase Realtime DB → Supabase
 *
 * Usage:
 *   FIREBASE_URL=https://... SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-firebase-to-supabase.js
 *
 * Idempotent: checks for existing restaurant/menu slug before inserting.
 * Run on staging first. Run on production with the bar closed.
 * Keep Firebase live and readable for one week post-cutover as a rollback option.
 */

const FIREBASE_URL         = process.env.FIREBASE_URL?.replace(/\/+$/, '');
const SUPABASE_URL         = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FIREBASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: FIREBASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sbHeaders = {
  'apikey':        SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type':  'application/json',
};

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPost(path, body, prefer = 'return=representation') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method:  'POST',
    headers: { ...sbHeaders, 'Prefer': prefer },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return prefer.includes('representation') ? res.json() : res.text();
}

async function main() {
  console.log('📥 Reading Firebase snapshot…');
  const fbRes = await fetch(`${FIREBASE_URL}/menu.json`);
  if (!fbRes.ok) throw new Error(`Firebase read failed: ${fbRes.status}`);
  const fb = await fbRes.json();
  if (!fb) { console.log('Firebase snapshot is empty. Aborting.'); process.exit(0); }

  // ── RESTAURANT ──────────────────────────────────────────────────────────────
  console.log('🏪 Checking restaurant…');
  let [existingRestaurant] = await sbGet(`restaurants?slug=eq.elroys&select=id`);
  let restaurantId;
  if (existingRestaurant) {
    restaurantId = existingRestaurant.id;
    console.log(`   Exists: ${restaurantId}`);
  } else {
    const [restaurant] = await sbPost('restaurants', { name: "El Roy's", slug: 'elroys' });
    restaurantId = restaurant.id;
    console.log(`   Created: ${restaurantId}`);
  }

  // ── MENU ────────────────────────────────────────────────────────────────────
  console.log('📋 Checking menu…');
  let [existingMenu] = await sbGet(`menus?restaurant_id=eq.${restaurantId}&slug=eq.drinks&select=id`);
  let menuId;
  if (existingMenu) {
    menuId = existingMenu.id;
    console.log(`   Exists: ${menuId}`);
  } else {
    const [menu] = await sbPost('menus', {
      restaurant_id: restaurantId,
      name:          "El Roy's Drink Menu",
      slug:          'drinks',
      type:          'drinks',
    });
    menuId = menu.id;
    console.log(`   Created: ${menuId}`);
  }

  // ── CATEGORIES ──────────────────────────────────────────────────────────────
  const fbCategories = fb._config?.categories || [
    { id: 'beer',      icon: '🍺', color: 'rgba(245,210,66,0.22)',   title: 'Beers on Tap',     sub: 'Current draft offerings',          placeholder: 'e.g. Modelo Especial...' },
    { id: 'canned',    icon: '🍻', color: 'rgba(140,200,120,0.18)',  title: 'Canned & Bottled', sub: 'Canned & bottled offerings',       placeholder: 'e.g. Modelo Especial (can)...' },
    { id: 'cocktails', icon: '🍹', color: 'rgba(180,100,220,0.15)',  title: 'Cocktails',        sub: 'Craft cocktail offerings',         placeholder: 'e.g. Paloma, Spicy Margarita...' },
    { id: 'tequila',   icon: '🌶️', color: 'rgba(18,133,120,0.15)',   title: 'Infused Tequila',  sub: 'Rotating infused marg tequila',   placeholder: 'e.g. Jalapeño-Pineapple Blanco...' },
    { id: 'frozen',    icon: '🧊', color: 'rgba(100,180,255,0.18)',  title: 'Frozen Marg',      sub: 'Current frozen margarita flavor',  placeholder: 'e.g. Strawberry Basil...' },
    { id: 'special',   icon: '⭐', color: 'rgba(190,67,48,0.12)',    title: 'Monthly Specials', sub: 'Featured cocktails & promos',      placeholder: 'e.g. The Valentina...' },
  ];

  console.log(`📁 Migrating ${fbCategories.length} categories…`);
  const categoryMap = {}; // catKey → { id (uuid), key }

  for (const [idx, cat] of fbCategories.entries()) {
    const [existing] = await sbGet(`categories?menu_id=eq.${menuId}&key=eq.${cat.id}&select=id`);
    if (existing) {
      categoryMap[cat.id] = { id: existing.id, key: cat.id };
      console.log(`   [skip] ${cat.id} — already exists`);
    } else {
      const [row] = await sbPost('categories', {
        menu_id:       menuId,
        key:           cat.id,
        label:         cat.title || cat.id,
        icon:          cat.icon        || '',
        color:         cat.color       || '',
        sub:           cat.sub         || '',
        placeholder:   cat.placeholder || '',
        display_order: idx,
      });
      categoryMap[cat.id] = { id: row.id, key: cat.id };
      console.log(`   ✓ ${cat.id} → ${row.id}`);
    }
  }

  // ── UNCATEGORIZED POOL ───────────────────────────────────────────────────────
  const uncatKey = '__uncategorized__';
  let uncatCategoryId = null;
  if (fb[uncatKey]?.items?.length) {
    const [existingUncat] = await sbGet(`categories?menu_id=eq.${menuId}&key=eq.${uncatKey}&select=id`);
    if (existingUncat) {
      uncatCategoryId = existingUncat.id;
    } else {
      const [row] = await sbPost('categories', {
        menu_id: menuId, key: uncatKey,
        label: 'Uncategorized', icon: '', color: '', sub: '', placeholder: '',
        display_order: 9999,
      });
      uncatCategoryId = row.id;
    }
  }

  // ── ITEMS ────────────────────────────────────────────────────────────────────
  let totalItems = 0;
  for (const catKey of Object.keys(categoryMap)) {
    const fbCat = fb[catKey];
    if (!fbCat?.items?.length) continue;
    const catUuid = categoryMap[catKey].id;

    const itemRows = [];
    const existingItems = await sbGet(`items?category_id=eq.${catUuid}&select=name`);
    const existingNames = new Set(existingItems.map(i => i.name.trim().toLowerCase()));

    fbCat.items.forEach((item, idx) => {
      if (existingNames.has((item.name || '').trim().toLowerCase())) {
        console.log(`   [skip item] ${catKey}/${item.name} — already exists`);
        return;
      }
      itemRows.push({
        category_id:     catUuid,
        name:            item.name || '',
        desc:            item.desc || '',
        recipe:          item.recipe || [],
        is_eighty_sixed: item.eightySixed || false,
        on_menu:         item.onMenu !== false,
        display_order:   idx,
      });
    });

    if (itemRows.length) {
      await sbPost('items', itemRows, 'return=minimal');
      console.log(`   ✓ ${catKey}: ${itemRows.length} items`);
      totalItems += itemRows.length;
    }
  }

  // Uncategorized items
  if (uncatCategoryId && fb[uncatKey]?.items?.length) {
    const itemRows = fb[uncatKey].items.map((item, idx) => ({
      category_id: uncatCategoryId,
      name:        item.name || '',
      desc:        item.desc || '',
      recipe:      item.recipe || [],
      is_eighty_sixed: false,
      on_menu:     false,
      display_order: idx,
    }));
    if (itemRows.length) {
      await sbPost('items', itemRows, 'return=minimal');
      console.log(`   ✓ __uncategorized__: ${itemRows.length} items`);
      totalItems += itemRows.length;
    }
  }

  // ── MENU META ────────────────────────────────────────────────────────────────
  console.log('⚙️  Writing menu_meta…');
  const lastSentState = {};
  fbCategories.forEach(cat => {
    lastSentState[cat.id] = fb[cat.id]?.lastSent || [];
  });
  const design = fb._config?.design || {};
  const botId  = ''; // bot ID comes from GROUPME_BOT_ID env var; leave blank in DB

  const [existingMeta] = await sbGet(`menu_meta?menu_id=eq.${menuId}&select=menu_id`);
  if (existingMeta) {
    console.log('   menu_meta already exists — skipping');
  } else {
    await sbPost('menu_meta', {
      menu_id:              menuId,
      bot_id:               botId,
      last_updated_ts:      fb._meta?.lastUpdatedTs ? Number(fb._meta.lastUpdatedTs) : null,
      last_sent_ts:         fb._meta?.lastSentTs    ? Number(fb._meta.lastSentTs)    : null,
      last_sent_state:      lastSentState,
      last_sent_categories: fb._meta?.lastSentCategories || [],
      design:               design,
    }, 'return=minimal');
    console.log('   ✓ menu_meta created');
  }

  console.log(`\n✅ Migration complete — ${totalItems} items across ${fbCategories.length} categories.`);
  console.log(`   Menu ID: ${menuId}`);
  console.log(`   Store this in MENU_ID or let the app auto-discover via menus?limit=1`);
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
