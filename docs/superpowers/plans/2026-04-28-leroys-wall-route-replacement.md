# Leroy's Wall Route Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/leroyslounge` with the approved wall-board design while preserving the shared public route core behavior.

**Architecture:** Keep the shared route core intact and change only the Leroy route template, route adapter rendering, route CSS, copied route assets, and route-specific boundary tests. The production route will reference copied assets under `/assets/leroys-lounge/wall/`, render live menu data through `createPublicRouteCore`, and keep existing footer auth/timestamp/version contracts.

**Tech Stack:** Plain HTML, CSS, JavaScript, Node.js `node:test`, no dependencies, no bundler.

---

## File Structure

- Create: `assets/leroys-lounge/wall/`
  - Holds approved production copies of wall/sign assets from `prototypes/leroyslounge-wall-test/assets/`.
- Modify: `leroyslounge/index.html`
  - Replaces the current route template chrome with wall-board markup.
  - Keeps fallback app shell, shared auth overlay loading, footer staff data attributes, and public route template id.
- Modify: `leroyslounge/app.js`
  - Keeps `createPublicRouteCore`.
  - Adapts live menu data into wall-board rows/categories.
  - Renders Food weekly special strip with fallback text.
  - Suppresses specials strip for Drinks.
- Modify: `leroyslounge/style.css`
  - Replaces current Stitch-style route CSS with scoped wall-board styling adapted from the approved prototype.
  - Keeps route user chip, dropdown, footer action, and fallback chip selectors used by existing tests/shared runtime.
- Create: `tests/leroys-wall-route.test.cjs`
  - Boundary coverage for asset references, link destinations, special fallback behavior, no Drinks specials, sold-out label, footer actions, and desktop/mobile CSS requirements.
- Existing tests to run:
  - `tests/phase15-auth-unification-complete.test.cjs`
  - `tests/user-chip-route-reimplementation.test.cjs`
  - `tests/phase21-route-header-scroll-boundaries.test.cjs`
  - `tests/phase23-logo-branding-boundaries.test.cjs`
  - `tests/public-launch-surface.test.cjs`
  - `tests/architecture-boundaries.test.cjs`

---

### Task 1: Add Production Wall Assets

**Files:**
- Create: `assets/leroys-lounge/wall/leroys-wall-background.png`
- Create: `assets/leroys-lounge/wall/leroys-horizontal-wood-sign.png`
- Create: `assets/leroys-lounge/wall/leroys-established-sign.png`
- Create: `assets/leroys-lounge/wall/leroys-ice-cold-beer-sign.png`
- Create: `assets/leroys-lounge/wall/leroys-pool-free-play-sign.png`
- Create: `assets/leroys-lounge/wall/leroys-pull-tabs-sign.png`
- Create: `assets/leroys-lounge/wall/leroys-thumbs-up-panel.png`
- Create: `assets/leroys-lounge/wall/leroys-michigan-plate.png`
- Create: `assets/leroys-lounge/wall/leroys-margarita-note.png`

- [ ] **Step 1: Copy approved assets into the production folder**

Run:

```bash
mkdir -p assets/leroys-lounge/wall
cp prototypes/leroyslounge-wall-test/assets/leroys-wall-background.png assets/leroys-lounge/wall/leroys-wall-background.png
cp prototypes/leroyslounge-wall-test/assets/leroys-horizontal-wood-sign.png assets/leroys-lounge/wall/leroys-horizontal-wood-sign.png
cp prototypes/leroyslounge-wall-test/assets/leroys-established-sign.png assets/leroys-lounge/wall/leroys-established-sign.png
cp prototypes/leroyslounge-wall-test/assets/leroys-ice-cold-beer-sign.png assets/leroys-lounge/wall/leroys-ice-cold-beer-sign.png
cp prototypes/leroyslounge-wall-test/assets/leroys-pool-free-play-sign.png assets/leroys-lounge/wall/leroys-pool-free-play-sign.png
cp prototypes/leroyslounge-wall-test/assets/leroys-pull-tabs-sign.png assets/leroys-lounge/wall/leroys-pull-tabs-sign.png
cp prototypes/leroyslounge-wall-test/assets/leroys-thumbs-up-panel.png assets/leroys-lounge/wall/leroys-thumbs-up-panel.png
cp prototypes/leroyslounge-wall-test/assets/leroys-michigan-plate.png assets/leroys-lounge/wall/leroys-michigan-plate.png
cp prototypes/leroyslounge-wall-test/assets/leroys-margarita-note.png assets/leroys-lounge/wall/leroys-margarita-note.png
```

Expected: all nine files exist under `assets/leroys-lounge/wall/`.

- [ ] **Step 2: Verify asset copies**

Run:

