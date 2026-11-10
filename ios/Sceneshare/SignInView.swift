import SwiftUI

struct SignInView: View {
    @EnvironmentObject var session: Session
    @State private var creating = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Sceneshare")
                    .font(.system(size: 44, weight: .regular, design: .serif))
                    .padding(.top, 48)
                Text("Listing-ready photos in minutes. No photographer required.")
                    .font(.title3)
                    .foregroundStyle(.secondary)

                VStack(spacing: 12) {
                    if creating {
                        TextField("Your name", text: $name)
                            .textContentType(.name)
                    }
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password", text: $password)
                        .textContentType(creating ? .newPassword : .password)
                }
                .textFieldStyle(.roundedBorder)
                .padding(.top, 12)

                if let error { ErrorBanner(text: error) }

                Button(action: submit) {
                    if busy { ProgressView() } else { Text(creating ? "Create account" : "Sign in") }
                }
                .buttonStyle(GlowButtonStyle())
                .disabled(busy || email.isEmpty || password.isEmpty)

                Button {
                    busy = true
                    error = nil
                    Task {
                        do { try await session.signInWithGoogle() } catch let e as APIError where e.code == "cancelled" {
                        } catch { self.error = error.localizedDescription }
                        busy = false
                    }
                } label: {
                    Label("Continue with Google", systemImage: "g.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(busy)

                Button(creating ? "I already have an account" : "Create a free beta account") {
                    creating.toggle()
                    error = nil
                }
                .frame(maxWidth: .infinity)

                if !creating {
                    Link("Forgot your password?", destination: API.url("/reset"))
                        .font(.footnote)
                        .frame(maxWidth: .infinity)
                }

                Text("The same account works on sceneshare.app.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
            .padding(24)
        }
        .background(Theme.paper)
    }

    private func submit() {
        busy = true
        error = nil
        Task {
            do {
                if creating {
                    try await session.signUp(name: name.isEmpty ? email : name, email: email, password: password)
                } else {
                    try await session.signIn(email: email, password: password)
                }
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
