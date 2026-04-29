const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('manager shell contains cockpit root containers and scripts', () => {
  const html = fs.readFileSync(path.join(root, 'manager/index.html'), 'utf8');

  assert.match(html, /id="manager-cockpit-root"/);
  assert.match(html, /id="manager-cockpit-rail"/);
  assert.match(html, /id="manager-cockpit-workbar"/);
  assert.match(html, /id="manager-cockpit-items"/);
  assert.match(html, /id="manager-cockpit-side"/);
  assert.match(html, /id="manager-cockpit-revision-dock"/);
  assert.match(html, /core\/ui\/manager\/cockpit\.js/);
  assert.match(html, /core\/ui\/manager\/item-editor-modal\.js/);
});
