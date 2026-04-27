const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('launch gates workflow runs on pull requests and pushes', () => {
  const workflow = read('.github/workflows/launch-gates.yml');

  assert.match(workflow, /^name:\s*Launch Gates$/m);
  assert.match(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*branches:/m);
});

test('launch gates workflow runs required web and server checks on Node 24', () => {
  const workflow = read('.github/workflows/launch-gates.yml');

  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version:\s*['"]24['"]/);
  assert.match(workflow, /node --check app\.js/);
  assert.match(workflow, /find api server core -name '\*\.js' -print0 \| xargs -0 -n 1 node --check/);
  assert.match(workflow, /node scripts\/check-html-script-order\.cjs/);
  assert.match(workflow, /node --test tests\/\*\.test\.cjs tests\/boundaries\/\*\.test\.cjs/);
});

test('launch gates workflow leaves iOS CI to Xcode Cloud', () => {
  const workflow = read('.github/workflows/launch-gates.yml');
  const xcodeCloudDocs = read('docs/launch/xcode-cloud.md');
  const releaseRunbook = read('docs/launch/release-runbook.md');

  assert.doesNotMatch(workflow, /^\s*ios:/m);
  assert.doesNotMatch(workflow, /runs-on:\s*macos-/);
  assert.doesNotMatch(workflow, /xcodebuild test/);
  assert.match(xcodeCloudDocs, /Xcode Cloud/);
  assert.match(xcodeCloudDocs, /ElRoysManagerApp/);
  assert.match(xcodeCloudDocs, /TestFlight/);
  assert.match(releaseRunbook, /Xcode Cloud/);
});

test('iOS launch gate only waits for Xcode Cloud when ios files change', () => {
  const workflow = read('.github/workflows/ios-launch-gate.yml');

  assert.match(workflow, /^name:\s*iOS Launch Gate$/m);
  assert.match(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /^\s*push:/m);
  assert.match(workflow, /name:\s*Xcode Cloud Gate/);
  assert.match(workflow, /pulls\/\$\{\{ github\.event\.pull_request\.number \}\}\/files/);
  assert.match(workflow, /grep -q '\^ios\/'/);
  assert.match(workflow, /if:\s*steps\.changes\.outputs\.ios_changed == 'false'/);
  assert.match(workflow, /No ios\/ changes; Xcode Cloud is not required\./);
  assert.match(workflow, /if:\s*steps\.changes\.outputs\.ios_changed == 'true'/);
  assert.match(workflow, /XCODE_CONTEXT:\s*ElRoysManagerApp \| Branch Protection/);
  assert.match(workflow, /commits\/\$SHA\/status/);
  assert.match(workflow, /case "\$state" in/);
  assert.match(workflow, /success\)/);
  assert.match(workflow, /failure\|error\)/);
});
