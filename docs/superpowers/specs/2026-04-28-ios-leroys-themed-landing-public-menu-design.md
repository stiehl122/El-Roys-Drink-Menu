# iOS Leroy's Themed Landing And Public Menu Design

## Purpose

Redesign the native iOS experience for Leroy's Lounge on the two app surfaces
that should carry restaurant-specific identity:

- the landing/home screen
- the native public menu screen

The app should feel more accurate to Leroy's Lounge: a hometown basement
dive/sports bar with dark wood, posted specials, chalkboard/menu-board
surfaces, cold-beer energy, and direct bar-food framing.

This is a Leroy's-only visual pass. El Roy's Cantina is not being redesigned.

## Scope

In scope:

- Leroy's native landing/home visual language.
- Leroy's native public menu visual language.
- A focused iOS theme resolver for choosing Leroy's versus the current
  standard/default presentation.
- Leroy's food-first ordering on themed native surfaces.
- Public `Sold Out` copy for Leroy's sold-out menu items.
- Food-only Leroy's specials treatment in the native public menu.
- Replacing exact route preview screens with an in-app Safari sheet.
- Promoting the chosen Leroy's logo/background assets into the iOS asset
  catalog.

Out of scope:

- Redesigning El Roy's Cantina.
- Theming editor, restaurant tools, inventory, category management, auth,
  settings, or other staff utility screens.
- Shipping the static generated menu-board image as native menu content.
- Adding wall-collage side signs to the iOS app in this pass.
- Changing backend schema unless implementation discovers a missing restaurant
  identity path that cannot be solved by existing route/session data.

## Design Boundary

Themed pages in the iOS app are limited to:

- `RestaurantChooserView` / restaurant landing-home experience.
- `PublicMenuScreen` / native guest-facing public menu preview.

All manager/editor/tooling pages remain shared and generic across restaurants.

The landing restaurant switcher remains visible and 50/50. The Leroy's half may
use the new Leroy's style. The El Roy's half should retain its current cues and
should not receive a redesign.

## Theme Architecture

Add a focused native theme layer that answers:

> Given this restaurant or menu context, which public presentation should this
> screen use?

The theme layer only needs two outcomes for this pass:

- `leroys`: new Leroy's Lounge presentation.
- `standard`: existing/default presentation for El Roy's Cantina and any
  unknown fallback.

Theme resolution should use existing identity data:

- Prefer `RestaurantRecord.slug`.
- Also tolerate known Leroy's ids and slug aliases.
- Use `MenuRecord.restaurantId` only when the restaurant record is unavailable.
- Use `PublicMenuPayload.restaurant` as supplemental context, not as the main
  requirement when `PublicMenuScreen` already receives `RestaurantRecord`.

The theme layer should own the small set of visual and behavior tokens that
actually differ by restaurant:

- background treatment
- accent colors
- typography choices
- public menu ordering preference
- public sold-out label
- featured-specials visibility
- asset names for logo/background

Avoid a broad restaurant-theme framework. This pass needs a clean seam, not a
general-purpose theming product.

## Leroy's Landing/Home

The Leroy's landing screen should feel like entering the downstairs bar while
preserving the current home dashboard behavior.

Keep the current information architecture and actions:

- account/status header
- restaurant switcher
- recent updates
- edit shortcuts
- view food/drinks rows
- featured specials/tools card

Remove the bottom Home/Updates/Tools/Settings dock and detached QR button. Those
controls are decorative/inert in the current home screen; real navigation is
already available through the existing cards and rows.

Visual direction:

- Use the generated horizontal Leroy's wood sign as the primary identity asset.
- Use an iOS-optimized crop/compressed version of the wood wall background.
- Do not bring over the extra wall signs in this pass.
- Move away from the current "Brass & Ember" / Didot / art-deco glass read.
- Use dark walnut, blackboard brown, nicotine cream, aged brass, tobacco
  shadows, and faded beer red only as a small accent.
