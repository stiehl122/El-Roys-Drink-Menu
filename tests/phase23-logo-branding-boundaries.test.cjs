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

test('entry shells reference ELROYSTEMPLOGO instead of HFLOGO', () => {
  const entryFiles = [
    'index.html',
    'manager/index.html',
    'admin/index.html',
    'leroyslounge/index.html',
    'elroyscantina/index.html',
  ];

  entryFiles.forEach(file => {
    const html = read(file);

    assert.match(html, /ELROYSTEMPLOGO\.png/);
    assert.doesNotMatch(html, /HFLOGO\.png/);
    assert.doesNotMatch(html, /HFLOGO/);
  });
});

test("El Roy's route header/footer and Leroy's jump button use temp logo artwork", () => {
  const cantinaHtml = read('elroyscantina/index.html');
  const cantinaCss = read('elroyscantina/style.css');
  const leroysHtml = read('leroyslounge/index.html');
  const leroysCss = read('leroyslounge/style.css');

  assert.match(cantinaHtml, /class="erc-brand-logo"[\s\S]*src="\/ELROYSTEMPLOGO\.png"/);
  assert.match(cantinaHtml, /class="erc-footer-logo"[\s\S]*src="\/ELROYSTEMPLOGO\.png"/);
  assert.match(cantinaCss, /\.erc-brand-logo/);
  assert.match(cantinaCss, /\.erc-footer-logo/);
  assert.match(leroysHtml, /class="ll-board-jump-link"[\s\S]*<img[\s\S]*src="\/ELROYSTEMPLOGO\.png"/);
  assert.match(leroysCss, /\.ll-board-jump-logo/);
});

test('ELROYSTEMPLOGO assets exist for web and iOS app icons', () => {
  assert.equal(exists('ELROYSTEMPLOGO.png'), true);

  const contents = read('ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/Contents.json');
  const manifest = JSON.parse(contents);
  const filenames = manifest.images
    .map(image => image.filename)
    .filter(Boolean);

  assert.notEqual(filenames.length, 0);
  assert.ok(filenames.every(filename => /^ELROYSTEMPLOGO-.+\.png$/.test(filename)));
  assert.ok(filenames.some(filename => filename.startsWith('ELROYSTEMPLOGO-')));
});
