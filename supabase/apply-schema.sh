#!/bin/sh
# Applies Readest's database schema to a hosted Supabase project, the same way
# Readest's own docker/volumes/db/apply-migrations.sh does for self-hosting:
# base schema first, then each migration in filename order, every file in
# autocommit mode with psql, and a ledger (readest_meta.migrations) so a re-run
# only applies what is new. Run it again after merging upstream Readest.
#
# Why not the Supabase SQL editor: migration 016 uses CREATE INDEX
# CONCURRENTLY and a procedure that COMMITs in batches, which the editor (one
# transaction) rejects. Readest's own notes say to use psql for it.
#
# Usage:
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' \
#     sh supabase/apply-schema.sh [path-to-reader-checkout]
# The path defaults to this repo, which is the reader checkout.
#
# Use the *Session pooler* connection string (port 5432) from Supabase >
# Connect: it works over IPv4, and session mode allows the statements above.
# psql runs from the official postgres Docker image; nothing is installed.
#
# Differences from Readest's self-host init:
# - Skips the two `ALTER FUNCTION auth.* OWNER TO supabase_auth_admin` lines:
#   hosted Supabase already has that ownership and `postgres` may not change it.
# - Skips roles.sql / jwt.sql: hosted Supabase manages roles and JWT itself.
# - Runs as `postgres` (not supabase_admin, which hosted projects don't expose).
set -eu
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: don't rewrite /paths

READER="${1:-$(dirname "$0")/..}"
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL (Session pooler connection string)}"
DB_DIR="$(cd "$READER/docker/volumes/db" && pwd)"
[ -f "$DB_DIR/init/schema.sql" ] || { echo "no schema.sql under $DB_DIR"; exit 1; }
PSQL_IMAGE="${PSQL_IMAGE:-postgres:17-alpine}"
DOCKER_NET="${DOCKER_NET:-}"   # only for local testing against a container

psql_run() {
  docker run --rm -i ${DOCKER_NET:+--network "$DOCKER_NET"} \
    -v "$DB_DIR:/db:ro" "$PSQL_IMAGE" \
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q "$@"
}

psql_run -c "CREATE SCHEMA IF NOT EXISTS readest_meta" \
         -c "CREATE TABLE IF NOT EXISTS readest_meta.migrations (
               name text PRIMARY KEY,
               applied_at timestamp with time zone NOT NULL DEFAULT now())"

applied() {
  [ -n "$(psql_run -tA -c "SELECT 1 FROM readest_meta.migrations WHERE name = '$1'")" ]
}

# Base schema, recorded as 000_schema.sql so it only runs once.
if applied 000_schema.sql; then
  echo "schema: base schema already applied"
else
  echo "schema: applying base schema"
  grep -v -E '^ALTER FUNCTION auth\.(uid|role)\(\) OWNER TO supabase_auth_admin;' \
    "$DB_DIR/init/schema.sql" | psql_run -f -
  psql_run -c "INSERT INTO readest_meta.migrations (name) VALUES ('000_schema.sql')"
fi

for f in "$DB_DIR"/migrations/*.sql; do
  name=$(basename "$f")
  if applied "$name"; then
    echo "schema: $name already applied"
    continue
  fi
  echo "schema: applying $name"
  psql_run -f "/db/migrations/$name"
  psql_run -c "INSERT INTO readest_meta.migrations (name) VALUES ('$name')"
done

echo "schema: done ($(psql_run -tA -c 'SELECT count(*) FROM readest_meta.migrations') files recorded)"
