import SwiftUI

struct ActivityDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let activity: ActivityIdea

    var body: some View {
        NavigationStack {
            ScrollView {
                AdaptivePage(maxWidth: 680) {
                    VStack(alignment: .leading, spacing: 20) {
                        PosterImage(url: activity.imageURL).aspectRatio(16 / 10, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 22))
                        VStack(alignment: .leading, spacing: 8) {
                            Text(activity.category.uppercased()).font(.caption2.weight(.bold)).tracking(1).foregroundStyle(AppTheme.purple)
                            Text(activity.title).font(AppTheme.titleFont)
                            Text(activity.summary).foregroundStyle(.secondary).lineSpacing(4)
                        }
                        Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 14) {
                            GridRow { detail("Cost", activity.costLabel, "wallet.bifold.fill"); detail("Duration", activity.durationLabel, "clock.fill") }
                            GridRow { detail("Distance", String(format: "%.0f km", activity.distanceKilometres), "location.fill"); detail("Setting", activity.setting.rawValue, "sun.max.fill") }
                            GridRow { detail("Location", activity.location, "map.fill"); detail("Best time", activity.bestSeason, "calendar") }
                        }.padding(16).cardStyle()
                        VStack(alignment: .leading, spacing: 10) {
                            Text("VIBES").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
                            ViewThatFits(in: .horizontal) {
                                HStack { vibeTags }
                                VStack(alignment: .leading, spacing: 8) { vibeTags }
                            }
                        }
                        if let url = activity.bookingURL { Link(destination: url) { Label("Check booking options", systemImage: "safari.fill").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).tint(AppTheme.purple).controlSize(.large) }
                        ShareLink(item: "Bucket-list idea: \(activity.title)") { Label("Share activity", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity) }.buttonStyle(.bordered).controlSize(.large)
                    }.padding(.vertical, 20)
                }
            }
            .background(AppTheme.cream).navigationTitle("Activity details").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func detail(_ label: String, _ value: String, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 3) { Label(label, systemImage: icon).font(.caption).foregroundStyle(.secondary); Text(value).font(.subheadline.weight(.semibold)).lineLimit(2) }.frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var vibeTags: some View {
        ForEach(activity.vibeTags, id: \.self) { Text($0).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 7).background(AppTheme.purple.opacity(0.12), in: Capsule()) }
    }
}
