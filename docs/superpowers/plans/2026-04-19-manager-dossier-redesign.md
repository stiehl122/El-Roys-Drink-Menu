# Manager Dossier Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/manager` as an archival-dossier shell optimized for desktop and mobile while preserving the current manager runtime contract, save/send behavior, and accessibility.

**Architecture:** Rewrite the `/manager` HTML shell around a new dossier-style document header, section rail, main stage, and fixed command dock while preserving existing IDs and JS hook points. Replace the current `manager-stitch-shell` visual system in `style.css` with a hard-edged light-mode dossier system, then tighten row-level section styling and add a lightweight contract-verification script so future edits do not silently break the shell.

**Tech Stack:** Static HTML, shared vanilla JS runtime in `app.js`, shared CSS in `style.css`, Python 3 stdlib verification scripts, manual browser verification via a local static server.

---

## File Map

- Modify: `manager/index.html`
  - Rebuild the manager route shell markup while preserving required IDs and interactive targets.
- Modify: `style.css`
  - Replace the current manager shell theme and responsive structure with dossier-specific layout, tokens, and mobile behavior.
- Create: `scripts/verify-manager-shell-contract.py`
  - Lightweight stdlib check that asserts the rewritten shell keeps required IDs, explicit save/send labels, and the new dossier class hooks.
- Create: `docs/superpowers/plans/2026-04-19-manager-dossier-redesign.md`
  - This implementation plan.

## Task 1: Add a Manager Shell Contract Check

**Files:**
- Create: `scripts/verify-manager-shell-contract.py`
- Test: `manager/index.html`

- [ ] **Step 1: Write the failing contract check**

```python
#!/usr/bin/env python3
from pathlib import Path
import sys

html = Path("manager/index.html").read_text(encoding="utf-8")

required_ids = [
    "settings-drawer-toggle",
    "manager-settings-rail",
    "manager-main-content",
    "manager-panel",
    "manager-overview-section",
    "manager-items-section",
    "manager-pricing-section",
    "manager-description-section",
    "manager-categories-section",
    "manager-database-section",
    "save-btn",
    "send-btn",
    "discard-draft-btn",
    "manager-action-bar",
    "sync-status",
]

missing = [id_value for id_value in required_ids if f'id="{id_value}"' not in html]
if missing:
    print("Missing required manager IDs:")
    for item in missing:
        print(f" - {item}")
    sys.exit(1)

required_strings = [
    'class="settings-shell-pending manager-dossier-shell"',
    ">Save Quietly<",
    ">Save &amp; Send<",
    'aria-label="Manager workspace sections"',
]

missing_strings = [value for value in required_strings if value not in html]
if missing_strings:
    print("Missing required manager shell strings:")
    for item in missing_strings:
        print(f" - {item}")
    sys.exit(1)

print("Manager shell contract looks good.")
```

- [ ] **Step 2: Run the contract check to confirm it fails on the current shell**

Run:

```bash
python3 scripts/verify-manager-shell-contract.py
```

Expected:

```text
Missing required manager shell strings:
 - class="settings-shell-pending manager-dossier-shell"
 - >Save Quietly<
 - >Save &amp; Send<
```

- [ ] **Step 3: Commit the failing check**

```bash
git add scripts/verify-manager-shell-contract.py
git commit -m "test: add manager shell contract check"
```

## Task 2: Rewrite `manager/index.html` Around the Dossier Shell

**Files:**
- Modify: `manager/index.html`
- Test: `scripts/verify-manager-shell-contract.py`

- [ ] **Step 1: Replace the top-level shell classes, labels, and action copy**

Update the existing shell entry points so the runtime keeps working, but the route now opts into the new dossier styling and explicit action labels.

```html
<body class="settings-shell-pending manager-dossier-shell">
<button class="save-btn" id="save-btn" onclick="saveMenu()" title="Save changes without notifying anyone">Save Quietly</button>
<button class="send-btn" id="send-btn" onclick="openPreview()" title="Review changes before publishing them live">Save &amp; Send</button>
```

- [ ] **Step 2: Rebuild the document header and rail head while preserving existing controls**

