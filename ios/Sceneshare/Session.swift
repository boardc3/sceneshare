import AuthenticationServices
import Foundation
import UIKit

/// Who is signed in, whether they accepted the Terms, and what the account has left.
@MainActor
final class Session: ObservableObject {
    @Published var ready = false
    @Published var user: User?
    @Published var termsAccepted = false
    @Published var accountsFull = false
    @Published var billing: Billing?

    func load() async {
        do {
            let a: AccountResponse = try await API.get("/api/account")
            user = a.user
            termsAccepted = a.terms?.accepted ?? false
            accountsFull = a.accountsFull ?? false
            if user != nil && !accountsFull { await refreshBilling() }
        } catch {
            user = nil
        }
        ready = true
    }

    func refreshBilling() async {
        if let r: BillingResponse = try? await API.get("/api/billing") { billing = r.billing }
    }

    func signIn(email: String, password: String) async throws {
        let _: Empty = try await API.post("/api/auth/sign-in/email", ["email": email, "password": password])
        await load()
        if user == nil { throw APIError(status: 401, code: "sign_in", message: "That email and password did not match.") }
    }

    /// Google: the app starts the sign-in (keeping the challenge cookie), Google runs
    /// in the system sign-in sheet, and the one-time verifier comes back to the app.
    func signInWithGoogle() async throws {
        struct Social: Decodable { let url: String? }
        let start: Social = try await API.post("/api/auth/sign-in/social", ["provider": "google", "callbackURL": "https://www.sceneshare.app/api/applink"])
        guard let s = start.url, let url = URL(string: s) else {
            throw APIError(status: 0, code: "google_unavailable", message: "Google sign-in is not available right now.")
        }
        let back = try await WebAuth.shared.start(url: url, scheme: "sceneshare")
        let items = URLComponents(url: back, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard let verifier = items.first(where: { $0.name == "neon_auth_session_verifier" })?.value,
              let q = verifier.addingPercentEncoding(withAllowedCharacters: .alphanumerics) else {
            throw APIError(status: 0, code: "google_failed", message: "Google sign-in did not finish. Try again.")
        }
        let _: Empty = try await API.get("/api/auth/get-session?neon_auth_session_verifier=\(q)")
        await load()
        if user == nil { throw APIError(status: 401, code: "google_failed", message: "Google sign-in did not finish. Try again.") }
    }

    func signUp(name: String, email: String, password: String) async throws {
        let _: Empty = try await API.post("/api/auth/sign-up/email", ["name": name, "email": email, "password": password])
        await load()
        if user == nil { throw APIError(status: 401, code: "sign_up", message: "Account created. Check your email to confirm it, then sign in.") }
    }

    func signOut() async {
        let _: Empty? = try? await API.post("/api/auth/sign-out", [:])
        HTTPCookieStorage.shared.cookies?.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        user = nil
        billing = nil
    }

    func acceptTerms() async throws {
        let _: Empty = try await API.post("/api/account", ["op": "terms", "accept": true, "rights": true, "context": "ios"])
        termsAccepted = true
    }

    /// "62 renders · 2/5 homes"
    var meter: String {
        guard let b = billing else { return "" }
        let renders: String
        if b.credits?.unlimited == true {
            renders = "Unlimited renders"
        } else {
            renders = "\(Int(b.credits?.available ?? 0)) renders left"
        }
        if let max = b.limits?.homes {
            return renders + " · \(Int(b.usage?.homes ?? 0))/\(Int(max)) homes"
        }
        return renders
    }
}

/// The system sign-in sheet (Safari's cookies, so an existing Google session is reused).
@MainActor
final class WebAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = WebAuth()
    private var current: ASWebAuthenticationSession?

    func start(url: URL, scheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else {
                    let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                    continuation.resume(throwing: APIError(status: 0, code: "cancelled", message: cancelled ? "Sign-in was cancelled." : (error?.localizedDescription ?? "Sign-in failed.")))
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            current = session
            if !session.start() {
                continuation.resume(throwing: APIError(status: 0, code: "google_unavailable", message: "The sign-in sheet could not open."))
            }
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
