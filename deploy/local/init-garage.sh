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
echo "Garage is ready."
