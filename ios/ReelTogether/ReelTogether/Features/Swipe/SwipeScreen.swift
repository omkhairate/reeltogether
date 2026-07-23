import SwiftUI

struct SwipeScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var mixedSelection: SwipeContent = .watch

    private enum SwipeContent: String, CaseIterable, Identifiable { case watch = "Watch", activities = "Do"; var id: Self { self } }

    var body: some View {
        switch store.selectedList?.contentKind ?? .watch {
        case .watch: MediaSwipeScreen()
        case .activities: ActivitySwipeScreen()
        case .mixed:
            VStack(spacing: 0) {
                AdaptivePage(maxWidth: 520) {
                    Picker("What to discover", selection: $mixedSelection) { ForEach(SwipeContent.allCases) { Text($0.rawValue).tag($0) } }.pickerStyle(.segmented)
                }.padding(.vertical, 8).background(AppTheme.cream)
                if mixedSelection == .watch { MediaSwipeScreen() } else { ActivitySwipeScreen() }
            }
        }
    }
}

private struct MediaSwipeScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var dragOffset: CGSize = .zero
    @State private var lastVoteMessage: String?
    @State private var showingFilters = false
    @State private var selectedDetails: MediaTitle?
    @State private var feedbackTrigger = 0

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                let metrics = SwipeLayoutMetrics(container: proxy.size, dynamicTypeSize: dynamicTypeSize)
                ScrollView(showsIndicators: false) {
                    VStack(spacing: metrics.isCompactHeight ? 8 : 12) {
                        if let media = store.swipeQueue.first {
                            thresholdHeader
                            SwipeCard(media: media, dragOffset: dragOffset, titleFont: metrics.titleFont)
                                .frame(width: metrics.cardWidth, height: metrics.cardHeight)
                                .id(media.id)
                                .offset(dragOffset)
                                .rotationEffect(.degrees(Double(dragOffset.width / 24)))
                                .gesture(dragGesture(media))
                                .animation(.spring(response: 0.35, dampingFraction: 0.82), value: dragOffset)
                                .transition(.asymmetric(insertion: .scale(scale: 0.98).combined(with: .opacity), removal: .opacity))
                            voteButtons(media, size: metrics.actionSize)
                            Text("\(store.swipeQueue.count) picks left for you").font(.caption).foregroundStyle(.secondary)
                        } else {
                            EmptyStateView(icon: "checkmark.circle.fill", title: "You’re all caught up", message: "We’ll add more titles when the catalog refreshes.")
                                .frame(minHeight: max(360, proxy.size.height - 40))
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .top)
                    .padding(.horizontal, metrics.horizontalPadding).padding(.bottom, 4)
                }
            }
            .background(AppTheme.cream)
            .navigationTitle(store.selectedList?.name ?? "Swipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingFilters = true } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle\((store.selectedList?.discoveryFilters.activeCount ?? 0) > 0 ? ".fill" : "")")
                    }
                    .accessibilityLabel("Shared discovery filters")
                }
            }
            .sheet(isPresented: $showingFilters) { DiscoveryFiltersSheet() }
            .sheet(item: $selectedDetails) { MediaDetailView(media: $0) }
            .sensoryFeedback(.impact(weight: .medium), trigger: feedbackTrigger)
            .overlay(alignment: .bottom) { if let lastVoteMessage { Text(lastVoteMessage).font(.caption).foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 9).background(AppTheme.ink, in: Capsule()).padding(.bottom, 82).transition(.move(edge: .bottom).combined(with: .opacity)) } }
        }
    }

    private var thresholdHeader: some View {
        Label("\(store.selectedList?.safeThreshold ?? 1) of \(store.selectedMembers.count) votes to match", systemImage: "person.2.fill")
            .font(.caption).foregroundStyle(.secondary).padding(.top, 4)
    }

    private func voteButtons(_ media: MediaTitle, size: CGFloat) -> some View {
        HStack(spacing: 24) {
            voteButton("xmark", foreground: AppTheme.coral, background: .white, size: size, label: "Pass") { vote(.pass, media) }
            Button { selectedDetails = media } label: { Image(systemName: "info.circle").font(.title2).frame(width: max(44, size * 0.72), height: max(44, size * 0.72)).background(.white, in: Circle()) }.foregroundStyle(AppTheme.purple).buttonStyle(PressScaleButtonStyle()).accessibilityLabel("More information about \(media.title)")
            voteButton("hand.thumbsup.fill", foreground: .white, background: AppTheme.purple, size: size, label: "Pick") { vote(.like, media) }
        }
    }

    private func voteButton(_ icon: String, foreground: Color, background: Color, size: CGFloat, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.title2).frame(width: size, height: size).foregroundStyle(foreground).background(background, in: Circle()).shadow(color: .black.opacity(0.07), radius: 6, y: 2) }.buttonStyle(PressScaleButtonStyle()).accessibilityLabel(label)
    }

    private func dragGesture(_ media: MediaTitle) -> some Gesture {
        DragGesture().onChanged { dragOffset = $0.translation }.onEnded { value in
            if value.translation.width > 110 { vote(.like, media) }
            else if value.translation.width < -110 { vote(.pass, media) }
            withAnimation { dragOffset = .zero }
        }
    }

    private func vote(_ decision: VoteDecision, _ media: MediaTitle) {
        feedbackTrigger += 1
        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) { store.castVote(for: media, decision: decision); lastVoteMessage = decision == .like ? "Picked — waiting for your friends" : "Passed for this list" }
        Task { try? await Task.sleep(for: .seconds(1.5)); await MainActor.run { withAnimation { lastVoteMessage = nil } } }
    }
}

private struct SwipeCard: View {
    let media: MediaTitle
    let dragOffset: CGSize
    let titleFont: Font
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                PosterImage(url: media.posterURL).frame(width: proxy.size.width, height: proxy.size.height).clipped()
                LinearGradient(colors: [.clear, .black.opacity(0.92)], startPoint: .center, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 7) {
                    Label(String(format: "%.1f", media.rating), systemImage: "star.fill").foregroundStyle(.yellow).font(.caption.weight(.bold))
                    Text(media.title).font(titleFont).lineLimit(2).minimumScaleFactor(0.75)
                    Text(media.metadata).font(.caption).lineLimit(2)
                    if !media.streamingServices.isEmpty {
                        HStack(spacing: 6) {
                            Image(systemName: "play.tv.fill")
                            Text(media.streamingServices.joined(separator: " · ")).lineLimit(1)
                        }
                        .font(.caption.weight(.semibold)).foregroundStyle(.white)
                    }
                    Text(media.overview).font(.caption).foregroundStyle(.white.opacity(0.82)).lineLimit(3).padding(.top, 3)
                }.padding(21).foregroundStyle(.white).frame(maxWidth: proxy.size.width, alignment: .leading)
                voteStamp
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(media.title), \(media.metadata), rated \(String(format: "%.1f", media.rating))")
    }

    @ViewBuilder private var voteStamp: some View {
        if abs(dragOffset.width) > 45 {
            Text(dragOffset.width > 0 ? "PICK" : "PASS").font(.title.bold()).padding(10)
                .foregroundStyle(dragOffset.width > 0 ? AppTheme.teal : AppTheme.coral)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(lineWidth: 4))
                .rotationEffect(.degrees(dragOffset.width > 0 ? -12 : 12))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: dragOffset.width > 0 ? .topLeading : .topTrailing).padding(24)
        }
    }
}
