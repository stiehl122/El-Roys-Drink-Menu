const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

test("leroy's wall route references approved production assets and links", () => {
  const html = read('leroyslounge/index.html');
  const css = read('leroyslounge/style.css');

  [
    'leroys-wall-background.png',
    'leroys-horizontal-wood-sign.png',
    'leroys-established-sign.png',
    'leroys-ice-cold-beer-sign.png',
    'leroys-pool-free-play-sign.png',
    'leroys-pull-tabs-sign.png',
    'leroys-thumbs-up-panel.png',
    'leroys-michigan-plate.png',
    'leroys-margarita-note.png',
  ].forEach(filename => {
    assert.equal(exists(`assets/leroys-lounge/wall/${filename}`), true, `${filename} must exist`);
  });

  assert.match(css, /url\(["']?\/assets\/leroys-lounge\/wall\/leroys-wall-background\.png["']?\)/);
  assert.match(html, /class="ll-wall-brand-link"[\s\S]*href="\/"/);
  assert.match(html, /src="\/assets\/leroys-lounge\/wall\/leroys-horizontal-wood-sign\.png"/);
  assert.match(html, /<a\b(?=[^>]*\bclass="[^"]*\bll-wall-note-link\b[^"]*")(?=[^>]*\bhref="\/elroyscantina\?menu=drinks")[^>]*>/);
  assert.match(html, /<a\b(?=[^>]*\bclass="[^"]*\bll-wall-pull-tabs-link\b[^"]*")(?=[^>]*\bhref="https:\/\/www\.michiganlottery\.com\/resources\/pull-tabs-prizes-remaining")[^>]*>/);
});

test("leroy's wall route keeps public footer and auth boundaries", () => {
  const html = read('leroyslounge/index.html');

  assert.match(html, /id="leroy-route-template"/);
  assert.match(html, /data-route-footer-actions/);
  assert.match(html, /data-route-footer-signin/);
  assert.match(html, /data-route-footer-manager/);
  assert.match(html, /data-route-footer-admin/);
  assert.match(html, /data-route-footer-signout/);
  assert.match(html, /id="ll-route-footer-timestamp"/);
  assert.match(html, /id="ll-route-footer-version"/);
  assert.equal(html.includes('data-route-signin'), false, 'route must not reintroduce top sign-in');
  assert.equal(html.includes('data-auth-origin="route-header"'), false, 'route must not reintroduce header auth');
});

test("leroy's route adapter renders wall menu states", () => {
  const source = read('leroyslounge/app.js');

  assert.match(source, /LEROYS_SPECIAL_EMPTY\s*=\s*"Leroy doesn't have anything special cooking up this week"/);
  assert.match(source, /function\s+isFoodMenu\s*\(/);
  assert.match(source, /function\s+buildWeeklySpecialHtml\s*\(/);
  assert.match(source, /function\s+buildEmptyWeeklySpecialHtml\s*\(/);
  assert.match(source, /if\s*\(\s*!isFoodMenu\(sharedState\)\s*\)\s*return\s+'';/);
  assert.match(source, /class="ll-wall-special-price"/);
  assert.match(source, />Sold Out</);
  assert.match(source, /emptyCategoriesHtml:\s*'<p class="ll-wall-empty">Nothing on the menu yet.<\/p>'/);
});

test("leroy's wall css keeps route scope, desktop side signs, and mobile hiding", () => {
  const css = read('leroyslounge/style.css');

  assert.match(css, /#restaurant-site-wrapper\s+\.ll-board-topbar\s*{[\s\S]*?position:\s*relative;/);
  assert.match(css, /#restaurant-site-wrapper\s+\.ll-wall-page/);
  assert.match(css, /#restaurant-site-wrapper\s+\.ll-wall-stage\s*{[\s\S]*?grid-template-columns:\s*minmax\(155px,\s*215px\)\s+minmax\(0,\s*760px\)\s+minmax\(155px,\s*215px\)/);
  assert.match(css, /@media\s*\(max-width:\s*1120px\)\s*{[\s\S]*?\.ll-wall-signs\s*{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.ll-board-userchip-trigger/);
  assert.match(css, /\.ll-board-userdropdown\.ll-site-userdropdown/);
  assert.doesNotMatch(css, /\.ll-board-page\.is-mobile-compact/);
});
