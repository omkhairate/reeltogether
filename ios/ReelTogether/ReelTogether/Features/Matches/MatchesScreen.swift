import SwiftUI

struct MatchesScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var area: Area = .watch

    private enum Area: String, CaseIterable, Identifiable { case watch = "Watch matches", bucket = "Bucket list"; var id: Self { self } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if store.selectedList?.contentKind == .mixed {
                    AdaptivePage(maxWidth: 680) { Picker("Match type", selection: $area) { ForEach(Area.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented) }.padding(.bottom, 10)
                }
                if store.selectedList?.contentKind == .activities || area == .bucket {
                    BucketListContent()
                } else {
                    WatchMatchesContent()
                }
            }
            .background(AppTheme.cream).navigationTitle(area == .bucket ? "Bucket list" : "Matches")
        }
    }
}

private struct WatchMatchesContent: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var searchText = ""
    @State private var showingPending = false
    @State private var selectedMedia: MediaTitle?

    private var displayed: [MatchResult] {
        let source = showingPending ? store.pending : store.matches
        return searchText.isEmpty ? source : source.filter { $0.media.title.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        VStack(spacing: 0) {
            AdaptivePage(maxWidth: 680) { Picker("Status", selection: $showingPending) { Text("Matched").tag(false); Text("Waiting").tag(true) }.pickerStyle(.segmented) }.padding(.bottom, 10)
            if displayed.isEmpty {
                EmptyStateView(icon: showingPending ? "clock" : "star", title: showingPending ? "Nothing waiting" : "No matches yet", message: "Keep swiping and shared picks will appear here.")
            } else {
                List(displayed) { result in
                    Button { selectedMedia = result.media } label: { HStack(spacing: 13) {
                        PosterImage(url: result.media.posterURL).frame(width: 66, height: 88).clipShape(RoundedRectangle(cornerRadius: 11))
                        VStack(alignment: .leading, spacing: 5) {
                            Text(result.media.title).font(.headline)
                            Text(result.media.metadata).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            if !result.media.streamingServices.isEmpty { Label(result.media.streamingServices.joined(separator: " · "), systemImage: "play.tv.fill").font(.caption2).foregroundStyle(AppTheme.purple).lineLimit(1) }
                            Label("\(result.likes) of \(result.requiredLikes) picked", systemImage: "checkmark.circle.fill").font(.caption.weight(.semibold)).foregroundStyle(AppTheme.purple)
                        }; Spacer()
                    }.padding(.vertical, 5).contentShape(Rectangle()).accessibilityElement(children: .combine) }.buttonStyle(.plain).listRowBackground(AppTheme.cream)
                }.listStyle(.plain).scrollContentBackground(.hidden).adaptiveListMargins(horizontalSizeClass)
            }
        }.searchable(text: $searchText, prompt: "Search titles").sheet(item: $selectedMedia) { MediaDetailView(media: $0) }
    }
}

private struct BucketListContent: View {
    @EnvironmentObject private var store: AppStore
    @State private var selectedEntry: BucketEntry?

    private var entryActivityIDs: Set<Int> { Set(store.bucketEntries.map(\.activityID)) }
    private var pending: [ActivityMatchResult] { store.activityPending }

