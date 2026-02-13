const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');

const router = Router();

// ── POST /api/history ───────────────────────────────────────────────
// Record a play event
router.post('/api/history', async (req, res) => {
  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: 'track_id is required' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO play_history (track_id) VALUES ($1) RETURNING *',
      [track_id],
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Failed to record play', err);
    return res.status(500).json({ error: 'Unable to record play' });
  }
});

// ── GET /api/history/recent?limit=<n> ───────────────────────────────
router.get('/api/history/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (tr.id)
             ph.played_at,
             tr.id, tr.title, tr.track_number, tr.duration,
             al.id AS album_id, al.title AS album_title, al.cover_blob_path,
             ar.name AS artist
      FROM play_history ph
      JOIN tracks tr ON tr.id = ph.track_id
      JOIN albums al ON al.id = tr.album_id
      JOIN artists ar ON ar.id = al.artist_id
      ORDER BY tr.id, ph.played_at DESC
    `);

    // Re-sort by most recent play
    rows.sort((a, b) => new Date(b.played_at) - new Date(a.played_at));
    const limited = rows.slice(0, limit);

    const coverPaths = new Set(limited.filter((r) => r.cover_blob_path).map((r) => r.cover_blob_path));
    const coverMap = new Map();
    await Promise.all(
      [...coverPaths].map(async (p) => {
        try { coverMap.set(p, await getStreamingSasUrl(p)); } catch { /* skip */ }
      }),
    );

    const tracks = limited.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      album: r.album_title,
      album_id: r.album_id,
      track_number: r.track_number,
      duration: r.duration,
      cover_url: coverMap.get(r.cover_blob_path) || null,
      played_at: r.played_at,
    }));

    return res.json(tracks);
  } catch (err) {
    console.error('Failed to fetch history', err);
    return res.status(500).json({ error: 'Unable to load history' });
  }
});

// ── GET /api/history/top?limit=<n> ──────────────────────────────────
// Most played tracks
router.get('/api/history/top', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  try {
    const { rows } = await pool.query(`
      SELECT tr.id, tr.title, tr.track_number, tr.duration,
             al.id AS album_id, al.title AS album_title, al.cover_blob_path,
             ar.name AS artist,
             COUNT(ph.id)::int AS play_count
      FROM play_history ph
      JOIN tracks tr ON tr.id = ph.track_id
      JOIN albums al ON al.id = tr.album_id
      JOIN artists ar ON ar.id = al.artist_id
      GROUP BY tr.id, tr.title, tr.track_number, tr.duration,
               al.id, al.title, al.cover_blob_path, ar.name
      ORDER BY play_count DESC
      LIMIT $1
    `, [limit]);

    const coverPaths = new Set(rows.filter((r) => r.cover_blob_path).map((r) => r.cover_blob_path));
    const coverMap = new Map();
    await Promise.all(
      [...coverPaths].map(async (p) => {
        try { coverMap.set(p, await getStreamingSasUrl(p)); } catch { /* skip */ }
      }),
    );

    const tracks = rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      album: r.album_title,
      album_id: r.album_id,
      track_number: r.track_number,
      duration: r.duration,
      cover_url: coverMap.get(r.cover_blob_path) || null,
      play_count: r.play_count,
    }));

    return res.json(tracks);
  } catch (err) {
    console.error('Failed to fetch top tracks', err);
    return res.status(500).json({ error: 'Unable to load top tracks' });
  }
});

module.exports = router;
