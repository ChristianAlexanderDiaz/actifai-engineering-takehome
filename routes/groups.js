'use strict';

const express = require('express');
const db = require('../db');
const { parseId, parseMonth } = require('../validators');

const router = express.Router();

// GET /api/groups/:id/metrics?month=YYYY-MM
// Returns total + average revenue + sale count for one team in one month.
// "avg_revenue" here is the average sale size across all sales by members of this group,
// not the per-agent average. That's a different (and also useful) question we could add later.
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const groupId = parseId(req.params.id, 'id');
    const { start, end, label } = parseMonth(req.query.month);

    const groupResult = await db.query(
      'SELECT id, name FROM groups WHERE id = $1',
      [groupId]
    );
    if (groupResult.rowCount === 0) {
      return res.status(404).json({ error: `Group ${groupId} not found` });
    }
    const group = groupResult.rows[0];

    const { rows } = await db.query(
      `SELECT
         COALESCE(SUM(s.amount), 0)::bigint        AS total_revenue,
         COALESCE(AVG(s.amount), 0)::numeric(12,2) AS avg_revenue,
         COUNT(*)::int                             AS sale_count,
         COUNT(DISTINCT s.user_id)::int            AS active_agent_count
       FROM sales s
       JOIN user_groups ug ON ug.user_id = s.user_id
       WHERE ug.group_id = $1
         AND s.date >= $2
         AND s.date <  $3`,
      [groupId, start, end]
    );

    res.json({
      group,
      month: label,
      ...rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
