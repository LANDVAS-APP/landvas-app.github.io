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
- **No blur behind anything on phones** — that includes the shared `.glass` class and every Tailwind `backdrop-blur-*`
  (a phone rule at the end of `app.css` turns them off and tints see-through dark overlays instead).
- **Decorations rest** (`src/lib/rest.ts`): on browsing screens nobody has touched for 20 s, endless CSS loops (and the
  SVG previews) pause until the next touch. Only *endless* loops are held — never pause one-off animations (a dialog
  opening while things rest must still animate in). Loaders (`.lv-loader`, `.lv-skel`, `animate-spin/pulse`) and
  anything marked `.lv-keep-moving` never rest. Games, the editor and 3D places aren't on the resting list.
- **Nothing animates that can't be seen**: a closed button's effects pause (`.lv-disc:not(.on) …`), an empty meter has
  no liquid; check `document.getAnimations()` on a screen for loops on invisible things.
- **The map library (~1 MB) belongs to the map screen.** Never `import * as maplibregl from 'maplibre-gl'` (or any
  value import) outside `src/map/WorldMap.tsx`: make markers with `newMarker()` and reach the library with `mapLib()`
  from `src/map/maplib.ts` (types: `import type`). A value import anywhere else drags the library into the hub, plot
  sheets, the planets, simple mode… (`tests/e2e/simple-mode.mjs` checks it isn't loaded there).
- **In the background the app rests**: Android's web view is paused with the app (`MainActivity.java`), so the page is
  hidden there like a background tab; timers that tick a display check `document.hidden` (`useTicker` does); the GPS
  watch is let go while hidden and restarted on the way back (`src/explorer/explorer.ts`).
- The title screen's living canvas draws its still layers once and only repaints the moving mural, paced.
- **The World map stays warm** (`src/map/WorldMap.tsx`, "the warm map"): leaving the World tab parks the MapLibre map
  off the page (same GPU context, tiles and caches, drawing nothing); coming back reuses it instantly. Map updates
  while parked only mark it dirty. It's let go after 10 minutes, on a lost GPU context, a different player or a lite-map
  switch. Anything that adds sources/layers/markers to the map must guard with `getSource`/`getLayer` (it may already
  be there from the last visit) and remove its markers in its effect cleanup. `tests/e2e/app-sheets.mjs` checks the
  round trip (same map, nothing piling up).
- **3D scenes give their GPU context back**: wrap every `new THREE.WebGLRenderer(...)` in `releaseOnDispose()`
  (`src/lib/threeRelease.ts`). three's `dispose()` alone leaves the context alive until garbage collection, and phones
  cap live contexts; the wrapper loses it once the canvas has left the page (never while a scene is rebuilt in place).
- **The map draws at most 60 fps** on 90/120 Hz phones (`paceMap` in WorldMap.tsx; iPhones' web views are 60 Hz anyway).
- Every app screen at phone sizes, with the iPhone's safe areas: `node tests/e2e/app-sweep.mjs` (screenshots in
  `test-results/app-sweep`), and the sheets/pop-ups: `node tests/e2e/app-sheets.mjs`. A grid holding `truncate` text
  needs `grid-cols-1` (an auto column grows to the text's full width and pushes the screen sideways).
- **Explorer's Eyes (first person) makes its world off the main thread**: a worker (`src/eyes/world.worker.ts` through
  `worldLoader.ts`) paints the ground, builds the buildings, the occupancy grid, trees, street and the land's mesh, and
  paints the sharpest ground a square at a time (`closeGround.ts`). As you move, the view's origin moves along in whole
  spans of the sharp ground (`rebase` in `scene.ts`) and everything standing keeps its place: anything new there that
  keeps positions in the view's coordinates must be shifted in `rebase`. Places on plots are built once per 16×16-plot
  square (`builds.ts`); their moving parts turn in the vertex shader. Screens in first person read the explorer store
  with selectors (`useExplorer((s) => …)`), never the whole store: steering updates it every frame.
  `E2E_PROFILE=15 node tests/e2e/eyes.mjs web` drives the car and prints frame times and main-thread hot spots.
- Benchmarks: `node tests/e2e/map-perf.mjs` (map smoothness at 4x CPU throttle) and `node tests/e2e/perf-app.mjs`
  (idle cost, frames, loops, timers per screen in the app shell) after `npm run build:artifact`.

## Keeping the server cheap as players grow

The plan and the numbers behind it: the "ops/scaling-architecture.md" doc in the LANDVAS project. Rules so far:
- **Nobody at the screen, nobody asking** (`src/lib/away.ts`): on a browse screen untouched for 5 minutes, React Query
  interval refetches, the map's update check, nudges and the activity heartbeat pause; the first touch refreshes what went
  stale. A new background loop outside React Query checks `isAway()` (and re-checks on `onBack`). Games, rooms, lobbies,
  homes, the editor, first person and watching never go away; a watched browse screen can `holdHere()`.
  `node tests/e2e/away.mjs` checks it.
- **World-shared data isn't asked per player: it's a CDN snapshot** (cdn.landvas.app, `cdn/worker.js`, deployed by the
  workflow with the `CLOUDFLARE_API_TOKEN` secret). `public.world_snapshot(key)` builds the public view by calling the
  same functions the app used, as nobody (read-only: the worker GETs it, caches it a few seconds per Cloudflare location
  and serves a slightly old copy while it refreshes); the app reads it with `cdnSnapshot()` (`src/lib/cdn.ts`) and falls
  back to the old call whenever the CDN is off, down or too old. Snapshots today: leviathan, hot_zone, enchant_world,
  primordials, travel, stars_real, stars_chart. Nothing that says where a player is goes in one (Starbeams come down where
  their owner stood: they stay a call about the ones near you). A player's own part never goes in a snapshot: it's a separate small call (`leviathan_me`, merged
  by `src/leviathan/levMerge.ts`; `tests/sql/540-world-snapshots` checks snapshot + own part = the old answer) or worked
  out in the app from ids in the snapshot (`owner_id` → "mine"). A new shared read: a key in `world_snapshot`, the same
  key in the worker's `SNAPSHOTS`, and the app's call trying `cdnSnapshot` first. The deploy switches the app over
  (`game_config` 'cdn') only after the CDN answers; pictures through it too only with `"pictures": true` there (on
  Cloudflare's free Workers plan, 100K requests a day, they'd use up the allowance).
- **Shared topics don't make everyone fetch.** A nudge on a topic everybody listens to (global chat, feed, news) becomes
  one database call per listener; send the data on a private channel instead, or shard the topic (as the planet, arcade
  and home chats are).
- **Cron jobs work within a time budget** and scale their batch with the number of active players (see
  `integrity_auto_scan`); a fixed `limit` falls behind silently as LANDVAS grows.
- **Patching a function another migration rewrote:** feature migrations edit functions in place with
  `private.fn_patch(fn, snippet, replacement)`, which fails when the snippet is gone. Anchor on today's text: e.g.
  `trait_view` now reads genes as `private.gene_k(v_parts, '<gene>')` (20261119000520), not `ench_has_gene(e.id, …)`.
  Prefer speeding up a helper over rewriting a body features patch: `ench_has_gene` reads splices directly
  (`tests/sql/525-genes-from-splices.test.ts` keeps it equal to `ench_partners`' rules).
- **A channel everyone listens to carries the data, server-only** (`serverChannel` in the backend, a private Realtime
  topic with a select-only policy, `realtime.send` from the database): the global chat's lines (`global-chat:lines`).
- Production usage (calls by endpoint, bytes, DB time) comes from `scripts/diag-top.mjs` and `scripts/diag-io.mjs`.

## Keeping the database light

The server is PostgreSQL 17 on a Small instance; `scripts/diag-top.mjs` (Actions → "Diagnose publishing") prints the top
100 users of the database and the API. What made it heavy, and the rules that keep it light:
- **Helpers that read tables are PL/pgSQL, not SQL.** On PostgreSQL 17 a `language sql` function that reads a table is
  planned from scratch each time a statement calls it (the splice-partner helper: ~1 ms to plan, 0.01 ms to run).
  `20261119000520_efficiency.sql` rewrote every such helper as `return (select … limit 1)` in PL/pgSQL, which keeps
  its plan for the connection's life; a later `create or replace … language sql` undoes that for that helper. Write new
  ones in PL/pgSQL (`#variable_conflict use_column` keeps SQL's rule that a column beats a same-named argument).
  One-line helpers with no `from` stay SQL: they're folded into the query that calls them.
- **Settings are stored unpacked** (`game_config.value` storage external): the realm settings are ~180 kB and were
  unpacked on every read. Read a big setting once per call, not once per row.
- **`my_groups` is one query** that mirrors `private.group_json`: a field added to one goes in the other
  (`tests/sql/520-efficiency-pass` checks they agree).
- A plot sheet asks about its places with one `places_for_plot` call, not five `*_for_plot` calls.
- The deploy's own report (`scripts/diag-io.mjs`) skips the heavy helper timings; they run only by hand (`DIAG_HEAVY`).
