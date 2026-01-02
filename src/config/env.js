const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function optionalEnv(name, defaultValue) {
  const value = process.env[name];
  return value === undefined ? defaultValue : value;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  dbSsl: (process.env.DB_SSL || 'false').toLowerCase() === 'true',
  azure: {
    accountName: optionalEnv('AZURE_STORAGE_ACCOUNT'),
    accountKey: optionalEnv('AZURE_STORAGE_KEY'),
    containerName: optionalEnv('AZURE_BLOB_CONTAINER', 'music'),
    sasTtlMinutes: parseInt(optionalEnv('SAS_TTL_MINUTES', '10'), 10),
  },
  corsOrigins: (optionalEnv('CORS_ORIGINS', '*') || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

module.exports = config;
