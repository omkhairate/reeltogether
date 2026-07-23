import SwiftUI

struct ActivitySwipeScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var dragOffset: CGSize = .zero
    @State private var showingFilters = false
    @State private var celebration: ActivityMatchResult?
    @State private var selectedDetails: ActivityIdea?
    @State private var feedbackTrigger = 0

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                let metrics = SwipeLayoutMetrics(container: proxy.size, dynamicTypeSize: dynamicTypeSize)
                ScrollView(showsIndicators: false) {
                    VStack(spacing: metrics.isCompactHeight ? 8 : 12) {
                        if let activity = store.activitySwipeQueue.first {
                            Label("\(store.selectedList?.safeThreshold ?? 1) votes add this to the bucket list", systemImage: "person.2.fill")
                                .font(.caption).foregroundStyle(.secondary).padding(.top, 4)
                            ActivitySwipeCard(activity: activity, dragOffset: dragOffset, titleFont: metrics.titleFont)
                                .frame(width: metrics.cardWidth, height: metrics.cardHeight)
                                .id(activity.id)
                                .offset(dragOffset).rotationEffect(.degrees(Double(dragOffset.width / 24)))
                                .gesture(dragGesture(activity)).animation(.spring(response: 0.35, dampingFraction: 0.82), value: dragOffset)
                                .transition(.asymmetric(insertion: .scale(scale: 0.98).combined(with: .opacity), removal: .opacity))
                            HStack(spacing: 28) {
                                actionButton("xmark", foreground: AppTheme.coral, background: .white, size: metrics.actionSize, label: "Pass") { vote(.pass, activity) }
                                Button { selectedDetails = activity } label: { Image(systemName: "info.circle").font(.title2).frame(width: max(44, metrics.actionSize * 0.72), height: max(44, metrics.actionSize * 0.72)).background(.white, in: Circle()) }.foregroundStyle(AppTheme.purple).buttonStyle(PressScaleButtonStyle()).accessibilityLabel("More information about \(activity.title)")
                                actionButton("bookmark.fill", foreground: .white, background: AppTheme.purple, size: metrics.actionSize, label: "Add to bucket list") { vote(.like, activity) }
                            }
                            Text("\(store.activitySwipeQueue.count) activity ideas left").font(.caption).foregroundStyle(.secondary)
                        } else {
                            EmptyStateView(icon: "checkmark.circle.fill", title: "You’ve seen every activity", message: "Change the shared filters or check the bucket list.").frame(minHeight: max(360, proxy.size.height - 40))
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .top)
                    .padding(.horizontal, metrics.horizontalPadding).padding(.bottom, 4)
                }
            }
            .background(AppTheme.cream)
            .navigationTitle(store.selectedList?.name ?? "Activities").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showingFilters = true } label: { Image(systemName: "line.3.horizontal.decrease.circle\((store.selectedList?.sharedActivityFilters.activeCount ?? 0) > 0 ? ".fill" : "")") }.accessibilityLabel("Shared activity filters") } }
            .sheet(isPresented: $showingFilters) { ActivityFiltersSheet() }
            .sheet(item: $selectedDetails) { ActivityDetailView(activity: $0) }
            .fullScreenCover(item: $celebration) { MatchCelebrationView(result: $0) { celebration = nil } }
            .sensoryFeedback(.impact(weight: .medium), trigger: feedbackTrigger)
        }
    }

    private func actionButton(_ icon: String, foreground: Color, background: Color, size: CGFloat, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).font(.title2).frame(width: size, height: size).foregroundStyle(foreground).background(background, in: Circle()).shadow(color: .black.opacity(0.07), radius: 6, y: 2) }.buttonStyle(PressScaleButtonStyle()).accessibilityLabel(label)
    }

    private func dragGesture(_ activity: ActivityIdea) -> some Gesture {
        DragGesture().onChanged { dragOffset = $0.translation }.onEnded { value in
            if value.translation.width > 110 { vote(.like, activity) }
            else if value.translation.width < -110 { vote(.pass, activity) }
            withAnimation { dragOffset = .zero }
        }
    }

    private func vote(_ decision: VoteDecision, _ activity: ActivityIdea) {
        feedbackTrigger += 1
        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) { celebration = store.castActivityVote(for: activity, decision: decision) }
    }
}