Restructure the shell header so it reads like a dossier header instead of a floating app bar. Keep the existing `settings-drawer-toggle`, switcher/admin buttons, and `user-chip`.

```html
<header class="manager-shell-topbar manager-dossier-header">
  <div class="manager-shell-topbar-inner manager-dossier-header-inner">
    <div class="manager-dossier-brand">
      <div class="manager-dossier-brand-row">
        <button
          class="manager-shell-menu-toggle"
          id="settings-drawer-toggle"
          type="button"
          aria-label="Open section navigation"
          aria-controls="manager-settings-rail"
          aria-expanded="false"
          onclick="toggleSettingsDrawer()"
        >≡</button>
        <div class="manager-dossier-title-block">
          <p class="manager-dossier-kicker">Manager dossier / service revision</p>
          <h1 class="manager-shell-topbar-title">Manager Workspace</h1>
        </div>
      </div>
      <div class="manager-dossier-meta-strip" aria-hidden="true">
        <span class="manager-dossier-meta-tag">Archival shell</span>
        <span class="manager-dossier-meta-tag">Mobile ready</span>
      </div>
    </div>

    <div class="manager-shell-topbar-actions manager-dossier-header-actions">
      <button class="btn-small manager-shell-switch-btn" id="switch-menu-btn" onclick="onSwitchMenuClick()" style="display:none" aria-label="Switch to a different menu">Switch Menu</button>
      <button class="manager-btn admin-btn" id="admin-btn" onclick="onAdminBtnClick()" style="display:none">Admin Console</button>
    </div>
  </div>
</header>
```

- [ ] **Step 3: Rebuild the overview and footer wrappers into dossier panels**

Keep the section IDs and inner mount points, but flatten the wrappers into hard-edged dossier panels with utility strips and status-strip framing.

```html
<section class="settings-section manager-shell-overview manager-dossier-panel" id="manager-overview-section">
  <div class="manager-dossier-panel-head">
    <div>
      <p class="settings-section-kicker">Service Overview</p>
      <h2>At a glance</h2>
    </div>
    <p class="manager-dossier-panel-note">Balanced density for service-time editing across desktop and mobile.</p>
  </div>

  <div class="manager-shell-overview-hero manager-dossier-hero"></div>
  <div class="manager-shell-stats-grid manager-dossier-stats"></div>
  <div class="manager-shell-overview-grid manager-dossier-record-grid"></div>
</section>
<footer class="manager-shell-footer manager-dossier-footer">
  <div class="manager-shell-footer-copy"></div>
  <div class="manager-shell-footer-meta"></div>
</footer>
```

- [ ] **Step 4: Run the contract check to confirm the rewritten shell passes**

Run:

```bash
python3 scripts/verify-manager-shell-contract.py
```

Expected:

```text
Manager shell contract looks good.
```

- [ ] **Step 5: Commit the shell rewrite**

```bash
git add manager/index.html scripts/verify-manager-shell-contract.py
git commit -m "feat: rewrite manager shell structure"
```

## Task 3: Replace the Manager Shell Theme in `style.css`

**Files:**
- Modify: `style.css`
- Test: `manager/index.html`

- [ ] **Step 1: Replace the current manager shell token block with dossier tokens**

Search for the current `body.manager-stitch-shell` variable block and replace it with a light-mode dossier palette plus an olive utility tone.

```css
body.manager-dossier-shell {
  --manager-dossier-paper: #f4f4f0;
  --manager-dossier-paper-strong: #e8e5de;
  --manager-dossier-ink: #0c0c0a;
  --manager-dossier-ink-soft: #3f403a;
  --manager-dossier-olive: #6b705c;
  --manager-dossier-red: #d62828;
  --manager-dossier-red-soft: rgba(214, 40, 40, 0.10);
  --manager-dossier-line: rgba(12, 12, 10, 0.82);
  --manager-dossier-line-soft: rgba(12, 12, 10, 0.22);
  --manager-dossier-focus: #6b705c;
  color: var(--manager-dossier-ink);
  background: var(--manager-dossier-paper);
}
```

- [ ] **Step 2: Replace rounded shell layout rules with the new hard-edged dossier structure**

