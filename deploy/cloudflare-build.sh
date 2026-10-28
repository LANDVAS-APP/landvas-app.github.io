#!/bin/bash
# Build step for Cloudflare Workers Builds (see wrangler.jsonc). Same build as GitHub Pages.
set -euo pipefail
[ -d node_modules ] || npm ci
export LANDVAS_BUILD_ID="$(git rev-parse --short=7 HEAD 2>/dev/null || echo cf)"
npx vite build --mode production
printf '{"build":"%s","at":"%s"}\n' "$LANDVAS_BUILD_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/version.json
bash deploy/spa-fallback.sh dist
# Cloudflare handles app routes itself (single-page-application mode)
printf '_redirects\n.nojekyll\n' > dist/.assetsignore
