import Combine
import Foundation

@MainActor
final class AppStore: ObservableObject {
    enum LoadState: Equatable { case idle, loading, ready, failed(String) }

    @Published private(set) var snapshot: AppSnapshot = .empty
    @Published private(set) var catalog: [MediaTitle] = []
    @Published private(set) var activityCatalog: [ActivityIdea] = []
    @Published private(set) var loadState: LoadState = .idle
    @Published var selectedTab: AppTab = .home
    @Published var presentedError: String?

    private let repository: any SnapshotRepository
    private let catalogService: any CatalogService
    private let activityCatalogService: any ActivityCatalogService

    init(repository: any SnapshotRepository, catalogService: any CatalogService, activityCatalogService: any ActivityCatalogService = DemoActivityCatalogService()) {
        self.repository = repository
        self.catalogService = catalogService
        self.activityCatalogService = activityCatalogService
    }

    convenience init() {
        let token = Bundle.main.object(forInfoDictionaryKey: "TMDBReadAccessToken") as? String ?? ""
        let service: any CatalogService = token.isEmpty ? DemoCatalogService() : TMDBCatalogService(token: token)
        self.init(repository: FileSnapshotRepository(), catalogService: service, activityCatalogService: DemoActivityCatalogService())
    }

    var isAuthenticated: Bool { currentUser != nil }
    var currentUser: UserProfile? { snapshot.users.first { $0.id == snapshot.currentUserID } }
    var lists: [WatchList] { snapshot.lists.filter { $0.memberIDs.contains(snapshot.currentUserID ?? UUID()) } }
    var selectedList: WatchList? {
        snapshot.lists.first { $0.id == snapshot.selectedListID } ?? lists.first
    }
    var selectedMembers: [UserProfile] {
        guard let list = selectedList else { return [] }
        return list.memberIDs.compactMap { id in snapshot.users.first { $0.id == id } }
    }
    var results: [MatchResult] {
        guard let list = selectedList, let userID = currentUser?.id else { return [] }
        return MatchEngine.results(catalog: catalog, votes: snapshot.votes, list: list, currentUserID: userID)
    }
    var matches: [MatchResult] { results.filter { $0.status == .matched } }
    var pending: [MatchResult] { results.filter { $0.status == .pending } }
    var activityResults: [ActivityMatchResult] {
        guard let list = selectedList, let userID = currentUser?.id else { return [] }
        return ActivityMatchEngine.results(catalog: activityCatalog, votes: snapshot.activityVotes ?? [], list: list, currentUserID: userID)
    }
    var activityMatches: [ActivityMatchResult] { activityResults.filter { $0.status == .matched } }
    var activityPending: [ActivityMatchResult] { activityResults.filter { $0.status == .pending } }
    var bucketEntries: [BucketEntry] { (snapshot.bucketEntries ?? []).filter { $0.listID == selectedList?.id } }
    var filteredCatalog: [MediaTitle] {
        guard let filters = selectedList?.discoveryFilters else { return catalog }
        return catalog.filter(filters.includes)
    }
    var swipeQueue: [MediaTitle] {
        guard let list = selectedList, let userID = currentUser?.id else { return [] }
        let voted = Set(snapshot.votes.filter { $0.listID == list.id && $0.userID == userID }.map(\.mediaID))
        return filteredCatalog.filter { !voted.contains($0.id) }
    }
    var filteredActivityCatalog: [ActivityIdea] {
        guard let filters = selectedList?.sharedActivityFilters else { return activityCatalog }
        return activityCatalog.filter(filters.includes)
    }
    var activitySwipeQueue: [ActivityIdea] {
        guard let list = selectedList, let userID = currentUser?.id else { return [] }
        let voted = Set((snapshot.activityVotes ?? []).filter { $0.listID == list.id && $0.userID == userID }.map(\.activityID))
        return filteredActivityCatalog.filter { !voted.contains($0.id) }
    }

    func bootstrap() async {
        guard loadState == .idle else { return }
        loadState = .loading
        do {
            snapshot = try await repository.load() ?? Self.seedSnapshot()
            migrateSnapshotIfNeeded()
            async let media = catalogService.discover()
            async let activities = activityCatalogService.discover()
            catalog = try await media
            activityCatalog = try await activities
            loadState = .ready
            persist()
        } catch {
            catalog = DemoCatalogService.catalog
            activityCatalog = DemoActivityCatalogService.catalog
            loadState = .failed(error.localizedDescription)
            presentedError = "We couldn’t refresh titles. Showing the offline catalog."
        }
    }

