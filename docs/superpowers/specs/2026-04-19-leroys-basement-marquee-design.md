# Leroy's Lounge Basement Marquee Redesign

Date: 2026-04-19
Route: `/leroyslounge`
Status: Approved design direction, pending user review before implementation

## Goal

Redesign the Leroy's Lounge public route so it feels more like a dim, lived-in basement bar while preserving the existing live menu behavior, route-owned architecture, and staff access patterns.

The redesign should move away from the current all-over neon-board treatment and toward a more cinematic "Basement Marquee" presentation with an atmosphere-first visual hierarchy.

## Design Decisions Already Approved

- Direction: `Basement Marquee`
- Opening layout: `Split Board`
- Priority: `atmosphere` over maximum above-the-fold density

## Constraints

- Keep the route-owned public page model for `/leroyslounge`.
- Do not generalize the app beyond Leroy's Lounge and El Roy's Cantina.
- Preserve the shared runtime contract in `routes/shared/public-route-core.js`.
- Preserve Supabase-backed data loading, live updates, menu switching, timestamps, preview badge behavior, and staff footer actions.
- Do not reintroduce top-of-page login buttons.
- Keep sold-out items visible with route-appropriate treatment.
- Mobile must collapse to a strict single-column layout.
- No dependency additions, no bundler, no build step.

## Visual Direction

The route should feel like a basement bar with old sign hardware, dark wood, tobacco-stained surfaces, and worn red marquee paint instead of a bright stitched neon board.

### Palette

- Primary marquee tone: oxblood / aged red
- Base surfaces: walnut, tobacco, near-charcoal brown
- Text: nicotine cream, softened rather than clean white
- Accent: muted brass / amber

The palette should stay warm and grounded. Avoid purple, bright candy tones, sharp modern whites, and synthetic glow-heavy effects.

### Materials

- Smoked glass overlays
- Worn wood or panel-like surface depth
- Light paper or ticket-like texture accents
- Thin inner highlights that feel physical rather than glossy
- Tinted shadows that suggest low ambient bar lighting

### Typography

- Header and section framing: bold, condensed, sign-like, uppercase-friendly
- Menu rows: more readable and quieter than the current route
- Strong display presence at the top, but better scanability in the menu body

Typography should feel assertive and local, not luxury-editorial and not startup-clean.

### Motion

- Slow, weighted, analog-feeling transitions
- Tactile press feedback on controls
- Optional very subtle ambient marquee shimmer or flicker

Avoid flashy neon pulses, slick product-style motion, or effects that make the route feel tech-branded.

## Layout

### Opening Frame

Use a split-board opening on desktop.

- Left column: marquee rail
- Right column: live board content

The left column should contain:

- Leroy's Lounge branding
- Food / Drinks toggle
- Route swap control
- Settings / staff affordances that already belong in the route shell
- A short atmospheric framing block that reads like venue signage, not marketing copy

The right column should begin with live content immediately. Specials and the first visible category content should appear in the opening frame so the route feels useful at first glance.

### Menu Flow Below The Opening

After the opening frame, menu content should continue as stacked board sections with a stronger sense of rhythm and material depth than the current route.

- Specials remain featured but should feel integrated into the board, not like a separate promotional module
- Categories continue in vertical sections
- Food and drinks remain easy to swap
- Expanded descriptions and recipes still fit naturally into the board treatment

## Footer

Keep the current footer action model.

- Staff Sign-In remains in footer staff actions
- Manager/Admin actions remain footer-based when available
- Version and last-updated metadata remain visible
- Preview badge behavior remains unchanged

## Behavior And Runtime Requirements

The redesign is primarily a route shell rewrite, not a runtime rewrite.

### Must Preserve

- Existing template boot/render lifecycle
- `createPublicRouteCore()` integration from `leroyslounge/app.js`
- Menu toggles
- Swap menu dropdown behavior
- Settings dropdown behavior
- User chip visibility and sign-out behavior
- Footer staff actions
- Public timestamp rendering
- App version and preview badge output
- Sold-out visibility and semantics
- Expand/collapse detail behavior

### Expected Implementation Scope

Primary files:

- `leroyslounge/index.html`
- `leroyslounge/style.css`

Possible light-touch updates:

- `leroyslounge/app.js` only if the new shell needs small structural or copy-related adjustments while keeping the existing route-core contract intact

No shared-runtime refactor is required for this design by default.

## States

### Loading

Replace generic board-loading treatment with route-matched skeleton rows or marquee-aware placeholders so the page still feels designed during boot and menu switching.

### Empty

Keep empty states simple and on-brand. They should feel like quiet board copy, not generic product UI messaging.

### Error

Do not regress current error handling. Errors should remain clear and readable inside the route shell without introducing new interaction dead-ends.

### Sold-Out

Keep sold-out items visible. The styling should remain tactile and clearly unavailable, but fit the darker marquee system better than the current brighter stamped treatment.

## Responsive Behavior

Desktop can use the approved split-board structure.

Tablet and mobile should collapse aggressively into a single column:

- Marquee rail stacks first
- Live content follows immediately below
- Controls remain easy to reach and read
- No horizontal overflow
- Row density remains readable

The mobile version should feel intentional, not like a compressed desktop board.

## Accessibility

Preserve and validate:

- Skip link behavior
- Focus visibility
- Keyboard access for toggles and dropdowns
- ARIA states already wired by the shared runtime
- Readable contrast across dark surfaces
- Reduced-motion handling

## Testing And Verification

Before implementation is considered complete, verify:

- Public route boots route-first without flashing fallback UI
- Food and Drinks switching still works
- Swap menu dropdown still works
- Footer staff actions still reflect auth state correctly
- Timestamps and version metadata still render
- Sold-out rows remain visible
- Expanded descriptions still open correctly
- Desktop and mobile layouts both hold up visually
- Reduced-motion behavior does not regress

## Recommended Implementation Approach

Implement the redesign as a route-owned HTML/CSS overhaul that preserves the current Leroy's adapter contract and public runtime hooks.

This keeps the work focused, minimizes regression risk, and matches the approved direction:

- stronger split opening
- dim basement-marquee mood
- atmosphere-first spacing
- immediate live content visibility

## Out Of Scope

- Reworking shared public route architecture
- Changing menu data shape or Supabase schema
- Adding new restaurant/menu abstractions
- Repositioning staff sign-in to the top of the page
- Rebranding Leroy's into a polished cocktail or hotel-bar aesthetic
