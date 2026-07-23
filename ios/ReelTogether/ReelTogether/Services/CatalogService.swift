import Foundation

protocol CatalogService: Sendable {
    func discover() async throws -> [MediaTitle]
}

enum CatalogError: LocalizedError {
    case invalidResponse
    case missingConfiguration

    var errorDescription: String? {
        switch self {
        case .invalidResponse: "The movie service returned an invalid response."
        case .missingConfiguration: "The movie service is not configured."
        }
    }
}

struct TMDBCatalogService: CatalogService {
    private let token: String
    private let session: URLSession

    init(token: String, session: URLSession = .shared) {
        self.token = token
        self.session = session
    }

    func discover() async throws -> [MediaTitle] {
        guard !token.isEmpty else { throw CatalogError.missingConfiguration }
        let movieURL = URL(string: "https://api.themoviedb.org/3/trending/all/week?language=en-US")!
        var request = URLRequest(url: movieURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw CatalogError.invalidResponse
        }
        let items = try JSONDecoder().decode(TMDBResponse.self, from: data).results
        return await withTaskGroup(of: (Int, MediaTitle?).self) { group in
            for (index, item) in items.enumerated() {
                group.addTask {
                    let providers = (try? await watchProviders(for: item)) ?? []
                    return (index, item.mediaTitle(streamingServices: providers))
                }
            }
            var values: [(Int, MediaTitle)] = []
            for await (index, title) in group {
                if let title { values.append((index, title)) }
            }
            return values.sorted { $0.0 < $1.0 }.map(\.1)
        }
    }

    private func watchProviders(for item: TMDBItem) async throws -> [String] {
        guard item.mediaType == "movie" || item.mediaType == "tv" else { return [] }
        let url = URL(string: "https://api.themoviedb.org/3/\(item.mediaType!)/\(item.id)/watch/providers")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else { return [] }
        let decoded = try JSONDecoder().decode(TMDBProviderResponse.self, from: data)
        let region = Locale.current.region?.identifier ?? "US"
        let availability = decoded.results[region] ?? decoded.results["US"]
        let providers = (availability?.flatrate ?? []) + (availability?.free ?? []) + (availability?.ads ?? [])
        return Array(Set(providers.map(\.providerName))).sorted()
    }
}

private struct TMDBResponse: Decodable {
    let results: [TMDBItem]
}

private struct TMDBItem: Decodable, Sendable {
    let id: Int
    let title: String?
    let name: String?
    let overview: String
    let posterPath: String?
    let backdropPath: String?
    let releaseDate: String?
    let firstAirDate: String?
    let mediaType: String?
    let voteAverage: Double
    let genreIDs: [Int]
    let originalLanguage: String

    enum CodingKeys: String, CodingKey {
        case id, title, name, overview
        case posterPath = "poster_path"
        case backdropPath = "backdrop_path"
        case releaseDate = "release_date"
        case firstAirDate = "first_air_date"
        case mediaType = "media_type"
        case voteAverage = "vote_average"
        case genreIDs = "genre_ids"
        case originalLanguage = "original_language"
    }

    func mediaTitle(streamingServices: [String]) -> MediaTitle? {
        guard mediaType != "person", let displayTitle = title ?? name else { return nil }
        let date = releaseDate ?? firstAirDate ?? ""
        let year = Int(date.prefix(4)) ?? Calendar.current.component(.year, from: .now)
        let type: MediaTitle.MediaType = mediaType == "tv" ? .series : .movie
        return MediaTitle(
            id: id,
            title: displayTitle,
            year: year,
            type: type,
            runtime: type == .movie ? "Movie" : "Series",
            rating: voteAverage,
            genres: genreIDs.prefix(2).map { GenreMap.name(for: $0) },
            originalLanguage: originalLanguage,
            streamingServices: streamingServices,
            overview: overview,
            posterURL: posterPath.flatMap { URL(string: "https://image.tmdb.org/t/p/w780\($0)") },
            backdropURL: backdropPath.flatMap { URL(string: "https://image.tmdb.org/t/p/w1280\($0)") }
        )
    }
}

