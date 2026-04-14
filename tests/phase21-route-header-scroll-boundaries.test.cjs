const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('phase 21 shared route core no longer owns mobile compact header state', () => {
  const source = read('routes/shared/public-route-core.js');
  assert.doesNotMatch(source, /function\s+bindMobileHeader\s*\(/);
  assert.doesNotMatch(source, /is-mobile-compact/);
  assert.doesNotMatch(source, /is-mobile-expanded/);
  assert.doesNotMatch(source, /is-near-top/);
});

test('phase 21 restaurant route headers scroll in normal flow without compact variants', () => {
  const leroysCss = read('leroyslounge/style.css');
  const cantinaCss = read('elroyscantina/style.css');

  assert.match(leroysCss, /#restaurant-site-wrapper\s+\.ll-board-topbar\s*{[\s\S]*?position:\s*relative;/);
  assert.match(cantinaCss, /#restaurant-site-wrapper\s+\.erc-topbar\s*{[\s\S]*?position:\s*relative;/);
  assert.doesNotMatch(leroysCss, /\.ll-board-page\.is-mobile-compact/);
  assert.doesNotMatch(cantinaCss, /\.erc-page\.is-mobile-compact/);
});

test('phase 21 admin header scrolls in normal flow and mobile navigation uses a drawer trigger', () => {
  const adminHtml = read('admin/index.html');
  const sharedCss = read('style.css');

  assert.match(adminHtml, /id="admin-mobile-drawer-toggle"/);
  assert.match(adminHtml, /id="admin-settings-drawer-backdrop"/);
  assert.match(adminHtml, /id="admin-settings-rail"/);
  assert.match(adminHtml, /class="admin-console-rail-close"/);

  assert.match(sharedCss, /\.admin-console-topbar\s*{[\s\S]*?position:\s*static;/);
  assert.match(sharedCss, /\.admin-console-mobile-toggle\s*{[\s\S]*?display:\s*none;/);
  assert.match(sharedCss, /@media\s*\(max-width:\s*900px\)\s*{[\s\S]*?\.admin-console-mobile-toggle\s*{[\s\S]*?position:\s*fixed;/);
  assert.match(sharedCss, /@media\s*\(max-width:\s*900px\)\s*{[\s\S]*?\.admin-console-rail\s*{[\s\S]*?position:\s*fixed;[\s\S]*?transform:\s*translateX\(-100%\);/);
  assert.match(sharedCss, /\.admin-console-rail\.is-open\s*{[\s\S]*?transform:\s*translateX\(0\);/);
});

test('phase 21 shared drawer runtime supports admin drawer ids and body class', () => {
  const source = read('app.js');

  assert.match(source, /function\s+getSettingsDrawerDom\s*\(/);
  assert.match(source, /admin-settings-rail/);
  assert.match(source, /admin-settings-drawer-backdrop/);
  assert.match(source, /admin-mobile-drawer-toggle/);
  assert.match(source, /admin-settings-drawer-open/);
  assert.match(source, /document\.body\.classList\.remove\('settings-drawer-open', 'admin-settings-drawer-open'\)/);
});
