# Manager Design Loop Issues

## Auth overlay — dark mode broken

1. **[CRITICAL] Auth overlay has zero dark mode support.** The auth card (Sign In, Create Account, Reset Password) stays white (`#f7fafc`) with light-mode text/borders in dark mode. The overlay backdrop goes dark but the card doesn't adapt, creating a jarring white-on-black contrast that breaks visual cohesion with the manager shell's otherwise well-implemented dark palette. Every color in `auth-overlay-unified.css` is hardcoded — there are no `@media (prefers-color-scheme: dark)` rules.

2. **Auth card uses its own color system instead of manager shell tokens.** The auth overlay uses hardcoded values (`#f7fafc`, `#2d3748`, `#718096`, `#fff`) instead of the `--manager-shell-*` custom properties. This means the warm beige light palette and green-tinted dark palette of the manager shell don't flow into the auth experience.

3. **Auth card typography is disconnected.** The card uses `Epilogue`/`Space Grotesk` while the manager shell uses `Noto Serif`/`Inter`. This makes the auth flow feel like a foreign component dropped onto the page rather than part of the same product.

## Unauthenticated shell — empty and directionless

4. **Unauthenticated shell is a dead canvas.** Dismissing the auth dialog leaves the user on a vast empty page with only "Sign in to access settings." centered. No branding, no call-to-action, no visual invitation to sign back in. The page reads as broken rather than intentional.

5. **Cancel button on auth dialog leads to a dead state.** The Cancel button dismisses the auth overlay but leaves the user stranded with nothing actionable. For unauthenticated users, the auth dialog should either be non-dismissible or the background shell should offer a clear way to re-open it.

6. **"No sent updates yet" and header meta visible in unauth state.** Text like "No menu selected" and "No sent updates yet" bleeds through into the unauthenticated view, exposing internal state that's meaningless to a user who hasn't signed in.

7. **Mobile hamburger opens empty drawer when unauthenticated.** The hamburger button is visible and clickable, shows `aria-expanded="true"`, but nothing appears — confusing since the drawer only has content post-auth. The button should either be hidden or the drawer should show a sign-in prompt.

## Visual rhythm and craft

8. **Desktop auth card is undersized for the viewport.** At `max-width: 340px` on a 1440px desktop, the card occupies ~24% of the width. It floats small in the center with excessive dead space. The proportions make the dialog feel timid rather than confident.

9. **Auth overlay backdrop lacks warmth.** The overlay background is `rgba(0, 0, 0, 0.6)` — a neutral black scrim that doesn't match the warm palette of the manager shell. A tinted scrim would feel more cohesive.

10. **Drawer action cluster hierarchy needs work.** The `Return to menu` button in the sidebar drawer reads like a generic utility button rather than a clear navigation action. It lacks visual distinction from the section navigation buttons.
