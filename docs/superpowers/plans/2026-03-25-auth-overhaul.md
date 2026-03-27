# Auth Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current multi-method auth overlay (email/password + Google OAuth + SMS OTP) with a clean wizard-style flow: Sign In → Sign Up → Forgot Password → Reset Password, with each screen as a discrete step.

**Architecture:** Four discrete screen `<div>`s inside the existing `#auth-overlay`, toggled by a single `renderAuthScreen(screen)` function. No more per-field show/hide toggling; entire screens swap in/out. Recovery URL detection (`#type=recovery`) replaces the OAuth callback handler. All OAuth and SMS code is deleted.

**Tech Stack:** Vanilla JS, Supabase REST API (`/auth/v1/recover`, `PUT /auth/v1/user`), no build tools.

---

## File Map

| File | What changes |
|---|---|
| `index.html` | Replace `#auth-overlay` div (lines 282–335) with new wizard HTML |
| `style.css` | Remove `.auth-social-row`, `.auth-social-btn`, `.auth-divider`; add `.auth-back-btn`, `.auth-link-btn` |
| `app.js` | Remove globals `_authMode`, `_smsStep`, `_smsPhone`, `_smsRateLimitTimer`; add `_authScreen`, `_recoverySessionData`; remove 9 dead/removed functions; add `sbResetPasswordForEmail`, `sbUpdatePassword`, `renderAuthScreen`, `handleSignIn`, `handleSignUp`, `handleForgotPassword`, `handleResetPassword`, `_tryHandleRecoveryCallback`; update `openAuthOverlay`, `init()` wiring, keyboard IIFE |

---

## Task 1: Replace auth overlay HTML

**Files:**
- Modify: `index.html:282–335`

- [ ] **Step 1: Replace the `#auth-overlay` div**

Find and replace the entire block from `<!-- AUTH OVERLAY -->` through `</div>` (closing the overlay) with:

```html
<!-- AUTH OVERLAY -->
<div id="auth-overlay">
  <div class="auth-box" role="dialog" aria-modal="true" aria-labelledby="auth-screen-title">
    <div id="auth-no-config" style="display:none" class="auth-hint-msg">Supabase is not configured. Check server environment variables.</div>
    <div id="auth-form-wrap">

      <!-- SIGN IN -->
      <div id="auth-screen-signin" class="auth-screen">
        <h2 class="auth-screen-title" id="auth-screen-title">SIGN IN</h2>
        <p class="auth-screen-subtitle">Sign in to your account</p>
        <div class="auth-field">
          <input type="email" id="signin-email" placeholder="Email address" autocomplete="email"/>
        </div>
        <div class="auth-field">
          <input type="password" id="signin-password" placeholder="Password" autocomplete="current-password"/>
        </div>
        <div class="auth-error" id="signin-error"></div>
        <button class="auth-submit-btn" id="signin-submit-btn" onclick="handleSignIn()">Sign In</button>
        <button class="auth-link-btn" onclick="renderAuthScreen('forgot')">Forgot password?</button>
        <div class="auth-toggle">
          <span>Don't have an account?</span>
          <button class="auth-toggle-btn" onclick="renderAuthScreen('signup')">Sign Up</button>
        </div>
      </div>

      <!-- SIGN UP -->
      <div id="auth-screen-signup" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title" id="auth-screen-title">CREATE ACCOUNT</h2>
        <p class="auth-screen-subtitle">Sign up with your work email</p>
        <div class="auth-field">
          <input type="text" id="signup-firstname" placeholder="First name" autocomplete="given-name"/>
        </div>
        <div class="auth-field">
          <input type="text" id="signup-lastname" placeholder="Last name" autocomplete="family-name"/>
        </div>
        <div class="auth-field">
          <input type="email" id="signup-email" placeholder="Email address" autocomplete="email"/>
        </div>
        <div class="auth-field">
          <input type="password" id="signup-password" placeholder="Password" autocomplete="new-password"/>
        </div>
        <div class="auth-error" id="signup-error"></div>
        <button class="auth-submit-btn" id="signup-submit-btn" onclick="handleSignUp()">Create Account</button>
        <p class="auth-approval-notice">New accounts require admin approval before menu access is granted.</p>
        <button class="auth-back-btn" onclick="renderAuthScreen('signin')">← Back to Sign In</button>
      </div>

      <!-- FORGOT PASSWORD -->
      <div id="auth-screen-forgot" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title" id="auth-screen-title">RESET PASSWORD</h2>
        <p class="auth-screen-subtitle">Enter your email and we'll send a reset link</p>
        <div class="auth-field">
          <input type="email" id="forgot-email" placeholder="Email address" autocomplete="email"/>
        </div>
        <div class="auth-error" id="forgot-error"></div>
        <button class="auth-submit-btn" id="forgot-submit-btn" onclick="handleForgotPassword()">Send Reset Link</button>
        <button class="auth-back-btn" onclick="renderAuthScreen('signin')">← Back to Sign In</button>
      </div>

      <!-- RESET PASSWORD -->
      <div id="auth-screen-reset" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title" id="auth-screen-title">SET NEW PASSWORD</h2>
        <p class="auth-screen-subtitle">Choose a new password for your account</p>
        <div class="auth-field">
          <input type="password" id="reset-password" placeholder="New password" autocomplete="new-password"/>
        </div>
        <div class="auth-field">
          <input type="password" id="reset-confirm" placeholder="Confirm new password" autocomplete="new-password"/>
        </div>
        <div class="auth-error" id="reset-error"></div>
        <button class="auth-submit-btn" id="reset-submit-btn" onclick="handleResetPassword()">Set Password</button>
      </div>

    </div>
    <button class="pin-cancel" onclick="closeAuthOverlay()">Cancel</button>
  </div>
</div>
```

