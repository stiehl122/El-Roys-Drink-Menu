# Design System: El Roy's Cantina Public Menu

**Purpose:** Single source of truth for future Google Stitch generations and design reviews for `/elroyscantina`.

**Current route reference:** `/elroyscantina/index.html`, `/elroyscantina/style.css`, `/elroyscantina/app.js`

**Imported route baseline:** Project `7034575280285494361`, Screen `b2e8f8b21a4d438b8f00e9f49a196d7c`, imported 2026-04-02

## 1. Visual Theme & Atmosphere

El Roy's Cantina should feel like a real Tex-Mex restaurant in an older
building that used to be a fire station from the 1940s through the 1970s. The
mood is social, heated, and cinematic without tipping into parody. This is not
a startup taco brand and not a novelty fiesta set.

Think in terms of a physical room:

- cream stucco holding the warmth of the day
- painted walls and old-building structure
- paper menus handled all night
- neon beer signs casting color into the room
- a bar that feels lively, familiar, and slightly indulgent

The right reference point is not "fun Mexican restaurant website." It is a
specific crossover of Tex-Mex hospitality, old fire-station bones, and
80s-adjacent nightlife glow. It should feel like the kind of place where the
lighting stays low, the beer signs do part of the decorating, the paper menu
lands on the table without ceremony, and everything looks better after dark.

- **Density:** `5/10` — balanced editorial spacing with enough breathing room
  for menu readability
- **Variance:** `7/10` — confidently asymmetric, but still structured enough to
  support fast scanning
- **Motion:** `6/10` — fluid, glossy, softly pulsing; never frantic

Atmospheric keywords to preserve:

- Cream stucco in warm evening light
- Aged neon on old walls
- Beer-sign color in the room
- Paper-menu confidence
- Menu-board confidence with poster-scale typography
- Palm-shadow nightlife haze
- Old-building cantina heat with urban edge

Secondary language to keep in the system:

- amber bottle glass
- painted block wall
- worn countertop edge
- hot-pink reflection on plaster
- taped flyer texture
- backlit beer-sign color
- old station architecture
- practical surfaces rather than polished ones

Emotional outcome:

- Guests should feel like they have arrived somewhere specific, stylish, and a
  little excessive in the right way.
- The page should read as premium and memorable before it reads as "useful web
  app."
- Usability must stay intact; the visual energy should frame the menu, not
  fight it.
- The room should feel flirtatious, warm, and social, not ironic or campy.
- The final impression should be "old-room warm and electric," not "minimal and tasteful."

## 2. Color Palette & Roles

Use one coherent warm-neutral system across the full route. The palette should
feel old-room warm and neon-touched, with one interactive accent family doing
the work. Do not mix cool app-grays with warm restaurant neutrals.

- **Stucco Canvas** (`#FCF6E8`) — Primary page background and overall room tone
- **Cream Tile** (`#F6F0E1`) — Soft elevated surfaces, nav fill, footer wash
- **Sun-Faded Plaster** (`#E8E2D1`) — Secondary surface blocks and subtle fills
- **Quiet Limestone Line** (`#E3DDCB`) — Hairlines, dividers, ruled section separators
- **Aged Brass Line** (`#B2ADA0`) — Stronger outlines, dotted rules, structural emphasis
- **Warm Char Ink** (`#312F26`) — Primary body text and grounded contrast
- **Smoked Cocoa** (`#5F5B51`) — Supporting copy, timestamps, metadata
- **Agave Ember** (`#8B4B00`) — Primary headline ink, anchors, premium emphasis
- **Sunset Signal** (`#FF8F00`) — Only interactive accent for active states, primary toggles, focus moments
- **Lacquer Bloom** (`#B60051`) — Reserved pigment for labels and theatrical punctuation; not a general accent system
- **House Red** (`#B31B25`) — Error and `86'D` state only; never general UI accent
- **Warm Porcelain** (`#FFF0E6`) — On-accent text for orange fills
- **Rose Porcelain** (`#FFEFF0`) — On-magenta text for small badges

Color rules:

- The route lives on warm cream and plaster, not white.
- Accent energy comes from orange. Magenta is reserved for occasional printed
  label moments, not a competing second theme.
- Chrome and mirrored references should be expressed through contrast, gloss,
  blur, and edge highlights, not cold metallic gradients.
- Glow is allowed only as soft bloom tied to warm surfaces. No electric blue,
  violet, or nightclub LED glow.

## 3. Typography Rules

The type system should feel like a collision between a polished menu board, a
nightlife flyer, and an upscale printed restaurant menu.

- **Display Serif:** `Newsreader` for major headings, menu titles, footer quote,
  and elegant pull moments. Use in italic or high-contrast upright styles.
