# LANDVAS — notes for Claude

## Deploying

The owner has standing approval for auto-deploys: once a build is finished and checked, commit it and
push the `source` branch yourself. Don't ask first. Pushing runs the "Deploy LANDVAS" workflow, which
runs tests and DB migrations, deploys Edge Functions and publishes the site.

Push only when all of these pass:
- `npx tsc -p tsconfig.json --noEmit` (typecheck)
- `npx vitest run` (unit + SQL tests, all green)
- `npx vite build` (production build)
- a browser check (Playwright) of any screens you changed

Afterwards, tell the owner what went out (commit hash and a short summary). If the deploy workflow
fails, say so and fix it. Never put secrets (e.g. the Supabase access token) in code, commits or chat.
They live in GitHub secrets only.

## Portal (admin.landvas.app, my.landvas.app)

A separate app in `portal/` (see `portal/README.md`). It is built and published by the same deploy workflow and is
checked the same way (typecheck, tests, both portal builds, a browser check of changed pages).

## Apps: live versions and Live control

Every deploy also builds the game for the iOS/Android apps and publishes it as a live version
(`scripts/publish-ota.mjs`, `src/native/liveBundle.ts`): installed apps take it without a store release. Adding or
upgrading a native plugin (`@capacitor/*`, `@capgo/*`) changes the apps' compatibility key, so older apps keep their
version until they get the new one from the store. The apps never contain admin code (`NATIVE_APP` in
`src/app/buildFlags.ts`); staff use admin.landvas.app, where Live control sets app versions, maintenance, pages
switched off and live versions (`game_config` 'app').

## Keeping phones cool and smooth

Most players are on phones (the website and the iOS/Android app, which is this same code in a WebView).
What made phones stutter and run hot, and the rules that keep it fixed:
- **No blur behind things on phones.** `backdrop-filter` re-renders whatever moves underneath (the map, a
  3D scene) every frame. Panels, the HUD and the tab bar use solid glass under `@media (pointer: coarse)`.
  A phone override must come *after* the rule it overrides in the stylesheet.
- **Endless animations: transform and opacity only.** An infinite animation of a background, shadow,
  filter, gradient or CSS variable repaints on the main thread every frame. On phones such effects hold
  still (see the "phones" section at the end of `src/styles/app.css`). No `var()` inside `@keyframes`.
- **Every `@keyframes` name is unique** across `app.css` and `enchant.css` — a duplicate silently
  replaces the other one everywhere.
- **3D scenes are paced** with `framePacer()` from `src/lib/gfx.ts` (60 fps max; places to look around
  in pass `{ ambient: true }` and rest at 30 fps on phones while untouched). New scenes do the same.
- **Looping SVG previews** take `ref={animateWhenVisible}` so they only play on screen.
- **Map plot tiles take turns** (`tileTurn`/`tileDone` in `src/map/plotTiles.ts`): never draw a burst
  of tiles in one go on the main thread.
- **Sound engines sleep** (`audioNap` in `src/lib/audioNap.ts`): an AudioContext left running keeps the
  phone's audio hardware awake.
- Benchmarks: `node tests/e2e/map-perf.mjs` (map smoothness at 4x CPU throttle) after `npm run build:artifact`.
