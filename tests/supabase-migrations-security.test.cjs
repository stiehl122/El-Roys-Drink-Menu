const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function readMigration(fileName) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8');
}

test('profile self-insert policy can only create role none profiles', () => {
  const source = readMigration('20260428000000_lockdown_profile_self_insert.sql');

  assert.match(source, /drop policy if exists "Users can insert own profile" on profiles;/);
  assert.match(source, /create policy "Users can insert own profile"/);
  assert.match(source, /for insert/);
  assert.match(source, /with check \(\s*auth\.uid\(\) = id\s+and\s+role = 'none'\s*\)/);
});
