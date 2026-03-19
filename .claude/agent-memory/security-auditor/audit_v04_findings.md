---
name: v0.4 Pre-Merge Security Audit Findings
description: Security audit findings from v0.4 branch pre-merge review on 2026-03-19 — tracks hardcoded Firebase URL, client-side secret exposure, dead code, and auth patterns
type: project
---

v0.4 security audit completed 2026-03-19. Key findings:

1. CRITICAL: Hardcoded Firebase RTDB URL in app.js:5 as fallback default — exposes production database URL in public repo
2. HIGH: Firebase secret (FB_SECRET) still delivered to client browser via /api/firebase-config and used in query params in fbWrite() — migration to server-side writes incomplete
3. MEDIUM: Dead code — loadLocalConfig() still fetches lib/config/notifications.json client-side; GroupMe sending already moved to /api/send-groupme server-side
4. MEDIUM: uid interpolated directly into Supabase REST URL in api/role.js and api/firebase-config.js without UUID format validation

**Why:** These represent the remaining attack surface after the Supabase auth migration. The Firebase secret client-side exposure is the most actionable — it means any manager-role user can extract the Firebase write secret from browser devtools.

**How to apply:** When reviewing future PRs on this branch, check whether Firebase writes have been moved server-side and whether the hardcoded RTDB URL has been removed. The loadLocalConfig dead code should be cleaned up.
