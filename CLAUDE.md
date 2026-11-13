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

