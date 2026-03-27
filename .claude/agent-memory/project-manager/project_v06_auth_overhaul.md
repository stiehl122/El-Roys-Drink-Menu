---
name: v0.6 auth overhaul
description: Auth was replaced with wizard screens (Sign In, Sign Up, Forgot Password, Reset Password) in v0.6.1 — OAuth and SMS removed
type: project
---

PR #174 on v0.6 branch replaced the single-toggle auth overlay with four wizard screens. Google OAuth and SMS OTP were removed entirely. Forgot/reset password flow uses Supabase REST API directly. Recovery URL detection opens the Reset Password screen in-app. APP_VERSION is v0.6.1.

**Known minor open items (low priority, not yet filed as issues):**
- `signup-firstname` and `signup-lastname` inputs are missing `aria-describedby="signup-error"` — the error div exists but is not referenced.
- `signup-email` Enter key does not advance focus to the password field (inconsistent with sign-in screen which does advance focus).
- `.auth-error` in style.css uses hardcoded `#e74c3c` instead of `var(--red)` — violates the CSS custom property convention.
- The `aria-label` on `#auth-box` is hardcoded as "Sign In" in the HTML but is correctly updated dynamically by `renderAuthScreen()` — the static HTML value is harmless but slightly misleading.

**Why:** These were identified during code review but deprioritized in favor of shipping the main auth overhaul. File as follow-up issues when ready.

**How to apply:** When the user asks about auth or accessibility work, reference these as known open items before brainstorming new work.