> **Note:** The four `id="auth-screen-title"` attributes are intentional duplicates — each screen has its own `h2` and only one screen is visible at a time, so `aria-labelledby="auth-screen-title"` always resolves to the visible heading.

- [ ] **Step 2: Verify HTML is well-formed**

Open `index.html` in a text editor and confirm:
- The old `#auth-overlay` block (which contained `#auth-social-section`, `#auth-sms-section`, `#auth-name-field`, etc.) is fully replaced
- The new overlay has exactly four `auth-screen` divs: `auth-screen-signin`, `auth-screen-signup`, `auth-screen-forgot`, `auth-screen-reset`
- No old IDs like `auth-email`, `auth-password`, `auth-title`, `auth-phone`, `auth-otp` remain in the overlay

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(auth): replace overlay HTML with wizard screens"
```

---

## Task 2: Update CSS

**Files:**
- Modify: `style.css:133–138`

- [ ] **Step 1: Remove OAuth/SMS CSS rules**

Find and delete these three rules (they appear together around line 133–138):

```css
  .auth-social-row { display: flex; gap: 10px; margin-bottom: 14px; }
  .auth-social-btn { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 11px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 9px; font-family: var(--font-body); font-size: 11px; color: var(--charcoal); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
  .auth-social-btn:hover { border-color: var(--teal); background: var(--cream); }
  .auth-social-btn svg { width: 20px; height: 20px; }
  .auth-divider { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 10px; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; }
  .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
```

- [ ] **Step 2: Add new button styles**

Immediately after the `.auth-approval-notice` rule (line ~130), add:

```css
  .auth-back-btn { background: none; border: none; color: var(--muted); font-size: 12px; cursor: pointer; margin-top: 10px; display: block; width: 100%; padding: 6px; transition: color 0.15s; text-align: center; font-family: var(--font-body); }
  .auth-back-btn:hover { color: var(--charcoal); }
  .auth-link-btn { background: none; border: none; color: var(--teal); font-size: 12px; cursor: pointer; display: block; width: 100%; padding: 4px 0; margin-bottom: 12px; text-align: center; font-family: var(--font-body); text-decoration: underline; }
  .auth-link-btn:hover { color: var(--teal-dk); }
```

- [ ] **Step 3: Verify no broken references**

Search `style.css` for `auth-social`, `auth-divider` — confirm zero results.

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "feat(auth): update CSS for wizard screens, remove OAuth/SMS styles"
```

---

## Task 3: Update app.js globals

**Files:**
- Modify: `app.js:26–29`

- [ ] **Step 1: Remove old auth globals**

Find and remove these four lines:

```js
let _authMode     = 'signin'; // 'signin' | 'signup'
let _smsStep      = 'phone';  // 'phone' | 'otp'
let _smsPhone     = '';
let _smsRateLimitTimer = null;
```

- [ ] **Step 2: Add new auth globals**

In their place (after `let _tokenRefreshTimer = null;`), add:

```js
let _authScreen        = 'signin'; // 'signin' | 'signup' | 'forgot' | 'reset'
let _recoverySessionData = null;   // set when app detects a Supabase recovery URL hash
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(auth): replace auth globals with wizard screen state"
```

---

## Task 4: Remove dead and removed Supabase functions

**Files:**
- Modify: `app.js` (auth section, lines ~855–947)

Remove the following functions in order from the file. Use the function signatures to locate them.

- [ ] **Step 1: Remove `_generatePKCE`**

Find and delete the entire function:

```js
async function _generatePKCE() {
  const array = crypto.getRandomValues(new Uint8Array(32));
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { verifier, challenge };
}
```

- [ ] **Step 2: Remove the first (dead) `sbOAuthRedirect`**

Find and delete:

```js
async function sbOAuthRedirect(provider) {
  const { verifier, challenge } = await _generatePKCE();
  sessionStorage.setItem('hf_pkce_verifier', verifier);
  const redirectTo = window.location.origin + window.location.pathname;
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}`
    + `&redirect_to=${encodeURIComponent(redirectTo)}`
    + `&code_challenge=${challenge}&code_challenge_method=S256`;
  window.location.href = url;
}
```

- [ ] **Step 3: Remove `sbExchangeOAuthCode`**

Find and delete:

```js
async function sbExchangeOAuthCode(code, verifier) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ code, code_verifier: verifier })
  });
  return r.json();
}
```

- [ ] **Step 4: Remove `sbSendOtp`**

Find and delete:

```js
async function sbSendOtp(phone) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ phone })
  });
  return r.json();
}
```

- [ ] **Step 5: Remove `sbVerifyOtp`**

Find and delete:

```js
async function sbVerifyOtp(phone, token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ phone, token })
  });
  return r.json();
}
```

- [ ] **Step 6: Remove the second (live) `sbOAuthRedirect`**

Find and delete the block including its comment:

```js
// #145: URL-encode the provider name to prevent open-redirect / URL injection.
async function sbOAuthRedirect(provider) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const redirectTo = encodeURIComponent(window.location.origin);
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${redirectTo}`;
  window.location.href = url;
}
```

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat(auth): remove PKCE, OAuth, and SMS Supabase functions"
```

---

## Task 5: Remove old overlay controller functions

**Files:**
- Modify: `app.js` (auth overlay section, lines ~1111–1244)

- [ ] **Step 1: Remove `toggleAuthMode`**

Find and delete:

```js
function toggleAuthMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSignIn = _authMode === 'signin';
  document.getElementById('auth-title').textContent       = isSignIn ? 'SIGN IN' : 'CREATE ACCOUNT';
  document.getElementById('auth-subtitle').textContent    = isSignIn ? 'Sign in to your account' : 'Sign up with your work email';
  document.getElementById('auth-submit-btn').textContent  = isSignIn ? 'Sign In' : 'Sign Up';
  document.getElementById('auth-toggle-text').textContent = isSignIn ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('auth-toggle-btn').textContent  = isSignIn ? 'Sign Up' : 'Sign In';
  document.getElementById('auth-name-field').style.display     = isSignIn ? 'none' : '';
  document.getElementById('auth-lastname-field').style.display = isSignIn ? 'none' : '';
  document.getElementById('auth-error').textContent = '';
}
```

- [ ] **Step 2: Remove `handleAuthSubmit`**

Find and delete:

```js
async function handleAuthSubmit() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit-btn');
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
  btn.disabled = true;
  btn.textContent = _authMode === 'signin' ? 'Signing in…' : 'Creating account…';
  errEl.textContent = '';
  try {
    let data, role, name;
    if (_authMode === 'signup') {
      const firstName = (document.getElementById('auth-firstname')?.value || '').trim();
      const lastName  = (document.getElementById('auth-lastname')?.value  || '').trim();
      name = [firstName, lastName].filter(Boolean).join(' ');
      data = await sbSignUp(email, password, name);
      role = 'none';
    } else {
      data = await sbSignIn(email, password);
      if (data.access_token) {
        const profile = await sbGetProfile(data.access_token);
        role = profile.role;
        name = profile.name;
      } else {
        role = 'none'; name = '';
      }
    }
    _applySession(data, role, name);
    closeAuthOverlay();
    applyRole(role);
    if (role === 'none') {
      showToast('Signed in. Contact admin to get manager access.', 'info');
    }
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Authentication failed.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Sign Up';
  }
}
```

- [ ] **Step 3: Remove `showSmsSection`**

Find and delete:

```js
function showSmsSection() {
  _smsStep = 'phone';
  document.getElementById('auth-social-section').style.display = 'none';
  document.getElementById('auth-name-field').style.display     = 'none';
  document.getElementById('auth-lastname-field').style.display = 'none';
  document.getElementById('auth-email').closest('.auth-field').style.display    = 'none';
  document.getElementById('auth-password').closest('.auth-field').style.display = 'none';
  document.getElementById('auth-submit-btn').style.display     = 'none';
  document.querySelector('.auth-toggle').style.display         = 'none';
  document.getElementById('auth-otp-field').style.display      = 'none';
  document.getElementById('auth-sms-section').style.display    = '';
  document.getElementById('auth-sms-error').textContent        = '';
  document.getElementById('auth-phone').value = '';
  document.getElementById('auth-otp').value   = '';
  document.getElementById('auth-sms-send-btn').textContent = 'Send Code';
  document.getElementById('auth-sms-send-btn').disabled    = false;
  document.getElementById('auth-phone').focus();
}
```

- [ ] **Step 4: Remove `hideSmsSection`**

Find and delete:

```js
function hideSmsSection() {
  document.getElementById('auth-sms-section').style.display    = 'none';
  document.getElementById('auth-social-section').style.display = '';
  document.getElementById('auth-email').closest('.auth-field').style.display    = '';
  document.getElementById('auth-password').closest('.auth-field').style.display = '';
  document.getElementById('auth-submit-btn').style.display     = '';
  document.querySelector('.auth-toggle').style.display         = '';
  _smsStep = 'phone';
  _smsPhone = '';
  if (_smsRateLimitTimer) { clearInterval(_smsRateLimitTimer); _smsRateLimitTimer = null; }
}
```

- [ ] **Step 5: Remove `handleSmsFlow`**

Find and delete the entire function including its comment:

```js
// #147: Rate-limited SMS OTP flow. Prevents rapid repeated sends that abuse Twilio credits.
async function handleSmsFlow() {
  const btn   = document.getElementById('auth-sms-send-btn');
  const errEl = document.getElementById('auth-sms-error');
  errEl.textContent = '';
  if (_smsStep === 'phone') {
    const phone = document.getElementById('auth-phone').value.trim();
    if (!phone) { errEl.textContent = 'Enter a phone number.'; return; }
    btn.textContent = 'Sending…'; btn.disabled = true;
    const res = await sbSendOtp(phone);
    if (res.error) { errEl.textContent = res.error.message || 'Failed to send code.'; btn.disabled = false; btn.textContent = 'Send Code'; return; }
    _smsPhone = phone;
    _smsStep = 'otp';
    document.getElementById('auth-otp-field').style.display = '';
    // Start 60-second countdown to prevent rapid resends.
    let remaining = 60;
    btn.disabled = true;
    btn.textContent = `Resend in ${remaining}s`;
    _smsRateLimitTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(_smsRateLimitTimer);
        _smsRateLimitTimer = null;
        btn.disabled = false;
        btn.textContent = 'Resend Code';
      } else {
        btn.textContent = `Resend in ${remaining}s`;
      }
    }, 1000);
    document.getElementById('auth-otp').focus();
  } else {
    const token = document.getElementById('auth-otp').value.trim();
    if (!token) { errEl.textContent = 'Enter the 6-digit code.'; return; }
    btn.textContent = 'Verifying…'; btn.disabled = true;
    const data = await sbVerifyOtp(_smsPhone, token);
    btn.disabled = false;
    if (data.error || !data.access_token) {
      errEl.textContent = data.error?.message || 'Invalid code.';
      btn.textContent = 'Verify Code'; return;
    }
    const { role, name } = await sbGetProfile(data.access_token);
    _applySession(data, role, name);
    closeAuthOverlay();
    applyRole(role);
    renderUserHeader();
    if (role === 'none') showToast('Signed in. Contact admin to get manager access.', 'info');
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat(auth): remove old auth overlay controller functions"
```

---

## Task 6: Add new Supabase API helpers

**Files:**
- Modify: `app.js` (after `sbGetProfile`, around line ~939)

- [ ] **Step 1: Add `sbResetPasswordForEmail` and `sbUpdatePassword`**

Find `async function sbGetProfile(accessToken)` and insert the following two functions immediately after it (after its closing `}`):

```js
async function sbResetPasswordForEmail(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, redirect_to: redirectTo })
  });
  if (!r.ok) throw await r.json();
}

