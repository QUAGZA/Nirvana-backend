#!/usr/bin/env node
'use strict';

const path = require('path');
const mm = require('music-metadata');
const { hideBin } = require('yargs/helpers');
const yargs = require('yargs/yargs');
const { pool } = require('../src/db');
const { getContainerClient, getBlobClient } = require('../src/services/blobService');

const argv = yargs(hideBin(process.argv))
  .option('dry-run', {
    alias: 'd',
    type: 'boolean',
    default: false,
    describe: 'Run without writing to the database',
  })
  .strict()
  .help()
  .parse();

function folderOf(blobPath) {
  const dir = path.posix.dirname(blobPath);
  return dir === '.' ? '' : dir;
}

function baseNameNoExt(blobPath) {
  return path.posix.basename(blobPath, path.posix.extname(blobPath));
}

function inferTrackNumber(blobPath, tags) {
  if (tags?.common?.track?.no) return tags.common.track.no;
  const base = path.posix.basename(blobPath);
  const match = base.match(/^(\d{1,3})/);
  return match ? parseInt(match[1], 10) : null;
}

function parseArtistTitleFromFilename(blobPath) {
  const raw = baseNameNoExt(blobPath);
  const parts = raw.split(' - ');
  if (parts.length >= 2) {
    const artist = parts.shift();
    const title = parts.join(' - ');
    return { artist: artist.trim(), title: title.trim() };
  }
  return null;
}

function inferTitle(blobPath, tags) {
  if (tags?.common?.title) return tags.common.title;
  const parsed = parseArtistTitleFromFilename(blobPath);
  if (parsed?.title) return parsed.title;
  const raw = baseNameNoExt(blobPath);
  return raw.replace(/^\d+[\s._-]*/, '') || raw;
}

function inferArtist(tags, blobPath, fallbackFolder) {
  if (tags?.common?.artist || tags?.common?.albumartist) {
    return tags.common.artist || tags.common.albumartist;
  }
  const parsed = parseArtistTitleFromFilename(blobPath);
  if (parsed?.artist) return parsed.artist;
  if (fallbackFolder) return fallbackFolder;
  return 'Unknown Artist';
}

function inferAlbum(tags, blobPath, fallbackFolder) {
  if (tags?.common?.album) return tags.common.album;
  if (fallbackFolder) return fallbackFolder;
  const parsed = parseArtistTitleFromFilename(blobPath);
  if (parsed?.title) return parsed.title; // album = track name for singles
  return 'Unknown Album';
}

function inferYear(tags) {
  if (tags?.common?.year) return tags.common.year;
  if (tags?.common?.date) {
    const year = Number(String(tags.common.date).slice(0, 4));
    return Number.isFinite(year) ? year : null;
  }
  return null;
}

async function readFlacTags(blobPath) {
  const blobClient = getBlobClient(blobPath);
  const download = await blobClient.download(0, 512 * 1024);
  const metadata = await mm.parseStream(download.readableStreamBody, null, {
    duration: true,
    skipCovers: true,
  });
  return metadata;
}

async function collectCovers(containerClient) {
  const covers = new Map();
  for await (const item of containerClient.listBlobsFlat()) {
    const ext = path.posix.extname(item.name).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;
    const base = baseNameNoExt(item.name).toLowerCase();
    if (base === 'cover') {
      covers.set(folderOf(item.name), item.name);
    }
  }
  return covers;
}

async function insertArtist(client, name) {
  const { rows } = await client.query(
    `INSERT INTO artists (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name],
  );
  return rows[0].id;
}

async function insertAlbum(client, artistId, title, year, coverBlobPath) {
  const { rows } = await client.query(
    `INSERT INTO albums (artist_id, title, year, cover_blob_path)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (artist_id, title, year)
     DO UPDATE SET cover_blob_path = COALESCE(albums.cover_blob_path, EXCLUDED.cover_blob_path)
     RETURNING id, cover_blob_path`,
    [artistId, title, year, coverBlobPath],
  );
  return rows[0].id;
}

async function insertTrack(client, albumId, title, trackNumber, duration, blobPath) {
  const { rows } = await client.query(
    `INSERT INTO tracks (album_id, title, track_number, duration, blob_path)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (blob_path) DO NOTHING
     RETURNING id`,
    [albumId, title, trackNumber, duration, blobPath],
  );
  return rows[0]?.id;
}

async function ingest() {
  const dryRun = argv['dry-run'];
  const containerClient = getContainerClient();
  const covers = await collectCovers(containerClient);

  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;

  try {
    for await (const item of containerClient.listBlobsFlat()) {
      if (!item.name.toLowerCase().endsWith('.flac')) continue;

      const folder = folderOf(item.name);
      let tags;
      try {
        tags = await readFlacTags(item.name);
      } catch (err) {
        console.warn(`[WARN] Failed to read tags for ${item.name}: ${err.message}`);
      }

      const artist = inferArtist(tags, item.name, folder);
      const album = inferAlbum(tags, item.name, folder);
      const title = inferTitle(item.name, tags);
      const trackNumber = inferTrackNumber(item.name, tags);
      const year = inferYear(tags);
      const duration = tags?.format?.duration ? Math.round(tags.format.duration) : null;
      const coverBlobPath = covers.get(folder) || null;

      if (dryRun) {
        console.log(`[DRY-RUN] ${item.name} -> artist="${artist}" album="${album}" track="${title}" #${trackNumber || '?'} cover=${coverBlobPath || 'none'}`);
        continue;
      }

      try {
        await client.query('BEGIN');
        const artistId = await insertArtist(client, artist);
        const albumId = await insertAlbum(client, artistId, album, year, coverBlobPath);
        const trackId = await insertTrack(client, albumId, title, trackNumber, duration, item.name);
        await client.query('COMMIT');

        if (trackId) {
          inserted += 1;
          console.log(`[INSERT] ${item.name} -> track_id=${trackId}`);
        } else {
          skipped += 1;
          console.log(`[SKIP] ${item.name} already ingested`);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[ERROR] Failed ingest for ${item.name}: ${err.message}`);
      }
    }
  } finally {
    client.release();
  }

  console.log(`Ingestion complete. Inserted: ${inserted}, Skipped: ${skipped}`);
}

ingest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
