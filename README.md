# El Roy's Drink Menu

A live, single-page drink menu for El Roy's — built with zero external dependencies and no build step. Staff sign in with email and password, update the menu in real time, save changes to Firebase, and push a formatted update to a GroupMe group. The public-facing view updates instantly via Firebase.

---

## Features

- **Live public menu** — displays beers on tap, infused tequilas, frozen marg flavors, cocktails, monthly specials, and canned & bottled offerings
- **Item descriptions** — optional per-item descriptions visible to the public via an expandable tap/click
- **Recipe management** — internal-only recipe notes per item, visible only in manager mode
- **86'd items** — mark items out of stock; they remain visible on the public menu with a strikethrough and "86'D" tag
- **Manager mode** — role-protected editing interface; add or remove items per category, toggle 86 status, and write item descriptions
- **Save vs. Send Update** — save menu changes to the database without notifying the group; send only when ready
- **Draft indicators** — green dot per item means it hasn't been announced yet; the Send Update button shows a change count when there are unsent changes
- **Supabase sign-in** — four-screen auth wizard: Sign In, Sign Up, Forgot Password, and Reset Password; role-based access (`none`, `manager`, `admin`)
- **GroupMe integration** — sends a formatted patch-notes message to a GroupMe group via a bot
- **Firebase cloud sync** — menu state and config sync across devices in real time via Firebase Realtime Database
- **Offline-capable** — falls back to localStorage if Firebase is unavailable
- **Categories tab** — admin can add, remove, or reorder menu categories
- **Design & Branding panel** — admin can set brand name, logo, fonts, and accent colors; color pickers include a typable hex input so exact color codes can be entered directly
- **Public menu footer** — displays the app version and last-updated timestamp; shows a PREVIEW badge on Vercel preview deployments
- **Database tab** — admin can prune items that have been removed from the menu
- **Accessible interface** — ARIA roles, live regions, focus management, and keyboard navigation throughout; screen-reader-friendly for all interactive controls
- **Zero client-side dependencies** — no build step, no package manager required

---

## Menu Categories

| Category | Description |
|---|---|
| 🍺 Beers on Tap | Current draft beer offerings |
| 🍻 Canned & Bottled | Canned and bottled offerings |
| 🍹 Cocktails | Craft cocktail offerings |
| 🌶️ Infused Tequila | Rotating infused margarita tequilas |
| 🧊 Frozen Marg | Current frozen margarita flavor(s) |
| ⭐ Monthly Specials | Featured cocktails and promos |

---

## Setup & Configuration

### 1. Firebase Realtime Database

1. Go to [Firebase Console](https://console.firebase.google.com) and create a project
2. Enable **Realtime Database** (start in test mode or set rules as needed)
3. Copy your **Database URL** (e.g. `https://your-app-default-rtdb.firebaseio.com`)
4. Go to **Project Settings → Service Accounts → Database Secrets** and generate a legacy secret

### 2. Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a project
2. Under **Project Settings → API**, copy the **Project URL** and **anon/public key**
3. Enable **Email auth** under **Authentication → Providers**
4. Create a `profiles` table (or equivalent) to store user roles (`none`, `manager`, `admin`)

### 3. GroupMe Bot

1. Go to [dev.groupme.com](https://dev.groupme.com) and sign in
2. Click **Bots → Create Bot**, select your group, give it a name
3. Copy the **Bot ID** shown after creation

### 4. Vercel Deployment

This app requires Vercel for full functionality. The `/api/` routes run as serverless functions and handle credential delivery, role lookups, and GroupMe proxying.

1. Fork or clone this repository and import it into [Vercel](https://vercel.com)
2. Set the following **Environment Variables** in the Vercel dashboard:
   - `FIREBASE_SECRET` — the legacy Firebase Database secret
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_ANON_KEY` — your Supabase anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase service role key (used by `/api/role`)
3. Deploy. The app is available at your Vercel project URL.

> **Note:** GitHub Pages and other plain static hosts will not work for write operations. Without the API routes, Firebase writes, Supabase auth config delivery, and GroupMe sending are all unavailable.

### 5. First-Time Sign-In

1. Open your Vercel deployment URL
2. Click **Sign In** in the top-right corner
3. Click **Sign up** in the auth overlay, fill in your first name, last name, email, and password — new accounts start with `role: none`
4. The first admin must be promoted manually via the **Supabase dashboard** (set their role to `admin` in the profiles table)
5. Once you have an admin account, additional users can be promoted via the **Admin** tab in the app

### 6. GroupMe and Firebase URL (In-App Config)

1. Sign in with an admin account
2. Open the **Admin** tab
3. Fill in:
   - **Firebase Database URL**
   - **GroupMe Bot ID**
   - **Menu Page URL** — the public URL for the app (included in GroupMe messages)
4. Click **Save** for each field

---

## Usage Guide

### Viewing the Menu (Public)

Open the page URL in any browser. The menu loads automatically from Firebase and shows all current items by category. Items marked 86'd appear with a strikethrough and red "86'D" tag. Items with a description show a **›** icon — tap or click to expand.

### Updating the Menu (Manager or Admin)

1. Click **Sign In** and enter your email and password. To reset a forgotten password, click **Forgot password?** on the Sign In screen, enter your email, and follow the link in the reset email — it opens the app directly to the Reset Password screen.
2. Use the **Manager** tab to edit each category:
   - Type an item name in the input field and press **+** (or Enter) to add it
   - Click **86** on an item to mark it out of stock; click **↩** to restore it
   - Click **📝** to add or edit an item description
   - Click **✕** to remove an item permanently
3. Items not yet announced to the group show a **green dot**; the Send Update button shows a change count when unsent changes exist
4. At the bottom of the manager screen:
   - **💾 SAVE** — saves all changes to Firebase without sending a GroupMe message
   - **🔥 SEND UPDATE** — saves changes and sends a patch-notes message to your GroupMe group, including any previously saved-but-not-sent changes; also updates the **Last Updated** timestamp in the header

### Changing Admin Settings

1. Click **Sign In** and sign in with an **admin** account
2. The **Admin** tab will be visible — `manager` role accounts cannot see it
3. Update Firebase URL, Bot ID, Menu URL, categories, design settings, or promote/demote users as needed

### Access Levels

| Action | `none` | `manager` | `admin` |
|---|---|---|---|
| View public menu | ✅ | ✅ | ✅ |
| Edit menu items | ❌ | ✅ | ✅ |
| Save to database | ❌ | ✅ | ✅ |
| Send to GroupMe | ❌ | ✅ | ✅ |
| View admin settings | ❌ | ❌ | ✅ |
| Change categories / design | ❌ | ❌ | ✅ |
| Promote / demote users | ❌ | ❌ | ✅ |

> **Note:** New accounts start with `role: none`. An admin must promote the account before the user can edit the menu.

---

## File Structure

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
└── CLAUDE.md         # AI assistant instructions and project context
```

Configuration is stored in Firebase and `localStorage`. The `FIREBASE_SECRET` and Supabase keys are kept server-side as Vercel environment variables and never exposed to the client directly.
