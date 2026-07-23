import SwiftUI

struct DiscoveryFiltersSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var filters = DiscoveryFilters.standard

    private var availableGenres: [String] {
        Array(Set(store.catalog.flatMap(\.genres))).sorted()
    }
    private var availableServices: [String] {
        Array(Set(store.catalog.flatMap(\.streamingServices))).sorted()
    }

    var body: some View {
        NavigationStack {
            Form {
                sharedNotice
                Section("Type") {
                    Toggle("Movies", isOn: mediaTypeBinding(.movie))
                    Toggle("Series", isOn: mediaTypeBinding(.series))
                }
                Section("Streaming services") {
                    if availableServices.isEmpty {
                        Text("Availability will appear when the provider catalog finishes loading.").foregroundStyle(.secondary)
                    } else {
                        ForEach(availableServices, id: \.self) { service in
                            Toggle(service, isOn: setBinding(service, in: \DiscoveryFilters.streamingServices))
                        }
                    }
                }
                Section("Genres") {
                    ForEach(availableGenres, id: \.self) { genre in
                        Toggle(genre, isOn: setBinding(genre, in: \DiscoveryFilters.genres))
                    }
                }
                Section("Language") {
                    Picker("Original language", selection: $filters.language) {
                        Text("Any language").tag(String?.none)
                        Text("English").tag(String?.some("en"))
                        Text("Hindi").tag(String?.some("hi"))
                        Text("German").tag(String?.some("de"))
                        Text("Korean").tag(String?.some("ko"))
                        Text("Spanish").tag(String?.some("es"))
                        Text("Japanese").tag(String?.some("ja"))
                    }
                }
                Section("Quality") {
                    VStack(alignment: .leading) {
                        HStack { Text("Minimum rating"); Spacer(); Text(filters.minimumRating == 0 ? "Any" : String(format: "%.1f+", filters.minimumRating)).foregroundStyle(.secondary) }
                        Slider(value: $filters.minimumRating, in: 0...9, step: 0.5).tint(AppTheme.purple)
                    }
                    Picker("Released since", selection: $filters.earliestYear) {
                        Text("Any year").tag(Int?.none)
                        Text("2020").tag(Int?.some(2020))
                        Text("2010").tag(Int?.some(2010))
                        Text("2000").tag(Int?.some(2000))
                    }
                }
                Section {
                    Button("Reset all filters", role: .destructive) { filters = .standard }
                }
            }
            .navigationTitle("Shared filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.fontWeight(.semibold) }
            }
            .onAppear { filters = store.selectedList?.discoveryFilters ?? .standard }
        }
    }

    private var sharedNotice: some View {
        Section {
            Label {
                Text("These filters change the swipe pool for **everyone** in \(store.selectedList?.name ?? "this list").")
            } icon: { Image(systemName: "person.2.fill").foregroundStyle(AppTheme.purple) }
            .font(.subheadline)
        }
    }

    private func mediaTypeBinding(_ type: MediaTitle.MediaType) -> Binding<Bool> {
        Binding(
            get: { filters.mediaTypes.contains(type) },
            set: { enabled in
                if enabled { filters.mediaTypes.insert(type) }
                else if filters.mediaTypes.count > 1 { filters.mediaTypes.remove(type) }
            }
        )
    }

    private func setBinding(_ value: String, in keyPath: WritableKeyPath<DiscoveryFilters, Set<String>>) -> Binding<Bool> {
        Binding(
            get: { filters[keyPath: keyPath].contains(value) },
            set: { enabled in
                if enabled { filters[keyPath: keyPath].insert(value) }
                else { filters[keyPath: keyPath].remove(value) }
            }
        )
    }

    private func save() {
        store.updateFilters(filters)
        dismiss()
    }
}
