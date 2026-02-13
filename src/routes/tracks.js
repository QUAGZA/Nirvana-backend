const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');
const config = require('../config/env');

const router = Router();

/* ── GET /api/tracks ── list all tracks with full details ────────── */
router.get('/api/tracks', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.title,
        ar.name   AS artist,
        al.title  AS album,
        al.id     AS album_id,
        t.track_number,
        t.duration,
        al.cover_blob_path
      FROM tracks t
      JOIN albums al ON al.id = t.album_id
      JOIN artists ar ON ar.id = al.artist_id
      ORDER BY ar.name, al.title, t.track_number
    `);

    const tracks = await Promise.all(rows.map(async (r) => {
      let cover_url = null;
      if (r.cover_blob_path) {
        try { cover_url = await getStreamingSasUrl(r.cover_blob_path); } catch {}
      }
      return {
        id: r.id,
        title: r.title,
        artist: r.artist,
        album: r.album,
        album_id: r.album_id,
        track_number: r.track_number,
        duration: r.duration,
        cover_url,
      };
    }));

    res.json(tracks);
  } catch (err) {
    console.error('Failed to list tracks', err);
    res.status(500).json({ error: 'Unable to list tracks' });
  }
});

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
