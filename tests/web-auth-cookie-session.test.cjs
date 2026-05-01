const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Readable } = require('node:stream');
const {
  buildSessionCookies,
  buildClearSessionCookies,
  readCookieValue,
} = require('../server/_web-session-cookie.js');

function jsonResponse(payload = {}, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

function createJsonRequest(body = {}, headers = {}) {
  return {
    method: 'POST',
    url: '/api/auth',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  };
}

function createStreamingJsonRequest(body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = 'POST';
  req.url = '/api/auth';
  req.headers = {
    'content-type': 'application/json',
    ...headers,
  };
  return req;
}

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
      this.ended = true;
      return this;
    },
  };
}

async function withMockedSupabaseAuth(handler) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAnon = process.env.SUPABASE_ANON_KEY;
  const calls = [];

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  global.fetch = async (url, options = {}) => {
    const parsedBody = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), options, body: parsedBody });
    if (String(url).endsWith('/auth/v1/logout')) return jsonResponse({});
    if (String(url).includes('grant_type=password') || String(url).includes('grant_type=id_token')) {
      return jsonResponse({
        access_token: 'access.from.signin',
        refresh_token: 'refresh.from.signin',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'user-1', email: 'manager@example.com' },
      });
    }
    if (String(url).includes('grant_type=refresh_token')) {
      return jsonResponse({
        access_token: 'access.from.refresh',
        refresh_token: 'refresh.from.refresh',
        expires_in: 1800,
        token_type: 'bearer',
        user: { id: 'user-1', email: 'manager@example.com' },
      });
    }
    if (String(url).endsWith('/auth/v1/user')) {
      return jsonResponse({
        id: 'user-1',
        email: 'manager@example.com',
      });
    }
    return jsonResponse({ msg: 'unexpected fetch' }, false, 500);
  };

  try {
    return await handler(calls);
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
    process.env.SUPABASE_ANON_KEY = originalAnon;
  }
}

async function withFailingSupabaseLogout(handler) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAnon = process.env.SUPABASE_ANON_KEY;
  const calls = [];

  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ msg: 'JWT expired' }, false, 401);
  };

  try {
    return await handler(calls);
  } finally {
    global.fetch = originalFetch;
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
    process.env.SUPABASE_ANON_KEY = originalAnon;
  }
}

test('buildSessionCookies emits secure HttpOnly SameSite cookies for web auth tokens', () => {
  const cookies = buildSessionCookies({
    accessToken: 'access.123',
    refreshToken: 'refresh.456',
    expiresIn: 3600,
  });

  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^hf_web_access=access\.123;/);
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /Secure/);
  assert.match(cookies[0], /SameSite=Lax/);
  assert.match(cookies[0], /Path=\//);
  assert.match(cookies[1], /^hf_web_refresh=refresh\.456;/);
  assert.match(cookies[1], /Max-Age=2592000/);
});

test('buildClearSessionCookies expires both web auth cookies', () => {
  const cookies = buildClearSessionCookies();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every(cookie => cookie.includes('Max-Age=0')));
  assert.ok(cookies.every(cookie => cookie.includes('HttpOnly')));
});

test('readCookieValue extracts a named cookie without decoding unrelated entries', () => {
  const req = { headers: { cookie: 'theme=dark; hf_web_refresh=refresh%20456; other=value' } };
  assert.equal(readCookieValue(req, 'hf_web_refresh'), 'refresh 456');
  assert.equal(readCookieValue(req, 'missing'), '');
});

test('readCookieValue treats malformed encoded cookie values as missing', () => {
  const req = { headers: { cookie: 'hf_web_refresh=%; other=value' } };
  assert.equal(readCookieValue(req, 'hf_web_refresh'), '');
});

test('auth proxy source exposes web-session actions and never returns refresh token to web session callers', async () => {
  const source = await fs.readFile('server/_auth-proxy.js', 'utf8');
  const payloadMatch = source.match(/function webSessionPayload\([^)]*\)\s*\{([\s\S]*?)\n\}/);

  assert.match(source, /case 'web_sign_in'/);
  assert.match(source, /case 'web_adopt_session'/);
  assert.match(source, /case 'web_refresh'/);
  assert.match(source, /case 'web_session'/);
  assert.match(source, /case 'web_sign_out'/);
  assert.match(source, /buildSessionCookies/);
  assert.match(source, /buildClearSessionCookies/);
  assert.ok(payloadMatch, 'webSessionPayload function should exist');
  assert.doesNotMatch(payloadMatch[1], /refresh_token/);
});

