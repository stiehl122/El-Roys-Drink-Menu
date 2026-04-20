# Manager Dossier Redesign Design

Date: 2026-04-19
Route: `/manager`
Scope: Visual and structural overhaul only. Manager behavior, business logic, and access model stay functionally unchanged.

## Goal

Rebuild the `/manager` route as an aggressive archival-dossier interface that feels mechanically structured, mobile-capable, and unmistakably different from the current shell, while preserving the existing manager runtime contract.

The new shell should:

- feel industrial, document-like, and operational rather than soft or app-like
- work intentionally on both desktop and mobile
- preserve all existing manager flows, IDs, handlers, and behavioral expectations
- keep `Save Quietly` and `Save & Send` as separate actions with unchanged meaning

## Visual Direction

The visual direction is an archival dossier system informed by industrial brutalism.

### Chosen style

- Base direction: archival dossier
- Density: balanced, not cramped
- Substrate: light mode only
- Primary structure: off-white paper, black ink rules, hard 90-degree corners
- Alert accent: hazard red, used sparingly
- Utility tone: muted olive for non-critical system state such as `DRAFT`, queued state, and supporting metadata

### Explicit style rules

- No rounded card language
- No floating glass panels
- No gradients as primary brand styling
- No soft shadow-led hierarchy
- No dark-mode terminal treatment for the manager shell
- No generalized “modern SaaS dashboard” patterns

The shell should feel like a stamped operations packet or service dossier, not a consumer control panel.

## Non-Goals

- No change to Supabase persistence behavior
- No change to auth, role gating, or access rules
- No change to manager section feature scope
- No consolidation of `Save Quietly` and `Save & Send`
- No generalization of the restaurant/menu model
- No schema or API work unless required by a shell integration bug discovered during implementation

## Hard Behavioral Constraints

The redesign is presentation-only. The following behaviors must remain intact:

- `Save Quietly` persists without sending notifications
- `Save & Send` persists, sends notifications, and updates public timestamp/history
- Draft indicators still reflect unsent local or queued change state
- Manager section navigation still targets the existing sections
- Signed-out, locked, loading, and signed-in states still function correctly
- Menu switching, admin handoff, and user dropdown behavior remain intact
- Existing modals, drawers, and keyboard flows continue to work
- Skip link, dialog semantics, and live region behavior remain accessible

## Architecture Decision

This work uses the aggressive path: a shell rewrite on the same behavior contract.

That means:

- `manager/index.html` is restructured more substantially than a normal reskin
- existing IDs, event hooks, target sections, and runtime integration points are preserved or intentionally remapped one-to-one
- shared runtime logic in `app.js` and manager UI modules should remain untouched unless the new shell reveals a genuine integration gap

The redesign should look like a new manager interface, not the old shell with different colors.

## Layout Strategy

The shell must be designed as a dual-form system, not a desktop layout that merely collapses.

### Desktop layout

Desktop uses a rigid dossier composition with four main zones:

1. Document header
2. Section index rail
3. Main stage
4. Fixed command dock

The document header carries title, current menu context, revision-style metadata, user tools, menu switching, and admin entry. The section rail remains persistently visible as the main navigation index. The main stage renders the existing manager sections as dossier panels. The command dock stays fixed and visually anchored as an operational strip.

### Mobile layout

Mobile uses the same visual language but recomposes into a field-manual layout:

- compact document header
- drawer-based section index
- single-column stage
- fixed bottom command dock sized for touch

Mobile should not preserve desktop geometry at the expense of usability. Touch-first ergonomics are required for section switching, row actions, filters, and save/send actions.

## Component Model

The redesign introduces a new shell composition around the existing manager content.

### 1. Document Header

Purpose:

- establish the dossier identity immediately
- surface current menu context and utility actions
- support both desktop and mobile entry

Content:

- oversized manager title
- small metadata row for revision-like or operational context
- current menu identity
- menu switcher
- admin console entry
- user menu
- mobile drawer trigger

Design rules:

- strong type contrast between macro title and micro metadata
- visible structural rules
- hard corners
- olive used for utility labels and supporting metadata

### 2. Section Index Rail

Purpose:

- provide a hard-edged index into the existing manager sections

Behavior:

- desktop: persistent left rail
- mobile: drawer using existing drawer behavior

Design rules:

- index-like, not pill-like
- section entries look like labeled slots in a dossier
- active state is obvious but not soft or glowing

### 3. Dossier Panels

Purpose:

- wrap all major manager sections in a consistent shell language

Applies to:

- overview
- edit items
- pricing
- descriptions
- categories
- database

Design rules:

- square framing
- strong separators
- consistent label system
- readable spacing rather than maximal compression
- table-like rhythm where row-based editing already exists

### 4. Status Strip Pattern

Purpose:

