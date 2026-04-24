const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const sourcePath = path.join(__dirname, '..', 'server', '_admin-read-models.js');
const source = fs.readFileSync(sourcePath, 'utf8');

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(__dirname, '..', relativePath)).href;
  return import(`${fileUrl}?adminAccessAtomicity=${Date.now()}-${Math.random()}`);
}

test('admin updateUserAccess uses atomic RPC instead of deleting menu_access rows first', () => {
  assert.match(
    source,
    /rpc\/update_user_profile_and_menu_access/,
    'updateUserAccess must call the transactional Supabase RPC'
  );
  assert.doesNotMatch(
    source,
    /rest\/v1\/menu_access\?user_id=eq\.\$\{userId\}/,
    'updateUserAccess must not delete all existing access rows before inserting replacements'
  );
});

test('admin updateUserAccess rejects malformed explicit role updates before RPC', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/auth/v1/user')) {
      return {
        ok: true,
        async json() {
          return { id: 'admin-user' };
        },
      };
    }
    if (href.includes('/rest/v1/profiles?')) {
      return {
        ok: true,
        async json() {
          return [{ role: 'admin' }];
        },
      };
    }
    if (href.includes('/rest/v1/rpc/update_user_profile_and_menu_access')) {
      return {
        ok: true,
        async json() {
          return { ok: true };
        },
      };
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const { updateAdminUser } = await importApiModule('server/_admin-read-models.js');
    const req = { headers: { authorization: 'Bearer admin-token' } };

    for (const malformedRole of [null, '', false, 0]) {
      calls.length = 0;
      await assert.rejects(
        updateAdminUser(req, { userId: 'target-user', role: malformedRole }),
        error => error?.status === 400 && error?.message === 'Invalid role'
      );
      assert.equal(
        calls.some(href => href.includes('/rest/v1/rpc/update_user_profile_and_menu_access')),
        false,
        `malformed role ${String(malformedRole)} must not reach the RPC`
      );
    }
  } finally {
    global.fetch = originalFetch;
  }
});
