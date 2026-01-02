# Nirvana Backend

## Environment
- Configure `.env` from `.env.example` (required: `DATABASE_URL`; optional: `DB_SSL`, `PORT`).
- Azure streaming requires: `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY`, `AZURE_BLOB_CONTAINER` (default `music`), `SAS_TTL_MINUTES` (default 10).
- CORS: `CORS_ORIGINS` as comma-separated origins (e.g., `http://localhost:3000,http://10.0.2.2:3000`); use `*` for dev only.
 - Request logging: enabled by default to stdout.
- Logs go to stdout; no platform branching. Works locally and on Azure App Service as-is.

## Database
- Postgres is required and must be reachable via `DATABASE_URL`.
- Example local setup (optional):
  - `docker run --name nirvana-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nirvana -p 5432:5432 -d postgres:16`
  - `DATABASE_URL=postgres://postgres:postgres@localhost:5432/nirvana`
- Migrations (node-pg-migrate):
  - Up: `npm run migrate:up`
  - Down: `npm run migrate:down`
  - Uses table `schema_migrations` for migration tracking.

## Development
- Install deps: `npm install`
- Run API: `npm run dev` (nodemon) or `npm start`
- Health check: `GET /health` (verifies DB connectivity)
- Library: `GET /api/library` (artists → albums → tracks)
- Stream: `GET /api/tracks/:id/stream` (returns signed blob URL)

## Ingestion
- Requires Azure credentials and access to the `music` container.
- Dry-run (no DB writes): `npm run ingest -- --dry-run`
- Real ingest: `npm run ingest`
- Behavior:
  - Reads FLAC tags (primary), falls back to folder/filename.
  - Idempotent on `tracks.blob_path` (skips existing).
  - Detects `cover.(jpg|jpeg|png)` in the same folder and stores `albums.cover_blob_path` if empty.

## Embedded Art Extraction (optional)
- Command: `npm run extract-art -- [--limit N] [--force]`
- Finds tracks whose albums lack `cover_blob_path` (unless `--force`), extracts embedded art, uploads to `embedded-art/<track-id>.(jpg|png)`, and updates `albums.cover_blob_path`.
- Honors existing covers unless `--force`.
