import Foundation
import Testing
@testable import ReelTogetherDomain

struct ActivityMatchEngineTests {
    @Test func activityBecomesBucketMatchAtThreshold() {
        let owner = UUID(); let friend = UUID(); let listID = UUID()
        let list = WatchList(id: listID, name: "Bucket", ownerID: owner, memberIDs: [owner, friend], threshold: 2, inviteCode: "bucket", createdAt: .now, kind: .activities)
        let activity = sampleActivity
        let votes = [
            ActivityVote(id: UUID(), listID: listID, activityID: activity.id, userID: owner, decision: .like, createdAt: .now),
            ActivityVote(id: UUID(), listID: listID, activityID: activity.id, userID: friend, decision: .like, createdAt: .now)
        ]
        let results = ActivityMatchEngine.results(catalog: [activity], votes: votes, list: list, currentUserID: owner)
        #expect(results.first?.status == .matched)
    }

    @Test func activityFiltersCombineConstraints() {
        var filters = ActivityFilters.standard
        filters.setting = .outdoor
        filters.maximumCostLevel = 2
        filters.maximumDistanceKilometres = 10
        filters.vibes = ["Cozy"]
        #expect(filters.includes(sampleActivity))
        filters.maximumDistanceKilometres = 2
        #expect(!filters.includes(sampleActivity))
    }

    private var sampleActivity: ActivityIdea {
        ActivityIdea(id: 42, title: "Picnic", summary: "", category: "Relaxed", setting: .outdoor, costLevel: 1, durationMinutes: 90, distanceKilometres: 5, location: "Park", bestSeason: "Winter", vibeTags: ["Cozy"], imageURL: nil, bookingURL: nil)
    }
}
