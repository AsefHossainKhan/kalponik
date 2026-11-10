#!/bin/sh
# One-time Garage setup for the local stack: give the node storage, create the
# bucket, import the S3 key from .env and allow it on the bucket. Safe to run
# again; steps that are already done are skipped.
# Usage (from deploy/local, after `docker compose up -d`):  sh init-garage.sh
set -eu
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1   # stop Git Bash on Windows rewriting /garage

. ./.env
BUCKET="${S3_BUCKET_NAME:-kalponik-books}"
g() { docker compose exec -T -e RUST_LOG=warn garage /garage "$@"; }

# Wait for the node to answer.
i=0
until g status >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { echo "garage did not start"; exit 1; }
  sleep 1
done

NODE_ID=$(g node id -q | cut -d@ -f1)

if g layout show 2>/dev/null | grep -q "No nodes currently have a role"; then
  g layout assign -z local -c 50G "$NODE_ID" >/dev/null
  g layout apply --version 1 >/dev/null
  echo "layout: assigned node ${NODE_ID%"${NODE_ID#????????????????}"}…"
else
  echo "layout: already set"
fi

if g key info "$S3_ACCESS_KEY_ID" >/dev/null 2>&1; then
  echo "key: already imported"
else
  g key import -n kalponik-app --yes "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
  echo "key: imported $S3_ACCESS_KEY_ID"
fi

if g bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "bucket: $BUCKET already exists"
else
  g bucket create "$BUCKET" >/dev/null
  echo "bucket: created $BUCKET"
fi

g bucket allow --read --write --owner "$BUCKET" --key "$S3_ACCESS_KEY_ID" >/dev/null
echo "bucket: key allowed read/write/owner on $BUCKET"

# CORS. The web app and the Android app upload and download book files from
# the browser/webview with presigned URLs, which are cross-origin requests
# (page on :47811 or tauri.localhost, files on the nginx origin). Without a
# CORS rule Garage answers the preflight with 403 and nothing uploads.
# Any origin is allowed: every request still needs a valid signature, so the
# origin list would add no protection, and the Android app's origin is not
# ours to choose. Set through the S3 API with the official AWS CLI image.
CORS='{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","PUT","HEAD","POST","DELETE"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag","Content-Length","Content-Range","Accept-Ranges"],"MaxAgeSeconds":3600}]}'
docker run --rm --network kalponik-local_default   -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"   -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"   -e AWS_DEFAULT_REGION="${S3_REGION:-garage}"   amazon/aws-cli:2.31.39 --endpoint-url http://garage:3900   s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "$CORS" >/dev/null
echo "bucket: CORS rule set on $BUCKET"
echo "Garage is ready."
