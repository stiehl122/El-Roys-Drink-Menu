(function bootstrapAuthOverlayTemplate(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_AUTH_MODULES__ && typeof globalScope.__HF_AUTH_MODULES__ === 'object')
    ? globalScope.__HF_AUTH_MODULES__
    : {};

  const AUTH_OVERLAY_TEMPLATE = `
<div id="auth-overlay">
  <div class="auth-box" id="auth-box" role="dialog" aria-modal="true" aria-label="Sign In">
    <div id="auth-no-config" style="display:none" class="auth-hint-msg">Supabase is not configured. Check server environment variables.</div>
    <div id="auth-form-wrap">
      <div id="auth-screen-signin" class="auth-screen">
        <h2 class="auth-screen-title">Sign In</h2>
        <p class="auth-screen-subtitle">Sign in to your account</p>
        <div class="auth-field">
          <input type="email" id="signin-email" name="signin-email" placeholder="Email address" autocomplete="email" aria-label="Email address" aria-describedby="signin-error"/>
        </div>
        <div class="auth-field">
          <input type="password" id="signin-password" name="signin-password" placeholder="Password" autocomplete="current-password" aria-label="Password" aria-describedby="signin-error"/>
        </div>
        <div class="auth-error" id="signin-error"></div>
        <button class="auth-submit-btn" id="signin-submit-btn" onclick="handleSignIn()">Sign In</button>
        <button class="auth-link-btn" onclick="renderAuthScreen('forgot')">Forgot password?</button>
        <div class="auth-toggle">
          <span>Don't have an account?</span>
          <button class="auth-toggle-btn" onclick="renderAuthScreen('signup')">Sign Up</button>
        </div>
      </div>

      <div id="auth-screen-signup" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title">Create Account</h2>
        <p class="auth-screen-subtitle">Sign up with your work email</p>
        <div class="auth-field">
          <input type="text" id="signup-firstname" name="signup-firstname" placeholder="First name" autocomplete="given-name" aria-label="First name" aria-describedby="signup-error"/>
        </div>
        <div class="auth-field">
          <input type="text" id="signup-lastname" name="signup-lastname" placeholder="Last name" autocomplete="family-name" aria-label="Last name" aria-describedby="signup-error"/>
        </div>
        <div class="auth-field">
          <input type="email" id="signup-email" name="signup-email" placeholder="Email address" autocomplete="email" aria-label="Email address" aria-describedby="signup-error"/>
        </div>
        <div class="auth-field">
          <input type="password" id="signup-password" name="signup-password" placeholder="Password" autocomplete="new-password" aria-label="Password" aria-describedby="signup-error"/>
        </div>
        <div class="auth-error" id="signup-error"></div>
        <button class="auth-submit-btn" id="signup-submit-btn" onclick="handleSignUp()">Create Account</button>
        <p class="auth-approval-notice">New accounts require admin approval before menu access is granted.</p>
        <button class="auth-back-btn" onclick="renderAuthScreen('signin')">← Back to Sign In</button>
      </div>

      <div id="auth-screen-forgot" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title">Reset Password</h2>
        <p class="auth-screen-subtitle">Enter your email and we'll send a reset link</p>
        <div class="auth-field">
          <input type="email" id="forgot-email" name="forgot-email" placeholder="Email address" autocomplete="email" aria-label="Email address" aria-describedby="forgot-error"/>
        </div>
        <div class="auth-error" id="forgot-error"></div>
        <button class="auth-submit-btn" id="forgot-submit-btn" onclick="handleForgotPassword()">Send Reset Link</button>
        <button class="auth-back-btn" onclick="renderAuthScreen('signin')">← Back to Sign In</button>
      </div>

      <div id="auth-screen-reset" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title">Set New Password</h2>
        <p class="auth-screen-subtitle">Choose a new password for your account</p>
        <div class="auth-field">
          <input type="password" id="reset-password" name="reset-password" placeholder="New password" autocomplete="new-password" aria-label="New password" aria-describedby="reset-error"/>
        </div>
        <div class="auth-field">
          <input type="password" id="reset-confirm" name="reset-confirm" placeholder="Confirm new password" autocomplete="new-password" aria-label="Confirm new password" aria-describedby="reset-error"/>
        </div>
        <div class="auth-error" id="reset-error"></div>
        <button class="auth-submit-btn" id="reset-submit-btn" onclick="handleResetPassword()">Set Password</button>
      </div>
    </div>
    <button class="pin-cancel" onclick="closeAuthOverlay()">Cancel</button>
  </div>
</div>`;

  modules.AUTH_OVERLAY_TEMPLATE = AUTH_OVERLAY_TEMPLATE;

  modules.mountAuthOverlayTemplate = function mountAuthOverlayTemplate(targetDocument = globalScope.document) {
    if (!targetDocument || targetDocument.getElementById('auth-overlay')) {
      return targetDocument?.getElementById?.('auth-overlay') || null;
    }

    const body = targetDocument.body;
    if (!body) return null;

    if (typeof body.insertAdjacentHTML === 'function') {
      body.insertAdjacentHTML('beforeend', AUTH_OVERLAY_TEMPLATE);
      return targetDocument.getElementById('auth-overlay');
    }

    if (typeof targetDocument.createElement === 'function' && typeof body.appendChild === 'function') {
      const wrapper = targetDocument.createElement('div');
      wrapper.innerHTML = AUTH_OVERLAY_TEMPLATE;
      if (wrapper.firstElementChild) {
        body.appendChild(wrapper.firstElementChild);
      }
      return targetDocument.getElementById('auth-overlay');
    }

    return null;
  };

  globalScope.__HF_AUTH_MODULES__ = modules;

  try {
    modules.mountAuthOverlayTemplate(globalScope.document);
  } catch (_) {
    // Ignore early DOM bootstrap errors.
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
