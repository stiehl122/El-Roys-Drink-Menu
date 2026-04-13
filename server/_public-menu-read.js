import {
  createPublicMenuPayload,
  isSupportedMenuId,
  parseMenuId,
  readMenuStateBundle,
} from './_menu-read.js';

export async function buildPublicMenuPayload(menuId) {
  if (!isSupportedMenuId(menuId)) {
    throw { status: 400, message: 'Unsupported menu_id' };
  }
  return createPublicMenuPayload(await readMenuStateBundle(menuId));
}

export { createPublicMenuPayload, isSupportedMenuId, parseMenuId, readMenuStateBundle };
