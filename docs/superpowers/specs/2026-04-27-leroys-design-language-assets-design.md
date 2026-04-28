# Leroy's Lounge Design Language And UI Asset Direction

Date: 2026-04-27

## Scope

This spec defines the updated design language and UI asset direction for
Leroy's Lounge.

This is a language and asset-planning pass only. It does not commit to changing
`/leroyslounge`, the shared `/` homepage, data contracts, admin tooling, or
manager workflows yet.

The asset scope is digital UI assets only:

- textures
- badges
- menu-board treatments
- background plates
- section dividers
- 86'd stamps
- button and signage styles
- state treatments for loading, empty, and error UI

It is not a full brand package. It excludes refreshed logos, social art,
print collateral, table tents, and off-app promotional materials.

## Research Basis

The updated direction is grounded in public signals found during research:

- Banana 101.5 describes Leroy's as a new Fenton spot for people who love a
  dive bar, with a nod to Mo Doggies and bars of the 1970s. The article calls
  out a full bar, free pool table, jukebox, Keno, pull tabs, and nostalgic
  70s decor.
  Source: https://banana1015.com/leroys-lounge-fenton-michigan/
- The Lasco Press places Leroy's in the basement of the Fenton Fire Hall at
  201 South Leroy Street and frames it as a bar, speakeasy, and restaurant for
  adult beverages and old-school bar food. It notes that the simple menu is
  posted on the wall and describes the room as a cozy basement environment.
  Source: https://www.thelascopress.com/2025/01/fentons-newest-gathering-place-leroys-lounge/
- MapQuest/Yelp snippets describe the guest read as a classic dark hometown
  bar, sports playing, classic rock, friendly bartenders, standard non-fancy
  drinks, PBR/Hamm's/Miller Lite, and Chicago dive-bar vibes.
  Source: https://www.mapquest.com/us/michigan/leroys-lounge-776398405
- Banana 101.5's weekend-special coverage adds food specificity: fried bologna
  on Texas toast, fries, Hamm's beer, burgers, chili, wings, pizza, fries, and
  fried pickles.
  Source: https://banana1015.com/leroys-lounge-fenton/

Facebook was not directly fetchable during research, but multiple articles cite
Leroy's Facebook posts or photos. Treat those article summaries as secondary
social-source-adjacent evidence, not as direct Facebook review.

## Core Read

Leroy's should be defined as a literal hometown basement dive/sports bar, not a
moody cocktail lounge and not generic retro branding.

The more accurate read is a newer Fenton bar deliberately built to feel like it
has always been there. It lives downstairs, carries 70s rec-room and local dive
cues, and should feel close to sports on TV, classic rock, friendly bartenders,
posted specials, cheap-beer confidence, pool-table presence, Keno and pull-tab
energy, and compact old-school food.

The food voice should be blunt and local:

- burgers
- chili
- wings
- fried pickles
- pizza
- fried bologna specials
- fries
- Hamm's, PBR, and Miller Lite

The digital expression can still be designed, but it should look like design in
service of a bar wall, not design in service of premium hospitality.

The key correction from the current docs is to keep the basement and 70s warmth
while reducing mythology, smoky lounge romance, and speakeasy gloss. The target
is a dark hometown sports bar with a wall menu, not a secret cinematic den.

## Visual System

Use Wall-Menu Sports Dive as the foundation. Borrow 70s Basement Rec Room
materials and Cheap-Beer Specials Board specificity as accents.

### Surfaces

- dark wood paneling
- black and brown menu boards
- aged cream paper
- faded laminated specials
- scuffed tabletop
- brown and black booth or upholstery cues
- low-ceiling basement darkness

Do not use red as a booth or upholstery base. Red is allowed only as a
beer-sign, warning, stamp, or small accent color.

### Light

- warm beer-sign glow
- amber bar light
- red neon or sign glow used sparingly
- practical overhead dimness
- TV blue only as a small reflected accent

### Color