Update the shell-level selectors so the layout becomes a rigid rail/stage grid on desktop and a field-manual stack on mobile.

```css
body.manager-dossier-shell .manager-shell-layout {
  width: min(1600px, calc(100% - 32px));
  margin: 0 auto;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

body.manager-dossier-shell .manager-shell-rail,
body.manager-dossier-shell .settings-section,
body.manager-dossier-shell .manager-shell-overview-card,
body.manager-dossier-shell .manager-shell-actionbar,
body.manager-dossier-shell .manager-shell-footer {
  border-radius: 0;
  border: 1px solid var(--manager-dossier-line);
  background: var(--manager-dossier-paper);
  box-shadow: none;
}

body.manager-dossier-shell .manager-shell-topbar-inner {
  width: min(1600px, calc(100% - 32px));
  margin: 0 auto;
  padding: 18px 0 14px;
  border: 0;
  border-bottom: 2px solid var(--manager-dossier-line);
  background: transparent;
  backdrop-filter: none;
}
```

- [ ] **Step 3: Add mobile-first overrides that intentionally recompose the shell**

Replace the current rounded mobile chrome with a drawer + single-column field-manual layout.

```css
@media (max-width: 920px) {
  body.manager-dossier-shell {
    padding-bottom: calc(196px + env(safe-area-inset-bottom));
  }

  body.manager-dossier-shell .manager-shell-layout {
    width: calc(100% - 20px);
    grid-template-columns: 1fr;
    gap: 10px;
  }

  body.manager-dossier-shell .manager-shell-rail {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(88vw, 320px);
    padding: calc(16px + env(safe-area-inset-top)) 14px 24px;
    transform: translateX(-100%);
    transition: transform 0.22s ease, opacity 0.22s ease;
    z-index: 80;
  }

  body.manager-dossier-shell .manager-shell-rail.is-open {
    transform: translateX(0);
  }

  body.manager-dossier-shell .manager-shell-actionbar {
    left: 8px;
    right: 8px;
    bottom: calc(8px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}
```

- [ ] **Step 4: Run a targeted grep to confirm the old shell class is gone from the manager theme block**

Run:

```bash
rg -n "manager-stitch-shell" style.css manager/index.html
```

Expected:

```text
manager/index.html: no matches
style.css: only legacy or admin-adjacent references that are not used by /manager, or no matches if fully migrated
```

- [ ] **Step 5: Commit the shell theme replacement**

```bash
git add style.css manager/index.html
git commit -m "feat: add dossier manager shell theme"
```

## Task 4: Rework Section-Level Styling for Overview, Rows, and Status States

**Files:**
- Modify: `style.css`
- Modify: `manager/index.html`
- Test: `manager/index.html`

- [ ] **Step 1: Recast overview blocks into dossier records and status strips**

Replace card-like overview styles with rigid strips and ledger-like panels.

```css
body.manager-dossier-shell .manager-shell-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--manager-dossier-line);
}

body.manager-dossier-shell .manager-shell-stat-card {
  min-height: 112px;
  padding: 14px 16px;
  align-items: start;
  border: 0;
  background: var(--manager-dossier-paper);
}

body.manager-dossier-shell .manager-shell-stat-label,
body.manager-dossier-shell .manager-shell-stat-meta,
body.manager-dossier-shell .settings-section-kicker,
body.manager-dossier-shell .workspace-actions-title {
  color: var(--manager-dossier-olive);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Rebuild row-level edit surfaces so they read as operational entries**

Flatten the items, pricing, and description rows into square, table-like records with stronger separators and touch-safe actions.

```css
body.manager-dossier-shell #manager-items-section .items-row,
body.manager-dossier-shell #manager-pricing-section .pricing-row,
body.manager-dossier-shell #manager-description-section .description-editor-card {
  border-radius: 0;
  border: 1px solid var(--manager-dossier-line);
  background: var(--manager-dossier-paper);
  box-shadow: none;
}

body.manager-dossier-shell .eighty-six-btn,
body.manager-dossier-shell .del-item,
body.manager-dossier-shell .db-filter-btn,
body.manager-dossier-shell .btn-small {
  border-radius: 0;
}

