import SwiftUI

struct AppRootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        Group {
            switch store.loadState {
            case .idle, .loading:
                LaunchView()
            case .ready, .failed:
                if store.isAuthenticated {
                    MainTabView()
                } else {
                    AuthenticationView()
                }
            }
        }
        .background(AppTheme.cream.ignoresSafeArea())
        .alert("Something went wrong", isPresented: errorBinding) {
            Button("OK", role: .cancel) { store.presentedError = nil }
        } message: {
            Text(store.presentedError ?? "Please try again.")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { store.presentedError != nil },
            set: { if !$0 { store.presentedError = nil } }
        )
    }
}

private struct LaunchView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isVisible = false

    var body: some View {
        VStack(spacing: 18) {
            BrandMark(size: 82)
                .scaleEffect(isVisible ? 1 : 0.88)
                .opacity(isVisible ? 1 : 0)
            Text("reeltogether")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .tracking(-0.6)
            ProgressView().tint(AppTheme.purple).controlSize(.small)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            withAnimation(reduceMotion ? nil : .spring(response: 0.55, dampingFraction: 0.78)) {
                isVisible = true
            }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        TabView(selection: $store.selectedTab) {
            HomeScreen().tag(AppTab.home)
                .tabItem { Label("Home", systemImage: "house.fill") }
            SwipeScreen().tag(AppTab.swipe)
                .tabItem { Label("Discover", systemImage: "rectangle.stack.fill") }
            MatchesScreen().tag(AppTab.matches)
                .tabItem { Label("Matches", systemImage: "sparkles") }
                .badge(store.matches.count)
            ListsScreen().tag(AppTab.lists)
                .tabItem { Label("Lists", systemImage: "person.2.fill") }
        }
        .tint(AppTheme.purple)
    }
}
