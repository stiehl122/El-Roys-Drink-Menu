(function bootstrapDomainConstants(globalScope) {
  if (!globalScope || globalScope.__HF_DOMAIN_CONSTANTS__) return;

  const RESTAURANTS = {
    LEROYS: { id: '00000000-0000-0000-0000-000000000010', name: "Leroy's Lounge", slug: 'leroys-lounge' },
    ELROYS: { id: '00000000-0000-0000-0000-000000000001', name: "El Roy's Cantina", slug: 'el-roys-cantina' },
  };

  const MENUS = {
    LEROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000020', restaurantId: RESTAURANTS.LEROYS.id, type: 'drinks', slug: 'leroys-lounge-drinks', name: "Leroy's Lounge Drinks" },
    LEROYS_FOOD: { id: '00000000-0000-0000-0000-000000000021', restaurantId: RESTAURANTS.LEROYS.id, type: 'food', slug: 'leroys-lounge-food', name: "Leroy's Lounge Food" },
    ELROYS_DRINKS: { id: '00000000-0000-0000-0000-000000000002', restaurantId: RESTAURANTS.ELROYS.id, type: 'drinks', slug: 'el-roys-cantina-drinks', name: "El Roy's Cantina Drinks" },
    ELROYS_FOOD: { id: '00000000-0000-0000-0000-000000000003', restaurantId: RESTAURANTS.ELROYS.id, type: 'food', slug: 'el-roys-cantina-food', name: "El Roy's Cantina Food" },
  };

  const KNOWN_RESTAURANT_ORDER = [RESTAURANTS.LEROYS.id, RESTAURANTS.ELROYS.id];
  const KNOWN_MENU_ORDER = [
    MENUS.LEROYS_DRINKS.id,
    MENUS.LEROYS_FOOD.id,
    MENUS.ELROYS_DRINKS.id,
    MENUS.ELROYS_FOOD.id,
  ];

  const constants = {
    APP_VERSION: 'v0.8.9',
    RESTAURANT_TIME_ZONE: 'America/Detroit',
    RESTAURANTS,
    MENUS,
    KNOWN_RESTAURANT_ORDER,
    KNOWN_MENU_ORDER,
    LEGACY_MENU_SLUG_ALIASES: {
      'el-roys': MENUS.ELROYS_DRINKS.slug,
    },
    SITE_PATHS: {
      [RESTAURANTS.LEROYS.id]: '/leroyslounge',
      [RESTAURANTS.ELROYS.id]: '/elroyscantina',
    },
    SHARED_PAGE_PATHS: {
      manager: '/manager',
      admin: '/admin',
    },
  };

  globalScope.__HF_DOMAIN_CONSTANTS__ = freezeDeep(constants);
})(typeof globalThis !== 'undefined' ? globalThis : this);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.keys(value).forEach(key => {
    freezeDeep(value[key]);
  });
  return value;
}
