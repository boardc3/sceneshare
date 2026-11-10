import Foundation
import UIKit

/// The iPhone app talks to the same server as the website (sceneshare.app/api),
/// so both share one database: accounts, homes, photos, credits and limits.
struct APIError: LocalizedError {
    let status: Int
    let code: String
    let message: String
    var errorDescription: String? { message }
}

enum API {
    static let base = URL(string: "https://www.sceneshare.app")!

    static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.httpCookieStorage = HTTPCookieStorage.shared   // the sign-in session cookie
        c.httpShouldSetCookies = true
        c.httpCookieAcceptPolicy = .always
        c.timeoutIntervalForRequest = 300                 // a render can take a minute or two
        c.timeoutIntervalForResource = 600
        return URLSession(configuration: c)
    }()

    /// Photo and render sources come back as site-relative paths.
    static func url(_ path: String) -> URL {
        if let u = URL(string: path), u.scheme != nil { return u }
        return URL(string: path, relativeTo: base)?.absoluteURL ?? base
    }

    static func get<T: Decodable>(_ path: String) async throws -> T {
        try await send("GET", path, body: nil)
    }

    static func post<T: Decodable>(_ path: String, _ body: [String: Any]) async throws -> T {
        try await send("POST", path, body: body)
    }

    private static func send<T: Decodable>(_ method: String, _ path: String, body: [String: Any]?) async throws -> T {
        var r = URLRequest(url: url(path))
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("https://www.sceneshare.app", forHTTPHeaderField: "Origin")
        r.setValue("Sceneshare-iOS/1.0", forHTTPHeaderField: "User-Agent")
        if let body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: r)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let code = (j?["error"] as? String) ?? (j?["code"] as? String) ?? "http_\(status)"
            let message = (j?["message"] as? String) ?? "Something went wrong (\(status)). Try again."
            throw APIError(status: status, code: code, message: message)
        }
        if data.isEmpty, let empty = Empty() as? T { return empty }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

struct Empty: Decodable {
    init() {}
    init(from decoder: Decoder) throws {}
}

// MARK: - Models (only the fields the app uses; everything is optional-tolerant)

struct User: Decodable, Equatable {
    let id: String
    let email: String
    let name: String?
}

struct Terms: Decodable {
    let accepted: Bool?
}

struct AccountResponse: Decodable {
    let user: User?
    let terms: Terms?
    let accountsFull: Bool?
}

struct Credits: Decodable {
    let available: Double?
    let unlimited: Bool?
}

struct Limits: Decodable {
    let homes: Double?
    let credits: Double?
}

struct Usage: Decodable {
    let homes: Double?
}

struct Billing: Decodable {
    let plan: String?
    let early: Bool?
    let credits: Credits?
    let limits: Limits?
    let usage: Usage?
}

struct BillingResponse: Decodable {
    let billing: Billing?
}

struct HomeRow: Decodable, Identifiable, Hashable {
    let id: String
    let formatted_address: String?
    let nickname: String?
    let street_number: String?
    let route: String?
    let city: String?
    let cover: String?
    let photos: Double?

    var title: String {
        if let n = nickname, !n.isEmpty { return n }
        let line = [street_number, route].compactMap { $0 }.joined(separator: " ")
        if !line.isEmpty { return line }
        return formatted_address ?? "Untitled home"
    }
}

struct HomesResponse: Decodable {
    let properties: [HomeRow]
}

struct Version: Decodable, Hashable {
    let id: String
    let src: String
    let designId: String?
}

struct Photo: Decodable, Identifiable, Hashable {
    let id: String
    let src: String
    let width: Double?
    let height: Double?
    let source: String?
    let hidden: Bool?
    let versions: [Version]?

    var aspect: CGFloat {
        guard let w = width, let h = height, w > 0, h > 0 else { return 4.0 / 3.0 }
        return CGFloat(w / h)
    }
    /// Aerial views are shown as captured and cannot be restyled.
    var editable: Bool { source != "aerial" && hidden != true }
}

struct Design: Decodable, Identifiable, Hashable {
    let id: String
    let mode: String?
    let style: String?
    let light: String?
    let picks: [String: String?]?

