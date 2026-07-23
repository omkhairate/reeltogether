import SwiftUI

struct AdaptivePage<Content: View>: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private let maxWidth: CGFloat
    private let content: Content

    init(maxWidth: CGFloat = 760, @ViewBuilder content: () -> Content) {
        self.maxWidth = maxWidth
        self.content = content()
    }

    var body: some View {
        content
            .frame(maxWidth: maxWidth)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, horizontalSizeClass == .regular ? 32 : 20)
    }
}

struct SwipeLayoutMetrics {
    let container: CGSize
    let dynamicTypeSize: DynamicTypeSize

    var isCompactHeight: Bool { container.height < 620 }
    var horizontalPadding: CGFloat { container.width > 700 ? 44 : 20 }
    var cardWidth: CGFloat { min(540, max(280, container.width - horizontalPadding * 2)) }
    var cardHeight: CGFloat {
        if isCompactHeight {
            return max(250, min(420, container.height - 118))
        }
        // Fill tall phones while leaving measured room for the threshold label,
        // action controls, queue count, spacing, and the system tab bar.
        let reservedHeight: CGFloat = dynamicTypeSize.isAccessibilitySize ? 190 : 132
        let heightDriven = container.height - reservedHeight
        let minimumFromWidth = cardWidth * (dynamicTypeSize.isAccessibilitySize ? 1.18 : 1.08)
        return min(700, max(minimumFromWidth, heightDriven))
    }
    var actionSize: CGFloat { isCompactHeight ? 54 : 64 }
    var titleFont: Font { isCompactHeight ? .title2.bold() : .largeTitle.bold() }
}

extension View {
    func adaptiveListMargins(_ horizontalSizeClass: UserInterfaceSizeClass?) -> some View {
        contentMargins(.horizontal, horizontalSizeClass == .regular ? 120 : 0, for: .scrollContent)
    }
}
