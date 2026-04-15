import XCTest
@testable import ElRoysManagerApp

final class MenuDocumentTests: XCTestCase {
  func testDeleteCategoryMovesItemsToOffMenuRecovery() {
    let workspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [
          makeItem(id: "item-1", name: "Orange Wine")
        ]
      )
    ])

    var document = EditableMenuDocument(workspace: workspace)
    document.deleteCategory(key: "wine")

    XCTAssertTrue(document.visibleCategories.isEmpty)
    XCTAssertEqual(document.uncategorizedItems.count, 1)
    XCTAssertFalse(document.uncategorizedItems[0].onMenu)
  }

  func testDuplicateDetectionIgnoresCurrentItemButBlocksMatchingSibling() {
    let workspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [
          makeItem(id: "item-1", name: "Orange Wine"),
          makeItem(id: "item-2", name: "Red Blend")
        ]
      )
    ])

    let document = EditableMenuDocument(workspace: workspace)

    XCTAssertFalse(document.hasDuplicate(named: "Orange Wine", in: "wine", excluding: "item-1"))
    XCTAssertTrue(document.hasDuplicate(named: "Orange Wine", in: "wine"))
    XCTAssertFalse(document.hasDuplicate(named: "Orange Wine", in: EditableMenuDocument.uncategorizedKey))
  }

  func testRemoveItemToOffMenuCreatesUncategorizedWhenMissing() {
    let workspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      )
    ])

    var document = EditableMenuDocument(workspace: workspace)
    document.removeItemToOffMenu(itemID: "item-1", from: "beer")

    XCTAssertEqual(document.visibleCategories.first?.items.count, 0)
    XCTAssertEqual(document.uncategorizedItems.count, 1)
    XCTAssertFalse(document.uncategorizedItems[0].onMenu)
  }

  func testEditableDocumentNormalizesDuplicateAndMissingIdentifiers() {
    let workspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "",
        menuId: nil,
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [
          MenuItemPayload(
            id: "",
            name: "Pilsner",
            desc: "",
            recipe: [],
            price: "$8",
            isEightySixed: false,
            displayOrder: 0,
            onMenu: true,
            visibility: "public",
            upcharges: [],
            showDescription: true,
            showRecipe: false
          )
        ]
      ),
      MenuCategoryPayload(
        id: "",
        menuId: nil,
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 1,
        items: [
          MenuItemPayload(
            id: "",
            name: "Rose",
            desc: "",
            recipe: [],
            price: "$12",
            isEightySixed: false,
            displayOrder: 0,
            onMenu: true,
            visibility: "public",
            upcharges: [],
            showDescription: true,
            showRecipe: false
          )
        ]
      )
    ])

    let document = EditableMenuDocument(workspace: workspace)
    let categoryIDs = document.cats.map(\.id)
    let itemIDs = document.cats.flatMap { $0.items.map(\.id) }

    XCTAssertFalse(categoryIDs.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }))
    XCTAssertFalse(itemIDs.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }))
    XCTAssertEqual(Set(categoryIDs).count, categoryIDs.count)
    XCTAssertEqual(Set(itemIDs).count, itemIDs.count)
    XCTAssertTrue(document.cats.allSatisfy { $0.menuId == "menu" })
  }

  func testDrinksRouteUsesExplicitQueryWhileFoodUsesBasePath() {
    let preview = PreviewClient(environment: AppEnvironment(name: .preview, baseURL: URL(string: "https://example.com")!, publicOrigin: URL(string: "https://example.com")!, displayName: "Preview"))
    let drinksMenu = MenuRecord(id: "drinks", slug: "drinks", name: "Drinks", type: "drinks", restaurantId: "leroys-lounge", canManage: true)
    let foodMenu = MenuRecord(id: "food", slug: "food", name: "Food", type: "food", restaurantId: "leroys-lounge", canManage: true)

    XCTAssertEqual(preview.exactRouteURL(for: drinksMenu).absoluteString, "https://example.com/leroyslounge?menu=drinks")
    XCTAssertEqual(preview.exactRouteURL(for: foodMenu).absoluteString, "https://example.com/leroyslounge")
  }

  func testOfflineDraftStoreRoundTripsByUserAndMenu() throws {
    let rootURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let store = OfflineDraftStore(rootURL: rootURL)
    let envelope = LocalDraftEnvelope(
      userId: "staff-1",
      menuId: "menu-drinks",
      restaurantId: "leroys-lounge",
      menuName: "Drinks",
      savedAt: Date(timeIntervalSince1970: 1234),
      baseLiveRevision: 8,
      baseDraftRevision: 9,
      baseDocument: EditableMenuDocument(workspace: makeWorkspace()),
      document: EditableMenuDocument(workspace: makeWorkspace())
    )

    try store.saveDraft(envelope)
    let loaded = try XCTUnwrap(store.loadDraft(userId: "staff-1", menuId: "menu-drinks"))
    XCTAssertEqual(loaded, envelope)

    try store.removeDraft(userId: "staff-1", menuId: "menu-drinks")
    XCTAssertNil(try store.loadDraft(userId: "staff-1", menuId: "menu-drinks"))
  }

  func testCompactFeaturedItemProjectionDecodesWithDefaults() throws {
    let data = Data("""
    {
      "id": "featured-1",
      "name": "Badass Steak n' Cheese",
      "price": "",
      "visibility": "public",
      "eightySixed": false,
      "desc": "",
      "recipe": [],
      "upcharges": [],
      "showDescription": true,
      "showRecipe": false
    }
    """.utf8)

    let item = try JSONDecoder.backend.decode(MenuItemPayload.self, from: data)

    XCTAssertEqual(item.id, "featured-1")
    XCTAssertEqual(item.name, "Badass Steak n' Cheese")
    XCTAssertFalse(item.isEightySixed)
    XCTAssertEqual(item.displayOrder, 0)
    XCTAssertTrue(item.onMenu)
    XCTAssertEqual(item.visibility, "public")
  }

  func testWorkspacePayloadDecodesWithLegacyServerGaps() throws {
    let data = Data("""
    {
      "cats": [
        {
          "id": "cat-1",
          "key": "beer",
          "label": "Beer",
          "items": [
            {
              "id": "item-1",
              "name": "Lager",
              "recipe": "16oz pour",
              "visibility": "public"
            }
          ]
        }
      ],
      "meta": {
        "last_updated_ts": 1712705100000
      },
      "restaurant": {
        "id": "leroys-lounge",
        "slug": "leroyslounge",
        "name": "Leroy's Lounge"
      },
      "restaurant_tools": {
        "restaurant_id": "leroys-lounge",
        "featured_groups": [
          {
            "id": "group-1",
            "name": "Featured",
            "slots": [
              {
                "id": "slot-1",
                "item_id": "item-1",
                "item": {
                  "id": "item-1",
                  "name": "Lager",
                  "eightySixed": false
                }
              }
            ]
          }
        ],
        "sibling_catalog": [
          {
            "id": "sib-1",
            "name": "Michelada",
            "cat": "Beer",
            "menu_id": "menu-food",
            "menu_label": "Food",
            "on_menu": false,
            "visibility": "off_menu"
          }
        ]
      },
      "context": {
        "kind": "menu-workspace",
        "menu": {
          "id": "menu",
          "slug": "drinks",
          "name": "Drinks",
          "type": "drinks",
          "restaurant_id": "leroys-lounge"
        }
      },
      "workspace": {
        "accessible_menu_ids": ["menu"],
        "shared_draft": {
          "exists": false
        },
        "permissions": {
          "can_manage": true
        },
        "capabilities": {
          "can_save_draft": true,
          "can_save_live_menu": true,
          "can_publish_updates": true
        },
        "revisions": {
          "live_revision": 10
        }
      }
    }
    """.utf8)

    let payload = try JSONDecoder.backend.decode(MenuWorkspacePayload.self, from: data)

    XCTAssertEqual(payload.cats[0].color, "")
    XCTAssertEqual(payload.cats[0].sub, "")
    XCTAssertEqual(payload.cats[0].placeholder, "")
    XCTAssertEqual(payload.cats[0].items[0].recipe, ["16oz pour"])
    XCTAssertEqual(payload.meta.lastSentCategories, [])
    XCTAssertEqual(payload.meta.lastSentFeatured, [])
    XCTAssertEqual(payload.workspace.sharedDraft.source, "")
    XCTAssertFalse(payload.workspace.permissions.canAdmin)
    XCTAssertFalse(payload.workspace.capabilities.includesRestaurantTools)
    XCTAssertEqual(payload.restaurantTools?.featuredGroups[0].slots[0].item?.price, "")
    XCTAssertEqual(payload.restaurantTools?.siblingCatalog.first?.menuLabel, "Food")
    XCTAssertEqual(payload.restaurantTools?.siblingCatalog.first?.onMenu, false)
    XCTAssertEqual(payload.restaurantTools?.siblingCatalog.first?.visibility, "off_menu")
  }

  func testHistoryPayloadDecodesWhenSourceFieldsAreMissing() throws {
    let data = Data("""
    {
      "logs": [
        {
          "id": "log-1",
          "menu_id": "menu",
          "user_id": "user-1",
          "user_name": "Alex",
          "diff": [],
          "created_at": "2026-04-14T06:00:00.000Z"
        }
      ],
      "context": {
        "kind": "menu-history"
      },
      "history": {
        "days": 7,
        "limit": 25,
        "count": 1,
        "scope": "menu"
      },
      "capabilities": {
        "can_read_history": true
      }
    }
    """.utf8)

    let payload = try JSONDecoder.backend.decode(HistoryPayload.self, from: data)

    XCTAssertEqual(payload.logs[0].message, "")
    XCTAssertEqual(payload.logs[0].source, "")
    XCTAssertTrue(payload.capabilities.includesMessage)
    XCTAssertFalse(payload.capabilities.includesSource)
  }

  func testDraftCommandResponseDecodesServerShape() throws {
    let data = Data("""
    {
      "ok": true,
      "status": "draft_saved",
      "menu_id": "menu",
      "saved_at": 1712705100000,
      "has_shared_draft": true,
      "shared_draft": {
        "exists": true,
        "saved_at": 1712705100000,
        "saved_by": {
          "id": "staff-1",
          "name": "Alex"
        },
        "source": "ios_app"
      }
    }
    """.utf8)

    let payload = try JSONDecoder.backend.decode(DraftCommandResponse.self, from: data)

    XCTAssertTrue(payload.ok)
    XCTAssertEqual(payload.status, "draft_saved")
    XCTAssertEqual(payload.menuId, "menu")
    XCTAssertEqual(payload.savedAt, 1712705100000)
    XCTAssertTrue(payload.hasSharedDraft)
    XCTAssertEqual(payload.sharedDraft?.savedBy?.id, "staff-1")
    XCTAssertEqual(payload.sharedDraft?.source, "ios_app")
  }

  func testPublishResponseDecodesPreviewAndSelectionFields() throws {
    let data = Data("""
    {
      "ok": true,
      "action": "publish",
      "ts": 1712705100000,
      "current_revisions": {
        "live_revision": 22,
        "draft_revision": 21,
        "last_sent_revision": 22
      },
      "selected_change_ids": ["beer::added::ipa"],
      "warning_message": "",
      "success_message": "done",
      "preview": {
        "mode": "save-and-update",
        "has_changes": true,
        "has_local_draft": true,
        "has_shared_draft": true,
        "has_notification_changes": true,
        "has_save_only_changes": false,
        "diff": [],
        "sections": [],
        "notification_changes": [],
        "save_only_changes": [],
        "patch_message": "patch text",
        "truncated": false,
        "selection_defaults": ["beer::added::ipa"],
        "metadata": {
          "server_owned": true,
          "contract": "menu-publish-preview.v1",
          "current_featured_ids": ["item-1"]
        }
      }
    }
    """.utf8)

    let payload = try JSONDecoder.backend.decode(PublishResponse.self, from: data)

    XCTAssertTrue(payload.ok)
    XCTAssertEqual(payload.currentRevisions?.liveRevision, 22)
    XCTAssertEqual(payload.selectedChangeIds, ["beer::added::ipa"])
    XCTAssertEqual(payload.preview?.metadata.contract, "menu-publish-preview.v1")
    XCTAssertEqual(payload.preview?.metadata.currentFeaturedIds, ["item-1"])
  }

  @MainActor
  func testLoadEditorRecoversFromCorruptLocalDraftAndStillLoadsWorkspace() async {
    let offlineStore = TestOfflineDraftStore()
    offlineStore.loadError = TestError.message("Corrupt local draft")
    let sessionStore = TestSessionStore()
    let workspacePayload = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      )
    ])
    let historyPayload = makeHistoryPayload()
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: StubWorkspaceClient(payloads: [workspacePayload]),
        historyClient: StubHistoryClient(payload: historyPayload)
      ),
      sessionStore: sessionStore,
      offlineDraftStore: offlineStore
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")

    XCTAssertNotNil(model.currentEditorWorkspace)
    XCTAssertNotNil(model.currentEditorDocument)
    XCTAssertEqual(model.currentEditorWorkspace?.context.menu?.id, "menu")
    XCTAssertEqual(offlineStore.removedDraftKeys, ["staff-1::menu"])
    XCTAssertEqual(model.notice?.title, "Local Draft Cleared")
  }

  @MainActor
  func testSaveDraftRebaselinesLocalStateAndClearsOfflineDraft() async {
    let offlineStore = TestOfflineDraftStore()
    let sessionStore = TestSessionStore()
    let workspaceClient = StubWorkspaceClient(payloads: [makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      )
    ])])
    let draftClient = StubDraftClient(
      saveResponse: DraftCommandResponse(
        ok: true,
        status: "draft_saved",
        menuId: "menu",
        savedAt: 22,
        hasSharedDraft: true,
        sharedDraft: SharedDraftInfo(
          exists: true,
          savedAt: 22,
          savedBy: SharedDraftSavedBy(id: "staff-1", name: "Alex"),
          source: "ios_app"
        )
      )
    )
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: workspaceClient,
        historyClient: StubHistoryClient(payload: makeHistoryPayload()),
        draftClient: draftClient
      ),
      sessionStore: sessionStore,
      offlineDraftStore: offlineStore
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")
    model.renameCategory(key: "beer", label: "Draft Beer")
    XCTAssertTrue(model.editorDirty)
    XCTAssertNotNil(offlineStore.draft)

    await model.saveRemoteDraft()

    XCTAssertFalse(model.editorDirty)
    XCTAssertTrue(model.editorHasLiveChanges)
    XCTAssertNil(model.editorRefreshRequirement)
    XCTAssertNil(offlineStore.draft)
    XCTAssertTrue(model.editorHasSharedDraft)
    XCTAssertTrue(model.canSaveLiveRemotely)
    XCTAssertEqual(model.currentEditorWorkspace?.workspace.revisions.draftRevision, 22)
  }

  @MainActor
  func testLoadEditorUsesSharedDraftAsStartingWorkingCopy() async throws {
    let baseWorkspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      )
    ])
    var sharedDraftDocument = EditableMenuDocument(workspace: baseWorkspace)
    guard var sharedBeer = sharedDraftDocument.itemRecord(for: "item-1")?.item else {
      XCTFail("Expected seeded beer item")
      return
    }
    sharedBeer.name = "House Pilsner"
    sharedDraftDocument.upsertItem(sharedBeer, categoryKey: "beer", originalCategoryKey: "beer")

    let workspaceWithDraft = makeWorkspace(
      categories: baseWorkspace.cats,
      meta: MenuMetaPayload(
        draftState: makeJSONValue(from: sharedDraftDocument),
        draftSavedTs: 22
      ),
      hasSharedDraft: true,
      sharedDraft: SharedDraftInfo(
        exists: true,
        savedAt: 22,
        savedBy: SharedDraftSavedBy(id: "staff-2", name: "Jordan"),
        source: "web"
      ),
      revisions: WorkspaceRevisions(liveRevision: 10, draftRevision: 22, lastSentRevision: 10)
    )
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: StubWorkspaceClient(payloads: [workspaceWithDraft]),
        historyClient: StubHistoryClient(payload: makeHistoryPayload())
      ),
      sessionStore: TestSessionStore(),
      offlineDraftStore: TestOfflineDraftStore()
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")

    XCTAssertEqual(model.currentEditorDocument?.itemRecord(for: "item-1")?.item.name, "House Pilsner")
    XCTAssertFalse(model.editorDirty)
    XCTAssertTrue(model.editorHasLiveChanges)
    XCTAssertTrue(model.editorHasSharedDraft)
    XCTAssertTrue(model.canSaveLiveRemotely)
    XCTAssertTrue(model.canLoadPublishPreview)
  }

  @MainActor
  func testSaveLiveMenuClearsSharedDraftAndRebaselinesBothBaselines() async throws {
    let offlineStore = TestOfflineDraftStore()
    let sessionStore = TestSessionStore()
    let baseWorkspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      )
    ])
    var sharedDraftDocument = EditableMenuDocument(workspace: baseWorkspace)
    guard var sharedBeer = sharedDraftDocument.itemRecord(for: "item-1")?.item else {
      XCTFail("Expected seeded beer item")
      return
    }
    sharedBeer.name = "House Pilsner"
    sharedDraftDocument.upsertItem(sharedBeer, categoryKey: "beer", originalCategoryKey: "beer")

    let workspace = makeWorkspace(
      categories: baseWorkspace.cats,
      meta: MenuMetaPayload(
        draftState: makeJSONValue(from: sharedDraftDocument),
        draftSavedTs: 22
      ),
      hasSharedDraft: true,
      sharedDraft: SharedDraftInfo(
        exists: true,
        savedAt: 22,
        savedBy: SharedDraftSavedBy(id: "staff-1", name: "Alex"),
        source: "ios_app"
      ),
      revisions: WorkspaceRevisions(liveRevision: 10, draftRevision: 22, lastSentRevision: 10)
    )
    let draftClient = StubDraftClient(
      clearResponse: DraftCommandResponse(
        ok: true,
        status: "draft_cleared",
        menuId: "menu",
        savedAt: nil,
        hasSharedDraft: false,
        sharedDraft: SharedDraftInfo(exists: false, savedAt: nil, savedBy: nil, source: "")
      )
    )
    let liveSaveClient = StubLiveSaveClient(
      response: PublishResponse(
        ok: true,
        action: nil,
        ts: 44,
        preview: nil,
        currentRevisions: WorkspaceRevisions(liveRevision: 44, draftRevision: 22, lastSentRevision: 10),
        notificationStatus: nil,
        warnings: nil,
        warningMessage: nil,
        successMessage: nil,
        selectedChangeIds: nil
      )
    )
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: StubWorkspaceClient(payloads: [workspace]),
        historyClient: StubHistoryClient(payload: makeHistoryPayload()),
        draftClient: draftClient,
        liveSaveClient: liveSaveClient
      ),
      sessionStore: sessionStore,
      offlineDraftStore: offlineStore
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")

    XCTAssertTrue(model.editorHasSharedDraft)
    XCTAssertTrue(model.editorHasLiveChanges)

    await model.saveLiveMenu()

    XCTAssertFalse(model.editorDirty)
    XCTAssertFalse(model.editorHasLiveChanges)
    XCTAssertFalse(model.editorHasSharedDraft)
    XCTAssertFalse(model.showClearSharedDraft)
    XCTAssertFalse(model.canSaveLiveRemotely)
    XCTAssertEqual(liveSaveClient.saveCallCount, 1)
    XCTAssertEqual(draftClient.clearCallCount, 1)
    XCTAssertEqual(model.currentEditorWorkspace?.workspace.revisions.liveRevision, 44)
    XCTAssertNil(offlineStore.draft)
  }

  @MainActor
  func testRemoteDraftUpdateRequiresRefreshAndKeepsNonOverlappingLocalDrafts() async throws {
    let offlineStore = TestOfflineDraftStore()
    let sessionStore = TestSessionStore()
    let initialWorkspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      ),
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 1,
        items: [makeItem(id: "item-2", name: "Merlot")]
      )
    ])
    let updatedWorkspace = makeWorkspace(
      categories: [
        MenuCategoryPayload(
          id: "beer",
          menuId: "menu",
          key: "beer",
          label: "Beer",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 0,
          items: [makeItem(id: "item-1", name: "Pilsner")]
        ),
        MenuCategoryPayload(
          id: "wine",
          menuId: "menu",
          key: "wine",
          label: "Wine",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 1,
          items: [makeItem(id: "item-2", name: "Reserve Merlot")]
        )
      ],
      revisions: WorkspaceRevisions(liveRevision: 10, draftRevision: 40, lastSentRevision: 10)
    )
    let workspaceClient = StubWorkspaceClient(payloads: [initialWorkspace, updatedWorkspace, updatedWorkspace])
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: workspaceClient,
        historyClient: StubHistoryClient(payload: makeHistoryPayload())
      ),
      sessionStore: sessionStore,
      offlineDraftStore: offlineStore
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")
    guard var localBeer = model.currentEditorDocument?.itemRecord(for: "item-1")?.item else {
      XCTFail("Expected local beer item")
      return
    }
    localBeer.name = "House Pilsner"
    model.upsertItem(localBeer, categoryKey: "beer", originalCategoryKey: "beer")

    await model.checkForRemoteMenuUpdate(menuId: "menu", force: true)
    let requirement = try XCTUnwrap(model.editorRefreshRequirement)
    XCTAssertTrue(requirement.hasLocalDrafts)
    XCTAssertFalse(requirement.hasOverlap)

    await model.refreshEditorAfterRemoteUpdate(strategy: .keepLocalDrafts)
    let document = try XCTUnwrap(model.currentEditorDocument)

    XCTAssertEqual(document.itemRecord(for: "item-1")?.item.name, "House Pilsner")
    XCTAssertEqual(document.itemRecord(for: "item-2")?.item.name, "Reserve Merlot")
    XCTAssertTrue(model.editorDirty)
    XCTAssertEqual(offlineStore.draft?.baseDraftRevision, 40)
  }

  @MainActor
  func testRefreshAndUpdateDraftsDropsOnlyOverlappingChanges() async throws {
    let offlineStore = TestOfflineDraftStore()
    let sessionStore = TestSessionStore()
    let initialWorkspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      ),
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 1,
        items: [makeItem(id: "item-2", name: "Merlot")]
      )
    ])
    let updatedWorkspace = makeWorkspace(
      categories: [
        MenuCategoryPayload(
          id: "beer",
          menuId: "menu",
          key: "beer",
          label: "Beer",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 0,
          items: [makeItem(id: "item-1", name: "Crisp Pilsner")]
        ),
        MenuCategoryPayload(
          id: "wine",
          menuId: "menu",
          key: "wine",
          label: "Wine",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 1,
          items: [makeItem(id: "item-2", name: "Merlot", price: "$18")]
        )
      ],
      revisions: WorkspaceRevisions(liveRevision: 10, draftRevision: 55, lastSentRevision: 10)
    )
    let workspaceClient = StubWorkspaceClient(payloads: [initialWorkspace, updatedWorkspace, updatedWorkspace])
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: workspaceClient,
        historyClient: StubHistoryClient(payload: makeHistoryPayload())
      ),
      sessionStore: sessionStore,
      offlineDraftStore: offlineStore
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")
    guard var localBeer = model.currentEditorDocument?.itemRecord(for: "item-1")?.item,
          var localWine = model.currentEditorDocument?.itemRecord(for: "item-2")?.item else {
      XCTFail("Expected seed items")
      return
    }
    localBeer.name = "Local Pilsner"
    localWine.desc = "Staff tasting note"
    model.upsertItem(localBeer, categoryKey: "beer", originalCategoryKey: "beer")
    model.upsertItem(localWine, categoryKey: "wine", originalCategoryKey: "wine")

    await model.checkForRemoteMenuUpdate(menuId: "menu", force: true)
    let requirement = try XCTUnwrap(model.editorRefreshRequirement)
    XCTAssertTrue(requirement.hasOverlap)
    XCTAssertTrue(requirement.overlappingLabels.contains(where: { $0.contains("Pilsner") }))

    await model.refreshEditorAfterRemoteUpdate(strategy: .updateDrafts)
    let document = try XCTUnwrap(model.currentEditorDocument)

    XCTAssertEqual(document.itemRecord(for: "item-1")?.item.name, "Crisp Pilsner")
    XCTAssertEqual(document.itemRecord(for: "item-2")?.item.price, "$18")
    XCTAssertEqual(document.itemRecord(for: "item-2")?.item.desc, "")
    XCTAssertFalse(model.editorDirty)
  }

  @MainActor
  func testRefreshAndKeepMyDraftsPreservesOverlappingLocalItems() async throws {
    let offlineStore = TestOfflineDraftStore()
    let sessionStore = TestSessionStore()
    let initialWorkspace = makeWorkspace(categories: [
      MenuCategoryPayload(
        id: "beer",
        menuId: "menu",
        key: "beer",
        label: "Beer",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 0,
        items: [makeItem(id: "item-1", name: "Pilsner")]
      ),
      MenuCategoryPayload(
        id: "wine",
        menuId: "menu",
        key: "wine",
        label: "Wine",
        icon: "",
        color: "",
        sub: "",
        placeholder: "",
        displayOrder: 1,
        items: [makeItem(id: "item-2", name: "Merlot")]
      )
    ])
    let updatedWorkspace = makeWorkspace(
      categories: [
        MenuCategoryPayload(
          id: "beer",
          menuId: "menu",
          key: "beer",
          label: "Beer",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 0,
          items: [makeItem(id: "item-1", name: "Crisp Pilsner")]
        ),
        MenuCategoryPayload(
          id: "wine",
          menuId: "menu",
          key: "wine",
          label: "Wine",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 1,
          items: [makeItem(id: "item-2", name: "Merlot", price: "$18")]
        )
      ],
      revisions: WorkspaceRevisions(liveRevision: 10, draftRevision: 56, lastSentRevision: 10)
    )
    let workspaceClient = StubWorkspaceClient(payloads: [initialWorkspace, updatedWorkspace, updatedWorkspace])
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: workspaceClient,
        historyClient: StubHistoryClient(payload: makeHistoryPayload())
      ),
      sessionStore: sessionStore,
      offlineDraftStore: offlineStore
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")
    guard var localBeer = model.currentEditorDocument?.itemRecord(for: "item-1")?.item,
          var localWine = model.currentEditorDocument?.itemRecord(for: "item-2")?.item else {
      XCTFail("Expected seed items")
      return
    }
    localBeer.name = "Local Pilsner"
    localWine.desc = "Staff tasting note"
    model.upsertItem(localBeer, categoryKey: "beer", originalCategoryKey: "beer")
    model.upsertItem(localWine, categoryKey: "wine", originalCategoryKey: "wine")

    await model.checkForRemoteMenuUpdate(menuId: "menu", force: true)
    let requirement = try XCTUnwrap(model.editorRefreshRequirement)
    XCTAssertTrue(requirement.hasOverlap)

    await model.refreshEditorAfterRemoteUpdate(strategy: .keepLocalDrafts)
    let document = try XCTUnwrap(model.currentEditorDocument)

    XCTAssertEqual(document.itemRecord(for: "item-1")?.item.name, "Local Pilsner")
    XCTAssertEqual(document.itemRecord(for: "item-2")?.item.price, "$14")
    XCTAssertEqual(document.itemRecord(for: "item-2")?.item.desc, "Staff tasting note")
    XCTAssertTrue(model.editorDirty)
  }

  @MainActor
  func testStaleOfflineDraftRefreshNormalizesIdentifiers() async throws {
    let offlineStore = TestOfflineDraftStore()
    let sessionStore = TestSessionStore()
    let workspacePayload = makeWorkspace(
      categories: [
        MenuCategoryPayload(
          id: "beer",
          menuId: "menu",
          key: "beer",
          label: "Beer",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 0,
          items: [makeItem(id: "item-1", name: "Pilsner")]
        ),
        MenuCategoryPayload(
          id: "wine",
          menuId: "menu",
          key: "wine",
          label: "Wine",
          icon: "",
          color: "",
          sub: "",
          placeholder: "",
          displayOrder: 1,
          items: [makeItem(id: "item-2", name: "Merlot")]
        )
      ],
      revisions: WorkspaceRevisions(liveRevision: 10, draftRevision: 5, lastSentRevision: 10)
    )
    var malformedDocument = EditableMenuDocument(workspace: workspacePayload)
    var staleBase = EditableMenuDocument(workspace: workspacePayload)
    staleBase.context.menuType = "drinks"
    for index in malformedDocument.cats.indices {
      malformedDocument.cats[index].id = ""
      for itemIndex in malformedDocument.cats[index].items.indices {
        malformedDocument.cats[index].items[itemIndex].id = ""
      }
    }
    offlineStore.draft = LocalDraftEnvelope(
      userId: "staff-1",
      menuId: "menu",
      restaurantId: "leroys-lounge",
      menuName: "Drinks",
      savedAt: Date(timeIntervalSince1970: 1234),
      baseLiveRevision: 10,
      baseDraftRevision: 2,
      baseDocument: staleBase,
      document: malformedDocument
    )
    let model = AppModel(
      environment: AppEnvironment(
        name: .preview,
        baseURL: exampleURL,
        publicOrigin: exampleURL,
        displayName: "Preview"
      ),
      services: makeServices(
        workspaceClient: StubWorkspaceClient(payloads: [workspacePayload, workspacePayload]),
        historyClient: StubHistoryClient(payload: makeHistoryPayload())
      ),
      sessionStore: sessionStore,
      offlineDraftStore: offlineStore
    )
    model.authSession = makeAuthSession()

    await model.loadEditor(menuId: "menu")
    XCTAssertNotNil(model.editorRefreshRequirement)

    await model.refreshEditorAfterRemoteUpdate(strategy: .keepLocalDrafts)
    let document = try XCTUnwrap(model.currentEditorDocument)
    let categoryIDs = document.cats.map(\.id)
    let itemIDs = document.cats.flatMap { $0.items.map(\.id) }

    XCTAssertFalse(categoryIDs.contains(where: { $0.isEmpty }))
    XCTAssertFalse(itemIDs.contains(where: { $0.isEmpty }))
    XCTAssertEqual(Set(categoryIDs).count, categoryIDs.count)
    XCTAssertEqual(Set(itemIDs).count, itemIDs.count)
  }

  private func makeWorkspace(
    categories: [MenuCategoryPayload] = [],
    meta: MenuMetaPayload = MenuMetaPayload(),
    hasSharedDraft: Bool = false,
    sharedDraft: SharedDraftInfo? = nil,
    revisions: WorkspaceRevisions = WorkspaceRevisions(liveRevision: 10, draftRevision: nil, lastSentRevision: 10)
  ) -> MenuWorkspacePayload {
    let resolvedSharedDraft = sharedDraft ?? SharedDraftInfo(
      exists: hasSharedDraft,
      savedAt: revisions.draftRevision,
      savedBy: nil,
      source: ""
    )
    return MenuWorkspacePayload(
      cats: categories,
      meta: meta,
      restaurant: RestaurantRecord(id: "leroys-lounge", slug: "leroyslounge", name: "Leroy's Lounge", canAccess: true, design: nil, useCustomDesign: nil),
      restaurantTools: nil,
      context: MenuContext(kind: "menu-workspace", menu: MenuRecord(id: "menu", slug: "drinks", name: "Drinks", type: "drinks", restaurantId: "leroys-lounge", canManage: true)),
      workspace: WorkspaceState(
        actor: ActorProfile(id: "1", name: "Test", role: "manager"),
        accessibleMenuIds: ["menu"],
        hasSharedDraft: hasSharedDraft || resolvedSharedDraft.exists,
        sharedDraft: resolvedSharedDraft,
        permissions: WorkspacePermissions(canManage: true, canAdmin: false, canEditRestaurantSpecials: false, canReadRestaurantTools: false),
        capabilities: WorkspaceCapabilities(
          canSaveDraft: true,
          canSaveLiveMenu: true,
          canPublishUpdates: true,
          canManageRestaurantSpecials: false,
          canReadRestaurantTools: false,
          canManageAdminSettings: false,
          includesDraftAuthorship: true,
          includesRestaurantTools: false
        ),
        revisions: revisions
      ),
      capabilities: nil
    )
  }

  private func makeJSONValue(from document: EditableMenuDocument) -> JSONValue {
    let data = try? JSONEncoder().encode(document)
    return (try? JSONDecoder().decode(JSONValue.self, from: data ?? Data())) ?? .object([:])
  }

  private func makeHistoryPayload() -> HistoryPayload {
    HistoryPayload(
      logs: [],
      context: HistoryContext(
        kind: "menu-history",
        menu: MenuRecord(
          id: "menu",
          slug: "drinks",
          name: "Drinks",
          type: "drinks",
          restaurantId: "leroys-lounge",
          canManage: true
        ),
        restaurant: nil
      ),
      actor: ActorProfile(id: "staff-1", name: "Alex", role: "manager"),
      history: HistorySummary(days: 7, limit: 25, count: 0, scope: "menu", partial: false),
      capabilities: HistoryCapabilities(canReadHistory: true, includesMessage: true, includesSource: true)
    )
  }

  private func makeAuthSession() -> AuthSession {
    AuthSession(
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date().addingTimeInterval(3600),
      userID: "staff-1",
      email: "staff@example.com",
      name: "Alex",
      role: "manager",
      accessibleMenuIds: ["menu"]
    )
  }

  private var exampleURL: URL {
    URL(string: "https://example.com") ?? URL(fileURLWithPath: "/")
  }

  private func makeServices(
    workspaceClient: WorkspaceClienting,
    historyClient: HistoryClienting,
    draftClient: DraftClienting = StubDraftClient(),
    liveSaveClient: LiveSaveClienting = StubLiveSaveClient(),
    publishClient: PublishClienting = StubPublishClient()
  ) -> AppServices {
    AppServices(
      bootstrap: StubBootstrapClient(),
      auth: StubAuthClient(),
      workspace: workspaceClient,
      publicMenu: StubPublicMenuClient(),
      draft: draftClient,
      liveSave: liveSaveClient,
      publish: publishClient,
      history: historyClient,
      featuredTools: StubFeaturedToolsClient(),
      preview: StubPreviewClient(),
      productLookup: StubProductLookupClient()
    )
  }

  private func makeItem(id: String, name: String, price: String = "$14", desc: String = "") -> MenuItemPayload {
    MenuItemPayload(
      id: id,
      name: name,
      desc: desc,
      recipe: [],
      price: price,
      isEightySixed: false,
      displayOrder: 0,
      onMenu: true,
      visibility: "public",
      upcharges: [],
      showDescription: true,
      showRecipe: false
    )
  }
}

