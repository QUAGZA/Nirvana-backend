'use strict';

exports.shorthands = undefined;

exports.up = async (pgm) => {
  await pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE artists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE albums (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      year INT,
      cover_blob_path TEXT,
      UNIQUE (artist_id, title, year)
    );

    CREATE TABLE tracks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      track_number INT,
      duration INT,
      blob_path TEXT NOT NULL UNIQUE,
      UNIQUE (album_id, track_number),
      CHECK (track_number IS NULL OR track_number > 0),
      CHECK (duration IS NULL OR duration > 0)
    );

    CREATE INDEX idx_albums_artist_id ON albums(artist_id);
    CREATE INDEX idx_tracks_album_id ON tracks(album_id);
  `);
};

exports.down = async (pgm) => {
  await pgm.sql(`
    DROP INDEX IF EXISTS idx_tracks_album_id;
    DROP INDEX IF EXISTS idx_albums_artist_id;
    DROP TABLE IF EXISTS tracks;
    DROP TABLE IF EXISTS albums;
    DROP TABLE IF EXISTS artists;
    DROP EXTENSION IF EXISTS "pgcrypto";
  `);
};
