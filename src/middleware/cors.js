const cors = require('cors');
const config = require('../config/env');

function corsOptions() {
  const origins = config.corsOrigins;
  // Allow all if '*', otherwise only listed origins
  const allowAll = origins.length === 1 && origins[0] === '*';
  return {
    origin: allowAll ? true : origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false,
    maxAge: 86400,
  };
}

module.exports = cors(corsOptions());
