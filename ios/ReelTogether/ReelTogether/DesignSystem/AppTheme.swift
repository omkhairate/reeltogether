import SwiftUI

enum AppTheme {
    static let cream = Color(red: 0.976, green: 0.969, blue: 0.953)
    static let ink = Color(red: 0.15, green: 0.14, blue: 0.20)
    static let coral = Color(red: 0.98, green: 0.53, blue: 0.49)
    static let purple = Color(red: 0.42, green: 0.31, blue: 0.78)
    static let teal = Color(red: 0.24, green: 0.66, blue: 0.64)
    static let line = Color.black.opacity(0.08)
    static let titleFont = Font.system(.title, design: .rounded, weight: .bold)

    static let quietGradient = LinearGradient(
        colors: [Color.white.opacity(0.9), purple.opacity(0.06)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct BrandMark: View {
    var size: CGFloat = 36

    var body: some View {
        Image("BrandMark")
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                    .stroke(.white.opacity(0.22), lineWidth: 0.7)
            }
            .accessibilityHidden(true)
    }
}

struct PressScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .opacity(configuration.isPressed ? 0.82 : 1)
            .animation(.spring(response: 0.24, dampingFraction: 0.72), value: configuration.isPressed)
    }
}

extension View {
    func cardStyle(radius: CGFloat = 18) -> some View {
        background(.white, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(AppTheme.line))
    }
}

extension Color {
    static func avatarColor(named name: String) -> Color {
        switch name {
        case "purple": AppTheme.purple
        case "gold": .orange
        default: AppTheme.coral
        }
    }
}
