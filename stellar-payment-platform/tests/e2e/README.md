# End-to-End (E2E) Tests

This directory contains end-to-end tests that exercise the platform against a **running local dev stack** (not mocked). The suites cover individual endpoints as well as the full product journey.

## Suites

| File | Description |
| --- | --- |
| `registration.e2e.test.js` | Registration endpoint in isolation. |
| `federation.e2e.test.js` | Federation resolution endpoint in isolation. |
| `full-flow.e2e.test.js` | Full journey: register a user → resolve via `GET /federation` → create a payment intent → simulate webhook delivery → assert the webhook payload. |

## Required Environment Setup

The tests require a running dev stack (API + database + federation service + webhook receiver). The following environment variables must be set before running any suite:

| Variable | Required | Description |
| --- | --- | --- |
| `E2E_BASE_URL` | Yes | Base URL of the running API, e.g. `http://localhost:3000`. |
| `E2E_FEDERATION_DOMAIN` | Yes | Federation domain used to build `user*domain` addresses, e.g. `localhost`. |
| `E2E_WEBHOOK_URL` | Yes | URL of the webhook receiver the payment service delivers to, e.g. `http://localhost:4000/webhooks/payment`. |
| `E2E_WEBHOOK_SECRET` | Yes | Shared secret used to sign/verify webhook payloads. |
| `E2E_DB_URL` | No | Database connection string, if the suite needs to seed or clean up state. |
| `E2E_TIMEOUT_MS` | No | Per-test timeout in milliseconds (default `30000`). |

If any required variable is missing, the suites fail fast with a clear error rather than silently skipping.

## Starting the Local Dev Stack

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the stack (API, database, federation service, and webhook receiver). Use the project's standard dev command, e.g.:

   ```bash
   npm run dev
   ```

3. Confirm the API is reachable:

   ```bash
   curl -sf "$E2E_BASE_URL/health"
   ```

4. Confirm the webhook receiver is reachable:

   ```bash
   curl -sf "$E2E_WEBHOOK_URL" -o /dev/null -w "%{http_code}\n" || true
   ```

Wait until both services report healthy before running the tests.

## Running the E2E Suites

Run all e2e suites:

```bash
npm run test:e2e
```

Run a single suite, e.g. the full flow:

```bash
npx jest tests/e2e/full-flow.e2e.test.js --runInBand
```

Notes:

- Use `--runInBand` so suites do not race on shared state.
- The full-flow suite registers a unique username per run and cleans up after itself where possible.
- Tests must run against a live stack; they will not pass against mocks.

## CI Integration Workflow

The CI integration workflow runs the e2e suites (including `full-flow.e2e.test.js`) against a freshly started dev stack. Expectations:

- The workflow starts the dev stack and waits for health checks to pass before running tests.
- All required environment variables above are provided by the workflow (secrets for `E2E_WEBHOOK_SECRET`, defaults for URLs).
- The e2e step runs with `--runInBand` and fails the build on any assertion failure.
- Logs from the API and webhook receiver are uploaded as artifacts on failure to aid debugging.

If you add a new e2e suite, ensure it is picked up by the `test:e2e` script and that the CI workflow's environment provides everything it needs.