# Performance Lens

Primary owner for race conditions, unnecessary repeated work, and render/network cost on hot paths. Read `refactor-issues/README.md` first.

## Owned Flags

- `polling-loop-races-and-full-fetches`
- `public-render-rebuild-duplication`

## Flag: `polling-loop-races-and-full-fetches`

Severity: High

Merged findings:

- `poll-overlap`
- `poll-full-read`

Problem:

The shared polling loop can overlap async reads from interval ticks and visibility-resume events, and each cycle hydrates a full snapshot. A slow older poll can still land after a newer one, which mixes performance waste with stale-state risk.

Scope:

- Prevent overlapping poll hydration.
- Make visibility resume and interval polling sequence-safe.
- Reduce needless repeated full work where possible without changing correctness requirements.

Not in scope:

- Adding external caching layers
- Replacing polling with a new real-time stack

Key evidence:

- `app.js` -> `startPolling()`
- `app.js` -> `pollCycle`
- `app.js` -> `sbRead()`
- `app.js` -> `hydrateState()`

Acceptance criteria:

- Only one poll result can win at a time for a given active menu context.
- Visibility resume cannot race an already-running interval poll into stale hydration.
- Polling cost does not stay amplified by unconditional repeated full work when no effective state changed.

Coordination:

- Coordinate with `refactor-issues/behavior.md` so fallback and cache changes stay menu-correct.
- Coordinate with `refactor-issues/architecture.md` if the public render boundary changes the scheduler hooks.

## Flag: `public-render-rebuild-duplication`

Severity: High

Merged findings:

- `header-rebuild-public`
- `hidden-public-render`

Problem:

Same-route menu changes and shared helper flows trigger deterministic duplicate full public rerenders. Some shared helpers also rebuild hidden public state when no user-visible update is needed.

Scope:

- Ensure same-route menu switches render once through one intentional path.
- Stop helper layers from triggering duplicate full public renders.
- Avoid rebuilding hidden public shells unless the rebuild is required for correctness.

Not in scope:

- Visual redesign of public headers or route pages

Key evidence:

- `app.js` -> `selectMenu()`
- `app.js` -> `renderUserHeader()`
- `app.js` -> public picker/menu-switch flows
- `leroyslounge/app.js`
- `elroyscantina/app.js`

Acceptance criteria:

- Same-route menu switches do not perform deterministic duplicate full public rerenders.
- Shared helper flows use a visibility-aware public render path instead of directly forcing redundant rebuilds.
- Public rendering changes remain behaviorally consistent across both route-owned pages and shared fallback rendering.

Coordination:

- Work with `refactor-issues/architecture.md` because route-boundary cleanup is likely to change where the render scheduler lives.
