# Auth Overhaul — Design Spec
**Date:** 2026-03-25
**Branch:** v0.6 (targeting a new v0.6.x patch)
**Status:** Approved

---

## Problem

The current auth overlay is buggy and hard to use:
- Google OAuth and SMS OTP sit alongside email/password with no clear hierarchy
- SMS flow hides/shows ~8 individual DOM elements, making it brittle and confusing
- Sign-in and sign-up share the same form fields with toggling — jarring UX
- No forgot/reset password flow
- Duplicate `sbOAuthRedirect` function defined twice (dead code at line 865)
- Two separate error elements (`auth-error`, `auth-sms-error`) — inconsistent

---

## Solution: Wizard Steps (Option C)

Replace the current auth overlay with a clean wizard-style flow. Four discrete screens live inside the existing `auth-box`. Only one screen is visible at a time, controlled by a single `_authScreen` string variable. The public "Sign In" button is unchanged — it still opens the same overlay, which starts on the `signin` screen.

---

## Screens

### `signin` (default)
- Fields: Email, Password
- Primary action: **Sign In**
- Secondary links: "Forgot password?" → `forgot` screen | "Don't have an account? Sign Up" → `signup` screen
- Enter on password field submits

### `signup`
- Fields: First Name, Last Name, Email, Password
- Primary action: **Create Account**
- Secondary: ← Back to `signin`
- Admin approval notice shown here only
- On success: shows confirmation message ("Check your email to confirm your account"), returns to `signin`

### `forgot`
- Fields: Email
- Primary action: **Send Reset Link**
- Secondary: ← Back to `signin`
- On success: shows confirmation message ("Check your email for a reset link"), returns to `signin`
- Calls Supabase `resetPasswordForEmail(email, { redirectTo: window.location.href })`

### `reset`
- Fields: New Password, Confirm Password
- Primary action: **Set Password**
- No back button (user arrived via email link)
- Triggered automatically when the app detects a Supabase recovery token in the URL hash (`#type=recovery&access_token=...`)
- On success: signs user in and closes overlay

---

## State

Single global: `let _authScreen = 'signin'`
All other auth globals unchanged (`currentUser`, `_authFocusBefore`, etc.)

Remove: `_authMode`, `_smsStep`, `_smsPhone`, `_smsRateLimitTimer`

---

## Key Functions

| Function | Description |
|---|---|
| `renderAuthScreen(screen)` | Sets `_authScreen`, swaps visible screen div, clears errors, sets focus |
| `openAuthOverlay()` | Opens overlay, calls `renderAuthScreen('signin')` (or `'reset'` if recovery URL detected) |
| `handleSignIn()` | Email/password sign-in |
| `handleSignUp()` | Email/password sign-up |
| `handleForgotPassword()` | Sends Supabase reset email |
| `handleResetPassword()` | Verifies new password, calls Supabase update, signs user in |
| `_tryHandleOAuthCallback()` | Already handles `code` param; extend to also detect `#type=recovery` hash |

Remove: `toggleAuthMode()`, `showSmsSection()`, `hideSmsSection()`, `handleSmsFlow()`, `sbSendOtp()`, `sbVerifyOtp()`, `sbOAuthRedirect()` (both copies)

---

## HTML Structure

