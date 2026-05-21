'use strict';

const express = require('express');
const seeder = require('./seed');
const salesRoutes = require('./routes/sales');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const leaderboardRoutes = require('./routes/leaderboard');
const { errorHandler } = require('./validators');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

function buildApp() {
  const app = express();

  app.get('/health', (_req, res) => res.send('Hello World'));

  app.use('/api/sales', salesRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);

  app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
  app.use(errorHandler);

  return app;
}

async function start() {
  await seeder.seedDatabase();
  const app = buildApp();
  app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { buildApp };
