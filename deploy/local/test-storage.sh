#!/bin/sh
# Smoke test for the /kalponik-books/ route.
#
# Proves the one risky bit of the storage design: S3 requests and presigned
# download URLs still verify when they go through nginx under a path that is
# the bucket name. Uses the official AWS CLI image on the compose network, so
# nothing is installed on the host.
# Usage (from deploy/local, stack up and init-garage.sh done):  sh test-storage.sh
set -eu
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1

. ./.env
BUCKET="${S3_BUCKET_NAME:-kalponik-books}"
KEY="smoke/hello.txt"
NET="kalponik-local_default"

aws() {
  docker run --rm -i --network "$NET" \
    -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-garage}" \
    -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    amazon/aws-cli:2.31.39 --endpoint-url http://nginx "$@"
}

# Every aws call is SigV4-signed; the endpoint sends them through nginx.
echo "hello from kalponik" | aws s3 cp - "s3://$BUCKET/$KEY" >/dev/null
echo "[1/4] signed upload through nginx: ok"

GOT=$(aws s3 cp "s3://$BUCKET/$KEY" -)
[ "$GOT" = "hello from kalponik" ] || { echo "download mismatch: $GOT"; exit 1; }
echo "[2/4] signed download through nginx: ok"

URL=$(aws s3 presign "s3://$BUCKET/$KEY" --expires-in 300 | tr -d '\r')
case "$URL" in
  http://nginx/"$BUCKET"/*) ;;
  *) echo "unexpected presigned URL: $URL"; exit 1 ;;
esac
# Fetch it with no credentials, the way a browser or the app would.
GOT=$(docker compose exec -T nginx wget -qO- "$URL")
[ "$GOT" = "hello from kalponik" ] || { echo "presigned fetch failed: $GOT"; exit 1; }
echo "[3/4] presigned URL (path-style under /$BUCKET/) works without credentials: ok"

# The browser preflight that comes before every upload from the web or
# Android app. Garage refuses it (403) unless the bucket has a CORS rule.
CODE=$(docker compose exec -T nginx curl -s -o /dev/null -w '%{http_code}' -X OPTIONS   -H "Origin: http://localhost:47811"   -H "Access-Control-Request-Method: PUT"   "http://nginx/$BUCKET/$KEY")
[ "$CODE" = "200" ] || { echo "CORS preflight failed: HTTP $CODE (run init-garage.sh)"; exit 1; }
echo "[4/4] CORS preflight for a browser upload: ok"

aws s3 rm "s3://$BUCKET/$KEY" >/dev/null
echo "All storage checks passed."
