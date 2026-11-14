#!/bin/sh
# Build the Kalponik web image on a PC and save it for the server.
# A small server can't build Next.js comfortably, so the image is built here and moved over with `docker load`.
#
# Usage, from the repo root, submodules initialised:
#   sh deploy/prod/build-web-image.sh
# Then copy the .tar.gz to the server and run there:
#   gunzip -c kalponik-web-<tag>.tar.gz | docker load
set -eu
# Git Bash on Windows would otherwise rewrite /kalponik into C:/Program Files/Git/kalponik.
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/../.."

TAG="$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
OUT="${OUT_DIR:-deploy/prod/dist}"
mkdir -p "$OUT"

# Only the base path is baked in; everything else (Supabase, S3, the public
# URL) is read at runtime from the server's .env.
docker build --target production-stage \
  --build-arg NEXT_PUBLIC_APP_PLATFORM=web \
  --build-arg NEXT_PUBLIC_OBJECT_STORAGE_TYPE=s3 \
  --build-arg KALPONIK_BASE_PATH=/kalponik \
  -t "kalponik-web:$TAG" -t kalponik-web:latest .

docker save "kalponik-web:$TAG" kalponik-web:latest | gzip > "$OUT/kalponik-web-$TAG.tar.gz"
ls -lh "$OUT/kalponik-web-$TAG.tar.gz"
echo "Built kalponik-web:$TAG"
