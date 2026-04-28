# Leroy's Lounge Wall Route Replacement Design

Date: 2026-04-28

## Outcome

Replace the current `/leroyslounge` public route presentation with the approved Leroy's Lounge wall-board design while preserving the existing shared public route behavior.

The production route should look like the prototype wall scene and function like the current route. Data loading, auth, menu switching, live polling, publish timestamps, preview behavior, and footer staff actions stay owned by the existing shared public route core.

## Design Direction

Leroy's Lounge should read as a literal hometown dive/sports bar: dark wood wall, hanging signs, pool, pull tabs, beer signage, handwritten notes, and a central menu board. The route should avoid the prior polished cocktail-lounge/stitch aesthetic.

The approved prototype is the visual source of truth:

- dark vertical wood wall background
- top sign cluster
- centered transparent menu board over the wall
- desktop-only side signs
- Food/Drinks board tabs
- weekly special strip for Food
- footer staff actions inside the board

## Assets

Move the approved prototype assets into the production Leroy asset folder, likely under `/assets/leroys-lounge/wall/`, with stable production names for:

- wall background
- horizontal Leroy's Lounge wood sign
- established sign
- ice cold beer sign
- pool free play neon sign
- pull tabs sign
- Leroy thumbs-up wood panel
- Michigan `LER0YS` license plate
- handwritten margarita note

The production route should reference the production asset paths, not prototype paths.

The established sign alpha fix must be preserved so it renders as a real plaque with an opaque sign face and transparent outside corners.

## Layout

The page should mirror the approved prototype:

- top sign cluster with established sign on the left, Leroy's Lounge wood sign centered, and ice cold beer sign on the right
- centered main board with live menu controls and content
- left side signs on desktop: pool free play, pull tabs, Leroy thumbs-up panel
- right side signs on desktop: license plate and margarita note
- side signs hidden below the desktop breakpoint when there is not enough room
- mobile layout keeps the central board readable and does not show decorative side signs

The horizontal Leroy's Lounge wood sign should be a link to `/`.

The margarita note should jump to El Roy's drink menu.

The pull tabs sign should link to `https://www.michiganlottery.com/resources/pull-tabs-prizes-remaining`.

## Live Menu Behavior

The route should continue using the shared public route core. The route-specific template and render functions should adapt live data into the new wall-board markup.

Food and Drinks tabs must keep the current route menu switching behavior.

Food should render the Weekly Special strip at the top of the menu board. If Leroy's has a weekly special, show its name, description, and price. If there is no weekly special, show this exact fallback:

`Leroy doesn't have anything special cooking up this week`

Drinks should not render a specials banner.

Menu categories and items still come from live route data. Prices, item descriptions, category headings, update timestamps, footer version, preview badge behavior, and manager/admin visibility remain live.

Sold-out items must stay visible publicly with strike-through treatment and a `Sold Out` stamp.

Empty menu states should feel native to the board instead of using a generic app placeholder.

## Controls And Auth

The public route should keep shared auth and access behavior intact.

Restyling staff/admin/manager controls means only the controls that appear inside `/leroyslounge` route chrome. Do not restyle the shared auth overlay, `/manager`, `/admin`, or the El Roy's public route as part of this work.

Keep the public route sign-in entry in the footer staff actions. Do not reintroduce top-of-page login buttons.

The footer should include:

- public timestamp/version text
- `El Roy's` cross-route button
- `Staff Sign-In`
- manager/admin/sign-out actions when the existing shared auth state exposes them

Those controls should use the new wall-board visual language while preserving their current data attributes and behavior.

## Responsive And Accessibility

The page should remain route-first and avoid flashing the shared loading shell.

The central board should use stable dimensions and responsive constraints so content does not overlap or shift awkwardly across desktop and mobile widths.

Images should have useful `alt` text where they are meaningful. Decorative sign imagery can be hidden from assistive text where appropriate, except linked signs need accessible labels that explain the destination.

The Food/Drinks controls should preserve accessible tab or button state, keyboard focus, and ARIA state equivalent to the current route.

Footer staff actions and linked signs must remain keyboard reachable with visible focus treatment.

## Implementation Boundaries

Do not change shared menu persistence, publish/send behavior, Supabase auth, live polling, or per-menu access control.

Do not generalize the app into arbitrary restaurant/menu CRUD.

Do not move auth overlay markup or styling out of the shared auth layer.

Do not alter El Roy's route design except for the link destination reached from Leroy's.

Keep the prototype files as a sandbox unless the implementation plan explicitly removes or archives them later.

## Verification

Implementation should verify:

- route-first `/leroyslounge` boot
- no shared loading shell flash
- Food/Drinks switching
- Food weekly special with price
- Food special fallback text when no special is available
- Drinks route without a specials banner
- live category/item rendering
- sold-out item visibility with `Sold Out`
- footer timestamp/version and preview badge behavior
- footer `Staff Sign-In`, manager/admin/sign-out visibility, and El Roy's jump
- horizontal logo link to `/`
- margarita note link to El Roy's drink menu
- pull tabs link to the Michigan Lottery pull tabs page
- desktop layout with side signs
- mobile layout with side signs hidden and board readable

Run the smallest relevant route tests and syntax checks for the files touched during implementation.
