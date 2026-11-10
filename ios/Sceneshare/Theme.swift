import SwiftUI

enum Theme {
    static let dusk = Color(red: 0.086, green: 0.129, blue: 0.169)
    static let glow = Color(red: 0.910, green: 0.647, blue: 0.282)
    static let paper = Color(red: 0.973, green: 0.976, blue: 0.969)
}

/// The amber call-to-action used across the app.
struct GlowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Theme.dusk)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(Theme.glow.opacity(configuration.isPressed ? 0.75 : 1))
            .clipShape(Capsule())
    }
}

struct ErrorBanner: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.white)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