- replace soft summary-card treatment with compact operational summaries

Applies to:

- overview stats
- footer metadata
- contextual labels
- utility tags such as `DRAFT`

Color rules:

- olive for utility/system state
- red only for publish-critical or danger state

### 5. Command Dock

Purpose:

- preserve the fixed manager action area while clarifying action hierarchy

Required actions:

- `Save Quietly`
- `Save & Send`
- discard draft when available
- sync/status messaging when applicable

Design rules:

- visually explicit operational strip
- remains legible and tappable on mobile
- keeps the two save actions distinct and adjacent
- does not obscure key content on smaller screens

## Section-Specific Design Intent

### Overview

Overview becomes a control summary sheet rather than a hero-card cluster.

It should include:

- a dossier-style title block
- compact operational stats
- featured items record
- recent changes record

The section should feel like the top sheet of a service packet, not a marketing dashboard.

### Edit Items

Edit Items should feel flatter and more operational.

- Rows should read more like indexed entries than cards
- Actions should remain discoverable on touch devices
- 86 and restore states should be obvious without overwhelming the row

### Pricing

Pricing should emphasize field grouping and tabular rhythm.

- labels and inputs should read as structured fields
- upcharges should feel like attached schedule rows, not nested soft cards

### Descriptions

Description editing should keep clarity first.

- field groups should be strongly labeled
- recipe and guest-facing copy should remain easy to distinguish
- mobile should stack cleanly without dense collisions

### Categories

Category management should feel like document maintenance.

- list rows should be rigid and legible
- add-category flow should fit the same dossier framing

### Database

Database search and filters should become structured controls rather than floating tool blocks.

- filters should stay readable on mobile
- prune controls should remain clearly dangerous and isolated

## Responsive Design Rules

The redesign must explicitly optimize for both desktop and mobile.

### Desktop

- persistent left rail
- multi-zone stage composition where useful
- strong visual indexing and structural framing

### Mobile

- no cramped miniaturization of desktop patterns
- single-column reading/editing flow
- larger tap targets
- simpler top metadata density
- drawer behavior that feels native to the new shell
- command dock sized and spaced for thumbs

Any side-by-side composition used on desktop must have a deliberate stacked alternative on mobile.

## Accessibility Requirements

The redesign must preserve or improve current accessibility behavior.

Required outcomes:

- skip link remains present and functional
- drawer remains keyboard reachable and closable
- dialog lifecycle remains correct
- user menu remains keyboard operable
- focus states remain visible against the light dossier palette
- status messaging remains compatible with assistive tech

The aggressive rewrite should also resolve the currently known preview/accessibility leaks:

- no stray hidden text such as `No sent updates yet.` appearing in preview snapshots
- no modal content surfacing before explicit open

## Implementation Boundaries

Primary files:

- `manager/index.html`
- `style.css`

Possible supporting touch points only if needed:

- shared manager shell selectors in `app.js`
- manager UI modules that assume old shell structure, only where one-to-one hook remapping requires it

Avoid:

- unrelated shared runtime refactors
- auth or persistence changes unrelated to the shell
- changes to restaurant public routes

## Testing And Verification

Implementation is not complete until the shell is verified across real manager flows.

### Core functional verification

- signed-out manager shell
- locked/loading manager shell
- signed-in manager shell
- section navigation
- mobile drawer open/close
- menu switching
- admin handoff
- user dropdown
- overview render
- modal open/close behavior
- fixed command dock behavior

### Action verification

- `Save Quietly` still saves without notifying
- `Save & Send` still performs save-plus-send behavior
- draft/discard flows still behave correctly

### Responsive verification

- desktop layout at a wide viewport
- tablet/intermediate layout
- narrow mobile layout
- command dock readability and tapability on mobile
- no unusable dense clusters in section content

### Accessibility verification

- keyboard traversal through header, rail, stage, and dock
- visible focus states
- no unintended hidden text leakage
- no premature modal exposure

## Acceptance Criteria

This redesign is successful when:

- `/manager` feels materially redesigned, not cosmetically refreshed
- the interface clearly reflects the archival dossier direction
- mobile feels intentionally composed, not secondarily collapsed
- all existing manager functions continue working
- `Save Quietly` and `Save & Send` remain separate and behaviorally correct
- accessibility and preview issues in the current shell are not reintroduced

## Risks

- The shell rewrite may break selector assumptions in shared runtime code if IDs or structural expectations drift
- A strong visual overhaul can accidentally reduce mobile clarity if density is pushed too far
- The fixed dock can obscure stage content if mobile spacing is not recalibrated carefully

## Mitigations

- preserve existing IDs and hooks wherever possible
- validate each shell area against the current runtime contract
- treat mobile as a first-class layout during implementation, not a cleanup pass
- verify signed-out and modal states early, not only after visual polish
