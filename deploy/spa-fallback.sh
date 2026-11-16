#!/bin/bash
# Make every app address load the game, whichever host serves dist/:
#  * GitHub Pages: 404.html is the app (deep links still work, with a 404 status)
#  * Cloudflare Workers static assets / Pages: _redirects rewrites app routes to
#    index.html (status 200). Only app routes are listed, so real files such as
#    /assets/*.js are never rewritten.
#  * Any static host: each fixed route also gets its own folder/index.html.
set -euo pipefail
# every fixed address the game has (from its route list), so a page reloaded on any of them loads — not only the ones
# listed below by hand (new screens get theirs automatically)
APP_SRC="$(cd "$(dirname "$0")/.." && pwd)/src/app/App.tsx"
FROM_APP=""
if [ -f "$APP_SRC" ]; then FROM_APP="$(grep -oE "path: '/[a-z0-9/-]+'" "$APP_SRC" | sed -E "s#path: '/(.*)'#\1#" || true)"; fi
cd "${1:-dist}"
cp index.html 404.html
STATIC="world welcome onboarding play canvases gallery players party me achievements leaderboards inventory events settings admin social invite explorer support duels pvp challenges sketch doodle duet reset-password auth/confirm inkborn habitat legal/privacy legal/terms legal/delete-account legal/content legal/rent legal/copyright handbook handbook/start handbook/world handbook/roll handbook/rent handbook/ink handbook/luck handbook/places handbook/inkborn handbook/space handbook/enchant handbook/ultra handbook/social handbook/progress handbook/strategy handbook/faq"
STATIC="$(printf '%s\n' $STATIC $FROM_APP | grep -v '^$' | sort -u | tr '\n' ' ')"
DYNAMIC="create play u i art legal duet sketch inkborn habitat party farm landlord business arcade realm clans grimoire powers space play-sandbox pvp-sandbox watch handbook"
: > _redirects
for r in $STATIC; do
  mkdir -p "$r"
  # each page names itself as canonical (otherwise search engines fold it into the homepage)
  sed -e "s#<link rel=\"canonical\" href=\"https://landvas.app/\" />#<link rel=\"canonical\" href=\"https://landvas.app/$r\" />#" \
      -e "s#<meta property=\"og:url\" content=\"https://landvas.app/\" />#<meta property=\"og:url\" content=\"https://landvas.app/$r\" />#" index.html > "$r/index.html"
  echo "/$r /index.html 200" >> _redirects
done
for r in $DYNAMIC; do echo "/$r/* /index.html 200" >> _redirects; done
echo "spa fallback: $(wc -l < _redirects) routes"
