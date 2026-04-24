# Client Feature Catalog

This file is the parity-oriented catalog of client-facing features across the
web client and the iOS client.

Use it to answer three questions:

1. What capabilities already exist in at least one client?
2. Which capabilities are shared versus client-specific?
3. What should a future client implement first to stay behaviorally aligned?

## How To Maintain This File

- Track capabilities, not just UI chrome.
- Prefer updating an existing row over creating near-duplicate rows.
- When a feature is added, removed, or materially changed in web or iOS, update
  the relevant status and notes here in the same PR.
- Treat browser-only affordances and native-only affordances as implementation
  notes unless they change the product capability itself.

## Status Legend

- `Full`: first-class, user-visible support exists in that client today.
- `Partial`: some of the workflow exists, but meaningful gaps remain.
- `None`: no user-facing support exists in that client today.

## Future-Client Target Legend

- `All clients`: should exist anywhere the product is represented.
- `Public clients`: required for customer-facing public clients only.
- `Staff editor clients`: required for manager-facing editing clients.
- `Admin clients`: required only for clients that intend to support admin work.
- `Platform-specific`: useful only when it fits the platform.

## Evidence Roots

- Web: [README.md](../README.md), [index.html](../index.html),
  [app.js](../app.js), [manager/index.html](../manager/index.html),
  [admin/index.html](../admin/index.html),
  [routes/shared/public-route-core.js](../routes/shared/public-route-core.js),
  [core/auth/](../core/auth), [core/ui/](../core/ui)
- iOS: [docs/ios/README.md](./ios/README.md),
  [ios/ElRoysManagerApp/App/ElRoysManagerApp.swift](../ios/ElRoysManagerApp/App/ElRoysManagerApp.swift),
  [ios/ElRoysManagerApp/App/AppModel.swift](../ios/ElRoysManagerApp/App/AppModel.swift),
  [ios/ElRoysManagerApp/Features/](../ios/ElRoysManagerApp/Features)

## Product Scope

- The product is fixed to exactly two restaurants:
  - Leroy's Lounge
  - El Roy's Cantina
- Each restaurant has exactly two menus:
  - Drinks
  - Food
- Web currently covers public browsing, manager editing, and admin workflows.
- iOS currently covers staff auth, menu editing, public-menu reading,
  restaurant-tools guidance, and exact route preview.

## Auth And Access

| Capability | Web | iOS | Future-Client Target | Notes |
| --- | --- | --- | --- | --- |
| Staff sign-in | Full | Full | Staff editor clients | Same Supabase-backed staff account model on both clients. |
| Account creation | Full | Full | Staff editor clients | New accounts start without menu access until approved. |
| Password reset request | Full | Full | Staff editor clients | Both clients can request a reset email. |
| In-client password reset completion | Full | None | Staff editor clients | iOS currently sends staff back through the web manager to finish recovery. |
| Session persistence | Full | Full | Staff editor clients | Web restores stored session; iOS stores session in Keychain and can gate restore behind biometrics. |
| Role and per-menu access gating | Full | Full | Staff editor clients | Managers are menu-scoped; admins override access checks. |
| Staff entry points from public surfaces | Full | Partial | Public clients | Web exposes footer/header sign-in, Manager, Admin, and Sign Out actions; iOS public reading happens inside the staff app. |

## Public Browsing And Discovery

| Capability | Web | iOS | Future-Client Target | Notes |
| --- | --- | --- | --- | --- |
| Shared dual-restaurant landing page | Full | None | Public clients | `/` includes the restaurant chooser plus live content sections. |
| Landing live hours | Full | None | Public clients | Web landing shows live hero status plus weekly hours for both restaurants. |
| Landing events, news, and reviews | Full | None | Public clients | Web-only today; managed through the admin landing CMS. |
| Public menu content rendering | Full | Full | Public clients | Both clients can render categories, descriptions, prices, featured items, and visible 86'd state. |
| In-restaurant Food/Drinks switching | Full | Full | Public clients | Web does it in route-owned pages; iOS does it in the native public-menu screen. |
| Cross-restaurant navigation | Full | Partial | Public clients | Web supports route-to-route switching in public chrome; iOS switches restaurants from the authenticated home hub, not a public landing page. |
| Unauthenticated public access | Full | None | Public clients | Web public routes are customer-facing; iOS public menu reading is staff-gated inside the native app. |
| Public featured lineup | Full | Full | Public clients | Both clients surface each menu's featured strip from that menu's hidden `Featured Specials` category and item-level featured toggles. |
| Public footer metadata and staff footer actions | Full | None | Public clients | Web shows `APP_VERSION`, last updated, preview badge, and staff actions; iOS native public reader does not. |
| Exact route preview of the real public page | Full | Full | Staff editor clients | Web is the route itself; iOS opens the exact route in a `WKWebView`. |

