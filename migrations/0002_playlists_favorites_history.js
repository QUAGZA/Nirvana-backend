'use strict';

exports.shorthands = undefined;

exports.up = async (pgm) => {
  await pgm.sql(`
    -- Playlists
    CREATE TABLE playlists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      cover_blob_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE playlist_tracks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      position INT NOT NULL DEFAULT 0,
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (playlist_id, track_id)
    );

    CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
    CREATE INDEX idx_playlist_tracks_position ON playlist_tracks(playlist_id, position);

    -- Favorites / liked tracks
    CREATE TABLE favorites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (track_id)
    );

    CREATE INDEX idx_favorites_track ON favorites(track_id);

    -- Play history / recently played
    CREATE TABLE play_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
      played_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_play_history_played_at ON play_history(played_at DESC);
    CREATE INDEX idx_play_history_track ON play_history(track_id);
  `);
};

exports.down = async (pgm) => {
  await pgm.sql(`
    DROP INDEX IF EXISTS idx_play_history_track;
    DROP INDEX IF EXISTS idx_play_history_played_at;
    DROP TABLE IF EXISTS play_history;
    DROP INDEX IF EXISTS idx_favorites_track;
    DROP TABLE IF EXISTS favorites;
    DROP INDEX IF EXISTS idx_playlist_tracks_position;
    DROP INDEX IF EXISTS idx_playlist_tracks_playlist;
    DROP TABLE IF EXISTS playlist_tracks;
    DROP TABLE IF EXISTS playlists;
  `);
};
