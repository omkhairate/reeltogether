# ReelTogether iOS

ReelTogether is a native SwiftUI app for finding movies, shows, and real-world activities a group wants to enjoy. Each shared list owns its members, threshold, filters, votes, pending picks, matches, and bucket-list plans.

## Run

1. Open `ReelTogether.xcodeproj` in Xcode 26 or later.
2. Select an iPhone simulator running iOS 18 or later.
3. Build and run with Command-R.
4. Choose **Explore with a demo account** to enter the seeded three-person list.

The app persists its snapshot atomically in Application Support. Delete the app from the simulator to reset local data.

## Catalog configuration

The app runs with a bundled offline demonstration catalog by default. To use TMDB, add a user-defined build setting named `TMDB_READ_ACCESS_TOKEN`, then expose it in the generated Info.plist as `TMDBReadAccessToken`. The live service loads trending titles and queries TMDB watch-provider availability for the device region. Do not commit production tokens. For App Store distribution, proxy catalog calls through your backend so the token is never shipped in the app.

Discovery filters are stored on `WatchList`, so media type, genre, original language, rating, release year, and streaming-service selections apply to every member of that list once the repository is connected to a shared backend.

Lists may contain movies and shows, activities, or both. Activity filters cover category, indoor/outdoor setting, budget, duration, distance, and vibe. When an activity reaches the list threshold it becomes a bucket entry that moves through `matched`, `planned`, and `completed`, with group date proposals, availability votes, ratings, and memory notes.

## Backend boundary

`SnapshotRepository` and `CatalogService` are protocols. Replace `FileSnapshotRepository` with a network-backed repository (Supabase, Firebase, or your API) while retaining the same `AppStore` and screens. A production backend must enforce list membership, deduplicate votes, evaluate matches transactionally, expire invite codes, and deliver match notifications.

## Tests

The domain engine is also exposed as a small Swift package so it can be tested without launching a simulator:

```sh
cd ios/ReelTogether
swift test
```
