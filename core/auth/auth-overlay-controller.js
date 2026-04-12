(function bootstrapAuthOverlayController(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_AUTH_MODULES__ && typeof globalScope.__HF_AUTH_MODULES__ === 'object')
    ? globalScope.__HF_AUTH_MODULES__
    : {};

  function createAuthOverlayControllerImpl(deps = {}) {
    const getDocument = typeof deps.getDocument === 'function' ? deps.getDocument : (() => globalScope.document);
    const getWindow = typeof deps.getWindow === 'function' ? deps.getWindow : (() => globalScope.window || globalScope);
    const getSupabaseConfig = typeof deps.getSupabaseConfig === 'function'
      ? deps.getSupabaseConfig
      : (() => ({ supabaseUrl: '', anonKey: '' }));
    const setSettingsShellPending = typeof deps.setSettingsShellPending === 'function'
      ? deps.setSettingsShellPending
      : (() => {});
    const getRecoverySessionData = typeof deps.getRecoverySessionData === 'function'
      ? deps.getRecoverySessionData
      : (() => null);
    const setRecoverySessionData = typeof deps.setRecoverySessionData === 'function'
      ? deps.setRecoverySessionData
      : (() => {});
    const setAuthScreen = typeof deps.setAuthScreen === 'function'
      ? deps.setAuthScreen
      : (() => {});
    const mountAuthOverlayTemplate = typeof deps.mountAuthOverlayTemplate === 'function'
      ? deps.mountAuthOverlayTemplate
      : (() => {});
    const setTimeoutFn = typeof deps.setTimeout === 'function' ? deps.setTimeout : setTimeout;
    const handleSignIn = typeof deps.handleSignIn === 'function' ? deps.handleSignIn : (() => {});
    const handleSignUp = typeof deps.handleSignUp === 'function' ? deps.handleSignUp : (() => {});
    const handleForgotPassword = typeof deps.handleForgotPassword === 'function' ? deps.handleForgotPassword : (() => {});
    const handleResetPassword = typeof deps.handleResetPassword === 'function' ? deps.handleResetPassword : (() => {});

    let authFocusBefore = null;

    function getOverlay() {
      const doc = getDocument();
      return doc?.getElementById?.('auth-overlay') || null;
    }

    function getAuthBox() {
      const doc = getDocument();
      return doc?.getElementById?.('auth-box') || null;
    }

    function getAuthUsernameHint(preferredIds = []) {
      const doc = getDocument();
      const candidates = Array.isArray(preferredIds) ? preferredIds.slice() : [preferredIds];
      const recovery = getRecoverySessionData();
      if (recovery?.email) candidates.unshift(recovery.email);
      ['signin-email', 'signup-email', 'forgot-email'].forEach(id => {
        if (!candidates.includes(id)) candidates.push(id);
      });
      for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate.includes && candidate.includes('@')) return candidate.trim();
        const field = doc?.getElementById?.(candidate);
        const value = field?.value?.trim();
        if (value) return value;
      }
      return '';
    }

    function ensureAuthUsernameAssistField(form, preferredIds = []) {
      if (!form || !form.querySelector('input[type="password"]')) return null;
      const visibleUsernameField = form.querySelector('input[autocomplete="username"]:not(.auth-username-assist), input[name="username"]:not(.auth-username-assist)');
      if (visibleUsernameField) return visibleUsernameField;
      let assistField = form.querySelector('.auth-username-assist');
      if (!assistField) {
        assistField = getDocument().createElement('input');
        assistField.type = 'email';
        assistField.className = 'auth-username-assist';
        assistField.tabIndex = -1;
        assistField.autocomplete = 'username';
        assistField.name = 'username';
        assistField.setAttribute('aria-hidden', 'true');
        form.insertBefore(assistField, form.firstChild);
      }
      assistField.value = getAuthUsernameHint(preferredIds);
      return assistField;
    }

    function syncAuthUsernameAssistFields() {
      const doc = getDocument();
      const configs = [
        { screenName: 'signup', preferredIds: ['signup-email'] },
        { screenName: 'reset', preferredIds: ['forgot-email', 'signin-email', 'signup-email'] },
      ];
      configs.forEach(({ screenName, preferredIds }) => {
        const form = doc.querySelector(`#auth-screen-${screenName} .auth-screen-form`);
        ensureAuthUsernameAssistField(form, preferredIds);
      });
    }

    function renderAuthScreen(screen) {
      const doc = getDocument();
      setAuthScreen(screen);
      ['signin', 'signup', 'forgot', 'reset'].forEach(s => {
        const el = doc.getElementById(`auth-screen-${s}`);
        if (el) el.style.display = s === screen ? '' : 'none';
      });
      const errEl = doc.getElementById(`${screen}-error`);
      if (errEl) errEl.textContent = '';
      const box = getAuthBox();
      const titles = { signin: 'Sign In', signup: 'Create Account', forgot: 'Reset Password', reset: 'Set New Password' };
      if (box) box.setAttribute('aria-label', titles[screen] || 'Sign In');
      syncAuthUsernameAssistFields();
      const firstInput = doc.querySelector(`#auth-screen-${screen} input`);
      if (firstInput) setTimeoutFn(() => firstInput.focus(), 0);
    }

    function initAuthForms() {
      const doc = getDocument();
      ['signin', 'signup', 'forgot', 'reset'].forEach(screenName => {
        const screen = doc.getElementById(`auth-screen-${screenName}`);
        if (!screen || screen.querySelector('.auth-screen-form')) return;
        const form = doc.createElement('form');
        form.className = 'auth-screen-form';
        form.noValidate = true;
        while (screen.firstChild) form.appendChild(screen.firstChild);
        form.addEventListener('submit', event => event.preventDefault());
        screen.appendChild(form);
        form.querySelectorAll('button').forEach(button => {
          button.type = 'button';
        });
        if (screenName === 'signin') {
          const usernameField = form.querySelector('#signin-email');
          const passwordField = form.querySelector('#signin-password');
          if (usernameField) {
            usernameField.autocomplete = 'username';
            usernameField.name = 'username';
            usernameField.inputMode = 'email';
          }
          if (passwordField) {
            passwordField.name = 'current-password';
          }
        }
        if (screenName === 'signup') ensureAuthUsernameAssistField(form, ['signup-email']);
        if (screenName === 'reset') ensureAuthUsernameAssistField(form, ['forgot-email', 'signin-email', 'signup-email']);
      });
      syncAuthUsernameAssistFields();
    }

    function closeAuthOverlay() {
      const doc = getDocument();
      const overlay = getOverlay();
      overlay?.classList?.remove('open');
      doc.removeEventListener('keydown', authFocusTrap);
      if (authFocusBefore && typeof authFocusBefore.focus === 'function') authFocusBefore.focus();
      authFocusBefore = null;
      setRecoverySessionData(null);
    }

    function authFocusTrap(e) {
      if (e.key === 'Escape') {
        closeAuthOverlay();
        return;
      }
      if (e.key !== 'Tab') return;
      const doc = getDocument();
      const box = doc.querySelector('#auth-overlay .auth-box');
      const focusable = Array.from(
        box.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])')
      ).filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (doc.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function openAuthOverlay(screen) {
      mountAuthOverlayTemplate(getDocument());
      setSettingsShellPending(false);
      const doc = getDocument();
      authFocusBefore = doc.activeElement;
      const overlay = getOverlay();
      if (!overlay) return;
      overlay.classList.add('open');
      const { supabaseUrl = '', anonKey = '' } = getSupabaseConfig();
      const noConfig = !supabaseUrl || !anonKey;
      const noConfigEl = doc.getElementById('auth-no-config');
      const formWrapEl = doc.getElementById('auth-form-wrap');
      if (noConfigEl) noConfigEl.style.display = noConfig ? '' : 'none';
      if (formWrapEl) formWrapEl.style.display = noConfig ? 'none' : '';
      if (!noConfig) renderAuthScreen(screen || 'signin');
      doc.addEventListener('keydown', authFocusTrap);
    }

    function requestSignIn(options = {}) {
      const normalized = (typeof options === 'string') ? { screen: options } : (options || {});
      return openAuthOverlay(normalized.screen || 'signin');
    }

    function initKeyboardSupport() {
      const doc = getDocument();
      initAuthForms();
      ['signin-email', 'signup-email', 'forgot-email'].forEach(id => {
        const field = doc.getElementById(id);
        if (field) field.addEventListener('input', syncAuthUsernameAssistFields);
      });

      const signinEmail = doc.getElementById('signin-email');
      const signinPassword = doc.getElementById('signin-password');
      const signupPassword = doc.getElementById('signup-password');
      const forgotEmail = doc.getElementById('forgot-email');
      const resetConfirm = doc.getElementById('reset-confirm');

      if (signinEmail) {
        signinEmail.addEventListener('keydown', function onSignInEmailKeydown(e) {
          if (e.key === 'Enter') signinPassword?.focus();
        });
      }
      if (signinPassword) {
        signinPassword.addEventListener('keydown', function onSignInPasswordKeydown(e) {
          if (e.key === 'Enter') handleSignIn();
        });
      }
      if (signupPassword) {
        signupPassword.addEventListener('keydown', function onSignUpPasswordKeydown(e) {
          if (e.key === 'Enter') handleSignUp();
        });
      }
      if (forgotEmail) {
        forgotEmail.addEventListener('keydown', function onForgotEmailKeydown(e) {
          if (e.key === 'Enter') handleForgotPassword();
        });
      }
      if (resetConfirm) {
        resetConfirm.addEventListener('keydown', function onResetConfirmKeydown(e) {
          if (e.key === 'Enter') handleResetPassword();
        });
      }
    }

    return {
      requestSignIn,
      openAuthOverlay,
      closeAuthOverlay,
      renderAuthScreen,
      syncAuthUsernameAssistFields,
      initAuthForms,
      initKeyboardSupport,
    };
  }

  modules.createAuthOverlayController = function createAuthOverlayControllerBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return createAuthOverlayControllerImpl(deps);
  };

  globalScope.__HF_AUTH_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
