# Leroy's Basement Marquee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/leroyslounge` public route shell into the approved basement-marquee split-board design without breaking the shared public runtime contract.

**Architecture:** Keep the existing `leroyslounge/app.js` adapter and shared `createPublicRouteCore()` contract intact while replacing the route-owned HTML shell and CSS system. Limit JS changes to adapter markup compatibility only; most work should live in `leroyslounge/index.html` and `leroyslounge/style.css`.

**Tech Stack:** Zero-dependency HTML, CSS, and vanilla JS on top of the existing shared public-route runtime

---

### Task 1: Lock The Existing Route Contract

**Files:**
- Modify: `leroyslounge/index.html`
- Modify: `leroyslounge/app.js`
- Verify: `routes/shared/public-route-core.js`

- [ ] **Step 1: Confirm the IDs and hooks that the route renderer must preserve**

Read:

```bash
sed -n '1,260p' /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/leroyslounge/app.js
sed -n '1,260p' /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/routes/shared/public-route-core.js
```

Expected: the implementation keeps `leroy-route-template`, `ll-route-main`, `ll-route-sections`, `ll-route-specials`, `ll-route-footer-timestamp`, `ll-route-footer-version`, and the route dropdown/footer action hooks intact.

- [ ] **Step 2: Rewrite the template structure around the approved split-board shell**

Update the template in `leroyslounge/index.html` so it keeps the same live-render targets but reorganizes the route shell into:

```html
<template id="leroy-route-template">
  <div class="ll-marquee-page">
    <a class="ll-skip-link" href="#ll-route-main">Skip to menu content</a>
    <div class="ll-marquee-shell">
      <section class="ll-marquee-rail">
        <!-- logo, menu toggle, route swap/settings, atmospheric copy -->
      </section>
      <main class="ll-board-main" id="ll-route-main" tabindex="-1">
        <!-- specials + sections -->
      </main>
    </div>
    <footer class="ll-board-footer">...</footer>
  </div>
</template>
```

- [ ] **Step 3: Keep adapter logic unchanged unless the new shell needs copy or class name adjustments**

If `leroyslounge/app.js` needs changes, keep them minimal and limited to shell-compatible output such as placeholder copy:

```js
emptyCategoriesHtml: '<p class="ll-route-empty">Nothing on the board right now.</p>',
loadingSpecialsHtml: '<p class="ll-route-boot-copy">Lighting the board…</p>',
```

- [ ] **Step 4: Verify the route adapter still parses**

Run:

```bash
node --check /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/leroyslounge/app.js
```

Expected: no syntax errors.

### Task 2: Replace The Visual Shell With The Basement Marquee System

**Files:**
- Modify: `leroyslounge/style.css`
- Reference: `docs/design/leroys-lounge-vibe.md`
- Reference: `docs/superpowers/specs/2026-04-19-leroys-basement-marquee-design.md`

- [ ] **Step 1: Replace the current neon-first custom properties with the approved warm marquee palette**

Update the top-level Leroy's route tokens in `leroyslounge/style.css` so they use tobacco, oxblood, walnut, brass, and nicotine-cream values instead of bright neon-led values:

```css
#restaurant-site-wrapper {
  --ll-board-surface: rgb(29 22 19 / 1);
  --ll-board-panel: rgb(49 35 28 / 0.9);
  --ll-board-panel-strong: rgb(93 30 21 / 0.94);
  --ll-board-ink: rgb(239 225 203 / 1);
  --ll-board-ink-muted: rgb(204 184 158 / 0.82);
  --ll-board-accent: rgb(186 140 76 / 1);
  --ll-board-rule: rgb(239 225 203 / 0.12);
  --ll-board-shadow: 0 24px 60px rgb(0 0 0 / 0.34);
}
```

- [ ] **Step 2: Build the new desktop split-board layout**

Add desktop layout rules that create a left marquee rail and a right live board:

```css
#restaurant-site-wrapper .ll-marquee-shell {
  display: grid;
  grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr);
  gap: 1.25rem;
  width: min(84rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: calc(1.25rem + var(--ll-safe-top)) calc(1rem + var(--ll-safe-right)) 2.5rem calc(1rem + var(--ll-safe-left));
}
```

- [ ] **Step 3: Style the marquee rail as the atmosphere-first anchor**

Create focused marquee rail styles for logo, toggle, route actions, and venue-copy block:

