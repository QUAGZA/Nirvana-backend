const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');

const router = Router();

// ── GET /api/artists ────────────────────────────────────────────────
router.get('/api/artists', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ar.id, ar.name,
             COUNT(DISTINCT al.id)::int AS album_count,
             COUNT(DISTINCT tr.id)::int AS track_count
      FROM artists ar
      LEFT JOIN albums al ON al.artist_id = ar.id
      LEFT JOIN tracks tr ON tr.album_id = al.id
      GROUP BY ar.id
      ORDER BY ar.name ASC
    `);
    return res.json(rows);
  } catch (err) {
    console.error('Failed to list artists', err);
    return res.status(500).json({ error: 'Unable to load artists' });
  }
});

// ── GET /api/artists/:id ────────────────────────────────────────────
router.get('/api/artists/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const artistRes = await pool.query('SELECT id, name FROM artists WHERE id = $1', [id]);
    if (artistRes.rows.length === 0) return res.status(404).json({ error: 'Artist not found' });
    const artist = artistRes.rows[0];

    const { rows: albumRows } = await pool.query(`
      SELECT al.id, al.title, al.year, al.cover_blob_path,
             COUNT(tr.id)::int AS track_count
      FROM albums al
      LEFT JOIN tracks tr ON tr.album_id = al.id
      WHERE al.artist_id = $1
      GROUP BY al.id
      ORDER BY al.year DESC NULLS LAST, al.title ASC
    `, [id]);

    const coverPaths = new Set(albumRows.filter((r) => r.cover_blob_path).map((r) => r.cover_blob_path));
    const coverMap = new Map();
    await Promise.all(
      [...coverPaths].map(async (p) => {
        try { coverMap.set(p, await getStreamingSasUrl(p)); } catch { /* skip */ }
      }),
    );

    return res.json({
      ...artist,
      albums: albumRows.map((r) => ({
        id: r.id,
        title: r.title,
        year: r.year,
        track_count: r.track_count,
        cover_url: coverMap.get(r.cover_blob_path) || null,
      })),
    });
  } catch (err) {
    console.error('Failed to get artist', err);
    return res.status(500).json({ error: 'Unable to load artist' });
  }
});

// ── GET /api/albums/:id ─────────────────────────────────────────────
router.get('/api/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const albumRes = await pool.query(`
      SELECT al.id, al.title, al.year, al.cover_blob_path, ar.id AS artist_id, ar.name AS artist
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      WHERE al.id = $1
    `, [id]);

    if (albumRes.rows.length === 0) return res.status(404).json({ error: 'Album not found' });
    const album = albumRes.rows[0];

    const { rows: trackRows } = await pool.query(`
      SELECT id, title, track_number, duration
      FROM tracks
      WHERE album_id = $1
      ORDER BY track_number NULLS LAST, title ASC
    `, [id]);

    let cover_url = null;
    if (album.cover_blob_path) {
      try { cover_url = await getStreamingSasUrl(album.cover_blob_path); } catch { /* skip */ }
    }

    return res.json({
      id: album.id,
      title: album.title,
      artist: album.artist,
      artist_id: album.artist_id,
      year: album.year,
      cover_url,
      tracks: trackRows.map((r) => ({
        id: r.id,
        title: r.title,
        track_number: r.track_number,
        duration: r.duration,
      })),
    });
  } catch (err) {
    console.error('Failed to get album', err);
    return res.status(500).json({ error: 'Unable to load album' });
  }
});

// ── GET /api/albums ─────────────────────────────────────────────────
router.get('/api/albums', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT al.id, al.title, al.year, al.cover_blob_path,
             ar.name AS artist,
             COUNT(tr.id)::int AS track_count
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      LEFT JOIN tracks tr ON tr.album_id = al.id
      GROUP BY al.id, ar.name
      ORDER BY al.year DESC NULLS LAST, al.title ASC
    `);

    const coverPaths = new Set(rows.filter((r) => r.cover_blob_path).map((r) => r.cover_blob_path));
    const coverMap = new Map();
    await Promise.all(
      [...coverPaths].map(async (p) => {
        try { coverMap.set(p, await getStreamingSasUrl(p)); } catch { /* skip */ }
      }),
    );

    return res.json(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        year: r.year,
        track_count: r.track_count,
        cover_url: coverMap.get(r.cover_blob_path) || null,
      })),
    );
  } catch (err) {
    console.error('Failed to list albums', err);
    return res.status(500).json({ error: 'Unable to load albums' });
  }
});

module.exports = router;
