const express = require('express');
const config = require('./config/env');
const corsMiddleware = require('./middleware/cors');
const requestLogger = require('./middleware/logger');
const localRouter = require('./routes/local');
const { scanLibrary } = require('./services/localLibraryService');

const app = express();

app.set('trust proxy', 1); // Trust the tunnel proxy so rate limiting works by real IP
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

app.use(localRouter);

// ─── Tunnel Providers ─────────────────────────────────────────
const TUNNEL_MODES = {
  0: { name: 'None (local only)', start: null },
  1: { name: 'ngrok', start: startNgrok },
  2: { name: 'Cloudflare Tunnel', start: startCloudflare },
};

async function startNgrok(port) {
  const ngrok = require('@ngrok/ngrok');
  const listener = await ngrok.forward({ addr: port, authtoken_from_env: true });
  return listener.url();
}

async function startCloudflare(port) {
  return new Promise((resolve, reject) => {
    const { tunnel } = require('cloudflared');
    const t = tunnel(['tunnel', '--url', `http://localhost:${port}`]);
    t.on('url', (url) => resolve(url));
    t.on('error', (err) => reject(err));
  });
}

async function startTunnel(port) {
  const mode = config.tunnelMode;
  const provider = TUNNEL_MODES[mode];

  if (!provider) {
    console.warn(`⚠️  Unknown TUNNEL_MODE=${mode}. Valid values: 0 (none), 1 (ngrok), 2 (cloudflare).`);
    return;
  }

  if (!provider.start) {
    console.log('📡 Tunnel: disabled (TUNNEL_MODE=0). Server is local-only.');
    return;
  }

  console.log(`📡 Tunnel: starting ${provider.name}...`);

  try {
    const url = await provider.start(port);
    console.log(`\n======================================================\n`);
    console.log(`  ${provider.name} tunnel created!`);
    console.log(`  Your API is accessible at: ${url}`);
    console.log(`\n======================================================\n`);
  } catch (e) {
    console.error(`❌ Could not start ${provider.name}:`, e.message);
    if (mode === 1) {
      console.log('   Make sure NGROK_AUTHTOKEN is set in .env');
    }
    if (mode === 2) {
      console.log('   Cloudflare Tunnel requires no auth for quick tunnels.');
      console.log('   Make sure you have internet connectivity.');
    }
  }
}

// ─── Server Start ─────────────────────────────────────────────
const start = async () => {
  try {
    await scanLibrary();
    console.log('Local library scanned successfully.');
  } catch (err) {
    console.error('Library scan failed', err);
  }

  app.listen(config.port, async () => {
    console.log(`Server listening on port ${config.port}`);
    await startTunnel(config.port);
  });
};

if (require.main === module) {
  start();
}

module.exports = app;
