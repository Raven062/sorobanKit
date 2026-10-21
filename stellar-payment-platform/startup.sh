#!/bin/sh
set -e

# Use the Prisma CLI bundled in node_modules. Bare `npx prisma` would silently
# download the latest CLI (v7+) when the local one is missing, and v7 rejects
# this schema (`url` in the datasource block, the "metrics" preview feature).
PRISMA="./node_modules/.bin/prisma"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "WARNING: DATABASE_URL is not set." >&2
  echo "Skipping database migrations and running in mock/fallback mode." >&2
else
  echo "Running database migrations..."
  # Automatically resolve the duplicate soft_deletes migration that failed on Render
  "$PRISMA" migrate resolve --applied 20260829000000_soft_deletes || true
  "$PRISMA" migrate deploy
  echo "Verifying migration status..."
  # Capture the migration check's exit code so a strict-policy drift failure is
  # propagated to Docker instead of being swallowed by `set -e` or npm start.
  set +e
  "$PRISMA" migrate status >/dev/null 2>&1
  MIGRATION_CHECK_EXIT=$?
  set -e
  if [ "$MIGRATION_CHECK_EXIT" -eq 0 ]; then
    echo "Database schema is up to date."
  else
    echo "WARNING: Prisma schema is out of sync with the database." >&2
    echo "Run './node_modules/.bin/prisma migrate deploy' and restart the server." >&2
    # Under MIGRATION_POLICY=strict, drift must fail the container start so the
    # failure is visible to Docker health checks rather than a silent restart loop.
    if [ "${MIGRATION_POLICY:-}" = "strict" ]; then
      echo "ERROR: MIGRATION_POLICY=strict and migration drift detected. Exiting with code $MIGRATION_CHECK_EXIT." >&2
      exit "$MIGRATION_CHECK_EXIT"
    fi
  fi
fi

if [ ! -x "$PRISMA" ]; then
  echo "ERROR: Prisma CLI not found at $PRISMA." >&2
  echo "It must be a production dependency so it survives 'npm prune --omit=dev'." >&2
  exit 1
fi

if [ ! -d "./node_modules/@prisma/client" ]; then
  echo "ERROR: @prisma/client is missing from the runtime image." >&2
  echo "Without it the app falls back to a mock client and serves fake data." >&2
  exit 1
fi


echo "Starting the application..."
npm start