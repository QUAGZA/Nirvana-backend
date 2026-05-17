const fs = require('fs/promises');
const path = require('path');
const mm = require('music-metadata');
const config = require('../config/env');

const ALBUMS_DIR = config.albumsDir;
let libraryCache = { albums: [] };

async function scanLibrary() {
  const newAlbums = [];
  try {
    const folders = await fs.readdir(ALBUMS_DIR);
    let albumIdCounter = 1;
    let trackIdCounter = 1;

    for (const folder of folders) {
      const folderPath = path.join(ALBUMS_DIR, folder);
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) continue;

      let artist = 'Unknown Artist';
      let title = folder;
      if (folder.includes(' - ')) {
        const parts = folder.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }

      const files = await fs.readdir(folderPath);
      const tracks = [];
      let coverUrl = null;

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        const fileStat = await fs.stat(filePath);
        if (!fileStat.isFile()) continue;

        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          // Serve covers via static route or api
          if (file.toLowerCase() === 'cover.jpg' || file.toLowerCase() === 'cover.png' || !coverUrl) {
            coverUrl = `/api/local/covers/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
          }
        } else if (['.flac', '.mp3', '.m4a', '.wav'].includes(ext)) {
          try {
            const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: true });
            tracks.push({
              id: String(trackIdCounter++),
              title: metadata.common.title || path.basename(file, ext).replace(/^\d+[\s.-]*/, '').trim() || file,
              artist: metadata.common.artist || artist,
              track_number: metadata.common.track.no || tracks.length + 1,
              duration: metadata.format.duration ? Math.round(metadata.format.duration) : 0,
              filePath,
              url: `/api/local/stream?path=${encodeURIComponent(filePath)}`,
            });
          } catch (err) {
            console.warn(`Could not parse metadata for ${file}`, err.message);
          }
        }
      }

      tracks.sort((a, b) => a.track_number - b.track_number);

      newAlbums.push({
        id: String(albumIdCounter++),
        title,
        artist,
        year: new Date().getFullYear(),
        coverUrl: coverUrl || '', // Fallback if no cover
        folderPath,
        tracks,
      });
    }

    libraryCache = { albums: newAlbums };
    console.log(`Scanned ${newAlbums.length} albums from local folder.`);
  } catch (err) {
    console.error('Failed to scan library:', err);
  }
}

function getAlbums() {
  return libraryCache.albums;
}

module.exports = {
  scanLibrary,
  getAlbums,
};
