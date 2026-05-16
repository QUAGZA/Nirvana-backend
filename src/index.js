const express = require('express');
const config = require('./config/env');
const corsMiddleware = require('./middleware/cors');
const requestLogger = require('./middleware/logger');
const localRouter = require('./routes/local');
const { scanLibrary } = require('./services/localLibraryService');
const ngrok = require('@ngrok/ngrok');

const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogger);

app.use(localRouter);

const start = async () => {
  try {
    await scanLibrary();
    console.log('Local library scanned successfully.');
  } catch (err) {
    console.error('Library scan failed', err);
  }

  app.listen(config.port, async () => {
    console.log(`Server listening on port ${config.port}`);
    
    // Start ngrok
    try {
      const listener = await ngrok.forward({ addr: config.port, authtoken_from_env: true });
      const url = listener.url();
      console.log(`\n======================================================\n`);
      console.log(`  Ngrok tunnel created!`);
      console.log(`  Your API is accessible at: ${url}`);
      console.log(`\n======================================================\n`);
    } catch (e) {
      console.log('Could not start ngrok. Make sure NGROK_AUTHTOKEN is in .env or run it manually.', e.message);
    }
  });
};

if (require.main === module) {
  start();
}

module.exports = app;