```css
#restaurant-site-wrapper .ll-marquee-rail {
  position: relative;
  display: grid;
  align-content: start;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgb(239 225 203 / 0.12);
  border-radius: 1.5rem;
  background:
    linear-gradient(180deg, rgb(104 29 22 / 0.94), rgb(56 22 18 / 0.94)),
    url('/assets/leroys-lounge/texture.png');
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), var(--ll-board-shadow);
}
```

- [ ] **Step 4: Redesign the live board sections and rows to feel quieter and more readable**

Retain the route item structure, but restyle rows, section headers, sold-out marks, details, and upcharges to fit the darker marquee system:

```css
#restaurant-site-wrapper .ll-slat-section {
  padding: 1.2rem 1.25rem 1rem;
  border: 1px solid var(--ll-board-rule);
  border-radius: 1.25rem;
  background: linear-gradient(180deg, rgb(59 43 34 / 0.88), rgb(35 26 22 / 0.92));
}

#restaurant-site-wrapper .ll-board-item-name.menu-item-name,
#restaurant-site-wrapper .ll-board-price.menu-item-price {
  font-family: 'Epilogue', sans-serif;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
```

- [ ] **Step 5: Replace loading, empty, footer, and dropdown visuals so all states match the redesign**

Update route skeleton rows, dropdown panels, footer controls, and empty-state copy styles so no old neon-board styling remains:

```css
#restaurant-site-wrapper .ll-route-boot-line {
  background: linear-gradient(90deg, rgb(239 225 203 / 0.06), rgb(239 225 203 / 0.22), rgb(239 225 203 / 0.06));
}

#restaurant-site-wrapper .ll-board-route-dropdown {
  border: 1px solid rgb(239 225 203 / 0.12);
  border-radius: 1rem;
  background: rgb(31 24 21 / 0.98);
}
```

### Task 3: Make The Responsive Collapse Intentional

**Files:**
- Modify: `leroyslounge/style.css`

- [ ] **Step 1: Collapse the desktop split layout into a single-column mobile stack**

Add mobile rules so the marquee rail stacks first and the live board follows immediately below:

```css
@media (max-width: 860px) {
  #restaurant-site-wrapper .ll-marquee-shell {
    grid-template-columns: 1fr;
    gap: 0.85rem;
    width: calc(100% - 0.75rem);
    padding: calc(0.75rem + var(--ll-safe-top)) calc(0.375rem + var(--ll-safe-right)) 1.5rem calc(0.375rem + var(--ll-safe-left));
  }
}
```

- [ ] **Step 2: Rebalance rail controls and row density for narrow widths**

Ensure menu toggles, swap/settings actions, footer actions, sold-out rows, and expanded details remain readable on phones:

```css
@media (max-width: 640px) {
  #restaurant-site-wrapper .ll-menu-toggle {
    width: 100%;
  }

  #restaurant-site-wrapper .ll-board-row {
    align-items: flex-start;
  }

  #restaurant-site-wrapper .ll-board-item-side {
    max-width: 44%;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}
```

- [ ] **Step 3: Preserve accessibility and motion safety in the new shell**

Keep the skip link, focus states, and reduced-motion behavior visible in the redesign:

```css
#restaurant-site-wrapper .ll-skip-link:focus-visible,
#restaurant-site-wrapper .ll-menu-toggle-btn:focus-visible,
#restaurant-site-wrapper .ll-board-footer-action:focus-visible {
  outline: 2px solid rgb(239 225 203 / 0.78);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  #restaurant-site-wrapper .ll-marquee-rail,
  #restaurant-site-wrapper .ll-board-route-dropdown,
  #restaurant-site-wrapper .ll-board-footer-action {
    transition: none;
  }
}
```

### Task 4: Verify The Route Before Closing

**Files:**
- Verify: `leroyslounge/index.html`
- Verify: `leroyslounge/style.css`
- Verify: `leroyslounge/app.js`

- [ ] **Step 1: Run syntax checks for the route files**

Run:

```bash
node --check /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/leroyslounge/app.js
node --check /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/app.js
```

Expected: both commands exit successfully with no output.

- [ ] **Step 2: Run the repo verification flow if available for route work**

Run:

```bash
rg -n "verify" /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/README.md /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/package.json /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/scripts /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/skills-lock.json
```

Expected: identify the lightest local verification command available; if none exists, record that verification was limited to syntax and manual inspection.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git diff -- /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/leroyslounge/index.html /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/leroyslounge/style.css /Users/lukestiehl/.codex/worktrees/1280/El-Roys-Drink-Menu/leroyslounge/app.js
```

Expected: diff only reflects the approved route-owned redesign and any minimal adapter support changes.
