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

test('launch gates workflow runs unsigned iOS simulator tests on macOS', () => {
  const workflow = read('.github/workflows/launch-gates.yml');

  assert.match(workflow, /runs-on:\s*macos-/);
  assert.match(workflow, /xcodebuild test/);
  assert.match(workflow, /ios\/ElRoysManagerApp\.xcodeproj/);
  assert.match(workflow, /-scheme ElRoysManagerApp/);
  assert.match(workflow, /-destination ['"]platform=iOS Simulator,name=iPhone 16['"]/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
});
