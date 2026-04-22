# App.js Auth And Shell Navigation Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move auth/session UI, settings-shell navigation, user-chip/dropdown behavior, and menu-picker runtime out of `app.js` so `app.js` becomes a thin browser wiring layer without changing current auth or shell behavior.

**Architecture:** Reuse the existing `core/auth/*` boundary instead of adding more app-owned fallback code. Deepen auth around session refresh/teardown and form submission, add a dedicated routing boundary for manager/admin shell entry and settings-drawer behavior, and move user-header/menu-picker DOM logic into focused UI modules. `app.js` should keep only dependency builders, lazy service getters, and one-line wrappers that delegate into the new modules.

**Tech Stack:** Plain browser JavaScript, HTML script tags, Node test runner (`node --test`), no bundler, no dependencies.

---

## File Structure

- `app.js`
  Keep only dependency assembly and thin wrappers for auth, settings-shell navigation, user header, dropdowns, and menu picker. Delete the large legacy auth/shell bodies at `app.js:3800-4037` and `app.js:9274-10630` once the shared modules own them.
- `core/auth/auth-session-service.js`
  Deepen the existing session boundary so it owns session restore, profile refresh, session clearing, and sign-out side effects through injected browser ports.
- `core/auth/auth-overlay-controller.js`
  Keep overlay rendering/focus/keyboard ownership here and add click-delegation bootstrapping so per-shell auth entry stays centralized.
- `core/auth/auth-form-service.js`
  New deep module for `handleSignIn()`, `handleSignUp()`, `handleForgotPassword()`, `handleResetPassword()`, preview-audit sign-in, and preview-audit button state.
- `core/routing/settings-policy.js`
  New boundary for `syncRequestedPageMode()`, `enterManager()`, `exitManager()`, `enterAdmin()`, `exitAdmin()`, `exitView()`, settings-drawer state, section hash syncing, and settings-shell route gating.
- `core/ui/user-header.js`
  New boundary for `renderUserHeader()`, `applyRole()`, user-chip hydration/visibility, route dropdown behavior, and global click/escape handlers.
- `core/ui/menu-picker.js`
  New boundary for focus-trapped menu picker behavior, `selectMenu()`, active-menu bar updates, and manager/public switch-menu flows.
- `core/ui/public/footer-actions.js`
  Keep footer staff actions as the public-facing auth entry surface, and add one helper so shell code does not reach into footer DOM details.
- `index.html`
- `manager/index.html`
- `admin/index.html`
- `leroyslounge/index.html`
- `elroyscantina/index.html`
  Load the new shared scripts before `app.js` without breaking route-first boot or auth overlay centralization.
- `scripts/check-html-script-order.cjs`
  Extend the enforced shared runtime order for the new modules.
- `tests/helpers/runtime.cjs`
  Add the new runtime scripts to the default in-test loading order.
- `tests/phase15-auth-boundaries.test.cjs`
  Guard auth module registration and auth-form/session delegation.
- `tests/phase15-auth-unification-complete.test.cjs`
  Guard shared script loading and footer-only staff sign-in behavior.
- `tests/phase3-ui-boundaries.test.cjs`
  Guard UI module registration and app-level delegation for user header, footer actions, and menu picker.
- `tests/architecture-boundaries.test.cjs`
  Guard routing boundary registration and app delegation for settings-shell policy.
- `tests/user-chip-route-reimplementation.test.cjs`
  Move source-level expectations for user-chip runtime out of `app.js` and into the new `core/ui/user-header.js` module.

### Task 1: Lock The New Boundaries In Tests First

**Files:**
- Modify: `tests/phase15-auth-boundaries.test.cjs`
- Modify: `tests/phase15-auth-unification-complete.test.cjs`
- Modify: `tests/phase3-ui-boundaries.test.cjs`
- Modify: `tests/architecture-boundaries.test.cjs`
- Modify: `tests/user-chip-route-reimplementation.test.cjs`
- Test: `tests/phase15-auth-boundaries.test.cjs`
- Test: `tests/phase15-auth-unification-complete.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/architecture-boundaries.test.cjs`
- Test: `tests/user-chip-route-reimplementation.test.cjs`

- [ ] **Step 1: Add failing tests for the new auth, routing, and UI boundaries**

```js
test('auth module scripts register session, overlay, and form boundaries', () => {
  const sandbox = loadSandboxWithScripts([
    'core/auth/auth-api.js',
    'core/auth/auth-session-service.js',
    'core/auth/auth-overlay-template.js',
    'core/auth/auth-overlay-controller.js',
    'core/auth/auth-form-service.js',
  ]);

  assert.equal(typeof sandbox.__HF_AUTH_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.createAccessSessionService, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.createAuthOverlayController, 'function');
  assert.equal(typeof sandbox.__HF_AUTH_MODULES__.createAuthFormService, 'function');
});

test('routing module scripts register settings route policy boundary', () => {
  const sandbox = loadSandboxWithScripts(['core/routing/settings-policy.js']);
  assert.equal(typeof sandbox.__HF_ROUTING_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_ROUTING_MODULES__.createSettingsRoutePolicyService, 'function');
});

test('ui module scripts register user header and menu picker boundaries', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/public/footer-actions.js',
    'core/ui/user-header.js',
    'core/ui/menu-picker.js',
  ]);

  assert.equal(typeof sandbox.__HF_UI_MODULES__, 'object');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createPublicFooterActionsService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createUserHeaderService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createMenuPickerService, 'function');
});
```

- [ ] **Step 2: Add failing shell-loading and source-location assertions**

```js
test('all entry shells load auth form, settings policy, user header, and menu picker before app.js', () => {
  const entryFiles = [
    'index.html',
    'manager/index.html',
    'admin/index.html',
    'leroyslounge/index.html',
    'elroyscantina/index.html',
  ];

  entryFiles.forEach(file => {
    const html = read(file);
    assert.equal(html.includes('/core/auth/auth-form-service.js'), true, `${file} must load auth form service`);
    assert.equal(html.includes('/core/routing/settings-policy.js'), true, `${file} must load settings policy service`);
    assert.equal(html.includes('/core/ui/user-header.js'), true, `${file} must load user header service`);
    assert.equal(html.includes('/core/ui/menu-picker.js'), true, `${file} must load menu picker service`);
  });
});

test('user chip runtime source lives in core/ui/user-header.js instead of app.js', () => {
  const appSource = read('app.js');
  const userHeaderSource = read('core/ui/user-header.js');

  assert.doesNotMatch(appSource, /querySelectorAll\('\[data-user-chip\], \.user-chip, \[data-route-user-chip\]'\)/);
  assert.match(userHeaderSource, /querySelectorAll\('\[data-user-chip\], \.user-chip, \[data-route-user-chip\]'\)/);
  assert.match(userHeaderSource, /querySelector\('\[data-user-chip-name\]'\)/);
  assert.match(userHeaderSource, /querySelector\('\[data-user-chip-role\]'\)/);
  assert.match(userHeaderSource, /querySelector\('\[data-user-chip-initials\]'\)/);
});
```

- [ ] **Step 3: Run the targeted tests to confirm the new assertions fail**

Run: `node --test tests/phase15-auth-boundaries.test.cjs tests/phase15-auth-unification-complete.test.cjs tests/phase3-ui-boundaries.test.cjs tests/architecture-boundaries.test.cjs tests/user-chip-route-reimplementation.test.cjs`

Expected: FAIL because `core/auth/auth-form-service.js`, `core/routing/settings-policy.js`, `core/ui/user-header.js`, and `core/ui/menu-picker.js` do not exist yet, the shells do not load them, and the user-chip source still lives in `app.js`.

- [ ] **Step 4: Commit the red-test guardrail slice**

```bash
git add tests/phase15-auth-boundaries.test.cjs tests/phase15-auth-unification-complete.test.cjs tests/phase3-ui-boundaries.test.cjs tests/architecture-boundaries.test.cjs tests/user-chip-route-reimplementation.test.cjs
git commit -m "test: lock auth shell split boundaries"
```

