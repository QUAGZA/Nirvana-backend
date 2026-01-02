const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

router.get('/api/library', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ar.id AS artist_id,
        ar.name AS artist_name,
        al.id AS album_id,
        al.title AS album_title,
        al.year AS album_year,
        al.cover_blob_path,
        tr.id AS track_id,
        tr.title AS track_title,
        tr.track_number,
        tr.duration
      FROM artists ar
      JOIN albums al ON al.artist_id = ar.id
      JOIN tracks tr ON tr.album_id = al.id
      ORDER BY ar.name ASC, al.year NULLS LAST, al.title ASC, tr.track_number NULLS LAST, tr.title ASC;
    `);

    const artists = [];
    const artistMap = new Map();
    const albumMap = new Map();

    for (const row of rows) {
      let artist = artistMap.get(row.artist_id);
      if (!artist) {
        artist = { artist_id: row.artist_id, artist: row.artist_name, albums: [] };
        artistMap.set(row.artist_id, artist);
        artists.push(artist);
      }

      const albumKey = row.album_id;
      let album = albumMap.get(albumKey);
      if (!album) {
        album = {
          id: row.album_id,
          title: row.album_title,
          year: row.album_year,
          cover_blob_path: row.cover_blob_path,
          tracks: [],
        };
        albumMap.set(albumKey, album);
        artist.albums.push(album);
      }

      album.tracks.push({
        id: row.track_id,
        title: row.track_title,
        track_number: row.track_number,
        duration: row.duration,
      });
    }

    return res.json(artists);
  } catch (err) {
    console.error('Failed to fetch library', err);
    return res.status(500).json({ error: 'Unable to load library' });
  }
});

module.exports = router;