test('auth API metadata handling does not treat business status fields as HTTP status metadata', async () => {
  const source = await fs.readFile('api/auth.js', 'utf8');
  assert.match(source, /result\.authResponse === true/);
  assert.match(source, /Number\.isInteger\(result\.status\)/);
  assert.doesNotMatch(source, /Object\.prototype\.hasOwnProperty\.call\(result, 'status'\)/);
});

test('web sign-in action sets cookies and keeps refresh token out of response body', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');
    const result = await executeAuthAction(createJsonRequest({
      action: 'web_sign_in',
      email: ' manager@example.com ',
      password: 'pass123',
    }));

    assert.equal(result.authResponse, true);
    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/token?grant_type=password');
    assert.deepEqual(calls[0].body, { email: 'manager@example.com', password: 'pass123' });
    assert.equal(calls[0].options.headers.apikey, 'anon-key');
    assert.equal(result.headers['Set-Cookie'].length, 2);
    assert.match(result.headers['Set-Cookie'][0], /^hf_web_access=access\.from\.signin;/);
    assert.match(result.headers['Set-Cookie'][1], /^hf_web_refresh=refresh\.from\.signin;/);
    assert.equal(result.body.session.access_token, 'access.from.signin');
    assert.equal(result.body.session.user.email, 'manager@example.com');
    assert.equal(Object.hasOwn(result.body.session, 'refresh_token'), false);
  });
});

test('web apple OAuth action returns a Supabase authorize URL for the current manager origin', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');
    const result = await executeAuthAction(createJsonRequest(
      { action: 'web_apple_oauth_url' },
      {
        host: 'menus.example.test',
        'x-forwarded-proto': 'https',
      },
    ));

    assert.equal(calls.length, 0);
    assert.equal(result.authResponse, true);
    assert.equal(result.body.ok, true);
    const url = new URL(result.body.url);
    assert.equal(url.href.startsWith('https://example.supabase.co/auth/v1/authorize?'), true);
    assert.equal(url.searchParams.get('provider'), 'apple');
    assert.equal(url.searchParams.get('redirect_to'), 'https://menus.example.test/manager');
  });
});

test('native apple sign-in exchanges id token with Supabase and returns refresh token to iOS', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');
    const result = await executeAuthAction(createJsonRequest({
      action: 'sign_in_with_apple',
      identity_token: 'apple.identity.jwt',
      nonce: 'raw-nonce-value',
    }));

    assert.equal(result.access_token, 'access.from.signin');
    assert.equal(result.refresh_token, 'refresh.from.signin');
    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/token?grant_type=id_token');
    assert.deepEqual(calls[0].body, {
      provider: 'apple',
      id_token: 'apple.identity.jwt',
      nonce: 'raw-nonce-value',
    });
  });
});

test('web adopt session action sets cookies and keeps refresh token out of response body', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');
    const result = await executeAuthAction(createJsonRequest({
      action: 'web_adopt_session',
      access_token: 'recovery.access',
      refresh_token: 'recovery.refresh',
      expires_in: 1200,
    }));

    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/user');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer recovery.access');
    assert.equal(result.authResponse, true);
    assert.equal(result.headers['Set-Cookie'].length, 2);
    assert.match(result.headers['Set-Cookie'][0], /^hf_web_access=recovery\.access;/);
    assert.match(result.headers['Set-Cookie'][1], /^hf_web_refresh=recovery\.refresh;/);
    assert.match(result.headers['Set-Cookie'][0], /Max-Age=1200/);
    assert.equal(result.body.session.access_token, 'recovery.access');
    assert.equal(result.body.session.expires_in, 1200);
    assert.equal(result.body.session.user.email, 'manager@example.com');
    assert.equal(Object.hasOwn(result.body.session, 'refresh_token'), false);
  });
});

test('web adopt session action requires access and refresh tokens', async () => {
  const { executeAuthAction } = await import('../server/_auth-proxy.js');

  await assert.rejects(
    () => executeAuthAction(createJsonRequest({
      action: 'web_adopt_session',
      access_token: 'recovery.access',
    })),
    error => {
      assert.equal(error.status, 401);
      assert.equal(error.message, 'Session adoption unavailable');
      return true;
    },
  );
});