private struct ActivitySwipeCard: View {
    let activity: ActivityIdea
    let dragOffset: CGSize
    let titleFont: Font
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                PosterImage(url: activity.imageURL).frame(width: proxy.size.width, height: proxy.size.height).clipped()
                LinearGradient(colors: [.clear, .black.opacity(0.9)], startPoint: .center, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 8) {
                    Text(activity.category.uppercased()).font(.caption2.weight(.bold)).tracking(1)
                    Text(activity.title).font(titleFont).lineLimit(2).minimumScaleFactor(0.72)
                    ViewThatFits(in: .horizontal) { HStack(spacing: 12) { metadata }; VStack(alignment: .leading, spacing: 4) { metadata } }.font(.caption.weight(.semibold))
                    Text(activity.summary).font(.caption).foregroundStyle(.white.opacity(0.84)).lineLimit(3)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack { ForEach(activity.vibeTags, id: \.self) { Text($0).font(.caption2.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 5).background(.white.opacity(0.18), in: Capsule()) } }
                    }
                }.padding(21).foregroundStyle(.white).frame(maxWidth: proxy.size.width, alignment: .leading)
                if abs(dragOffset.width) > 45 {
                    Text(dragOffset.width > 0 ? "SAVE" : "PASS").font(.title2.bold()).padding(10).foregroundStyle(dragOffset.width > 0 ? AppTheme.teal : AppTheme.coral).overlay(RoundedRectangle(cornerRadius: 8).stroke(lineWidth: 4)).padding(24).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: dragOffset.width > 0 ? .topLeading : .topTrailing)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous)).shadow(color: .black.opacity(0.12), radius: 14, y: 6)
        .accessibilityElement(children: .combine).accessibilityLabel("\(activity.title), \(activity.costLabel), \(activity.durationLabel), \(activity.distanceKilometres, specifier: "%.0f") kilometres away")
    }

    @ViewBuilder private var metadata: some View {
        Label(activity.costLabel, systemImage: "wallet.bifold.fill")
        Label(activity.durationLabel, systemImage: "clock.fill")
        Label("\(activity.distanceKilometres, specifier: "%.0f") km", systemImage: "location.fill")
    }
}

private struct MatchCelebrationView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let result: ActivityMatchResult
    let dismiss: () -> Void
    @State private var appeared = false

    var body: some View {
        ZStack {
            AppTheme.cream.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 24) {
                    BrandMark(size: 58)
                    VStack(spacing: 10) {
                        Text("BUCKET LIST MATCH").font(.caption.weight(.bold)).tracking(1.6).foregroundStyle(AppTheme.purple)
                        Text(result.activity.title).font(.system(.largeTitle, design: .rounded, weight: .bold)).multilineTextAlignment(.center).foregroundStyle(AppTheme.ink)
                        Text("\(result.likes) friends picked this too. It’s ready to plan.").multilineTextAlignment(.center).foregroundStyle(.secondary)
                    }
                    Button("Plan it") { store.selectedTab = .matches; dismiss() }
                        .buttonStyle(.borderedProminent).tint(AppTheme.purple).controlSize(.large)
                    Button("Keep swiping", action: dismiss).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                }
                .frame(maxWidth: 520).frame(maxWidth: .infinity).padding(32).frame(minHeight: 600)
                .scaleEffect(appeared ? 1 : 0.96).opacity(appeared ? 1 : 0)
            }
        }
        .sensoryFeedback(.success, trigger: appeared)
        .onAppear {
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.82)) { appeared = true }
        }
    }
}
