# Manager Cockpit Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace live `/manager` with the cockpit-first manager workspace while preserving existing auth, menu access, draft, save, send, publish, and public menu contracts.

**Architecture:** Build a new manager UI module layer under `core/ui/manager/` and make `app.js` act as the route/session/state adapter during the transition. Add Supabase/API support for per-menu Quick Notes, then move the manager shell, item table, item modal, activity panel, notes panel, snapshot panel, drawer, and revision dock into focused modules.

**Tech Stack:** Plain HTML, CSS, JavaScript, Vercel serverless API modules, Supabase REST, Node test runner, existing runtime sandbox helpers. No dependencies, no bundler, no build step.

---

## File Structure

Create:

- `core/ui/manager/cockpit.js`: top-level cockpit render and refresh controller.
- `core/ui/manager/items-table.js`: category-grouped table state and markup.
- `core/ui/manager/item-editor-modal.js`: batch/apply item editor modal.
- `core/ui/manager/notes.js`: Quick Notes client UI and API calls.
- `core/ui/manager/activity.js`: Recent Activity normalization and rendering.
- `core/ui/manager/revision-dock.js`: adaptive dock presentation.
- `server/_manager-notes.js`: read/write manager notes with existing access checks.
- `supabase/migrations/20260429000000_manager_notes.sql`: per-menu notes table and RLS posture.
- `tests/manager-cockpit-modules.test.cjs`: UI module registration and pure rendering tests.
- `tests/manager-cockpit-item-editor.test.cjs`: item modal mutation behavior.
- `tests/manager-notes-api.test.cjs`: server note contract tests.
- `tests/manager-cockpit-shell.test.cjs`: route shell/module script order and primary cockpit markup.

Modify:

- `manager/index.html`: replace section-heavy manager markup with cockpit shell containers; include new manager UI modules.
- `style.css`: add cockpit styles and retire conflicting manager section styles after cutover.
- `app.js`: reduce manager render functions to dependency ports and bridge legacy globals to new modules.
- `api/manager.js`: add `notes_read` and `notes_write` actions.
- `server/_workspace-read.js`: include notes snapshot when building manager workspace payload.
- `server/_menu-history.js`: expose recent activity-friendly typed history fields already present in `update_log`.
- `tests/phase3-ui-boundaries.test.cjs`: assert new manager modules register.
- `tests/phase16-add-item-modal.test.cjs`: preserve Add Item modal contract under cockpit.
- `tests/manager-item-reorder-draft-state.test.cjs`: preserve reorder draft behavior.

Keep:

- Existing save/review/publish implementation in `core/session/*`, `server/_menu-live.js`, `server/_menu-publish.js`, and `server/_menu-draft.js`.
- Existing auth overlay implementation in `core/auth/*`.
- Existing public menu rendering and route behavior.

---

### Task 1: Add Per-Menu Quick Notes Server Contract

