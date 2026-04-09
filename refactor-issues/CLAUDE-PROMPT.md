You are Claude working in `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu`.

Implement the refactor using the issue pack in `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues`.

Process:

1. Read `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/README.md` first and treat it as the source of truth for scope, dedupe, ownership, and constraints.
2. Spawn 6 parallel subagents, one per lens:
   - Behavior
   - Architecture
   - Performance
   - Maintainability
   - Security
   - UX-Design
3. Each subagent must read only:
   - `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/README.md`
   - its assigned lens file
4. Do not begin implementation for a lens until that subagent has read its file.
5. Keep ownership boundaries:
   - The lens file defines primary ownership.
   - A subagent may touch shared code outside its lens only when its lens file explicitly calls for coordination.
   - Do not implement the same merged root cause twice under different names.
6. Main thread owns integration, conflict resolution, final verification, and final summary.

Lens files:

- Behavior -> `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/behavior.md`
- Architecture -> `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/architecture.md`
- Performance -> `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/performance.md`
- Maintainability -> `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/maintainability.md`
- Security -> `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/security.md`
- UX-Design -> `/Users/lukestiehl/Documents/GitHub/El-Roys-Drink-Menu/refactor-issues/ux-design.md`

Required implementation order:

1. Fix the Critical shared-state/persistence/send issues first.
2. Fix authorization and information-leak issues that are direct blockers or coupled to the persistence work.
3. Stabilize the public-route/shared-runtime boundary.
4. Remove polling/render hot-path duplication and races introduced or exposed by the refactor.
5. Apply UX/accessibility follow-through in the touched flows.

Hard constraints:

- No dependencies, no bundler, no build step.
- Preserve the fixed domain model: exactly two restaurants and four menus.
- Preserve route-owned public pages.
- Preserve Save vs Send Update as explicit user-facing actions.
- Preserve Supabase auth and polling behavior unless the issue pack explicitly requires narrowing or sequencing them.
- Keep recovery-session data out of `localStorage`.
- Do not generalize into arbitrary restaurant/menu CRUD.

Implementation expectations:

- Prefer small explicit helpers and seams over large rewrites.
- Centralize shared contracts in `app.js` or small zero-dependency helpers where appropriate.
- Preserve restaurant-specific route visuals while unifying shared behavior.
- If the code contradicts the issue pack, trust the code and report the contradiction in the final summary.

Verification expectations:

- Test both public routes: `/leroyslounge` and `/elroyscantina`.
- Test both menu types: drinks and food.
- Test manager and admin flows separately.
- Test Save and Send Update separately, including partial-failure behavior.
- Test auth restore/recovery after any session-handling change.

Final deliverables:

- Implemented code changes
- Verification notes
- A final mapping of `issue flag -> files touched -> primary lens owner`
