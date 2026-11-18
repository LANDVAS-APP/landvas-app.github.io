// Which installed apps can take a given web build of the game ("live" bundles, no store update).
// A web build only runs inside an app binary that has the same native plugins (and versions) and the same ads
// setting, so both are folded into one short key. The app knows its own key (built in as __LANDVAS_NATIVE_COMPAT__)
// and only takes bundles published for that key. Adding or upgrading a native plugin changes the key: older apps
// then keep their current build until they get the new version from the store.
//
// OPTIONAL plugins are the exception: the game checks they're there (Capacitor.isPluginAvailable) before using them
// and simply goes without on an app that doesn't have them, so the same web build runs in apps with and without them.
// They're left out of the key, so adding one doesn't stop installed apps from taking new live versions. (An app built
// before push existed keeps getting every new version; it just has no push until its store update.) Rule for code using
// one: never call it without checking `Capacitor.isPluginAvailable(<its name>)` first.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
/** plugins the game uses only when the app has them (see above) */
export const OPTIONAL_PLUGINS = ['@capacitor/push-notifications'];

export function nativeCompat(ads = process.env.LANDVAS_ADS === 'on', deps = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).dependencies) {
  const plugins = Object.entries(deps ?? {})
    .filter(([name]) => /^@capacitor(-community)?\/|^@capgo\//.test(name))
    .filter(([name]) => ads || name !== '@capacitor-community/admob')
    .filter(([name]) => !OPTIONAL_PLUGINS.includes(name))
    .map(([name, range]) => `${name}@${range}`)
    .sort();
  return crypto.createHash('sha256').update(JSON.stringify({ plugins, ads })).digest('hex').slice(0, 16);
}
