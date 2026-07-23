import Foundation

struct UserProfile: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var displayName: String
    var username: String
    var avatarColor: String

    var initials: String {
        displayName.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
}

struct MediaTitle: Identifiable, Codable, Hashable, Sendable {
    enum MediaType: String, Codable, CaseIterable, Sendable { case movie, series }

    let id: Int
    let title: String
    let year: Int
    let type: MediaType
    let runtime: String
    let rating: Double
    let genres: [String]
    let originalLanguage: String
    let streamingServices: [String]
    let overview: String
    let posterURL: URL?
    let backdropURL: URL?

    var metadata: String {
        "\(year) · \(runtime) · \(genres.prefix(2).joined(separator: " · "))"
    }
}

struct DiscoveryFilters: Codable, Hashable, Sendable {
    var mediaTypes: Set<MediaTitle.MediaType> = Set(MediaTitle.MediaType.allCases)
    var genres: Set<String> = []
    var language: String? = nil
    var streamingServices: Set<String> = []
    var minimumRating: Double = 0
    var earliestYear: Int? = nil

    static let standard = DiscoveryFilters()

    func includes(_ media: MediaTitle) -> Bool {
        mediaTypes.contains(media.type)
            && (genres.isEmpty || !genres.isDisjoint(with: Set(media.genres)))
            && (language == nil || media.originalLanguage == language)
            && (streamingServices.isEmpty || !streamingServices.isDisjoint(with: Set(media.streamingServices)))
            && media.rating >= minimumRating
            && (earliestYear == nil || media.year >= earliestYear!)
    }

    var activeCount: Int {
        (mediaTypes.count == MediaTitle.MediaType.allCases.count ? 0 : 1)
            + (genres.isEmpty ? 0 : 1)
            + (language == nil ? 0 : 1)
            + (streamingServices.isEmpty ? 0 : 1)
            + (minimumRating == 0 ? 0 : 1)
            + (earliestYear == nil ? 0 : 1)
    }
}

enum VoteDecision: String, Codable, Sendable { case like, pass }

enum ListContentKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case watch = "Movies & Shows"
    case activities = "Activities"
    case mixed = "Mixed Bucket List"
    var id: Self { self }
    var icon: String {
        switch self { case .watch: "film.stack.fill"; case .activities: "figure.hiking"; case .mixed: "sparkles" }
    }
}

struct MediaVote: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let listID: UUID
    let mediaID: Int
    let userID: UUID
    let decision: VoteDecision
    let createdAt: Date
}

struct WatchList: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var name: String
    var ownerID: UUID
    var memberIDs: [UUID]
    var threshold: Int
    var inviteCode: String
    var createdAt: Date
    var filters: DiscoveryFilters? = nil
    var kind: ListContentKind? = nil
    var activityFilters: ActivityFilters? = nil

    var safeThreshold: Int { min(max(1, threshold), max(1, memberIDs.count)) }
    var discoveryFilters: DiscoveryFilters { filters ?? .standard }
    var contentKind: ListContentKind { kind ?? .watch }
    var sharedActivityFilters: ActivityFilters { activityFilters ?? .standard }
}

struct AppSnapshot: Codable, Sendable {
    var currentUserID: UUID?
    var users: [UserProfile]
    var lists: [WatchList]
    var votes: [MediaVote]
    var selectedListID: UUID?
    var activityVotes: [ActivityVote]? = nil
    var bucketEntries: [BucketEntry]? = nil

    static let empty = AppSnapshot(currentUserID: nil, users: [], lists: [], votes: [], selectedListID: nil)
}

struct MatchResult: Identifiable, Hashable, Sendable {
    enum Status: Hashable, Sendable { case matched, pending }
    let media: MediaTitle
    let likes: Int
    let requiredLikes: Int
    let status: Status
    var id: Int { media.id }
}

struct ActivityIdea: Identifiable, Codable, Hashable, Sendable {
    enum Setting: String, Codable, CaseIterable, Identifiable, Sendable {
        case indoor = "Indoor"
        case outdoor = "Outdoor"
        case either = "Either"
        var id: Self { self }
    }

    let id: Int
    let title: String
    let summary: String
    let category: String
    let setting: Setting
    let costLevel: Int
    let durationMinutes: Int
    let distanceKilometres: Double
    let location: String
    let bestSeason: String
    let vibeTags: [String]
    let imageURL: URL?
    let bookingURL: URL?

    var costLabel: String { String(repeating: "€", count: max(1, costLevel)) }
    var durationLabel: String {
        durationMinutes >= 60 ? "\(durationMinutes / 60)h\(durationMinutes % 60 == 0 ? "" : " \(durationMinutes % 60)m")" : "\(durationMinutes)m"
    }
}

struct ActivityFilters: Codable, Hashable, Sendable {
    var categories: Set<String> = []
    var setting: ActivityIdea.Setting = .either
    var maximumCostLevel: Int = 4
    var maximumDurationMinutes: Int? = nil
    var maximumDistanceKilometres: Double? = nil
    var vibes: Set<String> = []

    static let standard = ActivityFilters()

    func includes(_ activity: ActivityIdea) -> Bool {
        (categories.isEmpty || categories.contains(activity.category))
            && (setting == .either || activity.setting == setting)
            && activity.costLevel <= maximumCostLevel
            && (maximumDurationMinutes == nil || activity.durationMinutes <= maximumDurationMinutes!)
            && (maximumDistanceKilometres == nil || activity.distanceKilometres <= maximumDistanceKilometres!)
            && (vibes.isEmpty || !vibes.isDisjoint(with: Set(activity.vibeTags)))
    }

    var activeCount: Int {
        (categories.isEmpty ? 0 : 1) + (setting == .either ? 0 : 1)
            + (maximumCostLevel == 4 ? 0 : 1) + (maximumDurationMinutes == nil ? 0 : 1)
            + (maximumDistanceKilometres == nil ? 0 : 1) + (vibes.isEmpty ? 0 : 1)
    }
}

struct ActivityVote: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let listID: UUID
    let activityID: Int
    let userID: UUID
    let decision: VoteDecision
    let createdAt: Date
}

struct ActivityMatchResult: Identifiable, Hashable, Sendable {
    let activity: ActivityIdea
    let likes: Int
    let requiredLikes: Int
    let status: MatchResult.Status
    var id: Int { activity.id }
}

struct DateProposal: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var date: Date
    var voterIDs: Set<UUID>
}

struct BucketEntry: Identifiable, Codable, Hashable, Sendable {
    enum Status: String, Codable, CaseIterable, Sendable { case matched, planned, completed }
    let id: UUID
    let listID: UUID
    let activityID: Int
    var status: Status
    var dateProposals: [DateProposal]
    var plannedDate: Date?
    var completedAt: Date?
    var memoryNote: String
    var groupRating: Int?
}
