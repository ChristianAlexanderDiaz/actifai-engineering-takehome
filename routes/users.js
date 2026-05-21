'use strict';

const express = require('express');
const db = require('../db');
const { parseId, parseMonth } = require('../validators');

const router = express.Router();

// GET /api/users/:id/metrics?month=YYYY-MM
// Returns total + average revenue + sale count for one agent in one month.
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const userId = parseId(req.params.id, 'id');
    const { start, end, label } = parseMonth(req.query.month);

    const userResult = await db.query(
      'SELECT id, name, role FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: `User ${userId} not found` });
    }
    const user = userResult.rows[0];

    const { rows } = await db.query(
      `SELECT
         COALESCE(SUM(amount), 0)::bigint        AS total_revenue,
         COALESCE(AVG(amount), 0)::numeric(12,2) AS avg_revenue,
         COUNT(*)::int                           AS sale_count,
         MIN(amount)                             AS min_sale,
         MAX(amount)                             AS max_sale
       FROM sales
       WHERE user_id = $1
         AND date >= $2
         AND date <  $3`,
      [userId, start, end]
    );

    res.json({
      user,
      month: label,
      ...rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
