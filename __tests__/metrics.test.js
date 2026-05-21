'use strict';

const request = require('supertest');
const { buildApp } = require('../server');
const db = require('../db');

const app = buildApp();

afterAll(async () => {
  await db.end();
});

describe('GET /api/users/:id/metrics', () => {
  test('returns total + avg + count for a real user in a real month', async () => {
    const res = await request(app)
      .get('/api/users/1/metrics')
      .query({ month: '2021-05' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 1, name: 'Alice' });
    expect(res.body.month).toBe('2021-05');
    expect(res.body).toHaveProperty('total_revenue');
    expect(res.body).toHaveProperty('avg_revenue');
    expect(res.body).toHaveProperty('sale_count');
    // sale_count is an int; total_revenue may come back as a string (pg bigint) — coerce.
    expect(Number(res.body.sale_count)).toBeGreaterThanOrEqual(0);
  });

  test('returns 404 for a nonexistent user', async () => {
    const res = await request(app)
      .get('/api/users/999/metrics')
      .query({ month: '2021-05' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('returns 400 for a malformed month', async () => {
    const res = await request(app)
      .get('/api/users/1/metrics')
      .query({ month: 'May 2021' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/month/);
  });
});

describe('GET /api/groups/:id/metrics', () => {
  test('returns aggregate totals for a real group', async () => {
    const res = await request(app)
      .get('/api/groups/1/metrics')
      .query({ month: '2021-05' });

    expect(res.status).toBe(200);
    expect(res.body.group).toMatchObject({ id: 1 });
    expect(res.body.month).toBe('2021-05');
    expect(res.body).toHaveProperty('total_revenue');
    expect(res.body).toHaveProperty('active_agent_count');
  });
});
