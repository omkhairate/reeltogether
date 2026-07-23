import SwiftUI

struct ActivityFiltersSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var filters = ActivityFilters.standard

    private var categories: [String] { Array(Set(store.activityCatalog.map(\.category))).sorted() }
    private var vibes: [String] { Array(Set(store.activityCatalog.flatMap(\.vibeTags))).sorted() }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("These choices update the activity deck for **everyone** in this list.", systemImage: "person.2.fill").font(.subheadline)
                }
                Section("Setting") {
                    Picker("Indoor or outdoor", selection: $filters.setting) {
                        ForEach(ActivityIdea.Setting.allCases) { Text($0.rawValue).tag($0) }
                    }.pickerStyle(.segmented)
                }
                Section("Budget") {
                    Picker("Maximum cost", selection: $filters.maximumCostLevel) {
                        ForEach(1...4, id: \.self) { level in Text(String(repeating: "€", count: level)).tag(level) }
                    }.pickerStyle(.segmented)
                }
                Section("Time and distance") {
                    Picker("Maximum duration", selection: $filters.maximumDurationMinutes) {
                        Text("Any").tag(Int?.none); Text("1 hour").tag(Int?.some(60)); Text("2 hours").tag(Int?.some(120)); Text("Half day").tag(Int?.some(240))
                    }
                    Picker("Maximum distance", selection: $filters.maximumDistanceKilometres) {
                        Text("Any").tag(Double?.none); Text("5 km").tag(Double?.some(5)); Text("10 km").tag(Double?.some(10)); Text("25 km").tag(Double?.some(25))
                    }
                }
                Section("Categories") {
                    ForEach(categories, id: \.self) { value in Toggle(value, isOn: setBinding(value, keyPath: \ActivityFilters.categories)) }
                }
                Section("Vibes") {
                    ForEach(vibes, id: \.self) { value in Toggle(value, isOn: setBinding(value, keyPath: \ActivityFilters.vibes)) }
                }
                Section { Button("Reset all filters", role: .destructive) { filters = .standard } }
            }
            .navigationTitle("Activity filters").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { store.updateActivityFilters(filters); dismiss() }.fontWeight(.semibold) }
            }
            .onAppear { filters = store.selectedList?.sharedActivityFilters ?? .standard }
        }
    }

    private func setBinding(_ value: String, keyPath: WritableKeyPath<ActivityFilters, Set<String>>) -> Binding<Bool> {
        Binding(get: { filters[keyPath: keyPath].contains(value) }, set: { enabled in
            if enabled { filters[keyPath: keyPath].insert(value) } else { filters[keyPath: keyPath].remove(value) }
        })
    }
}
