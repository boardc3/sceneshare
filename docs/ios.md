# Sceneshare for iPhone

The iOS app is a Capacitor shell (`ios/`) that opens https://www.sceneshare.app inside
a native app window, so it always runs the same code as the website: a web deploy
updates the app without a new App Store release. Sign-in, credits and homes are the
same accounts.

App id: `ai.sceneset.sceneshare` · name: Sceneshare · config: `capacitor.config.json`

## What you need (once)

- A Mac with Xcode (free, Mac App Store) and CocoaPods (`sudo gem install cocoapods`).
- An Apple Developer Program membership ($99 a year) under Sceneset AI LLC:
  https://developer.apple.com/programs/enroll/

## Run it on your iPhone

```sh
git pull
npm install
npm run ios:sync     # builds the site and updates the iOS project
npm run ios:open     # opens Xcode
```

In Xcode: choose the **App** target → Signing & Capabilities → pick your team.
Plug in the iPhone, choose it at the top, and press Run.

## Send it to testers and the App Store

1. In App Store Connect (https://appstoreconnect.apple.com) create a new app with
   the bundle id `ai.sceneset.sceneshare`.
2. In Xcode: Product → Archive → Distribute App → App Store Connect.
3. TestFlight tab: add testers by email (the first build needs a short Apple review).
4. For the store itself, add screenshots, a description, the privacy policy link
   and submit for review.

## Before App Store review

- **Payments.** Apple requires its own in-app purchase for digital goods bought
  inside an app. While Sceneshare is in early access nothing is sold, so this is
  fine; before turning on paid plans, hide the plan and credit purchase buttons in
  the app or add in-app purchase.
- **"Just a website" rejections (guideline 4.2).** Apps that only wrap a site can be
  refused. The camera and photo-library access help; push notifications ("a buyer
  opened your home") would help more.
- **Google sign-in** does not work inside an app's web view (Google blocks it).
  Email sign-in works. Apple requires "Sign in with Apple" whenever another social
  sign-in is offered in the app.
- **Account deletion** must be reachable in the app.

## Changing the icon or splash screen

Replace `assets/icon-only.png` (1024×1024) and `assets/splash.png` (2732×2732), then
run `npx capacitor-assets generate --ios`.
