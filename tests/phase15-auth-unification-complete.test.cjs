const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { loadSandboxWithScripts } = require('./helpers/runtime.cjs');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('auth module scripts register unified auth boundaries', () => {
  const sandbox = loadSandboxWithScripts([
    'core/auth/auth-api.js',
    'core/auth/auth-session-service.js',
    'core/auth/auth-overlay-template.js',
    'core/auth/auth-overlay-controller.js',
  ]);

  assert.equal(typeof sandbox.__HF_AUTH_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.createAccessSessionService, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.applySession, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.scheduleTokenRefresh, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.clearStoredSession, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.createAuthOverlayController, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.mountAuthOverlayTemplate, 'function');
});

test('app createAccessSessionService delegates through shared auth module boundary', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_AUTH_MODULES__: {
      createAccessSessionService: (...args) => {
        calls.push(args);
        return {
          restoreStoredSession: async () => ({ restored: false, delegated: true }),
        };
      },
    },
  });

  const service = sandbox.createAccessSessionService();
  const result = await service.restoreStoredSession();
  assert.equal(result.delegated, true);
  assert.equal(calls.length, 1);
});

test('app auth overlay functions delegate through shared overlay controller boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_AUTH_MODULES__: {
      createAuthOverlayController: () => ({
        requestSignIn: options => calls.push(['requestSignIn', options]),
        openAuthOverlay: screen => calls.push(['openAuthOverlay', screen]),
        closeAuthOverlay: () => calls.push(['closeAuthOverlay']),
        renderAuthScreen: screen => calls.push(['renderAuthScreen', screen]),
      }),
    },
  });

  sandbox.requestSignIn({ origin: 'test-origin' });
  sandbox.openAuthOverlay('signup');
  sandbox.renderAuthScreen('forgot');
  sandbox.closeAuthOverlay();

  assert.deepEqual(calls, [
    ['requestSignIn', { origin: 'test-origin' }],
    ['openAuthOverlay', 'signup'],
    ['renderAuthScreen', 'forgot'],
    ['closeAuthOverlay'],
  ]);
});

test('all entry shells source auth overlay from one shared template script', () => {
  const entryFiles = [
    'index.html',
    'manager/index.html',
    'admin/index.html',
    'leroyslounge/index.html',
    'elroyscantina/index.html',
  ];

  entryFiles.forEach(file => {
    const html = read(file);
    assert.equal(html.includes('id="auth-overlay"'), false, `${file} still contains inline auth overlay markup`);
    assert.equal(html.includes('onclick="requestSignIn('), false, `${file} still has inline requestSignIn handler`);
    assert.equal(html.includes('/core/auth/auth-overlay-template.js'), true, `${file} must load shared auth overlay template`);
    assert.equal(html.includes('/core/auth/auth-overlay-controller.js'), true, `${file} must load shared auth overlay controller`);
    assert.equal(html.includes('/core/auth/auth-session-service.js'), true, `${file} must load shared auth session service`);
  });
});

test('route adapters no longer hard-hide route sign-in controls', () => {
  const leroysRoute = read('leroyslounge/app.js');
  const elroysRoute = read('elroyscantina/app.js');

  assert.equal(leroysRoute.includes("signInButton.style.display = 'none'"), false);
  assert.equal(elroysRoute.includes("signInButton.style.display = 'none'"), false);
});
