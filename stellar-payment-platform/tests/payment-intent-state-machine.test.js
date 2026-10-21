'use strict';

/**
 * Tests for the payment intent state machine transition guard.
 *
 * Covers:
 *  - The full transition matrix (valid transitions succeed, invalid ones throw CONFLICT/409).
 *  - COMPLETED -> PROCESSING specifically returns 409.
 *  - Concurrent updates: exactly one is rejected when racing.
 */

const {
  VALID_TRANSITIONS,
  assertValidTransition,
  updatePaymentIntentStatus,
} = require('../src/services/paymentIntentStateMachine');

const { ApiError } = require('../src/errors/ApiError');

const ALL_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'];

/**
 * Build a minimal in-memory Prisma-like mock for payment intents.
 * The mock supports `findUnique` and `update` and simulates the
 * guard being enforced inside the service layer.
 */
function createMockPrisma(initialStatus = 'PENDING') {
  const store = {
    id: 'pi_test_1',
    status: initialStatus,
  };

  return {
    store,
    paymentIntent: {
      async findUnique({ where }) {
        if (where.id !== store.id) return null;
        return { ...store };
      },
      async update({ where, data }) {
        if (where.id !== store.id) {
          throw new Error('Record not found');
        }
        // Simulate a small async delay to widen the race window.
        await new Promise((resolve) => setTimeout(resolve, 5));
        store.status = data.status;
        return { ...store };
      },
    },
  };
}

describe('payment intent state machine', () => {
  describe('VALID_TRANSITIONS map', () => {
    it('defines an entry for every known status', () => {
      for (const status of ALL_STATUSES) {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
        expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
      }
    });

    it('only references known statuses', () => {
      for (const status of ALL_STATUSES) {
        for (const target of VALID_TRANSITIONS[status]) {
          expect(ALL_STATUSES).toContain(target);
        }
      }
    });

    it('does not allow COMPLETED -> PROCESSING', () => {
      expect(VALID_TRANSITIONS.COMPLETED).not.toContain('PROCESSING');
    });
  });

  describe('assertValidTransition', () => {
    // Build the full matrix.
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const isValid = (VALID_TRANSITIONS[from] || []).includes(to);

        if (isValid) {
          it(`allows ${from} -> ${to}`, () => {
            expect(() => assertValidTransition(from, to)).not.toThrow();
          });
        } else {
          it(`rejects ${from} -> ${to} with CONFLICT`, () => {
            let caught;
            try {
              assertValidTransition(from, to);
            } catch (err) {
              caught = err;
            }
            expect(caught).toBeInstanceOf(ApiError);
            expect(caught.code).toBe('CONFLICT');
            expect(caught.status).toBe(409);
          });
        }
      }
    }

    it('rejects COMPLETED -> PROCESSING with 409', () => {
      let caught;
      try {
        assertValidTransition('COMPLETED', 'PROCESSING');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect(caught.code).toBe('CONFLICT');
      expect(caught.status).toBe(409);
    });

    it('rejects unknown source status', () => {
      expect(() => assertValidTransition('BOGUS', 'PENDING')).toThrow(ApiError);
    });

    it('rejects unknown target status', () => {
      expect(() => assertValidTransition('PENDING', 'BOGUS')).toThrow(ApiError);
    });
  });

  describe('updatePaymentIntentStatus', () => {
    it('succeeds for a valid transition (PENDING -> PROCESSING)', async () => {
      const prisma = createMockPrisma('PENDING');
      const result = await updatePaymentIntentStatus(prisma, 'pi_test_1', 'PROCESSING');
      expect(result.status).toBe('PROCESSING');
      expect(prisma.store.status).toBe('PROCESSING');
    });

    it('throws CONFLICT/409 for COMPLETED -> PROCESSING', async () => {
      const prisma = createMockPrisma('COMPLETED');
      await expect(
        updatePaymentIntentStatus(prisma, 'pi_test_1', 'PROCESSING'),
      ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
      // Status must remain unchanged.
      expect(prisma.store.status).toBe('COMPLETED');
    });

    it('throws CONFLICT/409 for every invalid transition without mutating state', async () => {
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) {
          const isValid = (VALID_TRANSITIONS[from] || []).includes(to);
          if (isValid) continue;

          const prisma = createMockPrisma(from);
          await expect(
            updatePaymentIntentStatus(prisma, 'pi_test_1', to),
          ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
          expect(prisma.store.status).toBe(from);
        }
      }
    });

    it('succeeds for every valid transition', async () => {
      for (const from of ALL_STATUSES) {
        for (const to of VALID_TRANSITIONS[from] || []) {
          const prisma = createMockPrisma(from);
          const result = await updatePaymentIntentStatus(prisma, 'pi_test_1', to);
          expect(result.status).toBe(to);
          expect(prisma.store.status).toBe(to);
        }
      }
    });

    it('throws NOT_FOUND when the intent does not exist', async () => {
      const prisma = createMockPrisma('PENDING');
      await expect(
        updatePaymentIntentStatus(prisma, 'does_not_exist', 'PROCESSING'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    });

    it('rejects a concurrent race so exactly one update wins', async () => {
      const prisma = createMockPrisma('PENDING');

      // Two concurrent updates from PENDING. Only one may legally
      // transition PENDING -> PROCESSING; the other must be rejected
      // because by the time it re-reads state it is no longer PENDING.
      const results = await Promise.allSettled([
        updatePaymentIntentStatus(prisma, 'pi_test_1', 'PROCESSING'),
        updatePaymentIntentStatus(prisma, 'pi_test_1', 'PROCESSING'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ApiError);
      expect(rejected[0].reason.code).toBe('CONFLICT');
      expect(rejected[0].reason.status).toBe(409);
      expect(prisma.store.status).toBe('PROCESSING');
    });

    it('rejects a race between conflicting targets', async () => {
      const prisma = createMockPrisma('PENDING');

      const results = await Promise.allSettled([
        updatePaymentIntentStatus(prisma, 'pi_test_1', 'PROCESSING'),
        updatePaymentIntentStatus(prisma, 'pi_test_1', 'CANCELLED'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.code).toBe('CONFLICT');
      expect(rejected[0].reason.status).toBe(409);
    });
  });
});