    var body: some View {
        ScrollView {
            AdaptivePage(maxWidth: 760) { LazyVStack(alignment: .leading, spacing: 18) {
                if store.bucketEntries.isEmpty && pending.isEmpty {
                    EmptyStateView(icon: "figure.hiking", title: "Your bucket list is empty", message: "Swipe activity ideas and matched plans will land here.").frame(minHeight: 420)
                }
                bucketSection("PLANNED", entries: store.bucketEntries.filter { $0.status == .planned })
                bucketSection("MATCHED — READY TO PLAN", entries: store.bucketEntries.filter { $0.status == .matched })
                bucketSection("COMPLETED MEMORIES", entries: store.bucketEntries.filter { $0.status == .completed })
                if !pending.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        sectionTitle("WAITING FOR FRIENDS")
                        ForEach(pending) { result in ActivityPendingRow(result: result) }
                    }
                }
            }.padding(.vertical, 12) }
        }
        .sheet(item: $selectedEntry) { BucketDetailSheet(entryID: $0.id) }
    }

    @ViewBuilder private func bucketSection(_ title: String, entries: [BucketEntry]) -> some View {
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle(title)
                ForEach(entries) { entry in
                    if let activity = store.activityCatalog.first(where: { $0.id == entry.activityID }) {
                        Button { selectedEntry = entry } label: { BucketEntryRow(entry: entry, activity: activity) }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
    }
}

private struct BucketEntryRow: View {
    let entry: BucketEntry
    let activity: ActivityIdea
    var body: some View {
        HStack(spacing: 12) {
            PosterImage(url: activity.imageURL).frame(width: 76, height: 76).clipShape(RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 5) {
                Text(activity.title).font(.headline)
                if let date = entry.plannedDate { Label(date.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar").font(.caption).foregroundStyle(AppTheme.purple) }
                else { Text("\(activity.costLabel) · \(activity.durationLabel) · \(activity.location)").font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                if entry.status == .completed, let rating = entry.groupRating { Text(String(repeating: "★", count: rating)).foregroundStyle(.yellow).font(.caption) }
            }
            Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }.padding(10).cardStyle(radius: 16).accessibilityElement(children: .combine)
    }
}

private struct ActivityPendingRow: View {
    let result: ActivityMatchResult
    var body: some View {
        HStack { Image(systemName: "clock.fill").foregroundStyle(.orange); VStack(alignment: .leading) { Text(result.activity.title).font(.subheadline.weight(.bold)); Text("\(result.likes) of \(result.requiredLikes) picked").font(.caption).foregroundStyle(.secondary) }; Spacer() }.padding(14).cardStyle(radius: 14)
    }
}

private struct BucketDetailSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let entryID: UUID
    @State private var proposedDate = Date.now.addingTimeInterval(86_400)
    @State private var showingCompletion = false

    private var entry: BucketEntry? { store.bucketEntries.first { $0.id == entryID } }
    private var activity: ActivityIdea? { guard let entry else { return nil }; return store.activityCatalog.first { $0.id == entry.activityID } }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let entry, let activity {
                    VStack(alignment: .leading, spacing: 20) {
                        PosterImage(url: activity.imageURL).aspectRatio(16 / 9, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 20))
                        VStack(alignment: .leading, spacing: 7) { Text(activity.title).font(AppTheme.titleFont); Text(activity.summary).foregroundStyle(.secondary); Label(activity.location, systemImage: "location.fill"); Label("Best: \(activity.bestSeason)", systemImage: "sun.max.fill") }.font(.subheadline)
                        if let url = activity.bookingURL { Link(destination: url) { Label("Check booking options", systemImage: "safari.fill").frame(maxWidth: .infinity).padding(12) }.buttonStyle(.bordered) }
                        planningSection(entry)
                        if entry.status == .completed { memoryCard(entry) }
                        else if entry.status == .planned { Button { showingCompletion = true } label: { Label("Mark as completed", systemImage: "checkmark.circle.fill").frame(maxWidth: .infinity).padding(13) }.buttonStyle(.borderedProminent).tint(AppTheme.purple) }
                    }.frame(maxWidth: 680).frame(maxWidth: .infinity).padding(20)
                }
            }
            .background(AppTheme.cream).navigationTitle("Bucket list").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(isPresented: $showingCompletion) { CompletionSheet(entryID: entryID) }
        }
    }

    private func planningSection(_ entry: BucketEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("PLAN IT").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
            if entry.status != .completed {
                DatePicker("Suggest a date", selection: $proposedDate, in: Date.now..., displayedComponents: [.date, .hourAndMinute])
                Button("Add date to group poll") { store.addDateProposal(proposedDate, to: entryID) }.font(.subheadline.weight(.semibold))
            }
            ForEach(entry.dateProposals.sorted { $0.date < $1.date }) { proposal in
                HStack {
                    Button { store.toggleDateVote(proposalID: proposal.id, entryID: entryID) } label: { Image(systemName: proposal.voterIDs.contains(store.currentUser?.id ?? UUID()) ? "checkmark.circle.fill" : "circle").foregroundStyle(AppTheme.purple) }
                    VStack(alignment: .leading) { Text(proposal.date.formatted(date: .abbreviated, time: .shortened)).font(.subheadline.weight(.semibold)); Text("\(proposal.voterIDs.count) available").font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    if entry.status == .matched { Button("Choose") { store.chooseDate(proposal.date, for: entryID) }.font(.caption.weight(.bold)) }
                }.padding(12).cardStyle(radius: 13)
            }
        }
    }

    private func memoryCard(_ entry: BucketEntry) -> some View {
        VStack(alignment: .leading, spacing: 8) { Text("OUR MEMORY").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary); if let rating = entry.groupRating { Text(String(repeating: "★", count: rating)).foregroundStyle(.yellow) }; Text(entry.memoryNote.isEmpty ? "Completed together." : entry.memoryNote) }.padding(16).frame(maxWidth: .infinity, alignment: .leading).cardStyle()
    }
}

private struct CompletionSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    let entryID: UUID
    @State private var note = ""
    @State private var rating = 5
    var body: some View {
        NavigationStack {
            Form {
                Section("How was it?") { Picker("Group rating", selection: $rating) { ForEach(1...5, id: \.self) { Text("\($0) ★").tag($0) } } }
                Section("Save the memory") { TextField("Best moment, inside joke, or note…", text: $note, axis: .vertical).lineLimit(4...8) }
            }
            .navigationTitle("Complete activity").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save") { store.completeEntry(entryID, note: note, rating: rating); dismiss() }.fontWeight(.semibold) } }
        }
    }
}
