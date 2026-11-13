// Which installed apps can take a given web build of the game ("live" bundles, no store update).
// A web build only runs inside an app binary that has the same native plugins (and versions) and the same ads
// setting, so both are folded into one short key. The app knows its own key (built in as __LANDVAS_NATIVE_COMPAT__)
// and only takes bundles published for that key. Adding or upgrading a native plugin changes the key: older apps
// then keep their current build until they get the new version from the store.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

export function nativeCompat(ads = process.env.LANDVAS_ADS === 'on') {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const plugins = Object.entries(pkg.dependencies ?? {})
    .filter(([name]) => /^@capacitor(-community)?\/|^@capgo\//.test(name))
    .filter(([name]) => ads || name !== '@capacitor-community/admob')
    .map(([name, range]) => `${name}@${range}`)
    .sort();
  return crypto.createHash('sha256').update(JSON.stringify({ plugins, ads })).digest('hex').slice(0, 16);
}
