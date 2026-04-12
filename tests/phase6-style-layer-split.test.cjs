const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('phase 6 style layer files exist', () => {
  const expected = [
    'styles/tokens.css',
    'styles/shared-shell.css',
    'styles/public-fallback.css',
    'styles/components/menu-picker.css',
    'styles/components/toast.css',
  ];

  expected.forEach(file => {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} is missing`);
  });
});

test('style.css uses layered imports as compatibility entrypoint', () => {
  const source = read('style.css');
  assert.match(source, /@import\s+url\('\/styles\/tokens\.css'\);/);
  assert.match(source, /@import\s+url\('\/styles\/shared-shell\.css'\);/);
  assert.match(source, /@import\s+url\('\/styles\/public-fallback\.css'\);/);
  assert.match(source, /@import\s+url\('\/styles\/components\/menu-picker\.css'\);/);
  assert.match(source, /@import\s+url\('\/styles\/components\/toast\.css'\);/);
  assert.doesNotMatch(source, /@import\s+url\('\/styles\/manager\.css'\);/);
  assert.doesNotMatch(source, /@import\s+url\('\/styles\/admin\.css'\);/);
  assert.doesNotMatch(source, /@import\s+url\('\/styles\/components\/auth-overlay\.css'\);/);
});
