const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');

const sslConfig = (() => {
  if (!config.dbSsl) return false;
  if (!config.dbCaCertPath) return { rejectUnauthorized: false };
  
  const certPath = path.isAbsolute(config.dbCaCertPath)
    ? config.dbCaCertPath
    : path.resolve(process.cwd(), config.dbCaCertPath);
  
  return {
    ca: fs.readFileSync(certPath).toString(),
    rejectUnauthorized: false,
  };
})();

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: sslConfig,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error', err);
});

async function healthCheck() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  healthCheck,
};
