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

    const endpoint = cleanText(deps.endpoint || '/api/manager');
    const headers = deps.headers && typeof deps.headers === 'object' ? deps.headers : {};

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          action: 'product_lookup',
          barcode: normalizedBarcode,
        }),
      });
      if (!response || response.status === 404 || !response.ok) return null;

      const payload = await response.json();
      const name = cleanText(payload?.name);
      if (!name) return null;

      return {
        name,
        description: cleanText(payload?.description) || buildDescription(payload?.product || {}),
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
