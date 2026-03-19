---
name: project_supabase_migration
description: Documents the Supabase auth migration that replaced PIN-based access with email/password roles, and the shift to Vercel-required deployment for API routes
type: project
---

The app migrated from a PIN-based auth system (manager PIN / owner PIN) to Supabase email/password authentication with role-based access (`none`, `manager`, `admin`).

**Why:** PIN-based auth was replaced to support multi-user identity, role management, and server-side credential protection via Vercel API routes.

**Key architectural changes introduced:**
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are fetched at runtime via `/api/config` (Vercel serverless)
- `FIREBASE_SECRET` is a Vercel env var, served via `/api/firebase-config` — no longer entered in the UI
- Four Vercel API routes live in `/api/`: `config.js`, `role.js`, `firebase-config.js`, `send-groupme.js`
- Vercel is now the required host; GitHub Pages and plain static hosts do not support these routes
- New accounts start with `role: none`; first admin must be promoted via the Supabase dashboard directly

**How to apply:** Any future changes to auth, credential storage, or hosting assumptions must account for this architecture. Do not document or suggest PIN-based flows — they no longer exist.
