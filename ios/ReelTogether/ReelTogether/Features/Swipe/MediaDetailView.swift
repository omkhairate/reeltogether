import SwiftUI

struct MediaDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let media: MediaTitle

    private var trailerURL: URL {
        var components = URLComponents(string: "https://www.youtube.com/results")!
        components.queryItems = [URLQueryItem(name: "search_query", value: "\(media.title) \(media.year) official trailer")]
        return components.url!
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                AdaptivePage(maxWidth: 680) {
                    VStack(alignment: .leading, spacing: 20) {
                        PosterImage(url: media.backdropURL ?? media.posterURL)
                            .aspectRatio(16 / 10, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 22))
                        VStack(alignment: .leading, spacing: 8) {
                            Text(media.title).font(AppTheme.titleFont)
                            HStack { Label(String(format: "%.1f", media.rating), systemImage: "star.fill").foregroundStyle(.orange); Text(media.metadata).foregroundStyle(.secondary) }.font(.subheadline)
                        }
                        if !media.streamingServices.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("AVAILABLE ON").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
                                AdaptiveTagLayout(tags: media.streamingServices, icon: "play.tv.fill")
                            }
                        }
                        VStack(alignment: .leading, spacing: 8) { Text("ABOUT").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary); Text(media.overview.isEmpty ? "No synopsis is available yet." : media.overview).lineSpacing(4) }
                        HStack {
                            Link(destination: trailerURL) { Label("Find trailer", systemImage: "play.rectangle.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).tint(AppTheme.purple)
                            ShareLink(item: "\(media.title) (\(media.year))") { Label("Share", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
                        }.controlSize(.large)
                    }.padding(.vertical, 20)
                }
            }
            .background(AppTheme.cream).navigationTitle("Details").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct AdaptiveTagLayout: View {
    let tags: [String]
    let icon: String
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack { tagViews }
            VStack(alignment: .leading, spacing: 8) { tagViews }
        }
    }

    @ViewBuilder private var tagViews: some View {
        ForEach(tags, id: \.self) { tag in
            Label(tag, systemImage: icon).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 7).background(AppTheme.purple.opacity(0.12), in: Capsule())
        }
    }
}
