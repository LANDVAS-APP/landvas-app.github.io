#!/bin/bash
# Make every app address load the game, whichever host serves dist/:
#  * GitHub Pages: 404.html is the app (deep links still work, with a 404 status)
#  * Cloudflare Workers static assets / Pages: _redirects rewrites app routes to
#    index.html (status 200). Only app routes are listed, so real files such as
#    /assets/*.js are never rewritten.
#  * Any static host: each fixed route also gets its own folder/index.html.
set -euo pipefail
cd "${1:-dist}"
cp index.html 404.html
STATIC="world welcome onboarding play canvases gallery players me achievements leaderboards inventory events settings admin social invite explorer support duels"
DYNAMIC="create play u art legal"
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
