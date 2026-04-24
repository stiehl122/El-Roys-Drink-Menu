const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', 'server', '_admin-read-models.js');
const source = fs.readFileSync(sourcePath, 'utf8');

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