## Staff Editing And Publishing

| Capability | Web | iOS | Future-Client Target | Notes |
| --- | --- | --- | --- | --- |
| Menu editor workspace | Full | Full | Staff editor clients | Both clients expose a dedicated menu editor for Drinks and Food. |
| Menu status (`Drafting`, `Live`) | Full | Full | Staff editor clients | Both clients now avoid a persistent unsent state; saved menus are either drafting locally or live. |
| Device-local drafts | Full | Full | Staff editor clients | Both keep local drafts separate from the shared server queue. |
| Discard local draft | Full | Full | Staff editor clients | Explicit local-only discard flow exists in both clients. |
| Unified save review | Full | Full | Staff editor clients | Both clients use one Save action that opens a review modal/sheet before persisting live. |
| Optional notification during save | Full | Full | Staff editor clients | The save review lets staff choose whether selected notification-ready rows should notify channels; notify-off saves live and clears the queue baseline. |
| Send preview and selective send | Full | Full | Staff editor clients | Both can preview grouped changes and select which rows notify during the unified save flow. |
| Remote change detection and conflict refresh | Full | Full | Staff editor clients | Both clients detect remote changes and force review/reload when needed. |
| Recent change history | Full | Full | Staff editor clients | Web has manager recent changes/history views; iOS surfaces recent updates in home and restaurant tools. |
| Add items manually | Full | Full | Staff editor clients | Both can create new items from the editor. |
| Barcode scan and product lookup | Full | Full | Staff editor clients | Both support barcode-driven item entry plus product lookup. |
| Edit item name | Full | Full | Staff editor clients | Present in both clients. |
| Edit price | Full | Full | Staff editor clients | Present in both clients. |
| Edit descriptions | Full | Full | Staff editor clients | Guest-facing descriptions can be edited in both clients. |
| Edit recipe text and recipe visibility | Full | Full | Staff editor clients | Drinks support recipe details; food hides recipe controls in both product models. |
| Edit public visibility flags | Full | Full | Staff editor clients | Web clearly exposes description/recipe visibility controls; iOS item editor supports recipe visibility and public-facing content decisions. |
| 86 / restore items | Full | Full | Staff editor clients | Present in both clients and still visible publicly after 86. |
| Remove items | Full | Full | Staff editor clients | Both can remove items; web additionally has undo-toast affordances. |
| Reorder items | Full | None | Staff editor clients | Web supports drag/drop reorder; no native iOS item reordering surface today. |
| Upcharge editing | Full | None | Staff editor clients | Web exposes structured upcharges; iOS currently does not. |
| Add / rename / delete categories | Full | Partial | Staff editor clients | Web keeps full category governance; iOS keeps category cards and item flows, but add/rename/delete are admin-only and hidden for non-admin staff. |
| Untappd category import flag | Full | None | Admin clients | Web-only today; iOS decodes the shared payload field for parity but keeps Untappd UI out of v1. |
| Recover off-menu / uncategorized items | Full | Full | Staff editor clients | Both clients preserve deleted-category items for recovery instead of silently destroying them. |
| Reorder categories | Full | None | Staff editor clients | Web supports category reordering; iOS currently does not. |
| Database / all-items view | Full | None | Staff editor clients | Web manager has a broader database surface; iOS does not. |
| Prune permanently removed off-menu items | Full | None | Staff editor clients | Web exposes prune tooling; iOS does not. |

## Restaurant Tools And Featured Management

| Capability | Web | iOS | Future-Client Target | Notes |
| --- | --- | --- | --- | --- |
| Per-menu `Featured Specials` category | Full | Full | Staff editor clients | Each menu now owns a hidden `Featured Specials` category that stores reusable deals and limited items. |
| Toggle item into the public featured strip | Full | Full | Staff editor clients | Staff turn on item-level `Show in featured strip` / `featuredEnabled` state inside that menu's `Featured Specials` category. |
| Restaurant Tools featured guidance | Full | Full | Staff editor clients | Restaurant Tools is now read-only guidance that points staff into menu/category editors instead of managing featured slots directly. |
| Featured strip preview from current menu | Full | Full | Staff editor clients | Both clients preview the first five enabled featured-special items for the selected menu. |

## Admin And Operations

