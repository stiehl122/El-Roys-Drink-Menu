# El Roy's Drink Menu

A live, single-page drink menu for El Roy's — built with zero external dependencies and no build step. Staff can update the menu in real time using a manager PIN, save changes to the database, and push a formatted update to a GroupMe group. The public-facing view updates instantly via Firebase.

---

## Features

- **Live public menu** — displays beers on tap, infused tequilas, frozen marg flavors, monthly specials, and canned & bottled offerings
- **Item descriptions** — optional per-item descriptions visible to the public via an expandable tap/click
- **Item recipes** — optional ingredient list per item; visible in the public expandable panel and searchable in the Database tab
- **86'd items** — mark items out of stock; they remain visible on the public menu with a strikethrough and "86'D" tag
- **Manager mode** — PIN-protected editing interface; add or remove items per category, toggle 86 status, write item descriptions, and manage recipes
- **Autocomplete on add** — when re-adding a previously removed item, its description and recipe are restored automatically
- **Save vs. Send Update** — save menu changes to the database without notifying the group; send only when ready
- **Draft indicators** — green dot per item means it hasn't been announced yet; the Send Update button shows a change count when there are unsent changes
- **Database tab** — searchable, sortable table of all items with recipes; filter by drink name, category, or ingredient
- **Owner mode** — separate owner PIN locks down admin settings so only you can change credentials and PINs
- **GroupMe integration** — sends a formatted patch-notes message to a GroupMe group via a bot
- **Firebase cloud sync** — menu state and config sync across devices in real time via Firebase Realtime Database
- **Offline-capable** — falls back to localStorage if Firebase is unavailable
- **Zero dependencies** — no build step, no server, no package manager required

---

## Menu Categories

| Category | Description |
|---|---|
| 🍺 Beers on Tap | Current draft beer offerings |
| 🌶️ Infused Tequila | Rotating infused margarita tequilas |
| 🧊 Frozen Marg | Current frozen margarita flavor(s) |
| ⭐ Monthly Specials | Featured cocktails and promos |
| 🍻 Canned & Bottled | Canned and bottled offerings |

---

## Setup & Configuration

### 1. Firebase Realtime Database

1. Go to [Firebase Console](https://console.firebase.google.com) and create a project
2. Enable **Realtime Database** (start in test mode or set rules as needed)
3. Copy your **Database URL** (e.g. `https://your-app-default-rtdb.firebaseio.com`)
4. Go to **Project Settings → Service Accounts → Database Secrets** and generate a secret (legacy auth token)

### 2. GroupMe Bot

1. Go to [dev.groupme.com](https://dev.groupme.com) and sign in
2. Click **Bots → Create Bot**, select your group, give it a name
3. Copy the **Bot ID** shown after creation

### 3. Enter Credentials (First-Time Setup)

1. Open `index.html` in a browser
2. Click **⚙ Manager** in the top-right corner
3. Enter the default manager PIN: `1234`
4. Switch to the **Admin** tab
5. Fill in:
   - **Firebase Database URL** and **Firebase Secret**
   - **GroupMe Bot ID**
   - **Menu Page URL** — the public URL where this file is hosted (included in GroupMe messages)
6. Click **Save** for each field
7. Update the **Manager PIN** from the default `1234` to something private
8. Set an **Owner PIN** — once set, only this PIN can access admin settings

### 4. Hosting (Optional)

Host all three files (`index.html`, `app.js`, `style.css`) from the same directory anywhere static files are served:
- GitHub Pages
- Netlify / Vercel (drag and drop)
- Any web server

No backend required — Firebase handles all data persistence.

---

## Usage Guide

### Viewing the Menu (Public)

Open the page URL in any browser. The menu loads automatically from Firebase and shows all current items by category. Items marked 86'd appear with a strikethrough and red "86'D" tag. Items with a description or recipe show a **›** icon — tap or click to expand.

### Updating the Menu (Manager)

1. Click **⚙ Manager** and enter your manager PIN
2. Use the **Manager** tab to edit each category:
   - Type an item name in the input field and press **+** (or Enter) to add it; previously removed items matching the name will appear as autocomplete suggestions and restore their description and recipe when selected
   - Click **86** on an item to mark it out of stock; click **↩** to restore it
   - Click **📝** to add or edit an item description
   - Click **🧪** to manage an item's ingredients (add or remove individual ingredients)
   - Click **✕** to remove an item permanently
3. Items not yet announced to the group show a **green dot**; the Send Update button shows a change count when unsent changes exist
4. At the bottom of the manager screen:
   - **💾 SAVE** — saves all changes to Firebase without sending a GroupMe message
   - **🔥 SEND UPDATE** — opens a preview of all changes, then sends a patch-notes message to your GroupMe group; also updates the **Last Updated** timestamp in the header

### Using the Database Tab

Switch to the **Database** tab in manager mode to see a searchable table of all items that have recipes:

- Search by drink name, category, or ingredient in real time
- Items are sorted alphabetically by name
- Status badges show whether each item is **On Menu**, **Off Menu**, or **86'd**

### Changing Admin Settings (Owner)

1. Click **⚙ Manager** and enter your **owner PIN** (not the manager PIN)
2. The **Admin** tab will be visible — manager PIN holders cannot see it
3. Update Firebase credentials, Bot ID, Menu URL, or PINs as needed

### Access Levels

| Action | Manager PIN | Owner PIN |
|---|---|---|
| Edit menu items | ✅ | ✅ |
| Save to database | ✅ | ✅ |
| Send to GroupMe | ✅ | ✅ |
| View admin settings | ❌ (hidden) | ✅ |
| Change Firebase / Bot ID | ❌ | ✅ |
| Change manager PIN | ❌ | ✅ |
| Change owner PIN | ❌ | ✅ |

> **Note:** If no owner PIN has been set, any manager PIN holder can access admin settings (backward-compatible behavior). Set an owner PIN as part of first-time setup.

---

## File Structure

```
El-Roys-Drink-Menu/
├── index.html   # HTML structure and markup
├── app.js       # All JavaScript logic
├── style.css    # All CSS styles
├── README.md    # Setup and usage documentation
└── CLAUDE.md    # AI assistant context and dev guidelines
```

All configuration is stored in the browser's `localStorage` and synced to Firebase. No build tools or package managers needed.
