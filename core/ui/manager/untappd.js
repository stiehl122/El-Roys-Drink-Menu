(function bootstrapUntappdLookup(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  async function postUntappdAction(action, payload = {}, deps = {}) {
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
          action,
          ...payload,
        }),
      });

      if (!response || !response.ok) return null;
      return response.json().catch(() => null);
    } catch (_) {
      return null;
    }
  }

  modules.searchUntappdBeers = function searchUntappdBeersBoundary(query, deps = {}) {
    const normalizedQuery = cleanText(query);
    return postUntappdAction('untappd_search', { query: normalizedQuery }, deps)
      .then(payload => {
        const beers = Array.isArray(payload?.beers) ? payload.beers : [];
        return beers
          .map(entry => ({
            bid: Number.isFinite(Number(entry?.bid)) ? Number(entry.bid) : entry?.bid,
            name: cleanText(entry?.name || entry?.beer_name),
            breweryName: cleanText(entry?.breweryName || entry?.brewery_name),
            style: cleanText(entry?.style || entry?.beer_style),
            abv: Number.isFinite(Number(entry?.abv)) ? Number(entry.abv) : null,
          }))
          .filter(entry => entry.bid !== undefined && entry.bid !== null && entry.name);
      });
  };

  modules.previewUntappdBeerImport = function previewUntappdBeerImportBoundary(bid, deps = {}) {
    const normalizedBid = Number.isFinite(Number(bid)) ? Number(bid) : cleanText(bid);
    return postUntappdAction('untappd_preview', {
      bid: normalizedBid,
      includeBrewery: Boolean(deps.includeBrewery),
    }, deps)
      .then(payload => payload?.preview || null);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
