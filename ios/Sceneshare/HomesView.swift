import SwiftUI

struct HomesView: View {
    @EnvironmentObject var session: Session
    @State private var homes: [HomeRow] = []
    @State private var loading = true
    @State private var error: String?
    @State private var adding = false
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if !session.meter.isEmpty {
                    Section {
                        Label(session.meter, systemImage: "circle.dashed")
                            .font(.subheadline)
                    }
                }
                if let error { ErrorBanner(text: error).listRowInsets(EdgeInsets()) }
                Section {
                    if homes.isEmpty && !loading {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("No homes yet").font(.headline)
                            Text("Add a home, then add its photos from your library or camera.")
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 8)
                    }
                    ForEach(homes) { h in
                        NavigationLink(value: h.id) { HomeRowView(home: h) }
                    }
                }
            }
            .overlay { if loading && homes.isEmpty { ProgressView() } }
            .navigationTitle("My Homes")
            .navigationDestination(for: String.self) { id in HomeView(propertyId: id) }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        if let email = session.user?.email { Text(email) }
                        Link("Buyer analytics", destination: API.url("/analytics"))
                        Link("Account and data (delete account)", destination: API.url("/account"))
                        Link("Open sceneshare.app", destination: API.base)
                        Button("Sign out", role: .destructive) { Task { await session.signOut() } }
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Image(systemName: "plus") }
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .onChange(of: path) { value in
                if value.isEmpty { Task { await load(); await session.refreshBilling() } }
            }
            .sheet(isPresented: $adding) {
                AddHomeSheet { id in
                    adding = false
                    Task {
                        await load()
                        await session.refreshBilling()
                        path.append(id)
                    }
                }
            }
            .sheet(isPresented: Binding(get: { !session.termsAccepted }, set: { _ in })) {
                TermsSheet()
                    .interactiveDismissDisabled()
            }
        }
    }

    private func load() async {
        do {
            let r: HomesResponse = try await API.get("/api/properties?mine=1")
            homes = r.properties
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct HomeRowView: View {
    let home: HomeRow

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let cover = home.cover {
                    AsyncImage(url: API.url(cover)) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        Theme.dusk.opacity(0.08)
                    }
                } else {
                    Theme.dusk.opacity(0.08)
                }
            }
            .frame(width: 72, height: 54)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 3) {
                Text(home.title).font(.headline)
                Text([home.city, "\(Int(home.photos ?? 0)) photos"].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// Terms and photo rights, once per account (the same acceptance as on the web).
struct TermsSheet: View {
    @EnvironmentObject var session: Session
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Before you start").font(.title2.weight(.semibold))
            Text("By continuing you accept Sceneshare’s Terms of Service and Privacy Policy, and confirm you have the right to use the photos you add.")
            Link("Read the Terms", destination: API.url("/terms"))
            Link("Read the Privacy Policy", destination: API.url("/privacy"))
            if let error { ErrorBanner(text: error) }
            Spacer()
            Button {
                busy = true
                Task {
                    do { try await session.acceptTerms() } catch { self.error = error.localizedDescription }
                    busy = false
                }
            } label: {
                if busy { ProgressView() } else { Text("Accept and continue") }
            }
            .buttonStyle(GlowButtonStyle())
            .disabled(busy)
            Button("Sign out") { Task { await session.signOut() } }
                .frame(maxWidth: .infinity)
        }
        .padding(24)
    }
}

/// A new home: by address (looked up as you type), or photos first.
struct AddHomeSheet: View {
    let onCreated: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var suggestions: [Suggestion] = []
    @State private var busy = false
    @State private var error: String?
    @State private var lookup: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            List {
                Section("Address") {
                    TextField("Street address", text: $query)
                        .textContentType(.fullStreetAddress)
                        .autocorrectionDisabled()
                        .onChange(of: query) { value in search(value) }
                    ForEach(suggestions) { s in
                        Button {
                            create(["address": s.text, "placeId": s.placeId ?? "", "ownOnly": true, "lang": "en"])
                        } label: {
                            VStack(alignment: .leading) {
                                Text(s.main ?? s.text).foregroundStyle(.primary)
                                if let sec = s.secondary { Text(sec).font(.footnote).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
                Section {
                    Button("Start with photos, add the address later") {
                        create(["own": true, "lang": "en"])
                    }
                }
                if let error { ErrorBanner(text: error).listRowInsets(EdgeInsets()) }
            }
            .overlay { if busy { ProgressView().controlSize(.large) } }
            .disabled(busy)
            .navigationTitle("Add a Home")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func search(_ value: String) {
        lookup?.cancel()
        let text = value.trimmingCharacters(in: .whitespaces)
        guard text.count >= 4 else { suggestions = []; return }
        lookup = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            if Task.isCancelled { return }
            let q = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            if let r: SuggestResponse = try? await API.get("/api/autocomplete?q=\(q)&lang=en"), !Task.isCancelled {
                suggestions = r.suggestions ?? []
            }
        }
    }

    private func create(_ body: [String: Any]) {
        busy = true
        error = nil
        Task {
            do {
                let r: PropertyResponse = try await API.post("/api/property", body)
                onCreated(r.property.id)
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
