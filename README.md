# Nirvana Backend

The API server for [Nirvana](https://github.com/QUAGZA/Nirvana-Web) — a self-hosted music streaming platform. It scans a local folder of albums, extracts metadata, and serves audio streams + cover art over HTTP with JWT authentication and optional ngrok tunneling for remote access.

## How It Works

```
Your Albums Folder          Nirvana Backend              Nirvana Frontend
┌──────────────────┐       ┌─────────────────┐          ┌────────────────┐
│ Artist - Album/  │──────▶│ Scans folders   │◀────────▶│ Carousel UI    │
│   cover.jpg      │       │ Extracts metadata│          │ Audio player   │
│   01 - Track.flac│       │ Streams audio   │          │ Album browser  │
│   02 - Track.mp3 │       │ Serves covers   │          └────────────────┘
└──────────────────┘       └─────────────────┘
                                  │
                                  ▼
                           Tunnel (optional)
                           ngrok or Cloudflare
                           for remote streaming
```

1. On startup, the server scans your `ALBUMS_DIR` folder
2. Each subfolder is treated as an album (format: `Artist - Album Title`)
3. Audio files (`.flac`, `.mp3`, `.m4a`, `.wav`) are parsed for metadata
4. Cover art is detected from `cover.jpg` / `cover.png` in each folder
5. Everything is served behind JWT authentication

## Getting Started

### Prerequisites

- **Node.js** 18+
- A folder of music organized as:
  ```
  Albums/
  ├── Artist Name - Album Title/
  │   ├── cover.jpg
  │   ├── 01 - Track One.flac
  │   ├── 02 - Track Two.flac
  │   └── ...
  ├── Another Artist - Another Album/
  │   └── ...
  ```

### Installation

```bash
# Clone the repo
git clone https://github.com/QUAGZA/Nirvana-Backend.git
cd Nirvana-Backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (see below)

# Start the server
npm start
```

### Environment Variables

Create a `.env` file in the project root (see `.env.example`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Server port |
| `APP_PASSWORD` | **Yes** | `password` | Login password for the frontend |
| `JWT_SECRET` | Recommended | Auto-generated | Secret for signing JWT tokens. If not set, a random one is generated on each restart (existing tokens will invalidate) |
| `ALBUMS_DIR` | **Yes** | `./Albums` | Absolute path to your music folder |
| `TUNNEL_MODE` | No | `0` | `0` = no tunnel, `1` = ngrok, `2` = Cloudflare Tunnel |
| `NGROK_AUTHTOKEN` | If mode=1 | — | Your ngrok auth token |
| `CORS_ORIGINS` | No | `*` | Comma-separated list of allowed origins |

## API Endpoints

All endpoints except `/api/login` require a valid JWT token, passed either as:
- `Authorization: Bearer <token>` header, or
- `?token=<token>` query parameter (used by `<audio>` and `<img>` elements)

### Authentication

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/login` | `{ "password": "..." }` | Returns a JWT token (valid for 7 days) |

**Response:**
```json
{ "token": "eyJhbGciOi..." }
```

**Rate limited:** 5 failed attempts per IP → 15-minute lockout.

---

### Library

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/local/albums` | Returns all albums with tracks, metadata, and URLs |

**Response:**
```json
[
  {
    "id": "1",
    "title": "Album Title",
    "artist": "Artist Name",
    "year": 2026,
    "coverUrl": "/api/local/covers/Artist%20-%20Album/cover.jpg?token=...",
    "tracks": [
      {
        "id": "1",
        "title": "Track Name",
        "artist": "Artist Name",
        "track_number": 1,
        "duration": 215,
        "url": "/api/local/stream?path=...&token=..."
      }
    ]
  }
]
```

---

### Media

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/local/covers/:folder/:file` | Serves album cover art |
| `GET` | `/api/local/stream?path=<encoded_path>` | Streams audio files (supports `Range` headers for seeking) |

The stream endpoint supports HTTP range requests, so the frontend can seek through tracks without downloading the entire file.

## Project Structure

```
Nirvana-Backend/
├── src/
│   ├── index.js                    # Express app entry point
│   ├── config/
│   │   └── env.js                  # Environment variable loading
│   ├── middleware/
│   │   ├── cors.js                 # CORS configuration
│   │   └── logger.js               # Request logging
│   ├── routes/
│   │   └── local.js                # Auth, albums, covers, streaming
│   └── services/
│       └── localLibraryService.js  # Folder scanner + metadata parser
├── .env.example                    # Template for environment config
└── package.json
```

## Security

- **Path traversal protection** — All file-serving endpoints validate that requested paths are inside `ALBUMS_DIR`
- **JWT authentication** — Tokens expire after 7 days; secret is configurable via env
- **Brute-force protection** — Login endpoint is rate-limited (5 attempts / 15 min per IP), natively utilizing `trust proxy` to parse `X-Forwarded-For` headers so individual attackers are blocked without locking out the entire tunnel (ngrok/Cloudflare).
- **Request size limits** — JSON body capped at 1 MB
- **No secrets in source** — All sensitive values are loaded from `.env` (gitignored)

## Remote Access (Tunneling)

Nirvana supports two tunneling providers to expose your backend over the internet. Set `TUNNEL_MODE` in your `.env`:

| Mode | Provider | Auth Required | Setup |
|---|---|---|---|
| `0` | None (default) | — | Local only, no tunnel |
| `1` | ngrok | Yes (`NGROK_AUTHTOKEN`) | Free tier available at [ngrok.com](https://ngrok.com) |
| `2` | Cloudflare Tunnel | No | Zero-config quick tunnels, no account needed |

### Example: Cloudflare Tunnel (recommended — no account needed)

```env
TUNNEL_MODE=2
```

```
📡 Tunnel: starting Cloudflare Tunnel...

======================================================

  Cloudflare Tunnel tunnel created!
  Your API is accessible at: https://random-words.trycloudflare.com

======================================================
```

### Example: ngrok

```env
TUNNEL_MODE=1
NGROK_AUTHTOKEN=your_token_here
```

Paste the printed URL into the Nirvana frontend's "API URL" field to stream your music from anywhere.

## License

MIT
