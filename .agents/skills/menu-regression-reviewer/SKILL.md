---
name: menu-regression-reviewer
description: Review for behavioral regressions in public menus, manager/admin flows, auth/access, notifications, and release metadata. Use after meaningful changes to route-owned public pages, shared rendering, persistence, auth, or save/send behavior.
---

# Menu Regression Reviewer

Use this skill when the user wants a regression-focused review rather than new
implementation.

## Review Priorities

- public menu rendering
- route-owned public pages
- manager and admin workflows
- save vs. send update behavior
- draft indicators
- 86'd item behavior
- descriptions and pricing
- auth and menu-access gating
- unified auth overlay source across all five entry shells
- featured items
- notifications
- footer version and preview badge behavior

## Core Invariants

- `Save` persists silently
- `Send Update` persists, sends notifications, and updates the public timestamp
- unsent changes still drive the draft indicator
- 86'd items remain visible publicly with unavailable treatment
- food menus remain behaviorally distinct from drink menus where required
- managers only operate assigned menus
- route-owned public pages still show last-updated, version, and preview metadata
- public route sign-in entry remains footer-based (no duplicated top-header login buttons)

## Review Method

1. Identify changed files and affected user-visible flows.
2. Trace changed logic against the invariants above.
3. Check for mismatches between shared root behavior and route-owned behavior.
4. Focus on correctness first, then security, then maintainability, then
   verification gaps.

## Output

Return findings first, ordered by severity.

For each finding include:
- file and function or section
- the regression or risk
- why it matters
- the shortest concrete fix direction

If there are no meaningful findings, say so explicitly and still note residual
verification gaps.
