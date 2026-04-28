# Leroy's Lounge Menu Design

**Imported from Stitch:** Project `11646432187627733018`, Screen `ae8ad8d3a90946008df6ee18a4e26d37`, 2026-04-02

**Dropdown template:** Screen `f178fab76dd04094a9f3380281a1a6e1`

## Assets
- Leroy's Lounge logo -> `/assets/leroys-lounge/stitch-logo.png`

## Updated Direction

Future Leroy's route work should follow
`docs/design/leroys-lounge-vibe.md` as the current source of truth.

The target is a literal hometown basement dive/sports bar with 1970s rec-room
bones: sports on TV, classic rock, friendly bartenders, posted specials, cold
domestic beer, pool-table presence, Keno/pull-tab energy, and compact
old-school food.

Treat the current Stitch route as an imported baseline, not the final design
language. Preserve useful ideas like the menu-board structure, sign-centered
identity, and stamped 86'd treatment, but correct the broader mood away from
cinematic speakeasy, smoky lounge mythology, or premium cocktail-bar polish.

The route's future UI asset language should prioritize:

- dark wood and black/brown menu-board surfaces
- aged paper or laminated specials slips
- brown/black booth or upholstery cues, never red booth material
- faded beer red only as a sign, stamp, warning, or small accent
- Hamm's/PBR blue and TV blue only as occasional reflected or label accents
- posted-special labels, taped-note dividers, and price-board typography
- loading, empty, and error states that feel like menu-board rows or plain
  staff notes

Use CSS for structure, type, borders, states, and repeatable controls. Use
raster assets only for physical texture plates and atmospheric surfaces where
procedural CSS would look too clean.

## Design Notes
- Preserved the selected Stitch screen's neon header, centered logo, gray slat board texture, red section headers, and plastic-letter menu treatment.
- Applied the separate dropdown-component screen to both the `Swap Menu` control and the settings icon dropdown per the implementation request.
- Kept the left logo button as the route's sign-in entry point so auth access exists without introducing a new visual control outside the supplied design language.
- Item descriptions render as a secondary slat row inside each expanded item so live app data fits without breaking the board layout.
- Sold-out items use the Stitch strikethrough treatment plus the red stamped badge.
- The red-heavy imported treatment should not be expanded into a primary
  material language. Red stays secondary to dark wood, black/brown boards,
  aged cream, tobacco brown, brass/yellowed trim, and cheap-beer label accents.

## Fallback 86'd Treatment
- No fallback needed. The route uses the Stitch strikethrough and sold-out stamp styling.

## Last Updated
2026-04-27