private enum TestError: LocalizedError {
  case message(String)

  var errorDescription: String? {
    switch self {
    case .message(let value):
      return value
    }
  }
}

private final class TestOfflineDraftStore: OfflineDraftStoring {
  var draft: LocalDraftEnvelope?
  var loadError: Error?
  var savedEnvelopes: [LocalDraftEnvelope] = []
  var removedDraftKeys: [String] = []

  func loadDraft(userId: String, menuId: String) throws -> LocalDraftEnvelope? {
    if let loadError {
      throw loadError
    }
    return draft
  }

  func saveDraft(_ envelope: LocalDraftEnvelope) throws {
    draft = envelope
    savedEnvelopes.append(envelope)
  }

  func removeDraft(userId: String, menuId: String) throws {
    removedDraftKeys.append("\(userId)::\(menuId)")
    if draft?.userId == userId && draft?.menuId == menuId {
      draft = nil
    }
  }

  func loadAllDrafts() throws -> [LocalDraftEnvelope] {
    draft.map { [$0] } ?? []
  }
}

private final class TestSessionStore: SessionStoring {
  var biometricUnlockEnabled: Bool = false
  private var storedSession: AuthSession?

  func loadSession(promptForBiometrics: Bool) async throws -> AuthSession {
    guard let storedSession else {
      throw SessionStoreError.notFound
    }
    return storedSession
  }

