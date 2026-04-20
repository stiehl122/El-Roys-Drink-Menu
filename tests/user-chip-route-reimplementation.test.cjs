const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('user chip runtime hydrates route-owned chips by data contract instead of hard-coded ids', () => {
  const source = read('app.js');

  assert.match(source, /querySelectorAll\('\[data-user-chip\]'\)/);
  assert.match(source, /querySelector\('\[data-user-chip-name\]'\)/);
  assert.match(source, /querySelector\('\[data-user-chip-role\]'\)/);
  assert.match(source, /querySelector\('\[data-user-chip-initials\]'\)/);

  assert.doesNotMatch(source, /ll-user-dropdown-name/);
  assert.doesNotMatch(source, /erc-user-dropdown-name/);
  assert.doesNotMatch(source, /document\.getElementById\('user-initials'\)/);
});
