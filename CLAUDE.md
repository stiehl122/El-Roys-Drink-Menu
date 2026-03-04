# CLAUDE.md — El Roy's Drink Menu

## Project Overview

A zero-dependency web app that powers the live drink menu for El Roy's. Staff update the menu through a PIN-protected manager interface; changes sync to Firebase Realtime Database and can be pushed to a GroupMe group as a formatted update.

## Architecture

- **Three files:** `index.html` (HTML structure), `style.css` (styles), `app.js` (logic). No build step, no bundler, and no package manager.
- **Firebase Realtime Database** — cloud sync for menu state and configuration across devices.
- **localStorage fallback** — used when Firebase is unavailable (offline-capable).
- **GroupMe Bot API** — sends formatted patch-note messages to a group chat.

## Menu Categories

| Key | Label |
|---|---|
| `beers` | Beers on Tap |
| `infusedTequila` | Infused Tequila |
| `frozenMarg` | Frozen Marg |
| `monthlySpecials` | Monthly Specials |
| `cannedBottled` | Canned & Bottled |

## Access Levels

| Feature | Manager PIN | Owner PIN |
|---|---|---|
| Edit / save / send menu | Yes | Yes |
| View Admin tab | No | Yes |
| Change Firebase credentials, Bot ID, PINs | No | Yes |

Default manager PIN on first setup: `1234`. Set an Owner PIN during setup to lock admin settings.

## Key Behaviors to Preserve

- **Save vs. Send Update:** `Save` persists to Firebase silently. `Send Update` saves *and* fires a GroupMe message + updates the "Last Updated" header timestamp.
- **Draft indicators:** A green dot on an item means it has been added/changed but not yet announced via Send Update.
- **86'd items:** Remain visible on the public menu with a strikethrough and "86'D" badge; toggled per item in manager mode.
- **Item descriptions:** Optional, expandable via a `›` icon on the public view; editable via `📝` in manager mode.
- **Change count badge:** The Send Update button displays the number of unsent changes.

## Development Guidelines

- **Do not introduce external dependencies.** The app must remain self-contained with no external libraries or package manager.
- **No build tools.** Changes are made directly to `index.html`, `style.css`, or `app.js` as appropriate.
- **Firebase config is entered at runtime** (stored in localStorage/Firebase), not hardcoded.
- **Test in-browser** — open `index.html` directly in a browser or serve it with any static file server (e.g., `npx serve .`).
- Keep the manager and owner PIN flows intact when modifying authentication logic.
- Preserve offline/localStorage fallback behavior when touching Firebase sync code.

## Hosting

The file can be hosted on GitHub Pages, Netlify, Vercel, or any static host. No backend or server-side logic is required.

## Repository Structure

```
El-Roys-Drink-Menu/
├── index.html   # HTML structure and markup
├── app.js       # All JavaScript logic
├── style.css    # All CSS styles
├── README.md    # Setup and usage documentation
└── CLAUDE.md    # This file
```