| Capability | Web | iOS | Future-Client Target | Notes |
| --- | --- | --- | --- | --- |
| Admin console shell | Full | None | Admin clients | iOS explicitly remains web-only for admin work today. |
| Fixed restaurant/menu overview | Full | None | Admin clients | Web admin reflects the fixed two-restaurant/four-menu model. |
| Landing page CMS | Full | None | Admin clients | Web admin can save drafts and publish selected landing sections live. |
| Landing news/events/reviews editorial workflows | Full | None | Admin clients | Includes imports, manual event authoring, repair flows, and archive handling. |
| Notification channel toggles | Full | None | Admin clients | Web admin configures GroupMe, Twilio SMS, Discord, and generic webhook delivery. |
| Notification credential-key mapping | Full | None | Admin clients | Web admin maps per-restaurant env-key names without storing raw secrets in the client. |
| Browser-side menu URL override | Full | None | Admin clients | Explicitly web-only today. |
| Users, roles, and per-menu access | Full | None | Admin clients | Web admin can approve/invite users, set roles, and assign menus. |
| Staff invite flow | Full | None | Admin clients | Web admin generates invite copy for onboarding. |

## Platform-Specific Surfaces

These are real features, but they are not the main parity target for future
clients unless the platform needs them.

### Web-Specific Today

- Shared root landing page and landing-page CMS
- Public footer metadata and staff footer actions
- Browser path/query routing and menu-picker overlay
- Route-first boot and shared fallback rendering
- `Cmd/Ctrl+S` save shortcut
- Browser drag/drop and swipe interaction patterns
- Preview-audit session helper for protected preview deployments

### iOS-Specific Today

- Keychain-backed session restore with optional biometric unlock
- Native restaurant home hub with quick entry points and restaurant switcher
- Native public-menu reader inside the authenticated app
- Embedded `WKWebView` exact-route preview
- Native camera barcode scanner sheet with manual UPC fallback

## Highest Current Parity Gaps

These are the biggest current capability differences between the two clients:

1. Admin workflows are web-only.
2. The shared landing page and landing CMS are web-only.
3. iOS lacks item reordering, category reordering, upcharge editing, and the
   broader database/prune tools present on web.
4. iOS does not expose the unauthenticated public web chrome
   (root landing page, public footer metadata, footer staff actions) outside of
   exact route preview.
5. Password reset completion is still routed through the web manager instead of
   being fully native on iOS.

## Suggested Rule For Future Clients

When building a future client:

1. Start with the `Staff editor clients` rows.
2. Add the `Public clients` rows if the client is customer-facing.
3. Add the `Admin clients` rows only if the client is intended to support admin
   workflows.
4. Treat the `Platform-specific` section as implementation guidance, not as the
   core parity contract.

## Agreed Next Work (Not Yet Shipped)

These notes capture design decisions that are agreed for upcoming work, but are
not yet reflected in the status tables above.

### Untappd-Assisted Add Item Import

- Scope: web manager only in v1; iOS remains out of scope for the first pass.
- Availability: drinks menus only, and only for categories explicitly marked as
  Untappd-enabled.
- Category control: Untappd-enabled is a saved per-category flag; any drinks
  category may use it.
- Permissions: only admins can change a category's Untappd status.
- Add-item flow:
  - Untappd lookup appears only in the add-item modal.
  - The selected category must be Untappd-enabled.
  - Lookup runs only on explicit button press.
  - The name-field placeholder becomes `Brewery + Beer` for Untappd-enabled
    categories.
  - Search uses the typed name with light server-side normalization for
    packaging/size hints.
  - Search returns up to five matches.
  - One match still goes through a lightweight confirmation step before apply.
  - Multiple matches open an in-modal chooser, not a route change.
  - Cancel/no-match preserves the manager's current typed values.
- Import behavior:
  - Applying a result overwrites only `Name` and `Description`.
  - `Price`, category, recipe, upcharges, and other item state stay untouched.
  - Imported description should be short and primarily generated from style plus
    ABV.
  - A per-import `Include brewery in imported name` toggle exists only during
    the Untappd confirmation/apply flow and defaults to off for each attempt.
  - Imported fields remain normal editable menu text after apply; items do not
    stay linked to Untappd afterward.
- Service model:
  - All Untappd traffic goes through the app server; no client talks directly to
    Untappd.
  - v1 should use live lookups without a server cache.
  - Untappd attribution should appear anywhere the Untappd lookup UI appears.
- Failure model: Untappd is assistive only. Lookup failures, empty results, or
  rate limits never block manual item creation.

### Category Governance Hardening

- Category structure is intended to become admin-only:
  - add category
  - rename category
  - reorder categories
  - delete category
  - change Untappd-related category settings
- Web manager behavior:
  - admins keep full category editing
  - managers keep the `Categories` section visible, but read-only
- iOS behavior:
  - categories become read-only for everyone
  - admin category governance remains web-only
- Server enforcement:
  - category mutations must be enforced server-side, not only in UI
  - if a manager submits forbidden category mutations, the whole save/publish
    request should be rejected with a clear error rather than partially applied
