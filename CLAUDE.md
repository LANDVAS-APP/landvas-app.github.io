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
