# LANDVAS portal

Two small websites that are **not** part of the game or the mobile apps, on the same Supabase database:

| Site | Build | Who |
|---|---|---|
| admin.landvas.app | `PORTAL_APP=admin` → `dist/portal/admin` | Staff (any `admin_roles` row). Owner-only: data explorer, SQL console, portal settings. |
| my.landvas.app | `PORTAL_APP=my` → `dist/portal/my` | Every player, their own data only (read-only). |

- Database side: `supabase/migrations/20261119000173_portal.sql` (`portal_*` functions; every one checks the caller in SQL).
  Tests: `tests/sql/188-portal.test.ts`.
- Optional two-step sign-in for staff: `game_config.portal.require_mfa` (turned on from Security & staff). When on,
  `private.require_admin` needs an `aal2` session, so the game's own admin screen needs it too.
- Hosting: the deploy workflow builds both into `dist/portal/…`; `deploy/portal-worker.js` (a Cloudflare Worker with the
  custom domains admin.landvas.app and my.landvas.app) serves the right one by hostname.
- The game's admin screens (`src/admin`) are reused here. The native app build leaves them out (`src/admin/AdminElsewhere.tsx`).
- my.landvas.app has a public landing page for search engines and signed-out visitors. It's plain HTML in
  `portal/my/index.html` (with its SEO head, structured data and FAQ) styled by `portal/my/landing.css`, so it shows
  without scripts. A small inline script there, and `useLanding` in `portal/my/App.tsx`, switch to the app (class
  `app-mode` on `<html>`) when someone is signed in, back from an email link, or on any other address. Its buttons go to
  `/sign-in`. Keep the FAQ text in the page and in the FAQPage JSON-LD the same.
- Public files per site (favicons, `manifest.json`, `robots.txt`, `sitemap.xml`, `og-portal.png`, landing screenshots in
  `screens/`) live in `portal/<app>/public`. Favicons come from `scripts/make-icons.mjs`. Admin's robots.txt blocks everything.
- The Worker treats an address ending in a 1–8 character extension as a file, so keep public file names to that
  (`manifest.json`, not `.webmanifest`).

## Running it locally

```sh
node scripts/portal-dev-bridge.mjs                       # DATABASE_URL = a local Postgres with the migrations
PORTAL_APP=admin VITE_PORTAL_DEV_API=http://localhost:8790 npx vite --config portal/vite.config.ts --port 5180
PORTAL_APP=my    VITE_PORTAL_DEV_API=http://localhost:8790 npx vite --config portal/vite.config.ts --port 5181
```
With the dev bridge, signing in only needs an existing account's email (no password); never deploy the bridge.
