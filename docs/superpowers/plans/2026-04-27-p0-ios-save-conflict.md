# P0 iOS Save Conflict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a successful iOS live save leave the editor in a clean, trusted state instead of immediately showing a remote-update conflict or persistent drafting state.

**Architecture:** Treat the successful live-save response as the authoritative editor baseline. Centralize the post-save rebaseline behavior in `AppModel` so quiet saves and notification saves clear local draft/conflict state, remove stale offline drafts, and refresh notices consistently.

**Tech Stack:** Swift, SwiftUI app model, XCTest, `xcodebuild`, Node source-contract tests.

---

### Task 1: Add Regression Coverage For Successful Save Clean State

**Files:**
- Modify: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`
- Read: `ios/ElRoysManagerAppTests/TestSupport.swift`
- Read: `ios/ElRoysManagerApp/App/AppModel.swift`

- [ ] **Step 1: Inspect existing save/update test helpers**

Run:

```bash
sed -n '1,260p' ios/ElRoysManagerAppTests/TestSupport.swift
sed -n '1,260p' ios/ElRoysManagerAppTests/MenuDocumentTests.swift
```

Expected: identify the existing test app model factory, fake services, and menu document fixtures.

- [ ] **Step 2: Add a failing test for live-save rebaseline**

Add this XCTest near the existing editor/save tests in `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`. If helper names differ, adapt only the setup calls; preserve the assertions and scenario.

```swift
@MainActor
func testSuccessfulLiveSaveClearsRemoteUpdateAndOfflineDraftState() async throws {
    let harness = try TestAppModelHarness.makeSignedInManager()
    let model = harness.model

    try await model.openEditor(menuID: "leroys-lounge-food")

    guard var document = model.currentEditorDocument else {
        XCTFail("Expected editor document to open")
        return
    }

    document.categories[0].items[0].notes = "AUDIT SAVE CLEAN STATE"
    model.currentEditorDocument = document
    model.markEditorDirtyForTesting()

    harness.liveSaveService.nextResponse = LiveSaveResponse(
        ok: true,
        ts: 1_776_000_000_000,
        currentRevisions: MenuWorkspaceRevisions(
            savedRevision: 42,
            draftRevision: nil,
            publishedRevision: 42,
            notificationRevision: 41
        )
    )

    try await model.saveCurrentEditor(sendNotifications: false)

    XCTAssertFalse(model.editorDirty, "Successful live save should clear local dirty state.")
    XCTAssertNil(model.editorRefreshRequirement, "Successful live save should not require a refresh of the same user's save.")
    XCTAssertFalse(model.currentEditorWorkspace?.workspace.hasSharedDraft ?? true, "Successful live save should clear shared draft flags.")
    XCTAssertNil(model.currentEditorWorkspace?.workspace.revisions.draftRevision, "Successful live save should clear stale draft revision.")
    XCTAssertFalse(model.currentEditorWorkspace?.workspace.hasUnsentChanges ?? true, "Quiet live save should not keep the UI in an unsent/conflict state.")
    XCTAssertNil(try harness.offlineDraftStore.loadDraft(userId: model.authSession?.userID ?? "", menuId: "leroys-lounge-food"), "Successful live save should remove stale offline draft data.")
}
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testSuccessfulLiveSaveClearsRemoteUpdateAndOfflineDraftState
```

Expected before implementation: FAIL because one or more clean-state assertions are not currently true, or because the exact helper names need aligning with the existing test harness.

### Task 2: Centralize Successful Live-Save Rebaseline

**Files:**
- Modify: `ios/ElRoysManagerApp/App/AppModel.swift`

- [ ] **Step 1: Locate the existing save success branch**

Run:

```bash
rg -n "liveSave|saveCurrentEditor|Live Menu And Queue Updated|rebaselineCurrentEditorToServer|editorRefreshRequirement|offlineDraftStore" ios/ElRoysManagerApp/App/AppModel.swift
```

Expected: find the live-save function and the duplicated state updates after a successful save.

- [ ] **Step 2: Add a helper that adopts the successful save response**

In `ios/ElRoysManagerApp/App/AppModel.swift`, add this private `@MainActor` helper near the existing editor state helpers. Adjust only concrete type names if the file uses slightly different names.

```swift
@MainActor
private func adoptSuccessfulLiveSaveBaseline(
    document: EditableMenuDocument,
    response: LiveSaveResponse,
    sentNotifications: Bool
) {
    var savedDocument = document

    if let ts = response.ts {
        savedDocument.meta.lastUpdatedTs = ts
        savedDocument.meta.lastUpdatedDisplay = Self.formatTimestamp(ts)
    }

    if let currentRevisions = response.currentRevisions {
        currentEditorWorkspace?.workspace.revisions = currentRevisions
    }

    currentEditorDocument = savedDocument
    currentEditorWorkspace?.workspace.hasSharedDraft = false
    currentEditorWorkspace?.workspace.revisions.draftRevision = nil
    currentEditorWorkspace?.workspace.hasUnsentChanges = sentNotifications ? false : serverHasUnsentChanges(in: currentEditorWorkspace)
    editorRefreshRequirement = nil
    selectedPreviewChangeIDs = []
    editorDirty = false

    rebaselineCurrentEditorToServer(
        liveDocument: savedDocument,
        serverDocument: savedDocument,
        revisions: currentEditorWorkspace?.workspace.revisions
    )

    if let userID = authSession?.userID {
        try? offlineDraftStore.removeDraft(userId: userID, menuId: savedDocument.menuId)
    }

    updateEditorStateFlags(for: savedDocument)
}
```

- [ ] **Step 3: Replace inline success-state mutation with the helper**

In the successful live-save branch, replace the inline updates to `currentEditorWorkspace?.workspace.revisions`, `currentEditorDocument`, `hasSharedDraft`, `draftRevision`, `rebaselineCurrentEditorToServer`, and local draft cleanup with:

```swift
adoptSuccessfulLiveSaveBaseline(
    document: currentDocument,
    response: response,
    sentNotifications: sendNotifications
)
```

Keep the existing success notice copy, but make sure quiet save uses a calm success notice and notification save uses the notification-specific success notice.

- [ ] **Step 4: Guard remote-update handling from re-flagging own save**

Inside the refresh/remote-update path that sets `editorRefreshRequirement`, add this early exit before presenting conflict UI:

```swift
if !editorDirty,
   currentEditorWorkspace?.workspace.revisions.draftRevision == nil,
   currentEditorWorkspace?.workspace.hasSharedDraft == false {
    editorRefreshRequirement = nil
    return
}
```

Place it only after the workspace has been updated from the server response, so genuine remote changes still surface when there is a local unsaved draft.

### Task 3: Verify Save State In Simulator Build

**Files:**
- Modify only if tests identify a compile issue: `ios/ElRoysManagerApp/App/AppModel.swift`
- Test: `ios/ElRoysManagerAppTests/MenuDocumentTests.swift`

- [ ] **Step 1: Run the targeted XCTest**

Run:

```bash
xcodebuild test -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:ElRoysManagerAppTests/MenuDocumentTests/testSuccessfulLiveSaveClearsRemoteUpdateAndOfflineDraftState
```

Expected: PASS.

- [ ] **Step 2: Run the iOS build**

Run:

```bash
xcodebuild -project ios/ElRoysManagerApp.xcodeproj -scheme ElRoysManagerApp -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Run source-contract smoke tests**

Run:

```bash
node --test tests/ios-source-contracts.test.cjs
```

Expected: PASS.

