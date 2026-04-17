const assert = require('node:assert/strict');
const test = require('node:test');

const { createFetchResponse, loadSandboxWithScripts, setState } = require('./helpers/runtime.cjs');

test('auth api bootstrap exposes one shared auth boundary object', () => {
  const sandbox = loadSandboxWithScripts(['core/auth/auth-api.js']);
  assert.equal(typeof sandbox.__HF_AUTH_API__, 'object');
  assert.equal(typeof sandbox.__HF_AUTH_API__.signIn, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.signUp, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.refreshToken, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.getProfile, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.resetPasswordForEmail, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.updatePassword, 'function');
});

test('sbSignIn delegates through shared auth api boundary', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_AUTH_API__: {
      signIn: async args => {
        calls.push(args);
        return { access_token: 'token-1', refresh_token: 'refresh-1', expires_in: 3600 };
      },
    },
  });
  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  });

  const result = await sandbox.sbSignIn('manager@example.com', 'pass123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].supabaseUrl, 'https://example.supabase.co');
  assert.equal(calls[0].anonKey, 'anon-key');
  assert.equal(calls[0].email, 'manager@example.com');
  assert.equal(result.access_token, 'token-1');
});

test('auth api getProfile preserves non-ok profile errors', async () => {
  const sandbox = loadSandboxWithScripts(['core/auth/auth-api.js'], {
    fetch: async () => createFetchResponse(500, { error: 'Failed to fetch role' }),
  });

  await assert.rejects(
    () => sandbox.__HF_AUTH_API__.getProfile({ accessToken: 'token-1' }),
    error => {
      assert.equal(error.status, 500);
      assert.equal(error.message, 'Failed to fetch role');
      return true;
    }
  );
});

test('auth api signIn rejects malformed successful responses', async () => {
  const sandbox = loadSandboxWithScripts(['core/auth/auth-api.js'], {
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    }),
  });

  await assert.rejects(
    () => sandbox.__HF_AUTH_API__.signIn({ email: 'manager@example.com', password: 'pass123' }),
    error => {
      assert.equal(error.status, 502);
      assert.equal(error.message, 'Authentication response was not valid JSON.');
      return true;
    }
  );
});

test('app auth fallback rejects malformed successful sign-in responses', async () => {
  const sandbox = loadSandboxWithScripts(['app.js'], {
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    }),
  });
  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  });

  await assert.rejects(
    () => sandbox.sbSignIn('manager@example.com', 'pass123'),
    error => {
      assert.equal(error.status, 502);
      assert.equal(error.message, 'Authentication response was not valid JSON.');
      return true;
    }
  );
});