  func saveSession(_ session: AuthSession) throws {
    storedSession = session
  }

  func clearSession() throws {
    storedSession = nil
  }
}

private final class StubBootstrapClient: BootstrapClienting {
  func fetch(accessToken: String?) async throws -> SessionBootstrapPayload {
    SessionBootstrapPayload(
      actor: ActorProfile(id: "staff-1", name: "Alex", role: "manager"),
      appVersion: "test",
      defaultMenuId: "menu",
      capabilities: BootstrapCapabilities(canAccessManager: true, canAccessAdmin: false, canManageAnyMenu: true),
      menus: [
        MenuRecord(
          id: "menu",
          slug: "drinks",
          name: "Drinks",
          type: "drinks",
          restaurantId: "leroys-lounge",
          canManage: true
        )
      ],
      restaurants: [
        RestaurantRecord(
          id: "leroys-lounge",
          slug: "leroyslounge",
          name: "Leroy's Lounge",
          canAccess: true,
          design: nil,
          useCustomDesign: nil
        )
      ],
      access: BootstrapAccess(accessibleMenuIds: ["menu"], accessibleRestaurantIds: ["leroys-lounge"]),
      config: nil,
      readiness: nil,
      loopAudit: nil
    )
  }
}

private final class StubAuthClient: AuthClienting {
  func signIn(config: BootstrapConfig, email: String, password: String) async throws -> AuthSession {
    throw TestError.message("Unused in this test")
  }