### Task 2: Deepen Auth Into Shared Session And Form Services

**Files:**
- Create: `core/auth/auth-form-service.js`
- Modify: `core/auth/auth-session-service.js`
- Modify: `core/auth/auth-overlay-controller.js`
- Modify: `app.js:3664-3800`
- Modify: `app.js:9274-10576`
- Modify: `tests/phase15-auth-boundaries.test.cjs`
- Test: `tests/phase15-auth-boundaries.test.cjs`

- [ ] **Step 1: Add a failing delegation test for auth form handlers and session refresh**

```js
test('app auth form handlers and session refresh delegate through shared auth module boundaries', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_AUTH_MODULES__: {
      createAccessSessionService: () => ({
        refreshCurrentUserProfile: async () => {
          calls.push('refreshCurrentUserProfile');
          return { role: 'manager', name: 'Taylor Manager', accessibleMenuIds: ['menu-1'] };
        },
        signOut: () => calls.push('signOut'),
      }),
      createAuthFormService: () => ({
        handleSignIn: async () => calls.push('handleSignIn'),
        handleSignUp: async () => calls.push('handleSignUp'),
        handleForgotPassword: async () => calls.push('handleForgotPassword'),
        handleResetPassword: async () => calls.push('handleResetPassword'),
      }),
    },
  });

  await sandbox.refreshCurrentUserProfile();
  await sandbox.handleSignIn();
  await sandbox.handleSignUp();
  await sandbox.handleForgotPassword();
  await sandbox.handleResetPassword();
  sandbox.signOut();

  assert.deepEqual(calls, [
    'refreshCurrentUserProfile',
    'handleSignIn',
    'handleSignUp',
    'handleForgotPassword',
    'handleResetPassword',
    'signOut',
  ]);
});
```

- [ ] **Step 2: Run the auth boundary test to verify it fails first**

Run: `node --test tests/phase15-auth-boundaries.test.cjs`

Expected: FAIL because `app.js` still owns `refreshCurrentUserProfile()`, the auth submit handlers, and `signOut()`.

- [ ] **Step 3: Create `core/auth/auth-form-service.js` and move form submission plus preview-audit behavior there**

```js
(function bootstrapAuthFormService(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_AUTH_MODULES__ && typeof globalScope.__HF_AUTH_MODULES__ === 'object')
    ? globalScope.__HF_AUTH_MODULES__
    : {};

  function createAuthFormServiceImpl(deps = {}) {
    const getDocument = typeof deps.getDocument === 'function' ? deps.getDocument : (() => globalScope.document);
    const signIn = typeof deps.signIn === 'function' ? deps.signIn : (async () => ({}));
    const signUp = typeof deps.signUp === 'function' ? deps.signUp : (async () => ({}));
    const resetPasswordForEmail = typeof deps.resetPasswordForEmail === 'function' ? deps.resetPasswordForEmail : (async () => null);
    const updatePassword = typeof deps.updatePassword === 'function' ? deps.updatePassword : (async () => ({}));
    const getRecoverySessionData = typeof deps.getRecoverySessionData === 'function' ? deps.getRecoverySessionData : (() => null);
    const getAccessSessionService = typeof deps.getAccessSessionService === 'function' ? deps.getAccessSessionService : (() => null);
    const closeAuthOverlay = typeof deps.closeAuthOverlay === 'function' ? deps.closeAuthOverlay : (() => {});
    const syncRequestedPageMode = typeof deps.syncRequestedPageMode === 'function' ? deps.syncRequestedPageMode : (async () => {});
    const showToast = typeof deps.showToast === 'function' ? deps.showToast : (() => {});
    const isPreview = typeof deps.isPreview === 'function' ? deps.isPreview : (() => false);
    const isSettingsPage = typeof deps.isSettingsPage === 'function' ? deps.isSettingsPage : (() => false);
    const getRequestedMode = typeof deps.getRequestedMode === 'function' ? deps.getRequestedMode : (() => 'manager');
    const fetchPreviewAuditAvailability = typeof deps.fetchPreviewAuditAvailability === 'function'
      ? deps.fetchPreviewAuditAvailability
      : (async () => ({ available: false }));
    const signInToPreviewAuditSession = typeof deps.signInToPreviewAuditSession === 'function'
      ? deps.signInToPreviewAuditSession
      : (async () => ({ session: null }));
    const setAuthScreen = typeof deps.setAuthScreen === 'function' ? deps.setAuthScreen : (() => {});
    const getAuthScreen = typeof deps.getAuthScreen === 'function' ? deps.getAuthScreen : (() => 'signin');

    function getFieldValue(id) {
      return getDocument().getElementById(id)?.value?.trim?.() || '';
    }

    function setButtonState(id, disabled, label) {
      const button = getDocument().getElementById(id);
      if (!button) return;
      button.disabled = !!disabled;
      button.textContent = label;
    }

    function setError(id, message) {
      const element = getDocument().getElementById(id);
      if (element) element.textContent = message || '';
    }

    async function handleSignIn() {
      const email = getFieldValue('signin-email');
      const password = getDocument().getElementById('signin-password')?.value || '';
      if (!email || !password) return setError('signin-error', 'Enter your email and password.');
      setError('signin-error', '');
      setButtonState('signin-submit-btn', true, 'Signing in…');
      try {
        const data = await signIn({ email, password });
        const sessionService = getAccessSessionService();
        const result = await sessionService.applyAuthenticatedSession(data, { closeOverlay: true });
        await syncRequestedPageMode();
        if (result?.profileUnavailable) showToast('Signed in, but your access could not be verified yet.', 'info');
        else if (result?.role === 'none') showToast('Signed in. Contact admin to get manager access.', 'info');
      } catch (error) {
        setError('signin-error', error?.msg || error?.error_description || error?.message || 'Authentication failed.');
      } finally {
        setButtonState('signin-submit-btn', false, 'Sign In');
      }
    }

    async function handleResetPassword() {
      const password = getDocument().getElementById('reset-password')?.value || '';
      const confirm = getDocument().getElementById('reset-confirm')?.value || '';
      const recoveryData = getRecoverySessionData();
      if (!password) return setError('reset-error', 'Enter a new password.');
      if (password !== confirm) return setError('reset-error', 'Passwords do not match.');
      if (password.length < 6) return setError('reset-error', 'Password must be at least 6 characters.');
      if (!recoveryData) return setError('reset-error', 'Reset session expired. Please request a new link.');
      setError('reset-error', '');
      setButtonState('reset-submit-btn', true, 'Saving…');
      try {
        await updatePassword({ newPassword: password, accessToken: recoveryData.access_token });
        await getAccessSessionService().applyAuthenticatedSession(recoveryData, { closeOverlay: true });
        await syncRequestedPageMode();
        showToast('Password updated. You are now signed in.', 'info');
      } catch (error) {
        setError('reset-error', error?.msg || error?.error_description || error?.message || 'Failed to update password.');
      } finally {
        setButtonState('reset-submit-btn', false, 'Set Password');
      }
    }

    async function handleSignUp() {
      const firstName = getFieldValue('signup-firstname');
      const lastName = getFieldValue('signup-lastname');
      const email = getFieldValue('signup-email');
      const password = getDocument().getElementById('signup-password')?.value || '';
      if (!email || !password) return setError('signup-error', 'Enter your email and password.');
      setError('signup-error', '');
      setButtonState('signup-submit-btn', true, 'Creating account…');
      try {
        await signUp({ email, password, name: [firstName, lastName].filter(Boolean).join(' ') });
        closeAuthOverlay();
        showToast('Account created. Contact admin to activate manager access.', 'info');
      } catch (error) {
        setError('signup-error', error?.msg || error?.error_description || error?.message || 'Sign-up failed.');
      } finally {
        setButtonState('signup-submit-btn', false, 'Create Account');
      }
    }

    async function handleForgotPassword() {
      const email = getFieldValue('forgot-email');
      if (!email) return setError('forgot-error', 'Enter your email address.');
      setError('forgot-error', '');
      setButtonState('forgot-submit-btn', true, 'Sending…');
      try {
        await resetPasswordForEmail({ email });
        closeAuthOverlay();
        showToast('Check your email for a password reset link.', 'info');
      } catch (error) {
        setError('forgot-error', error?.msg || error?.error_description || error?.message || 'Failed to send reset email.');
      } finally {
        setButtonState('forgot-submit-btn', false, 'Send Reset Link');
      }
    }

    async function handlePreviewAuditSignIn() {
      if (!isPreview() || !isSettingsPage()) return;
      setError('signin-error', '');
      setButtonState('signin-submit-btn', true, 'Opening Preview Audit Session…');
      try {
        const payload = await signInToPreviewAuditSession({ mode: getRequestedMode() });
        if (!payload?.session?.access_token) throw new Error(payload?.error || 'Preview audit session failed.');
        const result = await getAccessSessionService().applyAuthenticatedSession(payload.session, { closeOverlay: true });
        await syncRequestedPageMode();
        if (result?.profileUnavailable) showToast('Preview audit session opened, but access could not be verified yet.', 'info');
        else if (result?.role === 'none') showToast('Preview audit session opened, but no menu access is configured.', 'info');
      } catch (error) {
        setError('signin-error', error?.message || 'Preview audit session failed.');
      } finally {
        setButtonState('signin-submit-btn', false, 'Sign In');
      }
    }

    return {
      handleSignIn,
      handleSignUp,
      handleForgotPassword,
      handleResetPassword,
      handlePreviewAuditSignIn,
      syncPreviewAuditButton: async function syncPreviewAuditButton() {
        if (getAuthScreen() !== 'signin' || !isPreview() || !isSettingsPage()) return;
        await fetchPreviewAuditAvailability({ mode: getRequestedMode() });
      },
      setAuthScreen,
    };
  }

  modules.createAuthFormService = function createAuthFormServiceBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') return options.fallback();
    return createAuthFormServiceImpl(deps);
  };

  globalScope.__HF_AUTH_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Extend `core/auth/auth-session-service.js` so the shared service owns profile refresh, session clearing, and sign-out**

```js
const getCurrentUser = typeof deps.getCurrentUser === 'function' ? deps.getCurrentUser : (() => null);
const setCurrentUser = typeof deps.setCurrentUser === 'function' ? deps.setCurrentUser : (() => {});
const normalizeAccessibleMenuIds = typeof deps.normalizeAccessibleMenuIds === 'function'
  ? deps.normalizeAccessibleMenuIds
  : (value => Array.isArray(value) ? value : []);
