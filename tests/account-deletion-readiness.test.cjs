const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function importAdminReadModels() {
  const fileUrl = pathToFileURL(path.join(__dirname, '..', 'server', '_admin-read-models.js')).href;
  return import(`${fileUrl}?accountDeletionReadiness=${Date.now()}-${Math.random()}`);
}

function mockJsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test('admin API exposes account deletion request read and completion actions', () => {
  const apiSource = readFileSync('api/admin.js', 'utf8');
  assert.match(apiSource, /account_deletion_requests/);
  assert.match(apiSource, /complete_account_deletion_request/);
});

test('admin read models select deletion request metadata from auth users', () => {
  const source = readFileSync('server/_admin-read-models.js', 'utf8');
  assert.match(source, /account_deletion_requested/);
  assert.match(source, /pending_admin_review/);
  assert.match(source, /readAccountDeletionRequests/);
});

test('admin completion action removes access and deletes the auth user', () => {
  const source = readFileSync('server/_admin-read-models.js', 'utf8');
  assert.match(source, /completeAccountDeletionRequest/);
  assert.match(source, /menu_access/);
  assert.match(source, /auth\/v1\/admin\/users/);
  assert.match(source, /DELETE/);
});

test('privacy and terms expose concrete contact and deletion timeline', () => {
  const privacy = readFileSync('privacy.html', 'utf8');
  const terms = readFileSync('terms.html', 'utf8');
  assert.doesNotMatch(privacy, /@elroys\.example/);
  assert.doesNotMatch(terms, /@elroys\.example/);
  assert.match(privacy, /within 30 days/);
  assert.match(privacy, /remove menu access/);
  assert.match(privacy, /delete the Supabase Auth account/);
  assert.match(terms, /restaurant administrator/);
});

test('App Store checklist identifies owner-controlled privacy launch decisions', () => {
  const checklist = readFileSync('docs/launch/app-store-privacy-checklist.md', 'utf8');
  assert.doesNotMatch(checklist, /@elroys\.example/);
  assert.match(checklist, /private TestFlight/);
  assert.match(checklist, /Confirm the account deletion completion SLA/);
  assert.match(checklist, /App Store Connect privacy nutrition labels/);
  assert.match(checklist, /delete Supabase Auth users/);
});