  func signUp(config: BootstrapConfig, email: String, password: String, name: String) async throws -> AuthSession {
    throw TestError.message("Unused in this test")
  }

  func refresh(config: BootstrapConfig, session: AuthSession) async throws -> AuthSession {
    throw TestError.message("Unused in this test")
  }

  func sendReset(config: BootstrapConfig, email: String, redirectTo: URL) async throws {
    throw TestError.message("Unused in this test")
  }
}

private final class StubWorkspaceClient: WorkspaceClienting {
  private let payloads: [MenuWorkspacePayload]
  private var fetchCount = 0

  init(payloads: [MenuWorkspacePayload]) {
    self.payloads = payloads
  }

  func fetch(menuId: String, accessToken: String) async throws -> MenuWorkspacePayload {
    let index = min(fetchCount, max(payloads.count - 1, 0))
    fetchCount += 1
    return payloads[index]
  }
}

private final class StubPublicMenuClient: PublicMenuClienting {
  func fetch(menuId: String, accessToken: String?) async throws -> PublicMenuPayload {
    throw TestError.message("Unused in this test")
  }
}

private final class StubDraftClient: DraftClienting {
  var saveResponse: DraftCommandResponse?
  var clearResponse: DraftCommandResponse?
  private(set) var saveCallCount = 0
  private(set) var clearCallCount = 0

