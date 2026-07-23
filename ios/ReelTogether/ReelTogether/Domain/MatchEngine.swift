import Foundation

enum MatchEngine {
    static func results(
        catalog: [MediaTitle],
        votes: [MediaVote],
        list: WatchList,
        currentUserID: UUID
    ) -> [MatchResult] {
        let listVotes = votes.filter { $0.listID == list.id }
        let grouped = Dictionary(grouping: listVotes, by: \.mediaID)

        return catalog.compactMap { media in
            let mediaVotes = grouped[media.id, default: []]
            let latestByUser = Dictionary(
                mediaVotes.sorted { $0.createdAt < $1.createdAt }.map { ($0.userID, $0) },
                uniquingKeysWith: { _, latest in latest }
            )
            let likes = latestByUser.values.filter { $0.decision == .like }.count
            let currentUserLiked = latestByUser[currentUserID]?.decision == .like
            guard likes >= list.safeThreshold || currentUserLiked else { return nil }
            return MatchResult(
                media: media,
                likes: likes,
                requiredLikes: list.safeThreshold,
                status: likes >= list.safeThreshold ? .matched : .pending
            )
        }
        .sorted {
            if $0.status != $1.status { return $0.status == .matched }
            return $0.likes > $1.likes
        }
    }
}