    func signIn(displayName: String, username: String) {
        let cleanName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanUsername = username.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanName.count >= 2, cleanUsername.count >= 3 else {
            presentedError = "Enter a name and a username with at least 3 characters."
            return
        }
        if let existing = snapshot.users.first(where: { $0.username == cleanUsername }) {
            snapshot.currentUserID = existing.id
        } else {
            let user = UserProfile(id: UUID(), displayName: cleanName, username: cleanUsername, avatarColor: "coral")
            snapshot.users.append(user)
            snapshot.currentUserID = user.id
            let list = WatchList(id: UUID(), name: "My watchlist", ownerID: user.id, memberIDs: [user.id], threshold: 1, inviteCode: Self.inviteCode(), createdAt: .now)
            snapshot.lists.append(list)
            snapshot.selectedListID = list.id
        }
        persist()
    }

    func enterDemoAccount() {
        let seeded = Self.seedSnapshot()
        snapshot = seeded
        snapshot.currentUserID = seeded.users.first?.id
        persist()
    }

    func signOut() {
        snapshot.currentUserID = nil
        selectedTab = .home
        persist()
    }

    func createList(name: String, threshold: Int, kind: ListContentKind = .watch) {
        guard let userID = currentUser?.id else { return }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { presentedError = "Give your list a name."; return }
        let list = WatchList(id: UUID(), name: cleanName, ownerID: userID, memberIDs: [userID], threshold: max(1, threshold), inviteCode: Self.inviteCode(), createdAt: .now, kind: kind)
        snapshot.lists.append(list)
        snapshot.selectedListID = list.id
        selectedTab = .home
        persist()
    }

    func selectList(_ list: WatchList) {
        snapshot.selectedListID = list.id
        selectedTab = .home
        persist()
    }

    func updateThreshold(_ threshold: Int, for listID: UUID? = nil) {
        guard let resolvedID = listID ?? selectedList?.id,
              let index = snapshot.lists.firstIndex(where: { $0.id == resolvedID }) else { return }
        snapshot.lists[index].threshold = min(max(1, threshold), max(1, snapshot.lists[index].memberIDs.count))
        persist()
    }

    func updateFilters(_ filters: DiscoveryFilters, for listID: UUID? = nil) {
        guard let resolvedID = listID ?? selectedList?.id,
              let index = snapshot.lists.firstIndex(where: { $0.id == resolvedID }) else { return }
        snapshot.lists[index].filters = filters
        persist()
    }

    func updateActivityFilters(_ filters: ActivityFilters, for listID: UUID? = nil) {
        guard let resolvedID = listID ?? selectedList?.id,
              let index = snapshot.lists.firstIndex(where: { $0.id == resolvedID }) else { return }
        snapshot.lists[index].activityFilters = filters
        persist()
    }

    func castVote(for media: MediaTitle, decision: VoteDecision) {
        guard let listID = selectedList?.id, let userID = currentUser?.id else { return }
        snapshot.votes.removeAll { $0.listID == listID && $0.mediaID == media.id && $0.userID == userID }
        snapshot.votes.append(MediaVote(id: UUID(), listID: listID, mediaID: media.id, userID: userID, decision: decision, createdAt: .now))
        persist()
    }

    @discardableResult
    func castActivityVote(for activity: ActivityIdea, decision: VoteDecision) -> ActivityMatchResult? {
        guard let list = selectedList, let userID = currentUser?.id else { return nil }
        var votes = snapshot.activityVotes ?? []
        votes.removeAll { $0.listID == list.id && $0.activityID == activity.id && $0.userID == userID }
        votes.append(ActivityVote(id: UUID(), listID: list.id, activityID: activity.id, userID: userID, decision: decision, createdAt: .now))
        snapshot.activityVotes = votes
        let result = ActivityMatchEngine.results(catalog: activityCatalog, votes: votes, list: list, currentUserID: userID).first { $0.id == activity.id }
        if result?.status == .matched, !(snapshot.bucketEntries ?? []).contains(where: { $0.listID == list.id && $0.activityID == activity.id }) {
            var entries = snapshot.bucketEntries ?? []
            entries.append(BucketEntry(id: UUID(), listID: list.id, activityID: activity.id, status: .matched, dateProposals: [], plannedDate: nil, completedAt: nil, memoryNote: "", groupRating: nil))
            snapshot.bucketEntries = entries
        }
        persist()
        return result?.status == .matched ? result : nil
    }

    func addDateProposal(_ date: Date, to entryID: UUID) {
        guard let userID = currentUser?.id, var entries = snapshot.bucketEntries,
              let index = entries.firstIndex(where: { $0.id == entryID }) else { return }
        entries[index].dateProposals.append(DateProposal(id: UUID(), date: date, voterIDs: [userID]))
        snapshot.bucketEntries = entries
        persist()
    }

