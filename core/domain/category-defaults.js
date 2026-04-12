(function bootstrapCategoryDefaults(globalScope) {
  if (!globalScope || globalScope.__HF_CATEGORY_DEFAULTS__) return;

  const palette = [
    'rgba(245,210,66,0.22)',
    'rgba(18,133,120,0.15)',
    'rgba(100,180,255,0.18)',
    'rgba(190,67,48,0.12)',
    'rgba(140,200,120,0.18)',
    'rgba(180,100,220,0.15)',
    'rgba(255,150,100,0.18)',
    'rgba(100,200,220,0.18)',
  ];

  const defaults = {
    ICON_COLOR_PALETTE: palette.slice(),
    DEFAULT_CATEGORY_DEFS: [
      { id: 'beer', icon: '🍺', color: palette[0], title: 'Beers on Tap', sub: 'Current draft offerings', placeholder: 'e.g. Modelo Especial...' },
      { id: 'canned', icon: '🍻', color: palette[4], title: 'Canned & Bottled', sub: 'Canned & bottled offerings', placeholder: 'e.g. Modelo Especial (can), Topo Chico...' },
      { id: 'cocktails', icon: '🍹', color: palette[5], title: 'Cocktails', sub: 'Craft cocktail offerings', placeholder: 'e.g. Paloma, Spicy Margarita...' },
      { id: 'tequila', icon: '🌶️', color: palette[1], title: 'Infused Tequila', sub: 'Rotating infused marg tequila', placeholder: 'e.g. Jalapeño-Pineapple Blanco...' },
      { id: 'frozen', icon: '🧊', color: palette[2], title: 'Frozen Marg', sub: 'Current frozen margarita flavor', placeholder: 'e.g. Strawberry Basil...' },
      { id: 'special', icon: '⭐', color: palette[3], title: 'Monthly Specials', sub: 'Featured cocktails & promos', placeholder: 'e.g. The Valentina — raspberry, grapefruit...' },
    ],
    DEFAULT_FOOD_CATEGORY_DEFS: [
      { key: 'starters', label: '🥗 Starters', icon: '🥗', color: palette[4], sub: '', placeholder: 'e.g. Chips & Salsa...' },
      { key: 'tacos', label: '🌮 Tacos', icon: '🌮', color: palette[0], sub: '', placeholder: 'e.g. Al Pastor...' },
      { key: 'entrees', label: '🍽 Entrees', icon: '🍽', color: palette[1], sub: '', placeholder: 'e.g. Enchiladas...' },
      { key: 'sides', label: '🫘 Sides', icon: '🫘', color: palette[2], sub: '', placeholder: 'e.g. Mexican Rice...' },
      { key: 'desserts', label: '🍮 Desserts', icon: '🍮', color: palette[3], sub: '', placeholder: 'e.g. Flan...' },
    ],
  };

  globalScope.__HF_CATEGORY_DEFAULTS__ = freezeDeep(defaults);
})(typeof globalThis !== 'undefined' ? globalThis : this);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.keys(value).forEach(key => {
    freezeDeep(value[key]);
  });
  return value;
}
