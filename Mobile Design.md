# Mobile Design

This file documents the mobile-specific UX changes that were requested and implemented for the public restaurant routes so future redesigns can preserve the same behavior without re-discovering it.

## Goals

- Make both public restaurant pages feel more native on iPhone, especially around the notch / Dynamic Island and home-indicator areas.
- Keep the route-owned design language for each restaurant instead of flattening them into one shared mobile pattern.
- Reduce header height on scroll for mobile while preserving fast menu switching.
- Keep manager/auth affordances available in the expanded state, but avoid clutter in the reduced state.

## Shared Mobile Rules

- Both routes use `viewport-fit=cover`.
- Both routes set route-specific `theme-color` so browser chrome blends with the page.
- Both routes use safe-area CSS variables:
  `env(safe-area-inset-top/right/bottom/left)`.
- The page background and sticky header background extend into the top safe area so the area around the Dynamic Island is visually owned by the route instead of the default page background.
- Footers include extra bottom safe-area spacing and a background blend instead of a hard stop at the bottom edge.
- Both routes include:
  skip link,
  explicit hero/logo image dimensions,
  touch polish,
  reduced-motion handling,
  cleaned-up mobile copy punctuation.

## Header Behavior

### Shared Scroll Logic

- Compact mode is mobile-only.
- Compact mode engages quickly on downward scroll.
- Compact mode releases only after a clearer upward scroll to avoid jitter.
- Route scripts manage these state classes:
  `is-mobile-compact`
  `is-mobile-expanded`
  `is-near-top`

### Leroy's Lounge

- Expanded header includes:
  centered logo/sign-in entry,
  Food/Drinks toggle,
  other restaurant link,
  swap/settings/admin actions,
  user chip when signed in.
- Reduced header keeps only:
  the logo/sign-in affordance,
  the Food/Drinks toggle.
- Reduced header hides:
  user/profile chip,
  settings,
  swap menu,
  exit buttons,
  other restaurant link.
- The compact state should feel assertive and utility-first.

### El Roy's Cantina

- Expanded header includes:
  brand name,
  Leroy's sister badge link,
  Food/Drinks toggle,
  login/profile/settings actions on the right.
- On mobile expanded state, the profile icon should stay on the right side so its dropdown opens on-screen.
- Reduced header keeps only:
  the El Roy's brand,
  the Food/Drinks toggle.
- Reduced header hides:
  login button,
  profile icon,
  settings/admin icon,
  sister-restaurant badge.
- The hero section below the sticky bar should stay visually stable; avoid aggressive resizing of the `THE MENU` title during compaction because it causes jitter.

## Profile / Dropdown Styling

- Dropdown panels must use readable dark text on light backgrounds.
- Do not allow light icon/text styling to carry into the white dropdown surface.
- User dropdowns should clamp to the viewport width on mobile.

## If Redesigning A Route Later

- Keep the current route-owned contract with shared `app.js` intact:
  route template,
  route CSS,
  route JS `initializeRoute()`,
  footer version / preview badge / last-updated output.
- Preserve the reduced-header intent:
  brand identity + Food/Drinks toggle only.
- Preserve safe-area ownership at the top and bottom.
- Preserve mobile toggle usability while compacted.
- If changing hero typography, avoid scroll-linked font-size animation on large title text.
