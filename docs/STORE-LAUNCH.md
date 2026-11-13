# LANDVAS on the App Store and Google Play

The apps are the LANDVAS game in a native shell (Capacitor 8): app id **com.landvas.app**, portrait,
iPhone + Android phones, iOS 15+ / Android 7+. GitHub builds both — no Mac needed.

**Launch plan:** version **1.0 ships without ads** (AdMob only approves an app once it is live in a store), then
**1.1 turns rewarded ads on**. Everything below is in the order to do it.

What the build already handles for review: no ad SDK / advertising ID / tracking prompt in 1.0 · Apple privacy
manifest (`ios/App/App/PrivacyInfo.xcprivacy`) · portrait lock · Xcode 26 / iOS 26 SDK (required since Apr 28 2026) ·
Android target API 36 (required since Aug 31 2026) · in-app account deletion · public support and deletion pages ·
reporting, blocking and word filtering for player content · a no-location way to play (Simple mode) · no device
fingerprinting in the iPhone app · native share sheet, keyboard, haptics, back button, streak reminders, offline banner.

---

## 1. Accounts under the LLC (now that the D-U-N-S number is assigned)

Make sure the LLC's **legal name and address match the D&B record exactly** — both stores check it.

**Apple — enroll as an Organization** at developer.apple.com/programs/enroll ($99/yr)
- Sign in with the Apple ID that will own the account (use dev@landvas.app), choose *Company / Organization*.
- Needs: legal entity name (as on D&B), D-U-N-S, the website **landvas.app** (on the LLC's domain), and you as a person
  with legal authority. Apple may phone you to verify.
- If Apple can't find the D-U-N-S yet, wait: Apple says it can take up to 2 business days after D&B issues it.
- After approval: App Store Connect → Business → **EU Digital Services Act**: declare as a **trader** (the app
  will earn ad revenue). Your business address, phone and email are shown on the EU store page.

**Google Play — convert the existing personal account** (no new account or fee)
1. Play Console → Developer account → About you → add and **verify landvas.app** as the organization website.
2. Then **Change account type** → create a new **organization payments profile** (a personal one can't be reused)
   with the LLC details and the D-U-N-S → verify contact details → upload documents if asked.
3. Wait ~72 h after the change before creating the app. As an organization you **skip** the personal-account rule
   of 12 testers × 14 days of closed testing.

## 2. Secrets for the build (GitHub → repo Settings → Secrets and variables → Actions)

**Android**
1. Make an upload key once (keep the file and passwords safe — you need them for every update):
   `keytool -genkeypair -v -keystore landvas-upload.jks -alias landvas -keyalg RSA -keysize 2048 -validity 10000`
2. Secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 landvas-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`landvas`), `ANDROID_KEY_PASSWORD`.
3. Optional, for automatic uploads after the first one: `PLAY_SERVICE_ACCOUNT_JSON` (Play Console → Setup → API access).
   Upload the **first** .aab by hand in Play Console.

**iOS**
1. developer.apple.com → Identifiers → register `com.landvas.app`. App Store Connect → Apps → **+ New app**:
   iOS, name LANDVAS, bundle id `com.landvas.app`, SKU `landvas`.
2. App Store Connect → Users and Access → Integrations → **App Store Connect API** → key with **Admin** access.
3. Secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole .p8 file text), `APPLE_TEAM_ID` (developer.apple.com → Membership).

**Ads — leave these unset for 1.0** (Settings → Variables): `ADMOB_APP_ID_ANDROID`, `ADMOB_APP_ID_IOS`,
`ADMOB_REWARDED_ANDROID`, `ADMOB_REWARDED_IOS`. A platform's build includes ads only when its app id **and** rewarded
unit are both set; otherwise the AdMob plugin is left out of the native project completely.

## 3. Build and upload

GitHub → **Actions → Native apps → Run workflow** → tick **release**, version `1.0.0`.
- Android: download `landvas-android-N` → upload the `.aab` in Play Console → **Testing → Internal testing** first
  (install it on your own phone), then **Production**. The run log lists the permissions the store will see.
- iOS: the build uploads itself to App Store Connect; it shows in **TestFlight** after ~10–30 min. Install it on your
  iPhone through TestFlight and play a few minutes before submitting.

Every push to `source` also builds both apps unsigned, so breakages show up straight away.
`node tests/e2e/store-ready.mjs` (after `npm run build:artifact`) checks the pages reviewers open.

## 4. Before you press Submit (both stores)

