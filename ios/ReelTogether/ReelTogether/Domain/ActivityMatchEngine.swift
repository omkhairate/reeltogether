import Foundation

enum ActivityMatchEngine {
    static func results(
        catalog: [ActivityIdea], votes: [ActivityVote], list: WatchList, currentUserID: UUID
    ) -> [ActivityMatchResult] {
        let grouped = Dictionary(grouping: votes.filter { $0.listID == list.id }, by: \.activityID)
        return catalog.compactMap { activity in
            let latest = Dictionary(
                grouped[activity.id, default: []].sorted { $0.createdAt < $1.createdAt }.map { ($0.userID, $0) },
                uniquingKeysWith: { _, newest in newest }
            )
            let likes = latest.values.filter { $0.decision == .like }.count
            let currentUserLiked = latest[currentUserID]?.decision == .like
            guard likes >= list.safeThreshold || currentUserLiked else { return nil }
            return ActivityMatchResult(
                activity: activity,
                likes: likes,
                requiredLikes: list.safeThreshold,
                status: likes >= list.safeThreshold ? .matched : .pending
            )
        }
        .sorted { lhs, rhs in
            if lhs.status != rhs.status { return lhs.status == .matched }
            return lhs.likes > rhs.likes
        }
    }
}
