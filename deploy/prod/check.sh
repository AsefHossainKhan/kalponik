#!/bin/sh
# Post-deploy checks. Run on the server from this folder:  sh check.sh
# The first group needs only the containers; the second goes through
# the reverse proxy and TLS, so it only passes once the locations are in place.
set -u
cd "$(dirname "$0")"
. ./.env
ORIGIN="${KALPONIK_PUBLIC_ORIGIN:?set KALPONIK_PUBLIC_ORIGIN in .env}"
BUCKET="${S3_BUCKET_NAME:-kalponik-books}"
WEB="http://127.0.0.1:${KALPONIK_WEB_PORT:-47811}"
S3="http://127.0.0.1:${KALPONIK_S3_PORT:-47812}"
fail=0

check() { # name, expected code, actual code
  if [ "$3" = "$2" ]; then echo "ok    $1 ($3)"; else echo "FAIL  $1 (got $3, want $2)"; fail=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }
preflight() {
  code -X OPTIONS -H "Origin: http://tauri.localhost" \
    -H "Access-Control-Request-Method: PUT" "$1/$BUCKET/check.txt"
}

echo "== containers (127.0.0.1)"
check "web app page"            200 "$(code "$WEB/kalponik/library")"
check "web runtime config"      200 "$(code "$WEB/kalponik/runtime-config.js")"
check "pdf.js asset"            200 "$(code "$WEB/kalponik/vendor/pdfjs/pdf.worker.min.mjs")"
check "Garage CORS preflight"   200 "$(preflight "$S3")"

echo "== public ($ORIGIN, through the reverse proxy)"
check "app root, no redirect loop" 200 "$(code -L --max-redirs 5 "$ORIGIN/kalponik/")"
check "web app page"            200 "$(code "$ORIGIN/kalponik/library")"
check "web runtime config"      200 "$(code "$ORIGIN/kalponik/runtime-config.js")"
check "Garage CORS preflight"   200 "$(preflight "$ORIGIN")"

if curl -s --max-time 20 "$ORIGIN/kalponik/runtime-config.js" | grep -q "$ORIGIN/kalponik"; then
  echo "ok    runtime config points at $ORIGIN/kalponik"
else
  echo "FAIL  runtime config does not mention $ORIGIN/kalponik"; fail=1
fi

[ "$fail" = 0 ] && echo "All checks passed." || { echo "Some checks failed."; exit 1; }
