import SwiftUI

struct AuthenticationView: View {
    @EnvironmentObject private var store: AppStore
    @State private var displayName = ""
    @State private var username = ""
    @State private var appeared = false
    @FocusState private var focusedField: Field?

    private enum Field { case name, username }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Spacer(minLength: 40)
                brand
                VStack(alignment: .leading, spacing: 10) {
                    Text("Never debate what to watch again.")
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Create shared lists, swipe separately, and match when enough friends say yes.")
                        .font(.body).foregroundStyle(.secondary).lineSpacing(3)
                }
                fields
                Button(action: submit) {
                    Text("Create account")
                        .fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 15)
                }
                .buttonStyle(.borderedProminent).tint(AppTheme.purple)
                .disabled(displayName.trimmingCharacters(in: .whitespaces).count < 2 || username.count < 3)
                Button("Explore with a demo account") { store.enterDemoAccount() }
                    .fontWeight(.semibold).foregroundStyle(AppTheme.purple).frame(maxWidth: .infinity)
                Text("The local account flow is ready for a production auth provider. Demo data stays on this device.")
                    .font(.caption).foregroundStyle(.tertiary).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24).padding(.vertical, 20)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 12)
        }
        .background(AppTheme.quietGradient.ignoresSafeArea())
        .onAppear { withAnimation(.easeOut(duration: 0.42)) { appeared = true } }
    }

    private var brand: some View {
        HStack(spacing: 10) {
            BrandMark(size: 40)
            Text("reeltogether").font(.system(size: 23, weight: .bold, design: .rounded)).tracking(-0.4)
        }
        .accessibilityElement(children: .combine)
    }

    private var fields: some View {
        VStack(spacing: 14) {
            TextField("Your name", text: $displayName)
                .textContentType(.name).focused($focusedField, equals: .name)
            TextField("Username", text: $username)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .textContentType(.username).focused($focusedField, equals: .username)
            Text("Your username is how friends find and invite you.")
                .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
        }
        .textFieldStyle(.roundedBorder)
        .submitLabel(.continue)
        .onSubmit { focusedField = focusedField == .name ? .username : nil }
    }

    private func submit() { store.signIn(displayName: displayName, username: username) }
}
