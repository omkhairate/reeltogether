import SwiftUI

struct HomeScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var showingAccount = false
    @State private var selectedMedia: MediaTitle?

    var body: some View {
        NavigationStack {
            ScrollView {
                AdaptivePage(maxWidth: 820) {
                    VStack(alignment: .leading, spacing: 22) {
                        greeting
                        if let list = store.selectedList {
                            listHeader(list)
                            queueCard
                            matchesSection
                            if list.contentKind != .watch { bucketSection }
                            swipeButton
                        } else {
                            EmptyStateView(icon: "rectangle.stack.badge.plus", title: "Create your first list", message: "Lists keep every group’s votes and matches separate.")
                        }
                    }
                }.padding(.bottom, 24)
            }
            .background(AppTheme.cream)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 8) {
                        BrandMark(size: 28)
                        Text("reeltogether").font(.system(.headline, design: .rounded, weight: .bold)).tracking(-0.3)
                    }
                    .accessibilityElement(children: .combine)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAccount = true } label: {
                        if let user = store.currentUser { UserAvatar(user: user, size: 32) }
                    }.accessibilityLabel("Account")
                }
            }
            .sheet(isPresented: $showingAccount) { AccountSheet() }
            .sheet(item: $selectedMedia) { MediaDetailView(media: $0) }
        }
    }

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("GOOD EVENING, \(store.currentUser?.displayName.uppercased() ?? "")")
                .font(.caption2.weight(.bold)).tracking(1.1).foregroundStyle(.secondary)
            Text("What are we watching?").font(AppTheme.titleFont)
        }.padding(.top, 12)
    }

    private func listHeader(_ list: WatchList) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 14) { listIcon(list); listText(list); Spacer() }
                VStack(alignment: .leading, spacing: 10) { listIcon(list); listText(list) }
            }
            HStack {
                HStack(spacing: -8) { ForEach(store.selectedMembers) { UserAvatar(user: $0, size: 32) } }
                Spacer()
                ShareLink(item: store.inviteURL(for: list), subject: Text("Join \(list.name)"), message: Text("Swipe movies with me on ReelTogether.")) {
                    Label("Invite", systemImage: "paperplane.fill").font(.caption.weight(.bold))
                }
            }
        }
        .padding(17)
        .background(AppTheme.quietGradient, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AppTheme.purple.opacity(0.10)))
        .accessibilityElement(children: .contain)
    }

    private func listIcon(_ list: WatchList) -> some View {
        Image(systemName: list.contentKind.icon).font(.title2).foregroundStyle(AppTheme.purple)
            .frame(width: 56, height: 56).background(.white.opacity(0.86), in: RoundedRectangle(cornerRadius: 16))
    }

    private func listText(_ list: WatchList) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("YOUR ACTIVE LIST").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
            Text(list.name).font(.title3.weight(.bold)).lineLimit(2)
            Text("\(list.memberIDs.count) members · \(list.safeThreshold) votes to match").font(.caption).foregroundStyle(.secondary)
        }
    }

    private var queueCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("SWIPE QUEUE").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
                Text(queueLabel).font(.headline)
            }
            Spacer()
            ProgressView(value: Double(max(0, totalQueueSize - remainingQueueSize)), total: Double(max(1, totalQueueSize)))
                .progressViewStyle(.circular).tint(AppTheme.purple).frame(width: 46, height: 46)
        }.padding(17).cardStyle()
    }

    private var totalQueueSize: Int {
        switch store.selectedList?.contentKind ?? .watch {
        case .watch: store.filteredCatalog.count
        case .activities: store.filteredActivityCatalog.count
        case .mixed: store.filteredCatalog.count + store.filteredActivityCatalog.count
        }
    }

    private var remainingQueueSize: Int {
        switch store.selectedList?.contentKind ?? .watch {
        case .watch: store.swipeQueue.count
        case .activities: store.activitySwipeQueue.count
        case .mixed: store.swipeQueue.count + store.activitySwipeQueue.count
        }
    }

    private var queueLabel: String { "\(remainingQueueSize) ideas waiting" }

    private var matchesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("YOUR MATCHES").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
                    Text("Ready for the group").font(.title3.weight(.bold))
                }
                Spacer()
                Button("See all") { store.selectedTab = .matches }.font(.caption.weight(.bold))
            }
            if store.matches.isEmpty {
                Text("Your first match will appear when enough members like the same title.")
                    .font(.subheadline).foregroundStyle(.secondary).padding(18).frame(maxWidth: .infinity).cardStyle()
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) { ForEach(store.matches.prefix(5)) { result in Button { selectedMedia = result.media } label: { HomeMatchCard(result: result) }.buttonStyle(.plain) } }
                }
            }
        }
    }

    private var swipeButton: some View {
        Button { store.selectedTab = .swipe } label: {
            HStack(spacing: 12) {
                Image(systemName: "rectangle.stack.fill").frame(width: 42, height: 42).background(.white.opacity(0.13), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) { Text("Keep swiping").fontWeight(.bold); Text("Find your next shared favourite").font(.caption).foregroundStyle(.white.opacity(0.7)) }
                Spacer(); Image(systemName: "chevron.right")
            }.padding(14).foregroundStyle(.white).background(AppTheme.ink, in: RoundedRectangle(cornerRadius: 17))
        }
        .buttonStyle(PressScaleButtonStyle())
    }

    private var bucketSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("SHARED BUCKET LIST").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(.secondary)
                    Text("Things you’ll do together").font(.title3.weight(.bold))
                }
                Spacer(); Button("Open") { store.selectedTab = .matches }.font(.caption.weight(.bold))
            }
            if store.bucketEntries.isEmpty {
                Text("Matched activities will become plans and memories here.").font(.subheadline).foregroundStyle(.secondary).padding(18).frame(maxWidth: .infinity).cardStyle()
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(store.bucketEntries.prefix(5)) { entry in
                            if let activity = store.activityCatalog.first(where: { $0.id == entry.activityID }) {
                                VStack(alignment: .leading, spacing: 0) {
                                    PosterImage(url: activity.imageURL).frame(width: 156, height: 108).clipped()
                                    Text(activity.title).font(.subheadline.weight(.bold)).lineLimit(1).padding(10)
                                }.frame(width: 156).cardStyle(radius: 14).clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct HomeMatchCard: View {
    let result: MatchResult
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PosterImage(url: result.media.posterURL).frame(width: 156, height: 115).clipped()
            Text(result.media.title).font(.subheadline.weight(.bold)).lineLimit(1).padding(.horizontal, 10).padding(.top, 9)
            Label("\(result.likes) of \(result.requiredLikes) picked", systemImage: "checkmark.circle.fill").font(.caption2.weight(.semibold)).foregroundStyle(AppTheme.purple).padding(.horizontal, 10).padding(.bottom, 10)
        }.frame(width: 156).cardStyle(radius: 14).clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

private struct AccountSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    var body: some View {
        NavigationStack {
            List {
                if let user = store.currentUser {
                    HStack(spacing: 14) { UserAvatar(user: user, size: 48); VStack(alignment: .leading) { Text(user.displayName).font(.headline); Text("@\(user.username)").foregroundStyle(.secondary) } }.padding(.vertical, 8)
                }
                Section("Preferences") {
                    Toggle(isOn: $notificationsEnabled) { Label("Match notifications", systemImage: "bell") }
                    LabeledContent { Text("Per shared list").foregroundStyle(.secondary) } label: { Label("Streaming filters", systemImage: "play.tv") }
                }
                Section("Privacy") {
                    Text("Votes stay private until a title or activity reaches the list’s match threshold.").font(.subheadline).foregroundStyle(.secondary)
                }
                Section { Button("Sign out", role: .destructive) { store.signOut(); dismiss() } }
            }
            .navigationTitle("Account").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
