const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function importApiModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(ROOT, relativePath)).href;
  return import(`${fileUrl}?wave4=${Date.now()}-${Math.random()}`);
}

test('wave 4 revision guard returns structured 409 conflicts and tolerates empty revisions', async () => {
  const menuWrite = await importApiModule('server/_menu-write.js');

  assert.equal(typeof menuWrite.assertExpectedRevision, 'function');
  assert.equal(typeof menuWrite.readRevisionState, 'function');
  assert.deepEqual(
    menuWrite.readRevisionState({
      last_updated_ts: '1712705100000',
      draft_saved_ts: 1712705100001,
      last_sent_ts: 'not-a-number',
    }),
    {
      live_revision: 1712705100000,
      draft_revision: 1712705100001,
      last_sent_revision: null,
    }
  );
  assert.doesNotThrow(() => menuWrite.assertExpectedRevision(null, 1712705100000, 'live_revision'));
  assert.doesNotThrow(() => menuWrite.assertExpectedRevision('', 1712705100000, 'draft_revision'));
  assert.doesNotThrow(() => menuWrite.assertExpectedRevision('1712705100000', 1712705100000, 'live_revision'));
  assert.doesNotThrow(() => menuWrite.assertExpectedRevision('not-a-number', 1712705100000, 'draft_revision'));

  assert.throws(
    () => menuWrite.assertExpectedRevision(1712705100001, 1712705100000, 'live_revision', {
      menuId: 'menu-main',
      command: 'menu-live.v1',
      currentRevisions: {
        live_revision: 1712705100000,
        draft_revision: 1712705099999,
      },
    }),
    error => {
      assert.equal(error?.status, 409);
      assert.equal(error?.message, 'live_revision is stale');
      assert.equal(error?.body?.status, 'revision_conflict');
      assert.equal(error?.body?.code, 'revision_conflict');
      assert.equal(error?.body?.field, 'live_revision');
      assert.equal(error?.body?.expected, 1712705100001);
      assert.equal(error?.body?.actual, 1712705100000);
      assert.equal(error?.body?.menu_id, 'menu-main');
      assert.equal(error?.body?.command, 'menu-live.v1');
      assert.deepEqual(error?.body?.current_revisions, {
        live_revision: 1712705100000,
        draft_revision: 1712705099999,
      });
      assert.deepEqual(error?.body?.conflict_units, [{
        type: 'revision_mismatch',
        field: 'live_revision',
        expected: 1712705100001,
        actual: 1712705100000,
      }]);
      assert.deepEqual(error?.body?.server_snapshot, {
        menu_id: 'menu-main',
        current_revisions: {
          live_revision: 1712705100000,
          draft_revision: 1712705099999,
        },
      });
      assert.equal(error?.body?.reconcile?.available, true);
      assert.equal(error?.body?.reconcile?.strategy, 'reload_workspace');
      assert.match(String(error?.body?.reconcile?.token || ''), /^menu-main:live_revision:/);
      assert.deepEqual(error?.body?.reconnect, {
        required: true,
        reason: 'stale_revision',
        action: 'reload_workspace',
      });
      return true;
    }
  );
});

test('wave 4 server modules harden actor authorization and check revisions before publish side effects', () => {
  const menuWrite = read('server/_menu-write.js');
  const menuPublish = read('server/_menu-publish.js');
  const adminSettings = read('server/_admin-settings.js');

  assert.match(menuWrite, /from '\.\/_auth\.js'/);
  assert.match(menuWrite, /requireAuthenticatedUser/);
  assert.match(menuWrite, /readProfile/);
  assert.match(menuWrite, /requireMenuAccess/);
  assert.match(menuWrite, /!\['manager', 'admin'\]\.includes\(role\)/);
  assert.match(menuWrite, /throw \{ status: 403, message: 'Forbidden' \}/);
  assert.match(menuWrite, /await requireMenuAccess\(caller\.uid, role, menuId\)/);
  assert.match(menuWrite, /export function readRevisionState\(meta = \{\}\)/);
  assert.match(menuWrite, /current_revisions:/);
  assert.match(menuWrite, /reconnect:/);

  assert.match(menuPublish, /const currentRevisions = readRevisionState\(meta\)/);
  assert.match(menuPublish, /command: 'menu-publish\.v1'/);
  assert.match(menuPublish, /assertExpectedRevision\(expectedLiveRevision, meta\?\.last_updated_ts \|\| null, 'live_revision', \{/);
  assert.match(menuPublish, /assertExpectedRevision\(expectedDraftRevision, meta\?\.draft_saved_ts \|\| null, 'draft_revision', \{/);
  const liveRevisionCheckIndex = menuPublish.indexOf("assertExpectedRevision(expectedLiveRevision, meta?.last_updated_ts || null, 'live_revision', {");
  const draftRevisionCheckIndex = menuPublish.indexOf("assertExpectedRevision(expectedDraftRevision, meta?.draft_saved_ts || null, 'draft_revision', {");
  const saveLiveIndex = menuPublish.indexOf('await saveLiveMenuForMenu({');
  const notifyIndex = menuPublish.indexOf('await deliverMenuNotification(');
  assert.ok(liveRevisionCheckIndex > -1 && liveRevisionCheckIndex < saveLiveIndex);
  assert.ok(draftRevisionCheckIndex > -1 && draftRevisionCheckIndex < notifyIndex);

  assert.match(adminSettings, /export async function authorizeAdminSettingsRequest\(req\)/);
  assert.match(adminSettings, /requireRole\(req, 'admin'\)/);
  assert.match(adminSettings, /readProfile\(actor\.uid, \{ select: 'name' \}\)/);
  assert.match(adminSettings, /command: 'admin-settings\.v1'/);
  assert.match(adminSettings, /serverOwned: true/);
});

test('wave 4 write routes preserve structured API error bodies and explicit input guards', () => {
  const menuDraft = read('api/menu-draft.js');
  const menuLive = read('api/menu-live.js');
  const menuPublish = read('api/menu-publish.js');
  const adminSettings = read('api/admin-settings.js');

  assert.match(menuDraft, /return res\.status\(error\?\.\s*status \|\| 500\)\.json\(error\?\.body \|\| \{/);
  assert.match(menuLive, /return res\.status\(error\?\.\s*status \|\| 500\)\.json\(error\?\.body \|\| \{ error:/);
  assert.match(menuPublish, /return res\.status\(error\?\.\s*status \|\| 500\)\.json\(error\?\.body \|\| \{/);
  assert.match(adminSettings, /return res\.status\(error\?\.\s*status \|\| 500\)\.json\(error\?\.body \|\| \{/);

  assert.match(menuPublish, /if \(!menuId\) return res\.status\(400\)\.json\(\{ error: 'Missing menu_id' \}\)/);
  assert.match(menuPublish, /expected_live_revision/);
  assert.match(menuPublish, /expected_draft_revision/);
  assert.match(adminSettings, /status: 'admin_settings_invalid_request'/);
  assert.match(adminSettings, /error: 'Missing action'/);
});
