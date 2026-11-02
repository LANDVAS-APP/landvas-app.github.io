// Put this build's settings into the native projects before building them:
//  ADMOB_APP_ID_ANDROID / ADMOB_APP_ID_IOS — your AdMob app ids (Google's test ids stay in place when unset)
//  LANDVAS_VERSION_NAME / LANDVAS_BUILD_NUMBER — the version shown in the stores and the upload number
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const swap = (file, re, value, what) => {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p) || !value) return;
  const s = fs.readFileSync(p, 'utf8');
  if (!re.test(s)) { console.warn(`! ${what}: pattern not found in ${file}`); return; }
  fs.writeFileSync(p, s.replace(re, value));
  console.log(`${what} → ${file}`);
};
const { ADMOB_APP_ID_ANDROID: aa, ADMOB_APP_ID_IOS: ai, LANDVAS_VERSION_NAME: vn, LANDVAS_BUILD_NUMBER: bn } = process.env;
swap('android/app/src/main/AndroidManifest.xml', /(gms\.ads\.APPLICATION_ID"\s*android:value=")[^"]+/, aa && `$1${aa}`, 'AdMob app id (Android)');
swap('ios/App/App/Info.plist', /(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]+/, ai && `$1${ai}`, 'AdMob app id (iOS)');
swap('ios/App/App.xcodeproj/project.pbxproj', /MARKETING_VERSION = [^;]+;/g, vn && `MARKETING_VERSION = ${vn};`, 'iOS version');
swap('ios/App/App.xcodeproj/project.pbxproj', /CURRENT_PROJECT_VERSION = [^;]+;/g, bn && `CURRENT_PROJECT_VERSION = ${bn};`, 'iOS build number');
