'use strict';

const express = require('express');
const db = require('../db');
const {
  parseId,
  parseDate,
  parseInterval,
  parseMetrics,
} = require('../validators');

const router = express.Router();

const METRIC_SQL = {
  total: 'COALESCE(SUM(amount), 0)::bigint AS total_revenue',
  average: 'COALESCE(AVG(amount), 0)::numeric(12,2) AS avg_revenue',
  count: 'COUNT(*)::int AS sale_count',
  min: 'MIN(amount) AS min_sale',
  max: 'MAX(amount) AS max_sale',
};

// GET /api/sales/timeseries
//   ?start=YYYY-MM-DD     optional, inclusive
//   &end=YYYY-MM-DD       optional, exclusive
//   &interval=day|week|month   default: month
//   &userId=<int>         optional, filter to one agent
//   &groupId=<int>        optional, filter to agents in one group
//   &metrics=total,average,count,min,max   default: total,average,count
router.get('/timeseries', async (req, res, next) => {
  try {
    const interval = parseInterval(req.query.interval);
    const metrics = parseMetrics(req.query.metrics);
    const start = req.query.start ? parseDate(req.query.start, 'start') : null;
    const end = req.query.end ? parseDate(req.query.end, 'end') : null;
    const userId = req.query.userId ? parseId(req.query.userId, 'userId') : null;
    const groupId = req.query.groupId ? parseId(req.query.groupId, 'groupId') : null;

    const conditions = [];
    const params = [];
    let p = 1;

    if (start) { conditions.push(`date >= $${p++}`); params.push(start); }
    if (end)   { conditions.push(`date <  $${p++}`); params.push(end); }
    if (userId) { conditions.push(`user_id = $${p++}`); params.push(userId); }
    if (groupId) {
      conditions.push(`user_id IN (SELECT user_id FROM user_groups WHERE group_id = $${p++})`);
      params.push(groupId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const selectedMetrics = metrics.map((m) => METRIC_SQL[m]).join(', ');

    // to_char emits a clean "YYYY-MM-DD" string. Without it, pg's node client returns
    // a JS Date object that JSON-serializes as a full ISO timestamp, which the frontend
    // would then have to slice. Cleaner to format here.
    const sql = `
      SELECT
        to_char(date_trunc('${interval}', date), 'YYYY-MM-DD') AS window_start,
        ${selectedMetrics}
      FROM sales
      ${where}
      GROUP BY date_trunc('${interval}', date)
      ORDER BY date_trunc('${interval}', date) ASC;
    `;

    const { rows } = await db.query(sql, params);
    res.json({
      interval,
      filters: { start, end, userId, groupId },
      data: rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