  init(saveResponse: DraftCommandResponse? = nil, clearResponse: DraftCommandResponse? = nil) {
    self.saveResponse = saveResponse
    self.clearResponse = clearResponse
  }

  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse {
    saveCallCount += 1
    guard let saveResponse else {
      throw TestError.message("Unused in this test")
    }
    return saveResponse
  }

  func clear(menuId: String, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> DraftCommandResponse {
    clearCallCount += 1
    guard let clearResponse else {
      throw TestError.message("Unused in this test")
    }
    return clearResponse
  }
}

private final class StubLiveSaveClient: LiveSaveClienting {
  var response: PublishResponse?
  private(set) var saveCallCount = 0

  init(response: PublishResponse? = nil) {
    self.response = response
  }

  func save(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String) async throws -> PublishResponse {
    saveCallCount += 1
    guard let response else {
      throw TestError.message("Unused in this test")
    }
    return response
  }
}

private final class StubPublishClient: PublishClienting {
  func preview(menuId: String, snapshot: MenuSnapshotPayload, expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    throw TestError.message("Unused in this test")
  }

  func publish(menuId: String, snapshot: MenuSnapshotPayload, selectedChangeIds: [String], expectedLiveRevision: Int?, expectedDraftRevision: Int?, accessToken: String, source: String) async throws -> PublishResponse {
    throw TestError.message("Unused in this test")
  }
}

private final class StubHistoryClient: HistoryClienting {
  let payload: HistoryPayload

  init(payload: HistoryPayload) {
    self.payload = payload
  }

  func fetch(menuId: String, accessToken: String) async throws -> HistoryPayload {
    payload
  }
}

private final class StubFeaturedToolsClient: FeaturedToolsClienting {
  func mutate(action: String, restaurantId: String, itemId: String?, slotId: String?, note: String?, direction: Int?, accessToken: String) async throws {
    throw TestError.message("Unused in this test")
  }
}

private final class StubPreviewClient: PreviewClienting {
  func exactRouteURL(for menu: MenuRecord) -> URL {
    URL(string: "https://example.com") ?? URL(fileURLWithPath: "/")
  }
}

private final class StubProductLookupClient: ProductLookupClienting {
  func lookup(upc: String) async throws -> ProductLookupResult {
    throw TestError.message("Unused in this test")
  }
}