test('admin account deletion read model paginates and returns only pending requests', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, headers: options.headers || {} });
    assert.equal(options.headers.Authorization, 'Bearer service-role-key');
    assert.equal(options.headers.apikey, 'service-role-key');

    const parsed = new URL(href);
    assert.equal(parsed.pathname, '/auth/v1/admin/users');
    assert.equal(parsed.searchParams.get('per_page'), '200');
    const page = parsed.searchParams.get('page');
    if (page === '1') {
      return mockJsonResponse({
        users: [
          {
            id: 'pending-user-1',
            email: 'pending1@example.com',
            user_metadata: {
              account_deletion_requested: true,
              account_deletion_requested_at: '2026-04-26T10:00:00.000Z',
              account_deletion_request_status: 'pending_admin_review',
              account_deletion_request_source: 'ios-account-menu',
            },
          },
          ...Array.from({ length: 198 }, (_, index) => ({
            id: `not-requested-page-1-${index}`,
            email: `not-requested-${index}@example.com`,
            user_metadata: {},
          })),
          {
            id: 'completed-user',
            email: 'done@example.com',
            user_metadata: {
              account_deletion_requested: true,
              account_deletion_request_status: 'completed',
            },
          },
        ],
      });
    }
    if (page === '2') {
      return mockJsonResponse({
        users: [
          {
            id: 'pending-user-2',
            email: 'pending2@example.com',
            user_metadata: {
              account_deletion_requested: true,
              account_deletion_request_status: 'pending_admin_review',
            },
          },
          {
            id: 'not-requested-user',
            email: 'nope@example.com',
            user_metadata: {
              account_deletion_request_status: 'pending_admin_review',
            },
          },
        ],
      });
    }
    throw new Error(`Unexpected page: ${page}`);
  };

  try {
    const { readAccountDeletionRequests } = await importAdminReadModels();
    const result = await readAccountDeletionRequests();

    assert.deepEqual(calls.map(call => new URL(call.href).searchParams.get('page')), ['1', '2']);
    assert.deepEqual(result, {
      ok: true,
      requests: [
        {
          userId: 'pending-user-1',
          email: 'pending1@example.com',
          requestedAt: '2026-04-26T10:00:00.000Z',
          status: 'pending_admin_review',
          source: 'ios-account-menu',
        },
        {
          userId: 'pending-user-2',
          email: 'pending2@example.com',
          requestedAt: '',
          status: 'pending_admin_review',
          source: '',
        },
      ],
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('admin account deletion completion validates pending metadata before mutating access', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET' });
    assert.equal(options.headers.Authorization, 'Bearer service-role-key');
    assert.equal(options.headers.apikey, 'service-role-key');

    if (href === 'https://example.supabase.co/auth/v1/admin/users/not-pending-user') {
      return mockJsonResponse({
        id: 'not-pending-user',
        email: 'not-pending@example.com',
        user_metadata: {
          account_deletion_requested: false,
          account_deletion_request_status: 'completed',
        },
      });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const { completeAccountDeletionRequest } = await importAdminReadModels();
    await assert.rejects(
      completeAccountDeletionRequest('not-pending-user', { id: 'admin-user' }),
      error => error?.status === 409 && /pending account deletion request/i.test(error?.message || '')
    );
    assert.deepEqual(calls.map(call => call.method), ['GET']);
    assert.equal(
      calls.some(call => call.href.includes('/rest/v1/menu_access') || call.href.includes('/rest/v1/profiles')),
      false
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('admin account deletion completion removes access, demotes role, and deletes the auth user', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, method, headers: options.headers || {}, body });
    assert.equal(options.headers.Authorization, 'Bearer service-role-key');
    assert.equal(options.headers.apikey, 'service-role-key');

    if (href === 'https://example.supabase.co/auth/v1/admin/users/pending-admin-user' && method === 'GET') {
      return mockJsonResponse({
        id: 'pending-admin-user',
        email: 'admin@example.com',
        user_metadata: {
          favorite_color: 'green',
          account_deletion_requested: true,
          account_deletion_requested_at: '2026-04-26T10:00:00.000Z',
          account_deletion_request_status: 'pending_admin_review',
        },
      });
    }
    if (href === 'https://example.supabase.co/rest/v1/menu_access?user_id=eq.pending-admin-user' && method === 'DELETE') {
      return mockJsonResponse([]);
    }
    if (href === 'https://example.supabase.co/rest/v1/profiles?id=eq.pending-admin-user' && method === 'PATCH') {
      assert.deepEqual(body, { role: 'none' });
      return mockJsonResponse([{ id: 'pending-admin-user', role: 'none' }]);
    }
    if (href === 'https://example.supabase.co/auth/v1/admin/users/pending-admin-user' && method === 'DELETE') {
      assert.equal(body, null);
      return mockJsonResponse({ id: 'pending-admin-user', deleted: true });
    }
    throw new Error(`Unexpected fetch: ${method} ${href}`);
  };

  try {
    const { completeAccountDeletionRequest } = await importAdminReadModels();
    const result = await completeAccountDeletionRequest('pending-admin-user', { id: 'admin-user' });

    assert.equal(result.ok, true);
    assert.equal(result.userId, 'pending-admin-user');
    assert.equal(result.status, 'deleted');
    assert.match(result.completedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(
      calls.map(call => `${call.method} ${new URL(call.href).pathname}${new URL(call.href).search}`),
      [
        'GET /auth/v1/admin/users/pending-admin-user',
        'DELETE /rest/v1/menu_access?user_id=eq.pending-admin-user',
        'PATCH /rest/v1/profiles?id=eq.pending-admin-user',
        'DELETE /auth/v1/admin/users/pending-admin-user',
      ]
    );
    assert.equal(calls[2].headers.Prefer, 'return=representation');
    assert.equal(calls[3].headers.Authorization, 'Bearer service-role-key');
  } finally {
    global.fetch = originalFetch;
  }
});
