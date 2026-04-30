const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const LEROYS_DRINKS_MENU_ID = '00000000-0000-0000-0000-000000000020';

async function importServerModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?managerNotes=${Date.now()}-${Math.random()}`);
}

function withSupabaseEnv(run) {
  const originalUrl = process.env.SUPABASE_URL;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
    });
}

test('manager note payload normalizes null and row values to strings', async () => {
  const { createManagerNotePayload } = await importServerModule('server/_manager-notes.js');

  assert.deepEqual(createManagerNotePayload(), {
    note: '',
    updated_at: '',
    updated_by: '',
  });
  assert.deepEqual(createManagerNotePayload({
    note: 42,
    updated_at: null,
    updated_by: 'user-1',
  }), {
    note: '42',
    updated_at: '',
    updated_by: 'user-1',
  });
});

test('manager note body trims menu id and preserves note text exactly', async () => {
  const { normalizeManagerNoteBody } = await importServerModule('server/_manager-notes.js');

  assert.deepEqual(normalizeManagerNoteBody({
    menu_id: ` ${LEROYS_DRINKS_MENU_ID} `,
    note: '  line one\nline two  ',
  }), {
    menuId: LEROYS_DRINKS_MENU_ID,
    note: '  line one\nline two  ',
  });
  assert.deepEqual(normalizeManagerNoteBody({
    menuId: `\n${LEROYS_DRINKS_MENU_ID}\t`,
    note: null,
  }), {
    menuId: LEROYS_DRINKS_MENU_ID,
    note: '',
  });
});

test('manager note read uses the menu notes table and returns an empty payload for missing rows', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      async json() {
        return [];
      },
    };
  };

  try {
    await withSupabaseEnv(async () => {
      const { readManagerNoteForMenu } = await importServerModule('server/_manager-notes.js');
      const payload = await readManagerNoteForMenu(LEROYS_DRINKS_MENU_ID);

      assert.deepEqual(payload, { note: '', updated_at: '', updated_by: '' });
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/rest\/v1\/menu_manager_notes\?/);
      assert.match(calls[0].url, new RegExp(`menu_id=eq\\.${LEROYS_DRINKS_MENU_ID}`));
      assert.match(calls[0].url, /select=note%2Cupdated_at%2Cupdated_by/);
      assert.equal(calls[0].options.headers.apikey, 'service-role-key');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('workspace manager note read falls back to empty payload when the notes table is unavailable', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    async json() {
      return { message: 'relation "menu_manager_notes" does not exist' };
    },
  });

  try {
    await withSupabaseEnv(async () => {
      const {
        readManagerNoteForMenu,
        readManagerNoteForWorkspace,
      } = await importServerModule('server/_manager-notes.js');

      assert.deepEqual(await readManagerNoteForWorkspace(LEROYS_DRINKS_MENU_ID), {
        note: '',
        updated_at: '',
        updated_by: '',
      });

      await assert.rejects(
        () => readManagerNoteForMenu(LEROYS_DRINKS_MENU_ID),
        error => error?.status === 500 && /menu_manager_notes/.test(error?.message || '')
      );
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('manager note write authenticates menu access and upserts note payload', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, options });

    if (href.includes('/auth/v1/user')) {
      return { ok: true, async json() { return { id: 'user-1' }; } };
    }
    if (href.includes('/rest/v1/profiles?id=eq.user-1')) {
      return { ok: true, async json() { return [{ role: 'manager', name: 'Mina' }]; } };
    }
    if (href.includes('/rest/v1/menu_access?user_id=eq.user-1&menu_id=in.')) {
      return { ok: true, async json() { return [{ menu_id: LEROYS_DRINKS_MENU_ID }]; } };
    }
    if (href.includes('/rest/v1/menu_manager_notes?on_conflict=menu_id')) {
      return {
        ok: true,
        async json() {
          return [{
            note: '  exact note  ',
            updated_at: '2026-04-29T12:00:00.000Z',
            updated_by: 'user-1',
          }];
        },
      };
    }

    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    await withSupabaseEnv(async () => {
      const { writeManagerNoteCommand } = await importServerModule('server/_manager-notes.js');
      const result = await writeManagerNoteCommand({
        headers: { authorization: 'Bearer token' },
      }, {
        menu_id: LEROYS_DRINKS_MENU_ID,
        note: '  exact note  ',
      });

      assert.deepEqual(result.actor, {
        id: 'user-1',
        name: 'Mina',
        role: 'manager',
      });
      assert.deepEqual(result.note, {
        note: '  exact note  ',
        updated_at: '2026-04-29T12:00:00.000Z',
        updated_by: 'user-1',
      });

      const upsertCall = calls.find(call => call.url.includes('/rest/v1/menu_manager_notes?on_conflict=menu_id'));
      assert.ok(upsertCall, 'expected manager note upsert');
      assert.equal(upsertCall.options.method, 'POST');
      assert.equal(upsertCall.options.headers.Prefer, 'resolution=merge-duplicates,return=representation');
      const upsertBody = JSON.parse(upsertCall.options.body);
      assert.equal(upsertBody.menu_id, LEROYS_DRINKS_MENU_ID);
      assert.equal(upsertBody.note, '  exact note  ');
      assert.equal(upsertBody.updated_by, 'user-1');
      assert.equal(typeof upsertBody.updated_at, 'string');
      assert.ok(!Number.isNaN(Date.parse(upsertBody.updated_at)), 'expected updated_at timestamp');
      assert.deepEqual(Object.keys(upsertBody).sort(), [
        'menu_id',
        'note',
        'updated_at',
        'updated_by',
      ]);
    });
  } finally {
    global.fetch = originalFetch;
  }
});
