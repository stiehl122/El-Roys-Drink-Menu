---
name: map-architecture
description: Update `docs/architecture/current-flowchart.md` to match the latest tracked architecture across web, iOS, server, and data boundaries. Use when users ask to refresh architecture docs, verify client/server boundaries, or audit direct client-to-Supabase or client-to-external-service calls.
---

# Map Architecture

Use this skill when the user asks for the architecture map to be refreshed from
current tracked code, especially when boundary correctness matters.

## Ownership

- `docs/architecture/current-flowchart.md`

## Primary Goal

Keep the architecture flow chart accurate to the latest tracked repository
state and make boundary violations obvious.

The chart and notes must emphasize:

- web client boundaries
- iOS client boundaries
- server boundary (Vercel/API layer)
- data/service boundary (Supabase and other external services)
- whether any client directly calls Supabase or other external services

## Required Boundary Policy

- Preferred pattern: `client -> server -> Supabase/external service`
- Any direct `client -> Supabase` or `client -> external-service` path must be
  explicitly called out as a violation or exception in the doc notes.
- Do not hide violations inside ambiguous arrows. Label them clearly.

## Workflow

1. Sync architecture context from tracked code before editing the doc.
2. Inspect current client/service call paths in:
   - root `app.js` and route adapters under `leroyslounge/` and
     `elroyscantina/`
   - manager/admin shells and shared runtime entry points
   - iOS app sources under `ios/` (network clients, API wrappers, auth/session
     flows)
   - server handlers under `api/*.js`
3. Classify each observed path:
   - compliant (`client -> server -> service`)
   - violating (`client -> service`)
   - unknown (insufficient evidence; note explicitly)
4. Update Mermaid flow chart nodes and edges so boundaries are visually obvious.
5. Update the doc's narrative notes to summarize:
   - what is compliant today
   - what violates boundary policy today
   - where follow-up refactor work is needed
6. Keep wording factual and tied to current tracked files.

## Update Rules

- Treat tracked code as source of truth, not assumptions from past runs.
- Prefer concrete file/function references when describing violations.
- Keep the chart readable; avoid edge clutter and duplicate arrows.
- If uncertain, mark uncertainty explicitly instead of guessing.

## Output

Report:
- whether `docs/architecture/current-flowchart.md` was updated
- the major boundary changes reflected in the chart
- each direct client-to-service violation found, with file anchors
- any remaining unknowns that need manual confirmation
