# Building the SEN GP iOS app (.ipa)

Two ways to get an `.ipa`: **locally on a Mac** (below), or **Codemagic cloud CI**
(no local Xcode/CocoaPods needed — see [Option: Codemagic](#option-codemagic-cloud-build)
at the bottom). Use Codemagic if your Mac's Xcode/Ruby/CocoaPods aren't set up, or you
just want a build triggered from a git push.

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

## Option: Codemagic cloud build

Builds the `.ipa` entirely in Codemagic's macOS cloud runners — you never need
Xcode, Ruby, or CocoaPods locally. Config lives at the repo root: `codemagic.yaml`
(workflow `ios-ipa`). It does the same steps as above (`npm install` → `npm run
build` → `cap add ios` → `patch-ios.js` → `cap sync ios`) inside CI, since `ios/`
isn't committed, then archives and exports the IPA.

**One-time setup (Codemagic web UI, requires your Apple Developer account):**
1. Sign up at codemagic.io, connect it to this GitHub repo (`cheikhabdou2024/SENGP2`).
2. **Team settings → Integrations → Apple Developer Portal** → add an App Store
   Connect API key (generate it at appstoreconnect.apple.com → Users and Access →
   Integrations → App Store Connect API → "+"). Name the integration `codemagic`
   to match `codemagic.yaml`, or edit the yaml to match whatever name you choose.
3. In the app's Codemagic settings, confirm the `ios-ipa` workflow picked up from
   `codemagic.yaml`. Codemagic uses the App Store Connect API key to auto-generate
   signing certificates/provisioning profiles for bundle ID `com.sengp.app` — no
   manual cert wrangling.
4. For **ad_hoc** distribution (installable .ipa without TestFlight), register your
   test devices' UDIDs in the Apple Developer Portal first, or switch
   `distribution_type` in `codemagic.yaml` to `app_store` once you're ready to
   ship via TestFlight.
5. Trigger a build: push to `deploy/aws-android-prep`, or click "Start new build"
   in the Codemagic dashboard. The `.ipa` is attached as a build artifact
   (downloadable from the dashboard) and emailed to ahatcisse@gmail.com on
   success/failure.

Re-run steps 3–5 whenever you want a fresh build; no further one-time setup needed.