const showToast = typeof deps.showToast === 'function' ? deps.showToast : (() => {});
const renderUserHeader = typeof deps.renderUserHeader === 'function' ? deps.renderUserHeader : (() => {});
const exitView = typeof deps.exitView === 'function' ? deps.exitView : (() => {});

function updateCurrentUserProfile(profile = {}) {
  const user = getCurrentUser();
  if (!user) return profile;
  user.name = profile.name || '';
  user.role = profile.role || 'none';
  user.accessibleMenuIds = normalizeAccessibleMenuIds(profile.accessibleMenuIds);
  applyRole(user.role);
  return profile;
}

async function refreshCurrentUserProfile() {
  const user = getCurrentUser();
  if (!user?.accessToken) return { role: 'none', name: '', accessibleMenuIds: [] };
  try {
    return updateCurrentUserProfile(await fetchProfile(user.accessToken));
  } catch (error) {
    if (isTerminalAuthSessionError(error)) {
      showToast('Your session expired. Sign in again.', 'info');
      service.clearCurrentSessionState({ syncRequestedPageMode: false, exitViewOnSettings: false });
      return { role: 'none', name: '', accessibleMenuIds: [], authExpired: true };
    }
    showToast('Unable to refresh your access right now. Keeping your current session.', 'error');
    return {
      role: user?.role || 'none',
      name: user?.name || '',
      accessibleMenuIds: normalizeAccessibleMenuIds(user?.accessibleMenuIds),
      staleProfile: true,
    };
  }
}

function clearCurrentSessionState(options = {}) {
  const { syncRequestedPageMode = true, exitViewOnSettings = true } = options;
  clearStoredSessionImpl({
    clearExistingTimer: deps.clearExistingTimer,
    setTimerRef: deps.setTimerRef,
    setCurrentUser,
    clearStorage: deps.clearStorage,
  });
  deps.clearManagerMenuPicked?.();
  if (exitViewOnSettings && deps.isInSettingsView?.()) exitView();
  renderUserHeader();
  if (syncRequestedPageMode) return service.syncRequestedPageMode();
  return null;
}

Object.assign(service, {
  async refreshCurrentUserProfile() {
    return refreshCurrentUserProfile();
  },
  clearCurrentSessionState,
  signOut() {
    return clearCurrentSessionState({ syncRequestedPageMode: true });
  },
});
```

- [ ] **Step 5: Make `app.js` delegate auth runtime through the shared services instead of carrying shadow implementations**

```js
// Extend the existing buildAccessSessionModuleDeps() return object with these new ports.
getCurrentUser: () => currentUser,
setCurrentUser: value => { currentUser = value; },
normalizeAccessibleMenuIds: value => normalizeAccessibleMenuIds(value),
showToast: (message, tone) => showToast(message, tone),
renderUserHeader: options => renderUserHeader(options),
exitView: () => exitView(),
clearManagerMenuPicked: () => { _managerMenuPicked = false; },
isInSettingsView: () => isManagerMode || isAdminMode,
clearExistingTimer: () => {
  if (_tokenRefreshTimer) clearTimeout(_tokenRefreshTimer);
},
setTimerRef: value => { _tokenRefreshTimer = value; },
clearStorage: () => clearStoredAuthSessionKeys(),

function buildAuthFormServiceDeps() {
  return {
    getDocument: () => document,
    signIn: ({ email, password }) => sbSignIn(email, password),
    signUp: ({ email, password, name }) => sbSignUp(email, password, name),
    resetPasswordForEmail: ({ email }) => sbResetPasswordForEmail(email),
    updatePassword: ({ newPassword, accessToken }) => sbUpdatePassword(newPassword, accessToken),
    getRecoverySessionData: () => _recoverySessionData,
    getAccessSessionService: () => getAccessSessionService(),
    closeAuthOverlay: () => closeAuthOverlay(),
    syncRequestedPageMode: () => _syncRequestedPageMode(),
    showToast: (message, tone) => showToast(message, tone),
    isPreview: () => IS_PREVIEW,
    isSettingsPage: () => isSettingsPage(),
    getRequestedMode: () => (_appPageMode === 'admin' ? 'admin' : 'manager'),
    fetchPreviewAuditAvailability: options => fetchPreviewAuditAvailability(options),
    signInToPreviewAuditSession: async payload => {
      const response = await fetch(PREVIEW_AUDIT_SESSION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview_audit_sign_in', mode: payload?.mode || 'manager' }),
      });
      return response.json().catch(() => ({}));
    },
    getAuthScreen: () => _authScreen,
    setAuthScreen: value => { _authScreen = value; },
  };
}

function getAuthFormService() {
  if (_authFormService) return _authFormService;
  const boundary = getAuthModuleBoundary();
  if (typeof boundary?.createAuthFormService !== 'function') return null;
  _authFormService = boundary.createAuthFormService(buildAuthFormServiceDeps());
  return _authFormService;
}

function createAccessSessionService() {
  const boundary = getAuthModuleBoundary();
  if (typeof boundary?.createAccessSessionService !== 'function') return null;
  return boundary.createAccessSessionService(buildAccessSessionModuleDeps());
}