private struct TMDBProviderResponse: Decodable {
    let results: [String: TMDBRegionAvailability]
}

private struct TMDBRegionAvailability: Decodable {
    let flatrate: [TMDBProvider]?
    let free: [TMDBProvider]?
    let ads: [TMDBProvider]?
}

private struct TMDBProvider: Decodable {
    let providerName: String
    enum CodingKeys: String, CodingKey { case providerName = "provider_name" }
}

private enum GenreMap {
    static func name(for id: Int) -> String {
        [28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 18: "Drama", 10751: "Family", 14: "Fantasy", 27: "Horror", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller"][id] ?? "Popular"
    }
}

struct DemoCatalogService: CatalogService {
    func discover() async throws -> [MediaTitle] { Self.catalog }

    static let catalog: [MediaTitle] = [
        .init(id: 1, title: "Past Lives", year: 2023, type: .movie, runtime: "1h 46m", rating: 7.8, genres: ["Romance", "Drama"], originalLanguage: "en", streamingServices: ["Prime Video", "MUBI"], overview: "Two childhood friends reconnect in New York after decades apart.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg"), backdropURL: nil),
        .init(id: 2, title: "The Bear", year: 2022, type: .series, runtime: "3 seasons", rating: 8.5, genres: ["Comedy", "Drama"], originalLanguage: "en", streamingServices: ["Disney+ Hotstar"], overview: "A young chef fights to transform his family’s chaotic Chicago sandwich shop.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/sHFlb2qXSeoGzZzM3A3vVdrpJK9.jpg"), backdropURL: nil),
        .init(id: 3, title: "The Holdovers", year: 2023, type: .movie, runtime: "2h 13m", rating: 7.9, genres: ["Comedy", "Drama"], originalLanguage: "en", streamingServices: ["JioHotstar"], overview: "A grumpy professor stays behind at a boarding school over winter break.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/VHSzNBTwxV8vh7wylo7O9CLdac.jpg"), backdropURL: nil),
        .init(id: 4, title: "Fleabag", year: 2016, type: .series, runtime: "2 seasons", rating: 8.7, genres: ["Comedy", "Romance"], originalLanguage: "en", streamingServices: ["Prime Video"], overview: "A sharp, funny woman navigates love and life in London.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/27vEYsRKa3UnaNNMCN41UsjL9hn.jpg"), backdropURL: nil),
        .init(id: 5, title: "Severance", year: 2022, type: .series, runtime: "2 seasons", rating: 8.7, genres: ["Drama", "Mystery"], originalLanguage: "en", streamingServices: ["Apple TV+"], overview: "Office workers undergo a procedure that divides their work and personal memories.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg"), backdropURL: nil),
        .init(id: 6, title: "Dune: Part Two", year: 2024, type: .movie, runtime: "2h 46m", rating: 8.5, genres: ["Sci-Fi", "Adventure"], originalLanguage: "en", streamingServices: ["JioHotstar"], overview: "Paul unites with Chani and the Fremen while seeking revenge against the conspirators.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg"), backdropURL: nil),
        .init(id: 7, title: "Laapataa Ladies", year: 2024, type: .movie, runtime: "2h 2m", rating: 8.1, genres: ["Comedy", "Drama"], originalLanguage: "hi", streamingServices: ["Netflix"], overview: "Two young brides become accidentally separated during a train journey.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/t1bA6aebccz4MWJ3wMavQQtmUXT.jpg"), backdropURL: nil),
        .init(id: 8, title: "Dark", year: 2017, type: .series, runtime: "3 seasons", rating: 8.4, genres: ["Drama", "Mystery"], originalLanguage: "de", streamingServices: ["Netflix"], overview: "A missing child exposes the secrets of four families across generations.", posterURL: URL(string: "https://image.tmdb.org/t/p/w780/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg"), backdropURL: nil)
    ]
}
