# LANDVAS on the App Store and Google Play

The apps are the LANDVAS game in a native shell (Capacitor): app id **com.landvas.app**, portrait,
iPhone + Android phones, iOS 15+ / Android 7+. GitHub builds them — no Mac needed.

## 1. Accounts (start these first — they take the longest)

| | Where | Cost | Time |
|---|---|---|---|
| Apple Developer Program | developer.apple.com/programs/enroll | $99/yr | hours – 2 days |
| Google Play Console | play.google.com/console/signup | $25 once | 1 – 3 days to verify |
| AdMob | admob.google.com | free | minutes (payments setup later) |

**Google Play, personal accounts:** before the app can go public, it must run a *closed test* with
**at least 12 testers opted in for 14 days in a row**. Organisation accounts (needs a D-U-N-S
number) skip this. Plan: upload to internal testing → closed testing → invite 12+ players → 14 days → production.

## 2. Secrets for the build (GitHub → repo Settings → Secrets and variables → Actions)

**Android**
1. Make an upload key once (keep the file and passwords safe — you need them for every update):
   `keytool -genkeypair -v -keystore landvas-upload.jks -alias landvas -keyalg RSA -keysize 2048 -validity 10000`
2. Secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 landvas-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`landvas`), `ANDROID_KEY_PASSWORD`.
3. Optional, for automatic uploads after the first one: `PLAY_SERVICE_ACCOUNT_JSON` (Play Console → Setup → API access).
   Google requires the **first** .aab to be uploaded by hand in Play Console.

**iOS**
1. App Store Connect → Apps → **+ New app**: platform iOS, name LANDVAS, bundle id `com.landvas.app`
   (register it first at developer.apple.com → Identifiers), SKU `landvas`.
2. App Store Connect → Users and Access → Integrations → **App Store Connect API** → generate a key with **Admin** access.
3. Secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole .p8 file text), `APPLE_TEAM_ID` (developer.apple.com → Membership).

**Ads (variables, not secrets — Settings → Variables)**
`ADMOB_APP_ID_ANDROID`, `ADMOB_APP_ID_IOS` (look like `ca-app-pub-…~…`) and
`ADMOB_REWARDED_ANDROID`, `ADMOB_REWARDED_IOS` (rewarded ad units, `ca-app-pub-…/…`).
Without them the apps use Google's test ads (safe to submit, but they never pay out).

## 3. Build and upload

GitHub → **Actions → Native apps → Run workflow** → tick **release**, version `1.0.0`.
- Android: download `landvas-android-N` from the run → upload the `.aab` in Play Console (internal testing first).
- iOS: the build uploads itself to App Store Connect; it appears in TestFlight after ~10–30 min of processing.

Every push to `source` also builds both apps unsigned, so breakages show up straight away.

## 4. Rewarded ads

1. AdMob → Apps → add **LANDVAS (Android)** and **LANDVAS (iOS)**; in each, create a **Rewarded** ad unit
   (reward: 1 × "Bonus").
2. On each rewarded unit → *Server-side verification* → callback URL:
   `https://ojxqarpmreekylwotbdb.supabase.co/functions/v1/admob-ssv`
3. Put the ids in the GitHub variables above, then run the release build.
4. When the new builds are live, switch **rewarded_ads** on in the admin console (Flags).
5. Fill in **app-ads.txt**: AdMob → Apps → app-ads.txt gives one line; it must be served at
   `https://landvas.app/app-ads.txt` (add the file to `public/`) and the domain listed as the developer website in both stores.

Where ads appear (always optional, never forced): double an Inkborn game's Ink, wake a tired Inkborn,
bring an Inkborn home from a job, fill an Ink Spring faster, refill the joystick tank. Limit: 20 a day
(`ads.daily_cap` in the admin config). Rewards are granted only when AdMob's signed callback reaches the
server — the app can't fake them.

## 5. Store listings

