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

    init(id: String) { self.id = id }

    var photos: [Photo] { (property?.photos ?? []).filter { $0.hidden != true } }
    var editable: [Photo] { photos.filter { $0.editable } }
    var designs: [Design] { property?.designs ?? [] }
    var design: Design? { designs.first { $0.id == designId } ?? designs.last }
    var uploading: Bool { uploadTotal > 0 }
    var running: Bool { runTotal > 0 }

    func load() async {
        do {
            let r: PropertyResponse = try await API.get("/api/properties?id=\(id)&full=1")
            property = r.property
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
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
    func run(mode: String, style: String, light: String, note: String, session: Session) async {
        let ids = editable.map { $0.id }
        guard !ids.isEmpty, !running else { return }
        runLabel = mode == "cleanup" ? "Making photos professional" : "Restyling"
        runTotal = ids.count
        runDone = 0
        error = nil
        do {
            let body: [String: Any] = ["op": "design.create", "propertyId": id, "mode": mode, "style": style, "light": light, "note": note, "lang": "en"]
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
}

struct HomeView: View {
    @EnvironmentObject var session: Session
    @StateObject private var model: HomeModel
    @State private var picked: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var restyling = false
    @State private var open: Photo?

    init(propertyId: String) {
        _model = StateObject(wrappedValue: HomeModel(id: propertyId))
    }

    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let error = model.error { ErrorBanner(text: error) }

                if model.uploading {
                    ProgressView("Uploading \(min(model.uploadDone + 1, model.uploadTotal)) of \(model.uploadTotal)", value: Double(model.uploadDone), total: Double(max(1, model.uploadTotal)))
                }
                if model.running {
                    ProgressView("\(model.runLabel): \(model.runDone) of \(model.runTotal)", value: Double(model.runDone), total: Double(max(1, model.runTotal)))
                    Text("Keep the app open. Each finished photo is saved as it lands.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                if model.editable.isEmpty && !model.loading && !model.uploading {
                    starter
                } else {
                    addButtons
                }

                if model.designs.count > 0 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(model.designs) { d in
                                Button(d.name) { model.designId = d.id }
                                    .buttonStyle(.bordered)
                                    .tint(model.design?.id == d.id ? Theme.glow : .gray)
                            }
                        }
                    }
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
                if let p = model.property {
                    ShareLink(item: p.shareURL, subject: Text(p.title), message: Text("Take a look at \(p.title) on Sceneshare."))
                }
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
        .onChange(of: picked) { items in
            guard !items.isEmpty else { return }
            picked = []
            Task { await model.upload(items: items) }
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
            .presentationDetents([.large])
        }
        .sheet(item: $open) { photo in
            PhotoDetail(photo: photo, design: model.design)
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
            .overlay(alignment: .bottomTrailing) {
                if shown != nil {
                    Circle().fill(Theme.glow).frame(width: 12, height: 12).padding(8)
                }
            }
    }
}

/// One photo, full width: as photographed against the chosen design.
struct PhotoDetail: View {
    let photo: Photo
    let design: Design?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                let after = design?.version(for: photo)
                CompareView(before: API.url(photo.src), after: after.map { API.url($0.src) }, aspect: photo.aspect)
                if after != nil {
                    Text((design?.name ?? "") + " · AI concept rendering")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    Text("As photographed")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(12)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
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
