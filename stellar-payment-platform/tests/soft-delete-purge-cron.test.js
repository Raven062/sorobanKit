jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

const cron = require('node-cron');
const {
  runSoftDeletePurge,
  scheduleSoftDeletePurgeJob,
  SOFT_DELETE_RETENTION_DAYS,
} = require('../src/soft-delete-purge-cron');

describe('soft-delete-purge-cron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runSoftDeletePurge', () => {
    function buildPrismaMock({ expiredUsers = [], deletedCount = 2 } = {}) {
      const activityLog = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      const user = {
        findMany: jest.fn().mockResolvedValue(expiredUsers),
        deleteMany: jest.fn().mockResolvedValue({ count: deletedCount }),
      };
      const prisma = {
        user,
        activityLog,
        $transaction: jest.fn(async (fn) => fn(prisma)),
      };
      return prisma;
    }

    it('permanently deletes users soft-deleted before the retention window', async () => {
      const prisma = buildPrismaMock({ deletedCount: 2 });

      const purged = await runSoftDeletePurge(prisma);

      expect(purged).toBe(2);
      expect(prisma.user.deleteMany).toHaveBeenCalledTimes(1);

      const { where } = prisma.user.deleteMany.mock.calls[0][0];
      const cutoff = where.deletedAt.lt;
      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - SOFT_DELETE_RETENTION_DAYS);

      expect(cutoff).toBeInstanceOf(Date);
      expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(2000);
    });

    it('deletes activity logs for purged users inside the transaction before deleting users', async () => {
      const expiredUsers = [{ id: 'user-1' }, { id: 'user-2' }];
      const prisma = buildPrismaMock({ expiredUsers, deletedCount: 2 });

      const purged = await runSoftDeletePurge(prisma);

      expect(purged).toBe(2);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.activityLog.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.activityLog.deleteMany).toHaveBeenCalledWith({
        where: { userId: { in: ['user-1', 'user-2'] } },
      });

      const activityOrder = prisma.activityLog.deleteMany.mock.invocationCallOrder[0];
      const userOrder = prisma.user.deleteMany.mock.invocationCallOrder[0];
      expect(activityOrder).toBeLessThan(userOrder);
    });

    it('leaves no activity log rows for purged user IDs after purge', async () => {
      const expiredUsers = [{ id: 'user-1' }, { id: 'user-2' }];
      const prisma = buildPrismaMock({ expiredUsers, deletedCount: 2 });

      // Simulate a real store so we can assert on the post-purge state.
      const activityLogRows = [
        { id: 'log-1', userId: 'user-1' },
        { id: 'log-2', userId: 'user-2' },
        { id: 'log-3', userId: 'user-3' },
      ];
      prisma.activityLog.deleteMany.mockImplementation(async ({ where }) => {
        const ids = where.userId.in;
        const before = activityLogRows.length;
        for (let i = activityLogRows.length - 1; i >= 0; i -= 1) {
          if (ids.includes(activityLogRows[i].userId)) {
            activityLogRows.splice(i, 1);
          }
        }
        return { count: before - activityLogRows.length };
      });

      await runSoftDeletePurge(prisma);

      const purgedIds = expiredUsers.map((u) => u.id);
      const remaining = activityLogRows.filter((row) => purgedIds.includes(row.userId));
      expect(remaining).toHaveLength(0);
      expect(activityLogRows).toEqual([{ id: 'log-3', userId: 'user-3' }]);
    });
  });

  describe('scheduleSoftDeletePurgeJob', () => {
    it('registers a daily midnight cron job', () => {
      const prisma = {
        user: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
        activityLog: { deleteMany: jest.fn() },
        $transaction: jest.fn(async (fn) => fn(prisma)),
      };

      scheduleSoftDeletePurgeJob(prisma);

      expect(cron.schedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
    });

    it('purges expired rows and logs the result when the callback fires', async () => {
      let scheduledCallback;
      cron.schedule.mockImplementation((expr, cb) => {
        scheduledCallback = cb;
      });

      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
          deleteMany: jest.fn().mockResolvedValue({ count: 4 }),
        },
        activityLog: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        $transaction: jest.fn(async (fn) => fn(prisma)),
      };

      scheduleSoftDeletePurgeJob(prisma);
      await scheduledCallback();

      expect(prisma.user.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.activityLog.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('logs an error when the purge fails', async () => {
      let scheduledCallback;
      cron.schedule.mockImplementation((expr, cb) => {
        scheduledCallback = cb;
      });

      const prisma = {
        user: {
          findMany: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
          deleteMany: jest.fn().mockRejectedValue(new Error('db down')),
        },
        activityLog: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        $transaction: jest.fn(async (fn) => fn(prisma)),
      };

      scheduleSoftDeletePurgeJob(prisma);
      await scheduledCallback();
    });
  });
});