    func toggleDateVote(proposalID: UUID, entryID: UUID) {
        guard let userID = currentUser?.id, var entries = snapshot.bucketEntries,
              let entryIndex = entries.firstIndex(where: { $0.id == entryID }),
              let proposalIndex = entries[entryIndex].dateProposals.firstIndex(where: { $0.id == proposalID }) else { return }
        if entries[entryIndex].dateProposals[proposalIndex].voterIDs.contains(userID) { entries[entryIndex].dateProposals[proposalIndex].voterIDs.remove(userID) }
        else { entries[entryIndex].dateProposals[proposalIndex].voterIDs.insert(userID) }
        snapshot.bucketEntries = entries
        persist()
    }

    func chooseDate(_ date: Date, for entryID: UUID) {
        mutateEntry(entryID) { $0.plannedDate = date; $0.status = .planned }
    }

    func completeEntry(_ entryID: UUID, note: String, rating: Int) {
        mutateEntry(entryID) { $0.status = .completed; $0.completedAt = .now; $0.memoryNote = note; $0.groupRating = rating }
    }

    private func mutateEntry(_ id: UUID, mutation: (inout BucketEntry) -> Void) {
        guard var entries = snapshot.bucketEntries, let index = entries.firstIndex(where: { $0.id == id }) else { return }
        mutation(&entries[index]); snapshot.bucketEntries = entries; persist()
    }

    func inviteURL(for list: WatchList) -> URL {
        URL(string: "https://reeltogether.app/join/\(list.inviteCode)")!
    }

    func retryCatalog() async {
        loadState = .loading
        do {
            catalog = try await catalogService.discover()
            loadState = .ready
        } catch {
            loadState = .failed(error.localizedDescription)
            presentedError = error.localizedDescription
        }
    }

    private func persist() {
        let value = snapshot
        Task {
            do { try await repository.save(value) }
            catch { await MainActor.run { self.presentedError = "Your latest change could not be saved." } }
        }
    }

    private func migrateSnapshotIfNeeded() {
        // The original prototype shipped one seeded demo list without a content kind.
        // Upgrade only that known list; user-created legacy lists remain watch lists.
        if let index = snapshot.lists.firstIndex(where: { $0.inviteCode == "sofa2026" && $0.kind == nil }) {
            snapshot.lists[index].kind = .mixed
            if snapshot.activityVotes == nil, let maya = snapshot.users.first(where: { $0.username == "maya" }) {
                snapshot.activityVotes = [ActivityVote(id: UUID(), listID: snapshot.lists[index].id, activityID: 1002, userID: maya.id, decision: .like, createdAt: .now)]
            }
        }
        if snapshot.activityVotes == nil { snapshot.activityVotes = [] }
        if snapshot.bucketEntries == nil { snapshot.bucketEntries = [] }
    }

    private static func inviteCode() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8)).lowercased()
    }

    static func seedSnapshot() -> AppSnapshot {
        let sam = UserProfile(id: UUID(uuidString: "C41F6E90-8BED-4B37-AB7D-C8A8B2340001")!, displayName: "Sam", username: "sam", avatarColor: "coral")
        let maya = UserProfile(id: UUID(uuidString: "C41F6E90-8BED-4B37-AB7D-C8A8B2340002")!, displayName: "Maya", username: "maya", avatarColor: "purple")
        let jon = UserProfile(id: UUID(uuidString: "C41F6E90-8BED-4B37-AB7D-C8A8B2340003")!, displayName: "Jon", username: "jon", avatarColor: "gold")
        let list = WatchList(id: UUID(uuidString: "C41F6E90-8BED-4B37-AB7D-C8A8B2340010")!, name: "Sunday sofa club", ownerID: sam.id, memberIDs: [sam.id, maya.id, jon.id], threshold: 2, inviteCode: "sofa2026", createdAt: .now, kind: .mixed)
        let votes = [
            MediaVote(id: UUID(), listID: list.id, mediaID: 2, userID: maya.id, decision: .like, createdAt: .now),
            MediaVote(id: UUID(), listID: list.id, mediaID: 2, userID: jon.id, decision: .like, createdAt: .now),
            MediaVote(id: UUID(), listID: list.id, mediaID: 3, userID: maya.id, decision: .like, createdAt: .now)
        ]
        let activityVotes = [ActivityVote(id: UUID(), listID: list.id, activityID: 1002, userID: maya.id, decision: .like, createdAt: .now)]
        return AppSnapshot(currentUserID: nil, users: [sam, maya, jon], lists: [list], votes: votes, selectedListID: list.id, activityVotes: activityVotes)
    }
}

enum AppTab: Hashable { case home, swipe, matches, lists }