async function refreshCurrentUserProfile() {
  const service = getAccessSessionService();
  return service?.refreshCurrentUserProfile ? service.refreshCurrentUserProfile() : { role: 'none', name: '', accessibleMenuIds: [] };
}

async function handleSignIn() {
  return getAuthFormService()?.handleSignIn();
}

function signOut() {
  return getAccessSessionService()?.signOut();
}
```

- [ ] **Step 6: Re-run the auth boundary test and a syntax check**

Run: `node --test tests/phase15-auth-boundaries.test.cjs && node --check app.js`

Expected: PASS. `app.js` no longer owns the large auth handler bodies, and the shared auth module boundary now owns submit handling and session refresh/teardown.

- [ ] **Step 7: Commit the auth extraction slice**

```bash
git add core/auth/auth-form-service.js core/auth/auth-session-service.js core/auth/auth-overlay-controller.js app.js tests/phase15-auth-boundaries.test.cjs
git commit -m "refactor: move app auth flow behind shared auth services"
```

### Task 3: Move Settings-Shell Navigation Into A Routing Policy Module

**Files:**
- Create: `core/routing/settings-policy.js`
- Modify: `app.js:3907-4025`
- Modify: `app.js:9603-9777`
- Modify: `tests/architecture-boundaries.test.cjs`
- Test: `tests/architecture-boundaries.test.cjs`

- [ ] **Step 1: Add a failing test that `app.js` delegates settings-shell behavior through a routing boundary**

```js
test('app settings shell functions delegate through shared routing policy boundary', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_ROUTING_MODULES__: {
      createSettingsRoutePolicyService: () => ({
        syncRequestedPageMode: async () => {
          calls.push('syncRequestedPageMode');
          return { handled: true, status: 'entered', pageMode: 'manager' };
        },
        toggleSettingsDrawer: () => calls.push('toggleSettingsDrawer'),
        closeSettingsDrawer: options => calls.push(['closeSettingsDrawer', options]),
        enterManager: () => calls.push('enterManager'),
        exitManager: () => calls.push('exitManager'),
        enterAdmin: () => calls.push('enterAdmin'),
        exitAdmin: () => calls.push('exitAdmin'),
      }),
    },
  });

  await sandbox._syncRequestedPageMode();
  sandbox.toggleSettingsDrawer();
  sandbox.closeSettingsDrawer({ restoreFocus: false });
  sandbox.enterManager();
  sandbox.exitManager();
  sandbox.enterAdmin();
  sandbox.exitAdmin();

  assert.deepEqual(calls, [
    'syncRequestedPageMode',
    'toggleSettingsDrawer',
    ['closeSettingsDrawer', { restoreFocus: false }],
    'enterManager',
    'exitManager',
    'enterAdmin',
    'exitAdmin',
  ]);
});
```

- [ ] **Step 2: Run the routing boundary test to verify it fails first**

Run: `node --test tests/architecture-boundaries.test.cjs`

Expected: FAIL because `core/routing/settings-policy.js` does not exist yet and `app.js` still owns the settings-shell runtime.

- [ ] **Step 3: Create `core/routing/settings-policy.js` and move settings-shell routing, drawer state, and manager/admin entry there**

```js
(function bootstrapSettingsRoutePolicy(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_ROUTING_MODULES__ && typeof globalScope.__HF_ROUTING_MODULES__ === 'object')
    ? globalScope.__HF_ROUTING_MODULES__
    : {};

  function createSettingsRoutePolicyServiceImpl(deps = {}) {
    const getDocument = typeof deps.getDocument === 'function' ? deps.getDocument : (() => globalScope.document);
    const getWindow = typeof deps.getWindow === 'function' ? deps.getWindow : (() => globalScope.window || globalScope);
    const isSettingsPage = typeof deps.isSettingsPage === 'function' ? deps.isSettingsPage : (() => false);
    const requestSignIn = typeof deps.requestSignIn === 'function' ? deps.requestSignIn : (() => {});
    const refreshCurrentUserProfile = typeof deps.refreshCurrentUserProfile === 'function'
      ? deps.refreshCurrentUserProfile
      : (async () => ({ role: 'none', name: '', accessibleMenuIds: [] }));
    const resolveRequestedSettingsRoute = typeof deps.resolveRequestedSettingsRoute === 'function'
      ? deps.resolveRequestedSettingsRoute
      : (() => ({ kind: 'auth-required' }));
    const loadSettingsPageMenuContext = typeof deps.loadSettingsPageMenuContext === 'function'
      ? deps.loadSettingsPageMenuContext
      : (async () => false);
    const renderUserHeader = typeof deps.renderUserHeader === 'function' ? deps.renderUserHeader : (() => {});
    const renderManagerWorkspace = typeof deps.renderManagerWorkspace === 'function' ? deps.renderManagerWorkspace : (() => {});
    const renderAdminWorkspace = typeof deps.renderAdminWorkspace === 'function' ? deps.renderAdminWorkspace : (() => {});

    function getSettingsDrawerDom() {
      const doc = getDocument();
      const adminDrawer = doc.getElementById('admin-settings-rail');
      const adminBackdrop = doc.getElementById('admin-settings-drawer-backdrop');
      const adminToggle = doc.getElementById('admin-mobile-drawer-toggle');
      const managerDrawer = doc.getElementById('manager-settings-rail');
      const managerBackdrop = doc.getElementById('settings-drawer-backdrop');
      const managerToggle = doc.getElementById('settings-drawer-toggle');
      const managerMobileTrigger = doc.getElementById('manager-mobile-drawer-trigger');

      if (deps.getAppPageMode?.() === 'admin' || (!managerDrawer && adminDrawer)) {
        return {
          drawer: adminDrawer,
          backdrop: adminBackdrop,
          toggle: adminToggle,
          mobileTrigger: null,
          mobileWidth: 900,
          bodyOpenClass: 'admin-settings-drawer-open',
        };
      }

      return {
        drawer: managerDrawer,
        backdrop: managerBackdrop,
        toggle: managerToggle,
        mobileTrigger: managerMobileTrigger,
        mobileWidth: 920,
        bodyOpenClass: 'settings-drawer-open',
      };
    }

    async function syncRequestedPageMode() {
      if (!isSettingsPage()) return { handled: false };
      renderUserHeader();
      if (!deps.getCurrentUser?.()) {
        deps.resetSettingsModes?.();
        deps.setLoadingMessage?.('Sign in to access settings.', { hideSpinner: true, showLockedState: true });
        requestSignIn({ screen: 'signin', origin: 'settings-gate', reason: 'settings-auth-required' });
        return { handled: true, status: 'auth-required', pageMode: deps.getAppPageMode?.() || 'public' };
      }
      if (deps.getAppPageMode?.() === 'manager') {
        deps.setLoadingMessage?.('Checking manager access…');
        const profile = await refreshCurrentUserProfile();
        if (profile?.authExpired) return { handled: true, status: 'auth-required', pageMode: 'manager' };
      }
      const routeDecision = resolveRequestedSettingsRoute();
      if (routeDecision.kind === 'admin') return enterAdmin(routeDecision.targetMenuId);
      if (routeDecision.kind === 'manager') return enterManager(routeDecision.targetMenuId);
      return { handled: true, status: routeDecision.kind, pageMode: deps.getAppPageMode?.() || 'public' };
    }

    function enterManager(targetMenuId) {
      deps.prepareManagerShell?.(targetMenuId);
      renderUserHeader();
      renderManagerWorkspace();
      deps.syncSettingsSectionFromLocation?.('manager-overview-section');
      return { handled: true, status: 'entered', pageMode: 'manager', menuId: targetMenuId || deps.getMenuId?.() || '' };
    }

    function enterAdmin(targetMenuId) {
      deps.prepareAdminShell?.(targetMenuId);
      renderUserHeader();
      renderAdminWorkspace();
      deps.syncSettingsSectionFromLocation?.('admin-restaurants-section');
      return { handled: true, status: 'entered', pageMode: 'admin', menuId: targetMenuId || deps.getMenuId?.() || '' };
    }

    return {
      getSettingsDrawerDom,
      setSettingsDrawerOpen: deps.setSettingsDrawerOpenImpl,
      toggleSettingsDrawer() {
        const drawer = getSettingsDrawerDom().drawer;
        if (!drawer) return;
        deps.setSettingsDrawerOpenImpl?.(!drawer.classList.contains('is-open'));
      },
      closeSettingsDrawer(options = {}) {
        deps.setSettingsDrawerOpenImpl?.(false, options);
      },
      syncRequestedPageMode,
      enterManager,
      exitManager: deps.exitManagerImpl,
      enterAdmin,
      exitAdmin: deps.exitAdminImpl,
      exitView: deps.exitViewImpl,
      focusSettingsSection: deps.focusSettingsSectionImpl,
    };
  }

  modules.createSettingsRoutePolicyService = function createSettingsRoutePolicyServiceBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') return options.fallback();
    return createSettingsRoutePolicyServiceImpl(deps);
  };

  globalScope.__HF_ROUTING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Replace the big `app.js` settings-shell bodies with service getters and one-line wrappers**

