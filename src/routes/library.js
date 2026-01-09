const { Router } = require('express');
const { pool } = require('../db');
const { getStreamingSasUrl } = require('../services/sasService');

const router = Router();

function normalizeArtist(rawName) {
  if (!rawName) {
    return { key: '', display: '' };
  }
  const trimmed = rawName.trim();
  const withoutIndex = trimmed.replace(/^\d+\s*/, '');
  const display = withoutIndex || trimmed;
  return { key: display.toLowerCase(), display };
}

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
    const albumMaps = new Map();

    for (const row of rows) {
      const { key: artistKey, display } = normalizeArtist(row.artist_name);
      let artist = artistMap.get(artistKey);
      if (!artist) {
        artist = { artist_id: row.artist_id, artist: display || row.artist_name, albums: [] };
        artistMap.set(artistKey, artist);
        albumMaps.set(artistKey, new Map());
        artists.push(artist);
      }

      const albumMap = albumMaps.get(artistKey);
      const albumKey = row.album_id;
      let album = albumMap.get(albumKey);
      if (!album) {
        album = {
          id: row.album_id,
          title: row.album_title,
          year: row.album_year,
          cover_blob_path: row.cover_blob_path,
          cover_url: null,
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

    // Attach short-lived SAS URLs for covers in parallel
    const coverPromises = Array.from(albumMaps.values())
      .flatMap((map) => Array.from(map.values()))
      .map(async (album) => {
        if (album.cover_blob_path) {
          album.cover_url = await getStreamingSasUrl(album.cover_blob_path);
        }
      });
    await Promise.all(coverPromises);

    return res.json(artists);
  } catch (err) {
    console.error('Failed to fetch library', err);
    return res.status(500).json({ error: 'Unable to load library' });
  }
});

module.exports = router;