**Name:** LANDVAS
**Subtitle (iOS, 30):** Paint the world. Raise creatures.
**Short description (Play, 80):** Claim real-world map plots, paint them, raise creatures and play minigames.
**Category:** Games → Casual (secondary: Entertainment) · **Age rating:** 12+ / Teen (user-generated art and chat, location)

**Description:**
> The whole planet is split into house-sized plots — and they're up for grabs.
>
> 🗺️ CLAIM YOUR PIECE OF THE WORLD — Your explorer stands where you really are. Claim the plots around you; your first 4 are free, and every plot hides a surprise rarity and its own minigame.
>
> 🎨 PAINT IT — Brushes, palettes, trace guides, mirror mode. Merge neighbouring plots into giant murals the whole world sees on the live map.
>
> 🐾 RAISE INKBORN — Draw any creature and watch it come to life. Pet it, feed it, play with it, and build it a woodland sanctuary. Send it on jobs, or play Berry Dash and Firefly Catch *as* your creature.
>
> 🎮 PLAY & EARN — Minigames, PvP duels, Draw & Guess, Sketch of the Day, duets, weekly challenges and a daily wheel.
>
> 👋 TOGETHER — Visit other players' rooms, collect stamps of their art, and chat with artists worldwide.
>
> Plots are virtual — owning one never means owning real land.

**Keywords (iOS, 100):** map,paint,draw,pixel,art,creature,pet,explore,gps,mural,canvas,multiplayer,minigames,world

**URLs:** Privacy `https://landvas.app/legal/privacy` · Terms `https://landvas.app/legal/terms` · Support `https://landvas.app/support` · Marketing `https://landvas.app`

**Screenshots** (iPhone 6.9" — 1320×2868, and Play phone — 1080×1920+): take them on a phone from the app:
1. The world map with your explorer and painted plots
2. The paint editor mid-masterpiece
3. Drawing an Inkborn → "Bring to Life"
4. The woodland sanctuary with creatures
5. Berry Dash
6. Play & Earn
Play also needs a **feature graphic** 1024×500 (`public/brand/landvas-banner-3000x1000.png` resized works) and the 512 icon (`docs/store/app-icon-1024.png` resized).

## 6. Review answers

**App Review notes (Apple) / App access (Play):** create a demo account first and give reviewers its email + password, e.g.
> Sign in with the demo account below. LANDVAS uses your location to place your explorer on the map;
> any location works. Rewarded ads are optional and only offered after actions (e.g. "double your Ink").
> USD rent is a virtual in-game balance; cash-out is not available in this version and no purchase is ever required to earn.

**Privacy / Data safety** (collected, linked to the account, not sold):
- Contact info: email (account) · User content: artwork, drawings, chat, profile photo · Identifiers: user id; device advertising ID (AdMob, ads only)
- Location: **precise, app functionality, while in use** — never shown to other players
- Usage data: gameplay, crash/error reports (app functionality, fraud prevention)
- Tracking (iOS): **yes — AdMob may use the advertising identifier** when the player allows it (the app asks with Apple's prompt)
- Data deletion: in-app (Settings → Account → Delete my account) and at landvas.app/support
- Encryption: standard HTTPS only (`ITSAppUsesNonExemptEncryption = NO` is already set)

**Content rating questionnaire:** user-generated content (art, chat, usernames) with reporting and blocking ·
location sharing (not with other players) · no gambling with real money · digital purchases: none.

**Ads declaration (Play):** Yes, the app contains ads.

## 7. Things reviewers are strict about
- **Real money.** The app shows a USD rent balance and mentions future cash-out. Cash-out is off. Before turning it on
  (e.g. with Tremendous), check both stores' rules for reward apps and keep "no purchase needed" true everywhere.
- **Location.** Asked only when you tap to use GPS, while the app is open.
- **Account deletion** works inside the app (required by both stores).
- **Sign in with Apple** isn't required: LANDVAS uses its own email accounts and no third-party logins.
