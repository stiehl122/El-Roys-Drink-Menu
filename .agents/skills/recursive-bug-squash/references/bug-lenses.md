# Recursive Bug Lenses

Use this file at the start of every `recursive-bug-squash` run. Treat it as the
repo-specific checklist for suspicious seams that deserve extra skepticism.

## Shared Runtime Seams

- `app.js` is large and cross-cutting. Assume routing, auth, persistence, and
  manager/admin state can interact in surprising ways.
- Favor bug hypotheses around places where one surface delegates into another:
  route adapters, auth boundaries, session boundaries, public footer actions,
  preview/publish helpers, and fallback rendering.
- Silent catches, compatibility fallbacks, and branch-heavy glue code deserve
  extra suspicion.

## Public Routes

- route-first boot versus shared loading shell flash
- drinks / food route switching
- fallback rendering when route-owned rendering is unavailable
- footer version, timestamp, and `PREVIEW` badge consistency
- footer staff actions signed-out and signed-in
- 86'd item treatment and hidden uncategorized content

## Auth And Access

- footer-triggered sign-in entry
- auth overlay screen transitions
- manager versus admin denial paths
- assigned-menu gating for managers
- recovery and reset flows
- silent session-restore failures

## Manager And Admin

- manager drawer/menu switching
- add-item modal and category targeting
- scanner/manual lookup fallback paths
- save-draft versus save-live versus send-preview behavior
- admin switchers, user/access views, and settings subpanels
- keyboard dismissal and focus restoration around overlays

## Persistence And Menu State

- `Save` versus `Send Update` semantics
- unsent draft indicators and save-only changes
- category deletion into `__uncategorized__`
- last-sent snapshots and featured carryover
- poll/refresh stale-state behavior
- archived menu and missing-config fallbacks

## API And Error Paths

- auth/role/menu-access API boundaries
- notification gateway behavior when channels are disabled or misconfigured
- config delivery failures
- malformed or missing Supabase data
- partial-save / partial-send states

## Adversarial Questions

Ask these explicitly during the second audit when findings are suspiciously low:

- What breaks if the user is signed out right now?
- What breaks if the user has the wrong role right now?
- What breaks if the menu is empty, archived, or half-configured?
- What breaks if the user opens and closes the same modal repeatedly?
- What breaks if route state, URL state, and in-memory state disagree?
- What breaks if the footer actions are used from a public route instead of a
  settings shell?
- What breaks if a manager edits, saves, and then switches menus immediately?
- What breaks if there is a silent API error and the UI tries to keep going?