```html
<div id="auth-overlay">
  <div class="auth-box" role="dialog" aria-modal="true" aria-labelledby="auth-screen-title">
    <div id="auth-no-config" style="display:none">…</div>
    <div id="auth-form-wrap">

      <!-- SIGN IN -->
      <div id="auth-screen-signin" class="auth-screen">
        <h2 class="auth-screen-title">SIGN IN</h2>
        <p class="auth-screen-subtitle">Sign in to your account</p>
        <div class="auth-field"><input id="signin-email" type="email" …/></div>
        <div class="auth-field"><input id="signin-password" type="password" …/></div>
        <div class="auth-error" id="signin-error"></div>
        <button class="auth-submit-btn" onclick="handleSignIn()">Sign In</button>
        <button class="auth-link-btn" onclick="renderAuthScreen('forgot')">Forgot password?</button>
        <div class="auth-toggle">
          <span>Don't have an account?</span>
          <button class="auth-toggle-btn" onclick="renderAuthScreen('signup')">Sign Up</button>
        </div>
      </div>

      <!-- SIGN UP -->
      <div id="auth-screen-signup" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title">CREATE ACCOUNT</h2>
        <p class="auth-screen-subtitle">Sign up with your work email</p>
        <div class="auth-field"><input id="signup-firstname" …/></div>
        <div class="auth-field"><input id="signup-lastname" …/></div>
        <div class="auth-field"><input id="signup-email" type="email" …/></div>
        <div class="auth-field"><input id="signup-password" type="password" …/></div>
        <div class="auth-error" id="signup-error"></div>
        <button class="auth-submit-btn" onclick="handleSignUp()">Create Account</button>
        <p class="auth-approval-notice">New accounts require admin approval before menu access is granted.</p>
        <button class="auth-back-btn" onclick="renderAuthScreen('signin')">← Back</button>
      </div>

      <!-- FORGOT PASSWORD -->
      <div id="auth-screen-forgot" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title">RESET PASSWORD</h2>
        <p class="auth-screen-subtitle">We'll email you a reset link</p>
        <div class="auth-field"><input id="forgot-email" type="email" …/></div>
        <div class="auth-error" id="forgot-error"></div>
        <button class="auth-submit-btn" onclick="handleForgotPassword()">Send Reset Link</button>
        <button class="auth-back-btn" onclick="renderAuthScreen('signin')">← Back</button>
      </div>

      <!-- RESET PASSWORD -->
      <div id="auth-screen-reset" class="auth-screen" style="display:none">
        <h2 class="auth-screen-title">SET NEW PASSWORD</h2>
        <p class="auth-screen-subtitle">Choose a new password for your account</p>
        <div class="auth-field"><input id="reset-password" type="password" …/></div>
        <div class="auth-field"><input id="reset-confirm" type="password" …/></div>
        <div class="auth-error" id="reset-error"></div>
        <button class="auth-submit-btn" onclick="handleResetPassword()">Set Password</button>
      </div>

    </div>
    <button class="pin-cancel" onclick="closeAuthOverlay()">Cancel</button>
  </div>
</div>
```

---

## CSS Changes

- Add `.auth-screen` (no special styles needed — display toggled by JS)
- Add `.auth-link-btn` (inline text button, styled like a link, for "Forgot password?")
- Add `.auth-back-btn` (small secondary button, left-aligned, with ← arrow)
- Remove `.auth-social-row`, `.auth-social-btn`, `.auth-divider` rules

---

## Supabase API Additions

| Function | Supabase endpoint |
|---|---|
| `sbResetPasswordForEmail(email)` | `POST /auth/v1/recover` with `{ email, redirect_to }` |
| `sbUpdatePassword(newPassword, accessToken)` | `PUT /auth/v1/user` with `{ password }` and Bearer token |

---

## Recovery URL Detection

Supabase recovery emails redirect back to the app with a URL hash:
`#access_token=...&type=recovery`

In `_tryHandleOAuthCallback()` (or a new `_tryHandleRecoveryCallback()` called from `init()`):
1. Parse `window.location.hash`
2. If `type === 'recovery'`, extract `access_token`
3. Store token temporarily, call `openAuthOverlay()` → `renderAuthScreen('reset')`
4. On submit, call `sbUpdatePassword(newPassword, storedToken)`, then `sbGetProfile` and `_applySession`
5. Clean the hash from the URL (`history.replaceState`)

---

## Out of Scope

- Magic link sign-in
- Social/OAuth sign-in (removed, not re-added later without explicit request)
- SMS OTP (removed)
- Admin-initiated password reset (handled via Supabase dashboard)
