import SwiftUI

struct PosterImage: View {
    let url: URL?

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeInOut)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            case .failure:
                placeholder.overlay {
                    Image(systemName: "film").font(.title).foregroundStyle(.white.opacity(0.8))
                }
            default:
                placeholder.overlay { ProgressView().tint(.white) }
            }
        }
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        LinearGradient(colors: [AppTheme.purple, AppTheme.coral], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

struct UserAvatar: View {
    let user: UserProfile
    var size: CGFloat = 34

    var body: some View {
        Text(user.initials)
            .font(.system(size: size * 0.34, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color.avatarColor(named: user.avatarColor), in: Circle())
            .overlay(Circle().stroke(AppTheme.cream, lineWidth: 2))
            .accessibilityLabel(user.displayName)
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView(title, systemImage: icon, description: Text(message))
            .foregroundStyle(AppTheme.ink)
    }
}
