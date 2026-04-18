const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?wave22=${Date.now()}-${Math.random()}`);
}

function withEnv(overrides, fn) {
  const snapshot = {};
  const keys = Object.keys(overrides);
  keys.forEach(key => {
    snapshot[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      keys.forEach(key => {
        if (snapshot[key] === undefined) delete process.env[key];
        else process.env[key] = snapshot[key];
      });
    });
}

test('api/manager wires Untappd actions through the shared server gateway', () => {
  const source = read('api/manager.js');

  assert.match(source, /from '\.\.\/server\/_untappd\.js'/);
  assert.match(source, /untappd_search/);
  assert.match(source, /untappd_preview/);
  assert.match(source, /searchUntappdBeers/);
  assert.match(source, /previewUntappdBeerImport/);
});

test('server untappd gateway normalizes search terms and caps results at five', async () => {
  const untappd = await importApiModule('server/_untappd.js');
  let calledUrl = null;

  const previousFetch = global.fetch;
  global.fetch = async url => {
    calledUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          beers: {
            items: Array.from({ length: 8 }, (_, index) => ({
              beer: {
                bid: index + 1,
                beer_name: `Beer ${index + 1}`,
                beer_style: 'IPA',
                beer_abv: 6.5,
              },
              brewery: {
                brewery_name: 'Test Brewery',
              },
            })),
          },
        },
      }),
    };
  };

  try {
    await withEnv({
      UNTAPPD_CLIENT_ID: 'client-id',
      UNTAPPD_CLIENT_SECRET: 'client-secret',
      UNTAPPD_USER_AGENT: 'El Roys Menu (client-id)',
    }, async () => {
      const result = await untappd.searchUntappdBeers('Draft Can Tallboy 16 oz 6 pk West Coast IPA');

      assert.match(calledUrl, /\/v4\/search\/beer\?/);
      assert.match(calledUrl, /q=West\+Coast\+IPA/);
      assert.match(calledUrl, /limit=5/);
      assert.match(calledUrl, /sort=checkin/);
      assert.equal(result.length, 5);
      assert.deepEqual(result[0], {
        bid: 1,
        name: 'Beer 1',
        breweryName: 'Test Brewery',
        style: 'IPA',
        abv: 6.5,
      });
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test('server untappd gateway preserves numeric beer names while stripping packaging noise', async () => {
  const untappd = await importApiModule('server/_untappd.js');

  assert.equal(
    untappd.normalizeUntappdSearchQuery('805 16 oz 6 pk can'),
    '805'
  );
  assert.equal(
    untappd.normalizeUntappdSearchQuery('90 Minute IPA bottle'),
    '90 Minute IPA'
  );
  assert.equal(
    untappd.normalizeUntappdSearchQuery('420 Extra Pale Ale draft'),
    '420 Extra Pale Ale'
  );
});

test('server untappd gateway returns an empty list for no search matches', async () => {
  const untappd = await importApiModule('server/_untappd.js');
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ response: { beers: { items: [] } } }),
  });

  try {
    await withEnv({
      UNTAPPD_CLIENT_ID: 'client-id',
      UNTAPPD_CLIENT_SECRET: 'client-secret',
      UNTAPPD_USER_AGENT: 'El Roys Menu (client-id)',
    }, async () => {
      assert.deepEqual(await untappd.searchUntappdBeers('unlikely beer name'), []);
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test('server untappd preview shapes description from style and abv only', async () => {
  const untappd = await importApiModule('server/_untappd.js');
  const previousFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async url => {
    fetchCalls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          beer: {
            bid: 501,
            beer_name: 'Big Mosaic',
            beer_style: 'IPA',
            beer_abv: 6.7,
            brewery: {
              brewery_name: 'Example Brewery',
            },
          },
        },
      }),
    };
  };

  try {
    await withEnv({
      UNTAPPD_CLIENT_ID: 'client-id',
      UNTAPPD_CLIENT_SECRET: 'client-secret',
      UNTAPPD_USER_AGENT: 'El Roys Menu (client-id)',
    }, async () => {
      const result = await untappd.previewUntappdBeerImport(501, { includeBrewery: true });

      assert.equal(fetchCalls.length, 1);
      assert.match(fetchCalls[0], /\/v4\/beer\/info\/501\?/);
      assert.deepEqual(result, {
        bid: 501,
        name: 'Big Mosaic',
        breweryName: 'Example Brewery',
        description: 'IPA • 6.7% ABV',
      });
    });
  } finally {
    global.fetch = previousFetch;
  }
});

test('server untappd gateway returns null for preview misses and missing env fails closed with 503', async () => {
  const untappd = await importApiModule('server/_untappd.js');
  const previousFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: {} }),
    };
  };

  try {
    await withEnv({
      UNTAPPD_CLIENT_ID: 'client-id',
      UNTAPPD_CLIENT_SECRET: 'client-secret',
      UNTAPPD_USER_AGENT: 'El Roys Menu (client-id)',
    }, async () => {
      assert.equal(await untappd.previewUntappdBeerImport(999), null);
    });

    await withEnv({
      UNTAPPD_CLIENT_ID: undefined,
      UNTAPPD_CLIENT_SECRET: undefined,
      UNTAPPD_USER_AGENT: undefined,
    }, async () => {
      await assert.rejects(
        () => untappd.searchUntappdBeers('West Coast IPA'),
        error => error.status === 503
      );
      assert.equal(fetchCount, 1);
    });
  } finally {
    global.fetch = previousFetch;
  }
});
