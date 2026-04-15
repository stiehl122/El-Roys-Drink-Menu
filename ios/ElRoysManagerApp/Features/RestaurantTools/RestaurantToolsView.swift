import SwiftUI

struct RestaurantToolsScreen: View {
  @Bindable var model: AppModel
  let restaurant: RestaurantRecord
  @State private var selectedType = "drinks"
  @State private var showingCatalog = false
  @State private var noteEditingSlot: FeaturedSlot?
  @State private var noteText = ""

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 12) {
          Text("Restaurant Tools")
            .font(.system(size: 30, weight: .bold, design: .rounded))
          Picker("Menu", selection: $selectedType) {
            Text("Drinks").tag("drinks")
            Text("Food").tag("food")
          }
          .pickerStyle(.segmented)
        }
        .appGlassCard(tint: AppPalette.brand)

        if let notice = model.notice {
          StatusBanner(tone: notice.tone, title: notice.title, message: notice.message)
        }

        if let workspace = currentWorkspace {
          VStack(alignment: .leading, spacing: 12) {
            HStack {
              Text("Featured")
                .font(.headline)
              Spacer()
              Button("Add From Catalog") {
                showingCatalog = true
              }
              .buttonStyle(SecondaryGlassButtonStyle())
              .frame(maxWidth: 170)
            }

            ForEach(workspace.restaurantTools?.featuredGroups ?? []) { group in
              ForEach(group.slots) { slot in
                VStack(alignment: .leading, spacing: 8) {
                  HStack {
                    VStack(alignment: .leading, spacing: 4) {
                      Text(slot.item?.name ?? "Featured Item")
                        .font(.subheadline.weight(.semibold))
                      if !slot.sellNote.isEmpty {
                        Text(slot.sellNote)
                          .font(.footnote)
                          .foregroundStyle(.secondary)
                      }
                    }
                    Spacer()
                    Text(slot.item?.price ?? "")
                      .font(.subheadline.monospacedDigit())
                  }

                  HStack {
                    Button("Up") {
                      Task { await model.saveFeaturedAction(action: "move", restaurantId: restaurant.id, slotId: slot.id, direction: -1) }
                    }
                    .buttonStyle(SecondaryGlassButtonStyle())
                    Button("Down") {
                      Task { await model.saveFeaturedAction(action: "move", restaurantId: restaurant.id, slotId: slot.id, direction: 1) }
                    }
                    .buttonStyle(SecondaryGlassButtonStyle())
                    Button("Note") {
                      noteEditingSlot = slot
                      noteText = slot.sellNote
                    }
                    .buttonStyle(SecondaryGlassButtonStyle())
                    Button("Remove") {
                      Task { await model.saveFeaturedAction(action: "remove", restaurantId: restaurant.id, slotId: slot.id) }
                    }
                    .buttonStyle(SecondaryGlassButtonStyle())
                  }
                }
                .padding(.vertical, 6)
              }
            }

            Button("Confirm Featured Lineup") {
              Task { await model.saveFeaturedAction(action: "confirm", restaurantId: restaurant.id) }
            }
            .buttonStyle(PrimaryGlassButtonStyle())
          }
          .appGlassCard(tint: AppPalette.warning)
        }

        if let history = currentHistory {
          VStack(alignment: .leading, spacing: 12) {
            Text("Recent Changes")
              .font(.headline)
            ForEach(history.logs) { entry in
              VStack(alignment: .leading, spacing: 6) {
                Text(entry.userName)
                  .font(.subheadline.weight(.semibold))
                Text(entry.message.isEmpty ? "No message provided." : entry.message)
                  .font(.footnote)
                  .foregroundStyle(.secondary)
                Text(entry.createdAt)
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              .padding(.vertical, 4)
            }
          }
          .appGlassCard(tint: AppPalette.accent)
        }
      }
      .padding(24)
    }
    .navigationTitle(restaurant.name)
    .navigationBarTitleDisplayMode(.inline)
    .task {
      await model.loadRestaurantTools(for: restaurant.id)
    }
    .sheet(isPresented: $showingCatalog) {
      NavigationStack {
        List(currentWorkspace?.restaurantTools?.siblingCatalog ?? []) { item in
          Button {
            Task {
              await model.saveFeaturedAction(action: "add", restaurantId: restaurant.id, itemId: item.id)
              showingCatalog = false
            }
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(item.name)
              Text("\(item.menuLabel) • \(item.cat)")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        }
        .navigationTitle("Add Featured Item")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Close") { showingCatalog = false }
          }
        }
      }
    }
    .alert("Edit Sell Note", isPresented: Binding(
      get: { noteEditingSlot != nil },
      set: { if !$0 { noteEditingSlot = nil } }
    )) {
      TextField("Sell note", text: $noteText)
      Button("Save") {
        if let slot = noteEditingSlot {
          Task { await model.saveFeaturedAction(action: "note", restaurantId: restaurant.id, slotId: slot.id, note: noteText) }
        }
      }
      Button("Cancel", role: .cancel) {}
    }
  }

  private var currentWorkspace: MenuWorkspacePayload? {
    if let menu = model.menu(for: restaurant.id, type: selectedType) {
      return model.currentToolsMenus[menu.id]
    }
    return nil
  }

  private var currentHistory: HistoryPayload? {
    if let menu = model.menu(for: restaurant.id, type: selectedType) {
      return model.currentToolsHistories[menu.id]
    }
    return nil
  }
}
