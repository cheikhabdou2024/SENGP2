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
4. Distribution is **`app_store`** (TestFlight / App Store) — no device UDIDs
   needed. Create the app record in App Store Connect for bundle ID
   `com.sengp.app` (first upload can also auto-create it).
5. **Trigger builds manually** (the workflow has no push trigger): open the
   Codemagic dashboard → **Start new build** → workflow **ios-ipa**. On success
   the build is **auto-uploaded to App Store Connect and released to TestFlight**
   (`submit_to_testflight: true`); the `.ipa` is also a downloadable artifact and
   an email is sent to ahatcisse@gmail.com.
6. **Invite testers** in App Store Connect → your app → **TestFlight** → add
   testers by email or enable a public link. They install via the TestFlight app.
   (First TestFlight build may need a short "Beta App Review" + your test-info /
   export-compliance answers.)

Re-run step 5 whenever you want a fresh build; no further one-time setup needed.
When ready to ship publicly, set `submit_to_app_store: true` in `codemagic.yaml`
(or submit that build from App Store Connect).
