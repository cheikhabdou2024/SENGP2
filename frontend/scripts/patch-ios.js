/* Patch the generated iOS Info.plist with the permission strings, background
   location mode and the sengp:// URL scheme the app needs. Idempotent.
   Run from the frontend/ folder AFTER `npx cap add ios`:  node scripts/patch-ios.js */
const fs = require('fs');
const path = require('path');

const plistPath = path.join('ios', 'App', 'App', 'Info.plist');
if (!fs.existsSync(plistPath)) {
  console.error('❌ ' + plistPath + ' not found. Run `npx cap add ios` first (from frontend/).');
  process.exit(1);
}
let s = fs.readFileSync(plistPath, 'utf8');

const strings = {
  NSCameraUsageDescription: 'SEN GP utilise la caméra pour scanner les QR codes de livraison.',
  NSMicrophoneUsageDescription: 'SEN GP utilise le micro pour vos messages vocaux de réclamation.',
  NSLocationWhenInUseUsageDescription: 'SEN GP suit votre position pendant les livraisons.',
  NSLocationAlwaysAndWhenInUseUsageDescription: 'SEN GP suit votre position en arrière-plan pendant tout le trajet de livraison.',
  NSPhotoLibraryUsageDescription: "SEN GP accède à vos photos pour votre pièce d'identité et vos colis.",
  NSPhotoLibraryAddUsageDescription: 'SEN GP enregistre le QR code de livraison dans vos photos.',
};

let add = '';
for (const [k, v] of Object.entries(strings)) {
  if (!s.includes('<key>' + k + '</key>')) add += '\t<key>' + k + '</key>\n\t<string>' + v + '</string>\n';
}
if (!s.includes('<key>UIBackgroundModes</key>')) {
  add += '\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>\n';
}
if (!s.includes('<string>sengp</string>')) {
  add += '\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n'
       + '\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>com.sengp.app</string>\n'
       + '\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>sengp</string>\n\t\t\t</array>\n'
       + '\t\t</dict>\n\t</array>\n';
}

if (!add) { console.log('✅ Info.plist already patched — nothing to do.'); process.exit(0); }

const patched = s.replace(/<\/dict>\s*<\/plist>\s*$/, add + '</dict>\n</plist>\n');
if (patched === s) {
  console.error('❌ Could not find the closing </dict></plist> to insert into. Patch manually.');
  process.exit(1);
}
fs.writeFileSync(plistPath, patched);
console.log('✅ Info.plist patched (camera, mic, location + background, photos, sengp:// scheme).');
