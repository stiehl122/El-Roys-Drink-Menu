const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('manager shell contains cockpit root containers and scripts', () => {
  const html = fs.readFileSync(path.join(root, 'manager/index.html'), 'utf8');

  assert.match(html, /id="manager-cockpit-root"/);
  assert.match(html, /id="manager-cockpit-rail"/);
  assert.match(html, /id="manager-settings-rail"/);
  assert.match(html, /id="manager-cockpit-workbar"/);
  assert.match(html, /id="manager-cockpit-items"/);
  assert.match(html, /id="manager-cockpit-side"/);
  assert.match(html, /id="db-search"/);
  assert.match(html, /id="db-table-wrap"/);
  assert.match(html, /id="manager-cockpit-revision-dock"/);
  assert.match(html, /class="[^"]*\bmanager-cockpit-mobile-trigger\b[^"]*\bmanager-shell-mobile-drawer-trigger\b[^"]*"/);
  assert.match(html, /class="manager-shell-stack-icon"/);
  assert.doesNotMatch(html, />Menu Tools</);
  assert.match(html, /core\/ui\/manager\/cockpit\.js/);
  assert.match(html, /core\/ui\/manager\/item-editor-modal\.js/);
});

test('manager cockpit shell and modules do not wire legacy swipe controls', () => {
  [
    'manager/index.html',
    'core/ui/manager/cockpit.js',
    'core/ui/manager/items-table.js',
  ].forEach(relativePath => {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(source, /item-swipeable/, relativePath);
    assert.doesNotMatch(source, /swipe-action/, relativePath);
  });
});

test('manager cockpit mobile styles use compact rows, workbar, and idle dock', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.manager-cockpit-item-row[\s\S]*grid-template-areas:/);
  assert.match(css, /"order name edit eighty"/);
  assert.match(css, /label\[for="manager-item-search"\][\s\S]*grid-column: 1 \/ -1/);
  assert.match(css, /\.manager-cockpit-dock-inner\.is-collapsed[\s\S]*translateY\(calc\(100% - 12px\)\)/);
  assert.match(css, /\.manager-cockpit-header-stats[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.manager-shell-mobile-drawer-trigger[\s\S]*border-radius: 999px/);
});