- **Body Sans:** `Plus Jakarta Sans` for UI controls, descriptions, metadata,
  buttons, and functional reading.
- **Optional Stitch Upgrade Path:** Prefer `Fraunces` for more expressive
  display moments and `Satoshi` or `Outfit` for UI/body if Stitch needs a more
  opinionated pairing than the current route implementation.
- **Mono:** `JetBrains Mono` or `Geist Mono` for timestamps, version chips, or
  any future dense numeric metadata.

Scale and behavior:

- Hero title should feel poster-sized but controlled:
  `clamp(3rem, 8vw, 6.75rem)`
- Restaurant wordmark should stay elegant rather than oversized:
  `clamp(2rem, 2.6vw, 3rem)`
- Section titles should feel like printed category markers, not utility labels:
  around `1.3rem` to `1.6rem`
- Body copy should sit around `1rem` with relaxed line-height between `1.45`
  and `1.65`
- Uppercase utility text should use strong tracking between `0.08em` and
  `0.2em`

Typography intent:

- Headlines are theatrical, not loud for its own sake.
- Body text must stay clean and legible against textured warm backgrounds.
- Italic serif moments should feel like signature handwriting on a printed menu,
  not luxury fashion editorial overkill.

Banned typography directions:

- No `Inter`
- No startup-default sans stacks
- No cartoon fiesta lettering
- No Western saloon novelty fonts
- No generic wine-bar elegance
- No oversized all-caps paragraphs

## 4. Hero Composition

The hero must feel like the front page of a printed cantina menu enlarged to
architectural scale.

Required structure:

- Left-weighted or asymmetrically split layout
- Small uppercase kicker above the main title
- Large display title with dramatic serif weight
- Timestamp or live-status metadata living in its own adjacent column, never
  floating on top of the title
- A visible sense of editorial whitespace around the title lockup

Preferred Stitch behavior for future hero explorations:

- Use inline visual punctuation between headline words only if the inserted
  image feels physical and food-adjacent:
  margarita glass, chrome detail, tile crop, lacquered pepper, agave label
- Inline image inserts must sit at type height, rounded, and never overlap text
- On mobile, those inline visuals stack below the headline rather than forcing
  compressed line breaks

Hero copy rules:

- Avoid generic lifestyle claims
- Avoid invitation filler like "Scroll to explore"
- Keep the hero direct, menu-led, and confident
- Maximum one primary CTA if a CTA is ever introduced

## 5. Layout Principles

The layout should feel like a premium printed menu translated to the web using
editorial spacing, ruled divisions, and controlled asymmetry.

- Use max-width containment instead of full-bleed content blocks
- Primary content width should stay around `64rem`
- Header container can stretch wider, up to roughly `96rem`
- Footer can widen slightly beyond content, up to roughly `88rem`
- Prefer line-based section separation over stacked card grids
- Menu content should remain single-column for reading comfort, with horizontal
  asymmetry happening in header and hero zones

Structural rules:

- No overlapping layers in content regions
- No floating decorative shapes that interfere with scanning
- No generic three-card feature rows
- No dashboard-style box forests
- Use borders, dotted rules, and spacing rhythm to create hierarchy

Spacing rhythm:

- Section spacing should feel generous for drinks and slightly tighter for food
- Hero bottom gap should be one of the largest spacing moments on the page
- Item groups should breathe vertically; avoid compressed list density
- Mobile spacing should contract proportionally, not collapse abruptly

## 6. Component Stylings

### Top Navigation

- Sticky, cream-toned, and slightly translucent
- Backdrop blur should feel like polished glass over stucco, not frosted SaaS UI
- Divider line below nav should be subtle and warm
- The restaurant name acts as a premium wordmark, not a plain site title

### Menu Toggle

- Pill container with soft plaster fill and fine aged-brass border
- Active state uses **Sunset Signal** fill with warm porcelain text
- Shape is fully rounded and tactile
- Hover/focus states brighten slightly; no glow halo
- This control should read like a lacquered switch on a restaurant fixture

### Section Headers

- Uppercase serif title with ruled line extending across the remaining width
- Divider line should feel like a printed menu rule, not a heavy border
- Titles should hold enough contrast to anchor rapid scanning

### Menu Items

- Item rows use dotted rules to connect title and price
- Title and price share the same serif family for a printed-menu feel
- Descriptions use quiet sans body copy beneath the rule
- Upcharges appear as small rounded chips, restrained and secondary
- Cards are not needed for standard items; whitespace and rules do the work

### Specials Badge

- Use **Lacquer Bloom** for featured emphasis and small theatrical moments
- Badge should feel stamped or labeled, not gamified
- Keep it compact and uppercase

### 86'd State

