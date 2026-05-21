'use strict';

const request = require('supertest');
const { buildApp } = require('../server');
const db = require('../db');

const app = buildApp();

afterAll(async () => {
  await db.end();
});

describe('GET /api/sales/timeseries', () => {
  test('returns monthly buckets with default metrics for the full dataset', async () => {
    const res = await request(app)
      .get('/api/sales/timeseries')
      .query({ interval: 'month' });

    expect(res.status).toBe(200);
    expect(res.body.interval).toBe('month');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const row = res.body.data[0];
    expect(row).toHaveProperty('window_start');
    expect(row).toHaveProperty('total_revenue');
    expect(row).toHaveProperty('avg_revenue');
    expect(row).toHaveProperty('sale_count');
    expect(Number(row.total_revenue)).toBeGreaterThan(0);
  });

  test('filters by userId and respects start/end window', async () => {
    const res = await request(app)
      .get('/api/sales/timeseries')
      .query({
        interval: 'month',
        start: '2021-01-01',
        end: '2021-04-01',
        userId: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.filters.userId).toBe(1);
    // Three months in the window (Jan, Feb, Mar), but user 1 may not have sold in all of them.
    expect(res.body.data.length).toBeLessThanOrEqual(3);
    for (const row of res.body.data) {
      expect(row.window_start >= '2021-01-01').toBe(true);
      expect(row.window_start <  '2021-04-01').toBe(true);
    }
  });

  test('returns 400 for an unknown interval', async () => {
    const res = await request(app)
      .get('/api/sales/timeseries')
      .query({ interval: 'fortnight' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/interval/);
  });

  test('returns 400 for an unknown metric', async () => {
    const res = await request(app)
      .get('/api/sales/timeseries')
      .query({ metrics: 'total,median' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/median/);
  });
});
