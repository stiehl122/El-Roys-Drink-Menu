(function bootstrapOpenFoodFactsLookup(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function buildDescription(product) {
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

  async function lookupOpenFoodFactsProductImpl(barcode, deps = {}) {
    const normalizedBarcode = cleanText(barcode).replace(/\s+/g, '');
    if (!normalizedBarcode) return null;

    const fetchImpl = typeof deps.fetch === 'function'
      ? deps.fetch
      : (typeof globalScope.fetch === 'function' ? globalScope.fetch.bind(globalScope) : null);
    if (typeof fetchImpl !== 'function') return null;

    const baseUrl = cleanText(deps.baseUrl || 'https://world.openfoodfacts.org');
    const requestUrl = `${baseUrl}/api/v2/product/${encodeURIComponent(normalizedBarcode)}.json?fields=product_name,product_name_en,generic_name,generic_name_en,ingredients_text,ingredients_text_en,brands,quantity,packaging,packaging_text,status`;

    try {
      const response = await fetchImpl(requestUrl, {
        headers: { Accept: 'application/json' },
      });
      if (!response || response.status === 404 || !response.ok) return null;

      const payload = await response.json();
      if (!payload || payload.status !== 1 || !payload.product) return null;

      const product = payload.product;
      const name = cleanText(product.product_name_en || product.product_name);
      if (!name) return null;

      return {
        name,
        description: buildDescription(product),
      };
    } catch (_) {
      return null;
    }
  }

  modules.lookupOpenFoodFactsProduct = function lookupOpenFoodFactsProductBoundary(barcode, deps = {}) {
    return lookupOpenFoodFactsProductImpl(barcode, deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
