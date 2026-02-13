const express = require('express');
const config = require('./config/env');
const { pool } = require('./db');
const healthRouter = require('./routes/health');
const tracksRouter = require('./routes/tracks');
const libraryRouter = require('./routes/library');
const searchRouter = require('./routes/search');
const playlistsRouter = require('./routes/playlists');
const favoritesRouter = require('./routes/favorites');
const historyRouter = require('./routes/history');
const artistsAlbumsRouter = require('./routes/artists-albums');
const corsMiddleware = require('./middleware/cors');
const requestLogger = require('./middleware/logger');

const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogger);
app.use(healthRouter);
app.use(tracksRouter);
app.use(libraryRouter);
app.use(searchRouter);
app.use(playlistsRouter);
app.use(favoritesRouter);
app.use(historyRouter);
app.use(artistsAlbumsRouter);

const start = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('Database connection established');
  } catch (err) {
    console.error('Database connection failed', err);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
};

if (require.main === module) {
  start();
}

module.exports = app;
