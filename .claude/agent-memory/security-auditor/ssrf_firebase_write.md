---
name: SSRF fix in firebase-write.js
description: Issue #140 — SSRF allowing FIREBASE_SECRET exfiltration via client-controlled fbUrl was fixed by deriving the URL from FIREBASE_URL env var server-side
type: project
---

Issue #140: `/api/firebase-write.js` accepted a client-supplied `fbUrl` parameter and appended `FIREBASE_SECRET` to it in a server-side fetch. An authenticated manager/admin could exfiltrate the secret by pointing `fbUrl` to an attacker-controlled server.

**Fix (v0.5.5):** Firebase URL is now derived entirely from `process.env.FIREBASE_URL` on the server. The client no longer sends `fbUrl` in the request body.

**Why:** Any server-side fetch that includes a secret must never use a client-supplied URL — this is a textbook SSRF vector.

**How to apply:** When reviewing API routes, verify that no client-supplied parameter is used to construct outbound URLs that carry secrets. The `FIREBASE_URL` env var must be set in Vercel deployment config.
