const assert = require('node:assert/strict');
const test = require('node:test');

function createJsonRequest(body = {}, headers = {}) {
  return {
    method: 'POST',
    url: '/api/auth',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
    socket: {
      remoteAddress: '203.0.113.44',
    },
  };
}

function jsonResponse(payload = {}, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

function restoreEnvValue(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withMockedSupabaseAuth(handler) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAnon = process.env.SUPABASE_ANON_KEY;
  const originalPublicSiteUrl = process.env.PUBLIC_SITE_URL;
  const originalSiteUrl = process.env.SITE_URL;
  const originalVercelProjectProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const calls = [];

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.PUBLIC_SITE_URL;
  delete process.env.SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options, body: options.body ? JSON.parse(options.body) : null });
    return jsonResponse({
      access_token: 'access.from.signin',
      refresh_token: 'refresh.from.signin',
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: 'user-1', email: 'manager@example.com' },
    });
  };

  try {
    return await handler(calls);
  } finally {
    global.fetch = originalFetch;
    restoreEnvValue('SUPABASE_URL', originalUrl);
    restoreEnvValue('SUPABASE_SERVICE_ROLE_KEY', originalService);
    restoreEnvValue('SUPABASE_ANON_KEY', originalAnon);
    restoreEnvValue('PUBLIC_SITE_URL', originalPublicSiteUrl);
    restoreEnvValue('SITE_URL', originalSiteUrl);
    restoreEnvValue('VERCEL_PROJECT_PRODUCTION_URL', originalVercelProjectProductionUrl);
    restoreEnvValue('VERCEL_URL', originalVercelUrl);
  }
}

test('rate limiter blocks after the limit and exposes retry metadata', async () => {
  let currentTime = 1_000;
  const { createRateLimiter } = await import('../server/_rate-limit.js');
  const limiter = createRateLimiter({
    limit: 2,
    windowMs: 1_000,
    now: () => currentTime,
  });

  assert.deepEqual(limiter.check('sign_in:ip:one'), {
    allowed: true,
    limit: 2,
    remaining: 1,
    resetAt: 2_000,
  });
  assert.equal(limiter.check('sign_in:ip:one').allowed, true);

  const blocked = limiter.check('sign_in:ip:one');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(blocked.retryAfter, '1');
  assert.equal(blocked.limit, 2);
  assert.equal(blocked.remaining, 0);

  currentTime = 2_001;
  assert.equal(limiter.check('sign_in:ip:one').allowed, true);
});

test('rate limiter can reset keys and prune expired windows', async () => {
  let currentTime = 10_000;
  const { createRateLimiter } = await import('../server/_rate-limit.js');
  const limiter = createRateLimiter({
    limit: 1,
    windowMs: 500,
    now: () => currentTime,
  });

  assert.equal(limiter.check('refresh:ip:one').allowed, true);
  assert.equal(limiter.check('refresh:ip:two').allowed, true);
  assert.equal(limiter.size(), 2);

  limiter.reset('refresh:ip:one');
  assert.equal(limiter.check('refresh:ip:one').allowed, true);

  currentTime = 11_000;
  assert.equal(limiter.prune(), 2);
  assert.equal(limiter.size(), 0);
});

test('auth proxy returns 429 before upstream auth after repeated web sign-in attempts', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction, resetAuthAbuseLimitersForTest } = await import('../server/_auth-proxy.js');
    resetAuthAbuseLimitersForTest();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await executeAuthAction(createJsonRequest({
        action: 'web_sign_in',
        email: ' Manager@Example.com ',
        password: `pass-${attempt}`,
      }, {
        'x-forwarded-for': '198.51.100.77, 10.0.0.1',
      }));
      assert.equal(result.authResponse, true);
    }

    const blocked = await executeAuthAction(createJsonRequest({
        action: 'web_sign_in',
        email: 'manager@example.com',
        password: 'blocked',
      }, {
        'x-forwarded-for': '198.51.100.77, 10.0.0.1',
      }));
    assert.equal(blocked.authResponse, true);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['Retry-After'], '300');
    assert.deepEqual(blocked.body, {
      error: 'Too many authentication attempts. Please wait before trying again.',
      retryAfter: '300',
      retryAfterSeconds: 300,
    });
    assert.equal(calls.length, 5);
    resetAuthAbuseLimitersForTest();
  });
});

