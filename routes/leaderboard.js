'use strict';

const express = require('express');
const db = require('../db');
const {
  parseMonth,
  parseLeaderboardBy,
  parseLeaderboardMetric,
  parseLimit,
} = require('../validators');

const router = express.Router();

const METRIC_COLUMN = {
  total: 'total_revenue',
  average: 'avg_revenue',
  count: 'sale_count',
};

// GET /api/leaderboard?month=YYYY-MM&by=user|group&metric=total|average|count&limit=N
// Ranks users or groups by their performance in a given month.
// Uses RANK() so ties share the same rank (correct leaderboard semantics).
router.get('/', async (req, res, next) => {
  try {
    const { start, end, label } = parseMonth(req.query.month);
    const by = parseLeaderboardBy(req.query.by);
    const metric = parseLeaderboardMetric(req.query.metric);
    const limit = parseLimit(req.query.limit, 10, 100);

    const sortColumn = METRIC_COLUMN[metric];
    let sql;
    if (by === 'user') {
      sql = `
        SELECT
          u.id   AS user_id,
          u.name,
          u.role,
          COALESCE(SUM(s.amount), 0)::bigint        AS total_revenue,
          COALESCE(AVG(s.amount), 0)::numeric(12,2) AS avg_revenue,
          COUNT(s.id)::int                          AS sale_count,
          RANK() OVER (ORDER BY COALESCE(${sortColumnAgg(metric, 's.amount', 's.id')}, 0) DESC)::int AS rank
        FROM users u
        LEFT JOIN sales s
               ON s.user_id = u.id
              AND s.date >= $1
              AND s.date <  $2
        GROUP BY u.id
        ORDER BY rank ASC, u.id ASC
        LIMIT $3;
      `;
    } else {
      sql = `
        SELECT
          g.id   AS group_id,
          g.name,
          COALESCE(SUM(s.amount), 0)::bigint        AS total_revenue,
          COALESCE(AVG(s.amount), 0)::numeric(12,2) AS avg_revenue,
          COUNT(s.id)::int                          AS sale_count,
          COUNT(DISTINCT s.user_id)::int            AS active_agent_count,
          RANK() OVER (ORDER BY COALESCE(${sortColumnAgg(metric, 's.amount', 's.id')}, 0) DESC)::int AS rank
        FROM groups g
        LEFT JOIN user_groups ug ON ug.group_id = g.id
        LEFT JOIN sales s
               ON s.user_id = ug.user_id
              AND s.date >= $1
              AND s.date <  $2
        GROUP BY g.id
        ORDER BY rank ASC, g.id ASC
        LIMIT $3;
      `;
    }

    const { rows } = await db.query(sql, [start, end, limit]);
    res.json({
      month: label,
      by,
      metric,
      sort_column: sortColumn,
      leaderboard: rows,
    });
  } catch (err) {
    next(err);
  }
});

// Returns the SQL aggregate expression used for ordering, given the requested metric.
// Kept as a helper to avoid duplicating the SUM/AVG/COUNT logic in both branches.
function sortColumnAgg(metric, amountCol, idCol) {
  if (metric === 'total') return `SUM(${amountCol})`;
  if (metric === 'average') return `AVG(${amountCol})`;
  return `COUNT(${idCol})`;
}

module.exports = router;