    var name: String {
        switch mode {
        case "cleanup": return "Professional"
        case "polish": return "Relight"
        default: return Style.name(style) + " · " + Light.name(light)
        }
    }
    func version(for photo: Photo) -> Version? {
        guard let pick = picks?[photo.id] ?? nil else { return nil }
        return photo.versions?.first { $0.id == pick }
    }
}

struct Address: Decodable, Hashable {
    let formatted: String?
    let streetNumber: String?
    let route: String?
    let city: String?
    let state: String?
}

struct Property: Decodable, Identifiable, Hashable {
    let id: String
    let address: Address?
    let nickname: String?
    let photos: [Photo]?
    let designs: [Design]?

    var title: String {
        if let n = nickname, !n.isEmpty { return n }
        let line = [address?.streetNumber, address?.route].compactMap { $0 }.joined(separator: " ")
        if !line.isEmpty { return line }
        return address?.formatted ?? "Your photos"
    }
    var shareURL: URL { API.url("/p/\(id)") }
}

struct PropertyResponse: Decodable {
    let property: Property
}

struct DesignResponse: Decodable {
    let design: Design
    let property: Property?
}

struct RenderResponse: Decodable {
    let version: Version?
}

struct UploadResponse: Decodable {
    let photo: Photo
}

struct ShareTotals: Decodable {
    let shares: Double?
    let recipients: Double?
    let opens: Double?
    let views: Double?
}

struct SharesResponse: Decodable {
    let totals: ShareTotals?
}

struct ShareResponse: Decodable {
    let url: String?
    let failed: [String]?
}

struct Suggestion: Decodable, Identifiable, Hashable {
    let placeId: String?
    let text: String
    let main: String?
    let secondary: String?
    var id: String { placeId ?? text }
}

struct SuggestResponse: Decodable {
    let suggestions: [Suggestion]?
}

// MARK: - Design directions and light (keys match the server's)

struct Choice: Identifiable, Hashable {
    let key: String
    let name: String
    var id: String { key }
}

enum Style {
    static let all: [Choice] = [
        Choice(key: "signature", name: "Signature"),
        Choice(key: "coastal-modern", name: "Coastal modern"),
        Choice(key: "pure-form", name: "Pure form"),
        Choice(key: "resort-living", name: "Resort living"),
        Choice(key: "timeless-estate", name: "Timeless estate"),
        Choice(key: "urban-penthouse", name: "Urban penthouse"),
        Choice(key: "executive-modern", name: "Executive modern"),
        Choice(key: "avant-garde", name: "Avant-garde"),
    ]
    static func name(_ key: String?) -> String {
        all.first { $0.key == key }?.name ?? "Signature"
    }
}

enum Light {
    static let all: [Choice] = [
        Choice(key: "daylight", name: "Daylight"),
        Choice(key: "golden", name: "Golden hour"),
        Choice(key: "twilight", name: "Twilight"),
        Choice(key: "original", name: "As photographed"),
    ]
    static func name(_ key: String?) -> String {
        all.first { $0.key == key }?.name ?? "Daylight"
    }
}

// MARK: - Photo upload

enum Uploader {
    /// Shrinks a photo to 2048 px on its long side (the server's limit is 4.5 MB a
    /// request), fixes its orientation, and sends it to the home.
    static func upload(_ image: UIImage, to propertyId: String) async throws -> Photo {
        let jpeg = try prepare(image)
        let body: [String: Any] = [
            "propertyId": propertyId,
            "image": "data:image/jpeg;base64," + jpeg.base64EncodedString(),
            "lang": "en",
        ]
        let r: UploadResponse = try await API.post("/api/upload", body)
        return r.photo
    }

    static func prepare(_ image: UIImage, maxSide: CGFloat = 2048) throws -> Data {
        let size = image.size
        let scale = min(1, maxSide / max(size.width, size.height))
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))   // draw(in:) applies the orientation
        }
        var quality: CGFloat = 0.86
        var data = resized.jpegData(compressionQuality: quality)
        while let d = data, d.count > 2_800_000, quality > 0.5 {     // base64 adds a third
            quality -= 0.1
            data = resized.jpegData(compressionQuality: quality)
        }
        guard let out = data else {
            throw APIError(status: 0, code: "bad_image", message: "That photo could not be read.")
        }
        return out
    }
}
