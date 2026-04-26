# Final Brand Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace temporary web and iOS launch icons with final approved assets and add social preview images.

**Architecture:** Keep static assets in the repo and continue using plain HTML/Xcode asset catalogs. Tests should fail on `ELROYSTEMPLOGO` references in launch-facing icon locations while allowing historical docs to mention the old name.

**Tech Stack:** Plain HTML, Xcode asset catalogs, Node tests, iOS Release simulator build.

---

## Ownership

Codex can update references, asset catalog JSON, tests, and docs. Project owner intervention is required to provide final approved PNG assets or authorize existing restaurant logo files as final launch assets.

## Required Owner Assets

- `assets/brand/web-favicon.png`, square PNG, at least 512x512.
- `assets/brand/social-preview.png`, 1200x630 PNG or JPG.
- iOS app icon PNGs: 120, 152, 167, 180, and 1024 square pixels with no alpha for the 1024 marketing icon.

## File Structure

- Create: `assets/brand/README.md`
- Create: `assets/brand/web-favicon.png` after owner provides asset.
- Create: `assets/brand/social-preview.png` after owner provides asset.
- Modify: `index.html`, `manager/index.html`, `admin/index.html`, `leroyslounge/index.html`, `elroyscantina/index.html`
- Modify: `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Replace files under `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/`
- Test: `tests/final-brand-assets.test.cjs`

### Task 1: Add Launch Asset Guard Test

**Files:**
- Create: `tests/final-brand-assets.test.cjs`

- [ ] **Step 1: Write failing test**

Create:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const launchFiles = [
  'index.html',
  'manager/index.html',
  'admin/index.html',
  'leroyslounge/index.html',
  'elroyscantina/index.html',
  'ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/Contents.json',
];

test('launch-facing files do not reference temporary logo artwork', () => {
  for (const file of launchFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /ELROYSTEMPLOGO/, `${file} still references temporary artwork`);
  }
});

test('web launch metadata has favicon and social preview image', () => {
  assert.equal(existsSync('assets/brand/web-favicon.png'), true);
  assert.equal(existsSync('assets/brand/social-preview.png'), true);
  const root = readFileSync('index.html', 'utf8');
  assert.match(root, /<link rel="icon" type="image\/png" href="\/assets\/brand\/web-favicon\.png">/);
  assert.match(root, /<meta property="og:image" content="https:\/\/el-roys-drink-menu\.vercel\.app\/assets\/brand\/social-preview\.png">/);
  assert.match(root, /<meta name="twitter:image" content="https:\/\/el-roys-drink-menu\.vercel\.app\/assets\/brand\/social-preview\.png">/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/final-brand-assets.test.cjs
```

Expected: FAIL because temporary logo references and missing final assets exist.

- [ ] **Step 3: Commit failing test**

```bash
git add tests/final-brand-assets.test.cjs
git commit -m "test: require final launch brand assets"
```

### Task 2: Add Owner-Provided Assets

**Files:**
- Create: `assets/brand/README.md`
- Create: `assets/brand/web-favicon.png`
- Create: `assets/brand/social-preview.png`
- Replace: `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/*.png`

- [ ] **Step 1: Add asset folder note**

Create `assets/brand/README.md`:

```markdown
# Brand Launch Assets

These files are final launch assets approved by the project owner.

- `web-favicon.png`: square web favicon and browser icon.
- `social-preview.png`: 1200x630 social sharing image for Open Graph and Twitter cards.
- iOS app icon source files live in `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/`.
```

- [ ] **Step 2: Place approved files**

Add the owner-provided files at the exact paths listed in Required Owner Assets. Preserve PNG filenames exactly:

```text
assets/brand/web-favicon.png
assets/brand/social-preview.png
ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/AppIcon-120.png
ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/AppIcon-152.png
ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/AppIcon-167.png
ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/AppIcon-180.png
ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

- [ ] **Step 3: Commit binary assets**

```bash
git add assets/brand ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset
git commit -m "chore: add final launch brand assets"
```

### Task 3: Wire Web Metadata And iOS AppIcon Catalog

**Files:**
- Modify: root and route HTML files
- Modify: `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Test: `tests/final-brand-assets.test.cjs`

- [ ] **Step 1: Update web favicon and social tags**

In each web shell head, replace:

```html
<link rel="icon" type="image/png" href="/ELROYSTEMPLOGO.png">
```

with:

```html
<link rel="icon" type="image/png" href="/assets/brand/web-favicon.png">
<meta property="og:image" content="https://el-roys-drink-menu.vercel.app/assets/brand/social-preview.png">
<meta name="twitter:image" content="https://el-roys-drink-menu.vercel.app/assets/brand/social-preview.png">
```

For self-closing route heads, use the same URLs with trailing `/` only if the file already uses XHTML-style tags.

- [ ] **Step 2: Update iOS icon catalog filenames**

Set `ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset/Contents.json` image filenames to:

```json
[
  { "filename": "AppIcon-120.png", "idiom": "iphone", "scale": "2x", "size": "60x60" },
  { "filename": "AppIcon-180.png", "idiom": "iphone", "scale": "3x", "size": "60x60" },
  { "filename": "AppIcon-152.png", "idiom": "ipad", "scale": "2x", "size": "76x76" },
  { "filename": "AppIcon-167.png", "idiom": "ipad", "scale": "2x", "size": "83.5x83.5" },
  { "filename": "AppIcon-1024.png", "idiom": "ios-marketing", "scale": "1x", "size": "1024x1024" }
]
```

Keep the existing `"info"` object.

- [ ] **Step 3: Run tests and build**

Run:

```bash
node --test tests/final-brand-assets.test.cjs tests/phase23-logo-branding-boundaries.test.cjs
xcodebuild build -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

Expected: tests PASS and Release build succeeds.

- [ ] **Step 4: Commit**

```bash
git add index.html manager/index.html admin/index.html leroyslounge/index.html elroyscantina/index.html ios/ElRoysManagerApp/Assets.xcassets/AppIcon.appiconset tests/final-brand-assets.test.cjs
git commit -m "fix: replace temporary launch branding"
```

## Self-Review Notes

- Spec coverage: covers web favicon, social cards, iOS AppIcon, and temporary-name regression.
- Placeholder scan: no implementation placeholders; owner-provided binary assets are explicitly listed.
- Intervention scan: owner must provide or approve final assets.
