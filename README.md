# Nirvana Backend

Node.js + Express API that powers the Nirvana Android app by serving library metadata, search, playlists/favorites/history endpoints, and short-lived Azure Blob SAS URLs for streaming tracks.

Mobile app repository: https://github.com/QUAGZA/Nirvana

## Why This Exists

The backend is the trust boundary for Nirvana. It keeps database and Azure storage credentials off client devices, signs secure streaming URLs, and exposes a clean API for the mobile app.

## Features

- Library API (artists, albums, tracks)
- Track streaming via signed Azure Blob URLs
- Search across artists, albums, and tracks
- Favorites, playlists, and playback history endpoints
- Metadata ingestion from your Blob container
- Optional embedded-art extraction workflow

## Tech Stack

- Runtime: Node.js (CommonJS)
- Framework: Express
- Database: PostgreSQL
- Storage: Azure Blob Storage
- DB migrations: node-pg-migrate

## Related Repositories

- Nirvana backend: https://github.com/QUAGZA/Nirvana-backend
- Nirvana Android app: https://github.com/QUAGZA/Nirvana

## Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL database
- Azure Storage account with a blob container for music files

## Quick Start (Local)

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Set required values in .env:

```env
PORT=3000
DATABASE_URL=postgres://username:password@localhost:5432/nirvana
DB_SSL=false

AZURE_STORAGE_ACCOUNT=your_account
AZURE_STORAGE_KEY=your_key
AZURE_BLOB_CONTAINER=music
SAS_TTL_MINUTES=10

CORS_ORIGINS=http://localhost:3000,http://10.0.2.2:3000
```

4. Run migrations:

```bash
npm run migrate:up
```

5. Start the server:

```bash
npm run dev
```

6. Verify health:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok","db":"up"}
```

## Create Your Own Backend on Azure (Blob + SQL DB)

This project requires a PostgreSQL-compatible SQL database. The recommended Azure option is Azure Database for PostgreSQL Flexible Server.

### 1. Create an Azure Resource Group

```bash
az group create --name rg-nirvana --location eastus
```

### 2. Create Azure Storage + Blob Container

```bash
az storage account create \
  --name nirvanastorage123 \
  --resource-group rg-nirvana \
  --location eastus \
  --sku Standard_LRS

az storage container create \
  --name music \
  --account-name nirvanastorage123 \
  --auth-mode login
```

Get storage key:

```bash
az storage account keys list \
  --resource-group rg-nirvana \
  --account-name nirvanastorage123 \
  --query "[0].value" -o tsv
```

### 3. Create Azure SQL Database Service (PostgreSQL)

```bash
az postgres flexible-server create \
  --resource-group rg-nirvana \
  --name nirvana-pg-server \
  --location eastus \
  --admin-user nirvanaadmin \
  --admin-password "<strong-password>" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16
```

Create the app database:

```bash
az postgres flexible-server db create \
  --resource-group rg-nirvana \
  --server-name nirvana-pg-server \
  --database-name nirvana
```

Allow local access for development:

```bash
az postgres flexible-server firewall-rule create \
  --resource-group rg-nirvana \
  --name nirvana-pg-server \
  --rule-name allow-local-dev \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### 4. Configure Environment for Azure Resources

Example:

```env
DATABASE_URL=postgres://nirvanaadmin:<password>@nirvana-pg-server.postgres.database.azure.com:5432/nirvana?sslmode=require
DB_SSL=true

AZURE_STORAGE_ACCOUNT=nirvanastorage123
AZURE_STORAGE_KEY=<storage-key>
AZURE_BLOB_CONTAINER=music
SAS_TTL_MINUTES=10
```

### 5. Initialize Schema + Ingest Metadata

```bash
npm run migrate:up
npm run ingest
```

### 6. Deploy API (Optional)

You can run this service in Azure App Service or Container Apps. The key requirement is to provide the same environment variables as in .env.

## Environment Variables

Required:

- DATABASE_URL

Recommended:

- PORT (default: 3000)
- DB_SSL (default: false)
- DB_CA_CERT_PATH (optional)
- AZURE_STORAGE_ACCOUNT
- AZURE_STORAGE_KEY
- AZURE_BLOB_CONTAINER (default: music)
- SAS_TTL_MINUTES (default: 10)
- CORS_ORIGINS (default: *)

## API Overview

- GET /health
- GET /api/library
- GET /api/tracks
- GET /api/tracks/:id/stream
- GET /api/search?q=...
- Playlist/favorites/history routes under /api

## Data and Ingestion

### Ingest metadata from blob paths

Dry run:

```bash
npm run ingest -- --dry-run
```

Real run:

```bash
npm run ingest
```

Behavior:

- Reads FLAC tags when available and falls back to path naming.
- Skips already-ingested blobs by blob path.
- Captures sibling cover image files when available.

### Extract embedded album art

```bash
npm run extract-art -- --limit 100
```

Optional flags:

- --force: overwrite existing cover associations
- --limit N: process only N candidate tracks

## Scripts

- npm run dev: start with nodemon
- npm start: start production server
- npm run migrate: generic migration command
- npm run migrate:up: apply migrations
- npm run migrate:down: rollback one migration
- npm run ingest: ingest metadata from storage
- npm run extract-art: extract and upload embedded art

## Connect the Android App

After this backend is running, configure API_BASE_URL in the mobile app repository root .env:

https://github.com/QUAGZA/Nirvana

Use:

- Emulator: http://10.0.2.2:3000
- Physical device: http://YOUR_COMPUTER_IP:3000
- Cloud deployment: https://YOUR_BACKEND_HOST
