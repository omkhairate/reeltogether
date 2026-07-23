import SwiftUI

struct ListsScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showingNewList = false
    @State private var editingList: WatchList?

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.lists) { list in
                    Button { store.selectList(list) } label: {
                        ListRow(list: list, isSelected: store.selectedList?.id == list.id)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        Button { editingList = list } label: { Label("Settings", systemImage: "slider.horizontal.3") }.tint(AppTheme.purple)
                    }
                }
            }
            .listStyle(.insetGrouped).scrollContentBackground(.hidden).background(AppTheme.cream).adaptiveListMargins(horizontalSizeClass)
            .navigationTitle("Your lists")
            .toolbar { ToolbarItem(placement: .primaryAction) { Button { showingNewList = true } label: { Label("New list", systemImage: "plus") } } }
            .sheet(isPresented: $showingNewList) { NewListSheet() }
            .sheet(item: $editingList) { ListSettingsSheet(listID: $0.id) }
        }
    }
}

private struct ListRow: View {
    @EnvironmentObject private var store: AppStore
    let list: WatchList
    let isSelected: Bool
    var members: [UserProfile] { list.memberIDs.compactMap { id in store.snapshot.users.first { $0.id == id } } }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: list.contentKind.icon).font(.title3).foregroundStyle(.white).frame(width: 48, height: 48).background(AppTheme.purple, in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 4) {
                HStack { Text(list.name).font(.headline); if isSelected { Text("ACTIVE").font(.system(size: 8, weight: .bold)).foregroundStyle(AppTheme.purple).padding(.horizontal, 6).padding(.vertical, 3).background(AppTheme.purple.opacity(0.12), in: Capsule()) } }
                Text("\(members.count) members · \(list.safeThreshold) votes to match").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }.padding(.vertical, 6).contentShape(Rectangle()).accessibilityElement(children: .combine)
    }
}

private struct NewListSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var threshold = 1
    @State private var kind: ListContentKind = .watch

    var body: some View {
        NavigationStack {
            Form {
                Section("List name") { TextField("Friday movie night", text: $name) }
                Section("What will you swipe?") {
                    Picker("List type", selection: $kind) {
                        ForEach(ListContentKind.allCases) { Label($0.rawValue, systemImage: $0.icon).tag($0) }
                    }
                }
                Section("Starting match rule") {
                    Stepper("\(threshold) like\(threshold == 1 ? "" : "s") to match", value: $threshold, in: 1...10)
                    Text("The threshold automatically stays within the number of members.").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New list").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Create") { store.createList(name: name, threshold: threshold, kind: kind); dismiss() }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty) }
            }
        }
    }
}

private struct ListSettingsSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let listID: UUID

    private var list: WatchList? { store.snapshot.lists.first { $0.id == listID } }

    var body: some View {
        NavigationStack {
            Form {
                if let list {
                    Section("Match rule") {
                        Stepper("\(list.safeThreshold) of \(list.memberIDs.count) likes", value: Binding(get: { list.safeThreshold }, set: { store.updateThreshold($0, for: listID) }), in: 1...max(1, list.memberIDs.count))
                        Text("A title becomes a match as soon as this many members like it.").font(.caption).foregroundStyle(.secondary)
                    }
                    Section("Members") {
                        ForEach(list.memberIDs.compactMap { id in store.snapshot.users.first { $0.id == id } }) { user in
                            HStack { UserAvatar(user: user); VStack(alignment: .leading) { Text(user.displayName); Text("@\(user.username)").font(.caption).foregroundStyle(.secondary) }; Spacer(); if user.id == list.ownerID { Text("Owner").font(.caption).foregroundStyle(.secondary) } }
                        }
                        ShareLink(item: store.inviteURL(for: list)) { Label("Invite another member", systemImage: "person.badge.plus") }
                    }
                    Section("Invite code") { Text(list.inviteCode).font(.body.monospaced()).textSelection(.enabled) }
                }
            }
            .navigationTitle("List settings").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