async function sbUpdatePassword(newPassword, accessToken) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({ password: newPassword })
  });
  if (!r.ok) throw await r.json();
  return r.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add app.js
git commit -m "feat(auth): add sbResetPasswordForEmail and sbUpdatePassword"
```

---

## Task 7: Add wizard screen controller and handler functions

**Files:**
- Modify: `app.js` (auth overlay section, after `closeAuthOverlay`)

- [ ] **Step 1: Replace `openAuthOverlay` with the updated version**

Find the existing `openAuthOverlay` function:

```js
function openAuthOverlay() {
  _authFocusBefore = document.activeElement;
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.add('open');
  const noConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;
  document.getElementById('auth-no-config').style.display    = noConfig ? '' : 'none';
  document.getElementById('auth-form-wrap').style.display    = noConfig ? 'none' : '';
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';
  hideSmsSection(); // reset SMS state and restore main form visibility
  if (!noConfig) document.getElementById('auth-email').focus();
  document.addEventListener('keydown', _authFocusTrap);
}
```

Replace it with:

```js
function openAuthOverlay() {
  _authFocusBefore = document.activeElement;
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.add('open');
  const noConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY;
  document.getElementById('auth-no-config').style.display = noConfig ? '' : 'none';
  document.getElementById('auth-form-wrap').style.display = noConfig ? 'none' : '';
  if (!noConfig) renderAuthScreen('signin');
  document.addEventListener('keydown', _authFocusTrap);
}
```

- [ ] **Step 2: Add `renderAuthScreen` immediately after `closeAuthOverlay`**

Find `function closeAuthOverlay()` and insert the following immediately after its closing `}`:

```js
function renderAuthScreen(screen) {
  _authScreen = screen;
  ['signin', 'signup', 'forgot', 'reset'].forEach(s => {
    const el = document.getElementById(`auth-screen-${s}`);
    if (el) el.style.display = s === screen ? '' : 'none';
  });
  const errEl = document.getElementById(`${screen}-error`);
  if (errEl) errEl.textContent = '';
  const firstInput = document.querySelector(`#auth-screen-${screen} input`);
  if (firstInput) setTimeout(() => firstInput.focus(), 0);
}
```

- [ ] **Step 3: Add the four wizard handler functions after `renderAuthScreen`**

Insert immediately after `renderAuthScreen`:

```js
async function handleSignIn() {
  const email    = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const errEl    = document.getElementById('signin-error');
  const btn      = document.getElementById('signin-submit-btn');
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  errEl.textContent = '';
  try {
    const data = await sbSignIn(email, password);
    const { role, name } = await sbGetProfile(data.access_token);
    _applySession(data, role, name);
    closeAuthOverlay();
    applyRole(role);
    if (role === 'none') showToast('Signed in. Contact admin to get manager access.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Authentication failed.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleSignUp() {
  const firstName = document.getElementById('signup-firstname').value.trim();
  const lastName  = document.getElementById('signup-lastname').value.trim();
  const email     = document.getElementById('signup-email').value.trim();
  const password  = document.getElementById('signup-password').value;
  const errEl     = document.getElementById('signup-error');
  const btn       = document.getElementById('signup-submit-btn');
  if (!email || !password) { errEl.textContent = 'Enter your email and password.'; return; }
  btn.disabled = true;
  btn.textContent = 'Creating account…';
  errEl.textContent = '';
  try {
    const name = [firstName, lastName].filter(Boolean).join(' ');
    await sbSignUp(email, password, name);
    closeAuthOverlay();
    showToast('Account created. Contact admin to activate manager access.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Sign-up failed.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const btn   = document.getElementById('forgot-submit-btn');
  if (!email) { errEl.textContent = 'Enter your email address.'; return; }
  btn.disabled = true;
  btn.textContent = 'Sending…';
  errEl.textContent = '';
  try {
    await sbResetPasswordForEmail(email);
    closeAuthOverlay();
    showToast('Check your email for a password reset link.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Failed to send reset email.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Reset Link';
  }
}

async function handleResetPassword() {
  const password = document.getElementById('reset-password').value;
  const confirm  = document.getElementById('reset-confirm').value;
  const errEl    = document.getElementById('reset-error');
  const btn      = document.getElementById('reset-submit-btn');
  if (!password) { errEl.textContent = 'Enter a new password.'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (!_recoverySessionData) { errEl.textContent = 'Reset session expired. Please request a new link.'; return; }
  btn.disabled = true;
  btn.textContent = 'Saving…';
  errEl.textContent = '';
  try {
    await sbUpdatePassword(password, _recoverySessionData.access_token);
    const { role, name } = await sbGetProfile(_recoverySessionData.access_token);
    _applySession(_recoverySessionData, role, name);
    _recoverySessionData = null;
    closeAuthOverlay();
    applyRole(role);
    showToast('Password updated. You are now signed in.', 'info');
  } catch(err) {
    const msg = err?.msg || err?.error_description || err?.message || 'Failed to update password.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set Password';
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(auth): add renderAuthScreen and wizard handler functions"
```

---

## Task 8: Replace OAuth callback handler with recovery callback handler

**Files:**
- Modify: `app.js:601–617` (`_tryHandleOAuthCallback` and its call site in `init()`)

- [ ] **Step 1: Replace `_tryHandleOAuthCallback` with `_tryHandleRecoveryCallback`**

Find:

```js
async function _tryHandleOAuthCallback() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const verifier = sessionStorage.getItem('hf_pkce_verifier');
  if (!code || !verifier) return false;
  history.replaceState({}, '', window.location.pathname);
  sessionStorage.removeItem('hf_pkce_verifier');
  const data = await sbExchangeOAuthCode(code, verifier);
  if (!data.access_token) return false;
  const { role, name } = await sbGetProfile(data.access_token);
  _applySession(data, role, name);
  applyRole(role);
  renderUserHeader();
  if (role === 'none') showToast('Signed in. Contact admin to get manager access.');
  return true;
}
```

Replace with:

```js
async function _tryHandleRecoveryCallback() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  if (params.get('type') !== 'recovery') return false;
  const accessToken = params.get('access_token');
  if (!accessToken) return false;
  history.replaceState({}, '', window.location.pathname);
  _recoverySessionData = {
    access_token:  accessToken,
    refresh_token: params.get('refresh_token') || '',
    expires_in:    Number(params.get('expires_in') || 3600),
  };
  openAuthOverlay();
  renderAuthScreen('reset');
  return true;
}
```

- [ ] **Step 2: Update the call site in `init()`**

Find:

```js
  // Restore Supabase session — OAuth callback takes priority over stored tokens
  const handledOAuth = await _tryHandleOAuthCallback();
  if (!handledOAuth) await _tryRestoreSession();
```

Replace with:

```js
  // Restore Supabase session — recovery callback takes priority over stored tokens
  const handledRecovery = await _tryHandleRecoveryCallback();
  if (!handledRecovery) await _tryRestoreSession();
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(auth): replace OAuth callback with recovery URL handler"
```

---

## Task 9: Replace keyboard support IIFE

**Files:**
- Modify: `app.js:1962–1970`

- [ ] **Step 1: Replace the old keyboard IIFE**

Find the existing keyboard support block at the bottom of the file:

```js
// ─── AUTH OVERLAY KEYBOARD SUPPORT ───────────────────────────────────────────
(function() {
  document.getElementById('auth-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleAuthSubmit();
  });
  document.getElementById('auth-email').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('auth-password').focus();
  });
})();
```

Replace with:

```js
// ─── AUTH OVERLAY KEYBOARD SUPPORT ───────────────────────────────────────────
(function() {
  // Sign In: email Enter → focus password; password Enter → submit
  document.getElementById('signin-email').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('signin-password').focus();
  });
  document.getElementById('signin-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleSignIn();
  });
  // Sign Up: password Enter → submit
  document.getElementById('signup-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleSignUp();
  });
  // Forgot: email Enter → submit
  document.getElementById('forgot-email').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleForgotPassword();
  });
  // Reset: confirm Enter → submit
  document.getElementById('reset-confirm').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleResetPassword();
  });
})();
```

- [ ] **Step 2: Commit**

```bash
git add app.js
git commit -m "feat(auth): update keyboard support for wizard screens"
```

---

## Task 10: Smoke test and version bump

- [ ] **Step 1: Open browser console, load the app**

Deploy to Vercel preview or open `index.html` via local dev. Open DevTools console.

Expected: No JS errors on load. The public menu renders. No references to `auth-email`, `auth-password`, `auth-title`, `hideSmsSection`, `sbOAuthRedirect`, `_authMode` appear in console errors.

- [ ] **Step 2: Test Sign In screen**

Click the "Sign In" header button. Verify:
- Overlay opens showing the Sign In screen
- Title reads "SIGN IN"
- Two inputs: Email, Password
- "Forgot password?" link visible below the submit button
- "Don't have an account? Sign Up" toggle at bottom
- Tab key cycles through inputs and buttons, stays within the overlay
- Pressing Cancel closes the overlay

- [ ] **Step 3: Test Sign Up screen**

Click "Sign Up" from the Sign In screen. Verify:
- Screen switches to Sign Up (title "CREATE ACCOUNT")
- Four inputs: First name, Last name, Email, Password
- Admin approval notice visible
- "← Back to Sign In" button returns to Sign In screen

- [ ] **Step 4: Test Forgot Password screen**

Click "Forgot password?" from Sign In. Verify:
- Screen switches to Forgot (title "RESET PASSWORD")
- One input: Email
- "← Back to Sign In" returns to Sign In

- [ ] **Step 5: Test actual sign-in (requires Vercel deployment)**

Enter valid credentials on Sign In screen. Verify:
- Button shows "Signing in…" while loading
- On success: overlay closes, user chip appears in header
- On bad password: inline error appears below the inputs, button re-enables

- [ ] **Step 6: Test forgot password flow (requires Vercel deployment)**

Enter a valid email on Forgot screen. Verify:
- Toast shows "Check your email for a password reset link."
- Overlay closes

- [ ] **Step 7: Bump APP_VERSION**

In `app.js` line 2, update:

```js
const APP_VERSION = 'v0.6.1';
```

- [ ] **Step 8: Final commit**

```bash
git add app.js
git commit -m "chore(release): bump APP_VERSION to v0.6.1"
```

---

## Spec Coverage Check

| Spec requirement | Task that covers it |
|---|---|
| Remove Google OAuth | Tasks 4, 5 |
| Remove SMS OTP | Tasks 4, 5 |
| Four wizard screens: signin, signup, forgot, reset | Tasks 1, 7 |
| Single `renderAuthScreen` controller | Task 7 |
| Forgot password → Supabase recover email | Tasks 6, 7 |
| In-app reset screen via recovery URL hash | Tasks 7, 8 |
| Approval notice on signup only | Task 1 |
| Single error element per screen | Tasks 1, 7 |
| Enter key support on all screens | Task 9 |
| Back navigation on signup/forgot | Tasks 1, 7 |
| Remove `_authMode`, `_smsStep`, `_smsPhone`, `_smsRateLimitTimer` | Task 3 |
| Remove duplicate `sbOAuthRedirect` | Task 4 |
| CSS cleanup | Task 2 |
