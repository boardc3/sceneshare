import PhotosUI
import SwiftUI

/// One home: its photos, native upload from the library or camera, and the
/// professional / restyle runs. Everything is saved on the server as it happens,
/// so the website shows the same home.
@MainActor
final class HomeModel: ObservableObject {
    let id: String
    @Published var property: Property?
    @Published var loading = true
    @Published var error: String?
    @Published var uploadDone = 0
    @Published var uploadTotal = 0
    @Published var runDone = 0
    @Published var runTotal = 0
    @Published var runLabel = ""
    @Published var designId: String?          // the design shown on the photos
    @Published var busyPhotos: Set<String> = []
    @Published var stats: ShareTotals?
    @Published var deleted = false

    init(id: String) { self.id = id }

    var photos: [Photo] { property?.photos ?? [] }
    var editable: [Photo] { photos.filter { $0.editable } }
    var designs: [Design] { property?.designs ?? [] }
    var design: Design? { designs.first { $0.id == designId } ?? designs.last }
    var uploading: Bool { uploadTotal > 0 }
    var running: Bool { runTotal > 0 }

    func photo(_ photoId: String) -> Photo? { photos.first { $0.id == photoId } }

    func load() async {
        do {
            let r: PropertyResponse = try await API.get("/api/properties?id=\(id)&full=1")
            property = r.property
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
        if let s: SharesResponse = try? await API.get("/api/shares?propertyId=\(id)") { stats = s.totals }
    }

    /// Photos picked from the library: loaded, shrunk and uploaded one at a time.
    func upload(items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        uploadTotal = items.count
        uploadDone = 0
        for item in items {
            do {
                if let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    _ = try await Uploader.upload(image, to: id)
                } else {
                    error = "One photo could not be read."
                }
            } catch {
                self.error = error.localizedDescription
            }
            uploadDone += 1
        }
        uploadTotal = 0
        await load()
    }

    func upload(image: UIImage) async {
        uploadTotal = 1
        uploadDone = 0
        do {
            _ = try await Uploader.upload(image, to: id)
        } catch {
            self.error = error.localizedDescription
        }
        uploadTotal = 0
        await load()
    }

    /// One run: create the design, render each photo (three at a time), finish.
    /// `only` limits the run to some photos (their own design round).
    func run(mode: String, style: String, light: String, note: String, only: [String]? = nil, session: Session) async {
        let ids = only ?? editable.map { $0.id }
        guard !ids.isEmpty, !running else { return }
        runLabel = mode == "cleanup" ? "Making photos professional" : (mode == "polish" ? "Relighting" : "Restyling")
        runTotal = ids.count
        runDone = 0
        error = nil
        do {
            var body: [String: Any] = ["op": "design.create", "propertyId": id, "mode": mode, "style": style, "light": light, "note": note, "lang": "en"]
            if let only { body["photoIds"] = only }
            let created: DesignResponse = try await API.post("/api/properties", body)
            let did = created.design.id
            let propertyId = id
            var failed: [String] = []
            var lastError: String?
            var index = 0
            while index < ids.count {
                let chunk = Array(ids[index..<min(index + 3, ids.count)])
                index += chunk.count
                let results = await withTaskGroup(of: (String, String?).self) { group -> [(String, String?)] in
                    for pid in chunk {
                        group.addTask {
                            do {
                                let _: RenderResponse = try await API.post("/api/render", ["propertyId": propertyId, "designId": did, "photoId": pid, "lang": "en"])
                                return (pid, nil)
                            } catch {
                                return (pid, error.localizedDescription)
                            }
                        }
                    }
                    var out: [(String, String?)] = []
                    for await r in group { out.append(r) }
                    return out
                }
                for (pid, message) in results {
                    if let message {
                        failed.append(pid)
                        lastError = message
                    }
                    runDone += 1
                }
            }
            let _: Empty? = try? await API.post("/api/properties", ["op": "design.finish", "propertyId": id, "designId": did, "failed": failed, "lang": "en"])
            designId = did
            if let lastError { error = failed.count == ids.count ? lastError : "\(failed.count) photo(s) did not finish: \(lastError)" }
        } catch {
            self.error = error.localizedDescription
        }
        runTotal = 0
        await load()
        await session.refreshBilling()
    }

