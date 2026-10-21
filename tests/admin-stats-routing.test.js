const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

describe('admin stats routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups routing stats by month within a single year', async () => {
    db.query.mockResolvedValue({
      rows: [
        { bucket: '2025-01-01T00:00:00.000Z', count: '3' },
        { bucket: '2025-02-01T00:00:00.000Z', count: '5' },
      ],
    });

    const res = await request(app)
      .get('/api/admin/stats/routing')
      .query({ startDate: '2025-01-01', endDate: '2025-02-28', groupBy: 'month' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('groups routing stats by month across a year boundary', async () => {
    db.query.mockResolvedValue({
      rows: [
        { bucket: '2025-11-01T00:00:00.000Z', count: '2' },
        { bucket: '2025-12-01T00:00:00.000Z', count: '4' },
        { bucket: '2026-01-01T00:00:00.000Z', count: '1' },
        { bucket: '2026-02-01T00:00:00.000Z', count: '7' },
      ],
    });

    const res = await request(app)
      .get('/api/admin/stats/routing')
      .query({ startDate: '2025-11-01', endDate: '2026-02-28', groupBy: 'month' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);

    const months = res.body.map((row) => {
      const date = new Date(row.bucket);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });

    expect(months).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
