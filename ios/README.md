# Sceneshare for iPhone (Swift)

A native SwiftUI app. It calls the same server as the website
(`https://www.sceneshare.app/api`), so both use one database: the same accounts,
homes, photos, credits and limits.

- `Sceneshare.xcodeproj` — open this in Xcode (15 or later), pick an iPhone
  simulator or your phone, press Run.
- `Sceneshare/API.swift` — the server client, models and photo upload.
- `Sceneshare/Session.swift` — sign-in, Terms acceptance, the credits meter.
- `Sceneshare/HomesView.swift` — My Homes, add a home.
- `Sceneshare/HomeView.swift` — photos, library and camera upload, make
  professional, restyle, before/after, share.

Bundle id: `ai.sceneset.sceneshare`. iOS 17 or later.

To run on a phone or ship to TestFlight, choose your team under
Signing & Capabilities (needs an Apple Developer Program membership for
TestFlight and the App Store).
