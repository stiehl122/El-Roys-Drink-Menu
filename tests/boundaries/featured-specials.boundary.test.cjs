const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');

async function importFeaturedSpecials() {
  const fileUrl = pathToFileURL(path.join(ROOT, 'core/domain/featured-specials.js')).href;
  return import(`${fileUrl}?plan=${Date.now()}-${Math.random()}`);
}

test('ensureFeaturedSpecialsCategory inserts the fixed category first and folds legacy special items into it', async () => {
  const module = await importFeaturedSpecials();
  const next = module.ensureFeaturedSpecialsCategory([
    {
      id: 'cocktails-id',
      key: 'cocktails',
      label: 'Cocktails',
      display_order: 1,
      items: [],
    },
    {
      id: 'legacy-special-id',
      key: 'special',
      label: 'Monthly Specials',
      display_order: 2,
      items: [
        { id: 'legacy-1', name: 'Spicy Mango Marg', featured_enabled: true, on_menu: true, visibility: 'public' },
      ],
    },
  ], { menuId: 'menu-drinks', menuType: 'drinks' });

  assert.equal(next[0].key, 'featured_specials');
  assert.equal(next[0].label, 'Featured Specials');
  assert.deepEqual(next[0].items.map(item => item.id), ['legacy-1']);
  assert.equal(next.some(category => category.key === 'special'), false);
});

test('deriveFeaturedItems returns enabled items in category order only', async () => {
  const module = await importFeaturedSpecials();
  const items = module.deriveFeaturedItems([
    {
      id: 'featured_specials',
      items: [
        { id: 'item-a', name: 'Happy Hour Marg', featured_enabled: true, on_menu: true, visibility: 'public' },
        { id: 'item-b', name: 'Weekend Taco Plate', featured_enabled: false, on_menu: true, visibility: 'public' },
        { id: 'item-off', name: 'Off Menu Deal', featured_enabled: true, on_menu: true, visibility: 'off_menu' },
        { id: 'item-c', name: 'Late Night Deal', featured_enabled: true, on_menu: true, visibility: 'public' },
      ],
    },
  ]);

  assert.deepEqual(items.map(item => item.id), ['item-a', 'item-c']);
});

test('deriveFeaturedItems recognizes legacy special categories and excludes non-public items', async () => {
  const module = await importFeaturedSpecials();
  const items = module.deriveFeaturedItems([
    {
      key: 'special',
      items: [
        { id: 'item-a', name: 'Happy Hour Marg', featured_enabled: true, onMenu: true, visibility: 'public' },
        { id: 'item-b', name: 'Back Bar Pour', featured_enabled: true, onMenu: true, visibility: 'off_menu' },
        { id: 'item-c', name: 'Server Hidden Pour', featured_enabled: true, on_menu: false, visibility: 'public' },
      ],
    },
  ]);

  assert.deepEqual(items.map(item => item.id), ['item-a']);
});