- [x] Terms and Privacy Policy are final (LANDVAS LLC, Utah; contact@landvas.app) — get a lawyer's read before cash-out.
- [ ] **contact@landvas.app receives mail** (Cloudflare → Email → Email Routing → forward it to your inbox).
- [ ] **Demo account** for reviewers: create one on the live server, finish onboarding, give it a few plots and Ink.
- [ ] Try these on a real phone: sign up, onboarding, deny location → *Play without location (Simple mode)*,
      allow location → claim a plot, play a minigame, chat report/block, Settings → Delete my account (on a test account).
- [ ] Screenshots from the app itself (no website frames, no mention of other platforms).
- [ ] **Hold live versions for the version you submit**: admin.landvas.app → Live control → *Hold these app versions
      on their store version* lists it (1.0.0 is held from the start). Reviewers then see exactly the build they were
      sent. Take the version off the list once it's approved, so players get new versions straight away.

## 5. Store listings

**Name:** LANDVAS · **Subtitle (iOS, 30):** Own a piece. Play it your way.
**Short description (Play, 80):** The world-map game for every playstyle: create, raise, explore and compete.
**Category:** Games → Casual (secondary: Entertainment) · **Price:** Free · **In-app purchases:** none

**Description:**
> The real world is one giant game board — and every playstyle has a home on it.
>
> The whole planet is split into house-sized plots. Claim the ones around you, then make them yours: a mural, a creature sanctuary, a rent-earning empire, a minigame arena. Create, raise, explore, compete, build or collect — mix them however you like.
>
> 🗺️ CLAIM YOUR PIECE OF THE WORLD — Your explorer stands where you really are. Claim the plots around you; your first 4 are free, and every plot hides a surprise rarity and its own minigame. Prefer it simple? Simple mode lets you roll plots from one screen, no map or location needed.
>
> 🎨 PAINT IT — Brushes, palettes, trace guides, mirror mode. Merge neighbouring plots into giant murals the whole world sees on the live map.
>
> 🐾 RAISE INKBORN — Draw any creature and watch it come to life. Pet it, feed it, play with it, and build it a woodland sanctuary.
>
> 🎮 PLAY — Minigames, PvP duels, Draw & Guess, Sketch of the Day, duets, weekly challenges, a daily wheel and a daily streak.
>
> 👋 TOGETHER — Visit other players' rooms, join a clan, and chat with players worldwide.
>
> Plots are virtual — owning one never means owning real land.

**Keywords (iOS, 100):** map,world,creature,pet,explore,gps,paint,draw,pixel,minigames,pvp,multiplayer,land,collect,rpg

**URLs:** Privacy `https://landvas.app/legal/privacy` · Terms `https://landvas.app/legal/terms` ·
Support `https://landvas.app/support` (works signed out) · Marketing `https://landvas.app` ·
Account deletion (Play) `https://landvas.app/legal/delete-account` · Contact email: contact@landvas.app

**Screenshots** — iPhone 6.9" (1320×2868) and Play phone (1080×1920 or larger), taken in the app:
1. The world map with your explorer and painted plots · 2. A plot rarity roll · 3. The paint editor ·
4. Drawing an Inkborn → "Bring to Life" · 5. A minigame · 6. Simple mode home.
Play icon and feature graphic are ready: `docs/store/play-icon-512.png` and `docs/store/feature-graphic-1024x500.png` (all icons come from `scripts/make-native-assets.mjs`).

## 6. Review answers

**App Review notes (Apple) / App access (Play):**
> Sign in with the demo account below (or create a new account in the app).
> LANDVAS places your explorer on the map where you are; any location works. If you'd rather not share location,
> tap "Play without location (Simple mode)" on the first map prompt — the whole game loop (rolling plots, minigames,
> daily streak) works without it.
> USD rent is a virtual in-game balance: cash-out is not available in this version and there are no purchases.
> Players can report messages, block players (profile → Block) and delete their account (Settings → Account).
> Developer: LANDVAS LLC (Utah) · contact@landvas.app
> Demo account: <email> / <password>

**Apple — App Privacy** (all "linked to the user", none used for tracking, none sold) — matches the privacy manifest:
Contact info: email · Location: precise (app functionality) · User content: photos, gameplay content, other user
content (art, chat), customer support · Identifiers: user ID, device ID (random install id, for fraud prevention) ·
Usage data: product interaction · Diagnostics: crash data. **Tracking: No** (1.0 has no ads).

