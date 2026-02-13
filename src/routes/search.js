const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');

const router = Router();

// ── GET /api/search?q=<query> ──────────────────────────────────────
router.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.json({ artists: [], albums: [], tracks: [] });
  }

  const pattern = `%${q.trim()}%`;

  try {
    const [artistRes, albumRes, trackRes] = await Promise.all([
      pool.query(
        `SELECT id, name FROM artists WHERE name ILIKE $1 ORDER BY name LIMIT 20`,
        [pattern],
      ),
      pool.query(
        `SELECT al.id, al.title, al.year, al.cover_blob_path, ar.name AS artist
         FROM albums al
         JOIN artists ar ON ar.id = al.artist_id
         WHERE al.title ILIKE $1 OR ar.name ILIKE $1
         ORDER BY al.title LIMIT 20`,
        [pattern],
      ),
      pool.query(
        `SELECT tr.id, tr.title, tr.track_number, tr.duration, tr.blob_path,
                al.id AS album_id, al.title AS album_title, al.cover_blob_path,
                ar.name AS artist
         FROM tracks tr
         JOIN albums al ON al.id = tr.album_id
         JOIN artists ar ON ar.id = al.artist_id
         WHERE tr.title ILIKE $1 OR al.title ILIKE $1 OR ar.name ILIKE $1
         ORDER BY tr.title LIMIT 30`,
        [pattern],
      ),
    ]);

    // Attach cover SAS URLs
    const coverPaths = new Set();
    for (const row of [...albumRes.rows, ...trackRes.rows]) {
      if (row.cover_blob_path) coverPaths.add(row.cover_blob_path);
    }
    const coverMap = new Map();
    await Promise.all(
      [...coverPaths].map(async (p) => {
        try { coverMap.set(p, await getStreamingSasUrl(p)); } catch { /* skip */ }
      }),
    );

    const artists = artistRes.rows.map((r) => ({ id: r.id, name: r.name }));

    const albums = albumRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      year: r.year,
      cover_url: coverMap.get(r.cover_blob_path) || null,
    }));

    const tracks = trackRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      album: r.album_title,
      album_id: r.album_id,
      track_number: r.track_number,
      duration: r.duration,
      cover_url: coverMap.get(r.cover_blob_path) || null,
    }));

    return res.json({ artists, albums, tracks });
  } catch (err) {
    console.error('Search failed', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
