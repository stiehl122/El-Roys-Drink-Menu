---
name: project_supabase_migration
description: Documents the Supabase auth migration that replaced PIN-based access with email/password roles (and later Google OAuth + SMS OTP), and the shift to Vercel-required deployment for API routes
type: project
---

The app migrated from a PIN-based auth system (manager PIN / owner PIN) to Supabase authentication with role-based access (`none`, `manager`, `admin`). As of v0.5.4, three sign-in methods are supported: email/password, Google OAuth (PKCE redirect, no SDK), and SMS OTP (Supabase Phone provider + Twilio).

**Why:** PIN-based auth was replaced to support multi-user identity, role management, and server-side credential protection via Vercel API routes.

**Key architectural changes (current as of v0.5.5):**
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are fetched at runtime via `/api/config` (Vercel serverless)
- `FIREBASE_SECRET` and `FIREBASE_URL` are Vercel env vars — the Firebase URL is read server-side only by `/api/firebase-write` (SSRF-safe; client never supplies it)
- `firebase-config.js` was replaced by `firebase-write.js`; a shared `_auth.js` middleware was extracted
- Five Vercel API routes live in `/api/`: `_auth.js` (shared middleware), `config.js`, `role.js`, `firebase-write.js`, `send-groupme.js`
- Vercel is the required host; GitHub Pages and plain static hosts do not support these routes
- New accounts start with `role: none`; first admin must be promoted via the Supabase dashboard directly

**How to apply:** Any future changes to auth, credential storage, or hosting assumptions must account for this architecture. Do not document or suggest PIN-based flows — they no longer exist. When documenting Firebase writes, always note both `FIREBASE_SECRET` and `FIREBASE_URL` as required env vars.
