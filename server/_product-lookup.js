import { fetchWithTimeout } from './_fetch.js';

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildDescription(product = {}) {
  const generic = cleanText(product?.generic_name_en || product?.generic_name);
  if (generic) return generic;

  const ingredients = cleanText(product?.ingredients_text_en || product?.ingredients_text);
  if (ingredients) return ingredients;

  const details = [
    cleanText(product?.brands),
    cleanText(product?.quantity),
    cleanText(product?.packaging_text || product?.packaging),
  ].filter(Boolean);
  if (details.length) return details.join(' • ');

  return 'Product details imported from Open Food Facts';
}

export async function lookupProductByBarcode(barcode = '') {
  const normalizedBarcode = cleanText(barcode).replace(/\s+/g, '');
  if (!normalizedBarcode) throw { status: 400, message: 'Enter a barcode first.' };

  const response = await fetchWithTimeout(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalizedBarcode)}.json?fields=product_name,product_name_en,generic_name,generic_name_en,ingredients_text,ingredients_text_en,brands,quantity,packaging,packaging_text,status`,
    { headers: { Accept: 'application/json' } },
    { timeoutMs: 8000 }
  );
  if (!response.ok) {
    throw { status: 502, message: 'Open Food Facts is unavailable right now.' };
  }

  const payload = await response.json().catch(() => null);
  if (!payload || payload.status !== 1 || !payload.product) {
    throw { status: 404, message: 'No product was found for that barcode.' };
  }

  const product = payload.product;
  const name = cleanText(product.product_name_en || product.product_name)
    || cleanText(product.brands)
    || 'Scanned Item';

  return {
    barcode: normalizedBarcode,
    name,
    description: buildDescription(product),
  };
}
