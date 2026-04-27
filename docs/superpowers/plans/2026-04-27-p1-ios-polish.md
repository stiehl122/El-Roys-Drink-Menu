# P1 iOS First-Use Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the iOS app feel production-ready on first use by removing demo-login signals, preventing bottom navigation overlap, and giving web previews understandable loading/error feedback.

**Architecture:** Keep changes inside SwiftUI feature views so this lane does not conflict with the save-state model fix. Add source-contract coverage for production auth copy, bottom-nav clearance, and preview loading/error states.

**Tech Stack:** SwiftUI, WebKit, Node source-contract tests, iOS simulator build.

---

### Task 1: Remove Demo Credential Signals From Login

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Auth/AuthViews.swift`
- Test: `tests/ios-source-contracts.test.cjs`

- [ ] **Step 1: Add failing source-contract coverage**

Add this test to `tests/ios-source-contracts.test.cjs`.

```js
test('iOS login screen does not show demo credentials in production copy', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'ios/ElRoysManagerApp/Features/Auth/AuthViews.swift'), 'utf8');
  assert.doesNotMatch(source, /manager@elroys\.example/);
  assert.doesNotMatch(source, /••••••••/);
  assert.match(source, /TextField\("Email", text: \$model\.email\)/);
  assert.match(source, /SecureField\("Password", text: \$model\.password\)/);
});
```

- [ ] **Step 2: Run the failing source-contract test**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected before implementation: FAIL because demo/example placeholders are still present.

- [ ] **Step 3: Update login field placeholders**

In `ios/ElRoysManagerApp/Features/Auth/AuthViews.swift`, replace:

```swift
TextField("manager@elroys.example", text: $model.email)
SecureField("••••••••", text: $model.password)
```

with:

```swift
TextField("Email", text: $model.email)
SecureField("Password", text: $model.password)
```

Keep existing keyboard, text content type, autocapitalization, and submit behavior.

### Task 2: Prevent Home Bottom Navigation From Covering Content

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Home/HomeViews.swift`
- Test: `tests/ios-source-contracts.test.cjs`

- [ ] **Step 1: Add failing source-contract coverage**

Add this test to `tests/ios-source-contracts.test.cjs`.

```js
test('iOS home screen reserves explicit clearance for bottom navigation', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'ios/ElRoysManagerApp/Features/Home/HomeViews.swift'), 'utf8');
  assert.match(source, /private let homeBottomNavigationClearance: CGFloat = 132/);
  assert.match(source, /Color\.clear\.frame\(height: homeBottomNavigationClearance\)/);
});
```

- [ ] **Step 2: Run the failing source-contract test**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected before implementation: FAIL because the current clearance is too small and hard-coded.

- [ ] **Step 3: Add a named bottom-nav clearance constant**

Near the top of `ios/ElRoysManagerApp/Features/Home/HomeViews.swift`, add:

```swift
private let homeBottomNavigationClearance: CGFloat = 132
```

Replace the current end-of-scroll spacer:

```swift
Color.clear.frame(height: 18)
```

with:

```swift
Color.clear.frame(height: homeBottomNavigationClearance)
```

Do not change the `HomeBottomNav` visual design in this task.

### Task 3: Add Loading And Error States To Exact Route Preview

**Files:**
- Modify: `ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift`
- Test: `tests/ios-source-contracts.test.cjs`

- [ ] **Step 1: Add failing source-contract coverage**

Add this test to `tests/ios-source-contracts.test.cjs`.

```js
test('iOS exact route preview has loading and error states', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift'), 'utf8');
  assert.match(source, /enum WebPreviewLoadState/);
  assert.match(source, /ProgressView\("Loading preview"/);
  assert.match(source, /Preview unavailable/);
  assert.match(source, /makeCoordinator\(\)/);
  assert.match(source, /webView\(_ webView: WKWebView, didFail/);
});
```

- [ ] **Step 2: Run the failing source-contract test**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected before implementation: FAIL because `WebPreview` currently lacks loading/error state.

- [ ] **Step 3: Implement preview load-state UI**

In `ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift`, add:

```swift
private enum WebPreviewLoadState: Equatable {
    case loading
    case loaded
    case failed(String)
}
```

Update the route preview screen to own:

```swift
@State private var loadState: WebPreviewLoadState = .loading
```

Pass it into `WebPreview`:

```swift
WebPreview(url: url, loadState: $loadState)
```

Overlay this state UI above the web view:

```swift
switch loadState {
case .loading:
    ProgressView("Loading preview")
        .padding()
case .loaded:
    EmptyView()
case .failed:
    VStack(spacing: 8) {
        Text("Preview unavailable")
            .font(.headline)
        Text("Check the network connection and try again.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }
    .padding()
}
```

- [ ] **Step 4: Add a WebKit coordinator**

Update `WebPreview` to accept a binding and implement navigation callbacks:

```swift
private struct WebPreview: UIViewRepresentable {
    let url: URL
    @Binding var loadState: WebPreviewLoadState

    func makeCoordinator() -> Coordinator {
        Coordinator(loadState: $loadState)
    }

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.navigationDelegate = context.coordinator
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if uiView.url != url {
            loadState = .loading
            uiView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding private var loadState: WebPreviewLoadState

        init(loadState: Binding<WebPreviewLoadState>) {
            _loadState = loadState
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loadState = .loaded
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            loadState = .failed(error.localizedDescription)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            loadState = .failed(error.localizedDescription)
        }
    }
}
```

If the existing `WebPreview` already has additional configuration, preserve it and add the coordinator around it.

### Task 4: Verify iOS Polish Build

**Files:**
- Verify: `ios/ElRoysManagerApp/Features/Auth/AuthViews.swift`
- Verify: `ios/ElRoysManagerApp/Features/Home/HomeViews.swift`
- Verify: `ios/ElRoysManagerApp/Features/Preview/RoutePreviewView.swift`
- Verify: `tests/ios-source-contracts.test.cjs`

- [ ] **Step 1: Run source-contract tests**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Build the iOS app**

Run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

Expected: `** BUILD SUCCEEDED **`.