    /// A change request on one photo of the design shown: "no rug", "warmer wood".
    func change(photoId: String, note: String, session: Session) async {
        guard let d = design, let pick = d.picks?[photoId] ?? nil else { return }
        busyPhotos.insert(photoId)
        error = nil
        do {
            let _: RenderResponse = try await API.post("/api/render", ["propertyId": id, "designId": d.id, "photoId": photoId, "feedback": note, "baseVersionId": pick, "lang": "en"])
        } catch {
            self.error = error.localizedDescription
        }
        busyPhotos.remove(photoId)
        await load()
        await session.refreshBilling()
    }

    /// Owner changes that are one call: hide or remove a photo, delete a round, rename.
    func op(_ name: String, _ extra: [String: Any] = [:]) async {
        var body: [String: Any] = ["op": name, "propertyId": id, "lang": "en"]
        for (k, v) in extra { body[k] = v }
        do {
            let _: Empty = try await API.post("/api/properties", body)
            if name == "property.delete" { deleted = true; return }
        } catch {
            self.error = error.localizedDescription
        }
        await load()
    }

    func setAddress(_ s: Suggestion) async {
        do {
            let _: Empty = try await API.post("/api/property", ["address": s.text, "placeId": s.placeId ?? "", "propertyId": id, "ownOnly": true, "lang": "en"])
        } catch {
            self.error = error.localizedDescription
        }
        await load()
    }

    /// Emails the buyer link from Sceneshare; returns the addresses that did not send.
    func email(to recipients: String, name: String, message: String) async throws -> [String] {
        let r: ShareResponse = try await API.post("/api/shares", ["propertyId": id, "channel": "email", "recipients": recipients, "name": name, "message": message, "lang": "en"])
        await load()
        return r.failed ?? []
    }
}

struct HomeView: View {
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model: HomeModel
    @State private var picked: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var restyling = false
    @State private var open: Photo?
    @State private var emailing = false
    @State private var renaming = false
    @State private var newName = ""
    @State private var addressing = false
    @State private var confirmDelete = false

    init(propertyId: String) {
        _model = StateObject(wrappedValue: HomeModel(id: propertyId))
    }

    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if model.editable.isEmpty && !model.loading && !model.uploading {
                    starter
                } else {
                    addButtons
                }

