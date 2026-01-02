const { Router } = require('express');
const { healthCheck } = require('../db');

const router = Router();

router.get('/health', async (req, res) => {
  try {
    await healthCheck();
    res.status(200).json({ status: 'ok', db: 'up' });
  } catch (err) {
    console.error('Health check failed', err);
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

module.exports = router;
