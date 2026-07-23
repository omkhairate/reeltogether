// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ReelTogetherDomain",
    platforms: [.macOS(.v14), .iOS(.v18)],
    products: [.library(name: "ReelTogetherDomain", targets: ["ReelTogetherDomain"])],
    targets: [
        .target(name: "ReelTogetherDomain", path: "ReelTogether/Domain"),
        .testTarget(name: "ReelTogetherDomainTests", dependencies: ["ReelTogetherDomain"], path: "Tests/ReelTogetherDomainTests")
    ]
)
