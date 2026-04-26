const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importFresh(relativePath) {
  const url = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${url}?opsHealth=${Date.now()}-${Math.random()}`);
}

function createRes() {
  return {
    statusCode: 200,
    payload: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test('health payload reports missing env without leaking configured secret values', async () => {
  const { checkHealth } = await importFresh('server/_health.js');
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-secret-value',
    SUPABASE_SERVICE_ROLE_KEY: '',
  };

  const payload = await checkHealth({ env, fetchImpl: async () => {
    throw new Error('fetch should not run when required config is missing');
  } });

  assert.equal(payload.ok, false);
  assert.deepEqual(payload.config, {
    SUPABASE_URL: { configured: true },
    SUPABASE_ANON_KEY: { configured: true },
    SUPABASE_SERVICE_ROLE_KEY: { configured: false },
  });
  assert.equal(payload.supabase.checked, false);
  assert.equal(payload.supabase.ok, false);
  assert.equal(payload.supabase.message, 'Skipped because required configuration is missing');

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /example\.supabase\.co/);
  assert.doesNotMatch(serialized, /anon-secret-value/);
});

test('health connectivity check succeeds with service role headers and redacted payload', async () => {
  const { checkHealth } = await importFresh('server/_health.js');
  let requestedUrl = '';
  let requestedHeaders = {};

  const payload = await checkHealth({
    env: {
      SUPABASE_URL: 'https://project.supabase.co/',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    },
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedHeaders = options.headers;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(requestedUrl, 'https://project.supabase.co/rest/v1/menus?select=id&limit=1');
  assert.equal(requestedHeaders.apikey, 'service-role-key');
  assert.equal(requestedHeaders.Authorization, 'Bearer service-role-key');
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.supabase, {
    checked: true,
    ok: true,
    status: 200,
  });
  assert.doesNotMatch(JSON.stringify(payload), /service-role-key|anon-key|project\.supabase\.co/);
});

test('health connectivity check failure returns generic failure shape without leaking errors', async () => {
  const { checkHealth } = await importFresh('server/_health.js');

  const payload = await checkHealth({
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async text() {
        return 'service-role-key is invalid';
      },
    }),
  });

  assert.equal(payload.ok, false);
  assert.deepEqual(payload.supabase, {
    checked: true,
    ok: false,
    status: 401,
    message: 'Supabase readiness check failed',
  });
  assert.doesNotMatch(JSON.stringify(payload), /service-role-key|invalid/);
});

test('health connectivity check times out hung fetches with redacted failure payload', async () => {
  const { checkHealth } = await importFresh('server/_health.js');
  const started = Date.now();
  let receivedSignal = null;

  const payload = await checkHealth({
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    },
    supabaseTimeoutMs: 10,
    fetchImpl: async (_url, options) => {
      receivedSignal = options.signal;
      return new Promise(() => {});
    },
  });

  assert.ok(Date.now() - started < 500, 'health check should not wait for the platform timeout');
  assert.ok(receivedSignal);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.supabase, {
    checked: true,
    ok: false,
    message: 'Supabase readiness check failed',
  });
  assert.doesNotMatch(JSON.stringify(payload), /service-role-key|anon-key|project\.supabase\.co|timed out/i);
});

test('api health endpoint handles method and status behavior through server helper', async () => {
  const api = await importFresh('api/health.js');

  const nonGetRes = createRes();
  await api.default({ method: 'POST' }, nonGetRes);
  assert.equal(nonGetRes.statusCode, 405);
  assert.equal(nonGetRes.payload, undefined);

  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const originalFetch = globalThis.fetch;

  try {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    globalThis.fetch = async () => ({ ok: true, status: 200 });

    const okRes = createRes();
    await api.default({ method: 'GET' }, okRes);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.payload.ok, true);

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const failedRes = createRes();
    await api.default({ method: 'GET' }, failedRes);
    assert.equal(failedRes.statusCode, 503);
    assert.equal(failedRes.payload.ok, false);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = originalFetch;
  }
});

test('api health source stays dependency-free and delegates to server health module', () => {
  const source = read('api/health.js');

  assert.match(source, /from ['"]\.\.\/server\/_health\.js['"]/);
  assert.match(source, /req\.method !== ['"]GET['"]/);
  assert.match(source, /status\(405\)/);
  assert.match(source, /status\(payload\.ok \? 200 : 503\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY/);
});

test('launch docs reference health smoke checks and post-deploy monitoring', () => {
  const smoke = read('docs/launch/smoke-test-checklist.md');
  const runbook = read('docs/launch/release-runbook.md');

  assert.match(smoke, /\/api\/health/);
  assert.match(smoke, /HTTP 200/);
  assert.match(runbook, /\/api\/health/);
  assert.match(runbook, /post-deploy monitoring/i);
  assert.match(runbook, /HTTP 503/);
});
