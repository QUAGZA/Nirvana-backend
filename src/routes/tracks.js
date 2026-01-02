const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');
const config = require('../config/env');

const router = Router();

router.get('/api/tracks/:id/stream', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT blob_path FROM tracks WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    const blobPath = rows[0].blob_path;
    const url = await getStreamingSasUrl(blobPath);
    return res.json({ stream_url: url, expires_in_seconds: config.azure.sasTtlMinutes * 60 });
  } catch (err) {
    console.error('Failed to stream track', err);
    return res.status(500).json({ error: 'Unable to generate stream URL' });
  }
});

module.exports = router;
