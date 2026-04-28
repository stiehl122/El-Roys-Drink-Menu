const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createFetchResponse, loadSandboxWithScripts, setState } = require('./helpers/runtime.cjs');

const ROOT = path.join(__dirname, '..');

function readAppJs() {
  return fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
}

test('auth api bootstrap exposes one shared auth boundary object', () => {
  const sandbox = loadSandboxWithScripts(['core/auth/auth-api.js']);
  assert.equal(typeof sandbox.__HF_AUTH_API__, 'object');
  assert.equal(typeof sandbox.__HF_AUTH_API__.signIn, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.signUp, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.adoptWebSession, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.refreshToken, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.signOutWebSession, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.getProfile, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.resetPasswordForEmail, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_API__.updatePassword, 'function');
});

test('auth api web session actions use server-managed cookie endpoints', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['core/auth/auth-api.js'], {
    fetch: async (url, options = {}) => {
      calls.push({
        url,
        body: options.body ? JSON.parse(options.body) : null,
      });
      return createFetchResponse(200, {
        ok: true,
        session: {
          access_token: 'token-1',
          expires_in: 3600,
          user: { id: 'user-1', email: 'manager@example.com' },
        },
      });
    },
  });

  const signedIn = await sandbox.__HF_AUTH_API__.signIn({
    email: 'manager@example.com',
    password: 'pass123',
  });
  const refreshed = await sandbox.__HF_AUTH_API__.refreshToken({
    refreshToken: 'refresh-token-must-not-be-sent',
  });
  const adopted = await sandbox.__HF_AUTH_API__.adoptWebSession({
    access_token: 'recovery-token',
    refresh_token: 'recovery-refresh',
    expires_in: 1200,
  });
  await sandbox.__HF_AUTH_API__.signOutWebSession();

  assert.equal(signedIn.access_token, 'token-1');
  assert.equal(refreshed.access_token, 'token-1');
  assert.equal(adopted.access_token, 'token-1');
  assert.deepEqual(calls[0].body, {
    action: 'web_sign_in',
    email: 'manager@example.com',
    password: 'pass123',
  });
  assert.deepEqual(calls[1].body, { action: 'web_refresh' });
  assert.deepEqual(calls[2].body, {
    action: 'web_adopt_session',
    access_token: 'recovery-token',
    refresh_token: 'recovery-refresh',
    expires_in: 1200,
  });
  assert.deepEqual(calls[3].body, { action: 'web_sign_out' });
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

test('sbSignIn waits for pending web sign-out cookie clear', async () => {
  const events = [];
  let resolveSignOut;
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_AUTH_API__: {
      signOutWebSession: () => new Promise(resolve => {
        events.push('sign-out-start');
        resolveSignOut = () => {
          events.push('sign-out-finish');
          resolve({ ok: true });
        };
      }),
      signIn: async () => {
        events.push('sign-in-start');
        return { access_token: 'token-1', expires_in: 3600 };
      },
    },
  });
  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  });

  const signOutPromise = sandbox.signOutWebSessionBestEffort();
  const signInPromise = sandbox.sbSignIn('manager@example.com', 'pass123');
  await Promise.resolve();

  assert.deepEqual(events, ['sign-out-start']);
  resolveSignOut();
  const result = await signInPromise;
  await signOutPromise;

  assert.equal(result.access_token, 'token-1');
  assert.deepEqual(events, ['sign-out-start', 'sign-out-finish', 'sign-in-start']);
});

test('sbSignIn waits for the shared pending web sign-out when sign-out is requested twice', async () => {
  const events = [];
  let resolveSignOut;
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_AUTH_API__: {
      signOutWebSession: () => new Promise(resolve => {
        events.push('sign-out-start');
        resolveSignOut = () => {
          events.push('sign-out-finish');
          resolve({ ok: true });
        };
      }),
      signIn: async () => {
        events.push('sign-in-start');
        return { access_token: 'token-1', expires_in: 3600 };
      },
    },
  });
  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  });

  const firstSignOut = sandbox.signOutWebSessionBestEffort();
  const secondSignOut = sandbox.signOutWebSessionBestEffort();
  const signInPromise = sandbox.sbSignIn('manager@example.com', 'pass123');
  await Promise.resolve();

  assert.deepEqual(events, ['sign-out-start']);
  resolveSignOut();
  await signInPromise;
  await firstSignOut;
  await secondSignOut;

  assert.deepEqual(events, ['sign-out-start', 'sign-out-finish', 'sign-in-start']);
});

test('app auth fallback posts explicit web session adoption action', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    fetch: async (url, options = {}) => {
      calls.push({
        url,
        body: options.body ? JSON.parse(options.body) : null,
      });
      return createFetchResponse(200, {
        ok: true,
        session: {
          access_token: 'recovery-token',
          expires_in: 1200,
        },
      });
    },
  });
  setState(sandbox, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  });

  const adopted = await sandbox.adoptWebSession({
    access_token: 'recovery-token',
    refresh_token: 'recovery-refresh',
    expires_in: 1200,
  });

  assert.equal(adopted.access_token, 'recovery-token');
  assert.deepEqual(calls[0].body, {
    action: 'web_adopt_session',
    access_token: 'recovery-token',
    refresh_token: 'recovery-refresh',
    expires_in: 1200,
  });
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

test('profile fetch is skipped when no access token is available', async () => {
  const source = readAppJs();
  assert.match(source, /getProfile:\s*\(\{\s*accessToken = ''\s*\} = \{\}\) =>/);
  assert.match(source, /if \(!accessToken\)/);
  assert.match(source, /return Promise\.resolve\(\{ ok: false, profile: null, reason: 'missing-token' \}\)/);

  let fetchCount = 0;
  const sandbox = loadSandboxWithScripts(['core/auth/auth-api.js'], {
    fetch: async () => {
      fetchCount += 1;
      return createFetchResponse(401, { error: 'Missing token' });
    },
  });

  const result = await sandbox.__HF_AUTH_API__.getProfile();
  assert.equal(fetchCount, 0);
  assert.equal(JSON.stringify(result), JSON.stringify({ ok: false, profile: null, reason: 'missing-token' }));
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
