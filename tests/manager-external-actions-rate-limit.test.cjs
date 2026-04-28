const assert = require('node:assert/strict');
const test = require('node:test');

test('manager external action limiter blocks repeated action and IP keys', async () => {
  let now = 1_000;
  const {
    checkManagerExternalActionLimit,
    resetManagerExternalActionLimitersForTest,
    setManagerExternalActionLimiterNowForTest,
  } = await import('../server/_manager-action-limits.js');

  resetManagerExternalActionLimitersForTest();
  setManagerExternalActionLimiterNowForTest(() => now);

  const req = {
    headers: { 'x-real-ip': '203.0.113.111' },
    socket: { remoteAddress: '10.0.0.2' },
  };

  for (let index = 0; index < 20; index += 1) {
    assert.equal(checkManagerExternalActionLimit(req, 'product_lookup')?.status || 200, 200);
  }

  const blocked = checkManagerExternalActionLimit(req, 'product_lookup');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '60');
  assert.equal(blocked.body.error, 'Too many lookup requests. Please wait before trying again.');

  now = 62_000;
  assert.equal(checkManagerExternalActionLimit(req, 'product_lookup'), null);

  resetManagerExternalActionLimitersForTest();
  setManagerExternalActionLimiterNowForTest(null);
});

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
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

function createLookupRequest(body = {}, headers = {}) {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      'x-real-ip': '198.51.100.17',
      ...headers,
    },
    body: {
      action: 'product_lookup',
      barcode: '123456789012',
      ...body,
    },
  };
}

async function withManagerRoute(fetchImpl, run) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';

  const originalFetch = global.fetch;
  const manager = await import(`../api/manager.js?managerLookup=${Date.now()}-${Math.random()}`);
  const {
    resetManagerExternalActionLimitersForTest,
    setManagerExternalActionLimiterNowForTest,
  } = await import('../server/_manager-action-limits.js');
  resetManagerExternalActionLimitersForTest();
  setManagerExternalActionLimiterNowForTest(null);
  global.fetch = fetchImpl;

  try {
    return await run(manager);
  } finally {
    global.fetch = originalFetch;
    resetManagerExternalActionLimitersForTest();
    setManagerExternalActionLimiterNowForTest(null);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.UNTAPPD_CLIENT_ID;
    delete process.env.UNTAPPD_CLIENT_SECRET;
    delete process.env.UNTAPPD_USER_AGENT;
  }
}

function createAuthorizedLookupFetch({ menuAccessRows = [{ menu_id: '00000000-0000-0000-0000-000000000020' }] } = {}) {
  const fetchCalls = [];
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, options });

    if (href.includes('/auth/v1/user')) {
      return { ok: true, async json() { return { id: 'user-1' }; } };
    }

    if (href.includes('/rest/v1/profiles?id=eq.user-1')) {
      return { ok: true, async json() { return [{ role: 'manager', name: 'Manager Tester' }]; } };
    }

    if (href.includes('/rest/v1/menu_access?user_id=eq.user-1&menu_id=in.(00000000-0000-0000-0000-000000000020)')) {
      return { ok: true, async json() { return menuAccessRows; } };
    }

    throw new Error(`Unexpected upstream request: ${href}`);
  };
  return { fetchCalls, fetchImpl };
}

test('manager external lookup actions require supported menu access before upstream lookup', async () => {
  const { fetchCalls, fetchImpl } = createAuthorizedLookupFetch();
  await withManagerRoute(fetchImpl, async manager => {
    const req = createLookupRequest({
      menu_id: '00000000-0000-0000-0000-000000000020',
    });
    const res = createMockResponse();

    await manager.default(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(String(res.body?.error || ''), /Unexpected upstream request/);
    assert.ok(fetchCalls.some(call => call.url.includes('/auth/v1/user')), 'expected auth check');
    assert.ok(fetchCalls.some(call => call.url.includes('/rest/v1/menu_access?')), 'expected menu access check before upstream lookup');
  });
});

test('manager external lookup rejects missing or unsupported menu id before provider lookup', async () => {
  const { fetchCalls, fetchImpl } = createAuthorizedLookupFetch();
  await withManagerRoute(fetchImpl, async manager => {
    const missingRes = createMockResponse();
    await manager.default(createLookupRequest({ menu_id: '' }), missingRes);

    const unsupportedRes = createMockResponse();
    await manager.default(createLookupRequest({ menu_id: 'menu-1' }), unsupportedRes);

    assert.equal(missingRes.statusCode, 400);
    assert.equal(missingRes.body.error, 'Unsupported menu_id');
    assert.equal(unsupportedRes.statusCode, 400);
    assert.equal(unsupportedRes.body.error, 'Unsupported menu_id');
    assert.equal(fetchCalls.length, 0);
  });
});

test('manager external lookup rejects denied menu access before provider lookup', async () => {
  const { fetchCalls, fetchImpl } = createAuthorizedLookupFetch({ menuAccessRows: [] });
  await withManagerRoute(fetchImpl, async manager => {
    const res = createMockResponse();
    await manager.default(createLookupRequest({
      menu_id: '00000000-0000-0000-0000-000000000020',
    }), res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Forbidden');
    assert.ok(fetchCalls.some(call => call.url.includes('/auth/v1/user')), 'expected auth check');
    assert.ok(fetchCalls.some(call => call.url.includes('/rest/v1/menu_access?')), 'expected menu access check');
    assert.ok(!fetchCalls.some(call => call.url.includes('openfoodfacts.org')), 'provider must not be called');
  });
});

test('manager external lookup rate limit is applied after menu authorization through api route', async () => {
  let now = 1_000;
  const { fetchCalls, fetchImpl } = createAuthorizedLookupFetch();
  await withManagerRoute(fetchImpl, async manager => {
    const {
      setManagerExternalActionLimiterNowForTest,
    } = await import('../server/_manager-action-limits.js');
    setManagerExternalActionLimiterNowForTest(() => now);

    for (let index = 0; index < 20; index += 1) {
      const res = createMockResponse();
      await manager.default(createLookupRequest({
        menu_id: '00000000-0000-0000-0000-000000000020',
      }), res);
      assert.equal(res.statusCode, 500);
      assert.match(String(res.body?.error || ''), /Unexpected upstream request/);
    }

    const blocked = createMockResponse();
    await manager.default(createLookupRequest({
      menu_id: '00000000-0000-0000-0000-000000000020',
    }), blocked);

    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers['Retry-After'], '60');
    assert.equal(blocked.body.error, 'Too many lookup requests. Please wait before trying again.');
    assert.ok(fetchCalls.filter(call => call.url.includes('/rest/v1/menu_access?')).length >= 21);
  });
});

test('manager external lookup rejects do not consume authorized lookup quota', async () => {
  const { fetchCalls, fetchImpl } = createAuthorizedLookupFetch();
  await withManagerRoute(fetchImpl, async manager => {
    for (let index = 0; index < 20; index += 1) {
      const rejected = createMockResponse();
      await manager.default(createLookupRequest({ menu_id: '' }), rejected);
      assert.equal(rejected.statusCode, 400);
    }

    const authorized = createMockResponse();
    await manager.default(createLookupRequest({
      menu_id: '00000000-0000-0000-0000-000000000020',
    }), authorized);

    assert.equal(authorized.statusCode, 500);
    assert.match(String(authorized.body?.error || ''), /Unexpected upstream request/);
    assert.ok(fetchCalls.some(call => call.url.includes('/rest/v1/menu_access?')), 'expected authorized request to reach menu access');
  });
});