- Optional TV/PBR blue may appear only as a tiny reflected note, not a primary
  palette.

The landing/home shortcut order for Leroy's should be food first, then drinks.
Explicit navigation intent still wins: tapping View Drinks opens Drinks, and
tapping View Food opens Food.

## Leroy's Public Menu

The native Leroy's public menu should use the selected "Posted Cards" direction:
phone-native, readable, and physically grounded.

It should not look like a miniaturized desktop wall board. Instead:

- Use a quiet worn black/brown chalkboard or menu-board background.
- Render content as stacked posted cards/sections.
- Show a restrained taped paper specials slip at the top of Food only.
- Do not show a specials banner on Drinks.
- Keep decoration restrained: chalkboard surface, tape, brass/cream rules,
  sold-out stamp/badge, and no side-sign collage.
- Use hybrid typography:
  - generated/sign assets may carry identity where appropriate
  - live menu text remains native SwiftUI text for readability, scaling, and
    accessibility
- Use cream/brass board lettering for category headings.
- Keep item names, descriptions, and prices native, clear, and fast to scan.
- Use public copy `Sold Out` for sold-out items, with strike-through and/or
  stamp treatment.

Staff/editor surfaces can continue to use staff shorthand such as `86'D`.

Food should render before Drinks in Leroy's public menu controls. Initial route
intent is preserved: a Drinks entry opens Drinks, and a Food entry opens Food.

## Exact Route Preview

Exact route preview actions should present the deployed route URL using
`SFSafariViewController`.

This replaces the custom embedded route-preview surface with the standard iOS
in-app Safari sheet: Safari rendering, Done/share/browser controls, and no
app-specific themed wrapper.

Apply this behavior consistently to exact-route-preview actions, including the
native public menu link and editor toolbar preview action.

## Assets

Promote:

- `prototypes/leroyslounge-wall-test/assets/leroys-horizontal-wood-sign.png`
  into the iOS asset catalog as the Leroy's hero sign.

Create before promoting:

- An iOS-specific optimized crop/compressed wall background derived from
  `prototypes/leroyslounge-wall-test/assets/leroys-wall-background.png`.

Do not ship:

- `prototypes/leroyslounge-wall-test/assets/leroys-menu-board.png`
- `*-with-bg.png` prototype backups
- prototype source/chroma files
- extra wall-sign assets for this pass

The static menu board is a design reference only. Native menu content stays live
and data-driven.

## Data Flow

`RestaurantChooserView` should continue using selected restaurant slug to choose
presentation.

`PublicMenuScreen` should resolve presentation from the `RestaurantRecord` it
already receives. `PublicMenuSession` can keep loading payloads by menu id.

If implementation finds a missing restaurant context, prefer passing existing
restaurant/menu identity through the iOS route/session over expanding the public
menu backend contract.

## Verification

Implementation should verify:

- iOS app builds.
- Leroy's landing/home has no bottom dock and no detached QR button.
- Existing Leroy's landing actions still navigate correctly.
- El Roy's home remains visually/functionally unchanged except for the shared
  switcher context.
- Leroy's public menu is food-first while preserving explicit Food/Drinks
  navigation intent.
- Leroy's Food can show the restrained specials slip.
- Leroy's Drinks does not show a specials banner.
- Leroy's public sold-out items use `Sold Out`.
- Staff/editor surfaces remain generic and may continue using `86'D`.
- Exact route preview opens in an `SFSafariViewController` sheet.

## Acceptance Criteria

- Leroy's native landing and public menu clearly match the hometown
  basement-dive/sports-bar direction from `docs/design/leroys-lounge-vibe.md`.
- The rest of the app does not become restaurant-themed.
- El Roy's does not receive a redesign in this pass.
- Live menu text remains native SwiftUI text and accessible.
- Raster assets are limited to identity and atmosphere.
