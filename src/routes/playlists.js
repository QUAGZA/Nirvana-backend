const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');

const router = Router();

// ── GET /api/playlists ──────────────────────────────────────────────
router.get('/api/playlists', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.description, p.cover_blob_path, p.created_at, p.updated_at,
             COUNT(pt.id)::int AS track_count,
             COALESCE(SUM(tr.duration), 0)::int AS total_duration
      FROM playlists p
      LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
      LEFT JOIN tracks tr ON tr.id = pt.track_id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `);

    const playlists = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        cover_url: r.cover_blob_path ? await getStreamingSasUrl(r.cover_blob_path).catch(() => null) : null,
        track_count: r.track_count,
        total_duration: r.total_duration,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    );

    return res.json(playlists);
  } catch (err) {
    console.error('Failed to list playlists', err);
    return res.status(500).json({ error: 'Unable to load playlists' });
  }
});

// ── GET /api/playlists/:id ──────────────────────────────────────────
router.get('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const playlistRes = await pool.query('SELECT * FROM playlists WHERE id = $1', [id]);
    if (playlistRes.rows.length === 0) return res.status(404).json({ error: 'Playlist not found' });

    const playlist = playlistRes.rows[0];
    const { rows: trackRows } = await pool.query(`
      SELECT pt.position, pt.added_at,
             tr.id, tr.title, tr.track_number, tr.duration, tr.blob_path,
             al.id AS album_id, al.title AS album_title, al.cover_blob_path,
             ar.name AS artist
      FROM playlist_tracks pt
      JOIN tracks tr ON tr.id = pt.track_id
      JOIN albums al ON al.id = tr.album_id
      JOIN artists ar ON ar.id = al.artist_id
      WHERE pt.playlist_id = $1
      ORDER BY pt.position ASC
    `, [id]);

    // Attach cover SAS URLs
    const coverPaths = new Set(trackRows.filter((r) => r.cover_blob_path).map((r) => r.cover_blob_path));
    const coverMap = new Map();
    await Promise.all(
      [...coverPaths].map(async (p) => {
        try { coverMap.set(p, await getStreamingSasUrl(p)); } catch { /* skip */ }
      }),
    );

    return res.json({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      cover_url: playlist.cover_blob_path ? await getStreamingSasUrl(playlist.cover_blob_path).catch(() => null) : null,
      created_at: playlist.created_at,
      updated_at: playlist.updated_at,
      tracks: trackRows.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        album: r.album_title,
        album_id: r.album_id,
        track_number: r.track_number,
        duration: r.duration,
        position: r.position,
        cover_url: coverMap.get(r.cover_blob_path) || null,
      })),
    });
  } catch (err) {
    console.error('Failed to get playlist', err);
    return res.status(500).json({ error: 'Unable to load playlist' });
  }
});

// ── POST /api/playlists ─────────────────────────────────────────────
router.post('/api/playlists', async (req, res) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO playlists (name, description) VALUES ($1, $2) RETURNING *',
      [name.trim(), description?.trim() || null],
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Failed to create playlist', err);
    return res.status(500).json({ error: 'Unable to create playlist' });
  }
});

// ── PUT /api/playlists/:id ──────────────────────────────────────────
router.put('/api/playlists/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE playlists SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = now()
       WHERE id = $3 RETURNING *`,
      [name?.trim() || null, description?.trim() || null, id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Playlist not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('Failed to update playlist', err);
    return res.status(500).json({ error: 'Unable to update playlist' });
  }
});

// ── DELETE /api/playlists/:id ───────────────────────────────────────
router.delete('/api/playlists/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM playlists WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Playlist not found' });
    return res.status(204).end();
  } catch (err) {
    console.error('Failed to delete playlist', err);
    return res.status(500).json({ error: 'Unable to delete playlist' });
  }
});

// ── POST /api/playlists/:id/tracks ──────────────────────────────────
router.post('/api/playlists/:id/tracks', async (req, res) => {
  const { id } = req.params;
  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: 'track_id is required' });

  try {
    // Get next position
    const posRes = await pool.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM playlist_tracks WHERE playlist_id = $1',
      [id],
    );
    const nextPos = posRes.rows[0].next_pos;

    await pool.query(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, track_id, nextPos],
    );

    await pool.query('UPDATE playlists SET updated_at = now() WHERE id = $1', [id]);

    return res.status(201).json({ message: 'Track added' });
  } catch (err) {
    console.error('Failed to add track to playlist', err);
    return res.status(500).json({ error: 'Unable to add track' });
  }
});

// ── DELETE /api/playlists/:id/tracks/:trackId ───────────────────────
router.delete('/api/playlists/:id/tracks/:trackId', async (req, res) => {
  const { id, trackId } = req.params;
  try {
    await pool.query(
      'DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
      [id, trackId],
    );
    await pool.query('UPDATE playlists SET updated_at = now() WHERE id = $1', [id]);
    return res.status(204).end();
  } catch (err) {
    console.error('Failed to remove track from playlist', err);
    return res.status(500).json({ error: 'Unable to remove track' });
  }
});

module.exports = router;
