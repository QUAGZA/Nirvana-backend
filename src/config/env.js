const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function optionalEnv(name, defaultValue) {
  const value = process.env[name];
  return value === undefined ? defaultValue : value;
}

// Generate a random JWT secret if not provided (warns on startup)
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set in .env — using a random secret. Tokens will not persist across restarts.');
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigins: (optionalEnv('CORS_ORIGINS', '*') || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  appPassword: process.env.APP_PASSWORD || 'password',
  jwtSecret,
  albumsDir: process.env.ALBUMS_DIR || path.resolve('Albums'),
  tunnelMode: parseInt(process.env.TUNNEL_MODE || '0', 10), // 0 = none, 1 = ngrok, 2 = cloudflare
};

module.exports = config;
