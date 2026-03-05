# CLAUDE.md — El Roy's Drink Menu

## Project Overview

A zero-dependency web app that powers the live drink menu for El Roy's. Staff update the menu through a PIN-protected manager interface; changes sync to Firebase Realtime Database and can be pushed to a GroupMe group as a formatted update.

## Architecture

- **Three files:** `index.html` (HTML structure), `style.css` (styles), `app.js` (logic). No build step, no bundler, and no package manager.
- **Firebase Realtime Database** — cloud sync for menu state and configuration across devices.
- **localStorage fallback** — used when Firebase is unavailable (offline-capable).
- **GroupMe Bot API** — sends formatted patch-note messages to a group chat.

## Menu Categories

| Key | Icon | Label | Subtitle |
|---|---|---|---|
| `beer` | 🍺 | Beers on Tap | Current draft offerings |
| `canned` | 🍻 | Canned & Bottled | Canned & bottled offerings |
| `tequila` | 🌶️ | Infused Tequila | Rotating infused marg tequila |
| `frozen` | 🧊 | Frozen Marg | Current frozen margarita flavor |
| `special` | ⭐ | Monthly Specials | Featured cocktails & promos |

## Access Levels

| Feature | Manager PIN | Owner PIN |
|---|---|---|
| Edit / save / send menu | Yes | Yes |
| View Admin tab | No | Yes |
| Change Firebase credentials, Bot ID, PINs | No | Yes |

Default manager PIN on first setup: `1234`. Set an Owner PIN during setup to lock admin settings.

> If no Owner PIN is set, any manager PIN holder can also access the Admin tab (backward-compatible behavior).

## Key Behaviors to Preserve

- **Save vs. Send Update:** `Save` persists to Firebase silently. `Send Update` saves *and* fires a GroupMe message + updates the "Last Updated" header timestamp.
- **Draft indicators:** A green dot on an item means it has been added/changed but not yet announced via Send Update.
- **86'd items:** Remain visible on the public menu with a strikethrough and "86'D" badge; toggled per item in manager mode.
- **Item descriptions:** Optional, expandable via a `›` icon on the public view; editable via `📝` in manager mode.
- **Item recipes/ingredients:** Optional ingredient list per item, editable via `🧪` in manager mode; displayed in the public expandable panel and in the Database tab.
- **Change count badge:** The Send Update button displays the number of unsent changes.
- **Autocomplete on add:** When typing a new item name, previously removed items matching the prefix appear as suggestions; selecting one restores its description and recipe.

## Manager Interface Tabs

The manager overlay has three tabs:

| Tab | Access | Purpose |
|---|---|---|
| **Manager** | Manager + Owner | Add/remove/edit items per category |
| **Admin** | Owner only (or any manager if no Owner PIN set) | Firebase credentials, Bot ID, Menu URL, PINs |
| **Database** | Manager + Owner | Searchable, sortable table of all items that have recipes |

### Database Tab Details
- Shows only items that have at least one ingredient in their recipe.
- Columns: Drink · Category · Recipe · Status
- Sortable alphabetically by drink name.
- Real-time search filters by drink name, category, or ingredient.
- Status badges: **On Menu** (green), **Off Menu** (gray), **86'd** (red).

## GroupMe Message Format

```
🔥 DRINK MENU UPDATES — Sun, Mar 4 at 2:30 PM

🍺 BEERS ON TAP
  ✅ + New Draft Beer Name
  ❌ - Old Draft Beer Name
  🚫 86'd: Item Name
  ↩ Back on Tap: Restored Item

📋 Full menu: [MENU_URL]
```

- Restore label is context-aware: "Back on Tap" for beer, "Back in Stock" for all other categories.
- A preview modal is shown before sending so staff can review changes.

## Firebase Data Structure

Data is written to `/menu.json` on the configured Realtime Database:

```json
{
  "beer":   { "items": [...], "lastSent": [...], "removed": [...] },
  "canned": { "items": [...], "lastSent": [...], "removed": [...] },
  "tequila":{ "items": [...], "lastSent": [...], "removed": [...] },
  "frozen": { "items": [...], "lastSent": [...], "removed": [...] },
  "special":{ "items": [...], "lastSent": [...], "removed": [...] },
  "_meta":  { "lastUpdatedTs": "1234567890" },
  "_config":{ "pin": "...", "ownerPin": "...", "botId": "...", "menuUrl": "...", "fbSecret": "...", "fbUrl": "..." }
}
```

Per-item fields: `id`, `name`, `desc`, `recipe` (array of strings), `eightySixed` (boolean).

- **Reads** are public (no auth).
- **Writes** use `?auth={FB_SECRET}` query param.
- The public view auto-refreshes from Firebase every 60 seconds.
- Polling stops when entering manager mode.

## Development Guidelines

- **Do not introduce external dependencies.** The app must remain self-contained with no external libraries or package manager.
- **No build tools.** Changes are made directly to `index.html`, `style.css`, or `app.js` as appropriate.
- **Firebase config is entered at runtime** (stored in localStorage/Firebase), not hardcoded.
- **Test in-browser** — open `index.html` directly in a browser or serve it with any static file server (e.g., `npx serve .`).
- Keep the manager and owner PIN flows intact when modifying authentication logic.
- Preserve offline/localStorage fallback behavior when touching Firebase sync code.

## Hosting

The files can be hosted on GitHub Pages, Netlify, Vercel, or any static host. No backend or server-side logic is required.

## Repository Structure

```
El-Roys-Drink-Menu/
├── index.html   # HTML structure and markup
├── app.js       # All JavaScript logic
├── style.css    # All CSS styles
├── README.md    # Setup and usage documentation
└── CLAUDE.md    # This file
```