```bash
test -f assets/leroys-lounge/wall/leroys-wall-background.png
test -f assets/leroys-lounge/wall/leroys-horizontal-wood-sign.png
test -f assets/leroys-lounge/wall/leroys-established-sign.png
test -f assets/leroys-lounge/wall/leroys-ice-cold-beer-sign.png
test -f assets/leroys-lounge/wall/leroys-pool-free-play-sign.png
test -f assets/leroys-lounge/wall/leroys-pull-tabs-sign.png
test -f assets/leroys-lounge/wall/leroys-thumbs-up-panel.png
test -f assets/leroys-lounge/wall/leroys-michigan-plate.png
test -f assets/leroys-lounge/wall/leroys-margarita-note.png
```

Expected: command exits `0`.

- [ ] **Step 3: Commit assets**

Run:

```bash
git add assets/leroys-lounge/wall
git commit -m "Add Leroy's wall route assets"
```

Expected: commit succeeds and includes only files under `assets/leroys-lounge/wall/`.

---

### Task 2: Add Wall Route Boundary Tests

**Files:**
- Create: `tests/leroys-wall-route.test.cjs`

- [ ] **Step 1: Write failing boundary tests**

Create `tests/leroys-wall-route.test.cjs` with:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

test("leroy's wall route references approved production assets and links", () => {
  const html = read('leroyslounge/index.html');
  const css = read('leroyslounge/style.css');

  [
    'leroys-wall-background.png',
    'leroys-horizontal-wood-sign.png',
    'leroys-established-sign.png',
    'leroys-ice-cold-beer-sign.png',
    'leroys-pool-free-play-sign.png',
    'leroys-pull-tabs-sign.png',
    'leroys-thumbs-up-panel.png',
    'leroys-michigan-plate.png',
    'leroys-margarita-note.png',
  ].forEach(filename => {
    assert.equal(exists(`assets/leroys-lounge/wall/${filename}`), true, `${filename} must exist`);
  });

  assert.match(css, /url\(["']?\/assets\/leroys-lounge\/wall\/leroys-wall-background\.png["']?\)/);
  assert.match(html, /class="ll-wall-brand-link"[\s\S]*href="\/"/);
  assert.match(html, /src="\/assets\/leroys-lounge\/wall\/leroys-horizontal-wood-sign\.png"/);
  assert.match(html, /href="\/elroyscantina\?menu=drinks"[\s\S]*class="ll-wall-note-link"/);
  assert.match(html, /href="https:\/\/www\.michiganlottery\.com\/resources\/pull-tabs-prizes-remaining"[\s\S]*class="ll-wall-pull-tabs-link"/);
});

test("leroy's wall route keeps public footer and auth boundaries", () => {
  const html = read('leroyslounge/index.html');

  assert.match(html, /id="leroy-route-template"/);
  assert.match(html, /data-route-footer-actions/);
  assert.match(html, /data-route-footer-signin/);
  assert.match(html, /data-route-footer-manager/);
  assert.match(html, /data-route-footer-admin/);
  assert.match(html, /data-route-footer-signout/);
  assert.match(html, /id="ll-route-footer-timestamp"/);
  assert.match(html, /id="ll-route-footer-version"/);
  assert.equal(html.includes('data-route-signin'), false, 'route must not reintroduce top sign-in');
  assert.equal(html.includes('data-auth-origin="route-header"'), false, 'route must not reintroduce header auth');
});

test("leroy's route adapter renders wall menu states", () => {
  const source = read('leroyslounge/app.js');

  assert.match(source, /LEROYS_SPECIAL_EMPTY\s*=\s*"Leroy doesn't have anything special cooking up this week"/);
  assert.match(source, /function\s+isFoodMenu\s*\(/);
  assert.match(source, /function\s+buildWeeklySpecialHtml\s*\(/);
  assert.match(source, /function\s+buildEmptyWeeklySpecialHtml\s*\(/);
  assert.match(source, /sharedState\.menuType\s*!==\s*'food'/);
  assert.match(source, /class="ll-wall-special-price"/);
  assert.match(source, />Sold Out</);
  assert.match(source, /emptyCategoriesHtml:\s*'<p class="ll-wall-empty">Nothing on the menu yet.<\/p>'/);
});

test("leroy's wall css keeps route scope, desktop side signs, and mobile hiding", () => {
  const css = read('leroyslounge/style.css');

  assert.match(css, /#restaurant-site-wrapper\s+\.ll-board-topbar\s*{[\s\S]*?position:\s*relative;/);
  assert.match(css, /#restaurant-site-wrapper\s+\.ll-wall-page/);
  assert.match(css, /#restaurant-site-wrapper\s+\.ll-wall-stage\s*{[\s\S]*?grid-template-columns:\s*minmax\(155px,\s*215px\)\s+minmax\(0,\s*760px\)\s+minmax\(155px,\s*215px\)/);
  assert.match(css, /@media\s*\(max-width:\s*1120px\)\s*{[\s\S]*?\.ll-wall-signs\s*{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.ll-board-userchip-trigger/);
  assert.match(css, /\.ll-board-userdropdown\.ll-site-userdropdown/);
  assert.doesNotMatch(css, /\.ll-board-page\.is-mobile-compact/);
});
```

- [ ] **Step 2: Run the new tests to verify they fail before implementation**

Run:

```bash
node --test tests/leroys-wall-route.test.cjs
```

Expected: FAIL because the current production route still references the old template/CSS and the new tests expect wall assets/markup.

- [ ] **Step 3: Commit the failing tests**

Run:

```bash
git add tests/leroys-wall-route.test.cjs
git commit -m "Add Leroy's wall route boundary tests"
```

Expected: commit succeeds with the failing test file only.

---

### Task 3: Replace Leroy Route Template With Wall Markup

**Files:**
- Modify: `leroyslounge/index.html`

- [ ] **Step 1: Replace only the `<template id="leroy-route-template">` contents**

Keep the `<template id="leroy-route-template">` wrapper itself. Replace its inner HTML with:

```html
  <div class="ll-wall-page">
    <a class="ll-skip-link" href="#ll-route-main">Skip to menu content</a>

    <header class="ll-board-topbar ll-wall-sign-wrap" aria-label="Leroy's Lounge">
      <img class="ll-wall-location-sign" src="/assets/leroys-lounge/wall/leroys-established-sign.png" alt="EST. 2024, Fenton, MI" width="1680" height="916">
      <a class="ll-wall-brand-link" href="/" aria-label="Return to the restaurant chooser">
        <img class="ll-wall-brand-sign" src="/assets/leroys-lounge/wall/leroys-horizontal-wood-sign.png" alt="Leroy's Lounge" width="2000" height="880">
      </a>
      <img class="ll-wall-beer-sign" src="/assets/leroys-lounge/wall/leroys-ice-cold-beer-sign.png" alt="Ice Cold Beer Served Here" width="1680" height="916">
    </header>

    <section class="ll-wall-stage" aria-label="Leroy's Lounge menu">
      <aside class="ll-wall-signs ll-wall-signs--left" aria-label="Left wall signs">
        <img class="ll-wall-side-image ll-wall-side-image--pool" src="/assets/leroys-lounge/wall/leroys-pool-free-play-sign.png" alt="Pool Free Play" width="1680" height="916">
        <a class="ll-wall-side-link ll-wall-pull-tabs-link" href="https://www.michiganlottery.com/resources/pull-tabs-prizes-remaining" target="_blank" rel="noopener noreferrer" aria-label="Open Michigan Lottery pull tabs prizes remaining">
          <img class="ll-wall-side-image ll-wall-side-image--pull-tabs" src="/assets/leroys-lounge/wall/leroys-pull-tabs-sign.png" alt="Pull Tabs Sold Here" width="1680" height="916">
        </a>
        <img class="ll-wall-side-image ll-wall-side-image--leroy" src="/assets/leroys-lounge/wall/leroys-thumbs-up-panel.png" alt="Wood etched Leroy giving a thumbs up" width="1680" height="916">
      </aside>

      <section class="ll-wall-menu-panel">
        <div class="ll-wall-menu-toggle" role="group" aria-label="Choose menu">
          <h1 id="ll-route-menu-name" class="ll-visually-hidden">Leroy's Lounge Menu</h1>
          <button class="ll-wall-menu-tab" id="ll-nav-food" type="button" data-route-menu-toggle="food">Food</button>
          <button class="ll-wall-menu-tab" id="ll-nav-drinks" type="button" data-route-menu-toggle="drinks">Drinks</button>
        </div>

        <main class="ll-wall-menu-board" id="ll-route-main" tabindex="-1" aria-live="polite">
          <section id="ll-route-specials" class="ll-wall-specials-region" aria-label="Weekly special"></section>
          <div id="ll-route-sections" class="ll-wall-sections"></div>
        </main>

        <footer class="ll-wall-route-footer">
          <p class="ll-wall-footer-meta">
            <span id="ll-route-footer-version"></span>
            <span aria-hidden="true"> · </span>
            <span>Menu board draft</span>
            <span aria-hidden="true"> · </span>
            <span id="ll-route-footer-timestamp">Awaiting first update</span>
          </p>
          <div class="ll-wall-footer-actions" data-route-footer-actions>
            <a class="ll-wall-footer-action" href="/elroyscantina">El Roy's</a>
            <button class="ll-wall-footer-action" type="button" data-route-footer-signin>Staff Sign-In</button>
            <button class="ll-wall-footer-action" type="button" data-route-footer-manager style="display:none">Manager</button>
            <button class="ll-wall-footer-action" type="button" data-route-footer-admin style="display:none">Admin</button>
            <button class="ll-wall-footer-action" type="button" data-route-footer-signout style="display:none">Sign Out</button>
          </div>
          <div class="ll-wall-route-dropdown" id="ll-route-settings-dropdown" data-route-dropdown-panel hidden></div>
        </footer>

        <div class="ll-board-userchip ll-site-userchip" data-route-user-chip data-user-chip data-user-chip-scope="route" data-user-chip-variant="board" data-user-chip-theme="leroys" style="display:none">
          <button class="ll-board-userchip-trigger" type="button" data-user-chip-trigger aria-haspopup="true" aria-expanded="false" aria-label="User menu" onclick="toggleUserDropdown(this)">
            <span class="material-symbols-outlined ll-board-usericon" aria-hidden="true">account_circle</span>
            <span class="material-symbols-outlined ll-board-usercaret" aria-hidden="true">keyboard_arrow_down</span>
          </button>
          <div class="ll-board-userdropdown ll-site-userdropdown" data-user-chip-panel onclick="event.stopPropagation()">
            <div class="user-dropdown-name" data-user-chip-name></div>
            <div class="user-dropdown-role" data-user-chip-role></div>
            <div class="user-dropdown-divider"></div>
            <button class="user-dropdown-signout" onclick="event.stopPropagation(); signOut()">Sign Out</button>
          </div>
          <span data-user-chip-initials hidden>?</span>
        </div>
      </section>

      <aside class="ll-wall-signs ll-wall-signs--right" aria-label="Right wall signs">
        <img class="ll-wall-side-image ll-wall-side-image--plate" src="/assets/leroys-lounge/wall/leroys-michigan-plate.png" alt="Michigan license plate reading LER0YS" width="1680" height="916">
        <a class="ll-wall-side-link ll-wall-note-link" href="/elroyscantina?menu=drinks" aria-label="Open El Roy's drink menu">
          <img class="ll-wall-side-image ll-wall-side-image--note" src="/assets/leroys-lounge/wall/leroys-margarita-note.png" alt="Handwritten note: Try my famous margaritas upstairs. Thanks, Leroy." width="1680" height="916">
        </a>
      </aside>
    </section>
  </div>
```

- [ ] **Step 2: Preserve the rest of `leroyslounge/index.html`**

Do not remove:

```html
<div class="wrapper" id="app-shell">
```

Do not remove the fallback route chip:

```html
<div class="public-fallback-userchip user-chip" data-user-chip data-user-chip-scope="fallback" data-user-chip-variant="fallback" data-user-chip-theme="fallback" style="display:none">
```

Do not change script tags or auth overlay stylesheet/script loading.

- [ ] **Step 3: Run template boundary tests**

Run:

```bash
node --test tests/phase15-auth-unification-complete.test.cjs tests/user-chip-route-reimplementation.test.cjs tests/leroys-wall-route.test.cjs
```

Expected: auth/user-chip tests pass; `tests/leroys-wall-route.test.cjs` may still fail on CSS and app adapter assertions until later tasks.

- [ ] **Step 4: Commit template changes**

Run:

```bash
git add leroyslounge/index.html
git commit -m "Replace Leroy's route template with wall scene"
```

Expected: commit succeeds with only `leroyslounge/index.html`.

---

### Task 4: Adapt Leroy Route Rendering

**Files:**
- Modify: `leroyslounge/app.js`

- [ ] **Step 1: Add constants and helpers near the top of `bootstrapLeroysRoute` after `esc`**

Insert:

```javascript
  const LEROYS_SPECIAL_EMPTY = "Leroy doesn't have anything special cooking up this week";

  function isFoodMenu(sharedState) {
    return String(sharedState?.menuType || '').toLowerCase() === 'food';
  }

  function normalizedPrice(item) {
    const price = String(item?.price || '').trim();
    if (!price) return '';
    return price.startsWith('$') ? price : `$${price}`;
  }
```

- [ ] **Step 2: Replace `buildItemHtml` with wall row markup**

Replace the existing `buildItemHtml` function with:

```javascript
  function buildItemHtml(item, badgeText = '') {
    const is86 = !!item?.eightySixed;
    const desc = item?.showDescription === false ? '' : String(item?.desc || '').trim();
    const recipe = item?.showRecipe ? recipeParts(item?.recipe) : [];
    const upcharges = itemUpcharges(item?.upcharges);
    const hasDesc = !!desc;
    const hasRecipe = recipe.length > 0;
    const hasDetail = hasDesc || hasRecipe;
    const toggleHandler = hasDetail ? ' onclick="togglePublicDesc(this.closest(\'.menu-item\'))"' : '';
    const expandIcon = hasDetail
      ? `<span class="material-symbols-outlined item-expand-icon ll-wall-expand" role="button" tabindex="0" aria-label="Show description" aria-expanded="false" onclick="event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();togglePublicDesc(this.closest('.menu-item'))}">expand_more</span>`
      : '';
    const detailSections = [
      hasDesc ? `<div class="ll-wall-detail-group"><div class="ll-wall-detail-label">Description</div><p class="ll-wall-item-desc menu-item-desc">${esc(desc)}</p></div>` : '',
      hasRecipe ? `<div class="ll-wall-detail-group ll-wall-detail-group--recipe"><div class="ll-wall-detail-label">Recipe</div><p class="ll-wall-item-desc menu-item-desc">${esc(recipe.join(', '))}</p></div>` : '',
    ].join('');
    const upchargesHtml = upcharges.length
      ? `<div class="ll-wall-upcharges">${upcharges.map(upcharge => `<span class="ll-wall-upcharge">${esc(upcharge.label || 'Upcharge')}${upcharge.price ? ` <strong>${esc(upcharge.price)}</strong>` : ''}</span>`).join('')}</div>`
      : '';
    const price = normalizedPrice(item);

    return `<article class="ll-wall-menu-row menu-item${hasDetail ? ' has-detail' : ''}${is86 ? ' menu-item-86d is-sold-out' : ''}">
      <div class="ll-wall-row${hasDetail ? ' ll-wall-row--expandable' : ''}"${toggleHandler}>
        <div class="ll-wall-item-main">
          <div class="ll-wall-item-name-wrap">
            <h3 class="ll-wall-item-name menu-item-name">${esc(item?.name)}</h3>
            ${badgeText ? `<span class="ll-wall-chip">${esc(badgeText)}</span>` : ''}
          </div>
          ${desc ? `<p class="ll-wall-item-summary">${esc(desc)}</p>` : ''}
          ${upchargesHtml}
        </div>
        <div class="ll-wall-item-side">
          ${is86 ? '<span class="ll-wall-sold-out sold-out">Sold Out</span>' : ''}
          ${price ? `<strong class="ll-wall-price menu-item-price">${esc(price)}</strong>` : ''}
          ${expandIcon}
        </div>
      </div>
      ${hasDetail ? `<div class="ll-wall-detail item-detail-panel"><div class="ll-wall-detail-copy">${detailSections}</div></div>` : ''}
    </article>`;
  }
```

- [ ] **Step 3: Add weekly special builders before `buildFeaturedHtml`**

Insert:

```javascript
  function buildEmptyWeeklySpecialHtml() {
    return `<article class="ll-wall-specials-strip ll-wall-specials-strip--empty">
      <div>
        <p class="ll-wall-strip-kicker">Weekly Special</p>
        <h2>${esc(LEROYS_SPECIAL_EMPTY)}</h2>
      </div>
    </article>`;
  }

  function buildWeeklySpecialHtml(item) {
    const desc = item?.showDescription === false ? '' : String(item?.desc || '').trim();
    const price = normalizedPrice(item);
    return `<article class="ll-wall-specials-strip" aria-labelledby="ll-weekly-special-title">
      <div>
        <p class="ll-wall-strip-kicker">Weekly Special</p>
        <h2 id="ll-weekly-special-title">${esc(item?.name || LEROYS_SPECIAL_EMPTY)}</h2>
      </div>
      ${desc ? `<p>${esc(desc)}</p>` : '<p></p>'}
      ${price ? `<strong class="ll-wall-special-price">${esc(price)}</strong>` : ''}
    </article>`;
  }
```

- [ ] **Step 4: Replace `buildFeaturedHtml`**

Replace the existing `buildFeaturedHtml` with:

```javascript
  function buildFeaturedHtml(sharedState) {
    if (!isFoodMenu(sharedState)) return '';
    const featuredItems = Array.isArray(sharedState.featuredItems)
      ? sharedState.featuredItems.filter(item => item && item.onMenu !== false && item.visibility !== 'off_menu')
      : [];
    if (!featuredItems.length) return buildEmptyWeeklySpecialHtml();
    return buildWeeklySpecialHtml(featuredItems[0]);
  }
```

- [ ] **Step 5: Replace `buildCategoryHtml`**

Replace the existing `buildCategoryHtml` with:

```javascript
  function buildCategoryHtml(sharedState, category) {
    const items = getVisibleItems(sharedState.menuState, category.id);
    if (!items.length) return '';
    return `<section class="ll-wall-category menu-category" data-category="${esc(category.id)}">
      <div class="ll-wall-category-title">
        <h2>${esc(category.title)}</h2>
      </div>
      <div class="ll-wall-category-rows">${items.map(item => buildItemHtml(item)).join('')}</div>
    </section>`;
  }
```

- [ ] **Step 6: Replace `buildMenuSwitchPlaceholder`**

Replace the existing `buildMenuSwitchPlaceholder` with:

```javascript
  function buildMenuSwitchPlaceholder() {
    return `
      <section class="ll-wall-category ll-wall-route-switch-section" aria-hidden="true">
        <div class="ll-wall-category-title">
          <h2>Loading menu</h2>
        </div>
        <div class="ll-wall-boot-rows">
          <span class="ll-wall-boot-line ll-wall-boot-line--wide"></span>
          <span class="ll-wall-boot-line ll-wall-boot-line--mid"></span>
          <span class="ll-wall-boot-line ll-wall-boot-line--narrow"></span>
        </div>
      </section>
    `;
  }
```

- [ ] **Step 7: Replace `renderSwapDropdown` with a footer-safe no-op**

Replace the existing `renderSwapDropdown` with:

```javascript
  function renderSwapDropdown() {
    // The wall route uses the Food/Drinks board tabs instead of a separate swap dropdown.
  }
```

- [ ] **Step 8: Update `createPublicRouteCore` adapter options**

In the `createPublicRouteCore` call, set these values:

```javascript
    pageSelector: '.ll-wall-page',
    mainId: 'll-route-main',
    sectionsId: 'll-route-sections',
    statusTimestampId: '',
    footerTimestampId: 'll-route-footer-timestamp',
    footerVersionId: 'll-route-footer-version',
    specialsId: 'll-route-specials',
    menuNameId: 'll-route-menu-name',
    menuNameFallback: "Leroy's Lounge",
    settingsDropdownId: 'll-route-settings-dropdown',
    settingsOptionClass: 'll-wall-route-option',
    settingsLabelClass: 'll-wall-route-option-label',
    settingsIconClass: 'material-symbols-outlined ll-wall-route-option-icon',
    emptyCategoriesHtml: '<p class="ll-wall-empty">Nothing on the menu yet.</p>',
    loadingSpecialsHtml: '<p class="ll-wall-boot-copy">Loading specials...</p>',
```

- [ ] **Step 9: Run route adapter tests and syntax check**

Run:

```bash
node --check leroyslounge/app.js
node --test tests/leroys-wall-route.test.cjs tests/architecture-boundaries.test.cjs
```

Expected: `node --check` passes; new Leroy wall tests pass except possible CSS assertions until Task 5; architecture tests pass.

- [ ] **Step 10: Commit route adapter**

Run:

```bash
git add leroyslounge/app.js
git commit -m "Render Leroy's live menu in wall board"
```

Expected: commit succeeds with only `leroyslounge/app.js`.

---

### Task 5: Replace Leroy Route CSS With Scoped Wall Design

**Files:**
- Modify: `leroyslounge/style.css`

- [ ] **Step 1: Replace `leroyslounge/style.css` with scoped wall CSS**

Replace the current file with CSS adapted from the prototype. Start with the production-scoped selectors below and keep all declarations under `#restaurant-site-wrapper` unless the selector is the public fallback chip:

```css
#restaurant-site-wrapper {
  --ll-wall-black: #080504;
  --ll-wall-brown: #20120a;
  --ll-wall-board: #16110d;
  --ll-wall-paper: #e9d4a7;
  --ll-wall-paper-dim: #c6a975;
  --ll-wall-ink: #f4e0b7;
  --ll-wall-ink-muted: rgba(244, 224, 183, 0.72);
  --ll-wall-brass: #b68438;
  --ll-wall-red: #b43524;
  --ll-wall-shadow: rgba(0, 0, 0, 0.58);
  --ll-wall-sans: "Barlow Condensed", "Arial Narrow", Arial, sans-serif;
  --ll-wall-slab: "Roboto Slab", Georgia, serif;
  --ll-wall-stencil: "Stardos Stencil", "Roboto Slab", Georgia, serif;
}

#restaurant-site-wrapper .ll-wall-page {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  padding: clamp(10px, 2vw, 18px) 14px 14px;
  color: var(--ll-wall-ink);
  font-family: var(--ll-wall-sans);
  background:
    radial-gradient(circle at 52% 12%, rgba(211, 105, 31, 0.12), transparent 24rem),
    linear-gradient(90deg, rgba(0, 0, 0, 0.42), transparent 24%, transparent 76%, rgba(0, 0, 0, 0.42)),
    url("/assets/leroys-lounge/wall/leroys-wall-background.png") center/cover no-repeat,
    repeating-linear-gradient(90deg, #190d07 0 8px, #241309 8px 52px, #1c0f08 52px 58px);
}

#restaurant-site-wrapper .ll-wall-page::before,
#restaurant-site-wrapper .ll-wall-page::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
}

#restaurant-site-wrapper .ll-wall-page::before {
  opacity: 0.14;
  background:
    repeating-linear-gradient(0deg, transparent 0 5px, rgba(255, 255, 255, 0.08) 5px 6px),
    repeating-linear-gradient(90deg, transparent 0 29px, rgba(0, 0, 0, 0.26) 29px 31px);
  mix-blend-mode: soft-light;
}

#restaurant-site-wrapper .ll-wall-page::after {
  background: radial-gradient(circle at 50% 58%, transparent 0 42%, rgba(0, 0, 0, 0.58) 100%);
}

#restaurant-site-wrapper .ll-skip-link,
#restaurant-site-wrapper .ll-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

#restaurant-site-wrapper .ll-skip-link:focus {
  z-index: 20;
  width: auto;
  height: auto;
  clip: auto;
  left: 16px;
  top: 16px;
  padding: 10px 12px;
  background: #fff2cf;
  color: #130b07;
}

#restaurant-site-wrapper .ll-board-topbar {
  position: relative;
}

#restaurant-site-wrapper .ll-wall-sign-wrap {
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(110px, 0.34fr) minmax(260px, 520px) minmax(120px, 0.38fr);
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 2vw, 24px);
  width: min(1320px, 100%);
  margin: 0 auto clamp(4px, 1vw, 8px);
}

#restaurant-site-wrapper .ll-wall-location-sign,
#restaurant-site-wrapper .ll-wall-brand-sign,
#restaurant-site-wrapper .ll-wall-beer-sign,
#restaurant-site-wrapper .ll-wall-side-image {
  display: block;
  height: auto;
}

#restaurant-site-wrapper .ll-wall-location-sign {
  justify-self: end;
  width: clamp(112px, 14vw, 178px);
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.42));
}

#restaurant-site-wrapper .ll-wall-brand-link {
  justify-self: center;
  display: block;
  width: min(520px, 100%);
  border-radius: 4px;
}

#restaurant-site-wrapper .ll-wall-brand-link:focus-visible,
#restaurant-site-wrapper .ll-wall-side-link:focus-visible,
#restaurant-site-wrapper .ll-wall-footer-action:focus-visible,
#restaurant-site-wrapper .ll-wall-menu-tab:focus-visible {
  outline: 2px solid #ffe5a7;
  outline-offset: 4px;
}

#restaurant-site-wrapper .ll-wall-brand-sign {
  width: 100%;
  filter:
    drop-shadow(0 14px 26px rgba(0, 0, 0, 0.62))
    drop-shadow(0 0 22px rgba(240, 130, 42, 0.2));
}

#restaurant-site-wrapper .ll-wall-beer-sign {
  justify-self: start;
  width: clamp(128px, 17vw, 220px);
  filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.42));
  transform: rotate(1.5deg);
}

#restaurant-site-wrapper .ll-wall-stage {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(155px, 215px) minmax(0, 760px) minmax(155px, 215px);
  justify-content: center;
  align-items: start;
  gap: clamp(10px, 2vw, 24px);
  width: min(1320px, 100%);
  margin: 0 auto;
}
```

Continue by porting the remaining prototype CSS to the new class names:

- `.wall-signs` becomes `#restaurant-site-wrapper .ll-wall-signs`
- `.wall-signs--left` becomes `#restaurant-site-wrapper .ll-wall-signs--left`
- `.wall-signs--right` becomes `#restaurant-site-wrapper .ll-wall-signs--right`
- `.side-image-sign` becomes `#restaurant-site-wrapper .ll-wall-side-image`
- `.menu-panel` becomes `#restaurant-site-wrapper .ll-wall-menu-panel`
- `.menu-toggle` becomes `#restaurant-site-wrapper .ll-wall-menu-toggle`
- `.menu-tab` becomes `#restaurant-site-wrapper .ll-wall-menu-tab`
- `.menu-board` becomes `#restaurant-site-wrapper .ll-wall-menu-board`
- `.specials-strip` becomes `#restaurant-site-wrapper .ll-wall-specials-strip`
- `.strip-kicker` becomes `#restaurant-site-wrapper .ll-wall-strip-kicker`
- `.special-price` becomes `#restaurant-site-wrapper .ll-wall-special-price`
- `.category` becomes `#restaurant-site-wrapper .ll-wall-category`
- `.category-title` becomes `#restaurant-site-wrapper .ll-wall-category-title`
- `.menu-row` becomes `#restaurant-site-wrapper .ll-wall-menu-row`
- `.sold-out` becomes `#restaurant-site-wrapper .ll-wall-sold-out`
- `.route-footer` becomes `#restaurant-site-wrapper .ll-wall-route-footer`
- `.footer-actions` becomes `#restaurant-site-wrapper .ll-wall-footer-actions`

Keep these required CSS blocks exactly:

```css
#restaurant-site-wrapper .ll-wall-menu-tab.is-active,
#restaurant-site-wrapper .ll-wall-menu-tab[aria-pressed="true"] {
  background:
    linear-gradient(180deg, rgba(255, 210, 121, 0.18), rgba(139, 61, 28, 0.14)),
    #2b1d13;
  color: #ffe5a7;
  box-shadow: inset 0 0 18px rgba(255, 189, 84, 0.14);
}

#restaurant-site-wrapper .ll-wall-specials-region:empty {
  display: none;
}

#restaurant-site-wrapper .ll-wall-menu-row.is-sold-out .ll-wall-item-name {
  text-decoration: line-through;
  text-decoration-color: rgba(180, 53, 36, 0.9);
  text-decoration-thickness: 3px;
}

#restaurant-site-wrapper .ll-wall-sold-out {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 82px;
  min-height: 30px;
  padding: 0 9px;
  border: 2px solid rgba(180, 53, 36, 0.92);
  color: #ffb29a;
  font-family: var(--ll-wall-stencil);
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transform: rotate(-4deg);
}

@media (max-width: 1120px) {
  #restaurant-site-wrapper .ll-wall-stage {
    grid-template-columns: minmax(0, 760px);
  }

  #restaurant-site-wrapper .ll-wall-signs {
    display: none;
  }

  #restaurant-site-wrapper .ll-wall-menu-panel {
    grid-column: 1;
    grid-row: 1;
    width: 100%;
  }
}
```

- [ ] **Step 2: Keep route user-chip selectors required by existing tests**

Ensure these selectors exist in `leroyslounge/style.css`:

```css
#restaurant-site-wrapper .ll-board-userchip-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  min-height: 38px;
}

#restaurant-site-wrapper .ll-board-userdropdown.ll-site-userdropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 180px;
  z-index: 30;
}
```

- [ ] **Step 3: Run CSS/static boundary tests**

Run:

```bash
node --test tests/leroys-wall-route.test.cjs tests/phase21-route-header-scroll-boundaries.test.cjs tests/user-chip-route-reimplementation.test.cjs
```

Expected: all pass.

- [ ] **Step 4: Commit CSS changes**

Run:

```bash
git add leroyslounge/style.css
git commit -m "Style Leroy's route as wall menu board"
```

Expected: commit succeeds with only `leroyslounge/style.css`.

---

### Task 6: Update Branding Boundary For The New El Roy's Footer Button

**Files:**
- Modify: `tests/phase23-logo-branding-boundaries.test.cjs`

- [ ] **Step 1: Replace the old Leroy jump-logo assertion**

In `tests/phase23-logo-branding-boundaries.test.cjs`, replace:

```javascript
  assert.match(leroysHtml, /class="ll-board-jump-link"[\s\S]*<img[\s\S]*src="\/ELROYSTEMPLOGO\.png"/);
  assert.match(leroysCss, /\.ll-board-jump-logo/);
```

with:

```javascript
  assert.match(leroysHtml, /class="ll-wall-footer-action"[\s\S]*href="\/elroyscantina"[\s\S]*>El Roy's<\/a>/);
  assert.match(leroysCss, /\.ll-wall-footer-action/);
```

- [ ] **Step 2: Run branding boundary tests**

Run:

```bash
node --test tests/phase23-logo-branding-boundaries.test.cjs tests/leroys-wall-route.test.cjs
```

Expected: both pass.

- [ ] **Step 3: Commit branding test update**

Run:

```bash
git add tests/phase23-logo-branding-boundaries.test.cjs
git commit -m "Update Leroy's branding boundary for wall footer"
```

Expected: commit succeeds with only `tests/phase23-logo-branding-boundaries.test.cjs`.

---

### Task 7: Full Route Verification

**Files:**
- Verify: `leroyslounge/index.html`
- Verify: `leroyslounge/app.js`
- Verify: `leroyslounge/style.css`
- Verify: `assets/leroys-lounge/wall/*`
- Verify: `tests/leroys-wall-route.test.cjs`
- Verify: `tests/phase23-logo-branding-boundaries.test.cjs`

- [ ] **Step 1: Run syntax and entry shell checks**

Run:

```bash
node --check app.js
node --check leroyslounge/app.js
node scripts/check-html-script-order.cjs
```

Expected: all pass.

- [ ] **Step 2: Run targeted test suite**

Run:

```bash
node --test tests/leroys-wall-route.test.cjs \
  tests/phase15-auth-unification-complete.test.cjs \
  tests/user-chip-route-reimplementation.test.cjs \
  tests/phase21-route-header-scroll-boundaries.test.cjs \
  tests/phase23-logo-branding-boundaries.test.cjs \
  tests/public-launch-surface.test.cjs \
  tests/architecture-boundaries.test.cjs
```

Expected: all pass.

- [ ] **Step 3: Restart local preview server**

Run:

```bash
python3 -m http.server 4173
```

Expected: server prints `Serving HTTP on :: port 4173` or `Serving HTTP on 0.0.0.0 port 4173`. If port 4173 is already in use, stop the old server for this worktree and restart it.

- [ ] **Step 4: Browser-check `/leroyslounge` desktop**

Open:

```text
http://localhost:4173/leroyslounge/index.html
```

Verify:

- horizontal wood sign links to `/`
- established sign and ice cold beer sign sit beside the wood sign
- Food tab is active for food menu
- Food shows Weekly Special with a price when featured data exists
- Food shows `Leroy doesn't have anything special cooking up this week` when featured data is empty
- sold-out items stay visible and say `Sold Out`
- footer includes version/timestamp, `El Roy's`, and `Staff Sign-In`
- pull tabs sign opens the Michigan Lottery pull tabs page
- margarita note opens `/elroyscantina?menu=drinks`

- [ ] **Step 5: Browser-check `/leroyslounge` mobile**

Use a narrow viewport around 390px wide.

Verify:

- side signs are hidden
- top signs do not overlap
- central board is readable
- Food/Drinks tabs work
- footer actions are reachable
- no top-of-page login button appears

- [ ] **Step 6: Commit any verification-only fixes**

If verification required fixes, commit the changed files:

```bash
git add leroyslounge/index.html leroyslounge/app.js leroyslounge/style.css tests/leroys-wall-route.test.cjs tests/phase23-logo-branding-boundaries.test.cjs
git commit -m "Polish Leroy's wall route verification"
```

Expected: commit succeeds only if fixes were made. Skip this commit if no files changed.

---

## Self-Review Notes

- Spec coverage: assets, layout, live Food/Drinks behavior, weekly special fallback, no Drinks banner, sold-out visibility, footer actions, linked signs, `/` logo link, scoped auth control restyle, responsive behavior, and verification are covered.
- Placeholder scan: no red-flag placeholder steps remain.
- Type consistency: route ids/classes used in HTML, app adapter, CSS, and tests are consistent: `ll-wall-*` for new wall chrome, existing `ll-route-*` ids/data attributes for shared public route behavior, and existing user-chip attributes for shared auth UI.