test('auth abuse docs require provider-level protection beyond in-process throttles', () => {
  const source = require('node:fs').readFileSync('server/_auth-proxy.js', 'utf8');
  const envMatrix = require('node:fs').readFileSync('docs/launch/environment-matrix.md', 'utf8');
  const smokeChecklist = require('node:fs').readFileSync('docs/launch/smoke-test-checklist.md', 'utf8');

  assert.match(source, /Best-effort per-instance backpressure/);
  assert.match(envMatrix, /Vercel Firewall\/provider endpoint limits \| `\/api\/auth` public auth actions \| Yes/);
  assert.match(smokeChecklist, /best-effort per serverless instance/);
});

test('auth proxy limits sign-in floods by client IP even when emails vary', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction, resetAuthAbuseLimitersForTest } = await import('../server/_auth-proxy.js');
    resetAuthAbuseLimitersForTest();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await executeAuthAction(createJsonRequest({
        action: 'web_sign_in',
        email: `staff-${attempt}@example.com`,
        password: 'not-the-point',
      }, {
        'x-real-ip': '203.0.113.99',
      }));
      assert.equal(result.authResponse, true);
    }

    const blocked = await executeAuthAction(createJsonRequest({
      action: 'web_sign_in',
      email: 'fresh-address@example.com',
      password: 'blocked',
    }, {
      'x-real-ip': '203.0.113.99',
    }));
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['Retry-After'], '300');
    assert.equal(calls.length, 5);
    resetAuthAbuseLimitersForTest();
  });
});

test('auth proxy normalizes password reset redirects to same-origin manager reset URL', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction, resetAuthAbuseLimitersForTest } = await import('../server/_auth-proxy.js');
    resetAuthAbuseLimitersForTest();

    const result = await executeAuthAction(createJsonRequest({
      action: 'reset_password',
      email: 'manager@example.com',
      redirect_to: 'https://evil.example/reset',
    }, {
      host: 'menus.example.test',
      'x-forwarded-proto': 'https',
      'x-real-ip': '203.0.113.88',
    }));

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/recover');
    assert.deepEqual(calls[0].body, {
      email: 'manager@example.com',
      redirect_to: 'https://menus.example.test/manager',
    });

    resetAuthAbuseLimitersForTest();
  });
});

test('auth proxy prefers trusted public origin over spoofed password reset host', async () => {
  await withMockedSupabaseAuth(async calls => {
    process.env.PUBLIC_SITE_URL = 'http://menus.example.test/some/reset/path?x=1#frag';
    const { executeAuthAction, resetAuthAbuseLimitersForTest } = await import('../server/_auth-proxy.js');
    resetAuthAbuseLimitersForTest();

    const result = await executeAuthAction(createJsonRequest({
      action: 'reset_password',
      email: 'manager@example.com',
      redirect_to: 'https://evil.example/reset',
    }, {
      host: 'evil.example',
      'x-forwarded-proto': 'https',
      'x-real-ip': '203.0.113.88',
    }));

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      email: 'manager@example.com',
      redirect_to: 'https://menus.example.test/manager',
    });

    resetAuthAbuseLimitersForTest();
  });
});

test('auth proxy fails closed for password reset redirects without trusted or HTTPS request origin', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction, resetAuthAbuseLimitersForTest } = await import('../server/_auth-proxy.js');
    resetAuthAbuseLimitersForTest();

    const result = await executeAuthAction(createJsonRequest({
      action: 'reset_password',
      email: 'manager@example.com',
      redirect_to: 'https://evil.example/reset',
    }, {
      host: 'evil.example',
      'x-forwarded-proto': 'http',
      'x-real-ip': '203.0.113.88',
    }));

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      email: 'manager@example.com',
      redirect_to: '',
    });

    resetAuthAbuseLimitersForTest();
  });
});

test('auth proxy fails closed when trusted password reset origin is configured but invalid', async () => {
  await withMockedSupabaseAuth(async calls => {
    process.env.PUBLIC_SITE_URL = 'https://bad host.example';
    const { executeAuthAction, resetAuthAbuseLimitersForTest } = await import('../server/_auth-proxy.js');
    resetAuthAbuseLimitersForTest();

    const result = await executeAuthAction(createJsonRequest({
      action: 'reset_password',
      email: 'manager@example.com',
      redirect_to: 'https://evil.example/reset',
    }, {
      host: 'evil.example',
      'x-forwarded-proto': 'https',
      'x-real-ip': '203.0.113.88',
    }));

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      email: 'manager@example.com',
      redirect_to: '',
    });

    resetAuthAbuseLimitersForTest();
  });
});