**Files:**
- Create: `supabase/migrations/20260429000000_manager_notes.sql`
- Create: `server/_manager-notes.js`
- Modify: `api/manager.js`
- Modify: `server/_workspace-read.js`
- Test: `tests/manager-notes-api.test.cjs`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260429000000_manager_notes.sql`:

```sql
create table if not exists public.menu_manager_notes (
  menu_id uuid primary key references public.menus(id) on delete cascade,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.menu_manager_notes enable row level security;

drop policy if exists "service role manages menu manager notes" on public.menu_manager_notes;
create policy "service role manages menu manager notes"
  on public.menu_manager_notes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists menu_manager_notes_updated_at_idx
  on public.menu_manager_notes(updated_at desc);
```

- [ ] **Step 2: Write server note tests**

Create `tests/manager-notes-api.test.cjs`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

const { loadServerModule } = require('./helpers/runtime.cjs');

test('manager notes payload normalizes empty and existing notes', async () => {
  const mod = await loadServerModule('server/_manager-notes.js');

  assert.deepEqual(mod.createManagerNotePayload(null), {
    note: '',
    updated_at: '',
    updated_by: '',
  });

  assert.deepEqual(mod.createManagerNotePayload({
    note: 'Prep extra mint',
    updated_at: '2026-04-29T12:00:00.000Z',
    updated_by: 'user-1',
  }), {
    note: 'Prep extra mint',
    updated_at: '2026-04-29T12:00:00.000Z',
    updated_by: 'user-1',
  });
});

test('manager note body trims menu id and preserves note text', async () => {
  const mod = await loadServerModule('server/_manager-notes.js');
  const parsed = mod.normalizeManagerNoteBody({
    menu_id: ' 00000000-0000-0000-0000-000000000020 ',
    note: ' Line one\\nLine two ',
  });

  assert.equal(parsed.menuId, '00000000-0000-0000-0000-000000000020');
  assert.equal(parsed.note, ' Line one\\nLine two ');
});
```

- [ ] **Step 3: Run note tests to verify they fail**

Run:

```bash
node --test tests/manager-notes-api.test.cjs
```

Expected: fails because `server/_manager-notes.js` does not exist.

- [ ] **Step 4: Implement manager notes server module**

Create `server/_manager-notes.js`:

```js
import {
  requireAuthenticatedUser,
  requireMenuAccess,
  readProfile,
} from './_auth.js';
import {
  getApiErrorMessage,
  getSupabaseServerConfig,
  readJsonSafe,
  serviceHeaders,
} from './_supabase.js';
import { isSupportedMenuId } from './_menu-read.js';

export function createManagerNotePayload(row = null) {
  return {
    note: String(row?.note || ''),
    updated_at: String(row?.updated_at || ''),
    updated_by: String(row?.updated_by || ''),
  };
}

export function normalizeManagerNoteBody(body = {}) {
  return {
    menuId: String(body?.menu_id || body?.menuId || '').trim(),
    note: String(body?.note ?? ''),
  };
}

async function readAuthorizedActor(req, menuId) {
  if (!isSupportedMenuId(menuId)) throw { status: 400, message: 'Unsupported menu_id' };
  const caller = await requireAuthenticatedUser(req);
  const profile = await readProfile(caller.uid, { select: 'role,name' });
  const role = profile?.role || 'none';
  if (role !== 'manager' && role !== 'admin') throw { status: 403, message: 'Forbidden' };
  await requireMenuAccess(caller.uid, role, menuId);
  return {
    id: caller.uid,
    name: String(profile?.name || '').trim(),
    role,
  };
}

async function fetchJsonOrThrow(url, fallbackMessage) {
  const response = await fetch(url, { headers: serviceHeaders() });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw { status: response.status || 500, message: getApiErrorMessage(payload, fallbackMessage) };
}

async function upsertJsonOrThrow(url, body, fallbackMessage) {
  const response = await fetch(url, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    }),
    body: JSON.stringify(body),
  });
  if (response.ok) return response.json();
  const payload = await readJsonSafe(response);
  throw { status: response.status || 500, message: getApiErrorMessage(payload, fallbackMessage) };
}

export async function readManagerNoteForMenu(menuId) {
  if (!isSupportedMenuId(menuId)) throw { status: 400, message: 'Unsupported menu_id' };
  const { sbUrl } = getSupabaseServerConfig();
  const rows = await fetchJsonOrThrow(
    `${sbUrl}/rest/v1/menu_manager_notes?menu_id=eq.${menuId}&select=note,updated_at,updated_by&limit=1`,
    'Failed to load manager note',
  );
  return createManagerNotePayload(rows?.[0] || null);
}

export async function readManagerNoteCommand(req, menuId) {
  const actor = await readAuthorizedActor(req, menuId);
  return {
    actor,
    note: await readManagerNoteForMenu(menuId),
  };
}

export async function writeManagerNoteCommand(req, body = {}) {
  const { menuId, note } = normalizeManagerNoteBody(body);
  const actor = await readAuthorizedActor(req, menuId);
  const { sbUrl } = getSupabaseServerConfig();
  const rows = await upsertJsonOrThrow(
    `${sbUrl}/rest/v1/menu_manager_notes?on_conflict=menu_id`,
    {
      menu_id: menuId,
      note,
      updated_at: new Date().toISOString(),
      updated_by: actor.id || null,
    },
    'Failed to save manager note',
  );
  return {
    actor,
    note: createManagerNotePayload(rows?.[0] || null),
  };
}
```

- [ ] **Step 5: Wire API actions**

Modify `api/manager.js` imports:

```js
import {
  readManagerNoteCommand,
  writeManagerNoteCommand,
} from '../server/_manager-notes.js';
```

Inside the `GET` branch before normal workspace loading:

```js
      if (action === 'notes_read') {
        const menuId = parseMenuId(req);
        return res.json(await readManagerNoteCommand(req, menuId));
      }
```

Inside the `POST` switch:

```js
      case 'notes_write':
        return res.status(200).json(await writeManagerNoteCommand(req, body));
```

- [ ] **Step 6: Include notes in workspace payload**

Modify `server/_workspace-read.js`:

```js
import { readManagerNoteForMenu } from './_manager-notes.js';
```

Then in `buildWorkspacePayload`, before returning:

```js
  const payload = createMenuWorkspacePayload(bundle, {
    actor: { ...normalizeWorkspaceActor({
      uid,
      role: effectiveRole,
      name: actorProfile?.name || '',
    }), accessibleMenuIds },
  });
  payload.managerNote = await readManagerNoteForMenu(menuId);
  return payload;
```

- [ ] **Step 7: Run server tests**

Run:

```bash
node --test tests/manager-notes-api.test.cjs
node --test tests/supabase-migrations-security.test.cjs
```

Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260429000000_manager_notes.sql server/_manager-notes.js api/manager.js server/_workspace-read.js tests/manager-notes-api.test.cjs
git commit -m "feat: add manager menu notes API"
```

---

### Task 2: Register New Manager Cockpit Module Boundaries

**Files:**
- Create: `core/ui/manager/cockpit.js`
- Create: `core/ui/manager/items-table.js`
- Create: `core/ui/manager/item-editor-modal.js`
- Create: `core/ui/manager/notes.js`
- Create: `core/ui/manager/activity.js`
- Create: `core/ui/manager/revision-dock.js`
- Modify: `tests/phase3-ui-boundaries.test.cjs`

- [ ] **Step 1: Extend module registration test**

Modify `tests/phase3-ui-boundaries.test.cjs` first test script list:

```js
    'core/ui/manager/cockpit.js',
    'core/ui/manager/items-table.js',
    'core/ui/manager/item-editor-modal.js',
    'core/ui/manager/notes.js',
    'core/ui/manager/activity.js',
    'core/ui/manager/revision-dock.js',
```

Add assertions:

```js
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerCockpitService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerItemsTableService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerItemEditorModalService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerNotesService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerActivityService, 'function');
  assert.equal(typeof sandbox.__HF_UI_MODULES__.createManagerRevisionDockService, 'function');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/phase3-ui-boundaries.test.cjs
