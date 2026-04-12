const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { getState, loadSandboxWithScripts } = require('./helpers/runtime.cjs');

function buildInjectedDomainConstants() {
  const restaurants = {
    LEROYS: { id: 'restaurant-leroys-test', name: "Leroy's Lounge", slug: 'leroys-lounge' },
    ELROYS: { id: 'restaurant-elroys-test', name: "El Roy's Cantina", slug: 'el-roys-cantina' },
  };
  const menus = {
    LEROYS_DRINKS: { id: 'menu-leroys-drinks-test', restaurantId: restaurants.LEROYS.id, type: 'drinks', slug: 'leroys-lounge-drinks', name: "Leroy's Lounge Drinks" },
    LEROYS_FOOD: { id: 'menu-leroys-food-test', restaurantId: restaurants.LEROYS.id, type: 'food', slug: 'leroys-lounge-food', name: "Leroy's Lounge Food" },
    ELROYS_DRINKS: { id: 'menu-elroys-drinks-test', restaurantId: restaurants.ELROYS.id, type: 'drinks', slug: 'el-roys-cantina-drinks', name: "El Roy's Cantina Drinks" },
    ELROYS_FOOD: { id: 'menu-elroys-food-test', restaurantId: restaurants.ELROYS.id, type: 'food', slug: 'el-roys-cantina-food', name: "El Roy's Cantina Food" },
  };
  return {
    APP_VERSION: 'v9.9.9-test',
    RESTAURANTS: restaurants,
    MENUS: menus,
    KNOWN_RESTAURANT_ORDER: [restaurants.LEROYS.id, restaurants.ELROYS.id],
    KNOWN_MENU_ORDER: [menus.LEROYS_DRINKS.id, menus.LEROYS_FOOD.id, menus.ELROYS_DRINKS.id, menus.ELROYS_FOOD.id],
    RESTAURANT_SPECIALS: {
      [restaurants.LEROYS.id]: {
        canonicalId: 'leroyslounge-specials',
        name: "Leroy's Specials",
        menuIds: [menus.LEROYS_DRINKS.id, menus.LEROYS_FOOD.id],
      },
      [restaurants.ELROYS.id]: {
        canonicalId: 'elroyscantina-specials',
        name: "El Roy's Specials",
        menuIds: [menus.ELROYS_DRINKS.id, menus.ELROYS_FOOD.id],
      },
    },
    LEGACY_MENU_SLUG_ALIASES: {
      'el-roys': menus.ELROYS_DRINKS.slug,
    },
    SITE_PATHS: {
      [restaurants.LEROYS.id]: '/leroyslounge',
      [restaurants.ELROYS.id]: '/elroyscantina',
    },
    SHARED_PAGE_PATHS: {
      manager: '/manager',
      admin: '/admin',
    },
  };
}

function buildInjectedCategoryDefaults() {
  return {
    ICON_COLOR_PALETTE: [
      'rgba(1,2,3,0.1)',
      'rgba(4,5,6,0.1)',
      'rgba(7,8,9,0.1)',
      'rgba(10,11,12,0.1)',
    ],
    DEFAULT_CATEGORY_DEFS: [
      { id: 'test-drink-category', icon: '🧪', color: 'rgba(1,2,3,0.1)', title: 'Test Drinks', sub: 'Testing only', placeholder: 'e.g. Test Margarita...' },
    ],
    DEFAULT_FOOD_CATEGORY_DEFS: [
      { key: 'test-food-category', label: '🧪 Test Food', icon: '🧪', color: 'rgba(4,5,6,0.1)', sub: '', placeholder: 'e.g. Test Tacos...' },
    ],
  };
}

test('core domain constants bootstrap exposes canonical menu constants', () => {
  const sandbox = loadSandboxWithScripts(['core/domain/constants.js']);
  assert.equal(
    getState(sandbox, 'globalThis.__HF_DOMAIN_CONSTANTS__.MENUS.ELROYS_DRINKS.slug'),
    'el-roys-cantina-drinks'
  );
});

test('app runtime consumes injected domain constants through one boundary', () => {
  const domain = buildInjectedDomainConstants();
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_DOMAIN_CONSTANTS__: domain,
  });

  assert.equal(getState(sandbox, 'APP_VERSION'), 'v9.9.9-test');
  assert.equal(getState(sandbox, 'MENUS.LEROYS_DRINKS.id'), domain.MENUS.LEROYS_DRINKS.id);
  assert.equal(getState(sandbox, 'SITE_PATHS[RESTAURANTS.LEROYS.id]'), '/leroyslounge');
});

test('app runtime consumes injected category defaults through one boundary', () => {
  const defaults = buildInjectedCategoryDefaults();
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_CATEGORY_DEFAULTS__: defaults,
  });

  assert.equal(getState(sandbox, 'DEFAULT_CATEGORY_DEFS[0].id'), 'test-drink-category');
  assert.equal(getState(sandbox, 'DEFAULT_FOOD_CATEGORY_DEFS[0].key'), 'test-food-category');
  assert.equal(getState(sandbox, "getDefaultCategoryDefsForMenuType('drinks')[0].id"), 'test-drink-category');
});

test('api auth helper resolves restaurant specials from shared domain boundary', () => {
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'api', '_auth.js'), 'utf8');

  assert.match(authSource, /__HF_DOMAIN_CONSTANTS__/);
  assert.doesNotMatch(authSource, /const RESTAURANT_SPECIALS\\s*=\\s*\\{/);
});
