import SwiftUI

@main
struct SceneshareApp: App {
    @StateObject private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .tint(Theme.dusk)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var session: Session

    var body: some View {
        Group {
            if !session.ready {
                ProgressView()
            } else if session.user == nil {
                SignInView()
            } else if session.accountsFull {
                FullView()
            } else {
                HomesView()
            }
        }
        .task { await session.load() }
    }
}

/// Early access is full: signed in, but no account could be opened.
struct FullView: View {
    @EnvironmentObject var session: Session

    var body: some View {
        VStack(spacing: 16) {
            Text("Every beta spot is taken for now.")
                .font(.title2.weight(.semibold))
                .multilineTextAlignment(.center)
            Text("Email Chris@sceneset.ai to be added.")
                .foregroundStyle(.secondary)
            Button("Sign out") { Task { await session.signOut() } }
                .buttonStyle(.bordered)
        }
        .padding(32)
    }
}