```js
function getRoutingModuleBoundary() {
  return globalThis.__HF_ROUTING_MODULES__ || null;
}

function buildSettingsRoutePolicyDeps() {
  const setSettingsDrawerOpenImpl = (isOpen, options = {}) => {
    const service = getSettingsRoutePolicyService();
    if (!service) return;
    const { drawer, backdrop, toggle, mobileTrigger, mobileWidth, bodyOpenClass } = service.getSettingsDrawerDom();
    const isMobileDrawer = window.innerWidth <= mobileWidth;
    const shouldRestoreToggleFocus = options.restoreFocus !== false;
    if (!drawer || !backdrop) return;
    drawer.classList.toggle('is-open', !!isOpen && isMobileDrawer);
    drawer.setAttribute('aria-hidden', isMobileDrawer && !isOpen ? 'true' : 'false');
    backdrop.hidden = !(isOpen && isMobileDrawer);
    document.body.classList.remove('settings-drawer-open', 'admin-settings-drawer-open');
    document.body.classList.toggle(bodyOpenClass, !!isOpen && isMobileDrawer);
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (mobileTrigger) mobileTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (!isOpen && isMobileDrawer && shouldRestoreToggleFocus) (mobileTrigger || toggle)?.focus?.();
  };

  const focusSettingsSectionImpl = (sectionId, trigger, options = {}) => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    if (trigger) setActiveSettingsSection(trigger.dataset.target || sectionId);
    else setActiveSettingsSection(sectionId);
    setSettingsDrawerOpenImpl(false);
    if (options.scroll !== false) section.scrollIntoView({ behavior: options.behavior || 'smooth', block: 'start' });
  };

  const syncSettingsSectionFromLocationImpl = defaultSectionId => {
    requestAnimationFrame(() => focusSettingsSectionImpl(defaultSectionId, null, { behavior: 'auto', scroll: false, updateUrl: false }));
  };

  const exitManagerImpl = () => {
    isManagerMode = false;
    document.body.classList.remove('manager-mode');
    _setDisplayById('manager-view', 'none');
    _setRestaurantPublicMode(false);
    setSettingsDrawerOpenImpl(false);
    renderUserHeader();
    if (isSettingsPage()) navigateToPage(getPublicHrefForCurrentMenu());
    else showPublicView();
  };

  const exitAdminImpl = () => {
    isAdminMode = false;
    document.body.classList.remove('manager-mode');
    _setDisplayById('manager-view', 'none');
    _setRestaurantPublicMode(false);
    setSettingsDrawerOpenImpl(false);
    renderUserHeader();
    if (isSettingsPage()) navigateToPage(getPublicHrefForCurrentMenu());
    else showPublicView();
  };

  const exitViewImpl = () => {
    if (isManagerMode) exitManagerImpl();
    else if (isAdminMode) exitAdminImpl();
  };

  return {
    getDocument: () => document,
    getWindow: () => window,
    getAppPageMode: () => _appPageMode,
    getCurrentUser: () => currentUser,
    getMenuId: () => MENU_ID,
    isSettingsPage: () => isSettingsPage(),
    requestSignIn: options => requestSignIn(options),
    refreshCurrentUserProfile: () => refreshCurrentUserProfile(),
    resolveRequestedSettingsRoute: () => resolveRequestedSettingsRoute(),
    loadSettingsPageMenuContext: menuId => _loadSettingsPageMenuContext(menuId),
    renderUserHeader: options => renderUserHeader(options),
    renderManagerWorkspace: () => renderManagerWorkspace(),
    renderAdminWorkspace: () => renderAdminWorkspace(),
    setSettingsDrawerOpenImpl,
    focusSettingsSectionImpl,
    syncSettingsSectionFromLocation: syncSettingsSectionFromLocationImpl,
    exitManagerImpl,
    exitAdminImpl,
    exitViewImpl,
  };
}

function getSettingsRoutePolicyService() {
  if (_settingsRoutePolicyService) return _settingsRoutePolicyService;
  const boundary = getRoutingModuleBoundary();
  if (typeof boundary?.createSettingsRoutePolicyService !== 'function') return null;
  _settingsRoutePolicyService = boundary.createSettingsRoutePolicyService(buildSettingsRoutePolicyDeps());
  return _settingsRoutePolicyService;
}

async function _syncRequestedPageMode() {
  return getSettingsRoutePolicyService()?.syncRequestedPageMode();
}

function toggleSettingsDrawer() {
  return getSettingsRoutePolicyService()?.toggleSettingsDrawer();
}

function enterManager() {
  return getSettingsRoutePolicyService()?.enterManager();
}
```

- [ ] **Step 5: Re-run the routing boundary test and a syntax check**

Run: `node --test tests/architecture-boundaries.test.cjs && node --check app.js`

Expected: PASS. `app.js` should stop carrying the long settings-shell route gate and manager/admin entry code.

- [ ] **Step 6: Commit the routing extraction slice**

```bash
git add core/routing/settings-policy.js app.js tests/architecture-boundaries.test.cjs
git commit -m "refactor: extract settings shell policy from app runtime"
```

### Task 4: Extract User Header, Footer Sync, And Dropdown Runtime

**Files:**
- Create: `core/ui/user-header.js`
- Modify: `core/ui/public/footer-actions.js`
- Modify: `app.js:9439-9595`
- Modify: `app.js:9780-9877`
- Modify: `tests/phase3-ui-boundaries.test.cjs`
- Modify: `tests/user-chip-route-reimplementation.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/user-chip-route-reimplementation.test.cjs`

- [ ] **Step 1: Add failing tests for user-header registration and app delegation**

```js
test('app user header functions delegate through shared ui module boundary', () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createUserHeaderService: () => ({
        renderUserHeader: options => calls.push(['renderUserHeader', options]),
        applyRole: role => calls.push(['applyRole', role]),
        toggleUserDropdown: target => calls.push(['toggleUserDropdown', target]),
        closeUserChips: () => calls.push('closeUserChips'),
        toggleRouteDropdown: (triggerId, dropdownId) => calls.push(['toggleRouteDropdown', triggerId, dropdownId]),
        closeRouteDropdowns: exceptId => calls.push(['closeRouteDropdowns', exceptId]),
      }),
    },
  });

  sandbox.renderUserHeader({ skipPublicRender: true });
  sandbox.applyRole('admin');
  sandbox.toggleUserDropdown('user-chip');
  sandbox.closeUserChips();
  sandbox.toggleRouteDropdown('route-trigger', 'route-panel');
  sandbox.closeRouteDropdowns('route-panel');

  assert.deepEqual(calls, [
    ['renderUserHeader', { skipPublicRender: true }],
    ['applyRole', 'admin'],
    ['toggleUserDropdown', 'user-chip'],
    'closeUserChips',
    ['toggleRouteDropdown', 'route-trigger', 'route-panel'],
    ['closeRouteDropdowns', 'route-panel'],
  ]);
});
```

