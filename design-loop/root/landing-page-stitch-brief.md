# Public Landing Page Stitch Brief

**Parent PRD:** [#268](https://github.com/stiehl122/El-Roys-Drink-Menu/issues/268)  
**Slice:** [#269](https://github.com/stiehl122/El-Roys-Drink-Menu/issues/269)  
**Scope:** Public `/` landing page only. Do not redesign admin.

## Purpose

Design a new public homepage for El Roy's Drink Menu that replaces the current root site-picker with a richer, more premium, scroll-driven landing page.

The page must still be decision-first:

- Above the fold, users should be able to choose a restaurant and jump directly into that restaurant's **Food** menu.
- Below the fold, the page should unfold into a restrained Apple-style scroll narrative with hours, restaurant comparison, events, news, reviews, and a return-to-top control.

This is a **public homepage design brief**, not an admin-console design brief.

## Product Constraints

- This app serves exactly **two restaurants**:
  - **Leroy's Lounge**
  - **El Roy's Cantina**
- Do **not** generalize into arbitrary restaurant cards or a CMS-like marketplace layout.
- The page lives at `/` and acts as the site's public hub.
- The existing footer should remain functionally unchanged.
- The top-level CTA for each restaurant should route to that restaurant's **Food** menu.
- The design should be strong on both **desktop and mobile**.
- The page should feel premium and intentional, but **restrained**, not over-animated.

## Existing Brand Inputs

Reuse the current restaurant sign assets as the main hero imagery for this pass:

- Leroy's Lounge sign image
- El Roy's Cantina sign image

Do not require new photography for v1.

The homepage should keep a restrained neutral base and let each restaurant's brand accents carry the identity:

- Leroy's Lounge: warm, lounge-like, more American bites
- El Roy's Cantina: greener, cantina-forward, more Tex-Mex

## Core UX Goal

The page should help a user answer:

**"Where should I go tonight?"**

This is not a brochure site and not a generic restaurant-marketing page. It should prioritize:

1. Fast choice
2. Current status
3. Useful context
4. Social proof

## Visual Direction

Aim for a premium scroll story similar in spirit to modern [apple.com](https://apple.com) product pages, but toned down for readability and speed.

That means:

- strong section pacing
- clean hierarchy
- deliberate transitions
- a few meaningful pinned/reveal moments at most
- quiet confidence rather than flashy animation overload

Avoid:

- generic card-grid SaaS aesthetics
- loud parallax everywhere
- cluttered restaurant-directory layouts
- dashboard-like utility chrome
- dark, moody over-design that hurts legibility

The page should feel like a polished hospitality landing page with editorial rhythm.

## Required Page Structure

Design the landing page in this order for **v1**:

1. Hero / quick choice
2. Hours
3. Restaurant comparison
4. Events
5. News
6. Reviews
7. Back-to-top control
8. Existing footer

## Section 1: Hero / Quick Choice

This is the most important part of the page.

### Desktop behavior

- Two large side-by-side restaurant cards
- **Leroy's Lounge on the left**
- **El Roy's Cantina on the right**
- Stable left/right layout

### Mobile behavior

- Cards stack vertically
- Keep the stack clean and obvious
- For v1, assume stable ordering rather than dynamic reordering

### Each hero card must contain

- Restaurant name
- Existing sign/logo image as the dominant visual
- One short current-status line such as:
  - `Open until 10 PM`
  - `Closed until 12 PM`
- One explicit primary CTA to the restaurant's **Food** menu

### Hero constraints

- Do **not** add extra CTA clutter like Hours, Call, Events, or News buttons
- Do **not** surface "tonight's event" in the hero for v1
- Keep the first screen fast and clean
- The first impression should feel premium, but the conversion path should be immediate

### CTA tone

CTA labels should be explicit, but not mechanically identical. They can carry slight restaurant-specific personality as long as they clearly mean "go to this restaurant's food menu."

## Section 2: Hours

This section appears after the hero and should feel editorial, not spreadsheet-like.

### Requirements

- Show both restaurants
- Today should be emphasized first
- The rest of the week should unfold beneath in a quieter way
- The layout should feel high-end and readable

### v1 content model

Design for **recurring weekly hours only** in v1.

### Future compatibility note

The design should be able to absorb future special-date overrides in v2 without needing a full redesign. For example, it should be possible later to show something like:

- `Private Event: Closed`
- `Holiday Hours: 4 PM - 9 PM`

But do **not** make those override states the centerpiece of the v1 design.

## Section 3: Restaurant Comparison

This is a small, practical comparison section to help people choose based on the kind of food and night they want.

### Requirements

- Compare the restaurants in practical menu terms, not vague branding
- Hardcoded copy in v1
- Include one short supporting line beneath each side

### Content intent

- Leroy's Lounge: more American bites
- El Roy's Cantina: more Tex-Mex

This section should feel concise and useful, not like a giant manifesto.

## Section 4: Events

Events are a distinct section, not mixed into news.

### Requirements

- Tagged by:
  - Leroy's Lounge
  - El Roy's Cantina
  - Both
- Event cards should feel editorial and readable
- The design should allow a tasteful empty state like:
  - `Nothing scheduled right now`

### v1 behavior

- Events are manually managed
- Events are informational only
- No RSVP / ticket CTA required in v1
- No auto-expiry behavior needs to be emphasized in the design

### Design guidance

This section should feel alive without becoming poster-chaos. Think curated cultural programming, not an events marketplace.

## Section 5: News

News is also its own section, separate from events.

### Requirements

- Tagged by:
  - Leroy's Lounge
  - El Roy's Cantina
  - Both
- Clickable article cards
- Cards open off-site in a new tab
- Support cards that may or may not have an imported image

### Design guidance

The design should support:

- image-led article cards
- text-forward cards when no image is available

This section should feel like a curated news ribbon or editorial feed, not a blog homepage.

## Section 6: Reviews

Reviews come after events and news.

### Requirements

- Side-by-side restaurant comparison
- One shared carousel mechanism
- Each carousel step shows:
  - one Leroy's review
  - one El Roy's review
- On mobile, these two cards can stack vertically while still feeling like one shared turn

### Tone

This section should feel like calm, premium social proof, not a testimonial wall or marketing carousel ad.

### Inventory note

The actual product will hide the review section unless both restaurants have enough usable review inventory. The design should still fully define this section.

## Section 7: Dot Navigation

Add a subtle dot-nav for the major sections.

### Requirements

- Include the hero
- Visually minimal
- Quiet orientation aid, not primary navigation
- Should feel compatible with premium scroll storytelling

Do not use visible text labels as part of the default design language.

## Section 8: Back To Top

Place a circular upward-arrow return control between the last content section and the footer.

### Behavior intent

- It should feel earned, not always present
- It appears after the user has enough context to reasonably make a decision
- It should not feel like a floating utility widget

## Motion Guidance

Use motion carefully.

### Allowed motion ideas

- staggered entrances
- subtle scroll reveals
- soft pinned transitions for one or two moments at most
- refined crossfades / parallax accents
- carousel motion for reviews

### Avoid

- constant parallax
- dramatic snapping scroll hijacks
- complex motion that will be expensive to implement in plain JS/CSS
- decorative animation that competes with reading

## Accessibility and Readability Guidance

Even though this is a design brief, the layout should support:

- strong text contrast
- large tap targets on mobile
- legible section hierarchy
- clear CTA affordances
- realistic scroll behavior
- graceful empty states

Do not rely on tiny text, low-contrast editorial styling, or hover-only meaning.

## Technical Reality To Respect

The final site is a **zero-dependency web app** with route-owned public pages and no build step.

That means the design should be implementable with:

- plain HTML
- plain CSS
- plain JavaScript

Avoid patterns that assume a React app, component library, canvas-heavy rendering, or advanced animation frameworks.

## Explicit Exclusions

Do **not** redesign:

- admin
- manager
- restaurant route pages
- footer structure

Do **not** design:

- CMS controls
- database views
- notification systems
- publish history screens

This is **public landing page design only**.

## Deliverables Requested From Gemini / Stitch

Generate a polished public landing page design for **both desktop and mobile** that includes:

- the full page structure listed above
- the exact hero layout constraints
- premium but restrained motion direction
- section treatments for hours, comparison, events, news, and reviews
- a subtle dot-nav
- a return-to-top control

The output should feel like a real design system-ready homepage for this app, not a loose moodboard.

## Copy-Paste Prompt For Gemini

```md
Design a premium public homepage for a two-restaurant web app called El Roy's Drink Menu.

This page lives at the root route `/` and acts as the public hub of the site. It should replace a simple site-picker with a richer, scroll-driven landing page, but it must still help users make a restaurant decision quickly.

This is a public homepage design task only. Do not design admin, manager, or any back-office UI.

The site serves exactly two restaurants:

1. Leroy's Lounge
2. El Roy's Cantina

Do not generalize this into a multi-restaurant marketplace or restaurant directory. The homepage should feel purpose-built for exactly these two destinations.

Use an editorial, premium, Apple-style scroll experience, but keep it restrained. Think polished section pacing, strong hierarchy, subtle motion, and a high-end hospitality feel. Avoid generic SaaS cards, cluttered restaurant-directory layouts, or over-animated scroll hijacking.

Brand direction:

- Leroy's Lounge should feel warmer, lounge-like, and more American-bites-forward.
- El Roy's Cantina should feel greener, brighter, and more Tex-Mex-forward.
- Use a restrained neutral foundation and let each restaurant's accent identity do the work.
- Reuse existing restaurant sign/logo imagery as the dominant hero visual direction for this pass. Do not depend on new photography.

Required page order for v1:

1. Hero / quick choice
2. Hours
3. Restaurant comparison
4. Events
5. News
6. Reviews
7. Back-to-top control
8. Existing footer area below that

Hero requirements:

- Desktop: two large side-by-side cards
- Leroy's Lounge must be on the left
- El Roy's Cantina must be on the right
- Mobile: stacked cards
- Each card must include:
  - restaurant name
  - dominant sign/logo visual
  - one current status line such as “Open until 10 PM” or “Closed until 12 PM”
  - one explicit primary CTA to that restaurant's Food menu
- Do not add extra CTA clutter like Hours, Events, Call, or News buttons in the hero
- Keep the first screen fast, premium, and decision-first

Hours section requirements:

- Show both restaurants
- Emphasize today first
- Let the rest of the week unfold beneath in a quieter way
- This should feel editorial, not like a spreadsheet
- Design for recurring weekly hours in v1, but make sure the layout could later support special-date override states without requiring a full redesign

Restaurant comparison section:

- concise and useful
- compare the restaurants in practical food/menu terms, not vague branding language
- Leroy's Lounge should read as more American bites
- El Roy's Cantina should read as more Tex-Mex
- allow one short supporting line beneath each side
- do not make this a giant manifesto section

Events section:

- separate section, not mixed into news
- event cards can be tagged Leroy's Lounge, El Roy's Cantina, or Both
- should support a tasteful empty state like “Nothing scheduled right now”
- informational only for this version
- should feel curated and editorial, not like an event marketplace

News section:

- separate from events
- article cards can be tagged Leroy's Lounge, El Roy's Cantina, or Both
- cards open off-site in a new tab
- support both image-led cards and text-forward cards when no image is available
- should feel like a curated news feed, not a blog homepage

Reviews section:

- appears after events and news
- side-by-side restaurant comparison
- one shared carousel mechanism
- each carousel step shows one Leroy's review and one El Roy's review
- on mobile, these can stack vertically but should still feel like one carousel turn
- should feel calm, premium, and trustworthy rather than salesy

Dot-nav requirements:

- subtle, visually minimal
- includes the hero and major sections
- acts as a quiet orientation aid
- no obvious visible text labels in the default visual treatment

Back-to-top control:

- place a circular upward-arrow button between the final content section and the footer
- it should feel earned and elegant, not like a floating utility widget

Motion guidance:

- use only restrained motion
- allowed: staggered entrances, subtle reveals, a few polished transitions, soft pinned moments, and refined carousel movement
- avoid constant parallax, dramatic snapping scroll, or anything that would be difficult to implement in plain HTML/CSS/JavaScript without a framework

Accessibility / usability:

- strong text contrast
- realistic tap targets
- clear CTA hierarchy
- graceful empty states
- no tiny low-contrast editorial text
- do not depend on hover-only meaning

Technical reality:

- this will be implemented as a zero-dependency web app using plain HTML, CSS, and JavaScript
- no React assumptions
- no component-library assumptions
- no dashboard chrome

Please generate a polished desktop and mobile public homepage design that feels like the real source of truth for implementation, not just a moodboard.
```

## Approval Checklist

Use this brief as approved when the design direction still matches these decisions:

- public page only
- fast top-level restaurant choice
- Leroy's left, El Roy's right on desktop
- stable v1 hero order
- recurring-hours-first v1
- manual events/news lifecycle in v1
- separate Events and News sections
- side-by-side paired review carousel concept
- restrained Apple-style motion
- unchanged footer contract
