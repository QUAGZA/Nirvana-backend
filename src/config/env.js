const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function optionalEnv(name, defaultValue) {
  const value = process.env[name];
  return value === undefined ? defaultValue : value;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigins: (optionalEnv('CORS_ORIGINS', '*') || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

module.exports = config;
