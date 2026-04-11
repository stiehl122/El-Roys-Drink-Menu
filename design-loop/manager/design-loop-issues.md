# Manager Design Loop Issues

## Pass 1 audit

1. The unauthenticated manager state leaves too much dead canvas between the topbar and the auth dialog, so the page reads as unfinished instead of intentional.
2. The auth card is undersized for desktop and visually disconnected from the manager shell, especially when no menu is selected yet.
3. Dark mode contrast is too weak in the auth flow. The primary action loses emphasis and the shell recedes into a near-black wash.
4. Mobile auth states need stronger sheet treatment and spacing so Sign In, Create Account, and Reset Password feel anchored to the route rather than floating above it.
5. The drawer action cluster needs stronger hierarchy so `Return to menu` clearly belongs to the nav rail and does not read like a generic utility button.
