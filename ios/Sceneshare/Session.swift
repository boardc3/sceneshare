import Foundation

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
