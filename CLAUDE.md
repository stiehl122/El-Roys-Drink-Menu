# CLAUDE.md — El Roy's Drink Menu

## Project Overview

A zero-dependency web app that powers the live drink menu for El Roy's. Staff sign in via Supabase email/password auth; changes sync to Firebase Realtime Database and can be pushed to a GroupMe group as a formatted update.

## Architecture

- **Three files:** `index.html` (HTML structure), `style.css` (styles), `app.js` (logic). No build step, no bundler, and no package manager.
- **Firebase Realtime Database** — cloud sync for menu state and configuration across devices.
- **localStorage fallback** — used when Firebase is unavailable (offline-capable).
- **GroupMe Bot API** — sends formatted patch-note messages to a group chat.
- **Supabase** — authentication (email/password) and role management (`none`, `manager`, `admin`).
- **Vercel API routes** — four serverless endpoints required for full functionality:
  - `/api/config` — serves Supabase credentials to the client
  - `/api/role` — looks up the authenticated user's role
  - `/api/firebase-config` — serves the Firebase secret for database writes
  - `/api/send-groupme` — proxies GroupMe Bot API calls server-side
- Full functionality requires Vercel (or equivalent serverless) deployment for the API routes. Plain static hosting will not support Firebase writes or GroupMe sending.

## Menu Categories

| Key | Label |
|---|---|
| `beer` | Beers on Tap |
| `canned` | Canned & Bottled |
| `cocktails` | Cocktails |
| `tequila` | Infused Tequila |
| `frozen` | Frozen Marg |
| `special` | Monthly Specials |

## Access Levels

| Feature | `manager` role | `admin` role |
|---|---|---|
| Edit / save / send menu | Yes | Yes |
| View Admin tab | No | Yes |
| Change categories, design, database settings | No | Yes |

New accounts start with `role: none` and require admin promotion before they can access the manager interface.

## Key Behaviors to Preserve

- **Save vs. Send Update:** `Save` persists to Firebase silently. `Send Update` saves *and* fires a GroupMe message + updates the "Last Updated" header timestamp.
- **Draft indicators:** A green dot on an item means it has been added/changed but not yet announced via Send Update.
- **86'd items:** Remain visible on the public menu with a strikethrough and "86'D" badge; toggled per item in manager mode.
- **Item descriptions:** Optional, expandable via a `›` icon on the public view; editable via `📝` in manager mode.
- **Change count badge:** The Send Update button displays the number of unsent changes.
- **Sign-up flow:** New accounts are created with `role: none`. An admin must promote the account to `manager` or `admin` via the Admin tab (or the Supabase dashboard) before the user can edit the menu.
- **Public menu footer:** The footer on the public menu view displays the app version (`APP_VERSION` constant in `app.js`) and the last-updated timestamp. On Vercel preview deployments, it also shows a `PREVIEW` badge (detected via `IS_PREVIEW`, which checks that the hostname contains `vercel.app` but does not match the production URL pattern).

## Development Guidelines

- **Always ask clarifying questions** before making changes if the request is ambiguous or could be interpreted in multiple ways.
- **Do not introduce external dependencies.** The app must remain self-contained with no external libraries or package manager.
- **No build tools.** Changes are made directly to `index.html`, `style.css`, or `app.js` as appropriate.
- **Firebase Secret (`FIREBASE_SECRET`) is a Vercel environment variable**, not entered in the UI at runtime. The client retrieves it via `/api/firebase-config`.
- **Test in-browser** — for full functionality, deploy to Vercel and use the live URL. Local testing without the API routes will run in read-only / offline mode.
- Keep Supabase auth and role-check flows intact when modifying authentication logic.
- Preserve offline/localStorage fallback behavior when touching Firebase sync code.

## Hosting

**Vercel is the required host** for full functionality. The four API routes in `/api/` must run as serverless functions. GitHub Pages or other plain static hosts will not support Firebase writes (`FIREBASE_SECRET`), Supabase config delivery, or GroupMe sending.

## Repository Structure

```
El-Roys-Drink-Menu/
├── index.html        # HTML structure and markup
├── app.js            # All JavaScript logic
├── style.css         # All CSS styles
├── api/
│   ├── config.js         # Serves Supabase URL + anon key
│   ├── role.js           # Looks up authenticated user's role
│   ├── firebase-config.js# Serves Firebase secret (FIREBASE_SECRET env var)
│   └── send-groupme.js   # Proxies GroupMe Bot API calls
├── README.md         # Setup and usage documentation
└── CLAUDE.md         # This file
```
