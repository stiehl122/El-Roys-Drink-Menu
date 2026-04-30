const assert = require('node:assert/strict');
const test = require('node:test');

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function installPublicMenuFetch({
  menuId = '00000000-0000-0000-0000-000000000020',
  restaurantId = '00000000-0000-0000-0000-000000000010',
  meta = {},
  design = {},
} = {}) {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes(`/rest/v1/menus?id=eq.${menuId}&select=id,name,slug,type,restaurant_id,archived&limit=1`)) {
      return {
        ok: true,
        async json() {
          return [{
            id: menuId,
            name: "Leroy's Lounge Drinks",
            slug: 'leroys-lounge-drinks',
            type: 'drinks',
            restaurant_id: restaurantId,
            archived: false,
          }];
        },
      };
    }
    if (href.includes(`/rest/v1/categories?menu_id=eq.${menuId}&select=*,items(*)&order=display_order.asc`)) {
      return {
        ok: true,
        async json() {
          return [{
            id: 'cat-1',
            menu_id: menuId,
            key: 'classics',
            label: 'Classics',
            display_order: 1,
            items: [{
              id: 'item-1',
              name: 'House Old Fashioned',
              desc: 'Bitters, citrus, bourbon',
              recipe: ['bourbon', 'bitters'],
              price: '12',
              display_order: 1,
              on_menu: true,
              visibility: 'public',
              show_description: true,
              show_recipe: true,
            }],
          }, {
            id: 'featured_specials',
            menu_id: menuId,
            key: 'featured_specials',
            label: 'Featured Specials',
            display_order: 0,
            items: [{
              id: 'special-1',
              name: 'Featured Highball',
              price: '10',
              display_order: 1,
              on_menu: true,
              visibility: 'public',
              show_description: true,
            }],
          }];
        },
      };
    }
    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=last_updated_ts,draft_saved_ts,last_sent_ts&limit=1`)) {
      return {
        ok: true,
        async json() {
          return [{
            last_updated_ts: meta.last_updated_ts,
            draft_saved_ts: meta.draft_saved_ts,
            last_sent_ts: meta.last_sent_ts,
          }];
        },
      };
    }
    if (href.includes(`/rest/v1/menu_meta?menu_id=eq.${menuId}&select=*&limit=1`)) {
      return {
        ok: true,
        async json() {
          return [{
            last_updated_ts: meta.last_updated_ts,
            last_sent_ts: meta.last_sent_ts,
            last_sent_categories: meta.last_sent_categories || [],
            last_sent_state: meta.last_sent_state || {},
          }];
        },
      };
    }
    if (href.includes(`/rest/v1/restaurants?id=eq.${restaurantId}&select=id,name,slug,design,use_custom_design&limit=1`)) {
      return {
        ok: true,
        async json() {
          return [{
            id: restaurantId,
            name: "Leroy's Lounge",
            slug: 'leroys-lounge',
            design,
            use_custom_design: true,
          }];
        },
      };
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };
  return () => {
    global.fetch = originalFetch;
  };
}

function installMenuIndexFetch(menuRows = []) {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/menus?id=in.') && href.includes('&select=id,name,slug,type,restaurant_id,archived&order=name.asc')) {
      return {
        ok: true,
        async json() {
          return menuRows;
        },
      };
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };
  return () => {
    global.fetch = originalFetch;
  };
}

test('public JSON cache helper emits stable ETag and shared cache headers', async () => {
  const { buildPublicJsonCacheHeaders } = await import('../server/_public-cache.js');
  const headers = buildPublicJsonCacheHeaders({
    action: 'menu',
    revision: 1712705100000,
    appVersion: 'v1.2.3',
  });

  assert.equal(headers['Cache-Control'], 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
  assert.equal(headers.ETag, '"menu:v1.2.3:1712705100000"');
  assert.equal(headers.Vary, 'Accept-Encoding');
});

test('public JSON cache helper marks matching if-none-match as not modified', async () => {
  const { buildPublicJsonCacheHeaders, isPublicJsonNotModified } = await import('../server/_public-cache.js');
  const headers = buildPublicJsonCacheHeaders({
    action: 'landing',
    revision: 44,
    appVersion: 'v9',
  });

  assert.equal(isPublicJsonNotModified({ headers: { 'if-none-match': headers.ETag } }, headers), true);
  assert.equal(isPublicJsonNotModified({ headers: { 'if-none-match': '"other", W/"landing:v9:44"' } }, headers), true);
  assert.equal(isPublicJsonNotModified({ headers: { 'if-none-match': '"other"' } }, headers), false);
});

test('public revision payload hashes the canonical public menu payload for polling', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const menuId = '00000000-0000-0000-0000-000000000020';
  const restoreFetch = installPublicMenuFetch({
    menuId,
    meta: {
      last_updated_ts: 123,
      last_sent_ts: 100,
      last_sent_categories: ['classics'],
      last_sent_state: { classics: [{ id: 'item-1', name: 'House Old Fashioned' }] },
    },
    design: { theme: 'brick' },
  });

  try {
    const { readPublicMenuRevision } = await import(`../server/_menu-read.js?publicRevision=${Date.now()}-${Math.random()}`);
    const payload = await readPublicMenuRevision(menuId);
    assert.equal(payload.menuId, menuId);
    assert.match(payload.revision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(payload.lastUpdatedTs, 123);
    assert.equal(payload.lastSentTs, 100);
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test('public API returns 304 for matching revision ETag', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const menuId = '00000000-0000-0000-0000-000000000020';
  const restoreFetch = installPublicMenuFetch({
    menuId,
    meta: {
      last_updated_ts: 123,
      last_sent_ts: 100,
      last_sent_categories: ['classics'],
      last_sent_state: { classics: [{ id: 'item-1', name: 'House Old Fashioned' }] },
    },
    design: { theme: 'brick' },
  });
  const firstRes = createMockResponse();
  const secondRes = createMockResponse();

  try {
    const api = await import(`../api/public.js?publicCache=${Date.now()}-${Math.random()}`);
    await api.default({
      method: 'GET',
      url: `/api/public?action=revision&menu_id=${menuId}`,
      headers: {},
      query: { action: 'revision', menu_id: menuId },
    }, firstRes);
    await api.default({
      method: 'GET',
      url: `/api/public?action=revision&menu_id=${menuId}`,
      headers: { 'if-none-match': firstRes.headers.ETag },
      query: { action: 'revision', menu_id: menuId },
    }, secondRes);
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert.equal(firstRes.statusCode, 200);
  assert.equal(secondRes.statusCode, 304);
  assert.equal(secondRes.body, null);
  assert.equal(secondRes.headers['Cache-Control'], 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
});

test('public API landing cache ETag uses live_published_ts', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/rest/v1/landing_page_state?id=eq.root&select=id,live_content,live_published_ts&limit=1')) {
      return {
        ok: true,
        async json() {
          return [{
            id: 'root',
            live_content: { sections: [] },
            live_published_ts: 12345,
          }];
        },
      };
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  const res = createMockResponse();

  try {
    const api = await import(`../api/public.js?publicLandingCache=${Date.now()}-${Math.random()}`);
    await api.default({
      method: 'GET',
      url: '/api/public?action=landing',
      headers: {},
      query: { action: 'landing' },
    }, res);
  } finally {
    global.fetch = originalFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert.equal(res.statusCode, 200);
  const expectedPayload = {
    id: 'root',
    live_content: { sections: [] },
    live_published_ts: 12345,
  };
  const { buildPublicJsonPayloadRevision } = await import(`../server/_public-cache.js?landingHash=${Date.now()}-${Math.random()}`);
  assert.equal(res.headers.ETag, `"landing:v0.9:${buildPublicJsonPayloadRevision(expectedPayload)}"`);
  assert.deepEqual(res.body, expectedPayload);
});

test('public API full menu cache ETag changes for send-only updates', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const menuId = '00000000-0000-0000-0000-000000000020';
  const restoreFetch = installPublicMenuFetch({
    menuId,
    meta: {
      last_updated_ts: 111,
      last_sent_ts: 222,
      last_sent_categories: ['classics'],
      last_sent_state: { classics: [{ id: 'item-1', name: 'House Old Fashioned' }] },
    },
    design: { theme: 'brick' },
  });
  const res = createMockResponse();

  try {
    const api = await import(`../api/public.js?publicMenuSendOnly=${Date.now()}-${Math.random()}`);
    await api.default({
      method: 'GET',
      url: `/api/public?menu_id=${menuId}`,
      headers: { 'if-none-match': '"menu:v0.9:111"' },
      query: { menu_id: menuId },
    }, res);
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert.equal(res.statusCode, 200);
  assert.notEqual(res.headers.ETag, '"menu:v0.9:111"');
  assert.equal(res.body.meta.last_updated_ts, 111);
  assert.equal(res.body.meta.last_sent_ts, 222);
});

test('public API revision cache ETag changes for send-only updates', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const menuId = '00000000-0000-0000-0000-000000000020';
  const restoreFetch = installPublicMenuFetch({
    menuId,
    meta: {
      last_updated_ts: 111,
      last_sent_ts: 222,
      last_sent_categories: ['classics'],
      last_sent_state: { classics: [{ id: 'item-1', name: 'House Old Fashioned' }] },
    },
    design: { theme: 'brick' },
  });

  const res = createMockResponse();

  try {
    const api = await import(`../api/public.js?publicRevisionSendOnly=${Date.now()}-${Math.random()}`);
    await api.default({
      method: 'GET',
      url: `/api/public?action=revision&menu_id=${menuId}`,
      headers: { 'if-none-match': '"revision:v0.9:111"' },
      query: { action: 'revision', menu_id: menuId },
    }, res);
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert.equal(res.statusCode, 200);
  assert.notEqual(res.headers.ETag, '"revision:v0.9:111"');
  assert.equal(res.body.menuId, menuId);
  assert.match(res.body.revision, /^sha256:[a-f0-9]{64}$/);
  assert.equal(res.body.lastUpdatedTs, 111);
  assert.equal(res.body.lastSentTs, 222);
});

test('public API full menu cache ETag changes when restaurant design changes', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const menuId = '00000000-0000-0000-0000-000000000020';
  const responses = [];

  for (const design of [{ theme: 'brick' }, { theme: 'neon' }]) {
    const restoreFetch = installPublicMenuFetch({
      menuId,
      meta: {
        last_updated_ts: 333,
        last_sent_ts: 444,
        last_sent_categories: ['classics'],
        last_sent_state: { classics: [{ id: 'item-1', name: 'House Old Fashioned' }] },
      },
      design,
    });
    const res = createMockResponse();

    try {
      const api = await import(`../api/public.js?publicDesignCache=${Date.now()}-${Math.random()}-${design.theme}`);
      await api.default({
        method: 'GET',
        url: `/api/public?menu_id=${menuId}`,
        headers: {},
        query: { menu_id: menuId },
      }, res);
      responses.push(res);
    } finally {
      restoreFetch();
    }
  }

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert.equal(responses[0].statusCode, 200);
  assert.equal(responses[1].statusCode, 200);
  assert.notEqual(responses[0].headers.ETag, responses[1].headers.ETag);
  assert.equal(responses[0].body.restaurant.design.theme, 'brick');
  assert.equal(responses[1].body.restaurant.design.theme, 'neon');
});

test('public API catalog and menu_index cache ETags change when payload changes', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const menuId = '00000000-0000-0000-0000-000000000020';
  const restaurantId = '00000000-0000-0000-0000-000000000010';

  for (const action of ['catalog', 'menu_index']) {
    const responses = [];
    for (const name of ["Leroy's Lounge Drinks", "Leroy's Updated Drinks"]) {
      const restoreFetch = installMenuIndexFetch([{
        id: menuId,
        name,
        slug: 'leroys-lounge-drinks',
        type: 'drinks',
        restaurant_id: restaurantId,
        archived: false,
      }]);
      const res = createMockResponse();

      try {
        const api = await import(`../api/public.js?publicIndexCache=${Date.now()}-${Math.random()}-${action}-${name}`);
        await api.default({
          method: 'GET',
          url: `/api/public?action=${action}`,
          headers: {},
          query: { action },
        }, res);
        responses.push(res);
      } finally {
        restoreFetch();
      }
    }

    assert.equal(responses[0].statusCode, 200);
    assert.equal(responses[1].statusCode, 200);
    assert.notEqual(responses[0].headers.ETag, responses[1].headers.ETag);
    assert.equal(responses[1].body.menus[0].name, "Leroy's Updated Drinks");
  }

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test('public API landing cache ETag changes when live content changes without timestamp change', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const responses = [];

  for (const headline of ['Opening Menu', 'Late Night Menu']) {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/rest/v1/landing_page_state?id=eq.root&select=id,live_content,live_published_ts&limit=1')) {
        return {
          ok: true,
          async json() {
            return [{
              id: 'root',
              live_content: { sections: [{ id: 'hero', headline }] },
              live_published_ts: 12345,
            }];
          },
        };
      }
      throw new Error(`Unexpected fetch: ${href}`);
    };
    const res = createMockResponse();

    try {
      const api = await import(`../api/public.js?publicLandingBodyCache=${Date.now()}-${Math.random()}-${headline}`);
      await api.default({
        method: 'GET',
        url: '/api/public?action=landing',
        headers: {},
        query: { action: 'landing' },
      }, res);
      responses.push(res);
    } finally {
      global.fetch = originalFetch;
    }
  }

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert.equal(responses[0].statusCode, 200);
  assert.equal(responses[1].statusCode, 200);
  assert.notEqual(responses[0].headers.ETag, responses[1].headers.ETag);
  assert.equal(responses[1].body.live_content.sections[0].headline, 'Late Night Menu');
});

test('public API revision cache ETag changes when public menu body changes without meta timestamp change', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const menuId = '00000000-0000-0000-0000-000000000020';
  const { buildPublicJsonPayloadRevision } = await import(`../server/_public-cache.js?revisionDesign=${Date.now()}-${Math.random()}`);
  const oldRevisionToken = buildPublicJsonPayloadRevision({
    menuId,
    revision: 333,
    lastUpdatedTs: 333,
    lastSentTs: 444,
  });
  const restoreFetch = installPublicMenuFetch({
    menuId,
    meta: {
      last_updated_ts: 333,
      last_sent_ts: 444,
      last_sent_categories: ['classics'],
      last_sent_state: { classics: [{ id: 'item-1', name: 'House Old Fashioned' }] },
    },
    design: { theme: 'neon' },
  });
  const res = createMockResponse();

  try {
    const api = await import(`../api/public.js?publicRevisionDesignCache=${Date.now()}-${Math.random()}`);
    await api.default({
      method: 'GET',
      url: `/api/public?action=revision&menu_id=${menuId}`,
      headers: { 'if-none-match': `"revision:v0.9:${oldRevisionToken}"` },
      query: { action: 'revision', menu_id: menuId },
    }, res);
  } finally {
    restoreFetch();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  assert.equal(res.statusCode, 200);
  assert.notEqual(res.headers.ETag, `"revision:v0.9:${oldRevisionToken}"`);
  assert.equal(res.body.menuId, menuId);
  assert.equal(res.body.lastUpdatedTs, 333);
  assert.equal(res.body.lastSentTs, 444);
});
