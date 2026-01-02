#!/usr/bin/env node
'use strict';

const mm = require('music-metadata');
const { hideBin } = require('yargs/helpers');
const yargs = require('yargs/yargs');
const { pool } = require('../src/db');
const { getBlobClient, getContainerClient } = require('../src/services/blobService');

const argv = yargs(hideBin(process.argv))
  .option('limit', {
    alias: 'n',
    type: 'number',
    describe: 'Process at most N tracks with missing album cover',
  })
  .option('force', {
    alias: 'f',
    type: 'boolean',
    default: false,
    describe: 'Overwrite album cover even if already set',
  })
  .strict()
  .help()
  .parse();

function pickPicture(pictures) {
  if (!Array.isArray(pictures) || pictures.length === 0) return null;
  return pictures[0];
}

function pictureExt(mime) {
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

async function uploadArt(buffer, mime, blobPath) {
  const blobClient = getBlobClient(blobPath).getBlockBlobClient();
  await blobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mime },
  });
  return blobClient.url;
}

async function fetchEligibleTracks(limit, force) {
  const params = [force === true];
  let limitClause = '';
  if (limit && Number.isFinite(limit) && limit > 0) {
    params.push(limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT tr.id AS track_id, tr.blob_path, al.id AS album_id, al.cover_blob_path
     FROM tracks tr
     JOIN albums al ON tr.album_id = al.id
     WHERE ($1::boolean = TRUE OR al.cover_blob_path IS NULL)
     ORDER BY tr.id
     ${limitClause}`,
    params,
  );
  return rows;
}

async function downloadForMetadata(blobPath) {
  const blobClient = getBlobClient(blobPath);
  const download = await blobClient.download();
  const temp = await mm.parseStream(download.readableStreamBody, null, { duration: false, skipCovers: false });
  return temp.common.picture || [];
}

async function setAlbumCover(albumId, blobPath, force) {
  const query = force
    ? 'UPDATE albums SET cover_blob_path = $1 WHERE id = $2 RETURNING id'
    : 'UPDATE albums SET cover_blob_path = COALESCE(cover_blob_path, $1) WHERE id = $2 RETURNING id';
  const { rowCount } = await pool.query(query, [blobPath, albumId]);
  return rowCount > 0;
}

async function main() {
  const { limit, force } = argv;
  const containerClient = getContainerClient();
  await containerClient.exists(); // triggers auth check

  const tracks = await fetchEligibleTracks(limit, force);
  if (tracks.length === 0) {
    console.log('No tracks require embedded art extraction.');
    return;
  }

  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let noArt = 0;

  for (const row of tracks) {
    processed += 1;
    const blobPath = row.blob_path;
    const albumId = row.album_id;
    const artBlobPath = `embedded-art/${row.track_id}.jpg`;

    if (!force && row.cover_blob_path) {
      console.log(`[SKIP] album already has cover for track ${row.track_id}`);
      skipped += 1;
      continue;
    }

    try {
      const pictures = await downloadForMetadata(blobPath);
      const pic = pickPicture(pictures);
      if (!pic) {
        console.log(`[NO-ART] ${blobPath}`);
        noArt += 1;
        continue;
      }

      const ext = pictureExt(pic.format);
      const targetPath = `embedded-art/${row.track_id}.${ext}`;
      await uploadArt(pic.data, pic.format || 'image/jpeg', targetPath);
      const updated = await setAlbumCover(albumId, targetPath, force);
      if (updated) {
        uploaded += 1;
        console.log(`[SET] ${blobPath} -> ${targetPath}`);
      } else {
        skipped += 1;
        console.log(`[SKIP] did not update album for ${blobPath}`);
      }
    } catch (err) {
      console.error(`[ERROR] ${blobPath}: ${err.message}`);
    }
  }

  console.log(`Done. processed=${processed} uploaded=${uploaded} skipped=${skipped} no_art=${noArt}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
