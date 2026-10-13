#!/bin/sh
# First boot: create + seed the SQLite database if it does not exist yet.
# The platform gives every container a fresh filesystem unless a volume is
# attached, so "no file" is the normal state on a new deploy.
set -e

mkdir -p "$(dirname "$DATABASE_PATH")"

if [ ! -f "$DATABASE_PATH" ]; then
  echo "No database at $DATABASE_PATH — creating and seeding sample content."
  # seed.mjs applies schema.sql and inserts users/courses; seed-extra adds
  # programs and calendar events. Both are idempotent (upsert by slug).
  node scripts/seed.mjs
  node scripts/seed-extra.mjs
else
  echo "Found existing database at $DATABASE_PATH — skipping seed."
fi

exec node .output/server/index.mjs
