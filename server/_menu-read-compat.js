import { getKnownMenus, getKnownRestaurants } from './_menu-read.js';

export function sortKnownMenus(menus = []) {
  const knownOrder = getKnownMenus().map(menu => menu.id);
  return menus.slice().sort((a, b) => knownOrder.indexOf(a.id) - knownOrder.indexOf(b.id));
}

export function getKnownRestaurantsCompat() {
  return getKnownRestaurants();
}

export { getKnownRestaurantsCompat as getKnownRestaurants };
