import Foundation
import Testing
@testable import ReelTogetherDomain

struct MatchEngineTests {
    private let owner = UUID()
    private let friend = UUID()
    private let listID = UUID()
    private let media = MediaTitle(id: 7, title: "Test Movie", year: 2026, type: .movie, runtime: "2h", rating: 8, genres: ["Drama"], originalLanguage: "en", streamingServices: ["Netflix"], overview: "", posterURL: nil, backdropURL: nil)

    @Test func reachesConfiguredThreshold() {
        let list = WatchList(id: listID, name: "Friends", ownerID: owner, memberIDs: [owner, friend], threshold: 2, inviteCode: "test", createdAt: .now)
        let votes = [vote(user: owner, decision: .like, seconds: 0), vote(user: friend, decision: .like, seconds: 1)]
        let result = MatchEngine.results(catalog: [media], votes: votes, list: list, currentUserID: owner)
        #expect(result.first?.status == .matched)
        #expect(result.first?.likes == 2)
    }

    @Test func currentUsersLikeIsPendingBelowThreshold() {
        let list = WatchList(id: listID, name: "Friends", ownerID: owner, memberIDs: [owner, friend], threshold: 2, inviteCode: "test", createdAt: .now)
        let result = MatchEngine.results(catalog: [media], votes: [vote(user: owner, decision: .like, seconds: 0)], list: list, currentUserID: owner)
        #expect(result.first?.status == .pending)
    }

    @Test func latestVoteWinsForEachMember() {
        let list = WatchList(id: listID, name: "Friends", ownerID: owner, memberIDs: [owner, friend], threshold: 1, inviteCode: "test", createdAt: .now)
        let votes = [vote(user: owner, decision: .like, seconds: 0), vote(user: owner, decision: .pass, seconds: 1)]
        let result = MatchEngine.results(catalog: [media], votes: votes, list: list, currentUserID: owner)
        #expect(result.isEmpty)
    }

    @Test func sharedFiltersApplyLanguageGenreAndProvider() {
        var filters = DiscoveryFilters.standard
        filters.language = "en"
        filters.genres = ["Drama"]
        filters.streamingServices = ["Netflix"]
        #expect(filters.includes(media))

        filters.streamingServices = ["Prime Video"]
        #expect(!filters.includes(media))
    }

    private func vote(user: UUID, decision: VoteDecision, seconds: TimeInterval) -> MediaVote {
        MediaVote(id: UUID(), listID: listID, mediaID: media.id, userID: user, decision: decision, createdAt: Date(timeIntervalSince1970: seconds))
    }
}
