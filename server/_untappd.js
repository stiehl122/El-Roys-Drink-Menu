const UNTAPPD_BASE_URL = 'https://api.untappd.com/v4/';
const SEARCH_LIMIT = 5;

const NOISE_WORDS = new Set([
  'draft',
  'tap',
  'can',
  'bottle',
  'tallboy',
  'crowler',
  'growler',
  'oz',
  'ml',
  'pk',
  'pack',
]);

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeBid(value) {
  const text = cleanText(value);
  if (!text) return '';
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : text;
}

function normalizeUntappdQuery(query = '') {
  const tokens = cleanText(query)
    .split(' ')
    .map(token => token.trim())
    .filter(Boolean);

  const filtered = tokens.filter(token => {
    const lower = token.toLowerCase();
    if (NOISE_WORDS.has(lower)) return false;
    if (/^\d+$/.test(lower)) return false;
    if (/^\d+(?:\.\d+)?(?:oz|ml)$/.test(lower)) return false;
    if (/^\d+(?:\.\d+)?-?(?:pk|pack)$/.test(lower)) return false;
    if (/^\d+(?:\.\d+)?(?:oz|ml)?-?(?:pk|pack)$/.test(lower)) return false;
    return true;
  });

  return filtered.join(' ').replace(/\s+/g, ' ').trim();
}

function requireUntappdConfig() {
  const clientId = cleanText(process.env.UNTAPPD_CLIENT_ID);
  const clientSecret = cleanText(process.env.UNTAPPD_CLIENT_SECRET);
  const userAgent = cleanText(process.env.UNTAPPD_USER_AGENT);
  if (!clientId || !clientSecret || !userAgent) {
    throw { status: 503, message: 'Untappd is unavailable right now.' };
  }
  return { clientId, clientSecret, userAgent };
}

function buildUntappdUrl(pathname, params = {}) {
  const url = new URL(String(pathname || '').replace(/^\/+/, ''), UNTAPPD_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

function getBeerInfo(payload = {}) {
  return payload?.response?.beer || payload?.beer || null;
}

function getBeerSearchItems(payload = {}) {
  const items = payload?.response?.beers?.items
    || payload?.beers?.items
    || payload?.beers
    || [];
  return Array.isArray(items) ? items : [];
}

function extractBeerBid(beer = {}) {
  const bid = normalizeBid(beer?.bid ?? beer?.beer_bid ?? beer?.beer?.bid);
  return bid;
}

function extractBeerName(beer = {}) {
  return cleanText(
    beer?.beer_name
    || beer?.beer_name_short
    || beer?.beer?.beer_name
    || beer?.name
  );
}

function extractBreweryName(entry = {}) {
  return cleanText(
    entry?.brewery?.brewery_name
    || entry?.brewery_name
    || entry?.beer?.brewery?.brewery_name
    || entry?.beer?.brewery_name
  );
}

function extractStyleName(beer = {}) {
  return cleanText(
    beer?.beer_style
    || beer?.style
    || beer?.style_name
    || beer?.beer_style_name
    || beer?.beer?.beer_style
  );
}

function extractAbvValue(beer = {}) {
  const raw = beer?.beer_abv ?? beer?.abv ?? beer?.beer?.beer_abv;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildPreviewDescription(beer = {}) {
  const style = extractStyleName(beer);
  const abv = extractAbvValue(beer);
  const parts = [];
  if (style) parts.push(style);
  if (abv !== null) parts.push(`${String(Number(abv))}% ABV`);
  return parts.join(' • ');
}

async function readUntappdJson(url, userAgent) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
    },
  });

  if (!response.ok) {
    throw { status: 502, message: 'Untappd is unavailable right now.' };
  }

  return response.json().catch(() => null);
}

function mapSearchResults(payload = {}) {
  return getBeerSearchItems(payload)
    .map(entry => {
      const beer = entry?.beer || entry || {};
      const bid = extractBeerBid(beer);
      const name = extractBeerName(beer);
      if (!bid || !name) return null;
      const breweryName = extractBreweryName(entry);
      return {
        bid,
        name,
        breweryName: breweryName || '',
        style: extractStyleName(beer),
        abv: extractAbvValue(beer),
      };
    })
    .filter(Boolean)
    .slice(0, SEARCH_LIMIT);
}

export function normalizeUntappdSearchQuery(query = '') {
  return normalizeUntappdQuery(query);
}

export async function searchUntappdBeers(query = '') {
  const normalizedQuery = normalizeUntappdQuery(query);
  if (!normalizedQuery) return [];

  const { clientId, clientSecret, userAgent } = requireUntappdConfig();
  const url = buildUntappdUrl('/search/beer', {
    q: normalizedQuery,
    limit: SEARCH_LIMIT,
    sort: 'checkin',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const payload = await readUntappdJson(url, userAgent);
  return mapSearchResults(payload);
}

export async function previewUntappdBeerImport(bid, { includeBrewery = false } = {}) {
  const normalizedBid = normalizeBid(bid);
  if (!normalizedBid) return null;

  const { clientId, clientSecret, userAgent } = requireUntappdConfig();
  const url = buildUntappdUrl(`/beer/info/${encodeURIComponent(String(normalizedBid))}`, {
    compact: 'true',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const payload = await readUntappdJson(url, userAgent);
  const beer = getBeerInfo(payload);
  if (!beer) return null;

  const name = extractBeerName(beer);
  if (!name) return null;

  const result = {
    bid: normalizeBid(beer?.bid ?? beer?.beer_bid ?? normalizedBid),
    name,
    description: buildPreviewDescription(beer),
  };

  if (includeBrewery) {
    const breweryName = extractBreweryName(beer);
    if (breweryName) result.breweryName = breweryName;
  }

  return result;
}
