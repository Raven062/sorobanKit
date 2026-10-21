/**
 * Full-flow end-to-end test suite.
 *
 * Covers the complete product journey in sequence:
 *   1. Register a new username via POST /api/v1/register
 *   2. Resolve the registered username via GET /api/v1/federation
 *   3. Create a payment intent via POST /api/v1/payments/intents
 *   4. Simulate webhook delivery and assert the webhook payload
 *
 * ============================================================================
 * ENVIRONMENT SETUP
 * ============================================================================
 *
 * This suite is designed to run against a live local dev stack (not mocked).
 * The following environment variables must be set (see tests/e2e/README.md):
 *
 *   E2E_BASE_URL        Base URL of the running API (default: http://localhost:3000)
 *   E2E_WEBHOOK_URL     URL the payment service delivers webhooks to
 *                       (default: http://localhost:3000/api/v1/webhooks/payment)
 *   E2E_WEBHOOK_SECRET  Shared secret used to sign/verify webhook payloads
 *   E2E_DB_URL          Postgres connection string used by purgeTestRecords
 *                       to clean up records created by this suite
 *
 * Prerequisites:
 *   - The dev stack (API, Postgres, payment service) must be running.
 *   - The federation endpoint must be reachable and backed by the same DB
 *     the registration endpoint writes to.
 *   - The webhook receiver must be running and able to accept deliveries.
 *
 * Run with:
 *   npm run test:e2e -- tests/e2e/full-flow.e2e.test.js
 *
 * ============================================================================
 */

'use strict';

const {
  e2ePrefix,
  purgeTestRecords,
  apiRequest,
  waitFor,
} = require('./e2eHelpers');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const WEBHOOK_URL =
  process.env.E2E_WEBHOOK_URL ||
  'http://localhost:3000/api/v1/webhooks/payment';
const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET || '';

// Unique prefix so records created by this run can be purged afterwards.
const RUN_PREFIX = e2ePrefix('full-flow');

// Shared state threaded through the sequential steps.
const state = {
  username: `${RUN_PREFIX}-user`,
  publicKey: null,
  federationAddress: null,
  paymentIntentId: null,
  webhookPayload: null,
};

/**
 * Build a deterministic, valid-looking Stellar public key for the test user.
 * The dev stack accepts any well-formed ed25519 public key string.
 */
function buildTestPublicKey(seed) {
  // G + 55 base32-ish chars. Deterministic per run for traceability.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = 'G';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < 55; i += 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    out += alphabet[hash % alphabet.length];
  }
  return out;
}

describe('Full flow: register -> federation -> payment -> webhook', () => {
  jest.setTimeout(60000);

  beforeAll(() => {
    state.publicKey = buildTestPublicKey(state.username);
  });

  afterAll(async () => {
    // Purge every record created under this run's prefix.
    await purgeTestRecords(RUN_PREFIX);
  });

  // --------------------------------------------------------------------------
  // Step 1: Register a new user
  // --------------------------------------------------------------------------
  test('step 1: registers a new user via POST /api/v1/register', async () => {
    const res = await apiRequest(BASE_URL, {
      method: 'POST',
      path: '/api/v1/register',
      body: {
        username: state.username,
        publicKey: state.publicKey,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toBeDefined();
    expect(res.body.username).toBe(state.username);
    expect(res.body.publicKey).toBe(state.publicKey);
    expect(res.body.federationAddress).toBe(
      `${state.username}*${process.env.E2E_FEDERATION_DOMAIN || 'stellar.local'}`
    );

    state.federationAddress = res.body.federationAddress;
  });

  // --------------------------------------------------------------------------
  // Step 2: Resolve the username via federation
  // --------------------------------------------------------------------------
  test('step 2: resolves the username via GET /api/v1/federation', async () => {
    const res = await apiRequest(BASE_URL, {
      method: 'GET',
      path: '/api/v1/federation',
      query: {
        q: state.username,
        type: 'name',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.stellar_address).toBe(state.federationAddress);
    expect(res.body.account_id).toBe(state.publicKey);
    expect(res.body.memo_type).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Step 3: Create a payment intent
  // --------------------------------------------------------------------------
  test('step 3: creates a payment intent', async () => {
    const res = await apiRequest(BASE_URL, {
      method: 'POST',
      path: '/api/v1/payments/intents',
      body: {
        amount: '10.0000000',
        asset: 'XLM',
        destination: state.federationAddress,
        memo: `e2e-${RUN_PREFIX}`,
        webhookUrl: WEBHOOK_URL,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toBeDefined();
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('pending');
    expect(res.body.amount).toBe('10.0000000');
    expect(res.body.asset).toBe('XLM');
    expect(res.body.destination).toBe(state.federationAddress);

    state.paymentIntentId = res.body.id;
  });

  // --------------------------------------------------------------------------
  // Step 4: Simulate webhook delivery and assert the payload
  // --------------------------------------------------------------------------
  test('step 4: simulates webhook delivery and asserts the payload', async () => {
    // Trigger the payment service to deliver a webhook for the intent.
    const trigger = await apiRequest(BASE_URL, {
      method: 'POST',
      path: `/api/v1/payments/intents/${state.paymentIntentId}/simulate-webhook`,
      body: {
        status: 'completed',
        secret: WEBHOOK_SECRET,
      },
    });

    expect([200, 202]).toContain(trigger.status);

    // Wait for the webhook to be delivered and recorded by the receiver.
    const delivered = await waitFor(
      async () => {
        const res = await apiRequest(BASE_URL, {
          method: 'GET',
          path: '/api/v1/webhooks/payment',
          query: { intentId: state.paymentIntentId },
        });
        if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
          return res.body[res.body.length - 1];
        }
        return null;
      },
      { timeoutMs: 15000, intervalMs: 500 }
    );

    expect(delivered).toBeDefined();
    state.webhookPayload = delivered;

    // Assert the webhook payload fields.
    expect(delivered.event).toBe('payment.completed');
    expect(delivered.intentId).toBe(state.paymentIntentId);
    expect(delivered.status).toBe('completed');
    expect(delivered.amount).toBe('10.0000000');
    expect(delivered.asset).toBe('XLM');
    expect(delivered.destination).toBe(state.federationAddress);
    expect(delivered.memo).toBe(`e2e-${RUN_PREFIX}`);
    expect(delivered.timestamp).toBeDefined();
    expect(typeof delivered.timestamp).toBe('string');
  });

  // --------------------------------------------------------------------------
  // Final: confirm the intent reflects the completed state
  // --------------------------------------------------------------------------
  test('final: payment intent reflects completed status', async () => {
    const res = await apiRequest(BASE_URL, {
      method: 'GET',
      path: `/api/v1/payments/intents/${state.paymentIntentId}`,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(state.paymentIntentId);
    expect(res.body.status).toBe('completed');
  });
});