'use strict';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const VALID_INTERVALS = ['day', 'week', 'month'];
const VALID_METRICS = ['total', 'average', 'count', 'min', 'max'];
const VALID_LEADERBOARD_BY = ['user', 'group'];
const VALID_LEADERBOARD_METRICS = ['total', 'average', 'count'];

function parseId(value, field = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`'${field}' must be a positive integer`);
  }
  return n;
}

function parseDate(value, field) {
  if (!value) throw new ValidationError(`'${field}' is required (YYYY-MM-DD)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`'${field}' must be YYYY-MM-DD`);
  }
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`'${field}' is not a valid date`);
  }
  return value;
}

// "2021-05" → { start: "2021-05-01", end: "2021-06-01" } (end exclusive)
function parseMonth(value) {
  if (!value) throw new ValidationError("'month' is required (YYYY-MM)");
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new ValidationError("'month' must be YYYY-MM");
  }
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) {
    throw new ValidationError("'month' must have month between 01 and 12");
  }
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end, label: value };
}

function parseInterval(value, fallback = 'month') {
  const v = (value || fallback).toLowerCase();
  if (!VALID_INTERVALS.includes(v)) {
    throw new ValidationError(`'interval' must be one of: ${VALID_INTERVALS.join(', ')}`);
  }
  return v;
}

function parseMetrics(value, fallback = ['total', 'average', 'count']) {
  if (!value) return fallback;
  const requested = value.split(',').map((s) => s.trim().toLowerCase());
  const invalid = requested.filter((m) => !VALID_METRICS.includes(m));
  if (invalid.length) {
    throw new ValidationError(
      `Unknown metrics: ${invalid.join(', ')}. Allowed: ${VALID_METRICS.join(', ')}`
    );
  }
  return [...new Set(requested)];
}

function parseLeaderboardBy(value, fallback = 'user') {
  const v = (value || fallback).toLowerCase();
  if (!VALID_LEADERBOARD_BY.includes(v)) {
    throw new ValidationError(`'by' must be one of: ${VALID_LEADERBOARD_BY.join(', ')}`);
  }
  return v;
}

function parseLeaderboardMetric(value, fallback = 'total') {
  const v = (value || fallback).toLowerCase();
  if (!VALID_LEADERBOARD_METRICS.includes(v)) {
    throw new ValidationError(`'metric' must be one of: ${VALID_LEADERBOARD_METRICS.join(', ')}`);
  }
  return v;
}

function parseLimit(value, fallback = 10, max = 100) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError("'limit' must be a positive integer");
  }
  if (n > max) {
    throw new ValidationError(`'limit' cannot exceed ${max}`);
  }
  return n;
}

// Express middleware: turn ValidationErrors into 400s, everything else into 500s.
function errorHandler(err, _req, res, _next) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Internal error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = {
  ValidationError,
  parseId,
  parseDate,
  parseMonth,
  parseInterval,
  parseMetrics,
  parseLeaderboardBy,
  parseLeaderboardMetric,
  parseLimit,
  errorHandler,
};
