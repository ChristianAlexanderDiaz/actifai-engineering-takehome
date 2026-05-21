'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'pass',
  database: process.env.DB_NAME || 'actifai',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  end: () => pool.end(),
};