body.manager-dossier-shell .items-row.is-eighty-sixed,
body.manager-dossier-shell .pricing-row.is-eighty-sixed,
body.manager-dossier-shell .manager-shell-disclosure--danger {
  background: var(--manager-dossier-red-soft);
}
```

- [ ] **Step 3: Update action dock copy and utility state styling**

Make olive the default utility tone for draft/system status, while red stays reserved for send/danger emphasis.

```css
body.manager-dossier-shell .manager-shell-actionbar-copy,
body.manager-dossier-shell .manager-shell-actionbar-status,
body.manager-dossier-shell .manager-shell-footer-pill,
body.manager-dossier-shell .manager-shell-header-badge--muted {
  color: var(--manager-dossier-olive);
}

body.manager-dossier-shell .send-btn,
body.manager-dossier-shell .btn-danger,
body.manager-dossier-shell .manager-shell-stat-card--warn .manager-shell-stat-value {
  background: var(--manager-dossier-red);
  color: var(--manager-dossier-paper);
  border-color: var(--manager-dossier-red);
}
```

- [ ] **Step 4: Run the contract check again after the section-level restyle**

Run:

```bash
python3 scripts/verify-manager-shell-contract.py
```

Expected:

```text
Manager shell contract looks good.
```

- [ ] **Step 5: Commit the section-level dossier restyle**

```bash
git add style.css manager/index.html
git commit -m "feat: restyle manager sections as dossier panels"
```

## Task 5: Verify Desktop, Mobile, and Accessibility-Sensitive States

**Files:**
- Modify: `manager/index.html` if needed
- Modify: `style.css` if needed
- Test: `scripts/verify-manager-shell-contract.py`

- [ ] **Step 1: Run the automated contract check**

Run:

```bash
python3 scripts/verify-manager-shell-contract.py
```

Expected:

```text
Manager shell contract looks good.
```

- [ ] **Step 2: Serve the repo locally for manual shell verification**

Run:

```bash
python3 -m http.server 4173
```

Expected:

```text
Serving HTTP on :: port 4173 (http://[::]:4173/) ...
```

- [ ] **Step 3: Verify the manager shell in a browser at desktop and mobile widths**

Open:

```text
http://localhost:4173/manager/
```

Check:

- desktop shows a persistent dossier rail and fixed command dock
- mobile shows a compact header, drawer-capable rail, and readable bottom dock
- `Save Quietly` and `Save & Send` remain separate and fully visible
- overview stats, featured, and recent sections render without rounded-card styling
- section rows remain readable on mobile

- [ ] **Step 4: Verify signed-out and modal-sensitive states**

In the browser:

- trigger the signed-out/locked state if available and confirm no stray hidden text appears
- open and close the send preview modal and confirm it does not render visibly before open
- keyboard-tab through header, rail trigger, user menu, and action dock to confirm focus visibility

- [ ] **Step 5: Apply any final CSS/HTML fixes, rerun the contract check, and commit**

Run:

```bash
python3 scripts/verify-manager-shell-contract.py && git add manager/index.html style.css scripts/verify-manager-shell-contract.py && git commit -m "fix: polish manager dossier shell verification issues"
```

Expected:

```text
Manager shell contract looks good.
[current branch] fix: polish manager dossier shell verification issues
```

## Self-Review

Spec coverage check:

- aggressive shell rewrite: covered by Tasks 2 and 3
- desktop/mobile dual-form layout: covered by Task 3 and manual verification in Task 5
- separate `Save Quietly` and `Save & Send`: enforced in Task 1 and implemented in Task 2
- overview/section redesign: covered by Task 4
- accessibility-sensitive locked/modal checks: covered by Task 5
- no runtime-contract drift: guarded by Task 1 and repeated checks in Tasks 2, 4, and 5

Placeholder scan:

- no placeholder or deferred-implementation notes remain

Type and naming consistency:

- plan consistently uses `manager-dossier-shell`, `scripts/verify-manager-shell-contract.py`, `Save Quietly`, and `Save & Send`
