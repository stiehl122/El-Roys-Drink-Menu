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
    assert.equal(html.includes('/core/auth/auth-overlay-unified.css'), true, `${file} must load shared auth overlay stylesheet`);
    assert.equal(html.includes('/core/auth/auth-overlay-template.js'), true, `${file} must load shared auth overlay template`);
    assert.equal(html.includes('/core/auth/auth-overlay-controller.js'), true, `${file} must load shared auth overlay controller`);
    assert.equal(html.includes('/core/auth/auth-session-service.js'), true, `${file} must load shared auth session service`);
  });
});

test('site picker shell no longer defines inline auth overlay styling', () => {
  const landingHtml = read('index.html');
  assert.equal(/\n\s*#auth-overlay\s*\{/.test(landingHtml), false, 'index.html must not define inline #auth-overlay styles');
  assert.equal(/\n\s*\.auth-box\s*\{/.test(landingHtml), false, 'index.html must not define inline .auth-box styles');
});

test('restaurant route templates rely on footer staff sign-in only', () => {
  const leroysRoute = read('leroyslounge/index.html');
  const elroysRoute = read('elroyscantina/index.html');

  assert.equal(leroysRoute.includes('data-route-signin'), false, 'leroyslounge route template should not render top sign-in button');
  assert.equal(elroysRoute.includes('data-route-signin'), false, 'elroyscantina route template should not render top sign-in button');
  assert.equal(leroysRoute.includes('data-route-footer-signin'), true, 'leroyslounge route footer sign-in must remain');
  assert.equal(elroysRoute.includes('data-route-footer-signin'), true, 'elroyscantina route footer sign-in must remain');
});

test('settings shells do not render dedicated header sign-in buttons', () => {
  const managerHtml = read('manager/index.html');
  const adminHtml = read('admin/index.html');

  assert.equal(managerHtml.includes('data-auth-origin="settings-header"'), false, 'manager shell should not render settings-header sign-in trigger');
  assert.equal(adminHtml.includes('data-auth-origin="settings-header"'), false, 'admin shell should not render settings-header sign-in trigger');
  assert.equal(managerHtml.includes('id="signin-btn"'), false, 'manager shell should not render signin-btn');
  assert.equal(adminHtml.includes('id="signin-btn"'), false, 'admin shell should not render signin-btn');
});

test('shared auth overlay stylesheet normalizes manager and admin shell auth visuals', () => {
  const authCss = read('core/auth/auth-overlay-unified.css');

  assert.equal(authCss.includes('body.manager-stitch-shell #auth-overlay'), true, 'auth overlay css must normalize manager shell overlay');
  assert.equal(authCss.includes('body.admin-console-page #auth-overlay'), true, 'auth overlay css must normalize admin shell overlay');
  assert.equal(authCss.includes('body.manager-stitch-shell .auth-box'), true, 'auth overlay css must normalize manager shell auth box');
  assert.equal(authCss.includes('body.admin-console-page .auth-box'), true, 'auth overlay css must normalize admin shell auth box');
});

test('style.css no longer owns auth overlay styles after unification', () => {
  const sharedCss = read('style.css');
  assert.equal(sharedCss.includes('#auth-overlay'), false, 'style.css should not define auth overlay container styles');
  assert.equal(sharedCss.includes('.auth-box'), false, 'style.css should not define auth modal box styles');
  assert.equal(sharedCss.includes('.auth-submit-btn'), false, 'style.css should not define auth submit button styles');
});

test('route adapters no longer hard-hide route sign-in controls', () => {
  const leroysRoute = read('leroyslounge/app.js');
  const elroysRoute = read('elroyscantina/app.js');

  assert.equal(leroysRoute.includes("signInButton.style.display = 'none'"), false);
  assert.equal(elroysRoute.includes("signInButton.style.display = 'none'"), false);
});
