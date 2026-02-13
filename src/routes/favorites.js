const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');

const router = Router();

// ── GET /api/favorites ──────────────────────────────────────────────
router.get('/api/favorites', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id AS fav_id, f.created_at AS liked_at,
             tr.id, tr.title, tr.track_number, tr.duration,
             al.id AS album_id, al.title AS album_title, al.cover_blob_path,
             ar.name AS artist
      FROM favorites f
      JOIN tracks tr ON tr.id = f.track_id
      JOIN albums al ON al.id = tr.album_id
      JOIN artists ar ON ar.id = al.artist_id
      ORDER BY f.created_at DESC
    `);

    const coverPaths = new Set(rows.filter((r) => r.cover_blob_path).map((r) => r.cover_blob_path));
    const coverMap = new Map();
    await Promise.all(
      [...coverPaths].map(async (p) => {
        try { coverMap.set(p, await getStreamingSasUrl(p)); } catch { /* skip */ }
      }),
    );

    const favorites = rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      album: r.album_title,
      album_id: r.album_id,
      track_number: r.track_number,
      duration: r.duration,
      cover_url: coverMap.get(r.cover_blob_path) || null,
      liked_at: r.liked_at,
    }));

    return res.json(favorites);
  } catch (err) {
    console.error('Failed to list favorites', err);
    return res.status(500).json({ error: 'Unable to load favorites' });
  }
});

// ── POST /api/favorites ─────────────────────────────────────────────
router.post('/api/favorites', async (req, res) => {
  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: 'track_id is required' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO favorites (track_id) VALUES ($1) ON CONFLICT (track_id) DO NOTHING RETURNING *',
      [track_id],
    );
    return res.status(201).json(rows[0] || { track_id, already_liked: true });
  } catch (err) {
    console.error('Failed to add favorite', err);
    return res.status(500).json({ error: 'Unable to add favorite' });
  }
});

// ── DELETE /api/favorites/:trackId ──────────────────────────────────
router.delete('/api/favorites/:trackId', async (req, res) => {
  try {
    await pool.query('DELETE FROM favorites WHERE track_id = $1', [req.params.trackId]);
    return res.status(204).end();
  } catch (err) {
    console.error('Failed to remove favorite', err);
    return res.status(500).json({ error: 'Unable to remove favorite' });
  }
});

module.exports = router;
