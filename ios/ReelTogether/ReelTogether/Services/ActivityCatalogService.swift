import Foundation

protocol ActivityCatalogService: Sendable {
    func discover() async throws -> [ActivityIdea]
}

struct DemoActivityCatalogService: ActivityCatalogService {
    func discover() async throws -> [ActivityIdea] { Self.catalog }

    static let catalog: [ActivityIdea] = [
        .init(id: 1001, title: "Sunrise hill hike", summary: "Start early, bring chai, and watch the city wake up from a nearby trail.", category: "Outdoors", setting: .outdoor, costLevel: 1, durationMinutes: 180, distanceKilometres: 12, location: "Nearby hills", bestSeason: "October–March", vibeTags: ["Adventurous", "Active", "Scenic"], imageURL: URL(string: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=1200"), bookingURL: nil),
        .init(id: 1002, title: "Pottery workshop", summary: "Learn wheel throwing together and take home something beautifully imperfect.", category: "Creative", setting: .indoor, costLevel: 3, durationMinutes: 120, distanceKilometres: 6, location: "Local pottery studio", bestSeason: "Anytime", vibeTags: ["Creative", "Cozy", "Date night"], imageURL: URL(string: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=1200"), bookingURL: URL(string: "https://www.google.com/search?q=pottery+workshop+near+me")),
        .init(id: 1003, title: "Street-food crawl", summary: "Pick five legendary stalls and split one signature dish at every stop.", category: "Food", setting: .outdoor, costLevel: 2, durationMinutes: 150, distanceKilometres: 4, location: "Old city market", bestSeason: "Anytime", vibeTags: ["Foodie", "Social", "Spontaneous"], imageURL: URL(string: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200"), bookingURL: nil),
        .init(id: 1004, title: "Escape room challenge", summary: "Race the clock, solve clues, and find out who panics first.", category: "Games", setting: .indoor, costLevel: 3, durationMinutes: 75, distanceKilometres: 8, location: "City centre", bestSeason: "Anytime", vibeTags: ["Competitive", "Social", "Rainy day"], imageURL: URL(string: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200"), bookingURL: URL(string: "https://www.google.com/search?q=escape+room+near+me")),
        .init(id: 1005, title: "Kayaking afternoon", summary: "Spend a few hours on calm water and finish with snacks by the shore.", category: "Outdoors", setting: .outdoor, costLevel: 3, durationMinutes: 180, distanceKilometres: 24, location: "Nearest lake", bestSeason: "November–February", vibeTags: ["Adventurous", "Active", "Scenic"], imageURL: URL(string: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200"), bookingURL: nil),
        .init(id: 1006, title: "Golden-hour picnic", summary: "Everyone brings one favourite snack, a blanket, and a tiny speaker.", category: "Relaxed", setting: .outdoor, costLevel: 1, durationMinutes: 120, distanceKilometres: 3, location: "Neighbourhood park", bestSeason: "October–March", vibeTags: ["Cozy", "Cheap", "Scenic"], imageURL: URL(string: "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=1200"), bookingURL: nil),
        .init(id: 1007, title: "Live music night", summary: "Discover a small local act and make a night of it.", category: "Culture", setting: .indoor, costLevel: 3, durationMinutes: 180, distanceKilometres: 7, location: "Local venue", bestSeason: "Anytime", vibeTags: ["Social", "Date night", "Lively"], imageURL: URL(string: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200"), bookingURL: nil),
        .init(id: 1008, title: "Volunteer together", summary: "Choose a local cause and spend a morning making yourselves useful.", category: "Community", setting: .either, costLevel: 1, durationMinutes: 180, distanceKilometres: 10, location: "Local community", bestSeason: "Anytime", vibeTags: ["Meaningful", "Social", "Active"], imageURL: URL(string: "https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1200"), bookingURL: nil)
    ]
}