                if !model.designs.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(model.designs) { d in
                                Button(d.name) { model.designId = d.id }
                                    .buttonStyle(.bordered)
                                    .tint(model.design?.id == d.id ? Theme.glow : Color.gray)
                                    .contextMenu {
                                        Button("Show this one first to buyers") { Task { await model.op("design.feature", ["designId": d.id]) } }
                                        Button("Delete this round", role: .destructive) { Task { await model.op("design.delete", ["designId": d.id]) } }
                                    }
                            }
                        }
                    }
                    Text("Press and hold a round to feature or delete it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(model.photos) { photo in
                        Button { open = photo } label: { thumb(photo) }
                            .buttonStyle(.plain)
                    }
                }

                if !model.editable.isEmpty {
                    VStack(spacing: 10) {
                        Button("Make all professional") {
                            Task { await model.run(mode: "cleanup", style: "signature", light: "daylight", note: "", session: session) }
                        }
                        .buttonStyle(GlowButtonStyle())
                        Button("Restyle this home") { restyling = true }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                            .frame(maxWidth: .infinity)
                        Text("Uses \(model.editable.count) renders. \(session.meter)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .disabled(model.running || model.uploading)
                    .padding(.top, 8)
                }
            }
            .padding(16)
        }
        .overlay { if model.loading { ProgressView() } }
        .navigationTitle(model.property?.title ?? "Home")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let p = model.property { actions(p) }
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
        .onChange(of: picked) { items in
            guard !items.isEmpty else { return }
            picked = []
            Task { await model.upload(items: items) }
        }
        .onChange(of: model.deleted) { gone in
            if gone { dismiss() }
        }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { image in Task { await model.upload(image: image) } }
                .ignoresSafeArea()
        }
        .sheet(isPresented: $restyling) {
            RestyleSheet(count: model.editable.count) { style, light, note in
                restyling = false
                Task { await model.run(mode: "redesign", style: style, light: light, note: note, session: session) }
            }
        }
        .sheet(item: $open) { photo in
            PhotoDetail(model: model, photoId: photo.id)
        }
        .sheet(isPresented: $emailing) {
            EmailSheet(model: model)
        }
        .sheet(isPresented: $addressing) {
            AddressSheet { suggestion in
                addressing = false
                Task { await model.setAddress(suggestion) }
            }
        }
        .alert("Rename this home", isPresented: $renaming) {
            TextField("Name", text: $newName)
            Button("Save") { Task { await model.op("property.rename", ["name": newName]) } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Delete this home and all of its photos? Its share link will stop working.", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete this home", role: .destructive) { Task { await model.op("property.delete") } }
            Button("Cancel", role: .cancel) {}
        }
    }

    @ViewBuilder
    private var header: some View {
        if let error = model.error { ErrorBanner(text: error) }

        if let place = model.property?.address?.formatted {
            Text(place).font(.subheadline).foregroundStyle(.secondary)
        } else if model.property != nil {
            Button("Add the address") { addressing = true }
                .font(.subheadline)
        }

        if let s = model.stats, (s.shares ?? 0) + (s.views ?? 0) > 0 {
            Text("\(Int(s.shares ?? 0)) shares · \(Int(s.recipients ?? 0)) people emailed · \(Int(s.opens ?? 0)) link clicks · \(Int(s.views ?? 0)) buyer views")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }

        if model.uploading {
            ProgressView("Uploading \(min(model.uploadDone + 1, model.uploadTotal)) of \(model.uploadTotal)", value: Double(model.uploadDone), total: Double(max(1, model.uploadTotal)))
        }
        if model.running {
            ProgressView("\(model.runLabel): \(model.runDone) of \(model.runTotal)", value: Double(model.runDone), total: Double(max(1, model.runTotal)))
            Text("Keep the app open. Each finished photo is saved as it lands.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func actions(_ p: Property) -> some View {
        Menu {
            ShareLink(item: p.shareURL, subject: Text(p.title), message: Text("Take a look at \(p.title) on Sceneshare.")) {
                Label("Share the buyer link", systemImage: "square.and.arrow.up")
            }
            Button { emailing = true } label: { Label("Email buyers", systemImage: "envelope") }
            Link(destination: p.shareURL) { Label("Preview the buyer page", systemImage: "safari") }
            Divider()
            Button { newName = p.nickname ?? ""; renaming = true } label: { Label("Rename", systemImage: "pencil") }
            Button { addressing = true } label: { Label(p.address?.formatted == nil ? "Add the address" : "Change the address", systemImage: "mappin.and.ellipse") }
            Button(role: .destructive) { confirmDelete = true } label: { Label("Delete this home", systemImage: "trash") }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
    }

    private var starter: some View {
        VStack(spacing: 14) {
            Text("Add this home’s photos")
                .font(.system(.title2, design: .serif))
            Text("One wide shot per room is enough.")
                .foregroundStyle(.secondary)
            addButtons
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [6]))
                .foregroundStyle(Theme.dusk.opacity(0.3))
        )
    }

    private var addButtons: some View {
        HStack(spacing: 10) {
            PhotosPicker(selection: $picked, maxSelectionCount: 40, matching: .images) {
                Label("Photo library", systemImage: "photo.on.rectangle.angled")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            Button { camera = true } label: {
                Label("Camera", systemImage: "camera")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .controlSize(.large)
        .disabled(model.uploading || model.running)
    }

    private func thumb(_ photo: Photo) -> some View {
        let shown = model.design?.version(for: photo)
        return Color.clear
            .aspectRatio(4.0 / 3.0, contentMode: .fit)
            .overlay(
                AsyncImage(url: API.url(shown?.src ?? photo.src)) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    Theme.dusk.opacity(0.08)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .opacity(photo.hidden == true ? 0.4 : 1)
            .overlay(alignment: .bottomTrailing) {
                if model.busyPhotos.contains(photo.id) {
                    ProgressView().padding(8)
                } else if shown != nil {
                    Circle().fill(Theme.glow).frame(width: 12, height: 12).padding(8)
                }
            }
            .overlay(alignment: .topLeading) {
                if photo.hidden == true {
                    Image(systemName: "eye.slash.fill").font(.caption).padding(6).background(.thinMaterial, in: Circle()).padding(6)
                }
            }
    }
}

/// One photo, full width: as photographed against the chosen design, with the
/// things an owner does to a single photo.
struct PhotoDetail: View {
    @ObservedObject var model: HomeModel
    let photoId: String
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var confirmRemove = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let photo = model.photo(photoId) {
                    content(photo)
                } else {
                    Text("This photo was removed.").foregroundStyle(.secondary).padding(40)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    @ViewBuilder
    private func content(_ photo: Photo) -> some View {
        let after = model.design?.version(for: photo)
        let busy = model.busyPhotos.contains(photo.id) || model.running
        VStack(alignment: .leading, spacing: 16) {
            CompareView(before: API.url(photo.src), after: after.map { API.url($0.src) }, aspect: photo.aspect)
            Text(after != nil ? (model.design?.name ?? "") + " · AI concept rendering" : (photo.source == "aerial" ? "Aerial view, shown as captured" : "As photographed"))
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let error = model.error { ErrorBanner(text: error) }

            if after != nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Ask for a change").font(.headline)
                    TextField("e.g. no rug, warmer wood, keep the blanket", text: $note, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(2...4)
                    Button {
                        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
                        note = ""
                        Task { await model.change(photoId: photo.id, note: text, session: session) }
                    } label: {
                        if busy { ProgressView() } else { Text("Apply the change (1 render)") }
                    }
                    .buttonStyle(GlowButtonStyle())
                    .disabled(busy || note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }

            if photo.editable {
                Button {
                    dismiss()
                    Task { await model.run(mode: "cleanup", style: "signature", light: "daylight", note: "", only: [photo.id], session: session) }
                } label: {
                    Label("Make this photo professional (1 render)", systemImage: "wand.and.stars")
                }
                .disabled(busy)
            }
            Button {
                Task { await model.op("photo.hide", ["photoId": photo.id, "hidden": !(photo.hidden ?? false)]) }
            } label: {
                Label(photo.hidden == true ? "Show to buyers" : "Hide from buyers", systemImage: photo.hidden == true ? "eye" : "eye.slash")
            }
            Button(role: .destructive) { confirmRemove = true } label: {
                Label("Remove this photo", systemImage: "trash")
            }
        }
        .padding(12)
        .confirmationDialog("Remove this photo and its renders?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                dismiss()
                Task { await model.op("photo.delete", ["photoId": photo.id]) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

/// Sceneshare emails the buyer link (tracked, one email per person).
struct EmailSheet: View {
    @ObservedObject var model: HomeModel
    @EnvironmentObject var session: Session
    @Environment(\.dismiss) private var dismiss
    @State private var recipients = ""
    @State private var message = ""
    @State private var busy = false
    @State private var result: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("To (up to 10, separated by commas)") {
                    TextField("buyer@example.com", text: $recipients, axis: .vertical)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section("Message (optional)") {
                    TextField("A note to go with the link", text: $message, axis: .vertical)
                        .lineLimit(3...8)
                }
                if let error { ErrorBanner(text: error).listRowInsets(EdgeInsets()) }
                if let result { Text(result).foregroundStyle(.secondary) }
                Section {
                    Button {
                        send()
                    } label: {
                        if busy { ProgressView() } else { Text("Send") }
                    }
                    .buttonStyle(GlowButtonStyle())
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .disabled(busy || recipients.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .navigationTitle("Email Buyers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }

    private func send() {
        busy = true
        error = nil
        result = nil
        Task {
            do {
                let failed = try await model.email(to: recipients, name: session.user?.name ?? "", message: message)
                result = failed.isEmpty ? "Sent." : "Sent, except: " + failed.joined(separator: ", ")
                if failed.isEmpty { recipients = "" }
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

/// Look up an address for a home that started with photos.
struct AddressSheet: View {
    let onPick: (Suggestion) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var suggestions: [Suggestion] = []
    @State private var lookup: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            List {
                TextField("Street address", text: $query)
                    .textContentType(.fullStreetAddress)
                    .autocorrectionDisabled()
                    .onChange(of: query) { value in search(value) }
                ForEach(suggestions) { s in
                    Button { onPick(s) } label: {
                        VStack(alignment: .leading) {
                            Text(s.main ?? s.text).foregroundStyle(.primary)
                            if let sec = s.secondary { Text(sec).font(.footnote).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
            .navigationTitle("Address")
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
}

/// Choose a direction and light for the whole home.
struct RestyleSheet: View {
    let count: Int
    let onStart: (String, String, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var style = "signature"
    @State private var light = "daylight"
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Design direction") {
                    Picker("Direction", selection: $style) {
                        ForEach(Style.all) { s in Text(s.name).tag(s.key) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                Section("Light") {
                    Picker("Light", selection: $light) {
                        ForEach(Light.all) { l in Text(l.name).tag(l.key) }
                    }
                    .pickerStyle(.segmented)
                }
                Section("Anything to keep in mind? (optional)") {
                    TextField("e.g. keep the piano, warm wood tones", text: $note, axis: .vertical)
                }
                Section {
                    Button("Restyle \(count) photos") { onStart(style, light, note) }
                        .buttonStyle(GlowButtonStyle())
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                } footer: {
                    Text("Walls, windows and room dimensions stay as they are. Takes about a minute.")
                }
            }
            .navigationTitle("Restyle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}