test('web refresh action prefers the HttpOnly cookie and rotates response cookies', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');
    const result = await executeAuthAction(createJsonRequest(
      { action: 'web_refresh', refresh_token: 'body-refresh-should-not-win' },
      { cookie: 'hf_web_refresh=cookie-refresh' },
    ));

    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/token?grant_type=refresh_token');
    assert.deepEqual(calls[0].body, { refresh_token: 'cookie-refresh' });
    assert.match(result.headers['Set-Cookie'][0], /^hf_web_access=access\.from\.refresh;/);
    assert.match(result.headers['Set-Cookie'][1], /^hf_web_refresh=refresh\.from\.refresh;/);
    assert.equal(Object.hasOwn(result.body.session, 'refresh_token'), false);
  });
});

test('web refresh action rejects body refresh token fallback without HttpOnly cookie', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');

    await assert.rejects(
      () => executeAuthAction(createJsonRequest({
        action: 'web_refresh',
        refresh_token: 'body-refresh-must-not-work',
      })),
      error => {
        assert.equal(error.status, 401);
        assert.equal(error.message, 'Session refresh unavailable');
        return true;
      },
    );
    assert.equal(calls.length, 0);
  });
});

test('web sign-out revokes Supabase session when an access cookie exists and clears cookies', async () => {
  await withMockedSupabaseAuth(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');
    const result = await executeAuthAction(createJsonRequest(
      { action: 'web_sign_out' },
      { cookie: 'hf_web_access=access.to.revoke; hf_web_refresh=refresh.to.clear' },
    ));

    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/logout');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer access.to.revoke');
    assert.equal(result.body.ok, true);
    assert.equal(result.headers['Set-Cookie'].length, 2);
    assert.ok(result.headers['Set-Cookie'].every(cookie => cookie.includes('Max-Age=0')));
  });
});

test('web sign-out still clears cookies when upstream logout is already expired', async () => {
  await withFailingSupabaseLogout(async calls => {
    const { executeAuthAction } = await import('../server/_auth-proxy.js');
    const result = await executeAuthAction(createJsonRequest(
      { action: 'web_sign_out' },
      { cookie: 'hf_web_access=expired.access; hf_web_refresh=refresh.to.clear' },
    ));

    assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/logout');
    assert.equal(result.body.ok, true);
    assert.equal(result.headers['Set-Cookie'].length, 2);
    assert.ok(result.headers['Set-Cookie'].every(cookie => cookie.includes('Max-Age=0')));
  });
});

test('auth API handler applies Set-Cookie metadata without wrapping web sign-in body', async () => {
  await withMockedSupabaseAuth(async () => {
    const authApi = await import('../api/auth.js');
    const res = createMockResponse();

    await authApi.default(createStreamingJsonRequest({
      action: 'web_sign_in',
      email: 'manager@example.com',
      password: 'pass123',
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Set-Cookie'].length, 2);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.session.access_token, 'access.from.signin');
    assert.equal(Object.hasOwn(res.body.session, 'refresh_token'), false);
  });
});

test('app auth storage keys no longer define Supabase auth tokens in LS_KEYS', async () => {
  const source = await fs.readFile('app.js', 'utf8');
  const keysMatch = source.match(/const LS_KEYS = \{([\s\S]*?)\n\};/);

  assert.ok(keysMatch, 'LS_KEYS object should exist');
  assert.doesNotMatch(keysMatch[1], /\baccessToken\s*:/);
  assert.doesNotMatch(keysMatch[1], /\brefreshToken\s*:/);
  assert.doesNotMatch(keysMatch[1], /\bexpiresAt\s*:/);
  assert.doesNotMatch(keysMatch[1], /hf_sb_access_token/);
  assert.doesNotMatch(keysMatch[1], /hf_sb_refresh_token/);
  assert.doesNotMatch(keysMatch[1], /hf_sb_expires_at/);
});

test('app runtime no longer reads or writes Supabase token storage keys', async () => {
  const source = await fs.readFile('app.js', 'utf8');

  assert.doesNotMatch(source, /localStorage\.getItem\(LS_KEYS\.accessToken\)/);
  assert.doesNotMatch(source, /localStorage\.getItem\(LS_KEYS\.refreshToken\)/);
  assert.doesNotMatch(source, /lsSet\(LS_KEYS\.accessToken\b/);
  assert.doesNotMatch(source, /lsSet\(LS_KEYS\.refreshToken\b/);
});
