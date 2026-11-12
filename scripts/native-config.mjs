// Put this build's settings into the native projects before building them:
//  LANDVAS_ADS=on — this build ships rewarded ads (AdMob). Off by default: until AdMob approves the live app the
//                   binaries must not carry the ad SDK, the advertising ID or Apple's tracking prompt text
//                   (App Review rejects a tracking description with no tracking prompt behind it).
//  ADMOB_APP_ID_ANDROID / ADMOB_APP_ID_IOS — your AdMob app ids (Google's test ids stay in place when unset)
//  LANDVAS_VERSION_NAME / LANDVAS_BUILD_NUMBER — the version shown in the stores and the upload number
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const edit = (file, fn) => {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  const out = fn(s);
  if (out !== s) fs.writeFileSync(p, out);
};
const swap = (file, re, value, what) => {
  if (!value) return;
  edit(file, (s) => {
    if (!re.test(s)) { console.warn(`! ${what}: pattern not found in ${file}`); return s; }
    console.log(`${what} → ${file}`);
    return s.replace(re, value);
  });
};
const drop = (file, re, what) => edit(file, (s) => {
  if (!re.test(s)) return s;
  console.log(`- ${what} (${file})`);
  return s.replace(re, '');
});

const { ADMOB_APP_ID_ANDROID: aa, ADMOB_APP_ID_IOS: ai, LANDVAS_VERSION_NAME: vn, LANDVAS_BUILD_NUMBER: bn, LANDVAS_ADS } = process.env;
const ads = LANDVAS_ADS === 'on';
const PLIST = 'ios/App/App/Info.plist', MANIFEST = 'android/app/src/main/AndroidManifest.xml';

if (ads) {
  swap(MANIFEST, /(gms\.ads\.APPLICATION_ID"\s*android:value=")[^"]+/, aa && `$1${aa}`, 'AdMob app id (Android)');
  swap(PLIST, /(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]+/, ai && `$1${ai}`, 'AdMob app id (iOS)');
} else {
  console.log('Ads are off for this build: no ad SDK, advertising ID or tracking prompt');
  drop(PLIST, /\s*<key>NSUserTrackingUsageDescription<\/key>\s*<string>[^<]*<\/string>/, 'tracking prompt text');
  drop(PLIST, /\s*<key>GADApplicationIdentifier<\/key>\s*<string>[^<]*<\/string>/, 'AdMob app id');
  drop(PLIST, /\s*<key>SKAdNetworkItems<\/key>\s*<array>[\s\S]*?<\/array>/, 'SKAdNetwork ids');
  drop(MANIFEST, /\s*<!-- AdMob app id[^>]*-->\s*<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*\/>/, 'AdMob app id');
  drop(MANIFEST, /\s*<!-- rewarded ads -->\s*<uses-permission android:name="com\.google\.android\.gms\.permission\.AD_ID" \/>/, 'advertising ID permission');
}
swap('ios/App/App.xcodeproj/project.pbxproj', /MARKETING_VERSION = [^;]+;/g, vn && `MARKETING_VERSION = ${vn};`, 'iOS version');
swap('ios/App/App.xcodeproj/project.pbxproj', /CURRENT_PROJECT_VERSION = [^;]+;/g, bn && `CURRENT_PROJECT_VERSION = ${bn};`, 'iOS build number');
