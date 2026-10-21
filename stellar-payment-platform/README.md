# Stellar Payment Platform

A payment platform built on the Stellar network.

## Table of Contents

- [Getting Started](#getting-started)
- [Database Setup](#database-setup)
- [Migrations](#migrations)
- [Configuration](#configuration)
- [Testing](#testing)

## Getting Started

Install dependencies and configure your environment:

```bash
npm install
cp .env.example .env
```

## Database Setup

The platform uses PostgreSQL via Prisma. Before running the application, ensure your database is reachable and your Prisma schema is applied.

```bash
npx prisma generate
npx prisma migrate deploy
```

### Prisma `metrics` Preview Feature (Pool Monitoring)

The database pool monitor (`src/db-pool-monitor.js`) reads Prisma's `$metrics` API to populate the `db_pool_connections_open` and related gauges. This API is only available when the `metrics` preview feature is enabled in `schema.prisma`.

If the preview feature is **not** enabled:

- `prisma.$metrics` is `undefined`, and the monitor cannot read pool statistics.
- The `db_pool_monitoring_available` gauge is set to `0`.
- All pool gauges (e.g. `db_pool_connections_open`) report `0`, which can be misleading.
- A `warn`-level message is logged at startup indicating that pool monitoring is unavailable.

To enable pool monitoring, add the `metrics` preview feature to the `generator` block in `prisma/schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["metrics"]
}
```

Then regenerate the Prisma client:

```bash
npx prisma generate
```

When the feature is enabled, `db_pool_monitoring_available` is set to `1` and the monitor polls `$metrics` on its normal interval.

> **Note:** Enabling the `metrics` preview feature is an operator choice. Deployments that do not require pool monitoring can leave it disabled; the `db_pool_monitoring_available` gauge provides a clear signal that monitoring is degraded.

## Migrations

The application can run a migration drift check at startup, controlled by the `MIGRATION_POLICY` environment variable.

### `MIGRATION_POLICY`

| Value    | Behaviour                                                                 |
| -------- | ------------------------------------------------------------------------- |
| `off`    | Skip the drift check entirely.                                            |
| `warn`   | Log a warning if drift is detected, but continue startup.                 |
| `strict` | Log an error and exit the process with code `1` if drift is detected.     |

Under `MIGRATION_POLICY=strict`, when drift is detected the migration check flushes all log buffers **before** calling `process.exit(1)`. This ensures the error is written to disk and visible in the logs even in environments such as PM2 or Docker with `restart: always`, where the process may otherwise be restarted before the log line is flushed. The exit code is propagated through `startup.sh` so that Docker health checks and orchestrators can observe the failure.

## Configuration

Configuration is provided via environment variables. See `.env.example` for the full list.

## Testing

Run the test suite:

```bash
npm test