- tobacco brown
- dark walnut
- blackboard brown-black
- faded beer red
- Hamm's/PBR blue as occasional notes
- mustarded cream
- nicotine paper
- aged brass or yellowed trim

The palette should feel local, low, and handled, but not dirty in a
food-safety way.

### Typography

Use typography that feels like local bar signage and a posted menu board:

- condensed sports-bar or menu-board sans
- blocky sign lettering
- price-board typography
- small posted-special labels
- stamped or taped note treatments

Avoid:

- elegant serif romance
- cocktail-menu typography
- polished hotel-bar styling
- startup sans-only systems
- fake vintage novelty fonts

### Texture

Texture should be visible enough to feel physical:

- woodgrain
- paper wear
- taped edges
- board scratches
- screen-glow bloom
- stamped marks

The correct texture level is "bar wall and printed board got handled all
weekend," not fake grunge or haunted-house distress.

### Layout Energy

The system can be denser and more sign-like than the shared premium homepage
direction. Content may feel posted, taped, stamped, stacked, and slightly
crowded, while staying readable and accessible.

## UI Asset Direction

Leroy's UI assets should form a reusable site kit for future route and homepage
work.

### Texture Plates

Create or define:

- dark wood panel plate
- worn black/brown menu-board plate
- aged paper or specials-slip plate
- scuffed tabletop plate
- subtle TV/beer-sign glow overlays

### UI Treatments

Create or define:

- posted-special labels
- menu category headers
- price-row rules
- staff/footer action styling
- active menu toggle styling
- sold-out/86'd stamp treatment

### Dividers And Frames

Create or define:

- taped-paper edges
- brass or yellowed rule lines
- simple board borders
- sports-bar bulletin-board separators

### State Treatments

Create or define:

- loading skeletons that feel like menu-board rows
- empty states that feel like nothing is posted yet
- error states that feel like plain staff notes

### Raster Versus CSS

Use a hybrid asset strategy:

- CSS should handle structure, borders, typography, states, repeatable
  patterns, and most UI controls.
- Raster assets should be used only for physical texture plates and
  atmospheric surfaces where procedural CSS would look too clean.

Choose whichever medium is best for the specific asset. Avoid raster images for
things that need to scale, recolor, respond to state, or carry text.

## Copy Direction

Copy should sound local, plainspoken, and menu-first.

Good language:

- burgers
- chili
- fried pickles
- posted specials
- pool
- game's on
- cold beer
- downstairs
- open late

Avoid:

- luxury verbs
- vague atmosphere
- lore-heavy phrases
- premium hospitality language
- invented mythology
- faux-speakeasy romance

The voice can be wry, but it should not become theatrical.

## Motion Direction

Motion should be modest and physical:

- light flicker or glow shifts for sign-like accents
- small hover movement like a taped notice lifting slightly
- menu-board row reveals that feel like posted information appearing
- direct state changes for controls and buttons

Avoid:

- slick product animation
- bouncy effects
- dramatic parallax
- nightclub glow systems
- animation that makes the menu harder to scan

## Guardrails

- Do not make Leroy's look like a cocktail speakeasy.
- Do not overuse red as a surface color.
- Do not make the dive-bar aesthetic illegible or low contrast.
- Do not introduce generic sports-brand graphics.
- Do not make the room feel dirty in a food-safety way.
- Do not turn the site into a nostalgic theme restaurant.
- Preserve the "new bar made to feel old" tension: intentional, local, and
  direct.

## Future Implementation Evaluation

Any future implementation using this language should be evaluated against two
questions:

1. Could someone who has seen Leroy's photos, posts, or reviews recognize the
   feel?
2. Can a guest still scan the menu quickly on a phone?

Implementation should also continue to honor existing product constraints:

- public route sign-in remains in footer staff actions
- 86'd items remain visible publicly with strike-through or badge treatment
- public footer continues to show `APP_VERSION` and last-updated time
- route-first boot should not regress
- food menus continue to hide recipe controls and use food defaults