```

Expected: fails because the new module files are missing.

- [ ] **Step 3: Add minimal module factories**

Create each file with this registration pattern, changing names per file.

`core/ui/manager/cockpit.js`:

```js
(function bootstrapManagerCockpitUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerCockpitServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    return {
      renderCockpit() {
        const host = documentRef?.getElementById?.('manager-cockpit-root');
        if (!host) return false;
        host.innerHTML = '';
        return true;
      },
    };
  }

  modules.createManagerCockpitService = function createManagerCockpitServiceBoundary(deps = {}) {
    return createManagerCockpitServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

`core/ui/manager/items-table.js`:

```js
(function bootstrapManagerItemsTableUi(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerItemsTableServiceImpl() {
    return {
      buildTableState({ categories = [], menuState = {} } = {}) {
        return categories.map(category => ({
          id: String(category.id || ''),
          title: String(category.title || category.label || ''),
          icon: String(category.icon || ''),
          items: Array.isArray(menuState?.[category.id]?.items) ? menuState[category.id].items : [],
        }));
      },
    };
  }

  modules.createManagerItemsTableService = function createManagerItemsTableServiceBoundary(deps = {}) {
    return createManagerItemsTableServiceImpl(deps);
  };
  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Create `core/ui/manager/item-editor-modal.js`:

```js
(function bootstrapManagerItemEditorModalUi(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerItemEditorModalServiceImpl() {
    return {
      open() { return false; },
      close() { return false; },
    };
  }

  modules.createManagerItemEditorModalService = function createManagerItemEditorModalServiceBoundary(deps = {}) {
    return createManagerItemEditorModalServiceImpl(deps);
  };
  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Create `core/ui/manager/notes.js`:

```js
(function bootstrapManagerNotesUi(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerNotesServiceImpl() {
    return {
      normalizeNote(value = '') { return String(value ?? ''); },
    };
  }

  modules.createManagerNotesService = function createManagerNotesServiceBoundary(deps = {}) {
    return createManagerNotesServiceImpl(deps);
  };
  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Create `core/ui/manager/activity.js`:

```js
(function bootstrapManagerActivityUi(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerActivityServiceImpl() {
    return {
      normalizeActivity(entries = []) { return Array.isArray(entries) ? entries : []; },
    };
  }

  modules.createManagerActivityService = function createManagerActivityServiceBoundary(deps = {}) {
    return createManagerActivityServiceImpl(deps);
  };
  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Create `core/ui/manager/revision-dock.js`:

```js
(function bootstrapManagerRevisionDockUi(globalScope) {
  if (!globalScope) return;
  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerRevisionDockServiceImpl() {
    return {
      getDockMode(state = {}) { return state?.hasWork ? 'expanded' : 'collapsed'; },
    };
  }

  modules.createManagerRevisionDockService = function createManagerRevisionDockServiceBoundary(deps = {}) {
    return createManagerRevisionDockServiceImpl(deps);
  };
  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run boundary test**

Run:

```bash
node --test tests/phase3-ui-boundaries.test.cjs
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add core/ui/manager/cockpit.js core/ui/manager/items-table.js core/ui/manager/item-editor-modal.js core/ui/manager/notes.js core/ui/manager/activity.js core/ui/manager/revision-dock.js tests/phase3-ui-boundaries.test.cjs
git commit -m "feat: register manager cockpit ui modules"
```

---

### Task 3: Replace Manager Shell With Cockpit Containers

**Files:**
- Modify: `manager/index.html`
- Modify: `style.css`
- Test: `tests/manager-cockpit-shell.test.cjs`

- [ ] **Step 1: Write shell test**

Create `tests/manager-cockpit-shell.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('manager shell contains cockpit root containers and scripts', () => {
  const html = fs.readFileSync(path.join(root, 'manager/index.html'), 'utf8');

  assert.match(html, /id="manager-cockpit-root"/);
  assert.match(html, /id="manager-cockpit-rail"/);
  assert.match(html, /id="manager-cockpit-workbar"/);
  assert.match(html, /id="manager-cockpit-items"/);
  assert.match(html, /id="manager-cockpit-side"/);
  assert.match(html, /id="manager-cockpit-revision-dock"/);
  assert.match(html, /core\\/ui\\/manager\\/cockpit\\.js/);
  assert.match(html, /core\\/ui\\/manager\\/item-editor-modal\\.js/);
});
```

- [ ] **Step 2: Run shell test to verify it fails**

Run:

```bash
node --test tests/manager-cockpit-shell.test.cjs
```

Expected: fails because cockpit containers are not in `manager/index.html`.

- [ ] **Step 3: Replace manager panel body with cockpit containers**

In `manager/index.html`, keep `loading-view`, `public-view`, auth overlays, menu picker, toast, and modal preview. Replace the contents inside `<div id="manager-view">` with:

```html
    <div class="manager-shell-backdrop" id="settings-drawer-backdrop" hidden onclick="closeSettingsDrawer()"></div>

    <div class="manager-cockpit-layout" id="manager-cockpit-root">
      <button
        class="manager-cockpit-mobile-trigger"
        id="manager-mobile-drawer-trigger"
        type="button"
        aria-label="Open manager navigation"
        aria-controls="manager-cockpit-rail"
        aria-expanded="false"
        onclick="toggleSettingsDrawer()"
      >☰ Menu Tools</button>

      <aside class="manager-cockpit-rail" id="manager-cockpit-rail" aria-label="Manager workspace sections">
        <button class="manager-shell-rail-close" type="button" aria-label="Close manager navigation" onclick="closeSettingsDrawer()">×</button>
        <div id="manager-cockpit-rail-meta"></div>
        <nav id="manager-cockpit-nav" aria-label="Manager cockpit navigation"></nav>
      </aside>

      <main class="manager-cockpit-stage" id="manager-main-content">
        <section class="manager-cockpit-panel" id="manager-panel" style="display:none">
          <header id="manager-cockpit-header"></header>
          <div id="manager-cockpit-workbar"></div>
          <div class="manager-cockpit-grid">
            <section id="manager-cockpit-items" aria-label="Editable menu items"></section>
            <aside id="manager-cockpit-side" aria-label="Manager context panels"></aside>
          </div>
          <section id="manager-cockpit-database"></section>
        </section>
      </main>
    </div>

    <div id="manager-add-item-modal-host"></div>
    <div id="manager-edit-item-modal-host"></div>
    <div class="manager-cockpit-revision-dock" id="manager-cockpit-revision-dock"></div>
```

Keep the existing `<div class="manager-shell-actionbar" id="manager-action-bar">` during this task. The new revision dock module will take it over in a later task.

- [ ] **Step 4: Add script tags**

In `manager/index.html`, after existing manager UI module scripts and before `app.js`, include:

```html
<script src="/core/ui/manager/cockpit.js"></script>
<script src="/core/ui/manager/items-table.js"></script>
<script src="/core/ui/manager/item-editor-modal.js"></script>
<script src="/core/ui/manager/notes.js"></script>
<script src="/core/ui/manager/activity.js"></script>
<script src="/core/ui/manager/revision-dock.js"></script>
```

- [ ] **Step 5: Add base cockpit CSS**

Append to `style.css`:

```css
body.manager-dossier-shell .manager-cockpit-layout {
  width: min(1800px, calc(100% - 24px));
  margin: 14px auto 96px;
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  gap: 22px;
}

body.manager-dossier-shell .manager-cockpit-rail {
  position: sticky;
  top: 14px;
  height: calc(100vh - 28px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
}

body.manager-dossier-shell .manager-cockpit-stage {
  min-width: 0;
}

body.manager-dossier-shell .manager-cockpit-panel {
  min-height: calc(100vh - 28px);
  padding: 28px;
  border: 1px solid rgba(31, 25, 16, 0.25);
  border-radius: 6px;
  background: #fbf6eb;
  box-shadow: 8px 8px 0 rgba(54, 42, 22, 0.14);
}

body.manager-dossier-shell .manager-cockpit-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.86fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 1120px) {
  body.manager-dossier-shell .manager-cockpit-layout {
    width: min(100% - 18px, 640px);
    grid-template-columns: 1fr;
  }

  body.manager-dossier-shell .manager-cockpit-rail {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 60;
    width: min(340px, calc(100vw - 42px));
    height: 100vh;
    overflow-y: auto;
    padding: 14px;
    background: #e7dfd0;
    transform: translateX(calc(-100% - 24px));
    transition: transform 0.2s ease;
  }

  body.settings-drawer-open .manager-cockpit-rail {
    transform: translateX(0);
  }

  body.manager-dossier-shell .manager-cockpit-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Run shell checks**

Run:

```bash
node --test tests/manager-cockpit-shell.test.cjs
node scripts/check-html-script-order.cjs
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add manager/index.html style.css tests/manager-cockpit-shell.test.cjs
git commit -m "feat: add manager cockpit shell"
```

---

### Task 4: Implement Cockpit Header, Rail, Workbar, Side Panels

**Files:**
- Modify: `core/ui/manager/cockpit.js`
- Modify: `core/ui/manager/activity.js`
- Modify: `core/ui/manager/notes.js`
- Modify: `style.css`
- Modify: `app.js`
- Test: `tests/manager-cockpit-modules.test.cjs`

- [ ] **Step 1: Write cockpit rendering tests**

Create `tests/manager-cockpit-modules.test.cjs`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { createElement, loadSandboxWithScripts } = require('./helpers/runtime.cjs');

function setupCockpitDom(sandbox) {
  const doc = sandbox.document;
  [
    'manager-cockpit-rail-meta',
    'manager-cockpit-nav',
    'manager-cockpit-header',
    'manager-cockpit-workbar',
    'manager-cockpit-side',
    'manager-cockpit-database',
  ].forEach(id => doc._registerElement(id, createElement('div', id)));
}

test('manager cockpit renders shell regions from dependency state', () => {
  const sandbox = loadSandboxWithScripts([
    'core/ui/manager/activity.js',
    'core/ui/manager/notes.js',
    'core/ui/manager/cockpit.js',
  ]);
  setupCockpitDom(sandbox);

  const service = sandbox.__HF_UI_MODULES__.createManagerCockpitService({
    document: sandbox.document,
    getActiveMenuName: () => "Leroy's Lounge Drinks",
    getLastUpdatedLabel: () => 'Last Updated: Apr 29, 2026 12:00 PM',
    getStats: () => ({ status: 'Live', statusMeta: 'Live menu is current', activeItems: 16, eightySixed: 0 }),
    getManagerNote: () => ({ note: 'Prep mint', updated_at: '2026-04-29T12:00:00.000Z' }),
    getActivityEntries: () => [{ label: 'Saved quietly', actor: 'Luke', time: 'Apr 29, 12:00 PM', channel: 'Web Manager' }],
  });

  assert.equal(service.renderCockpit(), true);
  assert.match(sandbox.document.getElementById('manager-cockpit-header').innerHTML, /Manager Workspace/);
  assert.match(sandbox.document.getElementById('manager-cockpit-workbar').innerHTML, /Add Item/);
  assert.match(sandbox.document.getElementById('manager-cockpit-side').innerHTML, /Quick Notes/);
  assert.match(sandbox.document.getElementById('manager-cockpit-nav').innerHTML, /Activity/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
```

Expected: fails because `renderCockpit` is still minimal.

- [ ] **Step 3: Implement cockpit render**

Update `core/ui/manager/cockpit.js` with render helpers:

```js
function escHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderHeader(stats, activeMenuName) {
  return `
    <div class="manager-cockpit-title">
      <h1>Manager Workspace</h1>
      <p>${escHtml(activeMenuName || 'No menu selected')}</p>
    </div>
    <div class="manager-cockpit-status-strip" aria-label="Menu status">
      <article><strong>${escHtml(stats.status || 'Live')}</strong><span>${escHtml(stats.statusMeta || '')}</span></article>
      <article><strong>${escHtml(String(stats.activeItems || 0))} active</strong><span>active items</span></article>
      <article class="is-warn"><strong>${escHtml(String(stats.eightySixed || 0))} 86'd</strong><span>items 86'd</span></article>
    </div>`;
}

function renderWorkbar() {
  return `
    <button class="manager-cockpit-tool manager-cockpit-tool--primary" type="button" id="manager-add-item-btn" onclick="openAddItemModal({ mode: 'manual' })">
      <span class="manager-cockpit-tool-icon">＋</span>
      <span><strong>Add Item</strong><small>Quick add or scan</small></span>
    </button>
    <button class="manager-cockpit-tool" type="button" id="manager-bulk-actions-btn">
      <span class="manager-cockpit-tool-icon">☷</span>
      <span><strong>Bulk Actions</strong><small>86, move, copy</small></span>
    </button>
    <label class="manager-cockpit-tool manager-cockpit-tool--field" for="manager-item-search">
      <span class="manager-cockpit-tool-icon">⌕</span>
      <input id="manager-item-search" type="search" placeholder="Search..." autocomplete="off">
    </label>
    <label class="manager-cockpit-tool manager-cockpit-tool--field" for="manager-category-filter">
      <span class="manager-cockpit-tool-icon">▽</span>
      <select id="manager-category-filter"><option value="all">No Filter</option></select>
    </label>`;
}
```

Use this `renderCockpit()` body so rail meta, navigation, header, workbar, side panels, and database shell render before the item table exists:

```js
renderCockpit() {
  const railMeta = documentRef.getElementById('manager-cockpit-rail-meta');
  const nav = documentRef.getElementById('manager-cockpit-nav');
  const header = documentRef.getElementById('manager-cockpit-header');
  const workbar = documentRef.getElementById('manager-cockpit-workbar');
  const side = documentRef.getElementById('manager-cockpit-side');
  const database = documentRef.getElementById('manager-cockpit-database');
  if (!header || !workbar || !side) return false;

  const activeMenuName = getActiveMenuName();
  const stats = getStats();
  if (railMeta) {
    railMeta.innerHTML = `<p class="settings-rail-kicker">Index</p>
      <div class="manager-shell-menu-bar"><span class="active-menu-label">Menu</span><span class="active-menu-name-text">${escHtml(activeMenuName)}</span></div>
      <div class="header-sub manager-shell-rail-updated">${escHtml(getLastUpdatedLabel())}</div>`;
  }
  if (nav) {
    nav.innerHTML = ['Overview', 'Edit Items', 'Featured', 'Activity', 'Database']
      .map(label => `<button type="button" class="settings-rail-btn">${escHtml(label)}</button>`)
      .join('');
  }
  header.innerHTML = renderHeader(stats, activeMenuName);
  workbar.innerHTML = renderWorkbar();
  side.innerHTML = `<section class="manager-cockpit-side-panel"><h2>Featured Preview</h2><div id="featured-mgr-wrap"></div></section>
    <section class="manager-cockpit-side-panel"><h2>Recent Activity</h2><div id="recent-changes-wrap"></div></section>
    <section class="manager-cockpit-side-panel"><h2>Quick Notes</h2><textarea id="manager-quick-note">${escHtml(getManagerNote().note || '')}</textarea></section>
    <section class="manager-cockpit-side-panel"><h2>Menu Snapshot</h2><p>${escHtml(activeMenuName)}</p></section>`;
  if (database) database.innerHTML = '<p class="settings-section-kicker">Database</p><h2>Audit/search lives below the editing cockpit.</h2>';
  return true;
}
```

- [ ] **Step 4: Wire cockpit service in app**

In `app.js`, add:

```js
let _managerCockpitService = null;

function getManagerCockpitService() {
  if (_managerCockpitService) return _managerCockpitService;
  const boundary = globalThis.__HF_UI_MODULES__ || {};
  if (typeof boundary.createManagerCockpitService !== 'function') return null;
  _managerCockpitService = boundary.createManagerCockpitService({
    document,
    window,
    getActiveMenuName: () => _activeMenuName,
    getLastUpdatedLabel: () => document.getElementById('last-updated-label')?.textContent || '',
    getStats: () => ({
      status: document.getElementById('manager-overview-status-value')?.textContent || 'Live',
      statusMeta: document.getElementById('manager-overview-status-meta')?.textContent || 'Live menu is current',
      activeItems: Number(document.getElementById('manager-overview-active-value')?.textContent || 0),
      eightySixed: Number(document.getElementById('manager-overview-86-value')?.textContent || 0),
    }),
    getManagerNote: () => _managerNote || { note: '', updated_at: '', updated_by: '' },
    getActivityEntries: () => _managerActivityEntries || [],
  });
  return _managerCockpitService;
}
```

In `renderManagerWorkspace`, after stats/activity refresh:

```js
  getManagerCockpitService()?.renderCockpit();
```

- [ ] **Step 5: Add cockpit region styles**

Add styles for:

```css
body.manager-dossier-shell .manager-cockpit-status-strip,
body.manager-dossier-shell #manager-cockpit-workbar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

body.manager-dossier-shell #manager-cockpit-workbar {
  grid-template-columns: 1fr 1fr 1.25fr 1fr;
  margin: 24px 0 14px;
  padding: 14px;
  border: 1px solid rgba(31, 25, 16, 0.25);
  background: #efe4d0;
}

body.manager-dossier-shell .manager-cockpit-tool {
  min-width: 0;
  min-height: 62px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(31, 25, 16, 0.25);
  background: #fbf6eb;
  color: #17130f;
}

body.manager-dossier-shell .manager-cockpit-tool--primary {
  display: flex;
  justify-content: center;
  background: #4f5c3a;
  border-color: #4f5c3a;
  color: #fbf6eb;
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
node --check app.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add core/ui/manager/cockpit.js core/ui/manager/activity.js core/ui/manager/notes.js style.css app.js tests/manager-cockpit-modules.test.cjs
git commit -m "feat: render manager cockpit shell"
```

---

### Task 5: Build Category Item Table With Visible Actions

**Files:**
- Modify: `core/ui/manager/items-table.js`
- Modify: `core/ui/manager/cockpit.js`
- Modify: `app.js`
- Modify: `style.css`
- Test: `tests/manager-cockpit-modules.test.cjs`
- Test: `tests/manager-item-reorder-draft-state.test.cjs`

- [ ] **Step 1: Add item table test**

Append to `tests/manager-cockpit-modules.test.cjs`:

```js
test('manager items table renders scan/action columns without delete or inline name input', () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/items-table.js']);
  const service = sandbox.__HF_UI_MODULES__.createManagerItemsTableService();
  const state = service.buildTableState({
    categories: [{ id: 'draft', title: 'Draft Beer', icon: '🍺' }],
    menuState: {
      draft: {
        items: [{ id: 'pbr', name: 'Pabst Blue Ribbon', onMenu: true, eightySixed: false }],
      },
    },
  });
  const html = service.renderTableHtml(state);

  assert.match(html, /Order/);
  assert.match(html, /Item Name/);
  assert.match(html, /Status/);
  assert.match(html, /Edit/);
  assert.match(html, /86/);
  assert.match(html, /data-item-action="edit"/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, />Delete</);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
```

Expected: fails because `renderTableHtml` is missing.

- [ ] **Step 3: Implement table HTML**

Update `core/ui/manager/items-table.js`:

```js
function escHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderStatus(item) {
  if (item?.eightySixed) return '<span class="manager-cockpit-status is-86"><i></i>86 Watch</span>';
  if (item?.onMenu === false) return '<span class="manager-cockpit-status is-off"><i></i>Off Menu</span>';
  return '<span class="manager-cockpit-status"><i></i>On Menu</span>';
}

function renderItemRow(item, categoryId) {
  const name = String(item?.name || '(untitled item)');
  return `<div class="manager-cockpit-item-row" data-category-id="${escHtml(categoryId)}" data-item-id="${escHtml(item.id || '')}">
    <button class="manager-cockpit-drag" type="button" draggable="true" data-item-action="drag" aria-label="Drag ${escHtml(name)}">⋮⋮</button>
    <button class="manager-cockpit-item-name" type="button" data-item-action="edit">${escHtml(name)}</button>
    ${renderStatus(item)}
    <button class="manager-cockpit-row-btn" type="button" data-item-action="edit">Edit</button>
    <button class="manager-cockpit-row-btn" type="button" data-item-action="86">${item?.eightySixed ? 'Undo' : '86'}</button>
  </div>`;
}
```

Add this `renderTableHtml(tableState)` implementation:

```js
function renderTableHtml(tableState = []) {
  const groups = Array.isArray(tableState) ? tableState : [];
  return `<div class="manager-cockpit-item-table" role="table" aria-label="Editable menu items">
    <div class="manager-cockpit-item-head" role="row">
      <span>Order</span><span>Item Name</span><span>Status</span><span>Edit</span><span>86</span>
    </div>
    ${groups.map(group => `<section class="manager-cockpit-item-group" data-category-id="${escHtml(group.id)}">
      <button class="manager-cockpit-group-head" type="button" aria-expanded="true">
        <span aria-hidden="true">▾</span>
        <strong>${escHtml(group.icon)} ${escHtml(group.title)}</strong>
        <em>${escHtml(String((group.items || []).filter(item => item.onMenu !== false).length))}</em>
      </button>
      <div class="manager-cockpit-group-body">
        ${(group.items || []).map(item => renderItemRow(item, group.id)).join('') || '<p class="empty-state">Nothing here yet.</p>'}
      </div>
    </section>`).join('')}
  </div>`;
}
```

- [ ] **Step 4: Wire table actions to existing behavior**

In `app.js`, pass ports to the items table service:

```js
function getManagerItemsTableService() {
  const boundary = globalThis.__HF_UI_MODULES__ || {};
  if (typeof boundary.createManagerItemsTableService !== 'function') return null;
  return boundary.createManagerItemsTableService({
    onEditItem: (catId, itemId) => openEditItemModal(catId, itemId),
    onToggle86: (catId, itemId) => toggle86(catId, itemId),
    onDragStart: (event, catId, itemId) => startManagerItemDrag(event, catId, itemId),
    onDrop: (event, catId, itemId) => handleManagerItemDrop(event, catId, itemId),
    onDragOver: (event, catId, itemId) => allowManagerItemDrop(event, catId, itemId),
  });
}
```

Add delegated click handling in `items-table.js` service:

```js
bindTable(container) {
  if (!container || container.dataset.managerItemsBound === 'true') return;
  container.dataset.managerItemsBound = 'true';
  container.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-item-action]');
    const row = event.target.closest('[data-category-id][data-item-id]');
    if (!actionEl || !row) return;
    const catId = row.dataset.categoryId || '';
    const itemId = row.dataset.itemId || '';
    if (actionEl.dataset.itemAction === 'edit') onEditItem(catId, itemId);
    if (actionEl.dataset.itemAction === '86') onToggle86(catId, itemId);
  });
}
```

- [ ] **Step 5: Remove web swipe initialization from new table path**

Do not call `initSwipeGestures` from cockpit table rendering. Leave legacy swipe functions in `app.js` until dead-code cleanup, but ensure the cockpit table markup never includes `.item-swipeable` or `.swipe-action`.

- [ ] **Step 6: Add table CSS**

Add:

```css
body.manager-dossier-shell .manager-cockpit-item-head,
body.manager-dossier-shell .manager-cockpit-item-row {
  display: grid;
  grid-template-columns: 48px minmax(160px, 1fr) 106px 62px 58px;
}

body.manager-dossier-shell .manager-cockpit-item-row {
  min-height: 43px;
  border-bottom: 1px solid rgba(31, 25, 16, 0.15);
}

body.manager-dossier-shell .manager-cockpit-item-name {
  border: 0;
  background: transparent;
  color: #17130f;
  font-weight: 650;
  text-align: left;
}

body.manager-dossier-shell .manager-cockpit-row-btn {
  border: 0;
  border-left: 1px solid rgba(31, 25, 16, 0.16);
  background: #f7efe1;
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  font-weight: 700;
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
node --test tests/manager-item-reorder-draft-state.test.cjs
node --check app.js
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add core/ui/manager/items-table.js core/ui/manager/cockpit.js app.js style.css tests/manager-cockpit-modules.test.cjs
git commit -m "feat: render manager cockpit item table"
```

---

### Task 6: Implement Batch Edit Item Modal

**Files:**
- Modify: `core/ui/manager/item-editor-modal.js`
- Modify: `app.js`
- Modify: `style.css`
- Test: `tests/manager-cockpit-item-editor.test.cjs`

- [ ] **Step 1: Write modal behavior tests**

Create `tests/manager-cockpit-item-editor.test.cjs`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSandboxWithScripts } = require('./helpers/runtime.cjs');

test('edit item modal applies changed fields only on Done', () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/item-editor-modal.js']);
  const item = {
    id: 'item-1',
    name: 'Pabst Blue Ribbon',
    price: '$3.50',
    desc: '',
    recipe: [],
    upcharges: [],
    onMenu: true,
    eightySixed: false,
    showDescription: true,
    showRecipe: false,
  };
  const applied = [];
  const service = sandbox.__HF_UI_MODULES__.createManagerItemEditorModalService({
    getItem: () => item,
    applyItemPatch: patch => applied.push(patch),
    getCategories: () => [{ id: 'draft', title: 'Draft Beer' }],
    menuType: 'drinks',
  });

  service.open({ categoryId: 'draft', itemId: 'item-1' });
  service.updateField('name', 'PBR');
  assert.equal(applied.length, 0);

  const result = service.apply();
  assert.equal(result.ok, true);
  assert.deepEqual(applied[0], { categoryId: 'draft', itemId: 'item-1', patch: { name: 'PBR' } });
});

test('edit item modal hides recipe controls for food menus', () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/item-editor-modal.js']);
  const service = sandbox.__HF_UI_MODULES__.createManagerItemEditorModalService({
    getItem: () => ({ id: 'food-1', name: 'Burger' }),
    getCategories: () => [{ id: 'entrees', title: 'Entrees' }],
    menuType: 'food',
  });

  service.open({ categoryId: 'entrees', itemId: 'food-1' });
  assert.doesNotMatch(service.renderHtml(), /Recipe/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/manager-cockpit-item-editor.test.cjs
```

Expected: fails because modal state methods are missing.

- [ ] **Step 3: Implement modal state and apply**

In `core/ui/manager/item-editor-modal.js`, implement:

```js
const editableFields = [
  'name',
  'categoryId',
  'price',
  'desc',
  'recipe',
  'upcharges',
  'onMenu',
  'eightySixed',
  'showDescription',
  'showRecipe',
  'featuredEnabled',
];
```

The service must expose:

```js
open({ categoryId, itemId }) {}
close() {}
updateField(field, value) {}
apply() {}
renderHtml() {}
```

`apply()` returns `{ ok: false, error: 'Item name is required.' }` when the trimmed name is empty. Otherwise it sends only changed fields to `applyItemPatch({ categoryId, itemId, patch })`.

- [ ] **Step 4: Bridge modal globals in app**

In `app.js`, add:

```js
function getManagerItemEditorModalService() {
  const boundary = globalThis.__HF_UI_MODULES__ || {};
  if (typeof boundary.createManagerItemEditorModalService !== 'function') return null;
  return boundary.createManagerItemEditorModalService({
    document,
    getItem: (catId, itemId) => findItem(catId, itemId),
    getCategories: () => getManagedCategoryDefs(),
    menuType: MENU_TYPE,
    applyItemPatch: applyManagerItemPatch,
  });
}

function openEditItemModal(catId, itemId) {
  return getManagerItemEditorModalService()?.open({ categoryId: catId, itemId });
}

function applyManagerItemPatch({ categoryId, itemId, patch }) {
  const item = findItem(categoryId, itemId);
  if (!item || !patch || typeof patch !== 'object') return { ok: false };
  Object.assign(item, patch);
  invalidateDiff();
  markSectionsStale(_activeManagerSection);
  updateDraftIndicator();
  renderManagerOverviewStats();
  getManagerCockpitService()?.renderCockpit();
  return { ok: true };
}
```

If `patch.categoryId` differs from `categoryId`, move the item between `menuState` category arrays before applying remaining fields.

- [ ] **Step 5: Add remove/archive behavior**

In modal render, include a danger-area button:

```html
<button class="manager-edit-item-remove" type="button" data-edit-action="remove-from-menu">Remove from menu</button>
```

Wire it to call a dependency:

```js
removeFromMenu({ categoryId, itemId }) {
  const item = findItem(categoryId, itemId);
  if (!item) return { ok: false };
  item.onMenu = false;
  item.visibility = 'off_menu';
  invalidateDiff();
  markSectionsStale(_activeManagerSection);
  updateDraftIndicator();
  getManagerCockpitService()?.renderCockpit();
  return { ok: true };
}
```

The modal must ask for `confirm('Remove this item from the active menu?')` before calling the dependency.

- [ ] **Step 6: Add modal CSS**

Add:

```css
body.manager-dossier-shell .manager-edit-item-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(23, 19, 15, 0.48);
}

body.manager-dossier-shell .manager-edit-item-card {
  width: min(680px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid rgba(31, 25, 16, 0.38);
  background: #fbf6eb;
  box-shadow: 10px 10px 0 rgba(54, 42, 22, 0.14);
  padding: 20px;
}

body.manager-dossier-shell .manager-edit-item-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

body.manager-dossier-shell .manager-edit-item-wide {
  grid-column: 1 / -1;
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
node --test tests/manager-cockpit-item-editor.test.cjs
node --test tests/phase16-add-item-modal.test.cjs
node --check app.js
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add core/ui/manager/item-editor-modal.js app.js style.css tests/manager-cockpit-item-editor.test.cjs
git commit -m "feat: add manager cockpit item editor"
```

---

### Task 7: Implement Quick Notes And Recent Activity Panels

**Files:**
- Modify: `core/ui/manager/notes.js`
- Modify: `core/ui/manager/activity.js`
- Modify: `core/ui/manager/cockpit.js`
- Modify: `app.js`
- Modify: `style.css`
- Test: `tests/manager-cockpit-modules.test.cjs`

- [ ] **Step 1: Add panel tests**

Append:

```js
test('manager notes service preserves unsaved text after save failure', async () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/notes.js']);
  const service = sandbox.__HF_UI_MODULES__.createManagerNotesService({
    saveNote: async () => { throw new Error('network'); },
  });

  service.setText('Prep extra mint');
  const result = await service.save();
  assert.equal(result.ok, false);
  assert.equal(service.getState().text, 'Prep extra mint');
  assert.match(service.getState().error, /network/);
});

test('manager activity normalizes quiet saves and sends', () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/activity.js']);
  const service = sandbox.__HF_UI_MODULES__.createManagerActivityService();
  const entries = service.normalizeActivity([
    { event_type: 'save', user_name: 'Luke', created_at: '2026-04-29T12:00:00Z', source: 'web_manager' },
    { event_type: 'publish', user_name: 'Luke', created_at: '2026-04-29T12:05:00Z', source: 'web_admin' },
  ]);

  assert.equal(entries[0].label, 'Saved quietly');
  assert.equal(entries[1].label, 'Sent update');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
```

Expected: fails because services are minimal.

- [ ] **Step 3: Implement notes client service**

`core/ui/manager/notes.js` service state:

```js
let state = { text: '', savedText: '', isSaving: false, error: '' };
```

Expose:

```js
setInitialNote(notePayload) {}
setText(value) {}
getState() {}
renderHtml() {}
async save() {}
```

`save()` calls dependency `saveNote(state.text)` and only updates `savedText` when it succeeds.

- [ ] **Step 4: Implement activity normalization**

`core/ui/manager/activity.js`:

```js
function normalizeLabel(entry) {
  const type = String(entry?.event_type || entry?.type || '').toLowerCase();
  if (type === 'save' || type === 'save_live' || type === 'save_quietly') return 'Saved quietly';
  if (type === 'publish' || type === 'send' || type === 'notification') return 'Sent update';
  return 'Updated menu';
}
```

Expose `normalizeActivity(entries)` and `renderActivityHtml(entries)`.

- [ ] **Step 5: Wire app note API calls**

In `app.js`, add:

```js
let _managerNote = { note: '', updated_at: '', updated_by: '' };
let _managerActivityEntries = [];

async function saveManagerNote(note) {
  const result = await postApiJson('/api/manager', {
    action: 'notes_write',
    menu_id: MENU_ID,
    note,
  });
  if (!result.ok) throw new Error(result.payload?.error || 'Failed to save note');
  _managerNote = result.payload?.note || { note: '', updated_at: '', updated_by: '' };
  return _managerNote;
}
```

When workspace payload loads, assign:

```js
_managerNote = workspacePayload?.managerNote || { note: '', updated_at: '', updated_by: '' };
```

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
node --check app.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add core/ui/manager/notes.js core/ui/manager/activity.js core/ui/manager/cockpit.js app.js style.css tests/manager-cockpit-modules.test.cjs
git commit -m "feat: add manager cockpit notes and activity"
```

---

### Task 8: Implement Adaptive Revision Dock

**Files:**
- Modify: `core/ui/manager/revision-dock.js`
- Modify: `core/ui/manager/cockpit.js`
- Modify: `app.js`
- Modify: `style.css`
- Test: `tests/manager-cockpit-modules.test.cjs`

- [ ] **Step 1: Add dock tests**

Append:

```js
test('revision dock collapses when idle and expands when work exists', () => {
  const sandbox = loadSandboxWithScripts(['core/ui/manager/revision-dock.js']);
  const service = sandbox.__HF_UI_MODULES__.createManagerRevisionDockService();

  assert.equal(service.getDockMode({ hasWork: false, syncMessage: '' }), 'collapsed');
  assert.equal(service.getDockMode({ hasWork: true, syncMessage: '' }), 'expanded');
  assert.equal(service.getDockMode({ hasWork: false, syncMessage: 'Cloud sync failed' }), 'expanded');
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
```

Expected: fails if dock logic is still only `hasWork`.

- [ ] **Step 3: Implement dock render**

`core/ui/manager/revision-dock.js`:

```js
function getDockMode(state = {}) {
  if (state.hasWork || state.syncMessage || state.isSaving) return 'expanded';
  return 'collapsed';
}

function renderDockHtml(state = {}) {
  const mode = getDockMode(state);
  return `<div class="manager-cockpit-dock-inner is-${mode}">
    <div>
      <p class="workspace-actions-title">Revision Dock</p>
      <p class="workspace-actions-sub">${state.summary || 'No pending changes'}</p>
    </div>
    <span class="manager-cockpit-dock-status">${state.syncMessage || 'All changes saved locally'}</span>
    <button class="save-btn" id="save-btn" onclick="openPreview()" ${state.saveDisabled ? 'disabled' : ''}>Save</button>
    <button class="btn-small" id="discard-draft-btn" onclick="discardLocalDraft()" ${state.showDiscard ? '' : 'hidden'}>Discard Draft</button>
  </div>`;
}
```

- [ ] **Step 4: Make app action bar use dock module**

In `updateManagerActionBar`, after computing `ledgerState`, render:

```js
  const cockpitDock = document.getElementById('manager-cockpit-revision-dock');
  const boundary = globalThis.__HF_UI_MODULES__ || {};
  if (cockpitDock && typeof boundary.createManagerRevisionDockService === 'function') {
    const dockService = boundary.createManagerRevisionDockService();
    cockpitDock.innerHTML = dockService.renderDockHtml({
      hasWork: ledgerState.hasDraftChanges || ledgerState.hasDraftWork || ledgerState.hasPendingUpdate,
      saveDisabled,
      showDiscard: ledgerState.showDiscard,
      syncMessage: (syncEl?.textContent || '').trim(),
      summary: summary?.textContent || 'No pending changes',
    });
  }
```

Keep the old action bar hidden when cockpit dock exists:

```js
  if (cockpitDock) bar.hidden = true;
```

- [ ] **Step 5: Add dock CSS**

```css
body.manager-dossier-shell .manager-cockpit-revision-dock {
  position: fixed;
  left: 288px;
  right: 24px;
  bottom: 12px;
  z-index: 56;
}

body.manager-dossier-shell .manager-cockpit-dock-inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border: 1px solid rgba(31, 25, 16, 0.25);
  background: rgba(251, 246, 235, 0.94);
  box-shadow: 8px 8px 0 rgba(54, 42, 22, 0.14);
  transition: transform 0.18s ease, opacity 0.18s ease, padding 0.18s ease;
}

body.manager-dossier-shell .manager-cockpit-dock-inner.is-collapsed {
  transform: translateY(calc(100% - 18px));
  opacity: 0.72;
}

body.manager-dossier-shell .manager-cockpit-dock-inner.is-collapsed:focus-within,
body.manager-dossier-shell .manager-cockpit-dock-inner.is-collapsed:hover {
  transform: translateY(0);
  opacity: 1;
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
node --test tests/manager-cockpit-modules.test.cjs
node --check app.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add core/ui/manager/revision-dock.js core/ui/manager/cockpit.js app.js style.css tests/manager-cockpit-modules.test.cjs
git commit -m "feat: add adaptive manager revision dock"
```

---

### Task 9: Final Manager Cutover And Legacy Cleanup

**Files:**
- Modify: `app.js`
- Modify: `style.css`
- Modify: `manager/index.html`
- Modify: `tests/phase16-add-item-modal.test.cjs`
- Modify: `tests/manager-item-reorder-draft-state.test.cjs`
- Test: existing manager/auth/public boundary tests

- [ ] **Step 1: Remove old primary section rendering from manager route path**

In `renderManagerWorkspace`, stop calling these legacy section renderers for live cockpit route:

```js
renderPricingSection();
renderDescriptionSection();
renderCategoriesTab();
renderDatabaseTab();
renderPruneSection();
```

Keep their functions present if tests or admin/database tooling still reference them. The cockpit modules should render database/search and modal-based item details instead.

- [ ] **Step 2: Preserve add item modal**

Ensure `renderManagerAddItemLauncher()` still targets `#manager-add-item-btn` in the cockpit workbar and existing Add Item tests pass unchanged:

```bash
node --test tests/phase16-add-item-modal.test.cjs
```

Expected: pass.

- [ ] **Step 3: Preserve reorder draft behavior**

Ensure item rows still call `startManagerItemDrag`, `allowManagerItemDrop`, and `handleManagerItemDrop` through the items table ports.

Run:

```bash
node --test tests/manager-item-reorder-draft-state.test.cjs
```

Expected: pass.

- [ ] **Step 4: Remove web swipe wiring from cockpit**

Search:

```bash
rg -n "item-swipeable|swipe-action|initSwipeGestures" core/ui/manager app.js manager/index.html
```

Expected: cockpit module files and `manager/index.html` have no `item-swipeable` or `swipe-action`. Legacy functions may remain in `app.js` only if no live cockpit caller uses them.

- [ ] **Step 5: Run full relevant test set**

Run:

```bash
node --check app.js
node scripts/check-html-script-order.cjs
node --test tests/phase3-ui-boundaries.test.cjs
node --test tests/phase16-add-item-modal.test.cjs
node --test tests/manager-item-reorder-draft-state.test.cjs
node --test tests/manager-cockpit-modules.test.cjs
node --test tests/manager-cockpit-item-editor.test.cjs
node --test tests/manager-notes-api.test.cjs
node --test tests/auth-abuse-controls.test.cjs
node --test tests/public-launch-surface.test.cjs
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add app.js style.css manager/index.html tests/phase16-add-item-modal.test.cjs tests/manager-item-reorder-draft-state.test.cjs
git commit -m "feat: cut over manager to cockpit workspace"
```

---

### Task 10: Browser Verification On Live Manager Route

**Files:**
- Browser verification task. Source files change only when a defect is found during verification.

- [ ] **Step 1: Start local server**

Run:

```bash
python3 -m http.server 4180
```

Expected: serves the repo at `http://127.0.0.1:4180/`.

- [ ] **Step 2: Open manager route**

Use the in-app browser to open:

```text
http://127.0.0.1:4180/manager?menu=leroys-lounge-drinks
```

Expected: authorized local session reaches the cockpit or signed-out locked state reaches the existing auth flow.

- [ ] **Step 3: Verify desktop layout**

Check:

- Slim left rail.
- Header status indicators.
- Workbar Add Item, Bulk Actions, Search, Filter.
- Item table columns: `Order | Item Name | Status | Edit | 86`.
- No Delete column.
- Featured Preview, Recent Activity, Quick Notes, Menu Snapshot.
- Database/search lower area.
- Revision dock collapsed while idle.

- [ ] **Step 4: Verify modal behavior**

Actions:

- Click an item name.
- Confirm Edit Item modal opens.
- Change name and press Cancel.
- Confirm row name remains unchanged.
- Open again, change name, press Done.
- Confirm row name changes and dock expands.
- Open modal and confirm Remove from menu asks for confirmation.

- [ ] **Step 5: Verify notes behavior**

Actions:

- Type into Quick Notes.
- Save notes.
- Reload the page.

Expected: note persists for the menu. If local Supabase is unavailable, verify API error appears inline and typed text remains.

- [ ] **Step 6: Verify mobile layout**

Resize browser to a mobile width and check:

- Menu Tools opens the left drawer.
- Backdrop closes the drawer.
- Escape closes the drawer.
- Focus returns to the trigger.
- Item table actions remain visible without swipe.

- [ ] **Step 7: Check console**

Use browser dev logs.

Expected: no new warnings or errors from manager cockpit modules.

- [ ] **Step 8: Commit verification fixes when source files changed**

When source files changed during verification:

```bash
git add app.js style.css manager/index.html core/ui/manager tests
git commit -m "fix: polish manager cockpit verification issues"
```

When no source files changed during verification, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: Tasks cover cockpit architecture, direct replacement, modal-owned item editing, no inline name editing, no swipe, no table delete, admin-only permanent deletion, persisted Quick Notes, Recent Activity, adaptive dock, access/error preservation, and verification.
- Red flag scan: no task relies on vague gaps; each task names files, code entry points, commands, and expected outcomes.
- Type consistency: manager notes payload uses `note`, `updated_at`, `updated_by`; item editor patches use `{ categoryId, itemId, patch }`; dock state uses `hasWork`, `syncMessage`, `isSaving`, `saveDisabled`, `showDiscard`, and `summary`.
