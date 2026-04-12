---
name: auth-and-access-guard
description: Guard authentication, recovery, role enforcement, and per-menu access control. Use when work touches the auth wizard, session restoration, reset-password handling, `api/_auth.js`, `api/_supabase.js`, `api/role.js`, `api/users.js`, or menu-access bugs.
---

# Auth And Access Guard

Use this skill when the user asks to debug or change auth, recovery, roles, or
menu permissions.

## Ownership

- auth and recovery orchestration in root `app.js`
- shared auth module boundaries in `core/auth/*`:
  - `auth-api.js`
  - `auth-session-service.js`
  - `auth-overlay-template.js`
  - `auth-overlay-controller.js`
  - `auth-overlay-unified.css`
- auth script/style includes in entry shells (`index.html`, `manager/index.html`, `admin/index.html`, `leroyslounge/index.html`, `elroyscantina/index.html`)
- `api/_auth.js`
- `api/_supabase.js` for shared transport used by auth-adjacent routes
- `api/role.js`
- `api/users.js`

## Security Rules

- server-side enforcement is authoritative
- managers only access assigned menus
- admins can access all menus
- `_recoverySessionData` must stay out of `localStorage`
- do not reintroduce per-shell auth overlay markup or inline auth overlay CSS
- do not leak tokens, secrets, or role data through logs or storage shortcuts

## Workflow

1. Read the relevant client flow and server route together.
2. Trace the full lifecycle:
   - session acquisition
   - session restoration
   - recovery handling
   - role lookup
   - menu-access enforcement
   - UI gating
3. Preserve the intended auth screens and transitions.
4. Prefer explicit denial paths over silent fallback behavior.

## Useful Anchors

- `_tryHandleRecoveryCallback()`
- `_tryRestoreSession()`
- `_applySession()`
- `requestSignIn()`
- `/api/role`
- `/api/users`
- `requireRole()`
- `requireMenuAccess()`

## Output

Report:
- which auth or access path was traced
- the trust boundary involved
- the files touched
- any security-sensitive edge case that still needs manual testing
