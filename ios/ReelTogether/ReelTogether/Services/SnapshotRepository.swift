import Foundation

protocol SnapshotRepository: Sendable {
    func load() async throws -> AppSnapshot?
    func save(_ snapshot: AppSnapshot) async throws
}

actor FileSnapshotRepository: SnapshotRepository {
    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileManager: FileManager = .default) {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let directory = base.appending(path: "ReelTogether", directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = directory.appending(path: "app-state-v1.json")
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func load() async throws -> AppSnapshot? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        return try decoder.decode(AppSnapshot.self, from: Data(contentsOf: fileURL))
    }

    func save(_ snapshot: AppSnapshot) async throws {
        let data = try encoder.encode(snapshot)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}

actor InMemorySnapshotRepository: SnapshotRepository {
    private var snapshot: AppSnapshot?
    init(snapshot: AppSnapshot? = nil) { self.snapshot = snapshot }
    func load() async throws -> AppSnapshot? { snapshot }
    func save(_ snapshot: AppSnapshot) async throws { self.snapshot = snapshot }
}
