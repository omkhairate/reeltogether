import SwiftUI

/// Kept intentionally small so SwiftUI Canvas can build its Preview thunk quickly.
struct ContentView: View {
    @StateObject private var store = AppStore()

    var body: some View {
        AppRootView()
            .environmentObject(store)
            .task { await store.bootstrap() }
    }
}

#Preview {
    ContentView()
}