- Use muted opacity plus thin red strike treatment
- Red should feel like practical menu marking, not alarming error UI
- Preserve readability; guests still need to see what is unavailable

### Dropdowns And User Controls

- Panels should feel like glossy paper or acrylic over warm light
- Use soft blur, subtle border, and warm shadow
- Keep option rows simple and typographic
- No icon-heavy command palettes

### Footer

- Footer should feel like the final panel of a printed menu
- Use a gentle cream gradient wash, never a hard box
- Quote or sign-off text can carry a slightly more romantic tone than the body
- Staff sign-in must remain in footer actions, not reintroduced at the top of
  the public page

### Loading, Empty, And Error States

- Loading states must use skeletal lines matching menu proportions
- Empty states should be understated and typographic
- No circular spinners
- Error copy should stay inline and plainspoken

## 7. Motion & Interaction

Motion should suggest neon reflection, lacquer sheen, and polished hospitality
without becoming club graphics.

- **Baseline spring:** `stiffness: 100`, `damping: 20`
- Animate using `transform` and `opacity` only
- Keep durations mostly in the `180ms` to `280ms` range for taps, toggles, and
  reveals
- Sticky nav transitions should feel smooth and physical, not abrupt

Allowed motion vocabulary:

- Soft sheen passing through skeleton loaders
- Quiet pulse on active menu toggle
- Subtle opacity shifts on hover for linked brand elements
- Mild stagger for category reveal if future Stitch concepts introduce richer
  entrance choreography

Motion bans:

- No bouncing arrows
- No parallax gimmicks
- No spinning icons
- No floating decorations disconnected from content
- No animated gradients that dominate the page

## 8. Responsive Behavior

The route must remain elegant and readable on phones first, then scale up.

- Below `980px`, header, hero, and footer stacks vertically
- Below `768px`, any multi-column explorations collapse to one column
- Below `640px`, preserve the compact grid-like header arrangement already used
  by the route
- Never allow horizontal overflow
- Tap targets stay at or above `44px`
- Hero title scales via `clamp()` and should remain intact without awkward
  orphan lines
- Timestamp and footer metadata should move below the hero or copy block instead
  of squeezing beside it
- If Stitch introduces inline hero images, they must stack below the headline on
  narrow screens

Mobile feel:

- Compact but still polished
- No crushed typography
- No tiny toggle pills
- No desktop spacing simply halved without judgment

## 9. Imagery, Texture, And Material Direction

Surface treatment should feel tangible and rooted in place.

- Stucco texture is the core environmental background
- Tile, chrome, mirrored detail, and lacquer should appear as supporting
  material cues
- Grain and bloom can be subtle atmospheric layers, never heavy overlays
- Photography, if added in future Stitch screens, should favor:
  close crops, warm night lighting, glassware reflections, plated Tex-Mex
  details, agave-adjacent objects, and signage fragments

Avoid:

- Beachy daylight lifestyle shots
- Flat vector taco illustrations
- Mocktail wellness photography
- Clean white studio food e-commerce styling

## 10. Content Tone

Written language should support the design world.

- Direct, stylish, and menu-first
- Warm without becoming goofy
- Slightly theatrical is fine
- Hospitality copy should sound lived-in and confident

Never write:

- "Elevate your dining experience"
- "Unleash bold flavors"
- "Seamless ordering"
- "Next-gen cantina"
- Generic placeholder names or fake metrics

## 11. Anti-Patterns (Banned)

Never let El Roy's drift into these patterns:

- No generic fiesta branding
- No startup taco app minimalism
- No sterile white modernism
- No rustic farm-to-table mood
- No beach-resort cliches without nightlife tension
- No pure black (`#000000`)
- No AI purple or blue-neon glow systems
- No `Inter`
- No generic serif defaults like `Georgia`, `Garamond`, or `Times New Roman`
- No three-equal-card feature rows
- No overlapping hero elements
- No floating decorative SVG clutter
- No oversized gradient headlines
- No generic centered hero
- No cartoon chili-pepper or sombrero styling
- No circular loading spinners
- No custom mouse cursors
- No emojis

## 12. Implementation Anchors

The current route already establishes several useful anchors that future Stitch
screens should respect unless intentionally replaced:

- Warm cream stucco background image with light overlay wash
- Serif-forward wordmark and hero title
- Center-positioned food/drinks toggle in the header
- Ruled section headers and dotted item-price separators
- Footer sign-in entry living in staff actions
- Stronger spacing compression for food-menu mode than drinks mode
- `86'D` treatment using strike-through plus a small red badge

## 13. Assets

- Stucco texture: `/assets/el-roys-cantina/stucco-texture.jpg`
- Cantina badge/logo: `/assets/el-roys-cantina/cantina-badge.png`

## Last Updated

2026-04-19