- [ ] **Step 2: Run the user-header tests to verify they fail first**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/user-chip-route-reimplementation.test.cjs`

Expected: FAIL because `core/ui/user-header.js` does not exist and the user-chip/dropdown logic still lives inside `app.js`.

- [ ] **Step 3: Create `core/ui/user-header.js` and move header rendering, user-chip hydration, and dropdown behavior there**

```js
(function bootstrapUserHeaderUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createUserHeaderServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    const getCurrentUser = typeof deps.getCurrentUser === 'function' ? deps.getCurrentUser : (() => null);
    const isSettingsPage = typeof deps.isSettingsPage === 'function' ? deps.isSettingsPage : (() => false);
    const currentUserCanManageMenu = typeof deps.currentUserCanManageMenu === 'function' ? deps.currentUserCanManageMenu : (() => false);
    const syncPublicStaffFooterActionsForUser = typeof deps.syncPublicStaffFooterActionsForUser === 'function'
      ? deps.syncPublicStaffFooterActionsForUser
      : (() => {});

    function getUserChipRoots() {
      return Array.from(new Set(
        Array.from(documentRef.querySelectorAll('[data-user-chip], .user-chip, [data-route-user-chip]')),
      ));
    }

    function getUserChipParts(root) {
      if (!root) return null;
      return {
        root,
        trigger: root.querySelector('[data-user-chip-trigger]') || root,
        panel: root.querySelector('[data-user-chip-panel]') || root.querySelector('.user-dropdown, .ll-site-userdropdown, .erc-userdropdown'),
        initials: root.querySelector('[data-user-chip-initials]') || root.querySelector('[id$="user-initials"]'),
        name: root.querySelector('[data-user-chip-name]') || root.querySelector('[id$="user-dropdown-name"]'),
        role: root.querySelector('[data-user-chip-role]') || root.querySelector('[id$="user-dropdown-role"]'),
      };
    }

    function renderUserHeader(options = {}) {
      const user = getCurrentUser();
      const signedIn = !!user;
      const role = user?.role || 'none';
      const name = user?.name || '';
      const parts = name.trim().split(/\s+/).filter(Boolean);
      const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0]?.[0] || '?').toUpperCase();
      const roleLabel = { none: 'User', manager: 'Manager', admin: 'Admin' }[role] || 'User';

      getUserChipRoots().forEach(root => {
        const chip = getUserChipParts(root);
        if (!chip) return;
        root.style.display = signedIn ? '' : 'none';
        if (chip.initials) chip.initials.textContent = initials;
        if (chip.name) chip.name.textContent = name || user?.email || '';
        if (chip.role) chip.role.textContent = roleLabel;
        if (chip.trigger) chip.trigger.setAttribute('aria-expanded', root.classList.contains('open') ? 'true' : 'false');
      });

      syncPublicStaffFooterActionsForUser(user, {
        skipPublicRender: !!options.skipPublicRender,
        canManageCurrentMenu: currentUserCanManageMenu(),
        isSettingsRoute: isSettingsPage(),
      });
    }

    return {
      getUserChipRoots,
      getUserChipParts,
      renderUserHeader,
      applyRole(role) {
        const pruneSection = documentRef.getElementById('prune-section');
        if (pruneSection) pruneSection.style.display = role === 'admin' ? '' : 'none';
        renderUserHeader();
      },
      toggleUserDropdown(targetOrId = null) {
        const chip = typeof targetOrId === 'string'
          ? documentRef.getElementById(targetOrId) || documentRef.querySelector(`[data-user-chip-id="${targetOrId}"]`)
          : targetOrId?.closest?.('[data-user-chip], .user-chip, [data-route-user-chip]') || getUserChipRoots()[0] || null;
        if (!chip) return;
        this.closeRouteDropdowns();
        this.closeUserChips(chip);
        const isOpen = chip.classList.toggle('open');
        const parts = getUserChipParts(chip);
        if (parts?.trigger) parts.trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen && parts?.panel) parts.panel.querySelector('button, a')?.focus();
      },
      closeUserChips(exceptChip = null, target = null) {
        getUserChipRoots().forEach(chip => {
          if (exceptChip && chip === exceptChip) return;
          if (target && chip.contains(target)) return;
          chip.classList.remove('open');
          getUserChipParts(chip)?.trigger?.setAttribute('aria-expanded', 'false');
        });
      },
      toggleRouteDropdown(triggerId, dropdownId) {
        const trigger = documentRef.getElementById(triggerId);
        const dropdown = documentRef.getElementById(dropdownId);
        if (!trigger || !dropdown) return;
        const wrapper = trigger.closest('[data-route-dropdown]');
        const shouldOpen = dropdown.hidden;
        this.closeUserChips();
        this.closeRouteDropdowns(shouldOpen ? dropdownId : '');
        if (!wrapper) return;
        wrapper.classList.toggle('open', shouldOpen);
        dropdown.hidden = !shouldOpen;
        trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        if (shouldOpen) dropdown.querySelector('button, [tabindex]:not([tabindex="-1"])')?.focus();
      },
      closeRouteDropdowns(exceptDropdownId = '') {
        documentRef.querySelectorAll('[data-route-dropdown]').forEach(wrapper => {
          const trigger = wrapper.querySelector('[data-route-dropdown-trigger], [aria-controls]');
          const panel = wrapper.querySelector('[data-route-dropdown-panel]');
          if (!trigger || !panel) return;
          if (exceptDropdownId && panel.id === exceptDropdownId) return;
          wrapper.classList.remove('open');
          panel.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
        });
      },
      installGlobalHandlers() {
        documentRef.addEventListener('click', event => {
          this.closeUserChips(null, event.target);
          documentRef.querySelectorAll('[data-route-dropdown]').forEach(wrapper => {
            if (wrapper.contains(event.target)) return;
            wrapper.classList.remove('open');
            const trigger = wrapper.querySelector('[data-route-dropdown-trigger], [aria-controls]');
            const panel = wrapper.querySelector('[data-route-dropdown-panel]');
            if (panel) panel.hidden = true;
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
          });
        });
      },
    };
  }

  modules.createUserHeaderService = function createUserHeaderServiceBoundary(deps = {}) {
    return createUserHeaderServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Deepen `core/ui/public/footer-actions.js` so shell code can sync footer staff actions without touching footer DOM directly**

```js
function syncPublicStaffFooterActionsForUser(user = getCurrentUser(), options = {}) {
  const state = buildPublicStaffFooterState(user, options);
  syncPublicStaffFooterActions(state);
  return state;
}

return {
  buildPublicStaffFooterState,
  syncPublicStaffFooterActions,
  syncPublicStaffFooterActionsForUser,
};
```

- [ ] **Step 5: Replace the `app.js` header and dropdown bodies with wrappers to the new user-header service**

```js
function buildUserHeaderModuleDeps() {
  const footerService = getPublicFooterActionsService();
  return {
    document,
    getCurrentUser: () => currentUser,
    isSettingsPage: () => isSettingsPage(),
    currentUserCanManageMenu: () => currentUserCanManageMenu(),
    syncPublicStaffFooterActionsForUser: (user, options) =>
      footerService?.syncPublicStaffFooterActionsForUser
        ? footerService.syncPublicStaffFooterActionsForUser(user, options)
        : footerService?.syncPublicStaffFooterActions(footerService.buildPublicStaffFooterState(user, options)),
  };
}

function getUserHeaderService() {
  if (_userHeaderService) return _userHeaderService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createUserHeaderService !== 'function') return null;
  _userHeaderService = boundary.createUserHeaderService(buildUserHeaderModuleDeps());
  return _userHeaderService;
}

function renderUserHeader(options = {}) {
  return getUserHeaderService()?.renderUserHeader(options);
}

function applyRole(role) {
  return getUserHeaderService()?.applyRole(role);
}
```

- [ ] **Step 6: Re-run the UI boundary tests**

Run: `node --test tests/phase3-ui-boundaries.test.cjs tests/user-chip-route-reimplementation.test.cjs`

Expected: PASS. `app.js` should stop being the source of truth for user-chip selectors, header hydration, and dropdown DOM behavior.

- [ ] **Step 7: Commit the user-header slice**

```bash
git add core/ui/user-header.js core/ui/public/footer-actions.js app.js tests/phase3-ui-boundaries.test.cjs tests/user-chip-route-reimplementation.test.cjs
git commit -m "refactor: extract user header and dropdown runtime"
```

### Task 5: Move Menu Picker Runtime Out Of App.js

**Files:**
- Create: `core/ui/menu-picker.js`
- Modify: `app.js:9902-10095`
- Modify: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`

- [ ] **Step 1: Add a failing menu-picker delegation test**

```js
test('app menu picker functions delegate through shared ui module boundary', async () => {
  const calls = [];
  const sandbox = loadSandboxWithScripts(['app.js'], {
    __HF_UI_MODULES__: {
      createMenuPickerService: () => ({
        showMenuPicker: async (...args) => calls.push(['showMenuPicker', args]),
        closeMenuPicker: options => calls.push(['closeMenuPicker', options]),
        selectMenu: (...args) => calls.push(['selectMenu', args]),
        updateActiveMenuBar: () => calls.push('updateActiveMenuBar'),
        onSwitchMenuClick: async () => calls.push('onSwitchMenuClick'),
        onPublicSwitchMenuClick: async () => calls.push('onPublicSwitchMenuClick'),
      }),
    },
  });

  await sandbox.showMenuPicker(null, { managerOnly: true });
  sandbox.closeMenuPicker({ skipOnClose: true });
  sandbox.selectMenu('menu-1', 'leroys-lounge-drinks', 'Drinks', 'drinks', 'restaurant-1');
  sandbox.updateActiveMenuBar();
  await sandbox.onSwitchMenuClick();
  await sandbox.onPublicSwitchMenuClick();

  assert.deepEqual(calls, [
    ['showMenuPicker', [null, { managerOnly: true }]],
    ['closeMenuPicker', { skipOnClose: true }],
    ['selectMenu', ['menu-1', 'leroys-lounge-drinks', 'Drinks', 'drinks', 'restaurant-1']],
    'updateActiveMenuBar',
    'onSwitchMenuClick',
    'onPublicSwitchMenuClick',
  ]);
});
```

- [ ] **Step 2: Run the UI boundary test to verify it fails first**

Run: `node --test tests/phase3-ui-boundaries.test.cjs`

Expected: FAIL because `core/ui/menu-picker.js` does not exist yet and `app.js` still owns picker focus-trap and selection behavior.

- [ ] **Step 3: Create `core/ui/menu-picker.js` and move focus trapping, menu selection, and switch flows there**

```js
(function bootstrapMenuPickerUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createMenuPickerServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    const historyRef = deps.history || globalScope.history;
    const getLocationHref = typeof deps.getLocationHref === 'function' ? deps.getLocationHref : (() => globalScope.location?.href || '');
    const knownRestaurantList = typeof deps.knownRestaurantList === 'function' ? deps.knownRestaurantList : (() => []);
    const knownMenuList = typeof deps.knownMenuList === 'function' ? deps.knownMenuList : (() => []);

    let pickerFocusBefore = null;
    let pickerOnSelect = null;
    let pickerOnClose = null;

    function showMenuPicker(afterSelect, options = {}) {
      pickerFocusBefore = documentRef.activeElement;
      pickerOnSelect = afterSelect || null;
      pickerOnClose = typeof options.onClose === 'function' ? options.onClose : null;
      documentRef.getElementById('menu-picker-overlay')?.classList.add('open');
      return deps.loadMenusForPicker?.({
        managerOnly: !!options.managerOnly,
        menuIds: options.menuIds || [],
        knownRestaurantList,
        knownMenuList,
      });
    }

    function closeMenuPicker(options = {}) {
      documentRef.getElementById('menu-picker-overlay')?.classList.remove('open');
      const onClose = options.skipOnClose ? null : pickerOnClose;
      pickerOnClose = null;
      if (pickerFocusBefore?.focus) pickerFocusBefore.focus();
      pickerFocusBefore = null;
      pickerOnSelect = null;
      if (onClose) onClose();
    }

    function selectMenu(menuId, slug, menuName, menuType, restaurantId) {
      deps.setActiveMenu?.({ menuId, slug, menuName, menuType, restaurantId });
      const nextHref = deps.buildNextHref?.({ menuId, slug, restaurantId, currentHref: getLocationHref() });
      if (nextHref) historyRef.replaceState({}, '', nextHref);
      closeMenuPicker({ skipOnClose: true });
      deps.afterMenuSelection?.({ menuId, slug, menuName, menuType, restaurantId, callback: pickerOnSelect });
    }

    return {
      showMenuPicker,
      closeMenuPicker,
      selectMenu,
      updateActiveMenuBar: deps.updateActiveMenuBarImpl,
      onSwitchMenuClick: deps.onSwitchMenuClickImpl,
      onPublicSwitchMenuClick: deps.onPublicSwitchMenuClickImpl,
    };
  }

  modules.createMenuPickerService = function createMenuPickerServiceBoundary(deps = {}) {
    return createMenuPickerServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Replace the `app.js` picker block with wrappers to the new service**

```js
function buildMenuPickerModuleDeps() {
  const updateActiveMenuBarImpl = () => {
    const bar = document.getElementById('active-menu-bar');
    const nameEl = document.getElementById('active-menu-name');
    const displayName = formatMenuDisplayName(_activeMenuName, MENU_TYPE, RESTAURANT_ID);
    if (!bar || !nameEl) return;
    nameEl.textContent = displayName || '';
    bar.style.display = displayName ? '' : 'none';
  };

  const onSwitchMenuClickImpl = async () => {
    await showMenuPicker(async () => {
      _uncatCategoryUuid = null;
      await ensureCurrentMenuSession().refresh();
      applyDesign(currentDesign);
      renderManagerWorkspace();
      updateDraftIndicator();
      updateSaveBtn();
      updateManagerActionBar();
    }, { managerOnly: true });
  };

  const onPublicSwitchMenuClickImpl = async () => {
    await showMenuPicker(async () => {
      const targetHref = getPublicHrefForCurrentMenu();
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (targetHref && targetHref !== currentHref) {
        navigateToPage(targetHref);
        return;
      }
      await ensureCurrentMenuSession().refresh();
      applyDesign(currentDesign);
      await renderPublicViews();
    });
  };

  return {
    document,
    history,
    getLocationHref: () => location.href,
    knownRestaurantList: () => knownRestaurantList(),
    knownMenuList: () => knownMenuList(),
    setActiveMenu: ({ menuId, menuName, menuType, restaurantId }) => {
      MENU_ID = menuId;
      setActiveMenuContext(menuName || '', menuType || 'drinks', restaurantId || '');
      lsSet(LS_KEYS.menuId, MENU_ID);
    },
    buildNextHref: ({ menuId, slug }) => _appPageMode === 'public' ? getPublicHrefForMenuId(menuId) : (() => {
      const url = new URL(location.href);
      url.searchParams.set('menu', slug);
      return url.toString();
    })(),
    afterMenuSelection: ({ menuId, slug, restaurantId, callback }) => {
      ensureCurrentMenuSession({ requestedMenuId: menuId, requestedMenuSlug: slug, siteRestaurantId: restaurantId || '' });
      updateActiveMenuBar();
      renderUserHeader({ skipPublicRender: !!callback });
      if (callback) callback();
    },
    updateActiveMenuBarImpl,
    onSwitchMenuClickImpl,
    onPublicSwitchMenuClickImpl,
  };
}

function getMenuPickerService() {
  if (_menuPickerService) return _menuPickerService;
  const boundary = getUiModuleBoundary();
  if (typeof boundary?.createMenuPickerService !== 'function') return null;
  _menuPickerService = boundary.createMenuPickerService(buildMenuPickerModuleDeps());
  return _menuPickerService;
}

async function showMenuPicker(afterSelect, opts) {
  return getMenuPickerService()?.showMenuPicker(afterSelect, opts);
}

function closeMenuPicker(opts = {}) {
  return getMenuPickerService()?.closeMenuPicker(opts);
}
```

- [ ] **Step 5: Re-run the UI boundary test and a syntax check**

Run: `node --test tests/phase3-ui-boundaries.test.cjs && node --check app.js`

Expected: PASS. `app.js` should no longer own the menu-picker focus trap, list rendering, and selection flow.

- [ ] **Step 6: Commit the menu-picker slice**

```bash
git add core/ui/menu-picker.js app.js tests/phase3-ui-boundaries.test.cjs
git commit -m "refactor: extract menu picker runtime"
```

### Task 6: Wire The New Scripts Into Every Shell And Run Final Verification

**Files:**
- Modify: `index.html`
- Modify: `manager/index.html`
- Modify: `admin/index.html`
- Modify: `leroyslounge/index.html`
- Modify: `elroyscantina/index.html`
- Modify: `scripts/check-html-script-order.cjs`
- Modify: `tests/helpers/runtime.cjs`
- Modify: `tests/phase15-auth-unification-complete.test.cjs`
- Modify: `app.js`
- Test: `tests/phase15-auth-unification-complete.test.cjs`
- Test: `tests/phase15-auth-boundaries.test.cjs`
- Test: `tests/phase3-ui-boundaries.test.cjs`
- Test: `tests/architecture-boundaries.test.cjs`
- Test: `tests/user-chip-route-reimplementation.test.cjs`

- [ ] **Step 1: Update the enforced shared runtime order**

```js
const SHARED_RUNTIME_SCRIPTS = [
  '/core/domain/constants.js',
  '/core/domain/category-defaults.js',
  '/core/auth/auth-api.js',
  '/core/auth/auth-session-service.js',
  '/core/auth/auth-overlay-template.js',
  '/core/auth/auth-overlay-controller.js',
  '/core/auth/auth-form-service.js',
  '/core/routing/settings-policy.js',
  '/core/ui/user-header.js',
  '/core/ui/menu-picker.js',
  '/core/ui/manager/workspace.js',
  '/core/ui/manager/sections.js',
  '/core/ui/manager/editors.js',
  '/core/ui/admin/workspace.js',
  '/core/ui/admin/switcher.js',
  '/core/ui/public/footer-actions.js',
  '/core/ui/public/renderer-default.js',
  '/core/session/publish-service.js',
  '/core/session/menu-session.js',
  '/core/data/menu-state-loader.js',
  '/core/session/poll-scheduler.js',
];
```

- [ ] **Step 2: Mirror the same order in the in-test runtime loader**

```js
const DEFAULT_RUNTIME_SCRIPTS = [
  'core/domain/constants.js',
  'core/domain/category-defaults.js',
  'core/auth/auth-api.js',
  'core/auth/auth-session-service.js',
  'core/auth/auth-overlay-template.js',
  'core/auth/auth-overlay-controller.js',
  'core/auth/auth-form-service.js',
  'core/routing/settings-policy.js',
  'core/ui/user-header.js',
  'core/ui/menu-picker.js',
  'core/ui/manager/workspace.js',
  'core/ui/manager/sections.js',
  'core/ui/manager/editors.js',
  'core/ui/manager/open-food-facts.js',
  'core/ui/manager/untappd.js',
  'core/ui/manager/barcode-scanner.js',
  'core/ui/admin/workspace.js',
  'core/ui/admin/switcher.js',
  'core/ui/public/footer-actions.js',
  'core/ui/public/renderer-default.js',
  'core/session/menu-publish-workflow.js',
  'core/session/menu-publish-facade.js',
  'core/session/publish-service.js',
  'core/session/menu-session.js',
  'core/data/menu-state-loader.js',
  'core/session/poll-scheduler.js',
  'routes/shared/public-route-core.js',
  'app.js',
];
```

- [ ] **Step 3: Add the new shared scripts to every HTML shell before `app.js`**

```html
<script src="/core/auth/auth-api.js"></script>
<script src="/core/auth/auth-session-service.js"></script>
<script src="/core/auth/auth-overlay-template.js"></script>
<script src="/core/auth/auth-overlay-controller.js"></script>
<script src="/core/auth/auth-form-service.js"></script>
<script src="/core/routing/settings-policy.js"></script>
<script src="/core/ui/user-header.js"></script>
<script src="/core/ui/menu-picker.js"></script>
<script src="/core/ui/public/footer-actions.js"></script>
<script src="/core/ui/public/renderer-default.js"></script>
```

- [ ] **Step 4: Run the full verification set for this slice**

Run: `node --test tests/phase15-auth-boundaries.test.cjs tests/phase15-auth-unification-complete.test.cjs tests/phase3-ui-boundaries.test.cjs tests/architecture-boundaries.test.cjs tests/user-chip-route-reimplementation.test.cjs && node --check app.js && node scripts/check-html-script-order.cjs`

Expected: PASS. The auth overlay remains centralized, footer staff actions remain the public auth entry, manager/admin shells still boot correctly, and the new scripts are loaded in a deterministic order everywhere.

- [ ] **Step 5: Commit the integration and cleanup slice**

```bash
git add index.html manager/index.html admin/index.html leroyslounge/index.html elroyscantina/index.html scripts/check-html-script-order.cjs tests/helpers/runtime.cjs tests/phase15-auth-unification-complete.test.cjs app.js
git commit -m "refactor: wire shared auth and shell modules across entry shells"
```

## Self-Review

**1. Spec coverage**

- `createAccessSessionService()`, `refreshCurrentUserProfile()`, auth submit handlers, and `signOut()` are covered in Task 2.
- `requestSignIn()`, `openAuthOverlay()`, `closeAuthOverlay()`, and auth overlay keyboard/click support are covered in Task 2 through the deepened auth controller and new auth form service.
- `renderUserHeader()`, `applyRole()`, dropdown keyboard/click handlers, and footer staff action sync are covered in Task 4.
- `enterManager()/exitManager()`, `enterAdmin()/exitAdmin()`, settings drawer interactions, and settings route gating are covered in Task 3.
- Menu picker functions and accessibility-preserving picker flow are covered in Task 5.
- Script-order constraints, shell loading, and auth overlay centralization are covered in Task 6.
- Memory-only recovery session behavior is preserved by keeping recovery data inside the shared auth services and never moving it into `localStorage`; that requirement is explicitly preserved in Tasks 2 and 6.

**2. Placeholder scan**

- No `TBD`, `TODO`, or “implement later” placeholders remain.
- Every task includes concrete file paths, code snippets, commands, and expected results.

**3. Type consistency**

- Shared auth boundary names are consistent: `createAccessSessionService`, `createAuthOverlayController`, `createAuthFormService`.
- Shared routing boundary name is consistent: `createSettingsRoutePolicyService`.
- Shared UI boundary names are consistent: `createUserHeaderService`, `createMenuPickerService`, `createPublicFooterActionsService`.
- App wrapper names match the service methods they delegate to: `refreshCurrentUserProfile`, `signOut`, `toggleSettingsDrawer`, `enterManager`, `renderUserHeader`, `showMenuPicker`.

Plan complete and saved to `docs/superpowers/plans/2026-04-21-appjs-auth-shell-navigation-split.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