**Apple — Age rating questionnaire:** user-generated content **yes**, messaging & chat **yes**, **social media
(feed of player content) yes** → Apple rates this **13+**. Advertising: **no** for 1.0 (yes from 1.1). Unrestricted
web access: no (links open single pages). Simulated gambling: **no** (no casino games; the free daily wheel and plot
rarity rolls are free game rewards — answer "contests" honestly if you run prize events). Parental controls: none.

**Google Play — Data safety:** Location (precise, app functionality, collected) · Personal info: email ·
Photos · Messages (in-app chat) · App activity (in-game actions, user-generated content) · App info and performance
(crash logs) · Device or other IDs (install id, fraud prevention). Encrypted in transit: yes. Deletion: yes (in app
and at the URL above). **Advertising ID: No** for 1.0 (the 1.0 build doesn't declare it).

**Google Play — other forms:** Ads: **No** for 1.0 · Target audience: 13+ (not designed for children) ·
Content rating (IARC): user interaction / chat yes, shares location: no (never shown to other players),
digital purchases: no · Government / financial / health features: no · News app: no.

## 7. Rewarded ads (version 1.1, after launch)

1. AdMob → Apps → add **LANDVAS (Android)** and **LANDVAS (iOS)** as *published* apps and link each to its store
   listing (AdMob only reviews apps that are live in a store — the likely reason the first application was rejected).
2. In each, create a **Rewarded** ad unit (reward: 1 × "Bonus") → *Server-side verification* callback URL:
   `https://ojxqarpmreekylwotbdb.supabase.co/functions/v1/admob-ssv`
3. **app-ads.txt:** AdMob → Apps → app-ads.txt gives one line; add it as `public/app-ads.txt` so it's served at
   `https://landvas.app/app-ads.txt`, and make sure landvas.app is the developer website on both store listings.
4. Set the four GitHub variables from §2, then add Google's full SKAdNetwork id list to `ios/App/App/Info.plist`
   (developers.google.com/admob/ios/quick-start → SKAdNetwork) — the build currently lists only Google's own id.
5. Run a release build (version 1.1.0). It now includes the ad SDK, the consent form (EU/UK/US states) and Apple's
   tracking prompt. Update the store forms: Apple App Privacy → add *Identifiers: device ID — third-party advertising,
   tracking* and Advertising → yes; Play Data safety → advertising ID yes, Ads → yes.
6. When the 1.1 builds are live, switch **rewarded_ads** on in the admin console (Flags).

Where ads appear (always optional): double an Inkborn game's Ink, wake a tired Inkborn, bring an Inkborn home from a
job, fill an Ink Spring faster, refill the joystick tank. Limit: 20 a day (`ads.daily_cap`). Rewards are granted only
when AdMob's signed callback reaches the server.

## 8. Things reviewers are strict about
- **Real money.** The app shows a USD rent balance and mentions future cash-out. Before turning cash-out on, get a
  legal review: chance-based plot rarities decide how much USD a plot earns, which brings sweepstakes / gambling rules
  into play (Apple 5.3, Google's Real-Money Gambling policy). Keep "no purchase needed" true everywhere.
- **Location.** Asked only when you tap "Use my location", only while the app is open; Simple mode needs none. Google
  is moving one-off precise location to a system "location button" for apps targeting Android 17 — revisit then.
- **Fingerprinting.** The iPhone app sends only a random install id to the cheat scanner (Apple forbids deriving an
  identity from device signals). Keep it that way.
- **Account deletion** works in the app and at landvas.app/legal/delete-account (required by both stores).
- **Live versions.** The apps take new versions of the game's own web code (HTML, JavaScript, CSS) without a store
  release (Capacitor Updater, self-hosted: files from landvas.app, checked against sha-256 hashes kept in the database;
  see src/native/liveBundle.ts). Both stores allow this for interpreted code that keeps the app's purpose (Apple
  developer agreement 3.3.1(B); Google Play's Device and Network Abuse policy exempts JavaScript in a WebView). Keep it
  that way: no new native code or permissions through live versions, nothing in the app that mentions "updating",
  and the review hold above. If a reviewer cites guideline 2.5.2, answer that the app only downloads interpreted
  JavaScript, HTML and CSS for its existing WebView, which 3.3.1(B) permits, and no native executable code.
- **Sign in with Apple** isn't required: LANDVAS uses its own email accounts and no third-party logins. If you ever
  add Google/Discord sign-in, add Sign in with Apple too.
