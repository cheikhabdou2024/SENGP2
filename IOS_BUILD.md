# Building the SEN GP iOS app (.ipa) — on a Mac

The iOS project (`frontend/ios/`) is **not** committed; you generate it fresh on the
Mac, exactly like Android. Everything runs from the **`frontend/`** folder.

## 0. One-time prerequisites (Mac)
- **Xcode** (App Store) → `xcode-select --install`, open Xcode once to accept the license.
- **Node** LTS.
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`).
- **Apple account**: free = run on your own plugged-in device (7-day profile);
  paid Apple Developer Program ($99/yr) = required to export a shareable IPA / TestFlight / App Store.

## 1. Generate + configure + sync
```bash
cd frontend
npm install
npm run build              # copies the web app into www/
npx cap add ios            # creates ios/ (first time only)
node scripts/patch-ios.js  # adds camera/mic/location/photos perms + sengp:// scheme to Info.plist
npx cap sync ios           # copies web + installs pods
```

## 2. Open in Xcode & sign
```bash
npx cap open ios
```
- App target → **Signing & Capabilities** → **Automatically manage signing** → select your **Team** → Bundle ID `com.sengp.app`.
- Add capabilities you use: **Background Modes → Location updates**. (Push Notifications needs the paid account + APNs — defer for a first build.)

## 3. Build the IPA
- Destination → **Any iOS Device (arm64)** → **Product → Archive**.
- Organizer → **Distribute App** → App Store Connect / Ad Hoc / Development → export the `.ipa`.

## Notes
- The API URL is already wired (`config.js` → the live App Runner backend) — iOS hits the same backend as Android; nothing to change.
- **Google Sign-In on iOS** needs a separate iOS OAuth client (Google Cloud) + its reversed-client-ID URL scheme in Info.plist. Email/password login works without it — defer Google on iOS.
- Re-run after web changes: `npm run build && npx cap sync ios`.
